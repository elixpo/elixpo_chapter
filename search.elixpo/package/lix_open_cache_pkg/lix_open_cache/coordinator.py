from typing import Dict, Optional
from datetime import datetime, timezone

from loguru import logger
import numpy as np

from lix_open_cache.config import CacheConfig
from lix_open_cache.semantic_cache import URLEmbeddingCache, SemanticCacheRedis
from lix_open_cache.context_window import SessionContextWindow


class CacheCoordinator:

    def __init__(self, session_id: str, config: Optional[CacheConfig] = None, **kwargs):
        if config is None:
            # Build config from kwargs for backward compatibility
            cfg_kwargs = {}
            if "redis_host" in kwargs:
                cfg_kwargs["redis_host"] = kwargs["redis_host"]
            if "redis_port" in kwargs:
                cfg_kwargs["redis_port"] = int(kwargs["redis_port"])
            if "redis_password" in kwargs:
                cfg_kwargs["redis_password"] = kwargs["redis_password"]
            self._config = CacheConfig(**cfg_kwargs) if cfg_kwargs else CacheConfig.from_env()
        else:
            self._config = config
        c = self._config
        self.session_id = session_id

        try:
            self.url_embedding_cache = URLEmbeddingCache(session_id=session_id, config=c, **kwargs)
            self.semantic_cache = SemanticCacheRedis(session_id=session_id, config=c, **kwargs)
            self.context_window = SessionContextWindow(session_id=session_id, config=c, **kwargs)
            logger.info(
                f"[CacheCoordinator] session={session_id} initialized: "
                f"URLEmbedding(db={c.url_cache_redis_db}), "
                f"SemanticCache(db={c.semantic_redis_db}), "
                f"ContextWindow(db={c.session_redis_db}, {c.hot_window_size} msgs)"
            )
        except Exception as e:
            logger.error(f"[CacheCoordinator] session={session_id} init failed: {e}")
            raise

    def get_url_embedding(self, url: str) -> Optional[np.ndarray]:
        return self.url_embedding_cache.get(url)

    def cache_url_embedding(self, url: str, embedding: np.ndarray) -> bool:
        return self.url_embedding_cache.set(url, embedding)

    def batch_cache_url_embeddings(self, url_embeddings: Dict[str, np.ndarray]) -> Dict[str, bool]:
        return self.url_embedding_cache.batch_set(url_embeddings)

    def get_semantic_response(self, url: str, query_embedding: np.ndarray) -> Optional[Dict]:
        return self.semantic_cache.get(url=url, query_embedding=query_embedding)

    def cache_semantic_response(self, url: str, query_embedding: np.ndarray, response: Dict) -> None:
        self.semantic_cache.set(url=url, query_embedding=query_embedding, response=response)

    def add_message_to_context(self, role: str, content: str, metadata: Optional[Dict] = None) -> int:
        return self.context_window.add_message(role, content, metadata)

    def get_context_messages(self) -> list:
        return self.context_window.get_context()

    def get_formatted_context(self, max_lines: int = 50) -> str:
        return self.context_window.get_formatted_context(max_lines)

    def clear_session_cache(self) -> bool:
        try:
            cache_cleared = self.semantic_cache.clear_session()
            context_cleared = self.context_window.clear()
            return cache_cleared and context_cleared
        except Exception as e:
            logger.warning(f"[CacheCoordinator] session={self.session_id} clear failed: {e}")
            return False

    def clear_context(self) -> bool:
        return self.context_window.clear()

    def get_stats(self) -> Dict:
        return {
            "session_id": self.session_id,
            "url_embedding_cache": self.url_embedding_cache.get_stats(),
            "semantic_cache": self.semantic_cache.get_stats(),
            "context_window": self.context_window.get_stats(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    # Alias used by lixSearch production code
    get_cache_stats = get_stats


class BatchCacheProcessor:
    def __init__(self, url_embedding_cache: URLEmbeddingCache):
        self.cache = url_embedding_cache

    def cache_batch(self, url_embedding_pairs: list) -> Dict:
        stats = {"total": len(url_embedding_pairs), "cached": 0, "failed": 0, "urls": []}
        for url, embedding in url_embedding_pairs:
            try:
                if self.cache.set(url, embedding):
                    stats["cached"] += 1
                else:
                    stats["failed"] += 1
                stats["urls"].append(url)
            except Exception:
                stats["failed"] += 1
        return stats
