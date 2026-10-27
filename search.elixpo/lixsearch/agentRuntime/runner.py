"""OreoFlow adapter for skill-scoped lixSearch agents."""
from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import os
from pathlib import Path
from typing import Any, Iterable

import structlog
import yaml

from agentRuntime.routing import route_request
from commons.environment import load_local_environment
from agentRuntime.specs import AGENT_SPECS
from skillRegistry import SkillRegistry, get_skill_registry
from commons.auth_context import downstream_pollinations_key

AGENT_RUNTIME_ROOT = Path(__file__).resolve().parent
DEFAULT_MODELS_CONFIG = AGENT_RUNTIME_ROOT / "models.yaml"
logger = structlog.get_logger("oreolook.runtime")
_SEARCH_TOKEN_LIMITS = {"quick": 350, "standard": 700, "deep": 1800}
_HISTORY_TOKEN_LIMIT = 3000


class AgentRuntimeError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class PreparedRun:
    agent: str
    role: str
    model: str
    skills: tuple[str, ...]
    messages: tuple[dict[str, str], ...]
    tools: tuple[dict[str, Any], ...]
    max_tokens: int
    search_depth: str = "none"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class AgentRunner:
    def __init__(self, *, registry: SkillRegistry | None = None, models_path: str | Path | None = None) -> None:
        self.registry = registry or get_skill_registry()
        configured = os.getenv("OREOFLOW_MODELS_CONFIG")
        self.models_path = Path(models_path or configured or DEFAULT_MODELS_CONFIG)
        if not self.models_path.is_file():
            raise AgentRuntimeError(f"Agent models config not found: {self.models_path}")
        self.models = yaml.safe_load(self.models_path.read_text(encoding="utf-8"))

    def prepare(
        self,
        agent_name: str,
        prompt: str,
        history: Iterable[dict[str, str]] | None = None,
        *,
        search_depth: str = "none",
    ) -> PreparedRun:
        if agent_name == "auto":
            agent_name = route_request(prompt)
        try:
            spec = AGENT_SPECS[agent_name]
        except KeyError as exc:
            raise AgentRuntimeError(f"Unknown agent '{agent_name}'") from exc
        model_spec = self.models.get("roles", {}).get(spec.role)
        if not model_spec or not model_spec.get("model"):
            raise AgentRuntimeError(f"OreoFlow role '{spec.role}' has no model")
        resolved = self.registry.resolve(spec.skills)
        skill_text = "\n\n".join(skill.instructions for skill in resolved)
        if search_depth not in {"none", "quick", "standard", "deep"}:
            raise AgentRuntimeError(f"Unknown search depth '{search_depth}'")
        depth_instruction = ""
        if spec.name == "web-search":
            depth_instruction = (
                f"\n\nRuntime decision: use {search_depth} search depth. "
                "Respect the optimization skill's hard ceilings."
            )
        system = f"{spec.system_prompt}\n\n{skill_text}{depth_instruction}".strip()
        eligible_prior = tuple(
            {"role": item["role"], "content": str(item["content"])}
            for item in (history or ())
            if item.get("role") in {"user", "assistant"} and item.get("content")
        )
        prior_reversed: list[dict[str, str]] = []
        history_tokens = 0
        for item in reversed(eligible_prior):
            estimated = max(1, len(item["content"]) // 4)
            if history_tokens + estimated > _HISTORY_TOKEN_LIMIT:
                break
            prior_reversed.append(item)
            history_tokens += estimated
        prior = tuple(reversed(prior_reversed))
        tools = self.registry.tool_catalog(spec.skills)
        return PreparedRun(
            agent=spec.name,
            role=spec.role,
            model=model_spec["model"],
            skills=tuple(skill.name for skill in resolved),
            messages=({"role": "system", "content": system}, *prior, {"role": "user", "content": prompt}),
            tools=tools,
            max_tokens=_SEARCH_TOKEN_LIMITS.get(search_depth, spec.max_tokens)
            if spec.name == "web-search" else spec.max_tokens,
            search_depth=search_depth,
        )

    async def run(
        self,
        agent_name: str,
        prompt: str,
        history: Iterable[dict[str, str]] | None = None,
        *,
        effort: str = "low",
    ) -> dict[str, Any]:
        prepared = self.prepare(agent_name, prompt, history)
        if prepared.agent == "decision":
            decision = await self._call(prepared, effort=effort)
            selected, search_depth = _parse_decision(decision)
            logger.info("route.selected", agent=selected, search_depth=search_depth)
            return await self._call(
                self.prepare(selected, prompt, history, search_depth=search_depth),
                effort=effort,
            )
        return await self._call(prepared, effort=effort)

    async def stream(
        self,
        agent_name: str,
        prompt: str,
        history: Iterable[dict[str, str]] | None = None,
        *,
        effort: str = "low",
    ):
        prepared = self.prepare(agent_name, prompt, history)
        if prepared.agent == "decision":
            decision = await self._call(prepared, effort=effort)
            selected, search_depth = _parse_decision(decision)
            logger.info("route.selected", agent=selected, search_depth=search_depth)
            prepared = self.prepare(selected, prompt, history, search_depth=search_depth)
        async for event in self._stream_call(prepared, effort=effort):
            yield event

    async def _stream_call(self, prepared: PreparedRun, *, effort: str = "low"):
        Router, Message, ToolDef = _oreoflow_types()
        load_local_environment()
        api_key = downstream_pollinations_key()
        router = Router(task_id=f"lixsearch-{prepared.agent}", models=self.models, api_key=api_key)
        content_parts = []
        usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        finish_reason = None
        try:
            async for chunk in router.stream(
                prepared.role,
                [Message.model_validate(message) for message in prepared.messages],
                tools=[ToolDef.model_validate(tool) for tool in prepared.tools] or None,
                effort=effort,
                max_tokens=prepared.max_tokens,
            ):
                if chunk.usage:
                    usage = chunk.usage.model_dump(mode="json")
                for choice in chunk.choices:
                    if choice.delta.content:
                        content_parts.append(choice.delta.content)
                        yield {"type": "delta", "content": choice.delta.content}
                    if choice.finish_reason:
                        finish_reason = choice.finish_reason
            if not usage.get("total_tokens"):
                content = "".join(content_parts)
                usage = {
                    "prompt_tokens": 0,
                    "completion_tokens": len(content) // 4,
                    "total_tokens": len(content) // 4,
                }
            logger.info(
                "model.stream_completed",
                agent=prepared.agent,
                role=prepared.role,
                model=prepared.model,
                search_depth=prepared.search_depth,
                effort=effort,
                max_tokens=prepared.max_tokens,
                history_messages=max(0, len(prepared.messages) - 2),
                tools=[tool["function"]["name"] for tool in prepared.tools],
                usage=usage,
            )
            yield {
                "type": "done",
                "result": {
                    "agent": prepared.agent,
                    "role": prepared.role,
                    "model": prepared.model,
                    "effort": effort,
                    "response": {
                        "choices": [{"message": {"role": "assistant", "content": "".join(content_parts)}, "finish_reason": finish_reason or "stop"}],
                        "usage": usage,
                    },
                },
            }
        finally:
            await router.aclose()

    async def _call(self, prepared: PreparedRun, *, effort: str = "low") -> dict[str, Any]:
        Router, Message, ToolDef = _oreoflow_types()
        load_local_environment()
        api_key = downstream_pollinations_key()
        router = Router(task_id=f"lixsearch-{prepared.agent}", models=self.models, api_key=api_key)
        try:
            response = await router.call(
                prepared.role,
                [Message.model_validate(message) for message in prepared.messages],
                tools=[ToolDef.model_validate(tool) for tool in prepared.tools] or None,
                effort=effort,
                max_tokens=prepared.max_tokens,
                tool_choice="auto" if prepared.tools else None,
            )
            usage = response.usage.model_dump(mode="json") if response.usage else {}
            logger.info(
                "model.completed",
                agent=prepared.agent,
                role=prepared.role,
                model=prepared.model,
                search_depth=prepared.search_depth,
                effort=effort,
                max_tokens=prepared.max_tokens,
                history_messages=max(0, len(prepared.messages) - 2),
                tools=[tool["function"]["name"] for tool in prepared.tools],
                usage=usage,
            )
            return {
                "agent": prepared.agent,
                "role": prepared.role,
                "model": prepared.model,
                "effort": effort,
                "response": response.model_dump(mode="json"),
            }
        finally:
            await router.aclose()


def response_content(result: dict[str, Any]) -> str:
    try:
        return result["response"]["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError):
        return ""


def _oreoflow_types():
    from oreoflow import Message, Router, ToolDef
    return Router, Message, ToolDef


def _parse_decision(result: dict[str, Any]) -> tuple[str, str]:
    try:
        payload = json.loads(response_content(result))
        selected = payload["agent"]
        search_depth = payload.get("search_depth", "none")
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise AgentRuntimeError("Decision agent returned invalid JSON") from exc
    if selected not in AGENT_SPECS or selected == "decision":
        raise AgentRuntimeError(f"Decision agent returned unknown specialist '{selected}'")
    if search_depth not in {"none", "quick", "standard", "deep"}:
        raise AgentRuntimeError(f"Decision agent returned unknown search depth '{search_depth}'")
    if selected != "web-search":
        search_depth = "none"
    elif search_depth == "none":
        search_depth = "quick"
    return selected, search_depth
