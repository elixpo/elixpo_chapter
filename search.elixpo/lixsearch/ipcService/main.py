import warnings
import os
import logging
import sys
import socket

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from multiprocessing.managers import BaseManager
from loguru import logger
from ipcService.coreEmbeddingService import CoreEmbeddingService
from ipcService.searchPortManager import accessSearchAgents, _ensure_background_loop, run_async_on_bg_loop, agent_pool, shutdown_graceful
from pipeline.config import IPC_HOST, IPC_PORT, IPC_AUTHKEY

warnings.filterwarnings('ignore', message='Can\'t initialize NVML')


if __name__ == "__main__":
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.close()

    class ModelManager(BaseManager):
        pass

    max_init_retries = 5
    core_service = None
    for attempt in range(1, max_init_retries + 1):
        try:
            core_service = CoreEmbeddingService()
            break
        except Exception as e:
            logger.error(f"[MAIN] CoreEmbeddingService init attempt {attempt}/{max_init_retries} failed: {e}")
            if attempt < max_init_retries:
                import time as _time
                _time.sleep(5)
            else:
                logger.critical("[MAIN] All init attempts failed — starting without core service is not possible")
                raise

    search_agents = accessSearchAgents()

    ModelManager.register("CoreEmbeddingService", callable=lambda: core_service)
    ModelManager.register("accessSearchAgents", callable=lambda: search_agents)

    manager = ModelManager(address=(IPC_HOST, IPC_PORT), authkey=IPC_AUTHKEY)
    server = manager.get_server()
    logger.info(f"[MAIN] Core service started on {IPC_HOST}:{IPC_PORT}...")
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
