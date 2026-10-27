import logging
from datetime import datetime
from quart import jsonify

logger = logging.getLogger("lixsearch-api")


async def health_check(pipeline_initialized: bool):
    core_status = "unknown"
    backend = "unknown"
    try:
        from ipcService.coreServiceManager import CoreServiceManager

        manager = CoreServiceManager.get_instance()
        backend = manager.get_backend_name()
        core_status = "connected" if manager.is_ready() else "disconnected"
    except Exception:
        core_status = "error"

    status = "healthy"
    if not pipeline_initialized:
        status = "unhealthy"
    elif core_status != "connected":
        status = "degraded"

    return jsonify({
        "initialized": pipeline_initialized,
        "status": status,
        "core_backend": backend,
        "core_service": core_status,
        "ipc_connection": core_status if backend == "ipc" else "not_used",
        "timestamp": datetime.utcnow().isoformat(),
    })
