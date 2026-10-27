from concurrent.futures import ThreadPoolExecutor
import json
import threading

from sessions.ledger import LedgerSessionContext, RedisSessionLedger, sanitize_ledger_content


class FakePipeline:
    def __init__(self, redis):
        self.redis = redis
        self.commands = []

    def __getattr__(self, name):
        def queue(*args, **kwargs):
            self.commands.append((name, args, kwargs))
            return self
        return queue

    def execute(self):
        self.redis.pipeline_executes += 1
        return [getattr(self.redis, name)(*args, **kwargs) for name, args, kwargs in self.commands]


class FakeRedis:
    """Small synchronized Redis double exercising the ledger protocol itself."""

    def __init__(self):
        self.values = {}
        self.hashes = {}
        self.streams = {}
        self.expiries = {}
        self.pipeline_executes = 0
        self._stream_id = 0
        self._guard = threading.Lock()

    def register_script(self, script):
        if "XADD" in script:
            def append(*, keys, args):
                with self._guard:
                    turns, sequence, idempotency, state = keys
                    operation_id, payload, ttl = args
                    known = self.hashes.setdefault(idempotency, {}).get(operation_id)
                    if known is not None:
                        for key in keys:
                            self.expire(key, ttl)
                        return [int(known), 0]
                    seq = int(self.values.get(sequence, 0)) + 1
                    self.values[sequence] = seq
                    self._stream_id += 1
                    self.streams.setdefault(turns, []).append(
                        (f"{self._stream_id}-0", {"seq": str(seq), "payload": payload})
                    )
                    self.hashes[idempotency][operation_id] = str(seq)
                    for key in keys:
                        self.expire(key, ttl)
                    return [seq, 1]
            return append

        def release(*, keys, args):
            with self._guard:
                if self.values.get(keys[0]) == args[0]:
                    self.values.pop(keys[0], None)
                    return 1
                return 0
        return release

    def pipeline(self, transaction=False):
        return FakePipeline(self)

    def xrevrange(self, key, count):
        return list(reversed(self.streams.get(key, [])))[:count]

    def hgetall(self, key):
        return dict(self.hashes.get(key, {}))

    def hset(self, key, field, value):
        self.hashes.setdefault(key, {})[field] = value
        return 1

    def hdel(self, key, field):
        return int(self.hashes.setdefault(key, {}).pop(field, None) is not None)

    def expire(self, key, ttl):
        self.expiries[key] = int(ttl)
        return 1

    def set(self, key, value, nx=False, ex=None):
        with self._guard:
            if nx and key in self.values:
                return False
            self.values[key] = value
            if ex:
                self.expiries[key] = int(ex)
            return True

    def delete(self, *keys):
        removed = 0
        for key in keys:
            removed += int(key in self.values or key in self.hashes or key in self.streams)
            self.values.pop(key, None)
            self.hashes.pop(key, None)
            self.streams.pop(key, None)
            self.expiries.pop(key, None)
        return removed


def make_ledger(redis, session="conv_test"):
    return RedisSessionLedger(
        session,
        redis_client=redis,
        ttl_seconds=60,
        window_size=20,
        lock_wait_seconds=0,
    )


def test_turns_are_monotonic_and_visible_across_replicas():
    redis = FakeRedis()
    replica_a = make_ledger(redis)
    replica_b = make_ledger(redis)

    assert replica_a.append_turn("user", "one", request_id="r1:user") == 1
    assert replica_b.append_turn("assistant", "two", request_id="r1:assistant") == 2
    assert replica_a.append_turn("user", "three", request_id="r2:user") == 3

    snapshot = replica_b.load_snapshot()
    assert [message["sequence"] for message in snapshot.messages] == [1, 2, 3]
    assert [message["content"] for message in snapshot.messages] == ["one", "two", "three"]
    assert snapshot.last_sequence == 3


def test_concurrent_replica_appends_have_no_duplicate_sequences():
    redis = FakeRedis()
    replicas = [make_ledger(redis) for _ in range(4)]

    def append(index):
        return replicas[index % len(replicas)].append_turn(
            "user", f"turn-{index}", request_id=f"request-{index}:user"
        )

    with ThreadPoolExecutor(max_workers=8) as pool:
        sequences = list(pool.map(append, range(40)))

    assert sorted(sequences) == list(range(1, 41))
    assert len(make_ledger(redis).load_snapshot(limit=40).messages) == 40


def test_retry_is_idempotent_and_does_not_allocate_a_new_sequence():
    redis = FakeRedis()
    ledger = make_ledger(redis)

    first = ledger.append_turn("user", "original", request_id="same-request:user")
    retry = ledger.append_turn("user", "retry body", request_id="same-request:user")

    assert retry == first == 1
    assert [item["content"] for item in ledger.load_snapshot().messages] == ["original"]


def test_snapshot_batches_history_state_and_ttl_refresh():
    redis = FakeRedis()
    ledger = make_ledger(redis)
    ledger.append_turn("user", "Make a report", request_id="r:user")
    ledger.set_task_state(
        active_task={"kind": "pdf", "topic": "weather"},
        pending_clarification={"field": "location"},
    )
    before = redis.pipeline_executes

    snapshot = ledger.load_snapshot()

    assert redis.pipeline_executes == before + 1
    assert snapshot.active_task == {"kind": "pdf", "topic": "weather"}
    assert snapshot.pending_clarification == {"field": "location"}
    assert all(redis.expiries[key] == 60 for key in (
        ledger.turns_key, ledger.sequence_key, ledger.idempotency_key, ledger.state_key
    ))


def test_lock_is_owned_and_clear_removes_every_session_key():
    redis = FakeRedis()
    replica_a = make_ledger(redis)
    replica_b = make_ledger(redis)
    token = replica_a.acquire_lock()

    assert token
    assert replica_b.acquire_lock() is None
    assert replica_b.release_lock("not-the-owner") is False
    assert replica_a.release_lock(token) is True
    assert replica_b.acquire_lock()

    replica_a.append_turn("user", "hello", request_id="r:user")
    assert replica_a.clear() is True
    assert not any(key.startswith("elixpo:session-ledger:v1:{conv_test}") for key in (
        list(redis.values) + list(redis.hashes) + list(redis.streams)
    ))


def test_context_compatibility_and_internal_text_sanitization():
    redis = FakeRedis()
    context = LedgerSessionContext(
        "conv_compat", redis_client=redis, ttl_seconds=60, lock_wait_seconds=0
    )
    context.add_message(
        "assistant",
        "<thinking>secret plan</thinking><TASK>Searching</TASK>Hello!",
        metadata={"request_id": "r:assistant", "sources": ["https://example.com"]},
    )

    message = context.get_context()[0]
    assert message["role"] == "assistant"
    assert message["content"] == "Hello!"
    assert message["metadata"]["sources"] == ["https://example.com"]
    assert sanitize_ledger_content("<invoke>x</invoke>Visible") == "Visible"


def test_invalid_roles_never_enter_the_authoritative_history():
    ledger = make_ledger(FakeRedis())
    try:
        ledger.append_turn("tool", json.dumps({"secret": "raw tool payload"}))
    except ValueError as exc:
        assert "role" in str(exc)
    else:
        raise AssertionError("tool role should have been rejected")
