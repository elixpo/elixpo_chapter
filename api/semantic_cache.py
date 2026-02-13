import threading
import time
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from loguru import logger
import numpy as np


class SemanticCache:
    def __init__(self, ttl_seconds: int = 3600, similarity_threshold: float = 0.90):
        self.ttl_seconds = ttl_seconds
        self.similarity_threshold = similarity_threshold
        self.cache: Dict[str, Dict] = {}
        self.lock = threading.RLock()
    
    def get(self, url: str, query_embedding: np.ndarray) -> Optional[Dict]:
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
    
    def get_stats(self) -> Dict:
        with self.lock:
            total_entries = sum(len(v) for v in self.cache.values())
            return {
                "cached_urls": len(self.cache),
                "total_entries": total_entries,
                "ttl_seconds": self.ttl_seconds,
                "similarity_threshold": self.similarity_threshold
            }
