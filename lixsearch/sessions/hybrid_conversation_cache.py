# Shim: delegates to lix_open_cache package (single source of truth)
from lix_open_cache import HybridConversationCache, _get_archive
from lix_open_cache.hybrid_cache import (
    _update_last_activity,
    _eviction_registry,
    _migrate_to_disk,
    _start_eviction_thread,
)

__all__ = [
    "HybridConversationCache",
    "_get_archive",
    "_update_last_activity",
    "_eviction_registry",
    "_migrate_to_disk",
    "_start_eviction_thread",
]
