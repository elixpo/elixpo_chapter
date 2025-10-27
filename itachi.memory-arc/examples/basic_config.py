"""
Basic Configuration Example

This example demonstrates simple configuration usage with heuristic mode,
which requires no AI dependencies and runs completely offline.
"""

import asyncio
from config import MemoryConfig, HeuristicConfig
from core.memory_manager import MemoryManager


async def main():
    """Demonstrate basic heuristic configuration without AI."""
    
    print("=" * 60)
    print("Basic Configuration Example - Heuristic Mode")
    print("=" * 60)
    print()
    
    # Create a simple heuristic configuration
    # This mode requires no AI and runs completely offline
    config = MemoryConfig(
        mode="heuristic",
        stm_max_length=10,  # Small for demo purposes
        storage_path="./demo_data",
        ltm_enabled=True,
        heuristic_config=HeuristicConfig(
            summary_method="sample",  # Simple sampling method
            fact_extraction_method="keywords",  # Keyword-based extraction
            importance_rules={
                "base_score": 5,
                "keyword_bonus": {
                    "keywords": ["important", "remember", "critical"],
                    "bonus": 3
                },
                "question_bonus": 2,
                "code_bonus": 1,
            }
        )
    )
    
    print("Configuration created:")
    print(f"  Mode: {config.mode}")
    print(f"  STM Max Length: {config.stm_max_length}")
    print(f"  Summary Method: {config.heuristic_config.summary_method}")
    print(f"  Fact Extraction: {config.heuristic_config.fact_extraction_method}")
    print()
    
    # Validate configuration
    errors = config.validate()
    if errors:
        print("Configuration errors:")
        for error in errors:
            print(f"  - {error}")
        return
    else:
        print("✓ Configuration is valid")
        print()
    
    # Initialize memory manager with configuration
    memory = MemoryManager(
        context_id="demo_user",
        config=config
    )
    
    print("Memory manager initialized")
    print()
    
    # Add some messages to demonstrate the system
    print("Adding messages to memory...")
    
    messages = [
        {"role": "user", "content": "Hello! My name is Alice."},
        {"role": "assistant", "content": "Hi Alice! Nice to meet you."},
        {"role": "user", "content": "I love programming in Python."},
        {"role": "assistant", "content": "Python is a great language!"},
        {"role": "user", "content": "Remember: I prefer tabs over spaces."},
        {"role": "assistant", "content": "Got it, I'll remember your preference."},
    ]
    
    thread_id = "demo_thread"
    
    for msg in messages:
        await memory.add_message(thread_id, msg["role"], msg["content"])
        print(f"  [{msg['role']}]: {msg['content']}")
    
    print()
    print(f"Added {len(messages)} messages to STM")
    print()
    
    # Retrieve metrics
    print("Retrieving processing metrics...")
    metrics = memory.get_metrics()
    
    print()
    print("Processing Metrics:")
    print(f"  Heuristic calls: {dict(metrics.get('heuristic_calls', {}))}")
    print(f"  Processing time: {dict(metrics.get('processing_time', {}))}")
    print()
    
    # Search memory
    print("Searching memory for 'Python programming'...")
    results = await memory.search_memory("Python programming", top_k=3)
    
    print(f"Found {len(results)} results:")
    for i, result in enumerate(results, 1):
        print(f"  {i}. {result.get('text', '')[:80]}...")
        print(f"     Importance: {result.get('importance_score', 'N/A')}")
    print()
    
    print("=" * 60)
    print("Example completed successfully!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
