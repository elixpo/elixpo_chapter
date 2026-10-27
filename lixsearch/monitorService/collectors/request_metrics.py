import json
import asyncio
from loguru import logger


async def collect_request_metrics(redis_host: str, redis_port: int, redis_password: str = None) -> dict:
    """Read latency data from Redis and compute percentiles."""
    try:
        import redis as _redis

        def _blocking_read():
            kwargs = {"host": redis_host, "port": redis_port, "db": 0, "decode_responses": True}
            if redis_password:
                kwargs["password"] = redis_password
            r = _redis.Redis(**kwargs)
            raw = r.lrange("lixsearch:metrics:latency", 0, 999)
            entries = []
            for item in raw:
                try:
                    entries.append(json.loads(item))
                except json.JSONDecodeError:
                    continue
            return entries

        entries = await asyncio.wait_for(
            asyncio.to_thread(_blocking_read),
            timeout=5.0,
        )

        if not entries:
            return {"count": 0, "p50_ms": 0, "p95_ms": 0, "p99_ms": 0}

        totals = sorted(e.get("total_ms", 0) for e in entries)
        count = len(totals)

        return {
            "count": count,
            "p50_ms": round(totals[int(count * 0.5)] if count else 0, 1),
            "p95_ms": round(totals[int(count * 0.95)] if count else 0, 1),
            "p99_ms": round(totals[int(count * 0.99)] if count else 0, 1),
            "avg_ms": round(sum(totals) / count, 1) if count else 0,
            "latest": entries[0] if entries else None,
        }
    except Exception as e:
        logger.warning(f"[Monitor] Request metrics collection failed: {e}")
        return {"error": str(e)}
