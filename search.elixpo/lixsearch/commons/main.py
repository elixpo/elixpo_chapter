from loguru import logger
from pipeline.config import ERROR_MESSAGE_TRUNCATE


def _init_ipc_manager(max_retries: int = 3, retry_delay: float = 1.0) -> bool:
    # Always defer to CoreServiceManager — it owns connection state and knows when
    # its proxies have been invalidated. Caching readiness here would mask reconnects.
    try:
        from ipcService.coreServiceManager import CoreServiceManager
        manager = CoreServiceManager.get_instance()
        if manager.is_ready():
            return True
        manager._ensure_ready()
        return manager.is_ready()
    except Exception as e:
        logger.warning(f"[Utility] IPC connection failed: {str(e)[:ERROR_MESSAGE_TRUNCATE]}")
        return False
