# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of configurable memory system
- Multiple processing modes: AI, heuristic, hybrid, and disabled
- Pluggable AI adapter system with built-in adapters:
  - OpenAI (GPT models)
  - Anthropic (Claude models)
  - Ollama (local models)
  - HuggingFace (open-source models)
- Adapter registry for custom adapter registration
- Heuristic processing with KeyBERT, spaCy NER, and rule-based methods
- Hybrid mode with intelligent AI/heuristic switching
- **Multiple embedding models with automatic downloads:**
  - Default: all-MiniLM-L6-v2 (fast, lightweight, included)
  - Enhanced: BAAI/bge-m3 (better quality, downloads on first use)
  - Code: jinaai/jina-embeddings-v2-base-code (code-optimized, downloads on first use)
  - Custom: Support for any HuggingFace model
- Built-in presets for common use cases:
  - Chatbot (hybrid mode, default embeddings)
  - Chatbot Enhanced (hybrid mode, enhanced embeddings)
  - Coding agent (heuristic mode, code embeddings)
  - Coding agent Enhanced (hybrid mode, code embeddings)
  - Assistant (AI mode, enhanced embeddings)
  - Offline (heuristic mode, default embeddings)
- Configuration system with file loading (JSON/YAML)
- Comprehensive metrics tracking
- Cost optimization features:
  - Caching
  - Rate limiting
  - Selective AI usage
- Short-term memory (STM) with JSON persistence
- Long-term memory (LTM) with Qdrant vector storage
- Async-first API
- Graceful error handling and fallback strategies
- Backward compatibility with legacy API
- Model management utilities for checking and downloading models
- Comprehensive examples and documentation

### Changed
- Migrated from ChromaDB to Qdrant for vector storage
- Refactored from Discord-specific to platform-agnostic
- Replaced direct AI adapter calls with processor pattern
- Improved configuration validation

### Deprecated
- Legacy constructor parameters (still supported for backward compatibility)

### Removed
- Discord-specific dependencies and logic
- Platform-specific UI components
- User opt-out database logic

### Fixed
- N/A (initial release)

### Security
- API key handling and validation
- Configuration file sanitization
- Regex pattern validation to prevent ReDoS

## [0.1.0] - 2024-XX-XX

### Added
- Initial development release
- Core memory management functionality
- Basic AI adapter support
- STM and LTM storage

---

## Version History

- **Unreleased**: Current development version
- **0.1.0**: Initial development release

## Migration Guide

### From Legacy API

The legacy API is still supported for backward compatibility:

```python
# Old way (still works)
memory = MemoryManager(
    context_id="user_123",
    ai_adapter=my_adapter
)

# New way (recommended)
config = MemoryConfig(
    mode="ai",
    ai_adapter_name="openai"
)
memory = MemoryManager(
    context_id="user_123",
    config=config
)
```

### Breaking Changes

None in this release. The system maintains full backward compatibility.

## Roadmap

See [README.md](README.md#-roadmap) for planned features and improvements.
