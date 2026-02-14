from typing import List
import re
from loguru import logger
from urllib.parse import urlparse

def chunk_text(text: str, chunk_size: int = 600, overlap: int = 60) -> List[str]:
    words = text.split()
    chunks = []
    stride = chunk_size - overlap
    
    for i in range(0, len(words), stride):
        chunk_words = words[i:i + chunk_size]
        if len(chunk_words) > 10:
            chunks.append(" ".join(chunk_words))
    
    return chunks


def clean_text(text: str) -> str:
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = text.strip()
    return text


def normalize_url(url: str) -> str:
    from urllib.parse import urlparse
    parsed = urlparse(url)
    return f"{parsed.netloc}{parsed.path}"



def cleanQuery(query):
    logger.debug("[Utility] Cleaning user query")
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

