from typing import Dict, List, Optional

from loguru import logger

from lix_open_cache.config import CacheConfig
from lix_open_cache.hybrid_cache import HybridConversationCache


class SessionContextWindow:

    def __init__(self, session_id: str, config: Optional[CacheConfig] = None, **kwargs):
        self._config = config or CacheConfig()
        c = self._config

        self.session_id = session_id
        self.window_size = kwargs.get("window_size", c.hot_window_size)
        self.ttl_seconds = kwargs.get("ttl_seconds", c.session_ttl_seconds)
        self.max_tokens = kwargs.get("max_tokens", c.session_max_tokens)

        self._hybrid = HybridConversationCache(
            session_id=session_id,
            config=c,
            redis_host=kwargs.get("redis_host", c.redis_host),
            redis_port=kwargs.get("redis_port", c.redis_port),
            redis_db=kwargs.get("redis_db", c.session_redis_db),
            hot_window_size=self.window_size,
            redis_ttl=self.ttl_seconds,
        )
        logger.info(
            f"[SessionContextWindow] session={session_id} initialized "
            f"(hot_window={self.window_size}, ttl={self.ttl_seconds}s)"
        )

    def add_message(self, role: str, content: str, metadata: Optional[Dict] = None) -> int:
        return self._hybrid.add_message(role, content, metadata)

    def get_context(self) -> List[Dict]:
        return self._hybrid.get_context()

    def get_full_history(self) -> List[Dict]:
        return self._hybrid.get_full()

    def smart_context(self, query: str, query_embedding=None, recent_k: int = 10, disk_k: int = 5) -> Dict:
        return self._hybrid.smart_context(query, query_embedding, recent_k, disk_k)

    def get_formatted_context(self, max_lines: int = 50) -> str:
        return self._hybrid.get_formatted_context(max_lines)

    def clear(self) -> bool:
        return self._hybrid.clear()

    def flush_to_disk(self) -> bool:
        return self._hybrid.flush_to_disk()

    def get_stats(self) -> Dict:
        stats = self._hybrid.get_stats()
        stats["ttl_seconds"] = self.ttl_seconds
        stats["max_tokens"] = self.max_tokens
        return stats
