from ragService.vectorStore import VectorStore
import requests
from loguru import logger
from bs4 import BeautifulSoup
from datetime import datetime
from typing import List, Dict
from commons.minimal import chunk_text, clean_text
import time
from urllib.parse import urlparse

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
]

def get_realistic_headers(url: str, user_agent_index: int = 0) -> dict:
    parsed_url = urlparse(url)
    domain = parsed_url.netloc
    
    headers = {
        'User-Agent': USER_AGENTS[user_agent_index % len(USER_AGENTS)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
        'Referer': f'https://elixpo.com/',
    }
    return headers

class RetrievalPipeline:
    def __init__(self, embedding_service, vector_store: VectorStore):
        self.embedding_service = embedding_service
        self.vector_store = vector_store
    
    def ingest_url(self, url: str, max_words: int = 3000) -> int:
        max_retries = 3
        for attempt in range(max_retries):
            try:
                headers = get_realistic_headers(url, attempt)
                response = requests.get(url, timeout=20, headers=headers, allow_redirects=True)
                
                if response.status_code != 200:
                    logger.warning(f"[Retrieval] Attempt {attempt + 1}/{max_retries} failed with status {response.status_code} for {url}")
                    if attempt < max_retries - 1:
                        time.sleep(1 + attempt)
                        continue
                    logger.error(f"[Retrieval] Failed to ingest {url}: {response.status_code} Client Error")
                    return 0
                
                response.raise_for_status()
                
                content_type = response.headers.get('Content-Type', '').lower()
                if 'text/html' not in content_type:
                    logger.warning(f"[Retrieval] Skipping non-HTML: {url}")
                    return 0
                
                soup = BeautifulSoup(response.content, 'html.parser')
                
                for element in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
                    element.extract()
                
                text = soup.get_text()
                text = clean_text(text)
                
                words = text.split()
                if len(words) > max_words:
                    text = " ".join(words[:max_words])
                
                chunks = chunk_text(text, chunk_size=600, overlap=60)
                
                embeddings = self.embedding_service.embed(chunks, batch_size=32)
                
                chunk_dicts = [
                    {
                        "url": url,
                        "chunk_id": i,
                        "text": chunk,
                        "embedding": embeddings[i],
                        "timestamp": datetime.now().isoformat()
                    }
                    for i, chunk in enumerate(chunks)
                ]
                
                self.vector_store.add_chunks(chunk_dicts)
                logger.info(f"[Retrieval] Ingested {len(chunks)} chunks from {url}")
                
                return len(chunks)
        
            except requests.exceptions.Timeout:
                logger.warning(f"[Retrieval] Attempt {attempt + 1}/{max_retries} timeout for {url}")
                if attempt < max_retries - 1:
                    time.sleep(1 + attempt)
            except requests.exceptions.RequestException as e:
                logger.warning(f"[Retrieval] Attempt {attempt + 1}/{max_retries} request error for {url}: {type(e).__name__}")
                if attempt < max_retries - 1:
                    time.sleep(1 + attempt)
            except Exception as e:
                logger.error(f"[Retrieval] Processing error for {url}: {e}")
                return 0
        
        logger.error(f"[Retrieval] Failed to ingest {url} after {max_retries} retries")
        return 0
    
    def retrieve(self, query: str, top_k: int = 5) -> List[Dict]:
        try:
            query_embedding = self.embedding_service.embed_single(query)
            
            results = self.vector_store.search(query_embedding, top_k=top_k)
            
            return results
        
        except Exception as e:
            logger.error(f"[Retrieval] Retrieval failed: {e}")
            return []
    
    def build_context(self, query: str, top_k: int = 5, session_memory: str = "") -> Dict:
        results = self.retrieve(query, top_k=top_k)
        
        context_texts = [r["metadata"]["text"] for r in results]
        context = "\n\n".join(context_texts)
        
        sources = list(set([r["metadata"]["url"] for r in results]))
        
        prompt_context = ""
        if session_memory:
            prompt_context += f"Previous Context:\n{session_memory}\n\n"
        
        prompt_context += f"Retrieved Information:\n{context}"
        
        return {
            "context": prompt_context,
            "sources": sources,
            "chunk_count": len(results),
            "scores": [r["score"] for r in results]
        }
