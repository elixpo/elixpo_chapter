"""
Test search with image URL
"""

from searchService.search_tester import SearchEndpointTester


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


if __name__ == "__main__":
    test_with_image()
