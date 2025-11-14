import re 
from urllib.parse import urlparse

def cleanQuery(query):
    print("[INFO] Cleaning User Query")
    urls = re.findall(r'(https?://[^\s]+)', query)
    cleaned_query = query
    website_urls = []
    youtube_urls = []

    for url in urls:
        cleaned_query = cleaned_query.replace(url, '').strip()
        url_cleaned = url.rstrip('.,;!?"\'')

        parsed_url = urlparse(url_cleaned)
        if "youtube.com" in parsed_url.netloc or "youtu.be" in parsed_url.netloc:
            youtube_urls.append(url_cleaned)
        elif parsed_url.scheme in ['http', 'https']:
            website_urls.append(url_cleaned)
        cleaned_query = re.sub(r'\s+', ' ', cleaned_query).strip()

    return website_urls, youtube_urls, cleaned_query


if __name__ == "__main__":
    sample_query = "Check out this website https://example.com and this YouTube video https://youtu.be/dQw4w9WgXcQ for more info."
    websites, youtube, cleaned_query = cleanQuery(sample_query)
    print("Websites:", websites)
    print("YouTube URLs:", youtube)
    print("Cleaned Query:", cleaned_query)


