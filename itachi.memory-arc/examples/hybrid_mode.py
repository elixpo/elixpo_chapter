"""
Hybrid Mode Example

This example demonstrates hybrid mode configuration, which intelligently
switches between AI and heuristic processing based on:
- Importance thresholds
- Random probability sampling
- Fallback behavior on AI failures

Hybrid mode optimizes for both quality and cost by using AI selectively
for high-value content while relying on fast heuristics for routine processing.
"""

import asyncio
import os
from config import MemoryConfig, HeuristicConfig, HybridConfig
from core.memory_manager import MemoryManager


async def demonstrate_basic_hybrid():
    """Demonstrate basic hybrid mode configuration."""
    print("=" * 60)
    print("BASIC HYBRID MODE")
    print("=" * 60)
    print()
    
    print("Hybrid mode intelligently switches between AI and heuristics")
    print("based on content importance and configured thresholds.")
    print()
    
    # Create hybrid configuration
    config = MemoryConfig(
        mode="hybrid",
        ai_adapter_name="mock",  # Using mock for demonstration
        ai_adapter_config={"prefix": "AI"},
        stm_max_length=8,
        storage_path="./demo_data_hybrid",
        heuristic_config=HeuristicConfig(
            summary_method="sample",
            fact_extraction_method="keywords",
            importance_rules={
                "base_score": 5,
                "keyword_bonus": {
                    "keywords": ["important", "critical", "remember"],
                    "bonus": 3
                },
                "question_bonus": 1,
                "length_bonus": {"threshold": 200, "bonus": 2},
            }
        ),
        hybrid_config=HybridConfig(
            ai_threshold_importance=7,  # Use AI for importance >= 7
            ai_probability=0.2,  # Use AI for 20% of messages randomly
            fallback_to_heuristic=True,  # Fall back on AI failure
        )
    )
    
    print("Configuration:")
    print(f"  Mode: {config.mode}")
    print(f"  AI Threshold: {config.hybrid_config.ai_threshold_importance}")
    print(f"  AI Probability: {config.hybrid_config.ai_probability}")
    print(f"  Fallback Enabled: {config.hybrid_config.fallback_to_heuristic}")
    print()
    
    # Register mock adapter for demonstration
    from adapters.registry import AdapterRegistry
    from adapters.ai_adapter import AIAdapter
    
    class MockAdapter(AIAdapter):
        """Mock adapter for demonstration."""
        
        def __init__(self, prefix: str = "Mock", **kwargs):
            self.prefix = prefix
        
        async def summarize_conversation(self, messages: list[dict]) -> str | None:
            return f"{self.prefix} summary of {len(messages)} messages"
        
        async def extract_facts(self, messages: list[dict]) -> list[dict]:
            return [{"type": "mock", "text": f"{self.prefix} fact"}]
        
        async def score_importance(self, text: str) -> int:
            return min(5 + len(text) // 100, 10)
    
    AdapterRegistry.register("mock", MockAdapter)
    
    # Initialize memory manager
    memory = MemoryManager(
        context_id="hybrid_user",
        config=config
    )
    
    print("✓ Memory manager initialized in hybrid mode")
    print()
    
    return memory


async def demonstrate_importance_routing():
    """Demonstrate how importance affects AI vs heuristic routing."""
    print("=" * 60)
    print("IMPORTANCE-BASED ROUTING")
    print("=" * 60)
    print()
    
    memory = await demonstrate_basic_hybrid()
    
    print("Adding messages with different importance levels...")
    print()
    
    # Low importance message (should use heuristic)
    print("1. Low importance message:")
    low_importance = [
        {"role": "user", "content": "Hi there!"},
        {"role": "assistant", "content": "Hello!"},
    ]
    
    thread_id = "routing_demo"
    for msg in low_importance:
        await memory.add_message(thread_id, msg["role"], msg["content"])
        print(f"   [{msg['role']}]: {msg['content']}")
    
    print("   → Expected: Heuristic processing (low importance)")
    print()
    
    # High importance message (should use AI)
    print("2. High importance message:")
    high_importance = [
        {"role": "user", "content": "IMPORTANT: Remember that I'm allergic to peanuts and shellfish. This is critical for my health and safety."},
        {"role": "assistant", "content": "I've noted your allergies. I'll always keep this in mind."},
    ]
    
    for msg in high_importance:
        await memory.add_message(thread_id, msg["role"], msg["content"])
        preview = msg["content"][:60] + "..." if len(msg["content"]) > 60 else msg["content"]
        print(f"   [{msg['role']}]: {preview}")
    
    print("   → Expected: AI processing (high importance)")
    print()
    
    # Get metrics to see routing decisions
    metrics = memory.get_metrics()
    
    print("Routing Metrics:")
    if "hybrid" in metrics:
        hybrid_metrics = metrics["hybrid"]
        ai_used = sum(hybrid_metrics.get("hybrid_ai_used", {}).values())
        heuristic_used = sum(hybrid_metrics.get("hybrid_heuristic_used", {}).values())
        fallbacks = sum(hybrid_metrics.get("hybrid_fallback", {}).values())
        
        print(f"  AI Used: {ai_used}")
        print(f"  Heuristic Used: {heuristic_used}")
        print(f"  Fallbacks: {fallbacks}")
    
    if "summary" in metrics:
        summary = metrics["summary"]
        print(f"  AI Usage Rate: {summary.get('ai_usage_rate', 0):.2%}")
    
    print()


async def demonstrate_custom_hybrid():
    """Demonstrate customizing hybrid configuration."""
    print("=" * 60)
    print("CUSTOM HYBRID CONFIGURATION")
    print("=" * 60)
    print()
    
    print("Creating a cost-optimized hybrid configuration...")
    print("This configuration minimizes AI usage while maintaining quality.")
    print()
    
    # Cost-optimized configuration
    config = MemoryConfig(
        mode="hybrid",
        ai_adapter_name="mock",
        ai_adapter_config={"prefix": "CostOptimized"},
        stm_max_length=10,
        storage_path="./demo_data_hybrid_custom",
        # Enable caching and rate limiting
        cache_summaries=True,
        max_api_calls_per_minute=10,
        heuristic_config=HeuristicConfig(
            summary_method="keybert",  # Better quality heuristics
            fact_extraction_method="keywords",
            importance_rules={
                "base_score": 4,  # Lower base score
                "keyword_bonus": {
                    "keywords": ["critical", "urgent", "important", "remember", "always", "never"],
                    "bonus": 4  # Higher bonus for keywords
                },
                "question_bonus": 2,
                "length_bonus": {"threshold": 300, "bonus": 2},
            }
        ),
        hybrid_config=HybridConfig(
            ai_threshold_importance=8,  # Higher threshold (use AI less)
            ai_probability=0.05,  # Lower probability (5% random)
            fallback_to_heuristic=True,
            max_ai_calls_per_batch=3,  # Limit AI calls per batch
            prefer_cached=True,
        )
    )
    
    print("Cost-Optimized Configuration:")
    print(f"  AI Threshold: {config.hybrid_config.ai_threshold_importance} (higher = less AI)")
    print(f"  AI Probability: {config.hybrid_config.ai_probability} (lower = less AI)")
    print(f"  Max API Calls/Min: {config.max_api_calls_per_minute}")
    print(f"  Caching Enabled: {config.cache_summaries}")
    print(f"  Heuristic Method: {config.heuristic_config.summary_method}")
    print()
    
    # Validate
    errors = config.validate()
    if errors:
        print("⚠ Configuration errors:")
        for error in errors:
            print(f"  - {error}")
    else:
        print("✓ Configuration is valid")
    print()


async def demonstrate_fallback_behavior():
    """Demonstrate fallback behavior when AI fails."""
    print("=" * 60)
    print("FALLBACK BEHAVIOR")
    print("=" * 60)
    print()
    
    print("Hybrid mode can fall back to heuristics when AI fails.")
    print("This ensures the system continues working even with API issues.")
    print()
    
    # Configuration with fallback enabled
    config_with_fallback = MemoryConfig(
        mode="hybrid",
        ai_adapter_name="mock",
        ai_adapter_config={"prefix": "Fallback"},
        stm_max_length=5,
        storage_path="./demo_data_fallback",
        hybrid_config=HybridConfig(
            ai_threshold_importance=7,
            ai_probability=0.1,
            fallback_to_heuristic=True,  # Enabled
        )
    )
    
    print("Configuration with fallback ENABLED:")
    print(f"  Fallback to Heuristic: {config_with_fallback.hybrid_config.fallback_to_heuristic}")
    print("  → If AI fails, system uses heuristics automatically")
    print()
    
    # Configuration without fallback
    config_no_fallback = MemoryConfig(
        mode="hybrid",
        ai_adapter_name="mock",
        ai_adapter_config={"prefix": "NoFallback"},
        stm_max_length=5,
        storage_path="./demo_data_no_fallback",
        hybrid_config=HybridConfig(
            ai_threshold_importance=7,
            ai_probability=0.1,
            fallback_to_heuristic=False,  # Disabled
        )
    )
    
    print("Configuration with fallback DISABLED:")
    print(f"  Fallback to Heuristic: {config_no_fallback.hybrid_config.fallback_to_heuristic}")
    print("  → If AI fails, system raises an error")
    print()
    
    print("Recommendation: Enable fallback for production systems")
    print("to ensure reliability even during API outages.")
    print()


async def demonstrate_metrics_analysis():
    """Demonstrate analyzing hybrid mode metrics."""
    print("=" * 60)
    print("METRICS ANALYSIS")
    print("=" * 60)
    print()
    
    print("Hybrid mode provides detailed metrics about routing decisions.")
    print()
    
    # Create and use a hybrid system
    from adapters.registry import AdapterRegistry
    from adapters.ai_adapter import AIAdapter
    
    class MockAdapter(AIAdapter):
        def __init__(self, **kwargs):
            pass
        
        async def summarize_conversation(self, messages: list[dict]) -> str | None:
            return f"AI summary of {len(messages)} messages"
        
        async def extract_facts(self, messages: list[dict]) -> list[dict]:
            return [{"type": "ai_fact", "text": "AI extracted fact"}]
        
        async def score_importance(self, text: str) -> int:
            return 7
    
    AdapterRegistry.register("mock", MockAdapter)
    
    config = MemoryConfig(
        mode="hybrid",
        ai_adapter_name="mock",
        stm_max_length=6,
        storage_path="./demo_data_metrics",
        hybrid_config=HybridConfig(
            ai_threshold_importance=7,
            ai_probability=0.3,
            fallback_to_heuristic=True,
        )
    )
    
    memory = MemoryManager(context_id="metrics_user", config=config)
    
    # Add various messages
    messages = [
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Hi there!"},
        {"role": "user", "content": "IMPORTANT: I need to remember this critical information for later."},
        {"role": "assistant", "content": "Noted."},
        {"role": "user", "content": "What's the weather?"},
        {"role": "assistant", "content": "I don't have weather data."},
    ]
    
    thread_id = "metrics_thread"
    for msg in messages:
        await memory.add_message(thread_id, msg["role"], msg["content"])
    
    # Analyze metrics
    metrics = memory.get_metrics()
    
    print("Comprehensive Metrics:")
    print()
    
    if "summary" in metrics:
        summary = metrics["summary"]
        print("Summary Statistics:")
        print(f"  Total Operations: {summary.get('total_operations', 0)}")
        print(f"  AI Used: {summary.get('ai_used', 0)}")
        print(f"  Heuristic Used: {summary.get('heuristic_used', 0)}")
        print(f"  Fallbacks: {summary.get('fallbacks', 0)}")
        print(f"  AI Usage Rate: {summary.get('ai_usage_rate', 0):.2%}")
        print(f"  Fallback Rate: {summary.get('fallback_rate', 0):.2%}")
        print()
    
    if "hybrid" in metrics:
        print("Hybrid Routing Details:")
        hybrid = metrics["hybrid"]
        print(f"  AI Used by Operation: {dict(hybrid.get('hybrid_ai_used', {}))}")
        print(f"  Heuristic Used by Operation: {dict(hybrid.get('hybrid_heuristic_used', {}))}")
        print(f"  Fallbacks by Operation: {dict(hybrid.get('hybrid_fallback', {}))}")
        print()
    
    print("Use these metrics to:")
    print("  - Monitor AI usage and costs")
    print("  - Tune threshold and probability settings")
    print("  - Identify when fallbacks occur")
    print("  - Optimize for your specific use case")
    print()


async def main():
    """Run all hybrid mode examples."""
    print("\n" + "=" * 60)
    print("HYBRID MODE EXAMPLES")
    print("=" * 60)
    print()
    
    # Demonstrate importance-based routing
    await demonstrate_importance_routing()
    
    # Demonstrate custom configuration
    await demonstrate_custom_hybrid()
    
    # Demonstrate fallback behavior
    await demonstrate_fallback_behavior()
    
    # Demonstrate metrics analysis
    await demonstrate_metrics_analysis()
    
    print("=" * 60)
    print("All hybrid mode examples completed!")
    print("=" * 60)
    print()
    print("Key Takeaways:")
    print("  - Hybrid mode balances quality and cost")
    print("  - Importance thresholds control AI usage")
    print("  - Fallback ensures reliability")
    print("  - Metrics help optimize configuration")
    print("  - Caching reduces redundant API calls")
    print()


if __name__ == "__main__":
    asyncio.run(main())
