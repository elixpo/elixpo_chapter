"""
ElixpoSearch /api/search Endpoint Test Functions
Run various test scenarios for the search endpoint
"""

from search_tester import SearchEndpointTester


def test_single_query():
    """Test a single search query"""
    print("\n🧪 Testing single query...\n")
    
    tester = SearchEndpointTester()
    result = tester.search(
        query="What is artificial intelligence?",
        verbose=True
    )
    
    return result


def test_multiple_queries():
    """Test multiple search queries"""
    print("\n🧪 Testing multiple queries...\n")
    
    queries = [
        "What is machine learning?",
        "How does deep learning work?",
        "Explain neural networks",
        "What is natural language processing?",
        "How does computer vision work?"
    ]
    
    tester = SearchEndpointTester()
    results = tester.search_multiple(
        queries=queries,
        use_sessions=False,
        verbose=True
    )
    
    return results


def test_with_sessions():
    """Test multiple queries with session persistence"""
    print("\n🧪 Testing with session persistence...\n")
    
    queries = [
        "What is machine learning?",
        "Tell me more about supervised learning",
        "How is unsupervised learning different?"
    ]
    
    tester = SearchEndpointTester()
    results = tester.search_multiple(
        queries=queries,
        use_sessions=True,
        verbose=True
    )
    
    return results


def test_with_image():
    """Test search with image URL (if needed)"""
    print("\n🧪 Testing with image...\n")
    
    tester = SearchEndpointTester()
    result = tester.search(
        query="What is in this image?",
        image_url="https://example.com/image.jpg",
        verbose=True
    )
    
    return result


def test_custom_queries(queries: list):
    """Test with custom queries"""
    print(f"\n🧪 Testing {len(queries)} custom queries...\n")
    
    tester = SearchEndpointTester()
    results = tester.search_multiple(
        queries=queries,
        use_sessions=False,
        verbose=True
    )
    
    return results


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


def run_all_tests():
    """Run all test scenarios"""
    print("\n🚀 Running all tests...\n")
    
    print("\n[1/5] Single Query Test")
    test_single_query()
    
    print("\n[2/5] Multiple Queries Test")
    test_multiple_queries()
    
    print("\n[3/5] Session Persistence Test")
    test_with_sessions()
    
    print("\n[4/5] Batch with Timing Test")
    test_batch_with_timing()
    
    print("\n[5/5] Custom Queries Test")
    custom = [
        "Latest trends in artificial intelligence",
        "How to learn machine learning",
        "Top programming languages 2026"
    ]
    test_custom_queries(custom)
    
    print("\n✅ All tests completed!\n")


if __name__ == "__main__":
    import sys
    
    print("""
╔════════════════════════════════════════════════════════════════════╗
║           ElixpoSearch /api/search Endpoint Tester                 ║
║                                                                    ║
║ Usage:                                                             ║
║   python run_tests.py [option]                                    ║
║                                                                    ║
║ Options:                                                           ║
║   single      - Test single query                                 ║
║   multiple    - Test multiple queries                             ║
║   sessions    - Test with session persistence                     ║
║   image       - Test with image URL                               ║
║   batch       - Test batch with timing analysis                   ║
║   (default)   - Run all tests                                     ║
║                                                                    ║
║ Note: Make sure the server is running on http://localhost:8000    ║
╚════════════════════════════════════════════════════════════════════╝
    """)
    
    option = sys.argv[1] if len(sys.argv) > 1 else "all"
    
    try:
        if option == "single":
            test_single_query()
        
        elif option == "multiple":
            test_multiple_queries()
        
        elif option == "sessions":
            test_with_sessions()
        
        elif option == "image":
            test_with_image()
        
        elif option == "batch":
            test_batch_with_timing()
        
        else:  # Run all tests
            run_all_tests()
    
    except KeyboardInterrupt:
        print("\n\n⚠️  Tests interrupted by user")
    
    except Exception as e:
        print(f"\n❌ Error running tests: {e}")
        import traceback
        traceback.print_exc()
