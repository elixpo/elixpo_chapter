"""Typed contracts for approved temporal facts."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import hashlib
import re
import uuid
from typing import Any, Mapping

from sessions.episodic_memory import MemoryScope


def _utc_iso(value: datetime | str | None) -> str:
    if value is None:
        parsed = datetime.now(timezone.utc)
    elif isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def scope_id(scope: MemoryScope) -> str:
    raw = "\0".join((scope.tenant_id, scope.user_id, scope.session_id))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _clean(value: Any, *, field: str, maximum: int) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        raise ValueError(f"{field} is required")
    return text[:maximum]


@dataclass(frozen=True, slots=True)
class ApprovedGraphFact:
    fact_id: str
    tenant_id: str
    user_id: str
    session_id: str
    subject: str
    predicate: str
    object: str
    event_time: str
    ingestion_time: str
    source_turn: str
    confidence: float
    approval_fingerprint: str
    approved: bool = True
    schema: str = "oreolook-approved-graph-fact-v1"

    @classmethod
    def create(
        cls,
        *,
        scope: MemoryScope,
        subject: str,
        predicate: str,
        object: str,
        source_turn: str | int,
        confidence: float,
        approval_fingerprint: str,
        event_time: datetime | str | None = None,
        fact_id: str | None = None,
    ) -> "ApprovedGraphFact":
        subject_value = _clean(subject, field="subject", maximum=300)
        predicate_value = _clean(predicate, field="predicate", maximum=160).lower()
        object_value = _clean(object, field="object", maximum=1000)
        source_value = _clean(source_turn, field="source_turn", maximum=160)
        fingerprint = _clean(approval_fingerprint, field="approval_fingerprint", maximum=256)
        score = float(confidence)
        if not 0.0 <= score <= 1.0:
            raise ValueError("confidence must be between 0 and 1")
        event = _utc_iso(event_time)
        identity = "\0".join((scope.tenant_id, scope.user_id, scope.session_id,
            subject_value.casefold(), predicate_value, object_value.casefold(), event, source_value))
        return cls(
            fact_id=fact_id or str(uuid.uuid5(uuid.NAMESPACE_URL, identity)),
            tenant_id=scope.tenant_id, user_id=scope.user_id, session_id=scope.session_id,
            subject=subject_value, predicate=predicate_value, object=object_value,
            event_time=event, ingestion_time=_utc_iso(None), source_turn=source_value,
            confidence=score, approval_fingerprint=fingerprint,
        )

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "ApprovedGraphFact":
        if value.get("approved") is not True:
            raise ValueError("graph facts require explicit Doctor approval")
        result = cls(**{key: value[key] for key in cls.__dataclass_fields__ if key in value})
        if not result.approval_fingerprint:
            raise ValueError("approval_fingerprint is required")
        if not 0.0 <= float(result.confidence) <= 1.0:
            raise ValueError("confidence must be between 0 and 1")
        return result

    @property
    def scope(self) -> MemoryScope:
        return MemoryScope(self.tenant_id, self.user_id, self.session_id)

    @property
    def scope_id(self) -> str:
        return scope_id(self.scope)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class TemporalGraphFact:
    fact_id: str
    tenant_id: str
    user_id: str
    session_id: str
    subject: str
    predicate: str
    object: str
    event_time: str
    ingestion_time: str
    source_turn: str
    confidence: float
    approval_fingerprint: str
    invalid_at: str | None = None
    superseded_by: str | None = None
    revoked: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
