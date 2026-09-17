import asyncio
import json
from pathlib import Path
import time

import pytest

from graphMemory.backends import GraphitiFalkorBackend, SQLiteTemporalGraphBackend
from graphMemory.client import GraphMemoryClient, format_graph_context
from graphMemory.models import ApprovedGraphFact
from graphMemory.worker import GraphMemoryWorker, RETRIES
from sessions.episodic_memory import MemoryScope


def _scope(user="user-a", session="session-a"):
    return MemoryScope(tenant_id="tenant-a", user_id=user, session_id=session)


def _fact(scope, value, event_time, *, fact_id=None):
    return ApprovedGraphFact.create(
        scope=scope,
        subject="Ayushman",
        predicate="preferred database",
        object=value,
        source_turn="turn-1",
        confidence=0.95,
        approval_fingerprint="doctor:approved:abc123",
        event_time=event_time,
        fact_id=fact_id,
    )


def test_temporal_updates_preserve_current_and_historical_facts(tmp_path: Path):
    async def scenario():
        backend = SQLiteTemporalGraphBackend(str(tmp_path / "graph.db"))
        scope = _scope()
        old = _fact(scope, "PostgreSQL", "2026-01-01T00:00:00Z")
        new = _fact(scope, "MongoDB", "2026-02-01T00:00:00Z")
        await backend.upsert(old)
        await backend.upsert(new)

        january = await backend.query(scope, at_time="2026-01-15T00:00:00Z")
        march = await backend.query(scope, at_time="2026-03-01T00:00:00Z")
        assert [item.object for item in january] == ["PostgreSQL"]
        assert [item.object for item in march] == ["MongoDB"]
        await backend.close()

        restarted = SQLiteTemporalGraphBackend(str(tmp_path / "graph.db"))
        after_restart = await restarted.query(scope, at_time="2026-03-01T00:00:00Z")
        assert [item.fact_id for item in after_restart] == [new.fact_id]
        await restarted.close()

    asyncio.run(scenario())


def test_scope_isolation_and_revocation_keep_point_in_time_history(tmp_path: Path):
    async def scenario():
        backend = SQLiteTemporalGraphBackend(str(tmp_path / "scope.db"))
        owner = _scope()
        outsider = _scope(user="user-b")
        fact = _fact(owner, "PostgreSQL", "2026-01-01T00:00:00Z")
        await backend.upsert(fact)
        assert await backend.query(outsider, at_time="2026-02-01T00:00:00Z") == []
        assert await backend.revoke_scope(owner, event_time="2026-03-01T00:00:00Z") == 1
        assert len(await backend.query(owner, at_time="2026-02-01T00:00:00Z")) == 1
        assert await backend.query(owner, at_time="2026-04-01T00:00:00Z") == []
        await backend.close()

    asyncio.run(scenario())


class FakePipeline:
    def __init__(self, redis):
        self.redis = redis
        self.calls = []

    def zrem(self, *args): self.calls.append(("zrem", args)); return self
    def lpush(self, *args): self.calls.append(("lpush", args)); return self
    def execute(self):
        return [getattr(self.redis, name)(*args) for name, args in self.calls]


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.lists = {}
        self.zsets = {}
        self.get_calls = 0

    def get(self, key): self.get_calls += 1; return self.values.get(key)
    def setex(self, key, ttl, value): self.values[key] = value; return True
    def delete(self, key): return int(self.values.pop(key, None) is not None)
    def lpush(self, key, value): self.lists.setdefault(key, []).insert(0, value); return 1
    def brpop(self, key, timeout):
        values = self.lists.setdefault(key, [])
        return (key, values.pop()) if values else None
    def zadd(self, key, mapping): self.zsets.setdefault(key, {}).update(mapping); return len(mapping)
    def zrem(self, key, value): return int(self.zsets.setdefault(key, {}).pop(value, None) is not None)
    def zrangebyscore(self, key, minimum, maximum, start=0, num=None):
        values = [value for value, score in self.zsets.get(key, {}).items()
                  if float(minimum) <= score <= float(maximum)]
        return values[start:start + num if num is not None else None]
    def pipeline(self, transaction=True): return FakePipeline(self)


def test_disabled_mode_is_a_clean_noop_and_cache_is_one_fast_lookup():
    redis = FakeRedis()
    disabled = GraphMemoryClient(redis, enabled=False)
    assert disabled.get_cached(_scope()) == []
    assert disabled.enqueue_approved(_fact(_scope(), "PostgreSQL", "2026-01-01T00:00:00Z")) is False
    assert redis.get_calls == 0

    enabled = GraphMemoryClient(redis, enabled=True)
    enabled.set_cached(_scope(), [_fact(_scope(), "PostgreSQL", "2026-01-01T00:00:00Z").to_dict()])
    started = time.perf_counter()
    facts = enabled.get_cached(_scope())
    elapsed_ms = (time.perf_counter() - started) * 1000
    assert redis.get_calls == 1
    assert elapsed_ms < 75
    assert "PostgreSQL" in format_graph_context(facts)


class FailingBackend:
    async def upsert(self, fact): raise RuntimeError("offline")
    async def query(self, scope, *, at_time=None, limit=24): return []


def test_failed_write_enters_retry_queue_without_raising():
    redis = FakeRedis()
    client = GraphMemoryClient(redis, enabled=True)
    client.enqueue_approved(_fact(_scope(), "PostgreSQL", "2026-01-01T00:00:00Z"))
    worker = GraphMemoryWorker(FailingBackend(), redis)
    assert asyncio.run(worker.run_once(timeout=0)) is False
    assert len(redis.zsets[RETRIES]) == 1
    envelope = json.loads(next(iter(redis.zsets[RETRIES])))
    assert envelope["attempt"] == 1


class FakeGraphitiDriver:
    def __init__(self): self.calls = []
    async def execute_query(self, query, **params):
        self.calls.append((query, params))
        return [], [], {}
    async def close(self): return None


def test_graphiti_adapter_scopes_every_write_and_read():
    async def scenario():
        driver = FakeGraphitiDriver()
        backend = GraphitiFalkorBackend(host="unused", driver=driver)
        fact = _fact(_scope(), "PostgreSQL", "2026-01-01T00:00:00Z")
        await backend.upsert(fact)
        await backend.query(_scope(), at_time="2026-02-01T00:00:00Z")
        assert driver.calls[0][1]["scope_id"] == fact.scope_id
        assert driver.calls[1][1]["scope_id"] == fact.scope_id
        assert driver.calls[0][1]["tenant_id"] == "tenant-a"

    asyncio.run(scenario())


def test_unapproved_payload_is_rejected():
    payload = _fact(_scope(), "PostgreSQL", "2026-01-01T00:00:00Z").to_dict()
    payload["approved"] = False
    with pytest.raises(ValueError, match="Doctor approval"):
        ApprovedGraphFact.from_dict(payload)
