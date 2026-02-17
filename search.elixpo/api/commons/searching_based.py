import re
from loguru import logger
from .main import _init_ipc_manager, search_service as get_search_service
import asyncio
from searching.fetch_full_text import fetch_full_text
from pipeline.config import LOG_MESSAGE_QUERY_TRUNCATE, ERROR_MESSAGE_TRUNCATE, ERROR_CONTEXT_TRUNCATE


def webSearch(query: str):
    initialized = _init_ipc_manager()
    
    if not initialized:
        logger.warning("[Utility] IPC initialization failed - web search unavailable")
        return []
    
    # Import here to get the updated search_service from commons.main
    from .main import search_service
    
    if search_service is None:
        logger.error("[Utility] Search service is None despite IPC init success - this indicates a registration issue")
        return []
    
    try:
        logger.debug(f"[Utility] Calling web_search on service {type(search_service).__name__}")
        urls = search_service.web_search(query)
        logger.debug(f"[Utility] Web search returned {len(urls)} results for: {query[:LOG_MESSAGE_QUERY_TRUNCATE]}")
        return urls if urls else []
    except AttributeError as e:
        logger.error(f"[Utility] Search service missing web_search method: {e}")
        return []
    except Exception as e:
        logger.error(f"[Utility] Web search failed: {type(e).__name__}: {str(e)[:ERROR_CONTEXT_TRUNCATE]}")
        return []


async def imageSearch(query: str, max_images: int = 10) -> list:
    initialized = _init_ipc_manager()
    
    if not initialized:
        logger.warning("[Utility] IPC initialization failed - image search unavailable")
        return []
    
    # Import here to get the updated search_service from commons.main
    from .main import search_service
    
    if search_service is None:
        logger.error("[Utility] Search service is None despite IPC init success - this indicates a registration issue")
        return []
    
    try:
        logger.debug(f"[Utility] Calling image_search on service {type(search_service).__name__}")
        loop = asyncio.get_event_loop()
        urls = await loop.run_in_executor(
            None,
            lambda: search_service.image_search(query, max_images=max_images)
        )
        logger.debug(f"[Utility] Image search returned {len(urls) if urls else 0} results for: {query[:LOG_MESSAGE_QUERY_TRUNCATE]}")
        return urls if urls else []
    except AttributeError as e:
        logger.error(f"[Utility] Search service missing image_search method: {e}")
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


def fetch_url_content_parallel(queries, urls, max_workers=10, request_id: str = None) -> str:
    results = []
    for url in urls:
        try:
            text_content = fetch_full_text(url, request_id=request_id)
            
            clean_text = str(text_content).encode('unicode_escape').decode('utf-8')
            clean_text = clean_text.replace('\\n', ' ').replace('\\r', ' ').replace('\\t', ' ')
            clean_text = ''.join(c for c in clean_text if c.isprintable())
            results.append(f"URL: {url}\n{clean_text.strip()}")
            logger.debug(f"[Utility] Fetched {len(clean_text)} chars from {url}")
        except Exception as e:
            logger.error(f"[Utility] Failed fetching {url}: {e}")

    combined_text = "\n".join(results)
    logger.info(f"[Utility] Fetched all URLs in parallel, total: {len(combined_text)} chars")
    
    return combined_text
