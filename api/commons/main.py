
from loguru import logger
import time
from multiprocessing.managers import BaseManager
from pipeline.config import ERROR_MESSAGE_TRUNCATE

search_service = None
_ipc_ready = False
_ipc_initialized = False

class ModelManager(BaseManager):
    pass

ModelManager.register('CoreEmbeddingService')
ModelManager.register('accessSearchAgents')

def _init_ipc_manager(max_retries: int = 3, retry_delay: float = 1.0):
    """Lazily initialize IPC connection to the model server."""
    global search_service, _ipc_ready, _ipc_initialized
    
    # Avoid re-attempting if already tried
    if _ipc_initialized:
        logger.debug(f"[Utility] IPC already initialized. Status: ready={_ipc_ready}, service={'set' if search_service else 'None'}")
        return _ipc_ready
    
    _ipc_initialized = True
    
    for attempt in range(max_retries):
        try:
            logger.info(f"[Utility] Attempting IPC connection to localhost:5010 (attempt {attempt + 1}/{max_retries})")
            manager = ModelManager(address=("localhost", 5010), authkey=b"ipcService")
            manager.connect()
            logger.info("[Utility] Successfully connected to IPC manager")
            
            search_service = manager.accessSearchAgents()
            logger.info(f"[Utility] Retrieved accessSearchAgents service. Service type: {type(search_service)}")
            
            # Verify service is healthy
            try:
                health = search_service.health_check()
                logger.info(f"[Utility] Service health check passed: {health}")
            except Exception as health_err:
                logger.warning(f"[Utility] Health check failed: {health_err}")
            
            _ipc_ready = True
            logger.info("[Utility] IPC connection established with model_server - READY")
            return True
        except Exception as e:
            if attempt < max_retries - 1:
                logger.warning(f"[Utility] IPC connection failed (attempt {attempt + 1}/{max_retries}): {type(e).__name__}: {str(e)[:ERROR_MESSAGE_TRUNCATE]}")
                time.sleep(retry_delay)
            else:
                logger.warning(f"[Utility] IPC connection failed after {max_retries} attempts. Running in standalone mode")
                logger.debug(f"[Utility] Last error: {e}")
                _ipc_ready = False
                return False
    
    _ipc_ready = False
    return False

