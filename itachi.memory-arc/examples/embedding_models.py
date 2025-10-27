"""
Embedding Models Example

This example demonstrates how to use different embedding models:
- Default: all-MiniLM-L6-v2 (fast, lightweight)
- Enhanced: BAAI/bge-m3 (better quality)
- Code: jinaai/jina-embeddings-v2-base-code (code-optimized)
- Custom: Any HuggingFace model

Models are downloaded automatically on first use.
"""

import asyncio
import logging
from config import MemoryConfig
from core.memory_manager import MemoryManager
from utils.model_manager import EmbeddingModelManager, print_available_models

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


async def demo_default_model():
    """Demonstrate default lightweight model."""
    print("\n" + "=" * 70)
    print("EXAMPLE 1: Default Model (all-MiniLM-L6-v2)")
    print("=" * 70)
    print()
    
    print("✓ Fast and lightweight (384 dimensions)")
    print("✓ Already included with installation")
    print("✓ Best for: General purpose, fast inference")
    print()
    
    config = MemoryConfig(
        mode="heuristic",
        embedding_model="all-MiniLM-L6-v2",  # Default
        stm_max_length=10,
        storage_path="./demo_data_default"
    )
    
    memory = MemoryManager(context_id="default_user", config=config)
    
    print("Adding messages...")
    await memory.add_message("thread_1", "user", "I love Python programming!")
    await memory.add_message("thread_1", "assistant", "Python is great for AI!")
    
    print("✓ Memory system initialized with default model")
    print()


async def demo_enhanced_model():
    """Demonstrate enhanced quality model."""
    print("\n" + "=" * 70)
    print("EXAMPLE 2: Enhanced Model (BAAI/bge-m3)")
    print("=" * 70)
    print()
    
    print("✓ Better quality embeddings (1024 dimensions)")
    print("✓ Downloads automatically on first use (~2.2GB)")
    print("✓ Best for: Higher accuracy, general text")
    print()
    
    # Check if model is downloaded
    is_downloaded = EmbeddingModelManager.check_model_downloaded("BAAI/bge-m3")
    if not is_downloaded:
        print("⚠ Model not downloaded yet. It will download on first use.")
        print("  This is a one-time download (~2.2GB)")
        print()
    
    config = MemoryConfig(
        mode="heuristic",
        embedding_model="BAAI/bge-m3",  # Enhanced
        stm_max_length=10,
        storage_path="./demo_data_enhanced"
    )
    
    try:
        memory = MemoryManager(context_id="enhanced_user", config=config)
        
        print("Adding messages...")
        await memory.add_message("thread_1", "user", "Tell me about machine learning.")
        await memory.add_message("thread_1", "assistant", "ML is a subset of AI...")
        
        print("✓ Memory system initialized with enhanced model")
        print()
    except Exception as e:
        print(f"✗ Failed to initialize: {e}")
        print("  The model will download automatically when you run this again.")
        print()


async def demo_code_model():
    """Demonstrate code-optimized model."""
    print("\n" + "=" * 70)
    print("EXAMPLE 3: Code Model (jinaai/jina-embeddings-v2-base-code)")
    print("=" * 70)
    print()
    
    print("✓ Optimized for code understanding (768 dimensions)")
    print("✓ Downloads automatically on first use (~500MB)")
    print("✓ Best for: Code snippets, technical content")
    print()
    
    # Check if model is downloaded
    is_downloaded = EmbeddingModelManager.check_model_downloaded(
        "jinaai/jina-embeddings-v2-base-code"
    )
    if not is_downloaded:
        print("⚠ Model not downloaded yet. It will download on first use.")
        print("  This is a one-time download (~500MB)")
        print()
    
    config = MemoryConfig(
        mode="heuristic",
        embedding_model="jinaai/jina-embeddings-v2-base-code",  # Code-optimized
        stm_max_length=10,
        storage_path="./demo_data_code"
    )
    
    try:
        memory = MemoryManager(context_id="code_user", config=config)
        
        print("Adding code-related messages...")
        await memory.add_message(
            "thread_1",
            "user",
            "def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)"
        )
        await memory.add_message("thread_1", "assistant", "That's a recursive Fibonacci implementation.")
        
        print("✓ Memory system initialized with code model")
        print()
    except Exception as e:
        print(f"✗ Failed to initialize: {e}")
        print("  The model will download automatically when you run this again.")
        print()


