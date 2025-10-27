"""
Preset Configuration Examples

This example demonstrates all preset configurations available in the memory system:
- chatbot: Optimized for conversational AI with hybrid mode
- coding-agent: Optimized for code-focused applications with heuristic mode
- assistant: Optimized for task-oriented assistants with AI mode
- offline: Optimized for offline operation with heuristic mode

It also shows how to override preset values for customization.
"""

import asyncio
from config import MemoryConfig
from core.memory_manager import MemoryManager


def demonstrate_preset(preset_name: str, description: str):
    """Display information about a preset configuration."""
    print(f"\n{'=' * 60}")
    print(f"Preset: {preset_name.upper()}")
    print(f"{'=' * 60}")
    print(f"Description: {description}")
    print()
    
    # Load the preset
    config = MemoryConfig.from_preset(preset_name)
    
    print("Configuration:")
    print(f"  Mode: {config.mode}")
    print(f"  STM Max Length: {config.stm_max_length}")
    print(f"  LTM Enabled: {config.ltm_enabled}")
    print(f"  AI Adapter: {config.ai_adapter_name or 'None'}")
    print()
    
    print("Heuristic Settings:")
    print(f"  Summary Method: {config.heuristic_config.summary_method}")
    print(f"  Fact Extraction: {config.heuristic_config.fact_extraction_method}")
    print(f"  Importance Rules: {list(config.heuristic_config.importance_rules.keys())}")
    print()
    
    if config.mode == "hybrid":
        print("Hybrid Settings:")
        print(f"  AI Threshold: {config.hybrid_config.ai_threshold_importance}")
        print(f"  AI Probability: {config.hybrid_config.ai_probability}")
        print(f"  Fallback to Heuristic: {config.hybrid_config.fallback_to_heuristic}")
        print()
    
    # Validate
    errors = config.validate()
    if errors:
        print("⚠ Configuration has errors:")
        for error in errors:
            print(f"  - {error}")
    else:
        print("✓ Configuration is valid")


def demonstrate_override():
    """Demonstrate overriding preset values."""
    print(f"\n{'=' * 60}")
    print("OVERRIDING PRESET VALUES")
    print(f"{'=' * 60}")
    print()
    
    # Start with chatbot preset but customize it
    print("Starting with 'chatbot' preset and customizing...")
    print()
    
    config = MemoryConfig.from_preset(
        "chatbot",
        stm_max_length=200,  # Override: increase STM size
        mode="heuristic",  # Override: use heuristic instead of hybrid
        storage_path="./custom_data",  # Override: custom storage path
    )
    
    print("Customized Configuration:")
    print(f"  Mode: {config.mode} (overridden from 'hybrid')")
    print(f"  STM Max Length: {config.stm_max_length} (overridden from 100)")
    print(f"  Storage Path: {config.storage_path} (overridden)")
    print()
    
    # Validate
    errors = config.validate()
    if errors:
        print("⚠ Configuration has errors:")
        for error in errors:
            print(f"  - {error}")
    else:
        print("✓ Customized configuration is valid")


async def demonstrate_usage():
    """Demonstrate using a preset in practice."""
    print(f"\n{'=' * 60}")
    print("USING A PRESET IN PRACTICE")
    print(f"{'=' * 60}")
    print()
    
    # Use the coding-agent preset for a code-focused application
    print("Using 'coding-agent' preset for a code assistant...")
    print()
    
    config = MemoryConfig.from_preset("coding-agent")
    
    memory = MemoryManager(
        context_id="developer_123",
        config=config
    )
    
    print("Memory manager initialized with coding-agent preset")
    print()
    
    # Add some code-related messages
    print("Adding code-related messages...")
    
    messages = [
        {"role": "user", "content": "I'm working on a Python function to parse JSON."},
        {"role": "assistant", "content": "I can help with that. What's the structure?"},
        {"role": "user", "content": "def parse_data(file_path):\n    with open(file_path) as f:\n        return json.load(f)"},
        {"role": "assistant", "content": "That looks good! You might want to add error handling."},
        {"role": "user", "content": "Remember: I prefer using pathlib for file operations."},
    ]
    
    thread_id = "coding_session_1"
    
    for msg in messages:
        await memory.add_message(thread_id, msg["role"], msg["content"])
        preview = msg["content"][:60] + "..." if len(msg["content"]) > 60 else msg["content"]
        print(f"  [{msg['role']}]: {preview}")
    
    print()
    print(f"✓ Added {len(messages)} messages")
    print()
    
    # Get metrics
    metrics = memory.get_metrics()
    print("Processing Metrics:")
    print(f"  Heuristic calls: {dict(metrics.get('heuristic_calls', {}))}")
    print()


def main():
    """Run all preset demonstrations."""
    print("=" * 60)
    print("PRESET CONFIGURATION EXAMPLES")
    print("=" * 60)
    
    # Demonstrate each preset
    demonstrate_preset(
        "chatbot",
        "Hybrid mode optimized for conversational AI with user preferences"
    )
    
    demonstrate_preset(
        "coding-agent",
        "Heuristic mode optimized for code-focused applications (fast, offline)"
    )
    
    demonstrate_preset(
        "assistant",
        "AI mode optimized for task-oriented assistants with OpenAI"
    )
    
    demonstrate_preset(
        "offline",
        "Heuristic mode for completely offline operation with KeyBERT"
    )
    
    # Demonstrate overriding
    demonstrate_override()
    
    # Demonstrate practical usage
    print("\n" + "=" * 60)
    print("Running practical usage example...")
    print("=" * 60)
    asyncio.run(demonstrate_usage())
    
    print("\n" + "=" * 60)
    print("All preset examples completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()
