# Shim: delegates to lix_open_cache package (single source of truth)
from lix_open_cache import ConversationArchive
from lix_open_cache.conversation_archive import _MAGIC, _HEADER_SIZE

__all__ = ["ConversationArchive", "_MAGIC", "_HEADER_SIZE"]
