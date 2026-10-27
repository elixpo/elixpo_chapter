from typing import List
from pipeline.config import  RETRIEVAL_TOP_K
from loguru import logger
from typing import Dict

__all__ = ['fetch_full_text', 'playwright_web_search', 'warmup_playwright', 'ingest_url_to_vector_store', 'retrieve_from_vector_store']


def ingest_url_to_vector_store(url: str) -> Dict:
    try:
        from ipcService.coreServiceManager import get_core_embedding_service
        core_service = get_core_embedding_service()
        ingest_result = core_service.ingest_url(url)
        logger.info(f"[SEARCH] Ingested URL {url} via IPC: {ingest_result}")
        return ingest_result
    except Exception as e:
        logger.error(f"[SEARCH] Failed to ingest URL {url} via IPC: {e}")
        logger.warning("[SEARCH] IPC service unavailable, skipping vector store ingestion")
        return {
            "success": False,
            "url": url,
            "error": str(e)
        }


def retrieve_from_vector_store(query: str, top_k: int = RETRIEVAL_TOP_K) -> List[Dict]:
    try:
        from ipcService.coreServiceManager import get_core_embedding_service
        core_service = get_core_embedding_service()
        results = core_service.retrieve(query, top_k=top_k)
        logger.info(f"[SEARCH] Retrieved {len(results)} results via IPC")
        return results
    except Exception as e:
        logger.error(f"[SEARCH] Failed to retrieve via IPC: {e}")
        logger.warning("[SEARCH] IPC service unavailable, returning empty results")
        return []


def get_vector_store_stats() -> Dict:
    from ipcService.coreServiceManager import get_core_embedding_service
    return get_core_embedding_service().get_vector_store_stats()


def persist_vector_store() -> None:
    from ipcService.coreServiceManager import get_core_embedding_service
    get_core_embedding_service().vector_store.persist_to_disk()

