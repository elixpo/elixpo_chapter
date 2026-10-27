import asyncio
import fnmatch
import json
from pathlib import Path

import memoryJanitor.janitor as janitor_module
from graphMemory.backends import SQLiteTemporalGraphBackend
from graphMemory.client import GraphMemoryClient
from graphMemory.models import ApprovedGraphFact
from memoryJanitor import DeletionRequest, Janitor
from sessions.episodic_memory import MemoryScope


class FakePipeline:
    def __init__(self, redis): self.redis = redis; self.calls = []
    def __getattr__(self, name):
        def queue(*args, **kwargs): self.calls.append((name, args, kwargs)); return self
        return queue
    def execute(self):
        return [getattr(self.redis, name)(*args, **kwargs) for name, args, kwargs in self.calls]


class FakeRedis:
    def __init__(self):
        self.values = {}; self.hashes = {}; self.streams = {}; self.lists = {}; self.zsets = {}
        self.expiries = {}
    def register_script(self, script):
        def release(*, keys, args):
            if self.values.get(keys[0]) == args[0]: return self.delete(keys[0])
            return 0
        return release
    def pipeline(self, transaction=True): return FakePipeline(self)
    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.values: return False
        self.values[key] = value
        if ex: self.expiries[key] = int(ex)
        return True
    def get(self, key): return self.values.get(key)
    def setex(self, key, ttl, value): self.values[key] = value; self.expiries[key] = ttl; return True
    def delete(self, *keys):
        removed = 0
        for key in keys:
            removed += int(any(key in values for values in (self.values, self.hashes, self.streams, self.lists, self.zsets)))
            for values in (self.values, self.hashes, self.streams, self.lists, self.zsets, self.expiries): values.pop(key, None)
        return removed
    def expire(self, key, ttl): self.expiries[key] = int(ttl); return True
    def ttl(self, key): return self.expiries.get(key, -1)
    def exists(self, key): return int(any(key in values for values in (self.values, self.hashes, self.streams)))
    def scan_iter(self, match="*", count=200):
        keys = set().union(self.values, self.hashes, self.streams, self.lists, self.zsets)
        return iter(sorted(key for key in keys if fnmatch.fnmatch(key, match)))
    def hset(self, key, field, value): self.hashes.setdefault(key, {})[field] = value; return 1
    def hsetnx(self, key, field, value):
        if field in self.hashes.setdefault(key, {}): return 0
        self.hashes[key][field] = value; return 1
    def hget(self, key, field): return self.hashes.get(key, {}).get(field)
    def hgetall(self, key): return dict(self.hashes.get(key, {}))
    def hdel(self, key, *fields): return sum(int(self.hashes.setdefault(key, {}).pop(field, None) is not None) for field in fields)
    def xlen(self, key): return len(self.streams.get(key, []))
    def xrange(self, key, count=None): return self.streams.get(key, [])[:count]
    def xtrim(self, key, maxlen, approximate=False):
        old = self.streams.get(key, []); removed = max(0, len(old) - maxlen)
        self.streams[key] = old[-maxlen:]; return removed
    def lpush(self, key, value): self.lists.setdefault(key, []).insert(0, value); return 1
    def rpop(self, key):
        values = self.lists.setdefault(key, []); return values.pop() if values else None
    def llen(self, key): return len(self.lists.get(key, []))
    def ltrim(self, key, start, stop): self.lists[key] = self.lists.get(key, [])[start:stop + 1]; return True
    def zadd(self, key, mapping): self.zsets.setdefault(key, {}).update(mapping); return len(mapping)
    def zcount(self, key, minimum, maximum):
        return sum(float(minimum) <= score <= float(maximum) for score in self.zsets.get(key, {}).values())
    def zremrangebyscore(self, key, minimum, maximum):
        doomed = [value for value, score in self.zsets.get(key, {}).items() if float(minimum) <= score <= float(maximum)]
        for value in doomed: self.zsets[key].pop(value); return len(doomed)
    def zrangebyscore(self, key, minimum, maximum, start=0, num=None):
        values = [value for value, score in self.zsets.get(key, {}).items() if float(minimum) <= score <= float(maximum)]
        return values[start:start + num if num is not None else None]
    def zrem(self, key, value): return int(self.zsets.setdefault(key, {}).pop(value, None) is not None)


class FakeCore:
    def __init__(self, fail=False): self.fail = fail; self.deleted = []; self.expired = []
    def expire_episodes(self, now): self.expired.append(now); return 3
    def delete_owned_episodes(self, tenant, user, session):
        if self.fail: raise RuntimeError("qdrant unavailable")
        self.deleted.append((tenant, user, session)); return 2


def build_janitor(tmp_path, *, core=None):
    ledger, state, graph = FakeRedis(), FakeRedis(), FakeRedis()
    result = Janitor(
        lock_redis=graph, ledger_redis=ledger, state_redis=state, graph_redis=graph,
        graph_client=GraphMemoryClient(graph, enabled=True), core_service=core or FakeCore(),
        artifact_dirs=(str(tmp_path / "content"),), conversation_dir=str(tmp_path / "conversations"),
    )
    return result, ledger, state, graph


def add_turns(redis, session, count, ttl):
    root = f"elixpo:session-ledger:v1:{{{session}}}"
    key = f"{root}:turns"
    redis.streams[key] = [(f"{index}-0", {"seq": str(index), "payload": f"turn-{index}"}) for index in range(count)]
    redis.expiries[key] = ttl
    return root, key


