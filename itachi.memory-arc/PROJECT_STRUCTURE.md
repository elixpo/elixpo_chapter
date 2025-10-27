# Project Structure

This document describes the organization of the Memory-Arc project.

## Directory Layout

```
Memory-Arc/
├── adapters/              # AI adapter implementations
│   ├── __init__.py
│   ├── ai_adapter.py     # Abstract base class
│   ├── anthropic.py      # Anthropic Claude adapter
│   ├── huggingface.py    # HuggingFace adapter
│   ├── ollama.py         # Ollama local models adapter
│   ├── openai.py         # OpenAI GPT adapter
│   └── registry.py       # Adapter registry and discovery
│
├── core/                  # Core memory system components
│   ├── __init__.py
│   ├── memory_manager.py # Main MemoryManager class
│   ├── models.py         # Data models (MemoryEntry, etc.)
│   ├── processors.py     # Processing strategies (AI, Heuristic, Hybrid)
│   └── vector_memory.py  # Vector database interface (Qdrant)
│
├── examples/              # Usage examples
│   ├── ai_adapters.py    # AI adapter examples
│   ├── basic_config.py   # Basic configuration example
│   ├── custom_adapter.py # Custom adapter creation
│   ├── hybrid_mode.py    # Hybrid mode example
│   └── presets.py        # Preset configurations example
│
├── tests/                 # Test suite
│   ├── __init__.py
│   ├── test_config_*.py  # Configuration tests
│   ├── test_cost_*.py    # Cost tracking tests
│   ├── test_processor_*.py # Processor tests
│   └── ...               # Additional tests
│
├── utils/                 # Utility modules
│   ├── __init__.py
│   └── persistence.py    # JSON save/load utilities
│
├── __init__.py           # Package initialization
├── config.py             # Configuration classes
├── presets.py            # Built-in preset configurations
│
├── .gitignore            # Git ignore rules
├── CHANGELOG.md          # Version history
├── CONTRIBUTING.md       # Contribution guidelines
├── LICENSE               # MIT License
├── QUICKSTART.md         # Quick start guide
├── README.md             # Main documentation
├── requirements.txt      # Core dependencies
├── requirements-dev.txt  # Development dependencies
└── setup.py              # Package setup configuration
```

## Module Descriptions

### Core Modules

#### `config.py`
Configuration system with three main classes:
- `MemoryConfig`: Main configuration
- `HeuristicConfig`: Heuristic processing settings
- `HybridConfig`: Hybrid mode settings

Features:
- Preset loading
- File loading (JSON/YAML)
- Validation
- Override support

#### `presets.py`
Built-in preset configurations:
- `CHATBOT`: Hybrid mode for conversational AI
- `CODING_AGENT`: Heuristic mode for code assistants
- `ASSISTANT`: AI mode for task assistants
- `OFFLINE`: Heuristic mode for offline use

#### `core/memory_manager.py`
Main interface for memory operations:
- `add_message()`: Store messages
- `search_memory()`: Semantic search
- `get_recent_messages()`: Retrieve STM
- `get_metrics()`: Processing statistics
- `reset_memory()`: Clear memory

#### `core/processors.py`
Processing strategy implementations:
- `AIProcessor`: Uses AI adapters
- `HeuristicProcessor`: Rule-based processing
- `HybridProcessor`: Intelligent switching
- `DisabledProcessor`: No processing

#### `core/vector_memory.py`
Vector database interface:
- Qdrant integration
- Embedding generation
- Semantic search
- Memory storage

#### `core/models.py`
Data models:
- `MemoryEntry`: Message representation
- `ProcessingMetrics`: Statistics tracking

### Adapter System

#### `adapters/ai_adapter.py`
Abstract base class defining the adapter interface:
- `summarize_conversation()`
- `extract_facts()`
- `score_importance()`

#### `adapters/registry.py`
Adapter registry for discovery and instantiation:
- `register()`: Register custom adapters
- `get()`: Get adapter instance
- `list()`: List available adapters
- `describe()`: Get adapter information

#### Built-in Adapters
- `openai.py`: OpenAI GPT models
- `anthropic.py`: Anthropic Claude models
- `ollama.py`: Local Ollama models
- `huggingface.py`: HuggingFace models

### Utilities

#### `utils/persistence.py`
JSON persistence utilities:
- Async file I/O
- Error handling
- Directory management

## Data Storage

### Short-Term Memory (STM)

```
data/
└── contexts/
    └── {context_id}/
        └── memory.json
```

Format:
```json
{
  "stm": {
    "thread_1": [
      {
        "role": "user",
        "content": "...",
        "metadata": {...},
        "timestamp": "..."
      }
    ]
  }
}
```

### Long-Term Memory (LTM)

