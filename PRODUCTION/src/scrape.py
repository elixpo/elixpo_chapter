import httpx

# Fetches and parses a web page, extracting text, title, and main images.
from selectolax.parser import HTMLParser
from urllib.parse import urljoin


"""
Fetches the full text content, title, and up to three main images from a given web page URL.
Args:
    url (str): The URL of the web page to fetch.
Returns:
    dict: A dictionary containing:
        - 'url' (str): The original URL.
        - 'title' (str): The page title, if available.
        - 'text' (str): The concatenated text content from selected HTML tags.
        - 'images' (list): A list of up to three image URLs extracted from the page.
        - 'error' (str, optional): Error message if an exception occurred.
"""

def fetch_full_text(url):
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
        r = httpx.get(url, headers=headers, timeout=5)
        html = HTMLParser(r.text)

        # Optional: Get page title
        title = html.css_first("title").text(strip=True) if html.css_first("title") else ""

        # Extract text content
        tags = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "td", "blockquote", "span", "textarea", "article"]
        content = []
        for tag in tags:
            for node in html.css(tag):
                txt = node.text(strip=True)
                if txt:
                    content.append(txt)
        full_text = "\n".join(content)

        # Extract images
        images = set()

        # First, try meta og:image
        for meta in html.css("meta"):
            if meta.attrs.get("property") in ["og:image", "og:image:url"]:
                images.add(urljoin(url, meta.attrs.get("content", "")))

        # Then extract from <img> tags
        for img in html.css("img"):
            src = img.attrs.get("src") or img.attrs.get("data-src")
            if not src:
                continue
            src = urljoin(url, src)
            src_lower = src.lower()
            if any(x in src_lower for x in ["icon", "sprite", "logo", "svg", "placeholder"]):
                continue
            if not src_lower.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
                continue
            # Skip small icons or decorative images if dimensions are present
            width = img.attrs.get("width")
            height = img.attrs.get("height")

            try:
                width = int(str(width).replace("px", "")) if width else None
                height = int(str(height).replace("px", "")) if height else None
            except ValueError:
                width = height = None

            if width and width < 100:
                continue
            if height and height < 100:
                continue
            images.add(src)

        # Return only top 3 images
        images = list(images)[:3]

        return {"url": url, "title": title, "text": full_text, "images": images}

    except Exception as e:
        return {"url": url, "title": "", "text": "", "error": str(e)}


if __name__ == "__main__":
    urls = [
        "https://en.wikipedia.org/wiki/Indian_Sign_Language",
        "https://www.geeksforgeeks.org/machine-learning/dbscan-clustering-in-ml-density-based-clustering/"
    ]
    for result in map(fetch_full_text, urls):
        print("🔗", result["url"])
        print("📌", result["title"])
        print(result["text"] if result["text"] else "[No Text]", "\n")
        if "images" in result:
            print("🖼️ Images:", ", ".join(result["images"]), "\n")
