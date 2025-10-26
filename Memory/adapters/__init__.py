"""AI adapter interfaces for memory processing."""

from .ai_adapter import AIAdapter
from .registry import AdapterRegistry, AdapterNotFoundError

# Built-in adapters (lazy loaded)
# Import these directly if needed, but prefer using AdapterRegistry.get()
# from .openai import OpenAIAdapter
# from .anthropic import AnthropicAdapter
# from .ollama import OllamaAdapter
# from .huggingface import HuggingFaceAdapter

__all__ = ["AIAdapter", "AdapterRegistry", "AdapterNotFoundError"]
