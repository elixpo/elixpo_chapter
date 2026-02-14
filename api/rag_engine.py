from typing import Dict, List, Optional
import threading
from loguru import logger
import numpy as np
import requests
from bs4 import BeautifulSoup
from datetime import datetime

from embedding_service import EmbeddingService, VectorStore
from semantic_cache import SemanticCache
from session_manager import SessionMemory
from utility import chunk_text, clean_text
from config import (
    EMBEDDING_MODEL,
    EMBEDDINGS_DIR,
    SEMANTIC_CACHE_TTL_SECONDS,
    SEMANTIC_CACHE_SIMILARITY_THRESHOLD,
    SESSION_SUMMARY_THRESHOLD,
)

class RAGEngine:
    def __init__(
        self,
        embedding_service: EmbeddingService,
        vector_store: VectorStore,
        semantic_cache: SemanticCache,
        session_memory: SessionMemory
    ):
        self.embedding_service = embedding_service
        self.vector_store = vector_store
        self.semantic_cache = semantic_cache
        self.session_memory = session_memory
        self.retrieval_pipeline = RetrievalPipeline(
            embedding_service,
            vector_store
        )
        logger.info("[RAG] Optimized RAG engine initialized")
    
    def retrieve_context(
        self,
        query: str,
        url: Optional[str] = None,
        top_k: int = 5
    ) -> Dict:
        try:
            query_embedding = self.embedding_service.embed_single(query)
            
            if url:
                cached_response = self.semantic_cache.get(url, query_embedding)
                if cached_response:
                    logger.info(f"[RAG] Semantic cache HIT for {url}")
                    return {
                        "source": "semantic_cache",
                        "url": url,
                        "response": cached_response,
                        "latency_ms": 1.0
                    }
            
            results = self.vector_store.search(query_embedding, top_k=top_k)
            
            context_texts = [r["metadata"]["text"] for r in results]
            sources = list(set([r["metadata"]["url"] for r in results]))
            
            context = "\n\n".join(context_texts)
            
            session_context = self.session_memory.get_minimal_context()
            
            full_context = ""
            if session_context:
                full_context += f"Context from previous exchanges:\n{session_context}\n\n"
            
            full_context += f"Retrieved Information:\n{context}"
            
            retrieval_result = {
                "source": "vector_store",
                "query": query,
                "context": full_context,
                "sources": sources,
                "chunk_count": len(results),
                "scores": [r["score"] for r in results],
                "query_embedding": query_embedding.tolist() if isinstance(query_embedding, np.ndarray) else query_embedding
            }
            
            if url:
                self.semantic_cache.set(url, query_embedding, retrieval_result)
            
            return retrieval_result
        
        except Exception as e:
            logger.error(f"[RAG] Retrieval failed: {e}")
            return {
                "source": "error",
                "error": str(e),
                "context": "",
                "sources": []
            }
    
    def ingest_and_cache(self, url: str) -> Dict:
        try:
            chunk_count = self.retrieval_pipeline.ingest_url(url, max_words=3000)
            logger.info(f"[RAG] Ingested {chunk_count} chunks from {url}")
            return {
                "success": True,
                "url": url,
                "chunks": chunk_count
            }
        except Exception as e:
            logger.error(f"[RAG] Ingestion failed for {url}: {e}")
            return {
                "success": False,
                "url": url,
                "error": str(e)
            }
    
    def get_full_context(self, query: str, top_k: int = 5) -> Dict:
        retrieval_result = self.retrieve_context(query, top_k=top_k)
        
        return {
            "query": query,
            "context": retrieval_result.get("context", ""),
            "sources": retrieval_result.get("sources", []),
            "cache_hit": retrieval_result.get("source") == "semantic_cache",
            "scores": retrieval_result.get("scores", [])
        }
    
    def get_stats(self) -> Dict:
        return {
            "vector_store": self.vector_store.get_stats(),
            "semantic_cache": self.semantic_cache.get_stats(),
            "session_memory": self.session_memory.get_context()
        }
    
    def build_rag_prompt_enhancement(self, session_id: str, top_k: int = 5) -> str:
        try:
            # Get session memory context
            context_parts = []
            
            if self.session_memory:
                session_context = self.session_memory.get_minimal_context()
                if session_context:
                    context_parts.append("=== Previous Context ===")
                    context_parts.append(session_context)
                    context_parts.append("")
            
            # Return formatted context for system prompt
            rag_prompt = "\n".join(context_parts) if context_parts else ""
            logger.info(f"[RAG] Built prompt enhancement: {len(rag_prompt)} chars")
            return rag_prompt
        
        except Exception as e:
            logger.error(f"[RAG] Failed to build prompt enhancement: {e}")
            return ""

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


