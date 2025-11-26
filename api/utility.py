
from collections import deque
from loguru import logger
from multiprocessing.managers import BaseManager
from scrape import fetch_full_text
import concurrent 
import re

class modelManager(BaseManager): pass
modelManager.register("accessSearchAgents")
modelManager.register("ipcService")
manager = modelManager(address=("localhost", 5010), authkey=b"ipcService")
manager.connect()
search_service = manager.accessSearchAgents()
embedModelService = manager.ipcService()


def webSearch(query: str):
    urls = search_service.web_search(query)
    return urls

def imageSearch(query: str):
    urls = search_service.image_search(query)
    return urls

def preprocess_text(text):
    # Remove URLs, special characters, and clean up
    text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
    text = re.sub(r'[^\w\s.,!?;:]', ' ', text)
    
    # Split into sentences more intelligently
    sentences = re.split(r'(?<=[.!?])\s+', text)
    
    # Filter out short or meaningless sentences
    meaningful_sentences = []
    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) > 20 and len(sentence.split()) > 3:
            # Remove sentences that are mostly navigation/UI elements
            if not any(word in sentence.lower() for word in ['feedback', 'menu', 'navigation', 'click', 'download']):
                meaningful_sentences.append(sentence)
    
    return meaningful_sentences


def fetch_url_content_parallel(queries, urls, max_workers=10):
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_full_text, url): url for url in urls}
        results = ""
        for future in concurrent.futures.as_completed(futures):
            url = futures[future]
            try:
                text_content = future.result()
                clean_text = str(text_content).encode('unicode_escape').decode('utf-8')
                clean_text = clean_text.replace('\\n', ' ').replace('\\r', ' ').replace('\\t', ' ')
                clean_text = ''.join(c for c in clean_text if c.isprintable())
                results += f"\nURL: {url}\nText Preview: {clean_text.strip()}"
            except Exception as e:
                logger.error(f"Failed fetching {url}: {e}")
                results += f"\nURL: {url}\n Failed to fetch content of this URL"
        logger.info(f"Fetched all URL information in parallel.")
        information = embedModelService.extract_relevant(results, queries)
        for i in information:
            sentences = []
            for piece in i:
                sentences.extend([s.strip() for s in piece.split('.') if s.strip()])
            result += '. '.join(sentences) + '. '
        return results


