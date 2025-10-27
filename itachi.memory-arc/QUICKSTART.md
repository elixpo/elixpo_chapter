# Quick Start Guide

Get up and running with Memory System in 5 minutes.

## Installation

```bash
# Clone the repository
git clone https://github.com/Itachi-1824/Memory-Arc.git
cd Memory-Arc

# Install dependencies
pip install -r requirements.txt
```

## Your First Memory System

### 1. Basic Usage (No AI Required)

Create a file `my_first_memory.py`:

```python
import asyncio
from config import MemoryConfig
from core.memory_manager import MemoryManager

async def main():
    # Create a simple configuration
    config = MemoryConfig(
        mode="heuristic",  # No AI needed!
        stm_max_length=50,
        storage_path="./my_data"
    )
    
    # Initialize memory manager
    memory = MemoryManager(
        context_id="my_first_app",
        config=config
    )
    
    # Add some messages
    print("Adding messages...")
    await memory.add_message("chat_1", "user", "Hello! I'm learning about memory systems.")
    await memory.add_message("chat_1", "assistant", "Great! What would you like to know?")
    await memory.add_message("chat_1", "user", "How does the heuristic mode work?")
    
    # Get recent messages
    recent = memory.get_recent_messages("chat_1", limit=10)
    print(f"\nRecent messages: {len(recent)}")
    for msg in recent:
        print(f"  [{msg['role']}]: {msg['content']}")
    
    # Search memory
    print("\nSearching for 'heuristic'...")
    results = await memory.search_memory("heuristic mode", top_k=3)
    print(f"Found {len(results)} results")
    
    print("\n✓ Success! Your first memory system is working.")

if __name__ == "__main__":
    asyncio.run(main())
```

Run it:

```bash
python my_first_memory.py
```

### 2. Using a Preset

```python
import asyncio
from config import MemoryConfig
from core.memory_manager import MemoryManager

async def main():
    # Use a preset - even easier!
    config = MemoryConfig.from_preset("chatbot")
    
    memory = MemoryManager(
        context_id="chatbot_user_123",
        config=config
    )
    
    # Add messages
    await memory.add_message("conv_1", "user", "Remember: I prefer dark mode.")
    await memory.add_message("conv_1", "assistant", "Got it! I'll remember that.")
    
    # Get metrics
    metrics = memory.get_metrics()
    print(f"Metrics: {metrics}")

asyncio.run(main())
```

### 3. With AI (OpenAI)

Set your API key:

```bash
export OPENAI_API_KEY="sk-..."
```

```python
import asyncio
import os
from config import MemoryConfig
from core.memory_manager import MemoryManager

async def main():
    config = MemoryConfig(
        mode="ai",
        ai_adapter_name="openai",
        ai_adapter_config={
            "api_key": os.getenv("OPENAI_API_KEY"),
            "model": "gpt-4o-mini"
        }
    )
    
    memory = MemoryManager(
        context_id="ai_user",
        config=config
    )
    
    # Add messages - AI will process them
    await memory.add_message("thread_1", "user", "I love pizza!")
    await memory.add_message("thread_1", "assistant", "What's your favorite topping?")
    
    print("✓ Messages processed with AI")

asyncio.run(main())
```

### 4. Hybrid Mode (Best of Both Worlds)

```python
from config import MemoryConfig, HybridConfig

config = MemoryConfig(
    mode="hybrid",
    ai_adapter_name="openai",
    ai_adapter_config={"api_key": "sk-..."},
    hybrid_config=HybridConfig(
        ai_threshold_importance=7,  # Use AI for important messages
        ai_probability=0.1,  # Use AI for 10% randomly
        fallback_to_heuristic=True  # Fall back on errors
    )
)

memory = MemoryManager(context_id="hybrid_user", config=config)
```

## Next Steps

### Run Examples

```bash
cd examples
python basic_config.py
python presets.py
python ai_adapters.py
python hybrid_mode.py
python custom_adapter.py
```

### Explore Configuration

Check out `config.py` to see all available options:

- Processing modes
- STM/LTM settings
- Heuristic configuration
- Hybrid configuration
- Performance tuning

### Read the Docs

- [README.md](README.md) - Full documentation
- [CONTRIBUTING.md](CONTRIBUTING.md) - How to contribute
- [CHANGELOG.md](CHANGELOG.md) - Version history

### Try Different Presets

```python
# For chatbots
config = MemoryConfig.from_preset("chatbot")

# For coding assistants
config = MemoryConfig.from_preset("coding-agent")

# For task assistants
config = MemoryConfig.from_preset("assistant")

# For offline use
config = MemoryConfig.from_preset("offline")
```

### Customize Configuration

```python
config = MemoryConfig.from_preset(
    "chatbot",
    stm_max_length=200,  # Override
    storage_path="./custom_data",  # Override
    mode="ai"  # Override
)
```

## Common Use Cases

### Chatbot with Memory

```python
config = MemoryConfig.from_preset("chatbot")
memory = MemoryManager(context_id=f"user_{user_id}", config=config)

# In your chat loop
await memory.add_message(thread_id, "user", user_message)
context = await memory.search_memory(user_message, top_k=5)
# Use context in your LLM prompt
```

### Coding Assistant

```python
config = MemoryConfig.from_preset("coding-agent")
memory = MemoryManager(context_id=f"dev_{dev_id}", config=config)

# Track code discussions
await memory.add_message(session_id, "user", code_question)
await memory.add_message(session_id, "assistant", code_answer)
```

### Task Assistant

```python
config = MemoryConfig.from_preset("assistant")
memory = MemoryManager(context_id=f"assistant_{user_id}", config=config)

# Remember tasks and preferences
await memory.add_message(task_id, "user", "Schedule meeting for tomorrow")
```

## Troubleshooting

### Import Errors

```bash
# Make sure you're in the project directory
cd Memory-Arc

# Install dependencies
pip install -r requirements.txt
```

### API Key Issues

```bash
# Set environment variable
export OPENAI_API_KEY="sk-..."

# Or pass directly in config
config = MemoryConfig(
    mode="ai",
    ai_adapter_name="openai",
    ai_adapter_config={"api_key": "sk-..."}
)
```

### Storage Issues

```bash
# Make sure storage directory exists and is writable
mkdir -p ./data
chmod 755 ./data
```

## Getting Help

- Check [README.md](README.md) for detailed documentation
- Look at [examples/](examples/) for more code samples
- Open an issue on GitHub for bugs
- Start a discussion for questions

## What's Next?

1. **Explore Examples**: Run all examples to see different features
2. **Try Different Modes**: Test AI, heuristic, and hybrid modes
3. **Create Custom Adapter**: Build your own AI adapter
4. **Optimize Configuration**: Tune settings for your use case
5. **Build Something Cool**: Use Memory System in your project!

---

Happy coding! 🚀
