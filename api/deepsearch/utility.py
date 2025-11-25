from collections import deque
from loguru import logger
from multiprocessing.managers import BaseManager
from scrape import fetch_full_text
import concurrent 
import re
from urllib.parse import urlparse, parse_qs



_deepsearch_store = {}

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

def youtubeMetadata(url: str):
    print("[INFO] Getting Youtube Metadata")
    parsed_url = urlparse(url)
    if "youtube.com" not in parsed_url.netloc and "youtu.be" not in parsed_url.netloc:
        print("Not a valid YouTube URL.")
        return None
    try:
        metadata = search_service.get_youtube_metadata(url)
        return metadata
    except Exception as e:
        print(f"Error fetching metadata for {url}: {type(e).__name__} - {e}")
        return None

def preprocess_text(text):
    text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
    text = re.sub(r'[^\w\s.,!?;:]', ' ', text)
    sentences = re.split(r'(?<=[.!?])\s+', text)
    
    meaningful_sentences = []
    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) > 20 and len(sentence.split()) > 3:
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
        sentences = preprocess_text(results)
        data_embed, query_embed = embedModelService.encodeSemantic(sentences, list(queries))
        scores = embedModelService.cosineScore(query_embed, data_embed, k=5)
        for idx, score in scores:
            if score > 0.8:  
                sentences[idx]

        return sentences





def rerank(query, information):
    sentences = information if isinstance(information, list) else preprocess_text(str(information))
    data_embed, query_embed = embedModelService.encodeSemantic(sentences, [query])
    scores = embedModelService.cosineScore(query_embed, data_embed, k=5)  
    information_piece = ""
    seen_sentences = set()  
    for idx, score in scores:
        if score > 0.8:  
            sentence = sentences[idx].strip()
            if sentence not in seen_sentences and len(sentence) > 20: 
                information_piece += sentence + " "
                seen_sentences.add(sentence)
    return information_piece.strip()



def storeDeepSearchQuery(query: list, sessionID: str):
    _deepsearch_store[sessionID] = query

def getDeepSearchQuery(sessionID: str):
    return _deepsearch_store.get(sessionID)

def cleanDeepSearchQuery(sessionID: str):
    if sessionID in _deepsearch_store:
        del _deepsearch_store[sessionID]

def testYoutubeMetadata():
    youtube_url = "https://www.youtube.com/watch?v=FLal-KvTNAQ"
    metadata = youtubeMetadata(youtube_url)
    print("Metadata:", metadata)



def testSearching():
    test_queries = ["Latest news from Nepal", "Political updates in Nepal"]
    test_urls = [
        "https://english.nepalnews.com/",
        "https://apnews.com/article/nepal-gen-z-protests-army-kathmandu-2e4d9e835216b11fa238d7bcf8915cbf",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    ]
    contents = fetch_url_content_parallel(test_queries, test_urls)
    for idx, content in enumerate(contents):
        print(f"Content snippet {idx+1}:", content[:200])
    
    


if __name__ == "__main__":
    pass