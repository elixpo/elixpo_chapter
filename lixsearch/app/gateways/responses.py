"""OpenAI-compatible Responses API backed by OreoFlow agents."""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from quart import Response, jsonify, request

from agentRuntime import AGENT_SPECS, AgentRunner
from agentRuntime.runner import response_content
from pipeline.streaming import TaskAwareChunkBuffer
from pipeline.config import (
    AGENT_STREAM_CHUNK_CHARS,
    AGENT_STREAM_DEFAULT,
    EPISODIC_MEMORY_MAX_CHARS,
    EPISODIC_MEMORY_TIMEOUT_SECONDS,
    EPISODIC_MEMORY_TOP_K,
)
from sessions.episodic_memory import format_episodic_context, request_memory_scope
from agentRuntime.state import (
    ResponseStateStore,
    canonical_conversation_id,
    new_message_id,
    new_response_id,
)


def _error(message: str, *, param: str | None = None, status: int = 400):
    return jsonify({"error": {"message": message, "type": "invalid_request_error", "param": param, "code": None}}), status


def _text_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts = []
    for part in content:
        if not isinstance(part, dict):
            continue
        if part.get("type") in {"input_text", "output_text", "text"}:
            parts.append(str(part.get("text", "")))
    return "\n".join(filter(None, parts))


def _input_messages(value: Any) -> list[dict[str, str]]:
    if isinstance(value, str):
        return [{"role": "user", "content": value}]
    if not isinstance(value, list):
        raise ValueError("input must be a string or an array of input items")
    messages = []
    for item in value:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        if role not in {"user", "assistant", "system", "developer"}:
            continue
        content = _text_content(item.get("content", ""))
        if content:
            messages.append({"role": role, "content": content})
    return messages


