# Embedding Models Guide

Memory-Arc supports multiple embedding models for semantic search and memory retrieval. This guide explains the available models, how to use them, and when to choose each one.

## 🎯 Available Models

### 1. Default Model (Included)

**Model:** `all-MiniLM-L6-v2`

- **Size:** ~80MB
- **Dimensions:** 384
- **Speed:** Fast
- **Quality:** Good
- **Installation:** ✅ Included with Memory-Arc
- **Best for:** General purpose, fast inference, development

```python
config = MemoryConfig(
    embedding_model="all-MiniLM-L6-v2"
)
```

### 2. Enhanced Model (Auto-download)

**Model:** `BAAI/bge-m3`

- **Size:** ~2.2GB
- **Dimensions:** 1024
- **Speed:** Medium
- **Quality:** Excellent
- **Installation:** 📥 Downloads automatically on first use
- **Best for:** Production chatbots, high-quality semantic search

```python
config = MemoryConfig(
    embedding_model="BAAI/bge-m3"
)
```

### 3. Code Model (Auto-download)

**Model:** `jinaai/jina-embeddings-v2-base-code`

- **Size:** ~500MB
- **Dimensions:** 768
- **Speed:** Medium
- **Quality:** Excellent for code
- **Installation:** 📥 Downloads automatically on first use
- **Best for:** Code assistants, technical documentation, programming discussions

```python
config = MemoryConfig(
    embedding_model="jinaai/jina-embeddings-v2-base-code"
)
```

## 🚀 Quick Start

### Using Default Model

The default model is included with installation - no additional downloads needed:

```python
from config import MemoryConfig
from core.memory_manager import MemoryManager

config = MemoryConfig(
    mode="heuristic",
    embedding_model="all-MiniLM-L6-v2"  # Default, already installed
)

memory = MemoryManager(context_id="user_123", config=config)
```

### Using Enhanced Models

Enhanced models download automatically on first use:

```python
# Enhanced quality model
config = MemoryConfig(
    mode="heuristic",
    embedding_model="BAAI/bge-m3"  # Downloads on first use
)

# Code-optimized model
config = MemoryConfig(
    mode="heuristic",
    embedding_model="jinaai/jina-embeddings-v2-base-code"  # Downloads on first use
)
```

### Using Presets (Recommended)

Presets automatically select the best model for each use case:

```python
# Fast chatbot (default model)
config = MemoryConfig.from_preset("chatbot")

# High-quality chatbot (enhanced model)
config = MemoryConfig.from_preset("chatbot-enhanced")

# Code assistant (code model)
config = MemoryConfig.from_preset("coding-agent")

# Code assistant with AI (code model + hybrid mode)
config = MemoryConfig.from_preset("coding-agent-enhanced")
```

## 📊 Model Comparison

| Model | Size | Dimensions | Speed | Quality | Use Case |
|-------|------|------------|-------|---------|----------|
| all-MiniLM-L6-v2 | 80MB | 384 | ⚡⚡⚡ Fast | ⭐⭐⭐ Good | General purpose |
| BAAI/bge-m3 | 2.2GB | 1024 | ⚡⚡ Medium | ⭐⭐⭐⭐⭐ Excellent | High quality |
| jina-embeddings-v2-base-code | 500MB | 768 | ⚡⚡ Medium | ⭐⭐⭐⭐⭐ Excellent (code) | Code & technical |

## 🎨 Preset Configurations

Memory-Arc includes presets that automatically use the best model:

| Preset | Mode | Embedding Model | Use Case |
|--------|------|----------------|----------|
| `chatbot` | Hybrid | all-MiniLM-L6-v2 | Fast general chatbot |
| `chatbot-enhanced` | Hybrid | BAAI/bge-m3 | High-quality chatbot |
| `coding-agent` | Heuristic | jina-embeddings-v2-base-code | Fast code assistant |
| `coding-agent-enhanced` | Hybrid | jina-embeddings-v2-base-code | AI-powered code assistant |
| `assistant` | AI | BAAI/bge-m3 | Task-oriented assistant |
| `offline` | Heuristic | all-MiniLM-L6-v2 | Offline operation |

## 🛠️ Model Management

### Check Model Status

