"""Deterministic task and clarification state transitions.

Models classify language; this module validates their structured output and
owns every state transition.  Tool code never decides whether a clarification
has been satisfied.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import json
import re
import time
from typing import Any, Dict, Iterable, Optional


class TaskStatus(str, Enum):
    ACTIVE = "active"
    AWAITING_CLARIFICATION = "awaiting_clarification"
    READY_TO_EXECUTE = "ready_to_execute"
    COMPLETED = "completed"
    FAILED = "failed"


class ResolutionAction(str, Enum):
    RESOLVE = "resolve"
    PARTIAL = "partial"
    UNRELATED = "unrelated"
    CANCEL = "cancel"
    REPLACE = "replace"


@dataclass(frozen=True)
class ClarificationNeed:
    required: bool = False
    missing_fields: tuple[str, ...] = ()
    question: str = ""


@dataclass(frozen=True)
class ClarificationResolution:
    action: ResolutionAction
    values: Dict[str, str]
    defaulted_fields: tuple[str, ...] = ()
    question: str = ""
    replacement_request: str = ""


def _extract_json(text: str) -> Dict[str, Any]:
    value = (text or "").strip()
    value = re.sub(r"^```(?:json)?\s*|\s*```$", "", value, flags=re.I)
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        match = re.search(r"\{.*\}", value, re.DOTALL)
        if not match:
            return {}
        try:
            parsed = json.loads(match.group(0))
        except ValueError:
            return {}
    return parsed if isinstance(parsed, dict) else {}


def _clean_fields(fields: Iterable[Any]) -> tuple[str, ...]:
    cleaned = []
    for field in fields or ():
        name = re.sub(r"[^a-z0-9_.-]+", "_", str(field).strip().lower()).strip("_")
        if name and name not in cleaned:
            cleaned.append(name[:64])
    return tuple(cleaned[:8])


_BLOCKING_FIELD_KINDS = frozenset({
    "identity",
    "user_owned",
    "credential",
    "authorization",
    "irreversible",
    "required_scope",
})
_DEFAULTABLE_FIELD_KINDS = frozenset({"preference", "output_metadata"})
_ALL_FIELD_KINDS = _BLOCKING_FIELD_KINDS | _DEFAULTABLE_FIELD_KINDS


def _typed_clarification_fields(raw: Dict[str, Any]):
    """Normalize the flat wire contract; retain nested support for stored tests."""
    if "fields" not in raw:
        # Compact JSON-mode responses commonly omit unused empty collections.
        # Treat absence as empty while retaining strict validation whenever a
        # blocking field is declared.
        blocking_raw = raw.get("blocking_fields", [])
        defaultable_raw = raw.get("defaultable_fields", [])
        questions = raw.get("questions", {})
        if not isinstance(blocking_raw, list) or not isinstance(defaultable_raw, list):
            return None
        if not isinstance(questions, dict):
            return None
        blocking = _clean_fields(blocking_raw)
        defaultable = _clean_fields(defaultable_raw)
        if len(blocking) != len(blocking_raw) or len(defaultable) != len(defaultable_raw):
            return None
        if set(blocking) & set(defaultable):
            return None
        parsed = []
        for name in blocking:
            question = str(questions.get(name) or "").strip()[:300]
            if not question:
                return None
            parsed.append((name, "required_scope", question))
        parsed.extend((name, "preference", "") for name in defaultable)
        return parsed

    entries = raw.get("fields")
    if not isinstance(entries, list):
        return None
    parsed = []
    for entry in entries[:8]:
        if not isinstance(entry, dict):
            return None
        names = _clean_fields((entry.get("name"),))
        kind = str(entry.get("kind") or "").strip().lower()
        question = str(entry.get("question") or "").strip()[:300]
        if not names or kind not in _ALL_FIELD_KINDS:
            return None
        if kind in _BLOCKING_FIELD_KINDS and not question:
            return None
        parsed.append((names[0], kind, question))
    return parsed


def parse_clarification_need(router_output: str) -> ClarificationNeed:
    data = _extract_json(router_output)
    raw = data.get("clarification") or {}
    if not isinstance(raw, dict) or raw.get("required") is not True:
        return ClarificationNeed()
    declared = _typed_clarification_fields(raw)
    if declared is None:
        return ClarificationNeed()
    blocking = [(name, question) for name, kind, question in declared if kind in _BLOCKING_FIELD_KINDS]
    if not blocking:
        return ClarificationNeed()
    fields = tuple(name for name, _ in blocking)
    if len(blocking) == 1:
        question = blocking[0][1]
    else:
        labels = ", ".join(name.replace("_", " ") for name, _ in blocking)
        question = f"Please provide the required information for: {labels}."
    return ClarificationNeed(required=True, missing_fields=fields, question=question[:500])


def has_decision_contract(router_output: str) -> bool:
    data = _extract_json(router_output)
    if str(data.get("mode", "")).upper() not in {"DIRECT", "TOOLS"}:
        return False
    if str(data.get("context", "")).upper() not in {"STANDALONE", "CONTINUATION"}:
        return False
    raw = data.get("clarification")
    if not isinstance(raw, dict) or not isinstance(raw.get("required"), bool):
        return False
    declared = _typed_clarification_fields(raw)
    if declared is None:
        return False
    has_blocking = any(kind in _BLOCKING_FIELD_KINDS for _, kind, _ in declared)
    return raw["required"] is has_blocking


def has_resolution_contract(resolver_output: str) -> bool:
    data = _extract_json(resolver_output)
    return str(data.get("action", "")).lower() in {action.value for action in ResolutionAction}


def parse_resolution(resolver_output: str) -> ClarificationResolution:
    data = _extract_json(resolver_output)
    try:
        action = ResolutionAction(str(data.get("action", "unrelated")).lower())
    except ValueError:
        action = ResolutionAction.UNRELATED
    raw_values = data.get("values") or {}
    if not isinstance(raw_values, dict):
        raw_values = {}
    values = {}
    for key, value in raw_values.items():
        names = _clean_fields((key,))
        if names and str(value).strip():
            values[names[0]] = str(value).strip()[:1000]
    return ClarificationResolution(
        action=action,
        values=values,
        defaulted_fields=_clean_fields(data.get("defaulted_fields") or []),
        question=str(data.get("question") or "").strip()[:500],
        replacement_request=str(data.get("replacement_request") or "").strip()[:4000],
    )


def create_pending_task(
    original_request: str,
    missing_fields: Iterable[str],
    question: str,
    *,
    source_turn: int,
    request_id: str,
    routing: Optional[Dict[str, str]] = None,
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    fields = _clean_fields(missing_fields)
    if not fields or not question.strip():
        raise ValueError("pending clarification requires fields and a question")
    now = time.time()
    active = {
        "status": TaskStatus.AWAITING_CLARIFICATION.value,
        "original_request": original_request.strip(),
        "source_turn": int(source_turn),
        "request_id": request_id,
        "required_fields": list(fields),
        "resolved_fields": {},
        "routing": dict(routing or {}),
        "updated_at": now,
    }
    pending = {
        "missing_fields": list(fields),
        "question": question.strip()[:500],
        "source_turn": int(source_turn),
        "request_id": request_id,
        "updated_at": now,
    }
    return active, pending


def apply_resolution(
    active_task: Dict[str, Any],
    pending: Dict[str, Any],
    resolution: ClarificationResolution,
) -> tuple[Dict[str, Any], Optional[Dict[str, Any]], Optional[str]]:
    """Validate and apply one resolver result.

    Returns ``(active_task, pending_state, executable_request)``.  A non-None
    executable request is the only transition that may proceed to tools.
    """
    active = dict(active_task or {})
    waiting = dict(pending or {})
    now = time.time()

    if resolution.action == ResolutionAction.CANCEL:
        active.update(status=TaskStatus.COMPLETED.value, outcome="cancelled", updated_at=now)
        return active, None, None

    if resolution.action == ResolutionAction.REPLACE and resolution.replacement_request:
        return {}, None, resolution.replacement_request

    required = _clean_fields(waiting.get("missing_fields") or active.get("required_fields") or [])
    resolved = dict(active.get("resolved_fields") or {})
    defaulted = set(active.get("defaulted_fields") or [])
    if resolution.action in {ResolutionAction.RESOLVE, ResolutionAction.PARTIAL}:
        supplied = dict(resolution.values)
        if len(required) == 1 and len(supplied) == 1 and required[0] not in supplied:
            supplied = {required[0]: next(iter(supplied.values()))}
        for field in required:
            value = supplied.get(field)
            if value:
                resolved[field] = value
        defaulted.update(field for field in resolution.defaulted_fields if field in required)
    remaining = tuple(
        field for field in required if not resolved.get(field) and field not in defaulted
    )

    if resolution.action == ResolutionAction.RESOLVE and not remaining:
        original = str(active.get("original_request") or "").strip()
        if not original:
            return active, waiting, None
        details = [f"{field}: {resolved[field]}" for field in required if field in resolved]
        details.extend(f"{field}: use a context-appropriate default" for field in required if field in defaulted)
        detail_text = "; ".join(details)
        executable = f"{original}\n\nClarified requirements: {detail_text}"
        active.update(
            status=TaskStatus.READY_TO_EXECUTE.value,
            resolved_fields=resolved,
            defaulted_fields=sorted(defaulted),
            resolved_request=executable,
            updated_at=now,
        )
        return active, None, executable

    active.update(
        status=TaskStatus.AWAITING_CLARIFICATION.value,
        resolved_fields=resolved,
        defaulted_fields=sorted(defaulted),
        updated_at=now,
    )
    waiting["missing_fields"] = list(remaining or required)
    if resolution.question:
        waiting["question"] = resolution.question
    waiting["updated_at"] = now
    return active, waiting, None


def task_with_status(task: Optional[Dict[str, Any]], status: TaskStatus, **updates) -> Dict[str, Any]:
    value = dict(task or {})
    value.update(updates)
    value["status"] = status.value
    value["updated_at"] = time.time()
    return value


def artifacts_blocked(memoized_results: Dict[str, Any]) -> bool:
    task = memoized_results.get("active_task") or {}
    return bool(
        memoized_results.get("pending_clarification")
        or task.get("status") == TaskStatus.AWAITING_CLARIFICATION.value
    )


def pending_for_request(snapshot, session_id: Optional[str], is_ephemeral: bool):
    """Return pending state only when this request carries its owning session."""
    if not session_id or is_ephemeral or snapshot is None:
        return None
    return snapshot.pending_clarification
