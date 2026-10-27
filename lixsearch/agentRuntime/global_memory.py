"""Bounded, Doctor-gated global memory shared by every OreoLook replica."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from functools import lru_cache
import hashlib
import hmac
import json
import time
import uuid
from typing import Any

from pipeline.config import (
    GLOBAL_MEMORY_CANDIDATE_TTL_SECONDS,
    GLOBAL_MEMORY_MAX_CHARS,
    GLOBAL_MEMORY_MAX_ITEMS,
    GLOBAL_MEMORY_REDIS_DB,
    GLOBAL_MEMORY_TTL_SECONDS,
    create_redis_client,
)

_PROMOTED_KEY = "elixpo:global-memory:promoted:v1"
_CANDIDATE_KEY = "elixpo:global-memory:candidates:v1"
_MAX_REVELATION_CHARS = 500


@dataclass(frozen=True, slots=True)
class MemoryCandidate:
    id: str
    text: str
    source: str
    creator: str
    created_at: int
    confidence: float
    expires_at: int
    fingerprint: str


@dataclass(frozen=True, slots=True)
class GlobalRevelation:
    id: str
    text: str
    source: str
    creator: str
    created_at: int
    confidence: float
    approval_fingerprint: str
    approved_by: str
    approved_at: int
    expires_at: int


def _canonical(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _clean_text(value: str, field: str, maximum: int) -> str:
    result = " ".join(str(value or "").split()).strip()
    if not result:
        raise ValueError(f"{field} is required")
    if len(result) > maximum:
        raise ValueError(f"{field} exceeds {maximum} characters")
    return result


def _decode(member: Any) -> dict[str, Any] | None:
    try:
        if isinstance(member, bytes):
            member = member.decode("utf-8")
        value = json.loads(member)
        return value if isinstance(value, dict) else None
    except (UnicodeDecodeError, json.JSONDecodeError, TypeError):
        return None


class GlobalMemoryStore:
    """Internal-only candidate, approval, read, revoke, and cleanup boundary."""

    def __init__(self, client=None) -> None:
        self.client = client or create_redis_client(db=GLOBAL_MEMORY_REDIS_DB)

    def propose(self, *, text: str, source: str, creator: str, confidence: float,
                now: int | None = None) -> MemoryCandidate:
        timestamp = int(now or time.time())
        confidence = float(confidence)
        if not 0.0 <= confidence <= 1.0:
            raise ValueError("confidence must be between 0 and 1")
        base = {
            "id": f"memcand_{uuid.uuid4().hex}",
            "text": _clean_text(text, "text", _MAX_REVELATION_CHARS),
            "source": _clean_text(source, "source", 240),
            "creator": _clean_text(creator, "creator", 120),
            "created_at": timestamp,
            "confidence": confidence,
            "expires_at": timestamp + GLOBAL_MEMORY_CANDIDATE_TTL_SECONDS,
        }
        fingerprint = hashlib.sha256(_canonical(base).encode("utf-8")).hexdigest()
        candidate = MemoryCandidate(**base, fingerprint=fingerprint)
        self.client.zadd(_CANDIDATE_KEY, {_canonical(asdict(candidate)): candidate.expires_at})
        return candidate

    @staticmethod
    def doctor_fingerprint(candidate: MemoryCandidate, *, approved_by: str,
                           approved_at: int) -> str:
        approval = {
            "schema": "oreolook-global-memory-approval-v1",
            "decision": "promote",
            "candidate_fingerprint": candidate.fingerprint,
            "approved_by": _clean_text(approved_by, "approved_by", 120),
            "approved_at": int(approved_at),
        }
        return hashlib.sha256(_canonical(approval).encode("utf-8")).hexdigest()

    def promote(self, candidate: MemoryCandidate, *, approved_by: str,
                approved_at: int, approval_fingerprint: str,
                now: int | None = None) -> GlobalRevelation:
        expected = self.doctor_fingerprint(
            candidate, approved_by=approved_by, approved_at=approved_at,
        )
        if not hmac.compare_digest(approval_fingerprint, expected):
            raise PermissionError("Doctor approval fingerprint mismatch")
        timestamp = int(now or time.time())
        if candidate.expires_at <= timestamp:
            raise ValueError("candidate expired before promotion")
        revelation = GlobalRevelation(
            id=f"mem_{uuid.uuid4().hex}", text=candidate.text,
            source=candidate.source, creator=candidate.creator,
            created_at=candidate.created_at, confidence=candidate.confidence,
            approval_fingerprint=approval_fingerprint,
            approved_by=_clean_text(approved_by, "approved_by", 120),
            approved_at=int(approved_at),
            expires_at=timestamp + GLOBAL_MEMORY_TTL_SECONDS,
        )
        pipe = self.client.pipeline(transaction=True)
        pipe.zadd(_PROMOTED_KEY, {_canonical(asdict(revelation)): revelation.expires_at})
        pipe.zrem(_CANDIDATE_KEY, _canonical(asdict(candidate)))
        pipe.execute()
        return revelation

    def get_revelations(self, *, now: int | None = None) -> list[dict[str, Any]]:
        """One Redis sorted-set lookup, bounded by item and character ceilings."""
        timestamp = int(now or time.time())
        members = self.client.zrevrangebyscore(
            _PROMOTED_KEY, "+inf", timestamp,
            start=0, num=GLOBAL_MEMORY_MAX_ITEMS,
        )
        accepted: list[dict[str, Any]] = []
        characters = 0
        for member in members:
            item = _decode(member)
            if not item or int(item.get("expires_at", 0)) <= timestamp:
                continue
            text = str(item.get("text", "")).strip()
            if not text or characters + len(text) > GLOBAL_MEMORY_MAX_CHARS:
                continue
            accepted.append(item)
            characters += len(text)
        return accepted

    def get_context(self, *, now: int | None = None) -> str:
        items = self.get_revelations(now=now)
        return "\n".join(
            "- {text} (source: {source}; confidence: {confidence:.2f})".format(
                text=item["text"], source=item["source"],
                confidence=float(item["confidence"]),
            )
            for item in items
        )

    def revoke(self, revelation_id: str) -> int:
        """Internal Janitor operation; bounded scan, never exposed as an API."""
        removed = 0
        for member in self.client.zrange(_PROMOTED_KEY, 0, -1):
            item = _decode(member)
            if item and item.get("id") == revelation_id:
                removed += int(self.client.zrem(_PROMOTED_KEY, member))
        return removed

    def janitor_cleanup(self, *, now: int | None = None) -> dict[str, int]:
        timestamp = int(now or time.time())
        return {
            "promoted": int(self.client.zremrangebyscore(_PROMOTED_KEY, "-inf", timestamp)),
            "candidates": int(self.client.zremrangebyscore(_CANDIDATE_KEY, "-inf", timestamp)),
        }

    def doctor_status(self) -> dict[str, Any]:
        return {
            "healthy": bool(self.client.ping()),
            "redis_db": GLOBAL_MEMORY_REDIS_DB,
            "promoted": int(self.client.zcard(_PROMOTED_KEY)),
            "candidates": int(self.client.zcard(_CANDIDATE_KEY)),
        }


@lru_cache(maxsize=1)
def get_global_memory_store() -> GlobalMemoryStore:
    return GlobalMemoryStore()
