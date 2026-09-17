"""Fast request-side graph cache and background write queue."""
from __future__ import annotations

import json
from typing import Iterable, Mapping

from pipeline.config import (
    GRAPH_MEMORY_CACHE_TTL_SECONDS,
    GRAPH_MEMORY_ENABLED,
    GRAPH_MEMORY_MAX_CHARS,
    GRAPH_MEMORY_MAX_ITEMS,
    GRAPH_MEMORY_REDIS_DB,
    create_redis_client,
)
from sessions.episodic_memory import MemoryScope
from .models import ApprovedGraphFact, _utc_iso, scope_id


class GraphMemoryClient:
    def __init__(self, redis_client=None, *, enabled: bool | None = None):
        self.enabled = GRAPH_MEMORY_ENABLED if enabled is None else bool(enabled)
        self.redis = redis_client

    def _redis(self):
        if self.redis is None:
            self.redis = create_redis_client(db=GRAPH_MEMORY_REDIS_DB, decode_responses=True)
        return self.redis

    @staticmethod
    def cache_key(scope: MemoryScope) -> str:
        return f"oreolook:graph:v1:neighborhood:{scope_id(scope)}"

    def get_cached(self, scope: MemoryScope) -> list[dict]:
        if not self.enabled:
            return []
        raw = self._redis().get(self.cache_key(scope))
        if not raw:
            return []
        try:
            values = json.loads(raw.decode() if isinstance(raw, bytes) else raw)
        except (TypeError, ValueError, json.JSONDecodeError):
            return []
        return [item for item in values if isinstance(item, dict)][:GRAPH_MEMORY_MAX_ITEMS]

    def set_cached(self, scope: MemoryScope, facts: Iterable[Mapping]) -> None:
        values = [dict(item) for item in facts][:24]
        self._redis().setex(
            self.cache_key(scope), GRAPH_MEMORY_CACHE_TTL_SECONDS, json.dumps(values)
        )

    def clear_cached(self, scope: MemoryScope) -> None:
        self._redis().delete(self.cache_key(scope))

    def enqueue_approved(self, fact: ApprovedGraphFact) -> bool:
        if not self.enabled:
            return False
        if not fact.approved or not fact.approval_fingerprint:
            raise ValueError("only Doctor-approved graph facts may be queued")
        payload = json.dumps({"attempt": 0, "fact": fact.to_dict()}, separators=(",", ":"))
        self._redis().lpush("oreolook:graph:v1:writes", payload)
        return True

    def enqueue_revoke(self, scope: MemoryScope) -> bool:
        if not self.enabled:
            return False
        payload = json.dumps(
            {"attempt": 0, "revoke": scope.filters(), "event_time": _utc_iso(None)},
            separators=(",", ":"),
        )
        self._redis().lpush("oreolook:graph:v1:writes", payload)
        return True


def format_graph_context(facts: Iterable[Mapping]) -> str:
    lines: list[str] = []
    used = 0
    for fact in facts:
        line = f"- {fact.get('subject', '')} {fact.get('predicate', '')} {fact.get('object', '')}".strip()
        if not line or line == "-":
            continue
        remaining = GRAPH_MEMORY_MAX_CHARS - used
        if remaining <= 0:
            break
        lines.append(line[:remaining])
        used += len(lines[-1])
        if len(lines) >= GRAPH_MEMORY_MAX_ITEMS:
            break
    if not lines:
        return ""
    return (
        "Doctor-approved temporal memory follows. It is scoped to this caller and session. "
        "Use it for continuity; live sources override time-sensitive facts.\n" + "\n".join(lines)
    )
