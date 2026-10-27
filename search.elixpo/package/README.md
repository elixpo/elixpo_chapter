# lixSearch Packages

This directory contains the open-source packages extracted from the lixSearch production system. The package serves as the **single source of truth** — the lixSearch application imports directly from it via thin shim files, eliminating duplicate code and ensuring the community package is always battle-tested against production traffic.

## lix-open-cache

| | |
|---|---|
| **Directory** | [`lix_open_cache_pkg/`](lix_open_cache_pkg/) |
| **PyPI** | [`pip install lix-open-cache`](https://pypi.org/project/lix-open-cache/) |
| **What it does** | Three-layer Redis caching architecture for conversational AI — session context (rolling window + Huffman-compressed disk overflow), semantic query deduplication (cosine similarity), and cross-session URL embedding reuse |

### How it fits into lixSearch

```
lixSearch pipeline
  ├── ragService/semanticCacheRedis.py  ──┐
  ├── ragService/cacheCoordinator.py     ──┤  thin shims that
  ├── sessions/hybrid_conversation_cache.py ┤  re-export from
  ├── sessions/conversation_archive.py   ──┤  the package
  └── sessions/huffman_codec.py          ──┘
                                            ↓
                              package/lix_open_cache_pkg/
                                (single source of truth)
```

Any fix to the caching logic is made once in the package, tested in production via lixSearch, and published to PyPI for the community — no double maintenance.

### Architecture note

The search infrastructure (Playwright browser agents, IPC service, embedding model) is **not** packaged. It lives in `lixsearch/ipcService/` as application code. Only the generic, reusable caching layer is extracted into a package.

## Build & Publish

```bash
./deploy.sh release build cache       # build lix-open-cache wheel
./deploy.sh release pypi cache        # upload to PyPI
./deploy.sh release docker            # push Docker image (includes package)
./deploy.sh release version           # show current version
```

## Research Paper

The caching architecture is described in detail in our paper:
[docs/paper/](../docs/paper/) — *A Three-Layer Caching Architecture for Low-Latency LLM Web Search on Commodity CPU Hardware*
