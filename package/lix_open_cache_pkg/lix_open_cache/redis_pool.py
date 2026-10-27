import threading
from typing import Optional

from lix_open_cache.config import CacheConfig

_pools = {}
_pools_lock = threading.Lock()


def create_redis_client(
    host: Optional[str] = None,
    port: Optional[int] = None,
    db: int = 0,
    config: Optional[CacheConfig] = None,
    **kwargs,
):
    import redis as _redis

    cfg = config or CacheConfig()
    host = host or cfg.redis_host
    port = int(port or cfg.redis_port)

    pool_key = (host, port, db)

    with _pools_lock:
        if pool_key not in _pools:
            pool_kwargs = dict(
                host=host,
                port=port,
                db=db,
                decode_responses=kwargs.pop("decode_responses", False),
                socket_connect_timeout=kwargs.pop(
                    "socket_connect_timeout", cfg.redis_socket_connect_timeout
                ),
                socket_keepalive=kwargs.pop(
                    "socket_keepalive", cfg.redis_socket_keepalive
                ),
                max_connections=cfg.redis_pool_size,
            )

            password = cfg.redis_password
            if password:
                try:
                    pool = _redis.ConnectionPool(password=password, **pool_kwargs)
                    test_client = _redis.Redis(connection_pool=pool)
                    test_client.ping()
                    _pools[pool_key] = pool
                except _redis.exceptions.AuthenticationError:
                    password = None

            if pool_key not in _pools:
                pool = _redis.ConnectionPool(password=None, **pool_kwargs)
                test_client = _redis.Redis(connection_pool=pool)
                test_client.ping()
                _pools[pool_key] = pool

    return _redis.Redis(connection_pool=_pools[pool_key])
