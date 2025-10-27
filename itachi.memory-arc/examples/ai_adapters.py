"""
AI Adapter Examples

This example demonstrates how to use different AI adapters with the memory system:
- OpenAI: Using GPT models via OpenAI API
- Ollama: Using local models via Ollama
- Custom: Creating and registering custom adapters
- Adapter Registry: Discovering and listing available adapters
"""

import asyncio
import os
from config import MemoryConfig
from core.memory_manager import MemoryManager
from adapters.registry import AdapterRegistry
from adapters.ai_adapter import AIAdapter


def demonstrate_adapter_registry():
    """Demonstrate adapter registry features."""
    print("=" * 60)
    print("ADAPTER REGISTRY")
    print("=" * 60)
    print()
    
    # List all available adapters
    print("Available Adapters:")
    adapters = AdapterRegistry.list()
    for adapter_name in adapters:
        print(f"  - {adapter_name}")
    print()
    
    # Describe each adapter
    print("Adapter Details:")
    for adapter_name in adapters:
        try:
            info = AdapterRegistry.describe(adapter_name)
            print(f"\n  {adapter_name}:")
            print(f"    Type: {info['type']}")
            print(f"    Loaded: {info['loaded']}")
            print(f"    Available: {info['available']}")
            if info['description']:
                print(f"    Description: {info['description']}")
        except Exception as e:
            print(f"    Error: {e}")
    print()


async def demonstrate_openai_adapter():
    """Demonstrate using OpenAI adapter."""
    print("=" * 60)
    print("OPENAI ADAPTER EXAMPLE")
    print("=" * 60)
    print()
    
    # Check if API key is available
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("⚠ OPENAI_API_KEY not set in environment")
        print("  Set it with: export OPENAI_API_KEY='sk-...'")
        print("  Skipping OpenAI example...")
        print()
        return
    
    print("Configuring memory system with OpenAI adapter...")
    print()
    
    # Create configuration with OpenAI adapter
    config = MemoryConfig(
        mode="ai",
        ai_adapter_name="openai",
        ai_adapter_config={
            "api_key": api_key,
            "model": "gpt-4o-mini",  # Fast and cost-effective model
        },
        stm_max_length=10,
        storage_path="./demo_data_openai"
    )
    
    print("Configuration:")
    print(f"  Mode: {config.mode}")
    print(f"  Adapter: {config.ai_adapter_name}")
    print(f"  Model: {config.ai_adapter_config.get('model')}")
    print()
    
    # Initialize memory manager
    memory = MemoryManager(
        context_id="openai_user",
        config=config
    )
    
    print("✓ Memory manager initialized with OpenAI adapter")
    print()
    
    # Add messages
    print("Adding messages...")
    messages = [
        {"role": "user", "content": "I'm planning a trip to Japan next month."},
        {"role": "assistant", "content": "That sounds exciting! What cities are you visiting?"},
        {"role": "user", "content": "Tokyo and Kyoto. Remember: I'm vegetarian."},
    ]
    
    thread_id = "travel_planning"
    for msg in messages:
        await memory.add_message(thread_id, msg["role"], msg["content"])
        print(f"  [{msg['role']}]: {msg['content']}")
    
    print()
    print("✓ Messages added and processed with OpenAI")
    print()
    
    # Get metrics
    metrics = memory.get_metrics()
    print("Processing Metrics:")
    if "ai_calls" in metrics:
        print(f"  AI Calls: {dict(metrics['ai_calls'])}")
    if "ai_success" in metrics:
        print(f"  AI Success: {dict(metrics['ai_success'])}")
    if "summary" in metrics:
        print(f"  Success Rate: {metrics['summary'].get('success_rate', 0):.2%}")
    print()


