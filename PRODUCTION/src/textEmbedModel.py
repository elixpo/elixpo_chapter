import aiohttp
from bs4 import BeautifulSoup
from typing import List, Dict, Tuple
import numpy as np
from sentence_transformers import SentenceTransformer
import faiss
import asyncio
import threading 
import concurrent.futures
from loguru import logger
from yahooSearch import web_search
import torch 

# Initialize model once and cache on GPU if available
_model_cache = None
_model_lock = threading.Lock()

async def fast_web_search_with_embeddings(search_query: str, model: SentenceTransformer, max_concurrent: int = 5, max_chars: int = 2000) -> tuple[str, list]:
    try:
        search_results_raw = await web_search(search_query)
        if not search_results_raw:
            return "No search results found", []
        content_dict = await fetch_all_content(search_results_raw[:max_concurrent], max_chars=max_chars)
        if not content_dict:
            return "No content could be fetched from search results", search_results_raw[:7]
        valid_urls = list(content_dict.keys())
        documents = list(content_dict.values())
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future = executor.submit(build_enhanced_vector_index, documents, valid_urls, model)
            index, embeddings, metadata = future.result(timeout=15)
        search_results = search_enhanced_index(search_query, model, index, metadata, top_k=3)
        context_parts = []
        used_urls = []
        for result in search_results:
            content_preview = result['full_content'][:800] + "..." if len(result['full_content']) > 800 else result['full_content']
            context_parts.append(f"Source: {result['url']}\nContent: {content_preview}\nRelevance: {result['relevance_score']:.3f}\n")
            used_urls.append(result['url'])
        return "\n".join(context_parts), used_urls
    except concurrent.futures.TimeoutError:
        logger.warning(f"Web search timeout for query: {search_query}")
        return "Search timeout - using cached results if available", []
    except Exception as e:
        logger.error(f"Fast web search failed for '{search_query}': {e}")
        return f"Search error: {str(e)[:100]}...", []


async def fetch_content_async(session: aiohttp.ClientSession, url: str, max_chars: int) -> Tuple[str, str]:
    try:
        timeout = aiohttp.ClientTimeout(total=10)
        async with session.get(url, timeout=timeout) as response:
            if response.status == 200:
                html = await response.text()
                soup = BeautifulSoup(html, "html.parser")
                # Extract visible text
                text = " ".join([t.get_text(" ", strip=True) for t in soup.find_all(["p", "li", "h1", "h2", "h3", "div"])])
                # Clean and limit text
                text = " ".join(text.split())[:max_chars]  # Limit to ~2000 chars
                print(f"[INFO] Successfully fetched content from {url} ({len(text)} chars)")
                return url, text
            else:
                print(f"[WARN] HTTP {response.status} for {url}")
                return url, ""
    except Exception as e:
        print(f"[WARN] Could not fetch {url}: {e}")
        return url, ""

async def fetch_all_content(urls: List[str], max_chars: int) -> Dict[str, str]:
    """Fetch content from multiple URLs concurrently"""
    connector = aiohttp.TCPConnector(limit=10, limit_per_host=3)
    timeout = aiohttp.ClientTimeout(total=30)
    
    async with aiohttp.ClientSession(
        connector=connector,
        timeout=timeout,
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    ) as session:
        tasks = [fetch_content_async(session, url, max_chars) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        content_dict = {}
        for result in results:
            if isinstance(result, tuple):
                url, content = result
                if content.strip():  # Only include non-empty content
                    content_dict[url] = content
            else:
                print(f"[ERROR] Exception in fetch task: {result}")
        
        return content_dict

# -------------------------------
# 2. Concurrent Embedding Generation
# -------------------------------
def generate_embeddings_concurrent(texts: List[str], model: SentenceTransformer, batch_size: int = 32) -> np.ndarray:
    """Generate embeddings for texts concurrently using batching"""
    print(f"[INFO] Generating embeddings for {len(texts)} documents...")
    
    # Use model's encode method which is already optimized for batching
    embeddings = model.encode(
        texts, 
        convert_to_numpy=True,
        batch_size=batch_size,
        show_progress_bar=True
    )
    
    print(f"[INFO] Generated embeddings: {embeddings.shape}")
    return embeddings

# -------------------------------
# 3. Enhanced Vector Search
# -------------------------------
def build_enhanced_vector_index(docs: List[str], urls: List[str], model: SentenceTransformer) -> Tuple[faiss.Index, np.ndarray, List[Dict]]:
    """Build FAISS index with metadata"""
    embeddings = generate_embeddings_concurrent(docs, model)
    
    # Create index
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
    
    return index, embeddings, metadata

def search_enhanced_index(query: str, model: SentenceTransformer, index: faiss.Index, 
                         metadata: List[Dict], top_k: int = 3) -> List[Dict]:
    """Search index and return results with metadata"""
    q_emb = model.encode([query], convert_to_numpy=True)
    distances, indices = index.search(q_emb, top_k)
    
    results = []
    for i, (distance, idx) in enumerate(zip(distances[0], indices[0])):
        if idx < len(metadata):  # Valid index
            result = metadata[idx].copy()
            result['relevance_score'] = float(distance)
            result['rank'] = i + 1
            results.append(result)
    
    return results

def get_embedding_model():
    global _model_cache
    if _model_cache is None:
        with _model_lock:
            if _model_cache is None:
                device = "cuda" if torch.cuda.is_available() else "cpu"
                _model_cache = SentenceTransformer("all-MiniLM-L6-v2")
                if device == "cuda":
                    _model_cache = _model_cache.to(device)
                print(f"[INFO] Embedding model loaded on {device.upper()}")
    return _model_cache