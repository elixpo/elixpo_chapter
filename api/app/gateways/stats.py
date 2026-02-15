"""Stats gateway."""
import logging
import uuid
from datetime import datetime
from quart import request, jsonify
from sessions.main import get_session_manager
from pipeline.config import X_REQ_ID_SLICE_SIZE

logger = logging.getLogger("lixsearch-api")


async def get_stats():
    """Get application statistics."""
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:X_REQ_ID_SLICE_SIZE])

    try:
        logger.info(f"[{request_id}] Getting stats")
        session_manager = get_session_manager()
        stats = session_manager.get_stats()

        return jsonify({
            "timestamp": datetime.utcnow().isoformat(),
            "sessions": stats,
            "request_id": request_id
        })

    except Exception as e:
        logger.error(f"[{request_id}] Stats error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
