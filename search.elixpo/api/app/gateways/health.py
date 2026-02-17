"""Health check gateway."""
import logging
from datetime import datetime
from quart import jsonify

logger = logging.getLogger("lixsearch-api")


async def health_check(pipeline_initialized: bool):
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "initialized": pipeline_initialized
    })
