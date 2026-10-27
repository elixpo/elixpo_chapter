# Contributing to lixSearch

Thank you for your interest in contributing to lixSearch! We welcome contributions from the community and are excited to work with you.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Commit Messages](#commit-messages)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [hello@elixpo.ai](mailto:hello@elixpo.ai).

## Getting Started

### Prerequisites

- Python 3.11+
- Docker 20.10+ (for containerized development)
- Git
- 8GB+ RAM
- 10GB+ disk space

### Fork & Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/lixsearch.git
   cd lixsearch
   ```
3. Add upstream remote:
   ```bash
   git remote add upstream https://github.com/elixpo/lixsearch.git
   ```

## Development Setup

### Local Environment

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install development dependencies
pip install -r requirements-dev.txt  # pytest, black, flake8, mypy, etc.
```

### Docker Development

```bash
cd docker_setup

# Build development image
docker-compose build

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f elixpo-search-lb
```

### Environment Setup

```bash
# Copy example .env
cp .env.example .env

# Edit with your settings
nano .env
```

## How to Contribute

### 1. Reporting Bugs

Before creating a bug report, please check the issue tracker to avoid duplicates.

**To create a bug report, include:**

- Clear, descriptive title
- Detailed description of the bug
- Steps to reproduce the issue
- Expected behavior vs. actual behavior
- Screenshots/logs if applicable
- Your environment (OS, Python version, etc.)
- Stack trace/error messages

**Bug Report Template:**
```markdown
## Bug Description
[Clear description of the bug]

## Steps to Reproduce
1. [First step]
2. [Second step]
3. [Error occurs]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happened]

## Environment
- OS: [e.g., Ubuntu 22.04]
- Python: [version]
- lixSearch: [version or commit]

## Logs
[Relevant error logs or stack traces]
```

### 2. Suggesting Features

We love feature suggestions! Please provide in an issue as much detail as possible.:

- Clear, descriptive title
- Detailed description of the feature
- Use cases and motivation
- Possible implementation approach
- Related issues or discussions


### 3. Contributing Code

#### Creating a Branch

```bash
git fetch upstream
git checkout main
git reset --hard upstream/main
git checkout -b feature/your-feature-name
```

**Branch naming conventions:**
- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions

## Pull Request Process

### Before Submitting

1. **Update your branch:**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run tests:**
   ```bash
   pytest tests/
   ```

3. **Run linters:**
   ```bash
   black lixsearch/
   flake8 lixsearch/
   mypy lixsearch/
   ```

4. **Update documentation:**
   - Update README.md if needed
   - Add docstrings to new functions
   - Update CHANGELOG.md

### Submitting the PR

1. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Open a Pull Request on GitHub with:
   - Clear title describing changes
   - Description of what and why
   - Link to related issues
   - Screenshots/demos if applicable

3. Wait for review from maintainers

### PR Review Process

- Squash commits before merge (maintainers will do this)

## Coding Standards

### Python Style Guide

We follow [PEP 8](https://www.python.org/dev/peps/pep-0008/) with black formatting.

```bash
black lixsearch/ --line-length 100
flake8 lixsearch/ --max-line-length=100
mypy lixsearch/
```

### Updating Documentation

- Update [DOCS/](DOCS/) files if changing architecture
- Update README.md for user-facing changes
- Add docstrings to all functions/classes
- Include examples where helpful

## Questions?

- 📖 Check the [Documentation](DOCS/)
- 💬 Open an issue for questions
- 📧 Email [support@elixpo.ai](mailto:support@elixpo.ai)
- 💭 Join our community discussions

## Recognition

We appreciate all contributions! Contributors will be:
- Added to [CONTRIBUTORS.md](CONTRIBUTORS.md)
- Mentioned in release notes
- Recognized in project documentation

Thank you for helping make lixSearch better! 🎉
