import re
from loguru import logger
from .main import _init_ipc_manager
import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed
from searching.fetch_full_text import fetch_full_text
from pipeline.config import LOG_MESSAGE_QUERY_TRUNCATE, ERROR_MESSAGE_TRUNCATE, ERROR_CONTEXT_TRUNCATE


async def webSearch(query: str):
    initialized = _init_ipc_manager()

    if not initialized:
        logger.warning("[Utility] IPC initialization failed - web search unavailable")
        return []

    from ipcService.coreServiceManager import CoreServiceManager, RECONNECT_ERRORS
    manager = CoreServiceManager.get_instance()

    try:
        loop = asyncio.get_event_loop()
        urls = await loop.run_in_executor(
            None,
            lambda: manager.call("agents", "web_search", query)
        )
        logger.debug(f"[Utility] Web search returned {len(urls) if urls else 0} results for: {query[:LOG_MESSAGE_QUERY_TRUNCATE]}")
        return urls if urls else []
    except RECONNECT_ERRORS as e:
        manager.invalidate(f"web_search: {type(e).__name__}")
        logger.error(f"[Utility] Web search IPC dropped: {type(e).__name__}: {str(e)[:ERROR_CONTEXT_TRUNCATE]}")
        return []
    except Exception as e:
        logger.error(f"[Utility] Web search failed: {type(e).__name__}: {str(e)[:ERROR_CONTEXT_TRUNCATE]}")
        return []


async def imageSearch(query: str, max_images: int = 10) -> list:
    initialized = _init_ipc_manager()

    if not initialized:
        logger.warning("[Utility] IPC initialization failed - image search unavailable")
        return []

    from ipcService.coreServiceManager import CoreServiceManager, RECONNECT_ERRORS
    manager = CoreServiceManager.get_instance()

    try:
        loop = asyncio.get_event_loop()
        urls = await loop.run_in_executor(
            None,
            lambda: manager.call("agents", "image_search", query, max_images=max_images)
        )
        logger.debug(f"[Utility] Image search returned {len(urls) if urls else 0} results for: {query[:LOG_MESSAGE_QUERY_TRUNCATE]}")
        return urls if urls else []
    except RECONNECT_ERRORS as e:
        manager.invalidate(f"image_search: {type(e).__name__}")
        logger.error(f"[Utility] Image search IPC dropped: {type(e).__name__}: {str(e)[:ERROR_CONTEXT_TRUNCATE]}")
        return []
    except Exception as e:
        logger.error(f"[Utility] Image search failed: {type(e).__name__}: {str(e)[:ERROR_CONTEXT_TRUNCATE]}")
        return []

def preprocess_text(text):
    text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
    text = re.sub(r'[^\w\s.,!?;:]', ' ', text)
    sentences = re.split(r'(?<=[.!?])\s+', text)
    
    meaningful_sentences = []
    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) > 20 and len(sentence.split()) > 3:
            if not any(word in sentence.lower() for word in ['feedback', 'menu', 'navigation', 'click', 'download']):
                meaningful_sentences.append(sentence)
    
    return meaningful_sentences


def _fetch_single_url(url: str, request_id: str = None) -> str:
    try:
        text_content = fetch_full_text(url, request_id=request_id)
        clean_text = str(text_content).encode('unicode_escape').decode('utf-8')
        clean_text = clean_text.replace('\\n', ' ').replace('\\r', ' ').replace('\\t', ' ')
        clean_text = ''.join(c for c in clean_text if c.isprintable())
        logger.debug(f"[Utility] Fetched {len(clean_text)} chars from {url}")
        return f"URL: {url}\n{clean_text.strip()}"
    except Exception as e:
        logger.error(f"[Utility] Failed fetching {url}: {e}")
        return ""


def fetch_url_content_parallel(queries, urls, max_workers=10, request_id: str = None) -> str:
    if not urls:
        return ""
    effective_workers = min(max_workers, len(urls))
    results = []
    with ThreadPoolExecutor(max_workers=effective_workers) as executor:
        future_to_url = {
            executor.submit(_fetch_single_url, url, request_id): url
            for url in urls
        }
        for future in as_completed(future_to_url):
            result = future.result()
            if result:
                results.append(result)

    combined_text = "\n".join(results)
    logger.info(f"[Utility] Fetched {len(urls)} URLs in parallel ({effective_workers} workers), total: {len(combined_text)} chars")
    return combined_text
