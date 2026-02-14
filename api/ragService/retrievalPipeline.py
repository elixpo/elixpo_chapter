from ragService.embeddingService import EmbeddingService
from ragService.vectorStore import VectorStore
import requests
from loguru import logger
from bs4 import BeautifulSoup
from datetime import datetime
from typing import List, Dict
from commons.minimal import chunk_text, clean_text

class RetrievalPipeline:
    def __init__(self, embedding_service: EmbeddingService, vector_store: VectorStore):
        self.embedding_service = embedding_service
        self.vector_store = vector_store
    
    def ingest_url(self, url: str, max_words: int = 3000) -> int:
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            response = requests.get(url, timeout=20, headers=headers)
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
        
        except Exception as e:
            logger.error(f"[Retrieval] Failed to ingest {url}: {e}")
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