def _conversation_id(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get("id")
    return None


def _reasoning_effort(data: dict[str, Any]) -> str:
    reasoning = data.get("reasoning")
    if reasoning is None:
        return "low"
    if not isinstance(reasoning, dict):
        raise ValueError("reasoning must be an object")
    effort = reasoning.get("effort", "low")
    if effort not in {"low", "medium", "high"}:
        raise ValueError("reasoning.effort must be one of: low, medium, high")
    return effort


def _usage(result: dict[str, Any]) -> dict[str, int]:
    raw = result.get("response", {}).get("usage") or {}
    input_tokens = int(raw.get("prompt_tokens") or 0)
    output_tokens = int(raw.get("completion_tokens") or 0)
    return {"input_tokens": input_tokens, "output_tokens": output_tokens, "total_tokens": input_tokens + output_tokens}


def _response_object(
    *, response_id: str, message_id: str, conversation_id: str, previous_response_id: str | None,
    result: dict[str, Any], content: str, store: bool,
) -> dict[str, Any]:
    return {
        "id": response_id,
        "object": "response",
        "created_at": int(time.time()),
        "status": "completed",
        "background": False,
        "error": None,
        "incomplete_details": None,
        "instructions": None,
        "max_output_tokens": None,
        "model": result.get("model", "lixsearch"),
        "output": [{
            "id": message_id,
            "type": "message",
            "status": "completed",
            "role": "assistant",
            "content": [{"type": "output_text", "text": content, "annotations": []}],
        }],
        "output_text": content,
        "parallel_tool_calls": True,
        "reasoning": {"effort": result.get("effort", "low"), "summary": None},
        "previous_response_id": previous_response_id,
        "conversation": {"id": conversation_id},
        "store": store,
        "usage": _usage(result),
        "metadata": {},
    }


async def _run_response(data: dict[str, Any], state: ResponseStateStore) -> dict[str, Any]:
    input_messages = _input_messages(data.get("input"))
    user_positions = [index for index, item in enumerate(input_messages) if item["role"] == "user"]
    if not user_positions:
        raise ValueError("input must contain a user message")
    last_user = user_positions[-1]
    prompt = input_messages[last_user]["content"]
    request_history = [item for item in input_messages[:last_user] if item["role"] in {"user", "assistant"}]

    previous_response_id = data.get("previous_response_id") or None
    requested_conversation = _conversation_id(data.get("conversation"))
    conversation_id, history = await _resolve_history(
        state,
        previous_response_id=previous_response_id,
        requested_conversation=requested_conversation,
        request_history=request_history,
        query=prompt,
    )

    instructions = data.get("instructions")
    if instructions:
        prompt = f"{instructions}\n\n{prompt}"

    requested_model = str(data.get("model") or "auto")
    effort = _reasoning_effort(data)
    agent = requested_model if requested_model in AGENT_SPECS and requested_model != "decision" else "auto"
    result = await AgentRunner().run(agent, prompt, history=history, effort=effort)
    content = response_content(result)
    if not content:
        raise RuntimeError("Agent returned no output text")

    response_id = new_response_id()
    message_id = new_message_id()
    store = data.get("store", True) is not False
    full_messages = [*history, {"role": "user", "content": prompt}, {"role": "assistant", "content": content}]
    if store:
        await asyncio.to_thread(
            state.save,
            response_id=response_id,
            conversation_id=conversation_id,
            previous_response_id=previous_response_id,
            messages=full_messages,
            model=result.get("model", requested_model),
            agent=result.get("agent", agent),
        )
        await _remember_turn(conversation_id, response_id, prompt, content)

    return _response_object(
        response_id=response_id,
        message_id=message_id,
        conversation_id=conversation_id,
        previous_response_id=previous_response_id,
        result=result,
        content=content,
        store=store,
    )


async def _recall_durable(conversation_id: str, query: str) -> list[dict[str, str]]:
    try:
        from ipcService.coreServiceManager import CoreServiceManager
        manager = CoreServiceManager.get_instance()
        scope = request_memory_scope(conversation_id, namespace="responses")
        results = await asyncio.wait_for(
            asyncio.to_thread(
                manager.call,
                "core",
                "recall_episodes",
                scope.filters(),
                query,
                EPISODIC_MEMORY_TOP_K,
                EPISODIC_MEMORY_MAX_CHARS,
            ),
            timeout=EPISODIC_MEMORY_TIMEOUT_SECONDS,
        )
        text = format_episodic_context(results)
        return [{"role": "system", "content": text}] if text else []
    except Exception:
        return []


async def _remember_turn(conversation_id: str, response_id: str, prompt: str, content: str) -> None:
    try:
        from ipcService.coreServiceManager import CoreServiceManager
        manager = CoreServiceManager.get_instance()
        scope = request_memory_scope(conversation_id, namespace="responses")
        await asyncio.to_thread(
            manager.call,
            "core",
            "remember_episodes",
            scope.filters(),
            response_id,
            prompt,
            content,
        )
    except Exception:
        # Redis remains the source of truth for hot response chains. Durable memory
        # failure must not fail an otherwise successful model response.
        return


async def _resolve_history(
    state: ResponseStateStore,
    *,
    previous_response_id: str | None,
    requested_conversation: str | None,
    request_history: list[dict[str, str]],
    query: str,
) -> tuple[str, list[dict[str, str]]]:
    """Resolve authoritative Redis history while Qdrant recall runs in parallel."""
    recall_task = None
    hinted_conversation = None
    if requested_conversation and not previous_response_id:
        hinted_conversation = canonical_conversation_id(requested_conversation)
        recall_task = asyncio.create_task(_recall_durable(hinted_conversation, query))
    try:
        conversation_id, stored_history = await asyncio.to_thread(
            state.resolve_context,
            previous_response_id=previous_response_id,
            conversation_id=requested_conversation,
        )
    except Exception:
        if recall_task:
            recall_task.cancel()
        raise
    if stored_history:
        if recall_task:
            recall_task.cancel()
        return conversation_id, list(stored_history) + request_history
    if not requested_conversation:
        return conversation_id, request_history
    if recall_task and hinted_conversation == conversation_id:
        durable = await recall_task
    else:
        durable = await _recall_durable(conversation_id, query)
    return conversation_id, durable + request_history


def _sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _stream_response(data: dict[str, Any], state: ResponseStateStore):
    input_messages = _input_messages(data.get("input"))
    user_positions = [i for i, item in enumerate(input_messages) if item["role"] == "user"]
    if not user_positions:
        raise ValueError("input must contain a user message")
    last_user = user_positions[-1]
    prompt = input_messages[last_user]["content"]
    request_history = [item for item in input_messages[:last_user] if item["role"] in {"user", "assistant"}]
    previous_response_id = data.get("previous_response_id") or None
    requested_conversation = _conversation_id(data.get("conversation"))
    conversation_id, history = await _resolve_history(
        state,
        previous_response_id=previous_response_id,
        requested_conversation=requested_conversation,
        request_history=request_history,
        query=prompt,
    )
    if data.get("instructions"):
        prompt = f'{data["instructions"]}\n\n{prompt}'
    requested_model = str(data.get("model") or "auto")
    effort = _reasoning_effort(data)
    agent = requested_model if requested_model in AGENT_SPECS and requested_model != "decision" else "auto"
    response_id, message_id = new_response_id(), new_message_id()
    store = data.get("store", True) is not False

    async def events():
        sequence = 0

        def emit(event, payload):
            nonlocal sequence
            sequence += 1
            return _sse(event, {**payload, "sequence_number": sequence})

        created = {
            "id": response_id, "object": "response", "created_at": int(time.time()),
            "status": "in_progress", "output": [], "previous_response_id": previous_response_id,
            "conversation": {"id": conversation_id}, "store": store, "model": requested_model,
            "reasoning": {"effort": effort, "summary": None},
        }
        yield emit("response.created", {"type": "response.created", "response": created})
        buffer = TaskAwareChunkBuffer(AGENT_STREAM_CHUNK_CHARS)
        content_parts = []
        final_result = {"agent": agent, "model": requested_model, "effort": effort, "response": {}}
        try:
            async for event in AgentRunner().stream(agent, prompt, history=history, effort=effort):
                if event.get("type") == "done":
                    final_result = event.get("result") or final_result
                    continue
                for kind, value in buffer.feed(event.get("content", "")):
                    if kind == "task":
                        yield emit("response.task", {
                            "type": "response.task", "response_id": response_id,
                            "task": value, "done": value == "<TASK>DONE</TASK>",
                        })
                    else:
                        content_parts.append(value)
                        yield emit("response.output_text.delta", {
                            "type": "response.output_text.delta", "item_id": message_id,
                            "output_index": 0, "content_index": 0, "delta": value,
                        })
            for kind, value in buffer.flush():
                if kind == "text":
                    content_parts.append(value)
                    yield emit("response.output_text.delta", {
                        "type": "response.output_text.delta", "item_id": message_id,
                        "output_index": 0, "content_index": 0, "delta": value,
                    })
            content = "".join(content_parts)
            if not content:
                raise RuntimeError("Agent returned no output text")
            full_messages = [*history, {"role": "user", "content": prompt}, {"role": "assistant", "content": content}]
            if store:
                await asyncio.to_thread(
                    state.save, response_id=response_id, conversation_id=conversation_id,
                    previous_response_id=previous_response_id, messages=full_messages,
                    model=final_result.get("model", requested_model), agent=final_result.get("agent", agent),
                )
                await _remember_turn(conversation_id, response_id, prompt, content)
            result = _response_object(
                response_id=response_id, message_id=message_id, conversation_id=conversation_id,
                previous_response_id=previous_response_id, result=final_result, content=content, store=store,
            )
            yield emit("response.output_text.done", {
                "type": "response.output_text.done", "item_id": message_id,
                "output_index": 0, "content_index": 0, "text": content,
            })
            yield emit("response.completed", {"type": "response.completed", "response": result})
        except Exception:
            yield emit("response.failed", {
                "type": "response.failed", "response": {**created, "status": "failed",
                "error": {"code": "server_error", "message": "Internal server error"}},
            })
        yield "data: [DONE]\n\n"

    return events()


async def responses(pipeline_initialized: bool):
    if not pipeline_initialized:
        return _error("Server not initialized", status=503)
    data = await request.get_json(silent=True)
    if not isinstance(data, dict):
        return _error("Request body required")

    state = ResponseStateStore()
    stream = data.get("stream", AGENT_STREAM_DEFAULT) is not False
    if stream:
        try:
            event_stream = await _stream_response(data, state)
        except KeyError as exc:
            return _error(f"Previous response '{exc.args[0]}' was not found or expired", param="previous_response_id")
        except ValueError as exc:
            return _error(str(exc))
        except Exception:
            return jsonify({"error": {"message": "Internal server error", "type": "server_error", "param": None, "code": None}}), 500
        return Response(
            event_stream,
            content_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    try:
        result = await _run_response(data, state)
    except KeyError as exc:
        return _error(f"Previous response '{exc.args[0]}' was not found or expired", param="previous_response_id")
    except ValueError as exc:
        return _error(str(exc))
    except Exception:
        return jsonify({"error": {"message": "Internal server error", "type": "server_error", "param": None, "code": None}}), 500
    return Response(json.dumps(result, ensure_ascii=False), content_type="application/json")
