"""
Model Server Initialization - Hot-loads all models at startup for production use

This module initializes:
1. Embedding models (sentence-transformers)
2. Speech recognition (whisper)
3. Search agents (browser-based)
4. Image search models
5. Text processing pipelines

Called once at server startup to ensure all models are pre-loaded in memory.
"""

import torch
import asyncio
import threading
from loguru import logger
from typing import Optional

from model_server import (
    ipcModules,
    SearchAgentPool,
    searchPortManager,
    CacheManager,
)


class ModelServerManager:
    """Manages model server initialization and lifecycle"""
    
    def __init__(self):
        self.ipc_service: Optional[ipcModules] = None
        self.agent_pool: Optional[SearchAgentPool] = None
        self.port_manager: Optional[searchPortManager] = None
        self.cache_manager: Optional[CacheManager] = None
        self.initialized = False
        self.bg_loop: Optional[asyncio.AbstractEventLoop] = None
        self.bg_thread: Optional[threading.Thread] = None
        logger.info("[ModelServer] Manager initialized")
    
    def _ensure_background_loop(self):
        """Ensure background event loop exists"""
        if self.bg_loop is None or not self.bg_loop.is_running():
            self.bg_loop = asyncio.new_event_loop()
            self.bg_thread = threading.Thread(
                target=self.bg_loop.run_forever,
                daemon=True
            )
            self.bg_thread.start()
            logger.info("[ModelServer] Background event loop started")
    
    def _run_on_bg_loop(self, coro):
        """Run async function on background loop"""
        self._ensure_background_loop()
        future = asyncio.run_coroutine_threadsafe(coro, self.bg_loop)
        return future.result(timeout=300)  # 5-minute timeout
    
    async def initialize(self, pool_size: int = 1, max_tabs: int = 20):
        """
        Initialize all models and services
        
        Args:
            pool_size: Number of search agent pools
            max_tabs: Max tabs per agent
        """
        if self.initialized:
            logger.info("[ModelServer] Already initialized")
            return
        
        try:
            logger.info("[ModelServer] Starting initialization...")
            
            # Initialize IPC Service (embeddings, transcription, etc.)
            logger.info("[ModelServer] Loading embedding and transcription models...")
            self.ipc_service = ipcModules()
            logger.info("[ModelServer] IPC Service loaded")
            
            # Initialize Port Manager
            self.port_manager = searchPortManager()
            logger.info("[ModelServer] Port manager initialized")
            
            # Initialize Search Agent Pool
            logger.info("[ModelServer] Initializing search agent pool...")
            self.agent_pool = SearchAgentPool(pool_size=pool_size, max_tabs_per_agent=max_tabs)
            await self.agent_pool.initialize_pool()
            logger.info("[ModelServer] Search agent pool ready")
            
            # Initialize Cache Manager
            self.cache_manager = CacheManager(check_interval_minutes=30)
            self.cache_manager.start()
            logger.info("[ModelServer] Cache manager started")
            
            # Log model information
            device = "GPU (CUDA)" if torch.cuda.is_available() else "CPU"
            logger.info(f"[ModelServer] Running on device: {device}")
            if torch.cuda.is_available():
                logger.info(f"[ModelServer] CUDA Devices: {torch.cuda.device_count()}")
                logger.info(f"[ModelServer] CUDA Current Device: {torch.cuda.current_device()}")
                logger.info(f"[ModelServer] GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB")
            
            self.initialized = True
            logger.info("[ModelServer] All models loaded and ready for production")
        
        except Exception as e:
            logger.error(f"[ModelServer] Initialization failed: {e}", exc_info=True)
            raise
    
    async def shutdown(self):
        """Shutdown all services gracefully"""
        logger.info("[ModelServer] Starting graceful shutdown...")
        
        try:
            if self.cache_manager:
                self.cache_manager.stop()
                logger.info("[ModelServer] Cache manager stopped")
            
            if self.agent_pool:
                # Close all agents
                for agent in self.agent_pool.text_agents:
                    try:
                        await agent.close()
                    except Exception as e:
                        logger.warning(f"[ModelServer] Error closing text agent: {e}")
                
                for agent in self.agent_pool.image_agents:
                    try:
                        await agent.close()
                    except Exception as e:
                        logger.warning(f"[ModelServer] Error closing image agent: {e}")
                
                logger.info("[ModelServer] Agent pool closed")
            
            self.initialized = False
            logger.info("[ModelServer] Shutdown complete")
        
        except Exception as e:
            logger.error(f"[ModelServer] Shutdown error: {e}", exc_info=True)
    
    def get_ipc_service(self) -> Optional[ipcModules]:
        """Get IPC service (embeddings, transcription)"""
        if not self.initialized:
            raise RuntimeError("ModelServer not initialized")
        return self.ipc_service
    
    def get_agent_pool(self) -> Optional[SearchAgentPool]:
        """Get search agent pool"""
        if not self.initialized:
            raise RuntimeError("ModelServer not initialized")
        return self.agent_pool
    
    def get_status(self) -> dict:
        """Get server status and statistics"""
        return {
            "initialized": self.initialized,
            "ipc_service": self.ipc_service is not None,
            "agent_pool": self.agent_pool is not None,
            "cache_manager": self.cache_manager is not None,
            "device": "GPU" if torch.cuda.is_available() else "CPU",
            "available_features": [
                "embeddings",
                "transcription",
                "web_search",
                "image_search",
                "youtube_processing"
            ] if self.initialized else []
        }


# Global model server manager
_model_server_manager: Optional[ModelServerManager] = None


async def initialize_model_server(pool_size: int = 1, max_tabs: int = 20) -> ModelServerManager:
    """Initialize the global model server"""
    global _model_server_manager
    _model_server_manager = ModelServerManager()
    await _model_server_manager.initialize(pool_size=pool_size, max_tabs=max_tabs)
    logger.info("[ModelServer] Global model server manager initialized")
    return _model_server_manager


def get_model_server() -> Optional[ModelServerManager]:
    """Get the global model server manager"""
    global _model_server_manager
    return _model_server_manager


async def shutdown_model_server():
    """Shutdown the global model server"""
    global _model_server_manager
    if _model_server_manager:
        await _model_server_manager.shutdown()
        _model_server_manager = None
        logger.info("[ModelServer] Global model server shut down")
