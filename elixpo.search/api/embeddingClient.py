from multiprocessing.managers import BaseManager
from loguru import logger
import time
from typing import List, Dict, Tuple
import numpy as np
import faiss

class EmbeddingModelManager(BaseManager): 
    pass

# Register the remote service
EmbeddingModelManager.register("EmbeddingService")

class EmbeddingClient:
    def __init__(self, address=("localhost", 5002), authkey=b"embedding_secret", max_retries=3, retry_delay=1.0):
        self.address = address
        self.authkey = authkey
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self._manager = None
        self._service = None
        self._connect()

    def _connect(self):
        """Establish connection to the embedding server"""
        for attempt in range(self.max_retries):
            try:
                self._manager = EmbeddingModelManager(address=self.address, authkey=self.authkey)
                self._manager.connect()
                self._service = self._manager.EmbeddingService()
                logger.info(f"Connected to embedding server at {self.address}")
                return
            except Exception as e:
                logger.warning(f"Connection attempt {attempt + 1} failed: {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay)
                else:
                    logger.error(f"Failed to connect to embedding server after {self.max_retries} attempts")
                    raise

    def _ensure_connection(self):
        try:
            self._service.get_active_operations_count()
        except Exception:
            logger.warning("Connection lost, attempting to reconnect...")
            self._connect()

    def generate_embeddings(self, texts: List[str], batch_size: int = 32) -> np.ndarray:
        self._ensure_connection()
        try:
            return self._service.generate_embeddings(texts, batch_size)
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            raise

    def build_vector_index(self, docs: List[str], urls: List[str]) -> Tuple[faiss.Index, np.ndarray, List[Dict]]:
        self._ensure_connection()
        try:
            return self._service.build_vector_index(docs, urls)
        except Exception as e:
            logger.error(f"Error building vector index: {e}")
            raise

    def search_index(self, query: str, index: faiss.Index, metadata: List[Dict], top_k: int = 3) -> List[Dict]:
        self._ensure_connection()
        try:
            return self._service.search_index(query, index, metadata, top_k)
        except Exception as e:
            logger.error(f"Error searching index: {e}")
            raise

    def web_search_with_embeddings(self, search_query: str, max_concurrent: int = 5, max_chars: int = 2000) -> tuple[str, list]:
        self._ensure_connection()
        try:
            return self._service.web_search_with_embeddings(search_query, max_concurrent, max_chars)
        except Exception as e:
            logger.error(f"Error in web search with embeddings: {e}")
            raise

    def get_active_operations_count(self) -> int:
        self._ensure_connection()
        try:
            return self._service.get_active_operations_count()
        except Exception as e:
            logger.error(f"Error getting active operations count: {e}")
            return -1

    def close(self):
        if self._manager:
            try:
                self._manager.shutdown()
                logger.info("Disconnected from embedding server")
            except Exception as e:
                logger.warning(f"Error disconnecting from embedding server: {e}")

# Global client instance for reuse across the application
_embedding_client = None

def get_embedding_client() -> EmbeddingClient:
    """Get or create a global embedding client instance"""
    global _embedding_client
    if _embedding_client is None:
        _embedding_client = EmbeddingClient()
    return _embedding_client

def get_embedding_model():
    """Legacy compatibility function - returns the client for use with existing code"""
    return get_embedding_client()

async def fast_web_search_with_embeddings(search_query: str, model_client, max_concurrent: int = 5, max_chars: int = 2000) -> tuple[str, list]:
    try:
        return model_client.web_search_with_embeddings(search_query, max_concurrent, max_chars)
    except Exception as e:
        logger.error(f"Fast web search with embeddings failed for '{search_query}': {e}")
        return f"Search error: {str(e)[:100]}...", []