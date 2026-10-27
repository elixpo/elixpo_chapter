from agentRuntime.global_memory import GlobalMemoryStore


class FakePipeline:
    def __init__(self, redis): self.redis = redis; self.calls = []
    def zadd(self, *args): self.calls.append(("zadd", args)); return self
    def zrem(self, *args): self.calls.append(("zrem", args)); return self
    def execute(self):
        result = [getattr(self.redis, name)(*args) for name, args in self.calls]
        self.calls.clear()
        return result


class FakeRedis:
    def __init__(self): self.zsets = {}; self.reads = 0
    def zadd(self, key, mapping): self.zsets.setdefault(key, {}).update(mapping); return len(mapping)
    def zrem(self, key, member): return int(self.zsets.setdefault(key, {}).pop(member, None) is not None)
    def zrevrangebyscore(self, key, maximum, minimum, start=0, num=None):
        self.reads += 1
        values = [m for m, score in self.zsets.get(key, {}).items() if score >= float(minimum)]
        values.sort(key=lambda m: self.zsets[key][m], reverse=True)
        return values[start:start + num if num is not None else None]
    def zrange(self, key, start, stop): return list(self.zsets.get(key, {}))
    def zremrangebyscore(self, key, minimum, maximum):
        doomed = [m for m, score in self.zsets.get(key, {}).items() if score <= float(maximum)]
        for member in doomed: self.zsets[key].pop(member)
        return len(doomed)
    def zcard(self, key): return len(self.zsets.get(key, {}))
    def pipeline(self, transaction=True): return FakePipeline(self)
    def ping(self): return True


def test_doctor_gated_promotion_and_single_lookup():
    redis = FakeRedis(); store = GlobalMemoryStore(redis); now = 1_000
    candidate = store.propose(text="OreoLook has a verified launch fact.", source="release", creator="Ayushman", confidence=.95, now=now)
    try:
        store.promote(candidate, approved_by="doctor", approved_at=now + 1, approval_fingerprint="bad", now=now + 1)
        raise AssertionError("bad approval accepted")
    except PermissionError:
        pass
    fingerprint = store.doctor_fingerprint(candidate, approved_by="doctor", approved_at=now + 1)
    revelation = store.promote(candidate, approved_by="doctor", approved_at=now + 1, approval_fingerprint=fingerprint, now=now + 1)
    context = store.get_context(now=now + 2)
    assert revelation.approval_fingerprint == fingerprint
    assert "verified launch fact" in context
    assert redis.reads == 1


def test_janitor_expiry_and_revoke():
    redis = FakeRedis(); store = GlobalMemoryStore(redis); now = 2_000
    candidate = store.propose(text="Temporary fact", source="test", creator="tester", confidence=.8, now=now)
    fingerprint = store.doctor_fingerprint(candidate, approved_by="doctor", approved_at=now)
    revelation = store.promote(candidate, approved_by="doctor", approved_at=now, approval_fingerprint=fingerprint, now=now)
    assert store.revoke(revelation.id) == 1
    expired = store.propose(text="Expires", source="test", creator="tester", confidence=.8, now=now)
    removed = store.janitor_cleanup(now=expired.expires_at + 1)
    assert removed["candidates"] == 1
