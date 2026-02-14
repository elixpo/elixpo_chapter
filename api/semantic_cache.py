import threading
import time
import json
import pickle
import os
from typing import Dict, Optional
from loguru import logger
from pathlib import Path
import numpy as np


class SemanticCache:
    def __init__(self, ttl_seconds: int = 300, similarity_threshold: float = 0.90, cache_dir: str = "./cache"):
        self.ttl_seconds = ttl_seconds
        self.similarity_threshold = similarity_threshold
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        self.cache: Dict[str, Dict] = {}
        self.lock = threading.RLock()
        
        # Cleanup expired entries on startup
        self._cleanup_expired_on_startup()
        logger.info(f"[SemanticCache] Initialized with TTL={ttl_seconds}s, cache_dir={cache_dir}")
    
    def _get_request_cache_path(self, request_id: str) -> Path:
        """Get the file path for a request's cache"""
        return self.cache_dir / f"cache_{request_id}.pkl"
    
    def _cleanup_expired_on_startup(self):
        """Remove all expired cache files on startup"""
        if not self.cache_dir.exists():
            return
        
        current_time = time.time()
        expired_count = 0
        
        for cache_file in self.cache_dir.glob("cache_*.pkl"):
            try:
                # Check file age
                file_age = current_time - os.path.getmtime(cache_file)
                if file_age > self.ttl_seconds:
                    cache_file.unlink()
                    expired_count += 1
                    request_id = cache_file.stem.replace("cache_", "")
                    logger.info(f"[SemanticCache] Removed expired cache: {request_id}")
            except Exception as e:
                logger.warning(f"[SemanticCache] Failed to cleanup {cache_file}: {e}")
        
        if expired_count > 0:
            logger.info(f"[SemanticCache] Cleaned up {expired_count} expired cache file(s) on startup")
    
    def _cleanup_runtime(self):
        """Remove expired entries from in-memory cache during runtime"""
        with self.lock:
            current_time = time.time()
            expired_urls = []
            
            for url, url_cache in self.cache.items():
                expired_keys = [
                    key for key, entry in url_cache.items()
                    if current_time - entry["created_at"] > self.ttl_seconds
                ]
                
                for key in expired_keys:
                    del url_cache[key]
                
                # Remove empty URL entries
                if not url_cache:
                    expired_urls.append(url)
            
            for url in expired_urls:
                del self.cache[url]
            
            if expired_urls:
                logger.debug(f"[SemanticCache] Cleaned up {len(expired_urls)} expired URL entries")
    
    def load_for_request(self, request_id: str) -> bool:
        """Load cache for a specific request from disk"""
        cache_path = self._get_request_cache_path(request_id)
        
        if not cache_path.exists():
            logger.debug(f"[SemanticCache] No cache found for request {request_id}")
            return False
        
        try:
            with open(cache_path, 'rb') as f:
                self.cache = pickle.load(f)
            
            # Cleanup expired entries after loading
            self._cleanup_runtime()
            logger.info(f"[SemanticCache] Loaded cache for request {request_id}")
            return True
        except Exception as e:
            logger.error(f"[SemanticCache] Failed to load cache for {request_id}: {e}")
            return False
    
    def save_for_request(self, request_id: str) -> bool:
        """Save cache for a specific request to disk"""
        cache_path = self._get_request_cache_path(request_id)
        
        try:
            with self.lock:
                with open(cache_path, 'wb') as f:
                    pickle.dump(self.cache, f)
            logger.info(f"[SemanticCache] Saved cache for request {request_id}")
            return True
        except Exception as e:
            logger.error(f"[SemanticCache] Failed to save cache for {request_id}: {e}")
            return False
    
    def get(self, url: str, query_embedding: np.ndarray) -> Optional[Dict]:
        """Get cached response for URL with semantic similarity matching"""
        with self.lock:
            if url not in self.cache:
                return None
            
            url_cache = self.cache[url]
            current_time = time.time()
            
            best_match = None
            best_similarity = 0.0
            
            expired_keys = []
            for cache_key, cache_entry in url_cache.items():
                age = current_time - cache_entry["created_at"]
                
                if age > self.ttl_seconds:
                    expired_keys.append(cache_key)
                    continue
                
                cached_emb = np.array(cache_entry["query_embedding"], dtype=np.float32)
                query_emb = np.array(query_embedding, dtype=np.float32)
                
                cached_emb = cached_emb / (np.linalg.norm(cached_emb) + 1e-8)
                query_emb = query_emb / (np.linalg.norm(query_emb) + 1e-8)
                
                similarity = float(np.dot(cached_emb, query_emb))
                
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_match = cache_entry
            
            for key in expired_keys:
                del url_cache[key]
            
            if best_similarity >= self.similarity_threshold and best_match:
                logger.debug(f"[SemanticCache] HIT for {url} (similarity: {best_similarity:.3f})")
                return best_match["response"]
            
            return None
    
    def set(self, url: str, query_embedding: np.ndarray, response: Dict) -> None:
        """Store response in cache with semantic indexing"""
        with self.lock:
            if url not in self.cache:
                self.cache[url] = {}
            
            cache_key = hash(query_embedding.tobytes()) % (2**31)
            
            self.cache[url][cache_key] = {
                "query_embedding": query_embedding.tolist() if isinstance(query_embedding, np.ndarray) else query_embedding,
                "response": response,
                "created_at": time.time()
            }
            
            if len(self.cache[url]) > 100:
                oldest_key = min(self.cache[url].keys(), 
                               key=lambda k: self.cache[url][k]["created_at"])
                del self.cache[url][oldest_key]
    
    def clear_request(self, request_id: str) -> bool:
        """Clear cache for a specific request"""
        cache_path = self._get_request_cache_path(request_id)
        
        try:
            if cache_path.exists():
                cache_path.unlink()
            with self.lock:
                self.cache.clear()
            logger.info(f"[SemanticCache] Cleared cache for request {request_id}")
            return True
        except Exception as e:
            logger.error(f"[SemanticCache] Failed to clear cache for {request_id}: {e}")
            return False
    
    def get_stats(self) -> Dict:
        """Get cache statistics"""
        with self.lock:
            total_entries = sum(len(v) for v in self.cache.values())
            cache_files = len(list(self.cache_dir.glob("cache_*.pkl")))
            return {
                "cached_urls": len(self.cache),
                "total_entries": total_entries,
                "cache_files_on_disk": cache_files,
                "ttl_seconds": self.ttl_seconds,
                "similarity_threshold": self.similarity_threshold
            }