async def demonstrate_ollama_adapter():
    """Demonstrate using Ollama adapter for local models."""
    print("=" * 60)
    print("OLLAMA ADAPTER EXAMPLE")
    print("=" * 60)
    print()
    
    print("Configuring memory system with Ollama adapter...")
    print("Note: Requires Ollama running locally (http://localhost:11434)")
    print()
    
    # Create configuration with Ollama adapter
    config = MemoryConfig(
        mode="ai",
        ai_adapter_name="ollama",
        ai_adapter_config={
            "model": "llama3.2:1b",  # Small, fast model
            "base_url": "http://localhost:11434",
        },
        stm_max_length=10,
        storage_path="./demo_data_ollama"
    )
    
    print("Configuration:")
    print(f"  Mode: {config.mode}")
    print(f"  Adapter: {config.ai_adapter_name}")
    print(f"  Model: {config.ai_adapter_config.get('model')}")
    print(f"  Base URL: {config.ai_adapter_config.get('base_url')}")
    print()
    
    try:
        # Initialize memory manager
        memory = MemoryManager(
            context_id="ollama_user",
            config=config
        )
        
        print("✓ Memory manager initialized with Ollama adapter")
        print()
        
        # Add messages
        print("Adding messages...")
        messages = [
            {"role": "user", "content": "I'm learning Python programming."},
            {"role": "assistant", "content": "Great! What would you like to learn first?"},
            {"role": "user", "content": "I want to understand decorators."},
        ]
        
        thread_id = "learning_session"
        for msg in messages:
            await memory.add_message(thread_id, msg["role"], msg["content"])
            print(f"  [{msg['role']}]: {msg['content']}")
        
        print()
        print("✓ Messages added and processed with Ollama")
        print()
        
        # Get metrics
        metrics = memory.get_metrics()
        print("Processing Metrics:")
        if "ai_calls" in metrics:
            print(f"  AI Calls: {dict(metrics['ai_calls'])}")
        if "ai_success" in metrics:
            print(f"  AI Success: {dict(metrics['ai_success'])}")
        print()
        
    except Exception as e:
        print(f"⚠ Error: {e}")
        print("  Make sure Ollama is running: ollama serve")
        print("  And the model is available: ollama pull llama3.2:1b")
        print()


def demonstrate_custom_adapter():
    """Demonstrate creating and registering a custom adapter."""
    print("=" * 60)
    print("CUSTOM ADAPTER EXAMPLE")
    print("=" * 60)
    print()
    
    # Define a custom adapter
    class MockAdapter(AIAdapter):
        """A simple mock adapter for demonstration."""
        
        def __init__(self, prefix: str = "Mock", **kwargs):
            self.prefix = prefix
            print(f"  Initialized {self.prefix}Adapter")
        
        async def summarize_conversation(self, messages: list[dict]) -> str | None:
            """Generate a mock summary."""
            count = len(messages)
            return f"{self.prefix} summary of {count} messages"
        
        async def extract_facts(self, messages: list[dict]) -> list[dict]:
            """Extract mock facts."""
            return [
                {"type": "mock_fact", "text": f"{self.prefix} fact 1"},
                {"type": "mock_fact", "text": f"{self.prefix} fact 2"},
            ]
        
        async def score_importance(self, text: str) -> int:
            """Return a mock importance score."""
            # Simple heuristic: longer text = more important
            return min(5 + len(text) // 100, 10)
    
    print("Registering custom adapter...")
    AdapterRegistry.register("mock", MockAdapter)
    print("✓ Custom adapter registered as 'mock'")
    print()
    
    # List adapters to confirm registration
    print("Available adapters after registration:")
    adapters = AdapterRegistry.list()
    for adapter_name in adapters:
        marker = " (custom)" if adapter_name == "mock" else ""
        print(f"  - {adapter_name}{marker}")
    print()
    
    # Use the custom adapter
    print("Creating configuration with custom adapter...")
    config = MemoryConfig(
        mode="ai",
        ai_adapter_name="mock",
        ai_adapter_config={"prefix": "Custom"},
        stm_max_length=5,
        storage_path="./demo_data_custom"
    )
    
    print("✓ Configuration created with custom adapter")
    print()
    
    # Describe the custom adapter
    info = AdapterRegistry.describe("mock")
    print("Custom Adapter Info:")
    print(f"  Name: {info['name']}")
    print(f"  Type: {info['type']}")
    print(f"  Loaded: {info['loaded']}")
    print()


async def main():
    """Run all adapter examples."""
    print("\n" + "=" * 60)
    print("AI ADAPTER EXAMPLES")
    print("=" * 60)
    print()
    
    # Demonstrate adapter registry
    demonstrate_adapter_registry()
    
    # Demonstrate OpenAI adapter
    await demonstrate_openai_adapter()
    
    # Demonstrate Ollama adapter
    await demonstrate_ollama_adapter()
    
    # Demonstrate custom adapter
    demonstrate_custom_adapter()
    
    print("=" * 60)
    print("All adapter examples completed!")
    print("=" * 60)
    print()
    print("Summary:")
    print("  - Adapter registry provides discovery and instantiation")
    print("  - OpenAI adapter connects to GPT models via API")
    print("  - Ollama adapter uses local models for privacy/offline use")
    print("  - Custom adapters can be created and registered easily")
    print()


if __name__ == "__main__":
    asyncio.run(main())
