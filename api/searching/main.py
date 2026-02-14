from typing import List
from config import  RETRIEVAL_TOP_K
from loguru import logger
from multiprocessing.managers import BaseManager
from ragService.embeddingService import EmbeddingService
from ragService.vectorStore import VectorStore
from ragService.retrievalPipeline import RetrievalPipeline
from typing import Dict

__all__ = ['fetch_full_text', 'playwright_web_search', 'warmup_playwright', 'ingest_url_to_vector_store', 'retrieve_from_vector_store']

_global_embedding_service = None
_global_vector_store = None
_global_retrieval_pipeline = None


# IPC Client setup for connecting to model_server
class ModelServerClient(BaseManager):
    pass

ModelServerClient.register('CoreEmbeddingService')

_model_server = None

def get_model_server():
    """Lazy connection to the model_server via IPC"""
    global _model_server
    if _model_server is None:
        try:
            _model_server = ModelServerClient(address=("localhost", 5010), authkey=b"ipcService")
            _model_server.connect()
            logger.info("[SEARCH] Connected to model_server via IPC")
        except Exception as e:
            logger.error(f"[SEARCH] Failed to connect to model_server: {e}")
            raise
    return _model_server


def _ensure_retrieval_services():
    global _global_embedding_service, _global_vector_store, _global_retrieval_pipeline
    
    if _global_embedding_service is None:
        try:
            from config import EMBEDDING_MODEL, EMBEDDINGS_DIR
            
            logger.info("[SEARCH] Initializing retrieval services...")
            _global_embedding_service = EmbeddingService(model_name=EMBEDDING_MODEL)
            _global_vector_store = VectorStore(embeddings_dir=EMBEDDINGS_DIR)
            _global_retrieval_pipeline = RetrievalPipeline(
                _global_embedding_service,
                _global_vector_store
            )
            logger.info("[SEARCH] Retrieval services initialized")
        except Exception as e:
            logger.error(f"[SEARCH] Failed to initialize retrieval services: {e}")
            raise


def ingest_url_to_vector_store(url: str) -> Dict:
    try:
        model_server = get_model_server()
        core_service = model_server.CoreEmbeddingService()
        ingest_result = core_service.ingest_url(url)
        logger.info(f"[SEARCH] Ingested URL {url} via IPC: {ingest_result}")
        return ingest_result
    except Exception as e:
        logger.error(f"[SEARCH] Failed to ingest URL {url} via IPC: {e}")
        # Fallback to local services if IPC fails
        try:
            _ensure_retrieval_services()
            chunk_count = _global_retrieval_pipeline.ingest_url(url, max_words=3000)
            return {
                "success": True,
                "url": url,
                "chunks_ingested": chunk_count
            }
        except Exception as fallback_e:
            logger.error(f"[SEARCH] Fallback ingest also failed: {fallback_e}")
            return {
                "success": False,
                "url": url,
                "error": str(e)
            }


def retrieve_from_vector_store(query: str, top_k: int = RETRIEVAL_TOP_K) -> List[Dict]:
    try:
        model_server = get_model_server()
        core_service = model_server.CoreEmbeddingService()
        results = core_service.retrieve(query, top_k=top_k)
        logger.info(f"[SEARCH] Retrieved {len(results)} results via IPC")
        return results
    except Exception as e:
        logger.error(f"[SEARCH] Failed to retrieve via IPC: {e}")
        # Fallback to local services if IPC fails
        try:
            _ensure_retrieval_services()
            return _global_retrieval_pipeline.retrieve(query, top_k=top_k)
        except Exception as fallback_e:
            logger.error(f"[SEARCH] Fallback retrieve also failed: {fallback_e}")
            return []


def get_vector_store_stats() -> Dict:
    _ensure_retrieval_services()
    return _global_vector_store.get_stats()


def persist_vector_store() -> None:
    _ensure_retrieval_services()
    _global_vector_store.persist_to_disk()

