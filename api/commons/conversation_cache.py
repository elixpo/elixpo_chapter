import json
import zlib
import gzip
import lz4.frame
import logging
import os
import pickle
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta
from collections import deque
import numpy as np

logger = logging.getLogger("elixpo")

try:
    from sentence_transformers import SentenceTransformer
    EMBEDDING_AVAILABLE = True
except ImportError:
    EMBEDDING_AVAILABLE = False
    logger.warning("SentenceTransformer not available for conversation cache embeddings")


class ConversationCacheManager:
    def __init__(self, 
                 window_size: int = 10,
                 max_entries: int = 50,
                 ttl_seconds: int = 1800,
                 compression_method: str = "zlib",
                 embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2",
                 similarity_threshold: float = 0.85,
                 cache_dir: str = "./data/cache/conversation"):
        
        self.window_size = window_size
        self.max_entries = max_entries
        self.ttl_seconds = ttl_seconds
        self.compression_method = compression_method
        self.similarity_threshold = similarity_threshold
        self.cache_dir = cache_dir
        
        # Create cache directory if it doesn't exist
        os.makedirs(self.cache_dir, exist_ok=True)
        
        self.embedding_model = None
        if EMBEDDING_AVAILABLE:
            try:
                self.embedding_model = SentenceTransformer(embedding_model)
                logger.info(f"[ConversationCache] Loaded embedding model: {embedding_model}")
            except Exception as e:
                logger.warning(f"[ConversationCache] Failed to load embedding model: {e}")
        
        self.cache_window: deque = deque(maxlen=window_size)
        self.full_cache: Dict[str, dict] = {}
        self.embeddings_cache: Dict[str, np.ndarray] = {}
        self.latest_response: Optional[str] = None
        
    def add_to_cache(self, query: str, response: str, metadata: Optional[Dict] = None) -> None:
        if len(query) < 10:
            return
            
        timestamp = datetime.now()
        entry_id = f"{hash(query + response)}"
        
        cache_entry = {
            "id": entry_id,
            "query": query,
            "response": response,
            "metadata": metadata or {},
            "timestamp": timestamp.isoformat(),
            "ttl_expiry": (timestamp + timedelta(seconds=self.ttl_seconds)).isoformat()
        }
        
        embedding = None
        if self.embedding_model:
            try:
                embedding = self.embedding_model.encode(query, convert_to_numpy=True)
                self.embeddings_cache[entry_id] = embedding
            except Exception as e:
                logger.warning(f"[ConversationCache] Failed to generate embedding: {e}")
        
        compressed_response = self._compress(response)
        cache_entry["response_compressed"] = compressed_response
        cache_entry["compression_method"] = self.compression_method
        
        self.cache_window.append(cache_entry)
        self.full_cache[entry_id] = cache_entry
        self.latest_response = response
        
        if len(self.full_cache) > self.max_entries:
            oldest_key = min(self.full_cache.keys(), 
                           key=lambda k: self.full_cache[k]["timestamp"])
            del self.full_cache[oldest_key]
            if oldest_key in self.embeddings_cache:
                del self.embeddings_cache[oldest_key]
        
        logger.debug(f"[ConversationCache] Added to cache: {entry_id[:8]}... (window size: {len(self.cache_window)}, total: {len(self.full_cache)})")
    
    def query_cache(self, 
                   query: str, 
                   use_window: bool = True,
                   similarity_threshold: Optional[float] = None,
                   return_compressed: bool = True) -> Tuple[Optional[Dict], float]:
        
        if len(query) < 10:
            return None, 0.0
        
        if not self.embedding_model:
            logger.warning("[ConversationCache] No embedding model available for cache query")
            return None, 0.0
        
        threshold = similarity_threshold or self.similarity_threshold
        search_cache = self.cache_window if use_window else self.full_cache.values()
        
        if not search_cache:
            return None, 0.0
        
        try:
            query_embedding = self.embedding_model.encode(query, convert_to_numpy=True)
            
            best_match = None
            best_score = 0.0
            
            for entry in search_cache:
                entry_id = entry.get("id")
                if entry_id not in self.embeddings_cache:
                    continue
                
                if self._is_expired(entry):
                    continue
                
                entry_embedding = self.embeddings_cache[entry_id]
                similarity = np.dot(query_embedding, entry_embedding) / (
                    np.linalg.norm(query_embedding) * np.linalg.norm(entry_embedding)
                )
                
                if similarity > best_score:
                    best_score = similarity
                    best_match = entry
            
            if best_match and best_score >= threshold:
                result_entry = dict(best_match)
                
                if not return_compressed and "response_compressed" in result_entry:
                    result_entry["response"] = self._decompress(
                        result_entry["response_compressed"],
                        result_entry.get("compression_method", self.compression_method)
                    )
                    del result_entry["response_compressed"]
                
                logger.info(f"[ConversationCache] Cache HIT - Similarity: {best_score:.3f} (threshold: {threshold})")
                return result_entry, best_score
            
            logger.debug(f"[ConversationCache] Cache MISS - Best similarity: {best_score:.3f} (threshold: {threshold})")
            return None, best_score
            
        except Exception as e:
            logger.error(f"[ConversationCache] Query error: {e}")
            return None, 0.0
    
    def batch_query_cache(self, queries: List[str], use_window: bool = True, top_k: int = 3) -> List[Tuple[Optional[Dict], float]]:
        
        results = []
        for query in queries:
            match, score = self.query_cache(query, use_window=use_window)
            results.append((match, score))
        return results
    
    def get_window_context(self) -> str:
        
        if not self.cache_window:
            return ""
        
        window_text = "## Recent Conversation Context (from cache):\n"
        for i, entry in enumerate(self.cache_window, 1):
            query = entry.get("query", "")[:100]
            response_preview = entry.get("response", "")[:200]
            window_text += f"\n{i}. Q: {query}\n   A: {response_preview}...\n"
        
        return window_text
    
    def clear_cache(self) -> None:
        self.cache_window.clear()
        self.full_cache.clear()
        self.embeddings_cache.clear()
        self.latest_response = None
        logger.info("[ConversationCache] Cache cleared")
    
    def get_cache_stats(self) -> Dict:
        return {
            "window_size": len(self.cache_window),
            "total_entries": len(self.full_cache),
            "embeddings_cached": len(self.embeddings_cache),
            "max_entries": self.max_entries,
            "ttl_seconds": self.ttl_seconds
        }
    
    def save_to_disk(self, session_id: str = "default") -> bool:
        """
        Persist cache to disk for cross-session retrieval.
        
        Args:
            session_id: Session identifier for cache file naming
            
        Returns:
            True if successful, False otherwise
        """
        try:
            cache_file = os.path.join(self.cache_dir, f"cache_{session_id}.pkl")
            
            # Prepare serializable cache (remove numpy embeddings)
            serializable_cache = {
                "full_cache": self.full_cache,
                "cache_entries": list(self.cache_window),
                "metadata": {
                    "window_size": self.window_size,
                    "max_entries": self.max_entries,
                    "ttl_seconds": self.ttl_seconds,
                    "saved_at": datetime.now().isoformat()
                }
            }
            
            with open(cache_file, 'wb') as f:
                pickle.dump(serializable_cache, f)
            
            logger.info(f"[ConversationCache] Saved cache to disk: {cache_file}")
            return True
            
        except Exception as e:
            logger.error(f"[ConversationCache] Failed to save cache to disk: {e}")
            return False
    
    def load_from_disk(self, session_id: str = "default") -> bool:
        """
        Load cache from disk for session continuation.
        
        Args:
            session_id: Session identifier for cache file naming
            
        Returns:
            True if successful and cache was loaded, False otherwise
        """
        try:
            cache_file = os.path.join(self.cache_dir, f"cache_{session_id}.pkl")
            
            if not os.path.exists(cache_file):
                logger.info(f"[ConversationCache] No cached data found for session: {session_id}")
                return False
            
            with open(cache_file, 'rb') as f:
                serializable_cache = pickle.load(f)
            
            self.full_cache = serializable_cache.get("full_cache", {})
            loaded_entries = serializable_cache.get("cache_entries", [])
            
            # Reload embeddings for cached entries
            if self.embedding_model:
                for entry in loaded_entries:
                    if not self._is_expired(entry):
                        try:
                            query = entry.get("query", "")
                            embedding = self.embedding_model.encode(query, convert_to_numpy=True)
                            self.embeddings_cache[entry.get("id")] = embedding
                            self.cache_window.append(entry)
                        except Exception as e:
                            logger.warning(f"[ConversationCache] Failed to reload embedding: {e}")
            
            logger.info(f"[ConversationCache] Loaded {len(self.cache_window)} entries from disk (session: {session_id})")
            return True
            
        except Exception as e:
            logger.error(f"[ConversationCache] Failed to load cache from disk: {e}")
            return False
    
    def delete_session_cache(self, session_id: str = "default") -> bool:
        """Delete persisted cache for a session."""
        try:
            cache_file = os.path.join(self.cache_dir, f"cache_{session_id}.pkl")
            if os.path.exists(cache_file):
                os.remove(cache_file)
                logger.info(f"[ConversationCache] Deleted cache file: {cache_file}")
                return True
            return False
        except Exception as e:
            logger.error(f"[ConversationCache] Failed to delete cache: {e}")
            return False
    
    def _compress(self, data: str) -> bytes:
        data_bytes = data.encode('utf-8')
        
        if self.compression_method == "gzip":
            return gzip.compress(data_bytes, compresslevel=6)
        elif self.compression_method == "lz4":
            try:
                return lz4.frame.compress(data_bytes, compression_level=6)
            except Exception:
                logger.warning("LZ4 compression failed, falling back to zlib")
                return zlib.compress(data_bytes, level=6)
        else:
            return zlib.compress(data_bytes, level=6)
    
    def _decompress(self, data: bytes, method: str) -> str:
        try:
            if method == "gzip":
                return gzip.decompress(data).decode('utf-8')
            elif method == "lz4":
                return lz4.frame.decompress(data).decode('utf-8')
            else:
                return zlib.decompress(data).decode('utf-8')
        except Exception as e:
            logger.error(f"[ConversationCache] Decompression failed: {e}")
            return ""
    
    def _is_expired(self, entry: Dict) -> bool:
        try:
            expiry = datetime.fromisoformat(entry.get("ttl_expiry", ""))
            return datetime.now() > expiry
        except Exception:
            return False


def create_cache_manager_from_config(config) -> ConversationCacheManager:
    return ConversationCacheManager(
        window_size=getattr(config, 'CACHE_WINDOW_SIZE', 10),
        max_entries=getattr(config, 'CACHE_MAX_ENTRIES', 50),
        ttl_seconds=getattr(config, 'CACHE_TTL_SECONDS', 1800),
        compression_method=getattr(config, 'CACHE_COMPRESSION_METHOD', 'zlib'),
        embedding_model=getattr(config, 'CACHE_EMBEDDING_MODEL', 'sentence-transformers/all-MiniLM-L6-v2'),
        similarity_threshold=getattr(config, 'CACHE_SIMILARITY_THRESHOLD', 0.85),
        cache_dir=getattr(config, 'CONVERSATION_CACHE_DIR', './data/cache/conversation')
    )
