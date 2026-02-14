from loguru import logger 
from embedding_service import EmbeddingService
from embedding_service import VectorStore
from semantic_cache import SemanticCache
import uuid
from concurrent.futures import ThreadPoolExecutor
from config import EMBEDDING_MODEL, EMBEDDINGS_DIR, SEMANTIC_CACHE_TTL_SECONDS, SEMANTIC_CACHE_SIMILARITY_THRESHOLD, AUDIO_TRANSCRIBE_SIZE, RETRIEVAL_TOP_K, PERSIST_VECTOR_STORE_INTERVAL
from rag_engine import RetrievalPipeline
import torch
import threading
from typing import Dict, List, Optional
import time 

class CoreEmbeddingService:
    _instance_id = None
    
    def __init__(self):
        CoreEmbeddingService._instance_id = str(uuid.uuid4())[:8]
        logger.info(f"[CORE {CoreEmbeddingService._instance_id}] Initializing core services...")
        
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"[CORE {CoreEmbeddingService._instance_id}] Using device: {self.device}")
        
        self.embedding_service = EmbeddingService(model_name=EMBEDDING_MODEL)
        self.vector_store = VectorStore(embeddings_dir=EMBEDDINGS_DIR)
        self.semantic_cache = SemanticCache(
            ttl_seconds=SEMANTIC_CACHE_TTL_SECONDS,
            similarity_threshold=SEMANTIC_CACHE_SIMILARITY_THRESHOLD
        )
        self.retrieval_pipeline = RetrievalPipeline(
            self.embedding_service,
            self.vector_store
        )
        
        self._gpu_lock = threading.Lock()
        
        self.executor = ThreadPoolExecutor(max_workers=2)
        
        self._persist_thread = threading.Thread(
            target=self._persist_worker,
            daemon=True
        )
        self._persist_thread.start()
        logger.info(f"[CORE {CoreEmbeddingService._instance_id}] Warming up embedding model...")
        self._warmup_embedding_model()
        
        logger.info(f"[CORE {CoreEmbeddingService._instance_id}] Core services initialized")
      
    def _warmup_embedding_model(self) -> None:
        try:
            dummy_texts = [
                "This is a warmup text for the embedding model.",
                "Testing the embedding service initialization."
            ]
            
            embeddings = self.embedding_service.embed(dummy_texts, batch_size=2)
            logger.info(f"[CORE {CoreEmbeddingService._instance_id}] Embedding model warmed up with shape {embeddings.shape}")
        except Exception as e:
            logger.warning(f"[CORE {CoreEmbeddingService._instance_id}] Embedding model warm-up failed: {e}")
    
    
    def ingest_url(self, url: str) -> Dict:
        try:
            chunk_count = self.retrieval_pipeline.ingest_url(url, max_words=3000)
            return {
                "success": True,
                "url": url,
                "chunks_ingested": chunk_count
            }
        except Exception as e:
            logger.error(f"[CORE] Failed to ingest URL {url}: {e}")
            return {
                "success": False,
                "url": url,
                "error": str(e)
            }
    
    def retrieve(self, query: str, top_k: int = RETRIEVAL_TOP_K) -> Dict:
        try:
            results = self.retrieval_pipeline.retrieve(query, top_k=top_k)
            return {
                "query": query,
                "results": results,
                "count": len(results)
            }
        except Exception as e:
            logger.error(f"[CORE] Retrieval failed: {e}")
            return {
                "query": query,
                "results": [],
                "count": 0,
                "error": str(e)
            }
    
    def build_retrieval_context(self, query: str, session_memory: str = "", top_k: int = RETRIEVAL_TOP_K) -> Dict:
        try:
            context = self.retrieval_pipeline.build_context(
                query,
                top_k=top_k,
                session_memory=session_memory
            )
            return {
                "success": True,
                **context
            }
        except Exception as e:
            logger.error(f"[CORE] Context building failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_semantic_cache(self, url: str, query_embedding: List[float]) -> Optional[Dict]:
        import numpy as np
        query_emb = np.array(query_embedding, dtype=np.float32)
        return self.semantic_cache.get(url, query_emb)
    
    def set_semantic_cache(self, url: str, query_embedding: List[float], response: Dict) -> None:
        import numpy as np
        query_emb = np.array(query_embedding, dtype=np.float32)
        self.semantic_cache.set(url, query_emb, response)
    
    def get_vector_store_stats(self) -> Dict:
        return self.vector_store.get_stats()
    
    def get_semantic_cache_stats(self) -> Dict:
        return self.semantic_cache.get_stats()
    
    def _persist_worker(self) -> None:
        while True:
            try:
                time.sleep(PERSIST_VECTOR_STORE_INTERVAL)
                self.vector_store.persist_to_disk()
            except Exception as e:
                logger.error(f"[CORE] Persist worker error: {e}")

