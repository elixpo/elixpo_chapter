"""Fast, validated loader for repository-local agent skills."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import os
from pathlib import Path
import re
from types import MappingProxyType
from typing import Any, Iterable, Mapping

import yaml

_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*(?:\n|\Z)", re.DOTALL)
_RUNTIME_HEADING_RE = re.compile(
    r"^## Runtime contract\s*$\n(?P<body>.*?)(?=^##\s|\Z)",
    re.MULTILINE | re.DOTALL,
)
_SKILL_NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class SkillRegistryError(ValueError):
    """Raised when a skill definition or registry invariant is invalid."""


@dataclass(frozen=True, slots=True)
class SkillDefinition:
    name: str
    description: str
    instructions: str
    agent: str
    tools: tuple[str, ...]
    timeout_seconds: float
    max_concurrency: int
    dependencies: tuple[str, ...]
    output: str
    path: Path


class SkillRegistry:
    """Immutable registry loaded once and shared by all requests in a worker."""

    def __init__(
        self,
        skills: Mapping[str, SkillDefinition],
        available_tools: Mapping[str, dict[str, Any]],
    ) -> None:
        self._skills = MappingProxyType(dict(skills))
        self._available_tools = MappingProxyType(dict(available_tools))
        ownership: dict[str, str] = {}
        for skill in self._skills.values():
            for tool_name in skill.tools:
                previous = ownership.get(tool_name)
                if previous is not None:
                    raise SkillRegistryError(
                        f"Tool '{tool_name}' belongs to both '{previous}' and '{skill.name}'"
                    )
                ownership[tool_name] = skill.name
        self._tool_owners = MappingProxyType(ownership)

    @classmethod
    def load(cls, skills_dir: str | Path | None = None) -> "SkillRegistry":
        root = Path(skills_dir) if skills_dir else _default_skills_dir()
        root = root.expanduser().resolve()
        if not root.is_dir():
            raise SkillRegistryError(f"Skills directory does not exist: {root}")

        available_tools = _load_available_tools()
        skills: dict[str, SkillDefinition] = {}
        for skill_file in sorted(root.glob("*/SKILL.md")):
            skill = _parse_skill(skill_file)
            if skill.name in skills:
                raise SkillRegistryError(f"Duplicate skill name: {skill.name}")
            unknown = sorted(set(skill.tools) - set(available_tools))
            if unknown:
                raise SkillRegistryError(
                    f"Skill '{skill.name}' references unknown tools: {', '.join(unknown)}"
                )
            skills[skill.name] = skill

        if not skills:
            raise SkillRegistryError(f"No SKILL.md files found below {root}")

        known_names = set(skills)
        for skill in skills.values():
            missing = sorted(set(skill.dependencies) - known_names)
            if missing:
                raise SkillRegistryError(
                    f"Skill '{skill.name}' has unknown dependencies: {', '.join(missing)}"
                )

        registry = cls(skills, available_tools)
        registry._validate_tool_coverage()
        return registry

    def __len__(self) -> int:
        return len(self._skills)

    def names(self) -> tuple[str, ...]:
        return tuple(self._skills)

    def get(self, name: str) -> SkillDefinition:
        try:
            return self._skills[name]
        except KeyError as exc:
            raise SkillRegistryError(f"Unknown skill: {name}") from exc

    def for_tool(self, tool_name: str) -> SkillDefinition:
        try:
            return self.get(self._tool_owners[tool_name])
        except KeyError as exc:
            raise SkillRegistryError(f"No skill owns tool: {tool_name}") from exc

    def resolve(self, names: Iterable[str]) -> tuple[SkillDefinition, ...]:
        """Resolve skills plus static dependencies in dependency-first order."""
        resolved: list[SkillDefinition] = []
        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(name: str) -> None:
            if name in visited:
                return
            if name in visiting:
                raise SkillRegistryError(f"Skill dependency cycle detected at '{name}'")
            visiting.add(name)
            skill = self.get(name)
            for dependency in skill.dependencies:
                visit(dependency)
            visiting.remove(name)
            visited.add(name)
            resolved.append(skill)

        for requested_name in names:
            visit(requested_name)
        return tuple(resolved)

    def tool_catalog(self, skill_names: Iterable[str]) -> tuple[dict[str, Any], ...]:
        """Return only tool schemas owned by the selected skills."""
        selected_tools: set[str] = set()
        for skill in self.resolve(skill_names):
            selected_tools.update(skill.tools)
        return tuple(
            schema
            for name, schema in self._available_tools.items()
            if name in selected_tools
        )

    def summary(self) -> tuple[dict[str, Any], ...]:
        """Return compact routing metadata without loading full instructions."""
        return tuple(
            {
                "name": skill.name,
                "description": skill.description,
                "agent": skill.agent,
                "tools": skill.tools,
                "timeout_seconds": skill.timeout_seconds,
                "max_concurrency": skill.max_concurrency,
                "dependencies": skill.dependencies,
                "output": skill.output,
            }
            for skill in self._skills.values()
        )

    def _validate_tool_coverage(self) -> None:
        uncovered = sorted(set(self._available_tools) - set(self._tool_owners))
        if uncovered:
            raise SkillRegistryError(
                "Exposed tools without a skill owner: " + ", ".join(uncovered)
            )


def _default_skills_dir() -> Path:
    configured = os.getenv("LIXSEARCH_SKILLS_DIR")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[2] / "skills"


def _load_available_tools() -> dict[str, dict[str, Any]]:
    from pipeline.tools import tools

    result: dict[str, dict[str, Any]] = {}
    for schema in tools:
        try:
            name = schema["function"]["name"]
        except (KeyError, TypeError) as exc:
            raise SkillRegistryError("Invalid tool schema in pipeline.tools") from exc
        if name in result:
            raise SkillRegistryError(f"Duplicate exposed tool schema: {name}")
        result[name] = schema
    return result


def _parse_skill(path: Path) -> SkillDefinition:
    text = path.read_text(encoding="utf-8")
    frontmatter_match = _FRONTMATTER_RE.search(text)
    if not frontmatter_match:
        raise SkillRegistryError(f"Missing YAML frontmatter: {path}")

    metadata = yaml.safe_load(frontmatter_match.group(1))
    if not isinstance(metadata, dict):
        raise SkillRegistryError(f"Invalid YAML frontmatter: {path}")
    name = _required_string(metadata, "name", path)
    description = _required_string(metadata, "description", path)
    if not _SKILL_NAME_RE.fullmatch(name) or path.parent.name != name:
        raise SkillRegistryError(f"Skill name must match its kebab-case directory: {path}")

    runtime_match = _RUNTIME_HEADING_RE.search(text)
    if not runtime_match:
        raise SkillRegistryError(f"Missing Runtime contract: {path}")
    runtime_text = _unindent_contract(runtime_match.group("body"))
    runtime = yaml.safe_load(runtime_text)
    if not isinstance(runtime, dict):
        raise SkillRegistryError(f"Invalid Runtime contract: {path}")

    tools = _string_tuple(runtime.get("tools", ()), "tools", path)
    raw_dependencies = runtime.get("depends_on", ())
    dependencies = () if raw_dependencies in (None, "dynamic") else _string_tuple(
        raw_dependencies, "depends_on", path
    )
    timeout = runtime.get("timeout_seconds")
    concurrency = runtime.get("max_concurrency")
    if not isinstance(timeout, (int, float)) or timeout <= 0:
        raise SkillRegistryError(f"timeout_seconds must be positive: {path}")
    if not isinstance(concurrency, int) or concurrency <= 0:
        raise SkillRegistryError(f"max_concurrency must be a positive integer: {path}")

    return SkillDefinition(
        name=name,
        description=description,
        instructions=text[frontmatter_match.end():runtime_match.start()].strip(),
        agent=_required_string(runtime, "agent", path),
        tools=tools,
        timeout_seconds=float(timeout),
        max_concurrency=concurrency,
        dependencies=dependencies,
        output=_required_string(runtime, "output", path),
        path=path.resolve(),
    )


def _unindent_contract(body: str) -> str:
    lines = [line for line in body.strip("\n").splitlines() if line.strip()]
    if not lines:
        return ""
    widths = [len(line) - len(line.lstrip()) for line in lines]
    indent = min(widths)
    return "\n".join(line[indent:] for line in lines)


def _required_string(mapping: Mapping[str, Any], key: str, path: Path) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value.strip():
        raise SkillRegistryError(f"'{key}' must be a non-empty string: {path}")
    return value.strip()


def _string_tuple(value: Any, key: str, path: Path) -> tuple[str, ...]:
    if not isinstance(value, (list, tuple)) or not all(
        isinstance(item, str) and item for item in value
    ):
        raise SkillRegistryError(f"'{key}' must be a list of strings: {path}")
    return tuple(value)


@lru_cache(maxsize=1)
def get_skill_registry() -> SkillRegistry:
    """Load and cache the process-wide registry."""
    return SkillRegistry.load()
