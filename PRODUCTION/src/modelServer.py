from multiprocessing.managers import BaseManager
from multiprocessing import Queue
import torch
from loguru import logger
import time
import hashlib
import string
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
from typing import List, Dict, Tuple
import threading
from functools import wraps
from concurrent.futures import ThreadPoolExecutor
import asyncio
import aiohttp
from bs4 import BeautifulSoup
from yahooSearch import web_search

BASE62 = string.digits + string.ascii_letters
device = "cuda" if torch.cuda.is_available() else "cpu"

# Configuration
MAX_CONCURRENT_OPERATIONS = 3
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"

def base62_encode(num: int) -> str:
    if num == 0:
        return BASE62[0]
    digits = []
    base = len(BASE62)
    while num:
        num, rem = divmod(num, base)
        digits.append(BASE62[rem])
    return ''.join(reversed(digits))

def thread_safe_gpu_operation(func):
    @wraps(func)
    def wrapper(self, *args, **kwargs):
        with self._gpu_lock:
            return func(self, *args, **kwargs)
    return wrapper

class EmbeddingIPCModules:
    logger.info("Loading Embedding IPC Device...")
    
    def __init__(self):
        self.model = SentenceTransformer(EMBEDDING_MODEL_NAME)
        if device == "cuda":
            self.model = self.model.to(device)
        
        self.executor = ThreadPoolExecutor(max_workers=MAX_CONCURRENT_OPERATIONS, thread_name_prefix="EmbedOp")
        self._gpu_lock = threading.Lock()
        self._operation_semaphore = threading.Semaphore(MAX_CONCURRENT_OPERATIONS)
        
        logger.info(f"Embedding model '{EMBEDDING_MODEL_NAME}' loaded on {device.upper()}")

    def stop_cleanup(self):
        self.executor.shutdown(wait=True, timeout=30)

    @staticmethod
    def cacheName(query: str, length: int = 16) -> str:  
        query_bytes = query.encode('utf-8')
        digest = hashlib.sha256(query_bytes).digest()
        num = int.from_bytes(digest[:8], 'big')
        encoded = base62_encode(num)
        return encoded[:length]

    def _generate_embeddings_worker(self, texts: List[str], batch_size: int = 32):
        with self._operation_semaphore:
            thread_id = threading.current_thread().name
            logger.info(f"[{thread_id}] Starting embedding generation for {len(texts)} documents...")
            start_time = time.time()
            
            try:
                with self._gpu_lock:
                    embeddings = self.model.encode(
                        texts, 
                        convert_to_numpy=True,
                        batch_size=batch_size,
                        show_progress_bar=True
                    )
                    if device == "cuda":
                        torch.cuda.empty_cache()
                    
            except RuntimeError as e:
                if "CUDA out of memory" in str(e):
                    logger.error(f"[{thread_id}] GPU OOM — request denied")
                    return None
                raise e

            elapsed_time = time.time() - start_time
            logger.info(f"[{thread_id}] Embedding generation time: {elapsed_time:.2f} seconds")
            logger.info(f"[{thread_id}] Generated embeddings shape: {embeddings.shape}")

            return embeddings

    def generate_embeddings(self, texts: List[str], batch_size: int = 32) -> np.ndarray:
        future = self.executor.submit(self._generate_embeddings_worker, texts, batch_size)
        return future.result()

    def generate_embeddings_async(self, texts: List[str], batch_size: int = 32):
        return self.executor.submit(self._generate_embeddings_worker, texts, batch_size)

    def _build_vector_index_worker(self, docs: List[str], urls: List[str]):
        with self._operation_semaphore:
            thread_id = threading.current_thread().name
            logger.info(f"[{thread_id}] Building vector index for {len(docs)} documents...")
            start_time = time.time()
            
            try:
                embeddings = self._generate_embeddings_worker(docs)
                if embeddings is None:
                    return None, None, None
                
                # Create FAISS index
                dim = embeddings.shape[1]
                index = faiss.IndexFlatL2(dim)
                index.add(embeddings)
                
                # Create metadata for each document
                metadata = []
                for i, (url, doc) in enumerate(zip(urls, docs)):
                    metadata.append({
                        'id': i,
                        'url': url,
                        'content': doc[:500] + "..." if len(doc) > 500 else doc,  # Preview
                        'full_content': doc,
                        'length': len(doc)
                    })
                
                elapsed_time = time.time() - start_time
                logger.info(f"[{thread_id}] Vector index build time: {elapsed_time:.2f} seconds")
                
                return index, embeddings, metadata
                
            except Exception as e:
                logger.error(f"[{thread_id}] Vector index build error: {e}")
                raise e

    def build_vector_index(self, docs: List[str], urls: List[str]) -> Tuple[faiss.Index, np.ndarray, List[Dict]]:
        future = self.executor.submit(self._build_vector_index_worker, docs, urls)
        return future.result()

    def build_vector_index_async(self, docs: List[str], urls: List[str]):
        return self.executor.submit(self._build_vector_index_worker, docs, urls)

    def _search_index_worker(self, query: str, index: faiss.Index, metadata: List[Dict], top_k: int = 3):
        with self._operation_semaphore:
            thread_id = threading.current_thread().name
            logger.info(f"[{thread_id}] Searching index for query: {query[:50]}...")
            start_time = time.time()
            
            try:
                with self._gpu_lock:
                    q_emb = self.model.encode([query], convert_to_numpy=True)
                    if device == "cuda":
                        torch.cuda.empty_cache()
                
                distances, indices = index.search(q_emb, top_k)
                
                results = []
                for i, (distance, idx) in enumerate(zip(distances[0], indices[0])):
                    if idx < len(metadata):  # Valid index
                        result = metadata[idx].copy()
                        result['relevance_score'] = float(distance)
                        result['rank'] = i + 1
                        results.append(result)
                
                elapsed_time = time.time() - start_time
                logger.info(f"[{thread_id}] Index search time: {elapsed_time:.2f} seconds")
                
                return results
                
            except Exception as e:
                logger.error(f"[{thread_id}] Index search error: {e}")
                raise e

    def search_index(self, query: str, index: faiss.Index, metadata: List[Dict], top_k: int = 3) -> List[Dict]:
        future = self.executor.submit(self._search_index_worker, query, index, metadata, top_k)
        return future.result()

    def search_index_async(self, query: str, index: faiss.Index, metadata: List[Dict], top_k: int = 3):
        return self.executor.submit(self._search_index_worker, query, index, metadata, top_k)

    def _web_search_with_embeddings_worker(self, search_query: str, max_concurrent: int = 5, max_chars: int = 2000):
        """Full web search with embeddings pipeline"""
        with self._operation_semaphore:
            thread_id = threading.current_thread().name
            logger.info(f"[{thread_id}] Starting web search with embeddings for: {search_query[:50]}...")
            start_time = time.time()
            
            try:
                # This would need to be made async-compatible or use a different approach
                # For now, we'll implement a synchronous version
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                
                try:
                    search_results_raw = loop.run_until_complete(web_search(search_query))
                    if not search_results_raw:
                        return "No search results found", []
                    
                    content_dict = loop.run_until_complete(self._fetch_all_content_sync(search_results_raw[:max_concurrent], max_chars))
                    if not content_dict:
                        return "No content could be fetched from search results", search_results_raw[:7]
                    
                    valid_urls = list(content_dict.keys())
                    documents = list(content_dict.values())
                    
                    index, embeddings, metadata = self._build_vector_index_worker(documents, valid_urls)
                    if index is None:
                        return "Failed to build embeddings", valid_urls
                    
                    search_results = self._search_index_worker(search_query, index, metadata, top_k=3)
                    
                    context_parts = []
                    used_urls = []
                    for result in search_results:
                        content_preview = result['full_content'][:800] + "..." if len(result['full_content']) > 800 else result['full_content']
                        context_parts.append(f"Source: {result['url']}\nContent: {content_preview}\nRelevance: {result['relevance_score']:.3f}\n")
                        used_urls.append(result['url'])
                    
                    elapsed_time = time.time() - start_time
                    logger.info(f"[{thread_id}] Full web search with embeddings time: {elapsed_time:.2f} seconds")
                    
                    return "\n".join(context_parts), used_urls
                    
                finally:
                    loop.close()
                    
            except Exception as e:
                logger.error(f"[{thread_id}] Web search with embeddings error: {e}")
                return f"Search error: {str(e)[:100]}...", []

    async def _fetch_all_content_sync(self, urls: List[str], max_chars: int) -> Dict[str, str]:
        """Fetch content from multiple URLs"""
        connector = aiohttp.TCPConnector(limit=10, limit_per_host=3)
        timeout = aiohttp.ClientTimeout(total=30)
        
        async with aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        ) as session:
            tasks = [self._fetch_content_async(session, url, max_chars) for url in urls]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            content_dict = {}
            for result in results:
                if isinstance(result, tuple):
                    url, content = result
                    if content.strip():
                        content_dict[url] = content
                else:
                    logger.error(f"Exception in fetch task: {result}")
            
            return content_dict

    async def _fetch_content_async(self, session: aiohttp.ClientSession, url: str, max_chars: int) -> Tuple[str, str]:
        try:
            timeout = aiohttp.ClientTimeout(total=10)
            async with session.get(url, timeout=timeout) as response:
                if response.status == 200:
                    html = await response.text()
                    soup = BeautifulSoup(html, "html.parser")
                    text = " ".join([t.get_text(" ", strip=True) for t in soup.find_all(["p", "li", "h1", "h2", "h3", "div"])])
                    text = " ".join(text.split())[:max_chars]
                    logger.debug(f"Successfully fetched content from {url} ({len(text)} chars)")
                    return url, text
                else:
                    logger.warning(f"HTTP {response.status} for {url}")
                    return url, ""
        except Exception as e:
            logger.warning(f"Could not fetch {url}: {e}")
            return url, ""

    def web_search_with_embeddings(self, search_query: str, max_concurrent: int = 5, max_chars: int = 2000) -> tuple[str, list]:
        future = self.executor.submit(self._web_search_with_embeddings_worker, search_query, max_concurrent, max_chars)
        return future.result()

    def web_search_with_embeddings_async(self, search_query: str, max_concurrent: int = 5, max_chars: int = 2000):
        return self.executor.submit(self._web_search_with_embeddings_worker, search_query, max_concurrent, max_chars)

    def get_active_operations_count(self):
        return MAX_CONCURRENT_OPERATIONS - self._operation_semaphore._value

class EmbeddingModelManager(BaseManager): 
    pass

if __name__ == "__main__":
    try:
        server = EmbeddingIPCModules()
        EmbeddingModelManager.register("EmbeddingService", callable=lambda: server)
        
        manager = EmbeddingModelManager(address=("localhost", 5002), authkey=b"embedding_secret")
        logger.info(f"[EmbeddingServer] Server started at localhost:5002 with {MAX_CONCURRENT_OPERATIONS} concurrent operations")
        
        try:
            manager.get_server().serve_forever()
        except KeyboardInterrupt:
            logger.info("Shutting down embedding server...")
        finally:
            server.stop_cleanup()
            
    except Exception as e:
        logger.error(f"Error in embedding server main: {e}")