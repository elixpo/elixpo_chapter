"""
Custom Adapter Example

This example demonstrates how to create custom AI adapters for the memory system.

Requirements covered: 9.1, 9.2, 2.4, 5.3
"""

import asyncio
import logging
import sys
import os
from datetime import datetime
from typing import Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import MemoryConfig
from core.memory_manager import MemoryManager
from adapters.ai_adapter import AIAdapter
from adapters.registry import AdapterRegistry


logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


class SimpleMockAdapter(AIAdapter):
    """A simple mock adapter for testing and demonstration."""
    
    def __init__(self, response_prefix: str = "Mock", **kwargs):
        self.response_prefix = response_prefix
        logger.info(f"Initialized SimpleMockAdapter with prefix: {response_prefix}")
    
    async def summarize_conversation(self, messages: list[dict[str, Any]]) -> str | None:
        if not messages:
            return None
        user_count = sum(1 for m in messages if m.get("role") == "user")
        assistant_count = sum(1 for m in messages if m.get("role") == "assistant")
        return f"{self.response_prefix} Summary: {user_count} user, {assistant_count} assistant messages"
    
    async def extract_facts(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        facts = []
        for i, msg in enumerate(messages):
            if msg.get("role") == "user" and len(msg.get("content", "")) > 20:
                facts.append({
                    "type": "user_statement",
                    "text": f"{self.response_prefix} fact from message {i+1}",
                    "source": "mock_extraction"
                })
        return facts
    
    async def score_importance(self, text: str) -> int:
        score = 5
        if len(text) > 100:
            score += 1
        if any(kw in text.lower() for kw in ["important", "critical", "remember"]):
            score += 2
        return min(score, 10)


class LoggingAdapter(AIAdapter):
    """An adapter that wraps another adapter and logs all operations."""
    
    def __init__(self, wrapped_adapter: AIAdapter, log_level: str = "INFO", **kwargs):
        self.wrapped = wrapped_adapter
        self.log_level = getattr(logging, log_level.upper(), logging.INFO)
        self.call_count = {"summarize": 0, "extract_facts": 0, "score_importance": 0}
        logger.info(f"Initialized LoggingAdapter wrapping {type(wrapped_adapter).__name__}")
    
    async def summarize_conversation(self, messages: list[dict[str, Any]]) -> str | None:
        self.call_count["summarize"] += 1
        start_time = datetime.now()
        logger.log(self.log_level, f"[{self.call_count['summarize']}] Summarizing {len(messages)} messages...")
        try:
            result = await self.wrapped.summarize_conversation(messages)
            duration = (datetime.now() - start_time).total_seconds()
            logger.log(self.log_level, f"[{self.call_count['summarize']}] Completed in {duration:.2f}s")
            return result
        except Exception as e:
            logger.error(f"Summary failed: {e}")
            raise
    
    async def extract_facts(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        self.call_count["extract_facts"] += 1
        start_time = datetime.now()
        logger.log(self.log_level, f"[{self.call_count['extract_facts']}] Extracting facts...")
        try:
            result = await self.wrapped.extract_facts(messages)
            duration = (datetime.now() - start_time).total_seconds()
            logger.log(self.log_level, f"[{self.call_count['extract_facts']}] Extracted {len(result)} facts in {duration:.2f}s")
            return result
        except Exception as e:
            logger.error(f"Fact extraction failed: {e}")
            raise
    
    async def score_importance(self, text: str) -> int:
        self.call_count["score_importance"] += 1
        try:
            result = await self.wrapped.score_importance(text)
            logger.log(self.log_level, f"[{self.call_count['score_importance']}] Scored {result}/10")
            return result
        except Exception as e:
            logger.error(f"Scoring failed: {e}")
            raise
    
    def get_stats(self) -> dict[str, int]:
        return self.call_count.copy()


class CachingAdapter(AIAdapter):
    """An adapter that caches responses to avoid redundant API calls."""
    
    def __init__(self, wrapped_adapter: AIAdapter, cache_size: int = 100, **kwargs):
        self.wrapped = wrapped_adapter
        self.cache_size = cache_size
        self.summary_cache: dict[str, str] = {}
        self.facts_cache: dict[str, list[dict]] = {}
        self.importance_cache: dict[str, int] = {}
        self.cache_hits = 0
        self.cache_misses = 0
        logger.info(f"Initialized CachingAdapter with cache size: {cache_size}")
    
    def _make_cache_key(self, messages: list[dict[str, Any]]) -> str:
        content = "|".join(m.get("content", "") for m in messages)
        return str(hash(content))
    
    async def summarize_conversation(self, messages: list[dict[str, Any]]) -> str | None:
        cache_key = self._make_cache_key(messages)
        if cache_key in self.summary_cache:
            self.cache_hits += 1
            logger.debug(f"Cache hit for summary")
            return self.summary_cache[cache_key]
        self.cache_misses += 1
        result = await self.wrapped.summarize_conversation(messages)
        if result and len(self.summary_cache) < self.cache_size:
            self.summary_cache[cache_key] = result
        return result
    
    async def extract_facts(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        cache_key = self._make_cache_key(messages)
        if cache_key in self.facts_cache:
            self.cache_hits += 1
            return self.facts_cache[cache_key]
        self.cache_misses += 1
        result = await self.wrapped.extract_facts(messages)
        if len(self.facts_cache) < self.cache_size:
            self.facts_cache[cache_key] = result
        return result
    
    async def score_importance(self, text: str) -> int:
        cache_key = str(hash(text))
        if cache_key in self.importance_cache:
            self.cache_hits += 1
            return self.importance_cache[cache_key]
        self.cache_misses += 1
        result = await self.wrapped.score_importance(text)
        if len(self.importance_cache) < self.cache_size:
            self.importance_cache[cache_key] = result
        return result
    
    def get_cache_stats(self) -> dict[str, Any]:
        total = self.cache_hits + self.cache_misses
        return {
            "cache_hits": self.cache_hits,
            "cache_misses": self.cache_misses,
            "hit_rate": self.cache_hits / total if total > 0 else 0,
        }


async def demo_simple_mock_adapter():
    print("=" * 70)
    print("EXAMPLE 1: Simple Mock Adapter")
    print("=" * 70)
    print()
    
    AdapterRegistry.register("simple_mock", SimpleMockAdapter)
    print("✓ Registered SimpleMockAdapter")
    
    config = MemoryConfig(
        mode="ai",
        ai_adapter_name="simple_mock",
        ai_adapter_config={"response_prefix": "Demo"},
        stm_max_length=5,
        storage_path="./demo_data_custom_simple"
    )
    
    memory = MemoryManager(context_id="demo_user", config=config)
    print("✓ Memory manager initialized\n")
    
    print("Adding messages...")
    thread_id = "test_thread"
    messages = [
        {"role": "user", "content": "Hello! I'm interested in learning about custom adapters."},
        {"role": "assistant", "content": "Great! I can help you with that."},
        {"role": "user", "content": "How do I create my own adapter?"},
        {"role": "assistant", "content": "You need to implement the AIAdapter interface."},
        {"role": "user", "content": "That sounds straightforward. Can you show me an example?"},
    ]
    
    for msg in messages:
        await memory.add_message(thread_id, msg["role"], msg["content"])
        print(f"  [{msg['role']}]: {msg['content'][:60]}...")
    
    print("\n✓ Messages processed\n")
    
    metrics = memory.get_metrics()
    print("Metrics:")
    print(f"  AI Calls: {dict(metrics.get('ai_calls', {}))}")
    print()


async def demo_logging_adapter():
    print("=" * 70)
    print("EXAMPLE 2: Logging Wrapper Adapter")
    print("=" * 70)
    print()
    
    base_adapter = SimpleMockAdapter(response_prefix="Base")
    logging_adapter = LoggingAdapter(base_adapter, log_level="INFO")
    
    AdapterRegistry.register("logging_mock", lambda **kwargs: logging_adapter)
    print("✓ Registered LoggingAdapter\n")
    
    config = MemoryConfig(
        mode="ai",
        ai_adapter_name="logging_mock",
        stm_max_length=5,
        storage_path="./demo_data_custom_logging"
    )
    
    memory = MemoryManager(context_id="demo_user", config=config)
    print("✓ Memory manager initialized\n")
    
    print("Adding messages (watch the logs)...")
    thread_id = "test_thread"
    messages = [
        {"role": "user", "content": "This is an important message about custom adapters."},
        {"role": "assistant", "content": "I understand."},
        {"role": "user", "content": "Remember: always log operations for debugging."},
    ]
    
    for msg in messages:
        await memory.add_message(thread_id, msg["role"], msg["content"])
    
    print("\n✓ Messages processed\n")
    
    stats = logging_adapter.get_stats()
    print("Logging Statistics:")
    for operation, count in stats.items():
        print(f"  {operation}: {count} calls")
    print()


async def demo_caching_adapter():
    print("=" * 70)
    print("EXAMPLE 3: Caching Adapter")
    print("=" * 70)
    print()
    
    base_adapter = SimpleMockAdapter(response_prefix="Cached")
    caching_adapter = CachingAdapter(base_adapter, cache_size=50)
    
    AdapterRegistry.register("caching_mock", lambda **kwargs: caching_adapter)
    print("✓ Registered CachingAdapter\n")
    
    print("Testing cache behavior...")
    messages = [
        {"role": "user", "content": "Test message 1"},
        {"role": "assistant", "content": "Response 1"},
    ]
    
    print("First call (cache miss):")
    result1 = await caching_adapter.summarize_conversation(messages)
    print(f"  Result: {result1}")
    stats1 = caching_adapter.get_cache_stats()
    print(f"  Stats: {stats1['cache_hits']} hits, {stats1['cache_misses']} misses\n")
    
    print("Second call with same messages (cache hit):")
    result2 = await caching_adapter.summarize_conversation(messages)
    print(f"  Result: {result2}")
    stats2 = caching_adapter.get_cache_stats()
    print(f"  Stats: {stats2['cache_hits']} hits, {stats2['cache_misses']} misses\n")
    
    different_messages = [
        {"role": "user", "content": "Different message"},
        {"role": "assistant", "content": "Different response"},
    ]
    print("Third call with different messages (cache miss):")
    result3 = await caching_adapter.summarize_conversation(different_messages)
    print(f"  Result: {result3}")
    stats3 = caching_adapter.get_cache_stats()
    print(f"  Stats: {stats3['cache_hits']} hits, {stats3['cache_misses']} misses")
    print(f"  Hit rate: {stats3['hit_rate']:.1%}\n")


def demo_adapter_registry():
    print("=" * 70)
    print("ADAPTER REGISTRY")
    print("=" * 70)
    print()
    
    print("All registered adapters:")
    adapters = AdapterRegistry.list()
    for adapter_name in adapters:
        info = AdapterRegistry.describe(adapter_name)
        marker = " (custom)" if info["type"] == "custom" else " (built-in)"
        print(f"  - {adapter_name}{marker}")
    print()


async def main():
    print("\n" + "=" * 70)
    print("CUSTOM ADAPTER EXAMPLES")
    print("=" * 70)
    print()
    print("Demonstrating how to create custom AI adapters:")
    print("  1. Simple Mock Adapter - Basic implementation")
    print("  2. Logging Wrapper - Logs all operations")
    print("  3. Caching Adapter - Caches responses")
    print()
    
    await demo_simple_mock_adapter()
    await demo_logging_adapter()
    await demo_caching_adapter()
    demo_adapter_registry()
    
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print()
    print("Key takeaways:")
    print("  ✓ Custom adapters implement the AIAdapter interface")
    print("  ✓ Three methods required:")
    print("    - summarize_conversation(messages) -> str | None")
    print("    - extract_facts(messages) -> list[dict]")
    print("    - score_importance(text) -> int")
    print("  ✓ Register with AdapterRegistry.register(name, class)")
    print("  ✓ Use via configuration")
    print("  ✓ Adapters can wrap other adapters (decorator pattern)")
    print()


if __name__ == "__main__":
    asyncio.run(main())
