"""
Test multiple queries with session persistence
"""

from searchService.search_tester import SearchEndpointTester


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


if __name__ == "__main__":
    test_with_sessions()
