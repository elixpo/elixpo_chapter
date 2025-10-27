# Contributing to Memory-Arc

Thank you for your interest in contributing to Memory-Arc! This document provides guidelines and instructions for contributing to the project.

## 🤖 AI-Powered Assistance

Memory-Arc uses AI to help with contributions! When you open a PR or issue, you'll get:

- **🎉 Personalized Welcome** (first-time contributors)
- **🔍 Automated Code Review** with suggestions
- **🧪 Test Result Summaries** with AI analysis
- **📊 Code Quality Reports** with recommendations
- **💬 Issue Analysis** and categorization

Check out [.github/AUTOMATIONS.md](.github/AUTOMATIONS.md) for details!

## Code of Conduct

Be respectful, inclusive, and professional in all interactions.

## Getting Started

### Development Setup

1. **Fork and clone the repository**

```bash
git clone https://github.com/Itachi-1824/Memory-Arc.git
cd Memory-Arc
```

2. **Create a virtual environment**

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies**

```bash
pip install -r requirements-dev.txt
```

4. **Run tests to verify setup**

```bash
pytest
```

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions or updates

### 2. Make Your Changes

- Write clean, readable code
- Follow existing code style
- Add tests for new functionality
- Update documentation as needed

### 3. Run Tests and Linters

```bash
# Run tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Format code
black .

# Sort imports
isort .

# Lint code
flake8 .

# Type checking
mypy .
```

### 4. Commit Your Changes

Write clear, descriptive commit messages:

```bash
git commit -m "feat: add custom adapter support"
git commit -m "fix: resolve hybrid mode fallback issue"
git commit -m "docs: update API reference"
```

Commit message format:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test changes
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `chore:` - Maintenance tasks

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub with:
- Clear title and description
- Reference to related issues
- Screenshots/examples if applicable

## Code Style Guidelines

### Python Style

- Follow PEP 8
- Use type hints
- Maximum line length: 100 characters
- Use docstrings for all public functions/classes

Example:

```python
async def add_message(
    self,
    thread_id: str,
    role: str,
    content: str,
    metadata: dict[str, Any] | None = None
) -> None:
    """Add a message to memory.
    
    Args:
        thread_id: Unique identifier for the conversation thread
        role: Message role (user, assistant, system)
        content: Message content
        metadata: Optional metadata dictionary
        
    Raises:
        ValueError: If role is invalid
    """
    pass
```

### Documentation

- Use clear, concise language
- Include code examples
- Update README.md for user-facing changes
- Add docstrings for all public APIs

### Testing

- Write tests for all new features
- Maintain or improve code coverage
- Use descriptive test names
- Include both positive and negative test cases

Example:

```python
async def test_add_message_stores_in_stm():
    """Test that add_message correctly stores message in STM."""
    memory = MemoryManager(context_id="test", config=MemoryConfig())
    await memory.add_message("thread_1", "user", "Hello")
    
    messages = memory.get_recent_messages("thread_1")
    assert len(messages) == 1
    assert messages[0]["content"] == "Hello"
```

## Areas for Contribution

### High Priority

- [ ] Additional AI adapter implementations
- [ ] Performance optimizations
- [ ] Documentation improvements
- [ ] Bug fixes

### Medium Priority

- [ ] Additional heuristic methods
- [ ] Enhanced metrics and analytics
- [ ] Configuration validation improvements
- [ ] Example applications

### Low Priority

- [ ] UI/dashboard for metrics
- [ ] Additional vector DB backends
- [ ] Memory compression strategies
- [ ] Export/import functionality

## Adding New Features

### Adding a New AI Adapter

1. Create a new file in `adapters/`
2. Implement the `AIAdapter` interface
3. Register in `AdapterRegistry`
4. Add tests
5. Update documentation

Example:

```python
# adapters/my_adapter.py
from adapters.ai_adapter import AIAdapter

class MyAdapter(AIAdapter):
    def __init__(self, api_key: str, **kwargs):
        self.api_key = api_key
    
    async def summarize_conversation(self, messages: list[dict]) -> str | None:
        # Implementation
        pass
    
    async def extract_facts(self, messages: list[dict]) -> list[dict]:
        # Implementation
        pass
    
    async def score_importance(self, text: str) -> int:
        # Implementation
        pass
```

### Adding a New Preset

1. Add to `presets.py`
2. Document in README.md
3. Add example usage
4. Add tests

### Adding a New Heuristic Method

1. Implement in `core/processors.py`
2. Add configuration option
3. Add tests
4. Update documentation

## Testing Guidelines

### Test Structure

```
tests/
├── unit/           # Unit tests for individual components
├── integration/    # Integration tests
└── fixtures/       # Test fixtures and data
```

### Running Tests

```bash
# All tests
pytest

# Specific test file
pytest tests/unit/test_config.py

# Specific test
pytest tests/unit/test_config.py::test_config_validation

# With coverage
pytest --cov=. --cov-report=html

# Verbose output
pytest -v
```

### Writing Tests

- Use `pytest` fixtures for setup
- Use `pytest-asyncio` for async tests
- Mock external dependencies
- Test edge cases and error conditions

## Documentation

### Updating Documentation

- Update README.md for user-facing changes
- Add docstrings to all public APIs
- Include code examples
- Update CHANGELOG.md

### Building Documentation

```bash
cd docs
make html
```

## Pull Request Process

1. **Ensure all tests pass**
2. **Update documentation**
3. **Add entry to CHANGELOG.md**
4. **Request review from maintainers**
5. **Address review feedback**
6. **Squash commits if requested**

### PR Checklist

- [ ] Tests pass locally
- [ ] Code follows style guidelines
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] No merge conflicts
- [ ] Descriptive PR title and description

## Release Process

Maintainers will:

1. Update version number
2. Update CHANGELOG.md
3. Create release tag
4. Publish to PyPI (when available)

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Contact maintainers directly for sensitive issues

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.

```
Copyright 2025 Itachi-1824

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
```

---

Thank you for contributing to Memory-Arc! 🎉