```
data/
└── vector_db/
    └── {context_id}/  (Qdrant collection)
```

Each vector point contains:
- Embedding (384-dim)
- Payload: `{summary, importance, created_at}`

## Configuration Files

### `requirements.txt`
Core dependencies:
- `qdrant-client`: Vector database
- `sentence-transformers`: Embeddings
- `pyyaml`: Configuration files
- Optional: AI adapters, heuristic tools

### `requirements-dev.txt`
Development dependencies:
- `pytest`: Testing framework
- `black`: Code formatting
- `flake8`: Linting
- `mypy`: Type checking

### `.gitignore`
Excludes:
- Python cache files
- Virtual environments
- Data directories
- IDE files
- Development artifacts

## Examples

### `examples/basic_config.py`
Demonstrates:
- Basic configuration
- Heuristic mode
- Message storage
- Metrics retrieval

### `examples/presets.py`
Demonstrates:
- All preset configurations
- Preset overriding
- Practical usage

### `examples/ai_adapters.py`
Demonstrates:
- OpenAI adapter
- Ollama adapter
- Custom adapter creation
- Adapter registry

### `examples/hybrid_mode.py`
Demonstrates:
- Hybrid configuration
- Importance-based routing
- Fallback behavior
- Metrics analysis

### `examples/custom_adapter.py`
Demonstrates:
- Creating custom adapters
- Wrapper adapters (logging, caching)
- Adapter registration
- Integration with memory system

## Tests

### Test Organization

```
tests/
├── test_config_*.py       # Configuration tests
├── test_processor_*.py    # Processor tests
├── test_memory_*.py       # Memory manager tests
├── test_cost_*.py         # Cost tracking tests
└── test_*.py              # Additional tests
```

### Running Tests

```bash
# All tests
pytest

# Specific test file
pytest tests/test_config_simple.py

# With coverage
pytest --cov=. --cov-report=html
```

## Development Workflow

1. **Setup**: Install dependencies from `requirements-dev.txt`
2. **Code**: Follow style guidelines in `CONTRIBUTING.md`
3. **Test**: Write tests for new features
4. **Format**: Run `black .` and `isort .`
5. **Lint**: Run `flake8 .`
6. **Commit**: Use conventional commit messages
7. **PR**: Submit pull request with description

## Documentation

### User Documentation
- `README.md`: Main documentation with architecture diagrams
- `QUICKSTART.md`: 5-minute getting started guide
- `CHANGELOG.md`: Version history and migration guides

### Developer Documentation
- `CONTRIBUTING.md`: Contribution guidelines
- `PROJECT_STRUCTURE.md`: This file
- Code docstrings: API documentation

## Package Distribution

### Installation

```bash
# From source
pip install -e .

# With extras
pip install -e ".[ai]"      # AI adapters
pip install -e ".[heuristics]"  # Enhanced heuristics
pip install -e ".[dev]"     # Development tools
pip install -e ".[all]"     # Everything
```

### Building

```bash
# Build distribution
python setup.py sdist bdist_wheel

# Install locally
pip install dist/memory-system-0.1.0.tar.gz
```

## Key Design Patterns

### Strategy Pattern
Processing modes (AI, Heuristic, Hybrid) implement the same interface.

### Registry Pattern
Adapter registry for plugin architecture.

### Factory Pattern
Configuration creates appropriate processors.

### Decorator Pattern
Wrapper adapters (logging, caching) enhance base adapters.

## Extension Points

### Adding New Adapters
1. Implement `AIAdapter` interface
2. Register with `AdapterRegistry`
3. Add tests
4. Update documentation

### Adding New Presets
1. Define in `presets.py`
2. Add example usage
3. Document in README

### Adding New Heuristics
1. Implement in `core/processors.py`
2. Add configuration option
3. Add tests
4. Update documentation

## Best Practices

### Code Style
- Follow PEP 8
- Use type hints
- Write docstrings
- Keep functions small

### Testing
- Write tests for new features
- Maintain coverage >80%
- Use fixtures for setup
- Mock external dependencies

### Documentation
- Update README for user-facing changes
- Add docstrings to public APIs
- Include code examples
- Keep CHANGELOG current

### Git
- Use feature branches
- Write clear commit messages
- Keep commits atomic
- Squash before merging

## Maintenance

### Regular Tasks
- Update dependencies
- Run security audits
- Review and merge PRs
- Update documentation
- Release new versions

### Monitoring
- Track GitHub issues
- Monitor discussions
- Review pull requests
- Update roadmap

---

For more information, see:
- [README.md](README.md) - Main documentation
- [CONTRIBUTING.md](CONTRIBUTING.md) - How to contribute
- [QUICKSTART.md](QUICKSTART.md) - Getting started
