from loguru import logger 
from ragService.embeddingService import EmbeddingService
from ragService.vectorStore import VectorStore
from ragService.semanticCacheRedis import SemanticCacheRedis
import uuid
from concurrent.futures import ThreadPoolExecutor
from pipeline.config import (
    EMBEDDING_MODEL,
    EMBEDDINGS_DIR,
    SEMANTIC_CACHE_TTL_SECONDS,
    SEMANTIC_CACHE_SIMILARITY_THRESHOLD,
    SEMANTIC_CACHE_REDIS_HOST,
    SEMANTIC_CACHE_REDIS_PORT,
    SEMANTIC_CACHE_REDIS_DB,
    RETRIEVAL_TOP_K,
    PERSIST_VECTOR_STORE_INTERVAL,
    REQUEST_ID_HEX_SLICE_SIZE
)
from ragService.retrievalPipeline import RetrievalPipeline
from sessions.episodic_memory import EpisodicMemoryManager, MemoryScope
import torch
import threading
from typing import Dict, List, Optional
import time 

class CoreEmbeddingService:
    _instance_id = None
    
    def __init__(self):
        CoreEmbeddingService._instance_id = str(uuid.uuid4())[:REQUEST_ID_HEX_SLICE_SIZE]
        logger.info(f"[CORE {CoreEmbeddingService._instance_id}] Initializing core services...")
        
        self.device = self._select_device()
        logger.info(f"[CORE {CoreEmbeddingService._instance_id}] Using device: {self.device}")
        
        self.embedding_service = EmbeddingService(model_name=EMBEDDING_MODEL)
        self.vector_store = VectorStore(embeddings_dir=EMBEDDINGS_DIR)
        self.semantic_cache = SemanticCacheRedis(
            session_id="ipc-service",
            ttl_seconds=SEMANTIC_CACHE_TTL_SECONDS,
            similarity_threshold=SEMANTIC_CACHE_SIMILARITY_THRESHOLD,
            redis_host=SEMANTIC_CACHE_REDIS_HOST,
            redis_port=SEMANTIC_CACHE_REDIS_PORT,
            redis_db=SEMANTIC_CACHE_REDIS_DB
        )
        self.retrieval_pipeline = RetrievalPipeline(
            self.embedding_service,
            self.vector_store
        )
        self.episodic_memory = EpisodicMemoryManager(
            self.embedding_service,
            self.vector_store,
        )
        
        self._gpu_lock = threading.Lock()
        self._embedding_queue_depth = 0
        self._embedding_requests_total = 0

        self.executor = ThreadPoolExecutor(max_workers=2)
        
        self._shutdown_event = threading.Event()
        self._persist_thread = threading.Thread(
            target=self._persist_worker,
            daemon=True
        )
        self._persist_thread.start()
        logger.info(f"[CORE {CoreEmbeddingService._instance_id}] Warming up embedding model...")
        self._warmup_embedding_model()
        
        logger.info(f"[CORE {CoreEmbeddingService._instance_id}] Core services initialized")
    
    @staticmethod
    def _select_device() -> str:
        try:
            if torch.cuda.is_available():
                device_count = torch.cuda.device_count()
                device_name = torch.cuda.get_device_name(0)
                logger.info(f"[CORE] CUDA available: {device_count} device(s), using '{device_name}'")
                return "cuda"
        except Exception as e:
            logger.warning(f"[CORE] CUDA availability check failed: {e}")
        
        try:
            if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                logger.info(f"[CORE] Apple MPS available")
                return "mps"
        except Exception as e:
            logger.debug(f"[CORE] MPS check failed: {e}")
        
        logger.info("[CORE] Using CPU for core services")
        return "cpu"
      
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

    @staticmethod
    def _memory_scope(scope: Dict) -> MemoryScope:
        return MemoryScope(
            tenant_id=str(scope.get("tenant_id") or ""),
            user_id=str(scope.get("user_id") or ""),
            session_id=str(scope.get("session_id") or ""),
        )

    def remember_episodes(
        self,
        scope: Dict,
        episode_id: str,
        user_text: str,
        assistant_text: str,
        source_turn_ids: List[int] | None = None,
        evidence_ids: List[str] | None = None,
        artifact_ids: List[str] | None = None,
    ) -> int:
        return self.episodic_memory.remember_turn(
            scope=self._memory_scope(scope),
            episode_id=episode_id,
            user_text=user_text,
            assistant_text=assistant_text,
            source_turn_ids=source_turn_ids or (),
            evidence_ids=evidence_ids or (),
            artifact_ids=artifact_ids or (),
        )

    def recall_episodes(
        self,
        scope: Dict,
        query: str,
        top_k: int,
        max_chars: int,
    ) -> List[Dict]:
        return self.episodic_memory.recall(
            scope=self._memory_scope(scope),
            query=query,
            top_k=top_k,
            max_chars=max_chars,
        )

    def delete_episodes(self, scope: Dict) -> None:
        self.episodic_memory.delete(self._memory_scope(scope))

    def expire_episodes(self) -> None:
        self.episodic_memory.expire()
    
    def get_semantic_cache_stats(self) -> Dict:
        return self.semantic_cache.get_stats()
    
    def embed_batch(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        self._embedding_queue_depth += 1
        try:
            with self._gpu_lock:
                self._embedding_requests_total += 1
                embeddings = self.embedding_service.embed(texts, batch_size=batch_size)
                return embeddings.tolist()
        except Exception as e:
            logger.error(f"[CORE] Batch embedding failed: {e}")
            raise
        finally:
            self._embedding_queue_depth -= 1

    def embed_single_text(self, text: str) -> List[float]:
        self._embedding_queue_depth += 1
        try:
            with self._gpu_lock:
                self._embedding_requests_total += 1
                embedding = self.embedding_service.embed_single(text)
                return embedding.tolist()
        except Exception as e:
            logger.error(f"[CORE] Single embedding failed: {e}")
            raise
        finally:
            self._embedding_queue_depth -= 1

    def get_health(self) -> dict:
        return {
            "embedding_queue_depth": self._embedding_queue_depth,
            "embedding_requests_total": self._embedding_requests_total,
            "device": self.device,
            "vector_store": self.get_vector_store_stats(),
        }

    def _persist_worker(self) -> None:
        while not self._shutdown_event.wait(PERSIST_VECTOR_STORE_INTERVAL):
            try:
                self.vector_store.persist_to_disk()
                self.expire_episodes()
            except Exception as e:
                logger.error(f"[CORE] Persist worker error: {e}")

    def close(self) -> None:
        """Stop background work and flush vector state once."""
        if self._shutdown_event.is_set():
            return
        self._shutdown_event.set()
        try:
            self.vector_store.persist_to_disk()
            self.vector_store.close()
        except Exception as e:
            logger.warning(f"[CORE] Final vector-store shutdown failed: {e}")
        self.executor.shutdown(wait=False, cancel_futures=True)
        self._persist_thread.join(timeout=2)
