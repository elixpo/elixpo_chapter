# lix-open-cache

Standalone multi-layer caching and session management for conversational AI. Works with just Redis — no server needed.

```bash
pip install lix-open-cache
```

## Quick Start

```python
from lix_open_cache import CacheConfig, CacheCoordinator

config = CacheConfig(redis_host="localhost", redis_port=6379)
cache = CacheCoordinator(session_id="user-abc", config=config)

# Store & retrieve conversation context
cache.add_message_to_context("user", "What's the weather in Tokyo?")
cache.add_message_to_context("assistant", "22C and sunny.")
history = cache.get_context_messages()

# Semantic cache — skip LLM on similar queries
import numpy as np
embedding = np.random.rand(384).astype(np.float32)
cached = cache.get_semantic_response("https://weather.com", embedding)
```

## Three Cache Layers

| Layer | Purpose | Backend | TTL |
|-------|---------|---------|-----|
| Session Context Window | Rolling 20-message window + disk overflow | Redis DB 2 + `.huff` files | 24h |
| Semantic Query Cache | Deduplicate similar queries (cosine >= 0.90) | Redis DB 0 | 5 min |
| URL Embedding Cache | Cache embedding vectors per URL | Redis DB 1 | 24h |

## Key Features

- **Two-tier hybrid storage** — Redis hot window + Huffman-compressed disk archive
- **LRU eviction daemon** — auto-migrates idle sessions to disk, re-hydrates on return
- **smart_context()** — recent messages + semantically relevant history from disk
- **Pure Python Huffman codec** — ~54% compression, zero native dependencies
- **CacheConfig dataclass** — all tunables in one place, 12-factor env var support

## Dependencies

Only 3: `redis`, `numpy`, `loguru`

## Research Paper

> **A Three-Layer Caching Architecture for Low-Latency LLM Web Search on Commodity CPU Hardware**
> Ayushman Bhattacharya, 2026
> [Read the paper](https://github.com/Circuit-Overtime/lixSearch/blob/main/docs/paper/lix_cache_paper.pdf)

## License

MIT
