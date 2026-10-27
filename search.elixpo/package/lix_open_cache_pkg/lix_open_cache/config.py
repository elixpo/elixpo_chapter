import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class CacheConfig:
    # Connection — host from env (deployment-dependent), port hardcoded to production
    redis_host: str = os.getenv("REDIS_HOST", "localhost")
    redis_port: int = int(os.getenv("REDIS_PORT", "9530"))
    redis_key_prefix: str = "elixpo"
    redis_socket_connect_timeout: int = 5
    redis_socket_keepalive: bool = True
    redis_pool_size: int = 50

    # Secrets — always from env, never hardcoded
    redis_password: Optional[str] = os.getenv("REDIS_PASSWORD") or None

    # Session context window — Redis DB 2 (hot messages)
    session_redis_db: int = 2
    session_ttl_seconds: int = 86400
    hot_window_size: int = 20
    session_max_tokens: Optional[int] = None

    # Semantic query cache — Redis DB 0
    semantic_redis_db: int = 0
    semantic_ttl_seconds: int = 300
    semantic_similarity_threshold: float = 0.90
    semantic_max_items_per_url: int = 50

    # URL embedding cache — Redis DB 1
    url_cache_redis_db: int = 1
    url_cache_ttl_seconds: int = 86400
    url_cache_batch_size: int = 100

    # Disk archive (Huffman-compressed .huff files)
    archive_dir: str = "./data/conversations"
    disk_ttl_days: int = 14

    # LRU eviction daemon
    evict_after_minutes: int = 120

    @classmethod
    def from_env(cls, prefix: str = "") -> "CacheConfig":
        """Build config reading overrides from env vars. Only needed for
        external users who want to customize beyond the defaults."""
        p = prefix.upper() + "_" if prefix else ""
        return cls(
            redis_host=os.getenv(f"{p}REDIS_HOST", "localhost"),
            redis_port=int(os.getenv(f"{p}REDIS_PORT", "9530")),
            redis_password=os.getenv(f"{p}REDIS_PASSWORD") or None,
            redis_key_prefix=os.getenv(f"{p}REDIS_KEY_PREFIX", "elixpo"),
            redis_pool_size=int(os.getenv(f"{p}REDIS_POOL_SIZE", "50")),
            session_redis_db=int(os.getenv(f"{p}SESSION_REDIS_DB", "2")),
            session_ttl_seconds=int(os.getenv(f"{p}SESSION_TTL_SECONDS", "86400")),
            hot_window_size=int(os.getenv(f"{p}HOT_WINDOW_SIZE", "20")),
            semantic_redis_db=int(os.getenv(f"{p}SEMANTIC_REDIS_DB", "0")),
            semantic_ttl_seconds=int(os.getenv(f"{p}SEMANTIC_TTL_SECONDS", "300")),
            semantic_similarity_threshold=float(os.getenv(f"{p}SEMANTIC_SIMILARITY_THRESHOLD", "0.90")),
            url_cache_redis_db=int(os.getenv(f"{p}URL_CACHE_REDIS_DB", "1")),
            url_cache_ttl_seconds=int(os.getenv(f"{p}URL_CACHE_TTL_SECONDS", "86400")),
            archive_dir=os.getenv(f"{p}ARCHIVE_DIR", "./data/conversations"),
            disk_ttl_days=int(os.getenv(f"{p}DISK_TTL_DAYS", "14")),
            evict_after_minutes=int(os.getenv(f"{p}EVICT_AFTER_MINUTES", "120")),
        )