```python
from utils.model_manager import EmbeddingModelManager

# Check if a model is downloaded
is_downloaded = EmbeddingModelManager.check_model_downloaded("BAAI/bge-m3")
print(f"Model downloaded: {is_downloaded}")

# Get model information
info = EmbeddingModelManager.get_model_info("BAAI/bge-m3")
print(f"Size: {info['size']}")
print(f"Dimensions: {info['dimensions']}")
print(f"Use case: {info['use_case']}")
```

### Pre-download Models

You can pre-download models before using them:

```bash
# List available models
python -m utils.model_manager list

# Get model information
python -m utils.model_manager info BAAI/bge-m3

# Pre-download a model
python -m utils.model_manager download BAAI/bge-m3
```

### List All Models

```python
from utils.model_manager import print_available_models

# Print all available models with information
print_available_models()
```

## 🎯 Choosing the Right Model

### For Development

**Use:** Default model (`all-MiniLM-L6-v2`)

- Fast iteration
- No download wait
- Good enough for testing

```python
config = MemoryConfig.from_preset("chatbot")
```

### For Production Chatbots

**Use:** Enhanced model (`BAAI/bge-m3`)

- Better semantic understanding
- Higher quality search results
- Worth the extra size

```python
config = MemoryConfig.from_preset("chatbot-enhanced")
```

### For Code Assistants

**Use:** Code model (`jinaai/jina-embeddings-v2-base-code`)

- Optimized for code understanding
- Better at technical content
- Understands programming concepts

```python
config = MemoryConfig.from_preset("coding-agent")
```

### For Offline Use

**Use:** Default model (`all-MiniLM-L6-v2`)

- Smallest size
- Already included
- No internet needed after installation

```python
config = MemoryConfig.from_preset("offline")
```

## 🔧 Custom Models

You can use any HuggingFace model:

```python
# Multilingual model
config = MemoryConfig(
    embedding_model="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
)

# Domain-specific model
config = MemoryConfig(
    embedding_model="your-org/your-custom-model"
)
```

Models will download automatically on first use.

## 📦 Installation & Storage

### Default Installation

Only the default model is included:

```bash
pip install -r requirements.txt
# Includes: all-MiniLM-L6-v2 (~80MB)
```

### Model Storage

Models are cached locally after download:

- **Linux/Mac:** `~/.cache/torch/sentence_transformers/`
- **Windows:** `C:\Users\<username>\.cache\torch\sentence_transformers\`

Once downloaded, models are reused across all projects.

## ⚡ Performance Tips

1. **Start with default:** Use `all-MiniLM-L6-v2` for development
2. **Upgrade for production:** Switch to `BAAI/bge-m3` for better quality
3. **Use code model for code:** Always use `jina-embeddings-v2-base-code` for code-related content
4. **Pre-download in CI/CD:** Download models during deployment to avoid runtime delays
5. **Cache models:** Models are cached after first download

## 🔍 Examples

See [examples/embedding_models.py](examples/embedding_models.py) for complete examples:

```bash
cd examples
python embedding_models.py
```

This example demonstrates:
- Using different embedding models
- Checking model status
- Pre-downloading models
- Using presets with automatic model selection
- Custom HuggingFace models

## 🆘 Troubleshooting

### Model Download Fails

```python
# The system will automatically fall back to default model
# Check your internet connection and try again
```

### Out of Disk Space

```python
# Remove unused models from cache
# Linux/Mac: rm -rf ~/.cache/torch/sentence_transformers/<model_name>
# Windows: del /s /q C:\Users\<username>\.cache\torch\sentence_transformers\<model_name>
```

### Slow First Run

```python
# Pre-download models before use
python -m utils.model_manager download BAAI/bge-m3
```

## 📚 Additional Resources

- [Sentence Transformers Documentation](https://www.sbert.net/)
- [HuggingFace Models](https://huggingface.co/models?library=sentence-transformers)
- [BGE Models](https://huggingface.co/BAAI/bge-m3)
- [Jina Embeddings](https://huggingface.co/jinaai/jina-embeddings-v2-base-code)

---

**Questions?** Open an issue on [GitHub](https://github.com/Itachi-1824/Memory-Arc/issues)
