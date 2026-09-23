"""Live Redis checks for issue #47.

Run explicitly with ``RUN_REDIS_INTEGRATION=1``.  The default unit suite does
not require infrastructure.
"""

import os
import time
import uuid

import pytest

from pipeline.config import SESSION_LEDGER_REDIS_DB, create_redis_client
from sessions.ledger import RedisSessionLedger


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_REDIS_INTEGRATION") != "1",
    reason="set RUN_REDIS_INTEGRATION=1 to exercise the shared Redis service",
)


def test_two_replicas_share_order_retries_and_expiration():
    redis = create_redis_client(db=SESSION_LEDGER_REDIS_DB, decode_responses=True)
    session_id = f"integration-{uuid.uuid4().hex}"
    replica_a = RedisSessionLedger(session_id, redis_client=redis, ttl_seconds=1)
    replica_b = RedisSessionLedger(session_id, redis_client=redis, ttl_seconds=1)
    try:
        first = replica_a.append_turn("user", "hello", request_id="request:user")
        retry = replica_b.append_turn("user", "ignored retry", request_id="request:user")
        second = replica_b.append_turn("assistant", "hi", request_id="request:assistant")

        assert (first, retry, second) == (1, 1, 2)
        assert [turn["content"] for turn in replica_a.load_snapshot().messages] == ["hello", "hi"]

        time.sleep(1.1)
        assert replica_b.load_snapshot().messages == []
    finally:
        replica_a.clear()
