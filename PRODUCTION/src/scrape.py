import httpx
from selectolax.parser import HTMLParser

def fetch_full_text(url):
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
        r = httpx.get(url, headers=headers, timeout=5)
        html = HTMLParser(r.text)
        
        # Optional: Get page title
        title = html.css_first("title").text(strip=True) if html.css_first("title") else ""
        
        # Extract all visible content tags
        tags = ["h1", "h2", "h3", "p", "li", "td"]
        content = []
        for tag in tags:
            for node in html.css(tag):
                txt = node.text(strip=True)
                if txt:
                    content.append(txt)
        
        full_text = "\n".join(content)
        return {"url": url, "title": title, "text": full_text}
    
    except Exception as e:
        return {"url": url, "title": "", "text": "", "error": str(e)}

# Example usage
urls = [
    "https://en.wikipedia.org/wiki/Indian_Sign_Language",
    "https://www.geeksforgeeks.org/machine-learning/dbscan-clustering-in-ml-density-based-clustering/"
]

for result in map(fetch_full_text, urls):
    print("🔗", result["url"])
    print("📌", result["title"])
    print(result["text"], "...\n")
