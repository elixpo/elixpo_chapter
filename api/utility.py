from collections import deque
from loguru import logger
from multiprocessing.managers import BaseManager
from search import fetch_full_text
import concurrent
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
modelManager.register("ipcService")

search_service = None
embedModelService = None

def _init_ipc_manager(max_retries: int = 3, retry_delay: float = 1.0):
    global search_service, embedModelService
    
    for attempt in range(max_retries):
        try:
            manager = modelManager(address=("localhost", 5010), authkey=b"ipcService")
            manager.connect()
            search_service = manager.accessSearchAgents()
            embedModelService = manager.ipcService()
            logger.info("[Utility] IPC connection established with model_server")
            return True
        except Exception as e:
            if attempt < max_retries - 1:
                logger.warning(f"[Utility] IPC connection failed (attempt {attempt + 1}/{max_retries}): {e}")
                time.sleep(retry_delay)
            else:
                logger.error(f"[Utility] Failed to connect to IPC server after {max_retries} attempts: {e}")
                return False
    
    return False

_ipc_ready = _init_ipc_manager()


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
    if not _ipc_ready or search_service is None:
        logger.error("[Utility] IPC service not available for web search")
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
    if not _ipc_ready or search_service is None:
        logger.error("[Utility] IPC service not available for image search")
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

def youtubeMetadata(url: str):
    logger.debug("[Utility] Fetching YouTube metadata")
    parsed_url = urlparse(url)
    if "youtube.com" not in parsed_url.netloc and "youtu.be" not in parsed_url.netloc:
        logger.warning("[Utility] Invalid YouTube URL provided")
        return None
    
    if not _ipc_ready or search_service is None:
        logger.error("[Utility] IPC service not available for YouTube metadata")
        return None
        
    try:
        metadata = search_service.get_youtube_metadata(url)
        return metadata
    except Exception as e:
        logger.error(f"[Utility] Error fetching YouTube metadata for {url}: {e}")
        return None

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
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_full_text, url, request_id=request_id): url for url in urls}
        results = []

        for future in concurrent.futures.as_completed(futures):
            url = futures[future]
            try:
                text_content = future.result()
                
                clean_text = str(text_content).encode('unicode_escape').decode('utf-8')
                clean_text = clean_text.replace('\\n', ' ').replace('\\r', ' ').replace('\\t', ' ')
                clean_text = ''.join(c for c in clean_text if c.isprintable())
                results.append(f"URL: {url}\n{clean_text.strip()}")
                logger.debug(f"[Utility] Fetched {len(clean_text)} chars from {url}")
            except Exception as e:
                logger.error(f"[Utility] Failed fetching {url}: {e}")

        combined_text = "\n".join(results)
        logger.info(f"[Utility] Fetched all URLs in parallel, total: {len(combined_text)} chars")
        
        if embedModelService:
            try:
                information = embedModelService.extract_relevant(combined_text, queries)
                relevant_parts = []
                for item in information:
                    if isinstance(item, str):
                        relevant_parts.append(item)
                combined_text += "\n\nRelevant extracts: " + " ".join(relevant_parts)
            except Exception as e:
                logger.warning(f"[Utility] Could not extract relevant info: {e}")
        
        return combined_text


async def rank_results(query: str, results: List[str], ipc_service) -> List[Tuple[str, float]]:

    if not results:
        return []
    
    try:
        # Use the ipc_service's rank_results method to avoid IPC serialization issues
        ranked = ipc_service.rank_results(query, results)
        return ranked
    except Exception as e:
        logger.warning(f"Ranking failed: {e}")
        return [(r, 1.0) for r in results]


async def extract_and_rank_sentences(
    url: str,
    content: str,
    query: str,
    ipc_service
) -> List[str]:

    try:
        # Use the ipc_service's method to handle sentence extraction server-side
        top_sentences = ipc_service.extract_and_rank_sentences(content, query)
        return top_sentences
    except Exception as e:
        logger.warning(f"Sentence extraction failed for {url}: {e}")
        return []


def build_final_response(
    response_content: str,
    session,
    rag_stats: Dict
) -> str:
   
    parts = [response_content]
    
    if session.images:
        parts.append("\n\n---\n## Images\n")
        for img_url in session.images[:5]:
            parts.append(f"![](external-image)")
    
    if session.fetched_urls:
        parts.append("\n\n---\n## Sources\n")
        for i, url in enumerate(session.fetched_urls, 1):
            parts.append(f"{i}. [{url}]({url})")
    
    parts.append("\n\n---\n## Summary\n")
    parts.append(f"- Documents: {rag_stats.get('documents_fetched', 0)}")
    parts.append(f"- Entities: {rag_stats.get('entities_extracted', 0)}")
    parts.append(f"- Relationships: {rag_stats.get('relationships_discovered', 0)}")
    
    return "\n".join(parts)



    _deepsearch_store[sessionID] = query

def getDeepSearchQuery(sessionID: str):
    return _deepsearch_store.get(sessionID)

def cleanDeepSearchQuery(sessionID: str):
    if sessionID in _deepsearch_store:
        del _deepsearch_store[sessionID]

def testYoutubeMetadata():
    youtube_url = "https://www.youtube.com/watch?v=FLal-KvTNAQ"
    metadata = youtubeMetadata(youtube_url)
    print("Metadata:", metadata)



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