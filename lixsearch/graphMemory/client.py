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

CACHE_SCOPES = "oreolook:graph:v1:cache-scopes"


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

    def get_cached_for_request(self, scope: MemoryScope) -> list[dict]:
        """Read session, user, and global neighborhoods in one Redis round trip."""
        if not self.enabled:
            return []
        scopes = (
            scope,
            MemoryScope(scope.tenant_id, scope.user_id, "user:*"),
            MemoryScope(scope.tenant_id, "global", "global:*"),
        )
        raw_values = self._redis().mget([self.cache_key(item) for item in scopes])
        accepted: list[dict] = []
        seen: set[str] = set()
        for raw in raw_values:
            if not raw:
                continue
            try:
                values = json.loads(raw.decode() if isinstance(raw, bytes) else raw)
            except (TypeError, ValueError, json.JSONDecodeError):
                continue
            for item in values if isinstance(values, list) else ():
                if not isinstance(item, dict):
                    continue
                identity = str(item.get("fact_id") or json.dumps(item, sort_keys=True))
                if identity in seen:
                    continue
                accepted.append(item)
                seen.add(identity)
                if len(accepted) >= GRAPH_MEMORY_MAX_ITEMS:
                    return accepted
        return accepted

    def set_cached(self, scope: MemoryScope, facts: Iterable[Mapping]) -> None:
        values = [dict(item) for item in facts][:24]
        key = self.cache_key(scope)
        redis = self._redis()
        pipe = redis.pipeline(transaction=True)
        pipe.setex(key, GRAPH_MEMORY_CACHE_TTL_SECONDS, json.dumps(values))
        pipe.hset(CACHE_SCOPES, key, json.dumps(scope.filters(), separators=(",", ":")))
        pipe.execute()

    def clear_cached(self, scope: MemoryScope) -> None:
        key = self.cache_key(scope)
        redis = self._redis()
        pipe = redis.pipeline(transaction=True)
        pipe.delete(key)
        pipe.hdel(CACHE_SCOPES, key)
        pipe.execute()

    def clear_owner_cached(
        self, tenant_id: str, user_id: str, *, session_id: str | None = None,
    ) -> int:
        redis = self._redis()
        indexed = redis.hgetall(CACHE_SCOPES)
        doomed: list[str] = []
        for raw_key, raw_scope in indexed.items():
            key = raw_key.decode() if isinstance(raw_key, bytes) else raw_key
            try:
                value = json.loads(raw_scope.decode() if isinstance(raw_scope, bytes) else raw_scope)
            except (TypeError, ValueError, json.JSONDecodeError):
                continue
            if value.get("tenant_id") != tenant_id or value.get("user_id") != user_id:
                continue
            if session_id is not None and value.get("session_id") != session_id:
                continue
            doomed.append(key)
        if not doomed:
            return 0
        pipe = redis.pipeline(transaction=True)
        pipe.delete(*doomed)
        pipe.hdel(CACHE_SCOPES, *doomed)
        pipe.execute()
        return len(doomed)

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

    def enqueue_revoke_owner(
        self, tenant_id: str, user_id: str, *, session_id: str | None = None,
    ) -> bool:
        if not self.enabled:
            return False
        payload = json.dumps({
            "attempt": 0,
            "revoke_owner": {
                "tenant_id": tenant_id, "user_id": user_id, "session_id": session_id,
            },
            "event_time": _utc_iso(None),
        }, separators=(",", ":"))
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
