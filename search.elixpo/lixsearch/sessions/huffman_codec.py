# Shim: delegates to lix_open_cache package (single source of truth)
from lix_open_cache import HuffmanCodec
from lix_open_cache.huffman_codec import encode_str, decode_bytes, MAGIC

__all__ = ["HuffmanCodec", "encode_str", "decode_bytes", "MAGIC"]
