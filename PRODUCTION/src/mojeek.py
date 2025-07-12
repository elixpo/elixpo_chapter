import requests
from bs4 import BeautifulSoup

def mojeek_form_search(query):
    url = "https://www.mojeek.com/search"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Referer": "https://www.mojeek.com/",
        "Accept": "text/html"
    }
    params = {
        "q": query
    }

    try:
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        results = soup.select("ul.results-standard li")
        links = []

        for r in results[:5]:
            title_tag = r.select_one("a.title")
            if title_tag and title_tag.has_attr("href"):
                links.append(title_tag["href"])

        return links

    except requests.exceptions.RequestException as e:
        print("❌ Request failed:", e)
        return []

# Example usage
urls = mojeek_form_search("elixpo")
for url in urls:
    print(url)
