"""Single-purpose background worker for durable temporal graph writes."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time

from pipeline.config import GRAPH_MEMORY_RETRY_LIMIT, create_redis_client
from sessions.episodic_memory import MemoryScope
from .backends import GraphitiFalkorBackend, SQLiteTemporalGraphBackend
from .client import GraphMemoryClient
from .models import ApprovedGraphFact

logger = logging.getLogger("oreolook-graph-worker")
QUEUE = "oreolook:graph:v1:writes"
RETRIES = "oreolook:graph:v1:retries"
DEAD = "oreolook:graph:v1:dead"


class GraphMemoryWorker:
    def __init__(self, backend, redis_client):
        self.backend = backend
        self.redis = redis_client
        self.cache = GraphMemoryClient(redis_client, enabled=True)

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
        claimed = await asyncio.to_thread(self.redis.brpop, QUEUE, timeout)
        if not claimed:
            return False
        raw = claimed[1].decode() if isinstance(claimed[1], bytes) else claimed[1]
        envelope = json.loads(raw)
        try:
            if "fact" in envelope:
                fact = ApprovedGraphFact.from_dict(envelope["fact"])
                await self.backend.upsert(fact)
                facts = await self.backend.query(fact.scope, limit=24)
                self.cache.set_cached(fact.scope, (item.to_dict() for item in facts))
            elif "revoke" in envelope:
                scope = MemoryScope(**envelope["revoke"])
                await self.backend.revoke_scope(scope, event_time=envelope.get("event_time"))
                self.cache.clear_cached(scope)
            else:
                raise ValueError("unknown graph work item")
            return True
        except Exception:
            attempt = int(envelope.get("attempt", 0)) + 1
            envelope["attempt"] = attempt
            payload = json.dumps(envelope, separators=(",", ":"))
            if attempt >= GRAPH_MEMORY_RETRY_LIMIT:
                self.redis.lpush(DEAD, payload)
            else:
                delay = min(300, 2 ** min(attempt, 8))
                self.redis.zadd(RETRIES, {payload: time.time() + delay})
            logger.exception("Graph write failed; queued attempt %s", attempt)
            return False

    async def run_forever(self) -> None:
        while True:
            await self.run_once(timeout=2)


def build_backend():
    backend = os.getenv("GRAPH_MEMORY_BACKEND", "graphiti").strip().lower()
    if backend == "sqlite":
        return SQLiteTemporalGraphBackend(
            os.getenv("GRAPH_MEMORY_SQLITE_PATH", "/app/data/graph/temporal.db")
        )
    if backend != "graphiti":
        raise ValueError(f"unsupported GRAPH_MEMORY_BACKEND: {backend}")
    return GraphitiFalkorBackend(
        host=os.getenv("FALKORDB_HOST", "falkordb"),
        port=int(os.getenv("FALKORDB_PORT", "6379")),
        username=os.getenv("FALKORDB_USERNAME") or None,
        password=os.getenv("FALKORDB_PASSWORD") or None,
        database=os.getenv("FALKORDB_DATABASE", "oreolook_memory"),
    )


async def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    backend = build_backend()
    redis_client = create_redis_client(db=int(os.getenv("GRAPH_MEMORY_REDIS_DB", "5")))
    worker = GraphMemoryWorker(backend, redis_client)
    try:
        await worker.run_forever()
    finally:
        await backend.close()


if __name__ == "__main__":
    asyncio.run(main())