def test_active_session_is_never_compacted_and_inactive_session_keeps_audit(monkeypatch, tmp_path):
    monkeypatch.setattr(janitor_module, "SESSION_LEDGER_TTL_SECONDS", 100)
    monkeypatch.setattr(janitor_module, "JANITOR_INACTIVE_SECONDS", 10)
    monkeypatch.setattr(janitor_module, "JANITOR_TRANSCRIPT_MAX_TURNS", 3)
    janitor, ledger, _, _ = build_janitor(tmp_path)
    active_root, active = add_turns(ledger, "active", 6, 20)
    ledger.values[f"{active_root}:lock"] = "owned"
    inactive_root, inactive = add_turns(ledger, "inactive", 6, 20)
    ledger.hashes[f"{inactive_root}:state"] = {
        "active_task": json.dumps({"status": "completed"}),
    }

    report = janitor.run(now=1000)

    assert len(ledger.streams[active]) == 6
    assert len(ledger.streams[inactive]) == 3
    assert report.turns_trimmed == 3
    assert report.completed_states_removed == 1
    assert "active_task" not in ledger.hashes[f"{inactive_root}:state"]
    audit = "elixpo:session-ledger:v1:{inactive}:compaction-audit"
    assert set(ledger.hashes[audit]) == {"0", "1", "2"}


def test_dry_run_reports_without_mutating(tmp_path, monkeypatch):
    monkeypatch.setattr(janitor_module, "SESSION_LEDGER_TTL_SECONDS", 100)
    monkeypatch.setattr(janitor_module, "JANITOR_INACTIVE_SECONDS", 10)
    monkeypatch.setattr(janitor_module, "JANITOR_TRANSCRIPT_MAX_TURNS", 3)
    janitor, ledger, _, graph = build_janitor(tmp_path)
    _, key = add_turns(ledger, "dry", 6, 20)
    report = janitor.run(dry_run=True, now=1000)
    assert report.turns_trimmed == 3
    assert len(ledger.streams[key]) == 6
    assert "oreolook:graph:v1:writes" not in graph.lists


def test_session_cascade_removes_every_retrievable_tier(tmp_path):
    core = FakeCore()
    janitor, ledger, state, graph = build_janitor(tmp_path, core=core)
    scope = MemoryScope("tenant-a", "user-a", "search:conv-a")
    client = janitor.graph
    client.set_cached(scope, [{"fact_id": "fact-a"}])
    root, _ = add_turns(ledger, "conv-a", 2, 50)
    state.values["elixpo:agent:user-a:conversation:conv-a"] = json.dumps({"id": "conv-a"})
    content = tmp_path / "content"; content.mkdir()
    (content / "report.pdf").write_bytes(b"pdf")
    (content / "report.artifact.json").write_text(json.dumps({
        "tenant_id": "tenant-a", "user_id": "user-a", "session_id": "search:conv-a",
    }))
    request = DeletionRequest.create(
        "tenant-a", "user-a", session_id="search:conv-a", raw_session_id="conv-a",
    )

    report = janitor.delete_now(request)

    assert core.deleted == [("tenant-a", "user-a", "search:conv-a")]
    assert not any(key.startswith(root) for key in ledger.streams)
    assert state.values == {}
    assert not (content / "report.pdf").exists()
    assert report.artifacts_removed == 2
    queued = json.loads(graph.lists["oreolook:graph:v1:writes"][0])
    assert queued["revoke_owner"]["session_id"] == "search:conv-a"
    assert client.get_cached(scope) == []


def test_partial_failure_retries_then_dead_letters(monkeypatch, tmp_path):
    monkeypatch.setattr(janitor_module, "GRAPH_MEMORY_RETRY_LIMIT", 2)
    janitor, _, _, graph = build_janitor(tmp_path, core=FakeCore(fail=True))
    request = DeletionRequest.create("tenant-a", "user-a", now=100)
    janitor.request_deletion(request)
    first = janitor.run(now=100)
    assert first.deletions_retried == 1
    payload = next(iter(graph.zsets[janitor_module.DELETION_RETRIES]))
    graph.zsets[janitor_module.DELETION_RETRIES][payload] = 101
    second = janitor.run(now=101)
    assert second.deletions_dead_lettered == 1
    assert len(graph.lists[janitor_module.DELETION_DEAD]) == 1


def test_expired_and_revoked_graph_facts_are_not_retrievable_and_are_purged(tmp_path):
    async def scenario():
        backend = SQLiteTemporalGraphBackend(str(tmp_path / "janitor.db"))
        scope = MemoryScope("tenant-a", "user-a", "session-a")
        expired = ApprovedGraphFact.create(
            scope=scope, subject="old", predicate="is", object="expired",
            source_turn="1", confidence=.9, approval_fingerprint="approved",
            event_time="2026-01-01T00:00:00Z", expires_at=100,
        )
        current = ApprovedGraphFact.create(
            scope=scope, subject="new", predicate="is", object="current",
            source_turn="2", confidence=.9, approval_fingerprint="approved",
            event_time="2026-01-01T00:00:00Z", expires_at=2_000_000_000,
        )
        await backend.upsert(expired); await backend.upsert(current)
        assert [fact.object for fact in await backend.query(scope, at_time="2026-02-01T00:00:00Z")] == ["current"]
        await backend.revoke_owner("tenant-a", "user-a", event_time="2026-03-01T00:00:00Z")
        assert await backend.query(scope, at_time="2026-04-01T00:00:00Z") == []
        removed = await backend.cleanup(now=200, revoked_before="2026-04-01T00:00:00Z")
        assert removed == 2
        await backend.close()
    asyncio.run(scenario())
