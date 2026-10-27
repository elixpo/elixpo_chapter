import threading
import time
import json
from typing import Dict, List, Optional, Any

from loguru import logger

from lix_open_cache.config import CacheConfig
from lix_open_cache.conversation_archive import ConversationArchive
from lix_open_cache.redis_pool import create_redis_client

try:
    import redis as _redis
    _REDIS_AVAILABLE = True
except ImportError:
    _REDIS_AVAILABLE = False

_archive: Optional[ConversationArchive] = None
_archive_lock = threading.Lock()
_archive_config: Optional[CacheConfig] = None

_eviction_registry: Dict[str, float] = {}
_eviction_registry_lock = threading.Lock()
_eviction_thread_started = False
_eviction_thread_lock = threading.Lock()


def _get_archive(config: Optional[CacheConfig] = None) -> ConversationArchive:
    global _archive, _archive_config
    if config is None:
        config = CacheConfig()
    if _archive is None or _archive_config is not config:
        with _archive_lock:
            if _archive is None or _archive_config is not config:
                _archive = ConversationArchive(
                    archive_dir=config.archive_dir,
                    session_ttl_days=config.disk_ttl_days,
                )
                _archive_config = config
    return _archive


def _update_last_activity(session_id: str) -> None:
    with _eviction_registry_lock:
        _eviction_registry[session_id] = time.time()


def _eviction_loop(redis_client, evict_after_seconds: int, key_prefix: str, config: CacheConfig) -> None:
    logger.info(f"[HybridCache] LRU eviction loop started: evict after {evict_after_seconds}s")
    while True:
        try:
            time.sleep(60)
            cutoff = time.time() - evict_after_seconds
            with _eviction_registry_lock:
                to_evict = [sid for sid, ts in _eviction_registry.items() if ts < cutoff]
            for session_id in to_evict:
                try:
                    _migrate_to_disk(session_id, redis_client, key_prefix, config)
                    with _eviction_registry_lock:
                        _eviction_registry.pop(session_id, None)
                except Exception as e:
                    logger.warning(f"[HybridCache] Eviction failed for session={session_id}: {e}")
        except Exception as e:
            logger.error(f"[HybridCache] Eviction loop error: {e}")


def _migrate_to_disk(session_id: str, redis_client, key_prefix: str, config: CacheConfig) -> None:
    archive = _get_archive(config)
    key = f"{key_prefix}:session_context:{session_id}"
    order_key = f"{key_prefix}:session_order:{session_id}"
    try:
        msg_ids = redis_client.lrange(order_key, 0, -1)
        if not msg_ids:
            return
        turns: List[Dict] = []
        for msg_id in reversed(msg_ids):
            raw = redis_client.get(f"{key}:{msg_id}")
            if raw:
                try:
                    turns.append(json.loads(raw))
                except Exception:
                    pass
        if turns:
            archive.append_turns(session_id, turns)
            pipe = redis_client.pipeline()
            for msg_id in msg_ids:
                pipe.delete(f"{key}:{msg_id}")
            pipe.delete(order_key)
            pipe.execute()
            logger.info(f"[HybridCache] Migrated {len(turns)} turns for session={session_id} to disk")
    except Exception as e:
        logger.error(f"[HybridCache] _migrate_to_disk session={session_id}: {e}")


def _start_eviction_thread(redis_client, evict_after_seconds: int, key_prefix: str, config: CacheConfig) -> None:
    global _eviction_thread_started
    with _eviction_thread_lock:
        if not _eviction_thread_started:
            t = threading.Thread(
                target=_eviction_loop,
                args=(redis_client, evict_after_seconds, key_prefix, config),
                daemon=True,
                name="hybrid-cache-lru-evictor",
            )
            t.start()
            _eviction_thread_started = True