class RetrievalSystem:
    _instance = None
    _lock = threading.Lock()
    
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = RetrievalSystem()
        return cls._instance
    
    def __init__(self):
        logger.info("[RetrievalSystem] Initializing...")
        self.embedding_service = EmbeddingService(model_name=EMBEDDING_MODEL)
        logger.info(f"[RetrievalSystem] Embedding service device: {self.embedding_service.device}")
        
        # CRITICAL FIX: Use correct embedding dimension from config
        self.vector_store = VectorStore(embedding_dim=384, embeddings_dir=EMBEDDINGS_DIR)
        logger.info(f"[RetrievalSystem] Vector store device: {self.vector_store.device}")
        
        self.semantic_cache = SemanticCache(
            ttl_seconds=SEMANTIC_CACHE_TTL_SECONDS,
            similarity_threshold=SEMANTIC_CACHE_SIMILARITY_THRESHOLD
        )
        logger.info(f"[RetrievalSystem] Semantic cache: TTL={SEMANTIC_CACHE_TTL_SECONDS}s, threshold={SEMANTIC_CACHE_SIMILARITY_THRESHOLD}")
        
        self.sessions: Dict[str, SessionMemory] = {}
        self.sessions_lock = threading.RLock()
        
        logger.info("[RetrievalSystem] ✅ Fully initialized with GPU acceleration")
    
    def create_session(self, session_id: str) -> SessionMemory:
        with self.sessions_lock:
            if session_id not in self.sessions:
                self.sessions[session_id] = SessionMemory(
                    session_id,
                    summary_threshold=SESSION_SUMMARY_THRESHOLD
                )
            return self.sessions[session_id]
    
    def get_session(self, session_id: str) -> Optional[SessionMemory]:
        with self.sessions_lock:
            return self.sessions.get(session_id)
    
    def get_rag_engine(self, session_id: str) -> RAGEngine:
        session_memory = self.create_session(session_id)
        return RAGEngine(
            self.embedding_service,
            self.vector_store,
            self.semantic_cache,
            session_memory
        )
    
    def add_conversation_turn(
        self,
        session_id: str,
        user_query: str,
        assistant_response: str,
        entities: List[str] = None
    ) -> None:
        session = self.get_session(session_id)
        if session:
            session.add_turn(user_query, assistant_response, entities)
    
    def delete_session(self, session_id: str) -> None:
        with self.sessions_lock:
            if session_id in self.sessions:
                self.sessions[session_id].clear()
                del self.sessions[session_id]
    
    def get_stats(self) -> Dict:
        with self.sessions_lock:
            return {
                "vector_store": self.vector_store.get_stats(),
                "semantic_cache": self.semantic_cache.get_stats(),
                "active_sessions": len(self.sessions)
            }
    
    def persist_vector_store(self) -> None:
        self.vector_store.persist_to_disk()


_retrieval_system = None


def initialize_retrieval_system() -> RetrievalSystem:
    global _retrieval_system
    _retrieval_system = RetrievalSystem.get_instance()
    return _retrieval_system


def get_retrieval_system() -> RetrievalSystem:
    if _retrieval_system is None:
        return initialize_retrieval_system()
    return _retrieval_system
