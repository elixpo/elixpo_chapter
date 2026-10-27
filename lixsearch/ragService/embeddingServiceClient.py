from loguru import logger
from multiprocessing.managers import BaseManager
from typing import Union, List, Optional
import numpy as np
import threading
from pipeline.config import IPC_HOST, IPC_PORT, IPC_AUTHKEY, IPC_TIMEOUT


class ModelServerClient(BaseManager):
    pass


ModelServerClient.register('CoreEmbeddingService')


class EmbeddingServiceClient:
    _instance = None
    _lock = threading.Lock()
    _connection_lock = threading.Lock()
    
    def __init__(self, max_retries: int = 3, timeout: float = IPC_TIMEOUT):
        self.host = IPC_HOST
        self.port = IPC_PORT
        self.authkey = IPC_AUTHKEY
        self.timeout = timeout
        self.max_retries = max_retries
        self.device = "ipc-remote"
        self._core_service = None
        self._manager = None
        self._connect()
    
    @classmethod
    def get_instance(cls, max_retries: int = 3, timeout: float = IPC_TIMEOUT):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = EmbeddingServiceClient(max_retries=max_retries, timeout=timeout)
        return cls._instance
    
    def _connect(self) -> None:
        last_error = None
        
        for attempt in range(self.max_retries):
            try:
                with self._connection_lock:
                    logger.info(
                        f"[EmbeddingServiceClient] Connecting to IPC server "
                        f"{self.host}:{self.port} (attempt {attempt + 1}/{self.max_retries})"
                    )
                    
                    self._manager = ModelServerClient(
                        address=(self.host, self.port),
                        authkey=self.authkey
                    )
                    self._manager.connect()
                    self._core_service = self._manager.CoreEmbeddingService()
                    
                    stats = self._core_service.get_vector_store_stats()
                    logger.info(
                        f"[EmbeddingServiceClient] ✅ Connected to CoreEmbeddingService at "
                        f"{self.host}:{self.port}. Vector store chunks: {stats.get('chunk_count', 0)}"
                    )
                    return
                    
            except Exception as e:
                last_error = e
                logger.warning(
                    f"[EmbeddingServiceClient] Connection attempt {attempt + 1} failed: {e}"
                )
                if attempt < self.max_retries - 1:
                    import time
                    time.sleep(2 ** attempt)
        
        logger.error(
            f"[EmbeddingServiceClient] Failed to connect to IPC service after "
            f"{self.max_retries} attempts. Last error: {last_error}"
        )
        raise RuntimeError(
            f"Cannot connect to CoreEmbeddingService at {self.host}:{self.port}. "
            f"Make sure the IPC service is running."
        ) from last_error
    
    def embed(self, texts: Union[str, List[str]], batch_size: int = 32) -> np.ndarray:
        try:
            with self._connection_lock:
                if isinstance(texts, str):
                    texts = [texts]
                
                logger.debug(f"[EmbeddingServiceClient] Embedding {len(texts)} texts (batch_size={batch_size})")
                
                embeddings = self._core_service.embed_batch(texts, batch_size=batch_size)
                
                if isinstance(embeddings, list):
                    embeddings = np.array(embeddings, dtype=np.float32)
                
                logger.debug(f"[EmbeddingServiceClient] Embeddings shape: {embeddings.shape}")
                return embeddings
                
        except Exception as e:
            logger.error(f"[EmbeddingServiceClient] Embedding failed: {e}")
            raise
    
    def embed_single(self, text: str) -> np.ndarray:
        try:
            with self._connection_lock:
                logger.debug(f"[EmbeddingServiceClient] Embedding single text")
                
                embedding = self._core_service.embed_single_text(text)
                
                if isinstance(embedding, list):
                    embedding = np.array(embedding, dtype=np.float32)
                
                logger.debug(f"[EmbeddingServiceClient] Single embedding shape: {embedding.shape}")
                return embedding
                
        except Exception as e:
            logger.error(f"[EmbeddingServiceClient] Single embedding failed: {e}")
            raise
    
    def get_vector_store_stats(self) -> dict:
        try:
            with self._connection_lock:
                return self._core_service.get_vector_store_stats()
        except Exception as e:
            logger.error(f"[EmbeddingServiceClient] Failed to get vector store stats: {e}")
            return {"error": str(e)}
    
    def get_semantic_cache_stats(self) -> dict:
        try:
            with self._connection_lock:
                return self._core_service.get_semantic_cache_stats()
        except Exception as e:
            logger.error(f"[EmbeddingServiceClient] Failed to get cache stats: {e}")
            return {"error": str(e)}
    
    def health_check(self) -> bool:
        try:
            with self._connection_lock:
                stats = self._core_service.get_vector_store_stats()
                return stats is not None
        except Exception as e:
            logger.warning(f"[EmbeddingServiceClient] Health check failed: {e}")
            return False
    
    def disconnect(self) -> None:
        try:
            if self._manager:
                self._manager.shutdown()
                logger.info("[EmbeddingServiceClient] Disconnected from IPC service")
        except Exception as e:
            logger.warning(f"[EmbeddingServiceClient] Disconnect error: {e}")
