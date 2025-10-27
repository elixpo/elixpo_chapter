"""
Memory System - A platform-agnostic conversational memory engine.

This package provides short-term memory (STM) and long-term memory (LTM)
capabilities for AI applications, with vector-based semantic search.

Features:
- Multiple processing modes: AI, heuristic, hybrid, and disabled
- Configurable memory processing with presets for common use cases
- Support for multiple AI providers (OpenAI, Anthropic, Ollama, HuggingFace)
- Built-in heuristic processing for offline/cost-sensitive applications
- Flexible adapter registry for custom AI implementations
"""

# Core components
from memory_system.core.models import MemoryEntry
from memory_system.core.memory_manager import MemoryManager
from memory_system.core.vector_memory import VectorMemoryManager

# Processor interfaces and implementations
from memory_system.core.processors import (
    MemoryProcessor,
    ProcessingMetrics,
    AIProcessor,
    HeuristicProcessor,
    HybridProcessor,
    DisabledProcessor,
)

# Configuration classes
from memory_system.config import (
    MemoryConfig,
    HeuristicConfig,
    HybridConfig,
)

# Presets
from memory_system.presets import ConfigPresets

# Adapter interfaces and registry
from memory_system.adapters.ai_adapter import AIAdapter
from memory_system.adapters.registry import AdapterRegistry, AdapterNotFoundError

__version__ = "0.1.0"

__all__ = [
    # Core components
    "MemoryEntry",
    "MemoryManager",
    "VectorMemoryManager",
    
    # Processors
    "MemoryProcessor",
    "ProcessingMetrics",
    "AIProcessor",
    "HeuristicProcessor",
    "HybridProcessor",
    "DisabledProcessor",
    
    # Configuration
    "MemoryConfig",
    "HeuristicConfig",
    "HybridConfig",
    "ConfigPresets",
    
    # Adapters
    "AIAdapter",
    "AdapterRegistry",
    "AdapterNotFoundError",
]