async def demo_preset_models():
    """Demonstrate using presets with different models."""
    print("\n" + "=" * 70)
    print("EXAMPLE 4: Using Presets with Optimized Models")
    print("=" * 70)
    print()
    
    print("Presets automatically use the best model for each use case:")
    print()
    
    # Chatbot preset (default model)
    print("1. chatbot preset:")
    print("   - Model: all-MiniLM-L6-v2 (fast)")
    print("   - Use case: General conversation")
    config1 = MemoryConfig.from_preset("chatbot")
    print(f"   ✓ Embedding model: {config1.embedding_model}")
    print()
    
    # Chatbot enhanced preset
    print("2. chatbot-enhanced preset:")
    print("   - Model: BAAI/bge-m3 (better quality)")
    print("   - Use case: High-quality conversation understanding")
    config2 = MemoryConfig.from_preset("chatbot-enhanced")
    print(f"   ✓ Embedding model: {config2.embedding_model}")
    print()
    
    # Coding agent preset
    print("3. coding-agent preset:")
    print("   - Model: jinaai/jina-embeddings-v2-base-code (code-optimized)")
    print("   - Use case: Code discussions and technical content")
    config3 = MemoryConfig.from_preset("coding-agent")
    print(f"   ✓ Embedding model: {config3.embedding_model}")
    print()
    
    # Coding agent enhanced preset
    print("4. coding-agent-enhanced preset:")
    print("   - Model: jinaai/jina-embeddings-v2-base-code (code-optimized)")
    print("   - Mode: Hybrid (AI + heuristics)")
    print("   - Use case: Advanced code assistance with AI")
    config4 = MemoryConfig.from_preset("coding-agent-enhanced")
    print(f"   ✓ Embedding model: {config4.embedding_model}")
    print()


def demo_custom_model():
    """Demonstrate using a custom HuggingFace model."""
    print("\n" + "=" * 70)
    print("EXAMPLE 5: Custom HuggingFace Model")
    print("=" * 70)
    print()
    
    print("You can use ANY HuggingFace model:")
    print()
    
    # Example with a custom model
    custom_model = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    
    print(f"Custom model: {custom_model}")
    print("  - Supports multiple languages")
    print("  - Will download automatically on first use")
    print()
    
    config = MemoryConfig(
        mode="heuristic",
        embedding_model=custom_model,
        stm_max_length=10,
        storage_path="./demo_data_custom"
    )
    
    print("✓ Configuration created with custom model")
    print()
    print("Note: The model will download when you initialize MemoryManager")
    print()


def demo_model_management():
    """Demonstrate model management utilities."""
    print("\n" + "=" * 70)
    print("EXAMPLE 6: Model Management")
    print("=" * 70)
    print()
    
    print("Check which models are downloaded:")
    print()
    
    models = ["all-MiniLM-L6-v2", "BAAI/bge-m3", "jinaai/jina-embeddings-v2-base-code"]
    
    for model in models:
        is_downloaded = EmbeddingModelManager.check_model_downloaded(model)
        status = "✓ Downloaded" if is_downloaded else "✗ Not downloaded"
        print(f"  {model}: {status}")
    
    print()
    print("To pre-download a model:")
    print("  python -m utils.model_manager download BAAI/bge-m3")
    print()
    print("To list all models:")
    print("  python -m utils.model_manager list")
    print()


async def main():
    """Run all embedding model examples."""
    print("\n" + "=" * 70)
    print("EMBEDDING MODELS EXAMPLES")
    print("=" * 70)
    print()
    print("Memory-Arc supports multiple embedding models:")
    print("  • Default: Fast and lightweight (included)")
    print("  • Enhanced: Better quality (downloads on first use)")
    print("  • Code: Optimized for code (downloads on first use)")
    print("  • Custom: Any HuggingFace model")
    print()
    
    # Show available models
    print_available_models()
    
    # Run examples
    await demo_default_model()
    
    # Note: Enhanced and code models will download on first use
    # Uncomment these to try them (requires download)
    # await demo_enhanced_model()
    # await demo_code_model()
    
    await demo_preset_models()
    demo_custom_model()
    demo_model_management()
    
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print()
    print("Key Points:")
    print("  ✓ Default model (all-MiniLM-L6-v2) is included with installation")
    print("  ✓ Enhanced models download automatically on first use")
    print("  ✓ Use presets for automatic model selection")
    print("  ✓ Override embedding_model in config for custom models")
    print("  ✓ Models are cached locally after first download")
    print()
    print("Recommendations:")
    print("  • Start with default model (fast, lightweight)")
    print("  • Use enhanced model for better accuracy")
    print("  • Use code model for technical/code content")
    print("  • Use presets for automatic optimization")
    print()


if __name__ == "__main__":
    asyncio.run(main())
