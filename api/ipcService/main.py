import warnings
import os
import logging
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from multiprocessing.managers import BaseManager
from loguru import logger
from ipcService.coreEmbeddingService import CoreEmbeddingService
from ipcService.searchPortManager import accessSearchAgents, _ensure_background_loop, run_async_on_bg_loop, agent_pool, shutdown_graceful

warnings.filterwarnings('ignore', message='Can\'t initialize NVML')
os.environ['CHROMA_TELEMETRY_DISABLED'] = '1'
logging.getLogger('chromadb').setLevel(logging.ERROR)

if __name__ == "__main__":
    class ModelManager(BaseManager):
        pass

    ModelManager.register("CoreEmbeddingService", CoreEmbeddingService)
    ModelManager.register("accessSearchAgents", accessSearchAgents)
    core_service = CoreEmbeddingService()
    search_agents = accessSearchAgents()
    manager = ModelManager(address=("localhost", 5010), authkey=b"ipcService")
    server = manager.get_server()
    logger.info("[MAIN] Core service started on port 5010...")
    logger.info(f"[MAIN] Vector store stats: {core_service.get_vector_store_stats()}")

    try:
        _ensure_background_loop()
        run_async_on_bg_loop(agent_pool.initialize_pool())
    except Exception as e:
        logger.error(f"[MAIN] Failed to initialize agent pool: {e}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("[MAIN] Shutdown signal received...")
    except Exception as e:
        logger.error(f"[MAIN] Server error: {e}")
    finally:
        shutdown_graceful()
        logger.info("[MAIN] Shutdown complete")
