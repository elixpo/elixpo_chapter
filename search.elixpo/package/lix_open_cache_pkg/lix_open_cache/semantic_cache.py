import hashlib
import threading
import time
import json
from typing import Dict, Optional, List, Any

from loguru import logger
import numpy as np

from lix_open_cache.config import CacheConfig
from lix_open_cache.redis_pool import create_redis_client

try:
    import redis
    _REDIS_AVAILABLE = True
except ImportError:
    _REDIS_AVAILABLE = False


class URLEmbeddingCache:

    def __init__(self, session_id: str, config: Optional[CacheConfig] = None, **kwargs):
        self._config = config or CacheConfig()
        c = self._config

        self.session_id = session_id
        self.ttl_seconds = kwargs.get("ttl_seconds", c.url_cache_ttl_seconds)
        self.batch_size = kwargs.get("batch_size", c.url_cache_batch_size)
        self._key_prefix = c.redis_key_prefix
        self.lock = threading.RLock()

        if not _REDIS_AVAILABLE:
            raise RuntimeError("redis-py is required for URLEmbeddingCache")

        redis_host = kwargs.get("redis_host", c.redis_host)
        redis_port = kwargs.get("redis_port", c.redis_port)
        redis_db = kwargs.get("redis_db", c.url_cache_redis_db)

        self.redis_client = create_redis_client(host=redis_host, port=redis_port, db=redis_db, config=c)
        logger.debug(f"[URLEmbeddingCache] session={session_id} ready (db={redis_db})")

    def _get_key(self, url: str) -> str:
        return f"{self._key_prefix}:url_embedding:{url}"

    def get(self, url: str) -> Optional[np.ndarray]:
        with self.lock:
            try:
                cached = self.redis_client.get(self._get_key(url))
                if cached:
                    return np.frombuffer(cached, dtype=np.float32)
                return None
            except Exception as e:
                logger.warning(f"[URLEmbeddingCache] session={self.session_id} get error: {e}")
                return None

    def set(self, url: str, embedding: np.ndarray) -> bool:
        with self.lock:
            try:
                if not isinstance(embedding, np.ndarray):
                    embedding = np.array(embedding, dtype=np.float32)
                self.redis_client.setex(self._get_key(url), self.ttl_seconds, embedding.astype(np.float32).tobytes())
                return True
            except Exception as e:
                logger.warning(f"[URLEmbeddingCache] session={self.session_id} set error: {e}")
                return False

    def batch_set(self, url_embeddings: Dict[str, np.ndarray]) -> Dict[str, bool]:
        results = {}
        with self.lock:
            for url, embedding in url_embeddings.items():
                results[url] = self.set(url, embedding)
        return results

    def get_stats(self) -> Dict:
        try:
            info = self.redis_client.info("memory")
            return {
                "backend": "redis",
                "session_id": self.session_id,
                "redis_memory_used": info.get("used_memory_human", "unknown"),
                "ttl_seconds": self.ttl_seconds,
            }
        except Exception:
            return {"backend": "redis", "status": "error"}


class SemanticCacheRedis:

    def __init__(self, session_id: str, config: Optional[CacheConfig] = None, **kwargs):
        self._config = config or CacheConfig()
        c = self._config

        self.session_id = session_id
        self.ttl_seconds = kwargs.get("ttl_seconds", c.semantic_ttl_seconds)
        self.similarity_threshold = kwargs.get("similarity_threshold", c.semantic_similarity_threshold)
        self.max_items_per_url = kwargs.get("max_items_per_url", c.semantic_max_items_per_url)
        self._key_prefix = c.redis_key_prefix
        self.lock = threading.RLock()

        if not _REDIS_AVAILABLE:
            raise RuntimeError("redis-py is required for SemanticCacheRedis")

        redis_host = kwargs.get("redis_host", c.redis_host)
        redis_port = kwargs.get("redis_port", c.redis_port)
        redis_db = kwargs.get("redis_db", c.semantic_redis_db)

        self.redis_client = create_redis_client(host=redis_host, port=redis_port, db=redis_db, config=c)
        logger.debug(f"[SemanticCache] session={session_id} ready (db={redis_db})")

    def _get_redis_key(self, url: str) -> str:
        return f"{self._key_prefix}:semantic_cache:{self.session_id}:{url}"

    def get(self, url: str, query_embedding: np.ndarray) -> Optional[Dict]:
        with self.lock:
            try:
                cached_data = self.redis_client.get(self._get_redis_key(url))
                if not cached_data:
                    return None
                cache_entry = json.loads(cached_data)
                best_match = None
                best_similarity = 0.0
                query_emb = np.array(query_embedding, dtype=np.float32)
                query_emb = query_emb / (np.linalg.norm(query_emb) + 1e-8)
                for cached_item in cache_entry.get("items", []):
                    cached_emb = np.array(cached_item["embedding"], dtype=np.float32)
                    cached_emb = cached_emb / (np.linalg.norm(cached_emb) + 1e-8)
                    similarity = float(np.dot(cached_emb, query_emb))
                    if similarity > best_similarity:
                        best_similarity = similarity
                        best_match = cached_item
                if best_similarity >= self.similarity_threshold and best_match:
                    logger.debug(f"[SemanticCache] session={self.session_id} HIT: {url} (sim={best_similarity:.3f})")
                    return best_match["response"]
                return None
            except Exception as e:
                logger.warning(f"[SemanticCache] session={self.session_id} get error: {e}")
                return None

    def set(self, url: str, query_embedding: np.ndarray, response: Dict) -> None:
        with self.lock:
            try:
                redis_key = self._get_redis_key(url)
                cached_data = self.redis_client.get(redis_key)
                cache_entry = json.loads(cached_data) if cached_data else {"items": []}
                cache_entry["items"].append({
                    "embedding": query_embedding.tolist() if isinstance(query_embedding, np.ndarray) else query_embedding,
                    "response": response,
                    "timestamp": time.time(),
                })
                if len(cache_entry["items"]) > self.max_items_per_url:
                    cache_entry["items"] = cache_entry["items"][-self.max_items_per_url:]
                self.redis_client.setex(redis_key, self.ttl_seconds, json.dumps(cache_entry).encode("utf-8"))
            except Exception as e:
                logger.warning(f"[SemanticCache] session={self.session_id} set error: {e}")

    def clear_session(self) -> bool:
        with self.lock:
            try:
                pattern = f"{self._key_prefix}:semantic_cache:{self.session_id}:*"
                keys = self.redis_client.keys(pattern)
                if keys:
                    self.redis_client.delete(*keys)
                return True
            except Exception as e:
                logger.warning(f"[SemanticCache] session={self.session_id} clear failed: {e}")
                return False

    def get_stats(self) -> Dict:
        try:
            pattern = f"{self._key_prefix}:semantic_cache:{self.session_id}:*"
            keys = self.redis_client.keys(pattern)
            return {
                "backend": "redis",
                "session_id": self.session_id,
                "cached_urls": len(keys),
                "ttl_seconds": self.ttl_seconds,
                "similarity_threshold": self.similarity_threshold,
            }
        except Exception:
            return {"session_id": self.session_id, "status": "error"}

    def load_for_request(self, request_id: str) -> None:
        pass

    def save_for_request(self, request_id: str) -> None:
        pass
