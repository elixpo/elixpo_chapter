"""Private Doctor validation and durable-memory promotion pipeline."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from enum import Enum
import hashlib
import hmac
import json
import re
import time
import uuid
from typing import Any, Mapping

from pipeline.config import (
    DOCTOR_ALLOW_GLOBAL,
    DOCTOR_APPROVAL_SECRET,
    DOCTOR_AUDIT_TTL_SECONDS,
    DOCTOR_CANDIDATE_TTL_SECONDS,
    GRAPH_MEMORY_RETRY_LIMIT,
    GRAPH_MEMORY_FACT_TTL_SECONDS,
)
from sessions.episodic_memory import MemoryScope
from .client import GraphMemoryClient
from .models import ApprovedGraphFact, _utc_iso

QUEUE = "oreolook:doctor:v1:candidates"
RETRIES = "oreolook:doctor:v1:retries"
DEAD = "oreolook:doctor:v1:dead"
AUDIT_PREFIX = "oreolook:doctor:v1:audit:"
SEEN_PREFIX = "oreolook:doctor:v1:seen:"


class MemoryClass(str, Enum):
    EPHEMERAL = "ephemeral"
    SESSION = "session"
    USER = "user"
    PROJECT = "project"
    GLOBAL = "global"


class DecisionStatus(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"
    DUPLICATE = "duplicate"
    EPHEMERAL = "ephemeral"
    RETRYING = "retrying"
    DEAD_LETTER = "dead_letter"


_UNSAFE_PATTERNS = tuple(re.compile(pattern, re.I | re.S) for pattern in (
    r"<\/?(?:task|thinking|function_calls?|invoke|parameter|tool_call)\b",
    r"\b(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|system|developer)\s+instructions?\b",
    r"\b(?:reveal|print|show|leak|repeat)\s+(?:the\s+)?(?:system|developer)\s+prompt\b",
    r"\b(?:jailbreak|prompt injection|tool_calls?|function_calls?)\b",
    r"\b(?:traceback|internal server error|upstream error|stack trace)\b",
    r"\b(?:the user wants|the user is asking|i should call|i need to use a tool)\b",
))


def _canonical(value: Mapping[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _bounded(value: Any, field: str, maximum: int) -> str:
    text = " ".join(str(value or "").split()).strip()
    if not text:
        raise ValueError(f"{field} is required")
    if len(text) > maximum:
        raise ValueError(f"{field} exceeds {maximum} characters")
    return text


@dataclass(frozen=True, slots=True)
class MemoryCandidate:
    candidate_id: str
    tenant_id: str
    user_id: str
    session_id: str
    subject: str
    predicate: str
    object: str
    memory_class: str
    source: str
    source_turn: str
    evidence_ids: tuple[str, ...]
    event_time: str
    created_at: int
    expires_at: int
    confidence: float
    project_id: str | None
    explicit_global_approval: bool
    fingerprint: str
    schema: str = "oreolook-memory-candidate-v1"

    @classmethod
    def create(
        cls, *, scope: MemoryScope, subject: str, predicate: str, object: str,
        memory_class: MemoryClass | str, source: str, source_turn: str | int,
        evidence_ids: tuple[str, ...], confidence: float,
        event_time: datetime | str | None = None, project_id: str | None = None,
        explicit_global_approval: bool = False, now: int | None = None,
    ) -> "MemoryCandidate":
        created = int(now or time.time())
        score = float(confidence)
        if not 0.0 <= score <= 1.0:
            raise ValueError("confidence must be between 0 and 1")
        classification = MemoryClass(memory_class).value
        base = {
            "candidate_id": f"memcand_{uuid.uuid4().hex}",
            "tenant_id": scope.tenant_id,
            "user_id": scope.user_id,
            "session_id": scope.session_id,
            "subject": _bounded(subject, "subject", 300),
            "predicate": _bounded(predicate, "predicate", 160).lower(),
            "object": _bounded(object, "object", 1000),
            "memory_class": classification,
            "source": _bounded(source, "source", 240),
            "source_turn": _bounded(source_turn, "source_turn", 160),
            "evidence_ids": tuple(dict.fromkeys(_bounded(item, "evidence_id", 240)
                                                   for item in evidence_ids)),
            "event_time": _utc_iso(event_time),
            "created_at": created,
            "expires_at": created + DOCTOR_CANDIDATE_TTL_SECONDS,
            "confidence": score,
            "project_id": (_bounded(project_id, "project_id", 160) if project_id else None),
            "explicit_global_approval": bool(explicit_global_approval),
        }
        fingerprint = hashlib.sha256(_canonical(base).encode()).hexdigest()
        return cls(**base, fingerprint=fingerprint)

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "MemoryCandidate":
        fields = {key: value[key] for key in cls.__dataclass_fields__ if key in value}
        fields["evidence_ids"] = tuple(fields.get("evidence_ids") or ())
        candidate = cls(**fields)
        base = asdict(candidate)
        supplied = base.pop("fingerprint")
        base.pop("schema", None)
        expected = hashlib.sha256(_canonical(base).encode()).hexdigest()
        if not hmac.compare_digest(supplied, expected):
            raise ValueError("candidate fingerprint mismatch")
        return candidate

    @property
    def scope(self) -> MemoryScope:
        return MemoryScope(self.tenant_id, self.user_id, self.session_id)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class DoctorDecision:
    candidate_id: str
    candidate_fingerprint: str
    status: str
    memory_class: str
    action: str
    reasons: tuple[str, ...]
    decided_at: int
    approval_fingerprint: str | None
    fact_id: str | None
    schema: str = "oreolook-doctor-decision-v1"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class DoctorPolicy:
    MIN_CONFIDENCE = {
        MemoryClass.SESSION: 0.60,
        MemoryClass.USER: 0.75,
        MemoryClass.PROJECT: 0.80,
        MemoryClass.GLOBAL: 0.95,
    }

    def __init__(self, *, secret: str | None = None, allow_global: bool | None = None,
                 graph_client: GraphMemoryClient | None = None):
        self.secret = secret if secret is not None else DOCTOR_APPROVAL_SECRET
        if len(self.secret) < 32:
            raise ValueError("DOCTOR_APPROVAL_SECRET must contain at least 32 characters")
        self.allow_global = DOCTOR_ALLOW_GLOBAL if allow_global is None else bool(allow_global)
        self.graph = graph_client or GraphMemoryClient(enabled=True)

    @staticmethod
    def promotion_scope(candidate: MemoryCandidate) -> MemoryScope:
        kind = MemoryClass(candidate.memory_class)
        if kind is MemoryClass.USER:
            return MemoryScope(candidate.tenant_id, candidate.user_id, "user:*")
        if kind is MemoryClass.PROJECT:
            return MemoryScope(candidate.tenant_id, candidate.user_id,
                               f"project:{candidate.project_id}")
        if kind is MemoryClass.GLOBAL:
            return MemoryScope(candidate.tenant_id, "global", "global:*")
        return candidate.scope

    def evaluate(self, candidate: MemoryCandidate, *, now: int | None = None) -> DoctorDecision:
        timestamp = int(now or time.time())
        kind = MemoryClass(candidate.memory_class)
        reasons: list[str] = []
        try:
            candidate.scope
        except ValueError:
            reasons.append("invalid_ownership")
        try:
            event_time = datetime.fromisoformat(candidate.event_time.replace("Z", "+00:00"))
            if event_time.timestamp() > timestamp + 300:
                reasons.append("future_event_time")
        except (TypeError, ValueError):
            reasons.append("invalid_event_time")
        if candidate.expires_at <= timestamp:
            reasons.append("candidate_expired")
        if candidate.created_at > timestamp + 300:
            reasons.append("future_timestamp")
        if not candidate.source.strip():
            reasons.append("missing_source")
        if not candidate.evidence_ids:
            reasons.append("missing_evidence")
        if kind is MemoryClass.PROJECT and not candidate.project_id:
            reasons.append("missing_project_id")
        if kind is MemoryClass.GLOBAL and not (
            self.allow_global and candidate.explicit_global_approval
        ):
            reasons.append("global_policy_approval_required")
        if kind is not MemoryClass.EPHEMERAL:
            threshold = self.MIN_CONFIDENCE[kind]
            if candidate.confidence < threshold:
                reasons.append("confidence_below_policy")
        inspected = "\n".join((candidate.subject, candidate.predicate, candidate.object,
                                candidate.source, *candidate.evidence_ids))
        if any(pattern.search(inspected) for pattern in _UNSAFE_PATTERNS):
            reasons.append("unsafe_or_internal_content")

        if reasons:
            return self._decision(candidate, DecisionStatus.REJECTED, "reject", reasons, timestamp)
        if kind is MemoryClass.EPHEMERAL:
            return self._decision(candidate, DecisionStatus.EPHEMERAL, "discard", (), timestamp)

        scope = self.promotion_scope(candidate)
        current = self.graph.get_cached(scope)
        same_relation = [item for item in current
                         if str(item.get("subject", "")).casefold() == candidate.subject.casefold()
                         and str(item.get("predicate", "")).casefold() == candidate.predicate.casefold()]
        if any(str(item.get("object", "")).casefold() == candidate.object.casefold()
               for item in same_relation):
            return self._decision(candidate, DecisionStatus.DUPLICATE, "deduplicate", (), timestamp)
        action = "supersede" if same_relation else "promote"
        return self._decision(candidate, DecisionStatus.APPROVED, action, (), timestamp)

    def _decision(self, candidate: MemoryCandidate, status: DecisionStatus, action: str,
                  reasons: tuple[str, ...] | list[str], timestamp: int) -> DoctorDecision:
        fact_id = str(uuid.uuid5(uuid.NAMESPACE_URL, candidate.fingerprint)) \
            if status is DecisionStatus.APPROVED else None
        signature = None
        if status is DecisionStatus.APPROVED:
            payload = approval_payload(
                candidate.fingerprint, candidate.memory_class, action, timestamp, fact_id,
                candidate_claim(
                    candidate, self.promotion_scope(candidate),
                    expires_at=timestamp + GRAPH_MEMORY_FACT_TTL_SECONDS,
                ),
            )
            signature = hmac.new(self.secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        return DoctorDecision(
            candidate_id=candidate.candidate_id,
            candidate_fingerprint=candidate.fingerprint,
            status=status.value,
            memory_class=candidate.memory_class,
            action=action,
            reasons=tuple(reasons),
            decided_at=timestamp,
            approval_fingerprint=signature,
            fact_id=fact_id,
        )

    def approved_fact(self, candidate: MemoryCandidate, decision: DoctorDecision) -> ApprovedGraphFact:
        if decision.status != DecisionStatus.APPROVED.value or not decision.approval_fingerprint:
            raise PermissionError("candidate is not approved")
        return ApprovedGraphFact.create(
            scope=self.promotion_scope(candidate), subject=candidate.subject,
            predicate=candidate.predicate, object=candidate.object,
            source_turn=candidate.source_turn, confidence=candidate.confidence,
            approval_fingerprint=decision.approval_fingerprint,
            event_time=candidate.event_time, fact_id=decision.fact_id,
            memory_class=candidate.memory_class, source=candidate.source,
            evidence_ids=candidate.evidence_ids, project_id=candidate.project_id,
            candidate_fingerprint=candidate.fingerprint, approved_at=decision.decided_at,
            approval_action=decision.action,
            expires_at=decision.decided_at + GRAPH_MEMORY_FACT_TTL_SECONDS,
        )


def candidate_claim(
    candidate: MemoryCandidate, scope: MemoryScope, *, expires_at: int | None = None,
) -> dict[str, Any]:
    return {
        "tenant_id": scope.tenant_id, "user_id": scope.user_id, "session_id": scope.session_id,
        "subject": candidate.subject, "predicate": candidate.predicate, "object": candidate.object,
        "event_time": candidate.event_time, "source_turn": candidate.source_turn,
        "confidence": float(candidate.confidence), "memory_class": candidate.memory_class,
        "source": candidate.source, "evidence_ids": list(candidate.evidence_ids),
        "project_id": candidate.project_id,
        "expires_at": expires_at,
    }


def fact_claim(fact: ApprovedGraphFact) -> dict[str, Any]:
    return {
        "tenant_id": fact.tenant_id, "user_id": fact.user_id, "session_id": fact.session_id,
        "subject": fact.subject, "predicate": fact.predicate, "object": fact.object,
        "event_time": fact.event_time, "source_turn": fact.source_turn,
        "confidence": float(fact.confidence), "memory_class": fact.memory_class,
        "source": fact.source, "evidence_ids": list(fact.evidence_ids),
        "project_id": fact.project_id,
        "expires_at": fact.expires_at,
    }


def approval_payload(candidate_fingerprint: str, memory_class: str, action: str,
                     approved_at: int, fact_id: str, claim: Mapping[str, Any]) -> str:
    return _canonical({
        "schema": "oreolook-doctor-approval-v1",
        "candidate_fingerprint": candidate_fingerprint,
        "status": DecisionStatus.APPROVED.value,
        "memory_class": memory_class,
        "action": action,
        "decided_at": int(approved_at),
        "fact_id": fact_id,
        "claim": dict(claim),
    })


def verify_approved_fact(fact: ApprovedGraphFact, secret: str) -> bool:
    if not all((fact.candidate_fingerprint, fact.approved_at, fact.approval_action,
                fact.fact_id, fact.approval_fingerprint)):
        return False
    payload = approval_payload(fact.candidate_fingerprint, fact.memory_class,
                               fact.approval_action, fact.approved_at, fact.fact_id,
                               fact_claim(fact))
    expected = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(fact.approval_fingerprint, expected)


class DoctorMemoryClient:
    """Internal-only submission and audit API; deliberately not mounted as HTTP."""

    def __init__(self, redis_client):
        self.redis = redis_client

    def submit(self, candidate: MemoryCandidate) -> bool:
        payload = json.dumps({"attempt": 0, "candidate": candidate.to_dict()}, separators=(",", ":"))
        return bool(self.redis.lpush(QUEUE, payload))

    def audit(self, candidate_id: str) -> dict[str, Any] | None:
        raw = self.redis.get(f"{AUDIT_PREFIX}{candidate_id}")
        if not raw:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode()
        value = json.loads(raw)
        return value if isinstance(value, dict) else None


class DoctorWorker:
    def __init__(self, redis_client, policy: DoctorPolicy):
        self.redis = redis_client
        self.policy = policy
        self.client = DoctorMemoryClient(redis_client)

    def _audit(self, decision: DoctorDecision) -> None:
        self.redis.setex(f"{AUDIT_PREFIX}{decision.candidate_id}", DOCTOR_AUDIT_TTL_SECONDS,
                         json.dumps(decision.to_dict(), separators=(",", ":")))

    def _promote_retries(self) -> None:
        due = self.redis.zrangebyscore(RETRIES, 0, time.time(), start=0, num=20)
        if not due:
            return
        pipe = self.redis.pipeline(transaction=True)
        for payload in due:
            pipe.zrem(RETRIES, payload)
            pipe.lpush(QUEUE, payload)
        pipe.execute()

    async def run_once(self, *, timeout: int = 1) -> bool:
        self._promote_retries()
        claimed = await __import__("asyncio").to_thread(self.redis.brpop, QUEUE, timeout)
        if not claimed:
            return False
        raw = claimed[1].decode() if isinstance(claimed[1], bytes) else claimed[1]
        envelope: dict[str, Any] = {}
        try:
            envelope = json.loads(raw)
            if not isinstance(envelope, dict):
                raise ValueError("candidate envelope must be an object")
            candidate = MemoryCandidate.from_dict(envelope["candidate"])
            seen_key = f"{SEEN_PREFIX}{candidate.fingerprint}"
            existing = self.redis.get(seen_key)
            if existing:
                decision = DoctorDecision(**json.loads(existing.decode() if isinstance(existing, bytes) else existing))
                self._audit(decision)
                return decision.status == DecisionStatus.APPROVED.value
            decision = self.policy.evaluate(candidate)
            if decision.status == DecisionStatus.APPROVED.value:
                fact = self.policy.approved_fact(candidate, decision)
                if not self.policy.graph.enqueue_approved(fact):
                    raise RuntimeError("graph write queue is disabled")
            encoded = json.dumps(decision.to_dict(), separators=(",", ":"))
            self.redis.setex(seen_key, DOCTOR_AUDIT_TTL_SECONDS, encoded)
            self._audit(decision)
            return decision.status == DecisionStatus.APPROVED.value
        except (ValueError, PermissionError, KeyError, TypeError) as exc:
            candidate_id = str(envelope.get("candidate", {}).get("candidate_id") or "invalid")
            decision = DoctorDecision(candidate_id, "invalid", DecisionStatus.REJECTED.value,
                                      "unknown", "reject", (str(exc)[:160],), int(time.time()), None, None)
            self._audit(decision)
            return False
        except Exception as exc:
            attempt = int(envelope.get("attempt", 0)) + 1
            envelope["attempt"] = attempt
            payload = json.dumps(envelope, separators=(",", ":"))
            candidate_data = envelope.get("candidate") or {}
            terminal = attempt >= GRAPH_MEMORY_RETRY_LIMIT
            retry_decision = DoctorDecision(
                candidate_id=str(candidate_data.get("candidate_id") or "unknown"),
                candidate_fingerprint=str(candidate_data.get("fingerprint") or "unknown"),
                status=(DecisionStatus.DEAD_LETTER.value if terminal
                        else DecisionStatus.RETRYING.value),
                memory_class=str(candidate_data.get("memory_class") or "unknown"),
                action="dead_letter" if terminal else "retry",
                reasons=(type(exc).__name__,), decided_at=int(time.time()),
                approval_fingerprint=None, fact_id=None,
            )
            self._audit(retry_decision)
            if terminal:
                self.redis.lpush(DEAD, payload)
            else:
                self.redis.zadd(RETRIES, {payload: time.time() + min(300, 2 ** min(attempt, 8))})
            return False

    async def run_forever(self) -> None:
        while True:
            await self.run_once(timeout=2)
