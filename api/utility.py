from collections import deque
from loguru import logger
from multiprocessing.managers import BaseManager
from search import fetch_full_text
import concurrent.futures
import asyncio
import re
from urllib.parse import urlparse, parse_qs
from typing import Dict, List, Tuple, Optional
import numpy as np
import time


_deepsearch_store = {}

class modelManager(BaseManager): 
    pass

modelManager.register("accessSearchAgents")

search_service = None
_ipc_ready = False
_ipc_initialized = False

def _init_ipc_manager(max_retries: int = 3, retry_delay: float = 1.0):
    """Lazily initialize IPC connection to the model server."""
    global search_service, _ipc_ready, _ipc_initialized
    
    # Avoid re-attempting if already tried
    if _ipc_initialized:
        return _ipc_ready
    
    _ipc_initialized = True
    
    for attempt in range(max_retries):
        try:
            manager = modelManager(address=("localhost", 5010), authkey=b"ipcService")
            manager.connect()
            search_service = manager.accessSearchAgents()
            _ipc_ready = True
            logger.info("[Utility] IPC connection established with model_server")
            return True
        except Exception as e:
            if attempt < max_retries - 1:
                logger.warning(f"[Utility] IPC connection failed (attempt {attempt + 1}/{max_retries}): {e}")
                time.sleep(retry_delay)
            else:
                logger.debug(f"[Utility] IPC server not available - running in standalone mode")
                _ipc_ready = False
                return False
    
    _ipc_ready = False
    return False


def cleanQuery(query):
    logger.debug("[Utility] Cleaning user query")
    urls = re.findall(r'(https?://[^\s]+)', query)
    cleaned_query = query
    website_urls = []
    youtube_urls = []

    for url in urls:
        cleaned_query = cleaned_query.replace(url, '').strip()
        url_cleaned = url.rstrip('.,;!?"\'')

        parsed_url = urlparse(url_cleaned)
        if "youtube.com" in parsed_url.netloc or "youtu.be" in parsed_url.netloc:
            youtube_urls.append(url_cleaned)
        elif parsed_url.scheme in ['http', 'https']:
            website_urls.append(url_cleaned)
        cleaned_query = re.sub(r'\s+', ' ', cleaned_query).strip()

    return website_urls, youtube_urls, cleaned_query


def webSearch(query: str):
    """Synchronous web search"""
    if not _init_ipc_manager() or search_service is None:
        logger.warning("[Utility] IPC service not available for web search")
        return []
    try:
        urls = search_service.web_search(query)
        return urls
    except Exception as e:
        logger.error(f"[Utility] Web search failed: {e}")
        return []


async def imageSearch(query: str, max_images: int = 10) -> list:
    """
    Asynchronous image search wrapper using asyncio.to_thread for non-blocking execution.
    
    Args:
        query: Search query for images
        max_images: Maximum number of images to return
        
    Returns:
        List of image URLs
    """
    if not _init_ipc_manager() or search_service is None:
        logger.warning("[Utility] IPC service not available for image search")
        return []
    try:
        # Run synchronous IPC call in thread to avoid blocking event loop
        loop = asyncio.get_event_loop()
        urls = await loop.run_in_executor(
            None,
            lambda: search_service.image_search(query, max_images=max_images)
        )
        logger.debug(f"[Utility] Image search returned {len(urls)} results for: {query[:50]}")
        return urls
    except Exception as e:
        logger.error(f"[Utility] Image search failed: {e}")
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
    # OPTIMIZATION FIX #12: Removed double-threading
    # Instead of ThreadPoolExecutor inside an asyncio.to_thread(),
    # this is now called directly via asyncio.to_thread() in searchPipeline
    # This reduces context switching overhead
    
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







def testSearching():
    test_queries = ["Latest news from Nepal", "Political updates in Nepal"]
    test_urls = [
        "https://english.nepalnews.com/",
        "https://apnews.com/article/nepal-gen-z-protests-army-kathmandu-2e4d9e835216b11fa238d7bcf8915cbf",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    ]
    contents = fetch_url_content_parallel(test_queries, test_urls)
    for idx, content in enumerate(contents):
        print(f"Content snippet {idx+1}:", content[:200])
    
def chunk_text(text: str, chunk_size: int = 600, overlap: int = 60) -> List[str]:
    words = text.split()
    chunks = []
    stride = chunk_size - overlap
    
    for i in range(0, len(words), stride):
        chunk_words = words[i:i + chunk_size]
        if len(chunk_words) > 10:
            chunks.append(" ".join(chunk_words))
    
    return chunks


def clean_text(text: str) -> str:
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = text.strip()
    return text


def normalize_url(url: str) -> str:
    from urllib.parse import urlparse
    parsed = urlparse(url)
    return f"{parsed.netloc}{parsed.path}"



if __name__ == "__main__":
    pass