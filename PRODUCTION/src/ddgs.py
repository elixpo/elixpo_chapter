import requests
from bs4 import BeautifulSoup

def ddgs_search(query):
    url = "https://html.duckduckgo.com/html/"
    headers = {
        "User-Agent": "Mozilla/5.0"
    }
    data = {
        "q": query
    }

    try:
        response = requests.post(url, data=data, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        links = []
        for a in soup.select("a.result__a"):
            href = a.get("href")
            if href and href.startswith("http"):
                links.append(href)

        return links[:10]  # First 10 results

    except Exception as e:
        print("❌ DDG search failed:", e)
        return []

# Example usage:
for url in ddgs_search("indian sign language detection cnn"):
    print(url)
