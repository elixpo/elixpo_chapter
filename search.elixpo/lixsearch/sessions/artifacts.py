"""Immutable, provenance-bearing artifact commit contracts."""
from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import re
from typing import Any, Mapping

from sessions.clarification import TaskStatus
from sessions.request_context import RequestContext
from sessions.episodic_memory import MemoryScope


class ArtifactRejected(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class ArtifactSnapshot:
    artifact_id: str
    kind: str
    title: str
    slug: str
    content_hash: str
    status: str
    source_turn_ids: tuple[int, ...]
    evidence_ids: tuple[str, ...]
    request_id: str
    tenant_id: str | None = None
    user_id: str | None = None
    session_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


_BLOCKED_CONTENT = re.compile(
    r"<(?:thinking|analysis|reasoning|TASK|function_calls|invoke|parameter|tool_call)\b|"
    r"(?:^|\n)\s*(?:export_to_pdf|web_search|fetch_full_text)\s*(?:\(|\n\s*\{)|"
    r"\[ERROR\]|\[(?:title|source|citation)\]\((?:url|link)\)",
    re.IGNORECASE,
)
_BLOCKED_OPENING = re.compile(
    r"^\s*(?:got it|sure|absolutely|okay|alright|i(?:'ll| will)|let(?:'s| us)|"
    r"oops|processing your request)\b|"
    r"\b(?:quick\s+)?clarification\b|\bcould you (?:please )?(?:specify|clarify)\b",
    re.IGNORECASE,
)


def artifact_slug(title: str, max_words: int = 12) -> str:
    words = re.findall(r"[a-z0-9]+", (title or "").lower())[:max_words]
    return "-".join(words) or "oreolook-report"


def validate_artifact_boundary(
    content: str,
    *,
    active_task: Mapping[str, Any] | None = None,
    pending_clarification: Mapping[str, Any] | None = None,
) -> str:
    value = (content or "").strip()
    task = active_task or {}
    if pending_clarification or task.get("status") == TaskStatus.AWAITING_CLARIFICATION.value:
        raise ArtifactRejected("incomplete_task_state")
    if len(value) < 120:
        raise ArtifactRejected("insufficient_document_content")
    if _BLOCKED_CONTENT.search(value) or _BLOCKED_OPENING.search(value[:700]):
        raise ArtifactRejected("internal_or_uncommitted_content")
    return value


def create_artifact_snapshot(
    *,
    kind: str,
    title: str,
    content: str,
    request_context: RequestContext | None = None,
    source_turn_ids: tuple[int, ...] = (),
    evidence_ids: tuple[str, ...] = (),
    request_id: str = "",
    memory_scope: MemoryScope | None = None,
) -> ArtifactSnapshot:
    context = request_context
    value = validate_artifact_boundary(
        content,
        active_task=context.active_task if context else None,
        pending_clarification=context.pending_clarification if context else None,
    )
    content_hash = hashlib.sha256(value.encode("utf-8")).hexdigest()
    turns = tuple(dict.fromkeys(
        (*context.source_turn_ids, *source_turn_ids) if context else source_turn_ids
    ))
    evidence = tuple(dict.fromkeys(
        (*context.evidence_ids, *evidence_ids) if context else evidence_ids
    ))
    origin_request = context.request_id if context else request_id
    slug = artifact_slug(title)
    identity = json.dumps(
        {
            "kind": kind,
            "title": title.strip(),
            "slug": slug,
            "content_hash": content_hash,
            "source_turn_ids": turns,
            "evidence_ids": evidence,
            "tenant_id": memory_scope.tenant_id if memory_scope else None,
            "user_id": memory_scope.user_id if memory_scope else None,
            "session_id": memory_scope.session_id if memory_scope else None,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    artifact_id = f"art_{hashlib.sha256(identity.encode('utf-8')).hexdigest()[:32]}"
    return ArtifactSnapshot(
        artifact_id=artifact_id,
        kind=kind,
        title=title.strip(),
        slug=slug,
        content_hash=content_hash,
        status="committed",
        source_turn_ids=turns,
        evidence_ids=evidence,
        request_id=origin_request,
        tenant_id=memory_scope.tenant_id if memory_scope else None,
        user_id=memory_scope.user_id if memory_scope else None,
        session_id=memory_scope.session_id if memory_scope else None,
    )
