import re 
"""
Extracts website and YouTube URLs from the input query string, removes them from the query, 
and returns a tuple containing a list of website URLs, a list of YouTube URLs, and the cleaned query string.
Args:
    query (str): The input string potentially containing URLs.
Returns:
    tuple: A tuple containing:
        - website_urls (list): List of extracted website URLs (excluding YouTube).
        - youtube_urls (list): List of extracted YouTube URLs.
        - cleaned_query (str): The input query string with URLs removed and whitespace cleaned.
"""
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


