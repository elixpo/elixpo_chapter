"""
Test multiple search queries
"""

from searchService.search_tester import SearchEndpointTester


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


if __name__ == "__main__":
    test_multiple_queries()
