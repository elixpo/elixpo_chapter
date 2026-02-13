"""
Test a single search query
"""

from searchService.search_tester import SearchEndpointTester


def test_single_query():
    """Test a single search query"""
    print("\n🧪 Testing single query...\n")
    
    tester = SearchEndpointTester()
    result = tester.search(
        query="What is artificial intelligence?",
        verbose=True
    )
    
    return result


if __name__ == "__main__":
    test_single_query()
