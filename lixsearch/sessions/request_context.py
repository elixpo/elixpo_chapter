"""Deterministic, typed request context built from exact session state."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import hashlib
import re
from types import MappingProxyType
from typing import Any, Mapping, Sequence


class DeliverableKind(str, Enum):
    PDF = "pdf"
    SUMMARY = "summary"
    COMPARISON = "comparison"


@dataclass(frozen=True, slots=True)
class RequestedDeliverable:
    kind: DeliverableKind
    format: str


@dataclass(frozen=True, slots=True)
class SourceTurn:
    turn_id: int
    role: str
    content: str
    content_hash: str
    evidence_ids: tuple[str, ...] = ()
    artifact_ids: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class RequestContext:
    request_id: str
    current_request: str
    active_task: Mapping[str, Any]
    entities: tuple[str, ...]
    constraints: tuple[str, ...]
    missing_fields: tuple[str, ...]
    source_turn_ids: tuple[int, ...]
    evidence_ids: tuple[str, ...]
    requested_deliverable: RequestedDeliverable | None
    pending_clarification: Mapping[str, Any]
    referent_source: SourceTurn | None
    resolved_request: str

    def routing_excerpt(self, max_chars: int = 1200) -> str:
        parts = []
        original = str(self.active_task.get("original_request") or "").strip()
        if original:
            parts.append(f"Exact active task: {original}")
        if self.missing_fields:
            parts.append("Missing required fields: " + ", ".join(self.missing_fields))
        if self.referent_source:
            parts.append(
                f"Resolved referent source turn {self.referent_source.turn_id}: "
                f"{self.referent_source.content[:500]}"
            )
        return "\n".join(parts)[:max_chars]


_REFERENTIAL_RE = re.compile(
    r"\b(?:it|that|this|those|these|above|previous|prior|same|result|answer|report)\b",
    re.IGNORECASE,
)
_INTERNAL_RE = re.compile(
    r"<(?:thinking|analysis|reasoning|TASK|function_calls|invoke|tool_call)\b|"
    r"\[ERROR\]|(?:^|\n)\s*(?:export_to_pdf|web_search|fetch_full_text)\s*\(",
    re.IGNORECASE,
)
_CLARIFICATION_RE = re.compile(
    r"\b(?:quick\s+)?clarification\b|\bcould you (?:please )?(?:specify|clarify)\b",
    re.IGNORECASE,
)


def detect_deliverable(request_text: str) -> RequestedDeliverable | None:
    value = request_text or ""
    if re.search(r"\b(?:pdf|portable document|export as (?:a )?document)\b", value, re.I):
        return RequestedDeliverable(DeliverableKind.PDF, "application/pdf")
    if re.search(r"\b(?:summari[sz]e|summary|briefing|digest)\b", value, re.I):
        return RequestedDeliverable(DeliverableKind.SUMMARY, "text/markdown")
    if re.search(r"\b(?:compare|comparison|versus|\bvs\.?)\b", value, re.I):
        return RequestedDeliverable(DeliverableKind.COMPARISON, "text/markdown")
    return None


def _is_substantive_assistant_turn(message: Mapping[str, Any]) -> bool:
    content = str(message.get("content") or "").strip()
    return bool(
        message.get("role") == "assistant"
        and len(content) >= 120
        and not _INTERNAL_RE.search(content)
        and not _CLARIFICATION_RE.search(content[:700])
    )


def _source_turn(message: Mapping[str, Any]) -> SourceTurn:
    metadata = message.get("metadata") if isinstance(message.get("metadata"), dict) else {}
    content = str(message.get("content") or "").strip()
    evidence = metadata.get("evidence_refs") or metadata.get("sources") or ()
    artifacts = metadata.get("artifact_refs") or ()
    return SourceTurn(
        turn_id=int(message.get("sequence") or 0),
        role="assistant",
        content=content,
        content_hash=hashlib.sha256(content.encode("utf-8")).hexdigest(),
        evidence_ids=tuple(dict.fromkeys(str(item) for item in evidence if item)),
        artifact_ids=tuple(dict.fromkeys(str(item) for item in artifacts if item)),
    )


def build_request_context(
    *,
    request_id: str,
    current_request: str,
    source_turn_id: int = 0,
    messages: Sequence[Mapping[str, Any]] = (),
    active_task: Mapping[str, Any] | None = None,
    pending_clarification: Mapping[str, Any] | None = None,
) -> RequestContext:
    """Build context without semantic recall or model-selected history."""
    task = dict(active_task or {})
    pending = dict(pending_clarification or {})
    resolved_fields = task.get("resolved_fields") if isinstance(task.get("resolved_fields"), dict) else {}
    entities = tuple(
        dict.fromkeys(
            str(resolved_fields[key]).strip()
            for key in sorted(resolved_fields)
            if str(resolved_fields[key]).strip()
        )
    )
    constraints = tuple(
        f"{key}={value}" for key, value in sorted(resolved_fields.items()) if str(value).strip()
    )
    missing = tuple(
        dict.fromkeys(str(field) for field in (pending.get("missing_fields") or task.get("required_fields") or ()) if field)
    )
    deliverable = detect_deliverable(current_request)

    prior = next(
        (_source_turn(message) for message in reversed(tuple(messages)) if _is_substantive_assistant_turn(message)),
        None,
    )
    referential = bool(_REFERENTIAL_RE.search(current_request or ""))
    # Bare transformation requests (for example, "export as PDF") are also
    # continuations even when they omit a pronoun entirely.
    word_count = len(re.findall(r"\b\w+\b", current_request or ""))
    uses_prior = bool(prior and (referential or (deliverable and word_count <= 8)))
    referent = prior if uses_prior else None

    turn_ids = []
    if referent and referent.turn_id:
        turn_ids.append(referent.turn_id)
    if source_turn_id:
        turn_ids.append(int(source_turn_id))
    evidence_ids = referent.evidence_ids if referent else ()
    resolved_request = (current_request or "").strip()
    if referent:
        resolved_request += f"\n\nResolved source turn: {referent.turn_id}"

    return RequestContext(
        request_id=request_id,
        current_request=(current_request or "").strip(),
        active_task=MappingProxyType(task),
        entities=entities,
        constraints=constraints,
        missing_fields=missing,
        source_turn_ids=tuple(dict.fromkeys(turn_ids)),
        evidence_ids=evidence_ids,
        requested_deliverable=deliverable,
        pending_clarification=MappingProxyType(pending),
        referent_source=referent,
        resolved_request=resolved_request,
    )
