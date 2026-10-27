import logging
import uuid
import os
from datetime import datetime
from quart import request, jsonify
from sessions.main import get_session_manager
from pipeline.config import (
    X_REQ_ID_SLICE_SIZE,
    create_redis_client,
    CONVERSATION_ARCHIVE_DIR,
)

logger = logging.getLogger("lixsearch-api")


def _get_redis_memory_stats() -> dict:

    try:
        client = create_redis_client(db=0)
        info = client.info("memory")
        return {
            "used_memory_human": info.get("used_memory_human", "N/A"),
            "used_memory_bytes": info.get("used_memory", 0),
            "maxmemory_human": info.get("maxmemory_human", "N/A"),
            "maxmemory_bytes": info.get("maxmemory", 0),
            "used_memory_rss_human": info.get("used_memory_rss_human", "N/A"),
            "mem_fragmentation_ratio": info.get("mem_fragmentation_ratio", 0),
            "evicted_keys": info.get("evicted_keys", 0),
        }
    except Exception as e:
        logger.debug(f"[Stats] Redis memory stats failed: {e}")
        return {"error": str(e)}


def _get_disk_archive_stats() -> dict:

    try:
        archive_dir = CONVERSATION_ARCHIVE_DIR
        if not os.path.isdir(archive_dir):
            return {"total_files": 0, "total_size_bytes": 0, "total_size_human": "0B"}
        total_size = 0
        total_files = 0
        for f in os.listdir(archive_dir):
            if f.endswith(".huff"):
                total_files += 1
                total_size += os.path.getsize(os.path.join(archive_dir, f))
        size_mb = total_size / (1024 * 1024)
        return {
            "total_files": total_files,
            "total_size_bytes": total_size,
            "total_size_human": f"{size_mb:.1f}MB" if size_mb >= 1 else f"{total_size / 1024:.1f}KB",
        }
    except Exception as e:
        return {"error": str(e)}


async def get_stats():

    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:X_REQ_ID_SLICE_SIZE])

    try:
        session_manager = get_session_manager()
        stats = session_manager.get_stats()

        return jsonify({
            "timestamp": datetime.utcnow().isoformat(),
            "sessions": stats,
            "redis_memory": _get_redis_memory_stats(),
            "disk_archive": _get_disk_archive_stats(),
            "request_id": request_id,
        })

    except Exception as e:
        logger.error(f"[{request_id}] Stats error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
