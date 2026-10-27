"""
Test with custom queries
"""

from searchService.search_tester import SearchEndpointTester


def test_custom_queries(queries: list = None):
    """Test with custom queries"""
    
    if queries is None:
        queries = [
            "Latest trends in artificial intelligence",
            "How to learn machine learning",
            "Top programming languages 2026"
        ]
    
    print(f"\n🧪 Testing {len(queries)} custom queries...\n")
    
    tester = SearchEndpointTester()
    results = tester.search_multiple(
        queries=queries,
        use_sessions=False,
        verbose=True
    )
    
    return results


if __name__ == "__main__":
    test_custom_queries()
