"""
Test batch queries and measure timing
"""

from searchService.search_tester import SearchEndpointTester


def test_batch_with_timing():
    """Test batch queries and measure timing"""
    print("\n🧪 Testing batch queries with timing analysis...\n")
    
    queries = [
        "Python programming basics",
        "JavaScript async/await",
        "Database optimization",
        "API design patterns",
        "Cloud computing architecture"
    ]
    
    tester = SearchEndpointTester()
    results = tester.search_multiple(
        queries=queries,
        use_sessions=False,
        verbose=True
    )
    
    # Analyze timing
    print("\n⏱️  TIMING ANALYSIS")
    print(f"{'─'*80}")
    for idx, result in enumerate(results, 1):
        query = result.get("query", "N/A")
        elapsed = result.get("elapsed_time", 0)
        status = "✅" if result.get("success") else "❌"
        print(f"{status} Query {idx}: {query[:50]:<50} | {elapsed:>6.2f}s")
    print(f"{'─'*80}\n")
    
    return results


if __name__ == "__main__":
    test_batch_with_timing()