class HybridConversationCache:

    def __init__(self, session_id: str, config: Optional[CacheConfig] = None, **kwargs):
        self._config = config or CacheConfig()
        c = self._config

        self.session_id = session_id
        self.hot_window_size = kwargs.get("hot_window_size", c.hot_window_size)
        self.redis_ttl = kwargs.get("redis_ttl", c.session_ttl_seconds)
        self._key_prefix = c.redis_key_prefix
        self.archive = _get_archive(c)
        self._lock = threading.RLock()

        redis_host = kwargs.get("redis_host", c.redis_host)
        redis_port = kwargs.get("redis_port", c.redis_port)
        redis_db = kwargs.get("redis_db", c.session_redis_db)
        evict_after_minutes = kwargs.get("evict_after_minutes", c.evict_after_minutes)

        self._redis: Optional[Any] = None
        if _REDIS_AVAILABLE:
            try:
                self._redis = create_redis_client(host=redis_host, port=redis_port, db=redis_db, config=c)
                _start_eviction_thread(self._redis, evict_after_minutes * 60, self._key_prefix, c)
                logger.debug(f"[HybridCache] session={session_id} Redis connected (db={redis_db}, hot_window={self.hot_window_size})")
            except Exception as e:
                logger.warning(f"[HybridCache] session={session_id} Redis unavailable ({e}), falling back to disk-only")
                self._redis = None

        _update_last_activity(session_id)

    @property
    def _ctx_key(self) -> str:
        return f"{self._key_prefix}:session_context:{self.session_id}"

    @property
    def _order_key(self) -> str:
        return f"{self._key_prefix}:session_order:{self.session_id}"

    def add_message(self, role: str, content: str, metadata: Optional[Dict] = None, embedding=None) -> int:
        _update_last_activity(self.session_id)
        ts = time.time()
        turn_id = int(ts * 1000) % (2**31)
        msg = {"role": role, "content": content, "timestamp": ts, "metadata": metadata or {}}
        if embedding is not None:
            try:
                import numpy as np
                msg["embedding"] = embedding.tolist() if hasattr(embedding, "tolist") else list(embedding)
            except Exception:
                pass
        with self._lock:
            if self._redis:
                return self._add_to_redis(msg, turn_id)
            else:
                self.archive.append_turn(self.session_id, msg)
                return 1

    def _add_to_redis(self, msg: Dict, turn_id: int) -> int:
        try:
            ctx_key = self._ctx_key
            order_key = self._order_key
            msg_key = f"{ctx_key}:{turn_id}"
            pipe = self._redis.pipeline()
            pipe.setex(msg_key, self.redis_ttl, json.dumps(msg).encode("utf-8"))
            pipe.lpush(order_key, turn_id)
            pipe.expire(order_key, self.redis_ttl)
            pipe.execute()

            window_len = self._redis.llen(order_key)
            if window_len > self.hot_window_size:
                excess = window_len - self.hot_window_size
                for _ in range(excess):
                    old_id = self._redis.rpop(order_key)
                    if old_id:
                        old_key = f"{ctx_key}:{old_id.decode() if isinstance(old_id, bytes) else old_id}"
                        raw = self._redis.get(old_key)
                        if raw:
                            try:
                                self.archive.append_turn(self.session_id, json.loads(raw))
                            except Exception:
                                pass
                            self._redis.delete(old_key)
            return min(window_len, self.hot_window_size)
        except Exception as e:
            logger.warning(f"[HybridCache] session={self.session_id} _add_to_redis failed: {e}")
            self.archive.append_turn(self.session_id, msg)
            return 0

    def get_context(self) -> List[Dict]:
        _update_last_activity(self.session_id)
        if self._redis:
            messages = self._get_from_redis()
            if messages:
                self._refresh_redis_ttl()
                return messages
            disk_messages = self.archive.load_all(self.session_id) or []
            if disk_messages:
                logger.info(f"[HybridCache] session={self.session_id} recovered {len(disk_messages)} messages from disk")
                recent = disk_messages[-self.hot_window_size:]
                for msg in recent:
                    try:
                        ts = msg.get("timestamp", time.time())
                        turn_id = int(ts * 1000) % (2**31)
                        msg_key = f"{self._ctx_key}:{turn_id}"
                        pipe = self._redis.pipeline()
                        pipe.setex(msg_key, self.redis_ttl, json.dumps(msg).encode("utf-8"))
                        pipe.lpush(self._order_key, turn_id)
                        pipe.expire(self._order_key, self.redis_ttl)
                        pipe.execute()
                    except Exception:
                        break
            return disk_messages
        return self.archive.load_all(self.session_id) or []

    def _get_from_redis(self) -> List[Dict]:
        try:
            msg_ids = self._redis.lrange(self._order_key, 0, -1)
            messages: List[Dict] = []
            for msg_id in reversed(msg_ids):
                mid = msg_id.decode() if isinstance(msg_id, bytes) else msg_id
                raw = self._redis.get(f"{self._ctx_key}:{mid}")
                if raw:
                    try:
                        messages.append(json.loads(raw))
                    except Exception:
                        pass
            return messages
        except Exception as e:
            logger.warning(f"[HybridCache] session={self.session_id} _get_from_redis failed: {e}")
            return []

    def _refresh_redis_ttl(self) -> None:
        try:
            msg_ids = self._redis.lrange(self._order_key, 0, -1)
            if not msg_ids:
                return
            pipe = self._redis.pipeline()
            pipe.expire(self._order_key, self.redis_ttl)
            for msg_id in msg_ids:
                mid = msg_id.decode() if isinstance(msg_id, bytes) else msg_id
                pipe.expire(f"{self._ctx_key}:{mid}", self.redis_ttl)
            pipe.execute()
        except Exception:
            pass

    def get_full(self) -> List[Dict]:
        disk_turns = self.archive.load_all(self.session_id) or []
        hot_turns = self._get_from_redis() if self._redis else []
        disk_ts = {t.get("timestamp") for t in disk_turns}
        new_turns = [t for t in hot_turns if t.get("timestamp") not in disk_ts]
        if new_turns:
            try:
                self.archive.append_turns(self.session_id, new_turns)
            except Exception:
                pass
            disk_turns.extend(new_turns)
        disk_turns.sort(key=lambda t: t.get("timestamp", 0))
        return disk_turns

    def smart_context(self, query: str, query_embedding=None, recent_k: int = 10, disk_k: int = 5) -> Dict[str, List[Dict]]:
        recent = self.get_context()[-recent_k:]
        relevant: List[Dict] = []
        has_disk = self.archive.session_exists(self.session_id)
        if query_embedding is not None and has_disk:
            try:
                relevant = self.archive.search_by_embedding(self.session_id, query_embedding, top_k=disk_k)
            except Exception:
                relevant = self.archive.search_by_text(self.session_id, query, top_k=disk_k)
        elif has_disk and len(recent) < recent_k:
            relevant = self.archive.search_by_text(self.session_id, query, top_k=disk_k)
        return {"recent": recent, "relevant": relevant}

    def get_formatted_context(self, max_lines: int = 50) -> str:
        messages = self.get_context()
        lines = []
        for msg in messages:
            role = msg.get("role", "unknown").capitalize()
            content = msg.get("content", "")
            if content:
                lines.append(f"{role}: {content[:200]}")
        if len(lines) > max_lines:
            lines = lines[-max_lines:]
        return "\n".join(lines)

    def flush_to_disk(self) -> bool:
        if not self._redis:
            return True
        try:
            _migrate_to_disk(self.session_id, self._redis, self._key_prefix, self._config)
            return True
        except Exception as e:
            logger.error(f"[HybridCache] session={self.session_id} flush_to_disk failed: {e}")
            return False

    def clear(self) -> bool:
        try:
            if self._redis:
                msg_ids = self._redis.lrange(self._order_key, 0, -1)
                pipe = self._redis.pipeline()
                for mid in msg_ids:
                    mid_str = mid.decode() if isinstance(mid, bytes) else mid
                    pipe.delete(f"{self._ctx_key}:{mid_str}")
                pipe.delete(self._order_key)
                pipe.execute()
            return True
        except Exception as e:
            logger.warning(f"[HybridCache] session={self.session_id} clear failed: {e}")
            return False

    def delete_session(self) -> bool:
        self.clear()
        return self.archive.delete_session(self.session_id)

    def get_stats(self) -> Dict:
        hot_count = 0
        try:
            if self._redis:
                hot_count = self._redis.llen(self._order_key)
        except Exception:
            pass
        disk_meta = self.archive.get_metadata(self.session_id) or {}
        return {
            "session_id": self.session_id,
            "hot_messages": hot_count,
            "hot_window_size": self.hot_window_size,
            "disk_turns": disk_meta.get("num_turns", 0),
            "disk_size_bytes": disk_meta.get("size_bytes", 0),
        }
