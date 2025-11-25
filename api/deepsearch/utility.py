from urllib.parse import urlparse, parse_qs
from typing import Optional, Iterable
from collections import deque
from loguru import logger
from multiprocessing.managers import BaseManager
from scrape import fetch_full_text
import concurrent 
import re
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled
from youtube_transcript_api.formatters import TextFormatter

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
    metadata = search_service.get_youtube_metadata(url)
    return metadata

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

def fetch_youtube_parallel(urls, mode='metadata', max_workers=10):
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        if mode == 'metadata':
            futures = {executor.submit(youtubeMetadata, url): url for url in urls}
        else:
            futures = {executor.submit(get_youtube_transcript, url): url for url in urls}

        results = {}
        for future in concurrent.futures.as_completed(futures):
            url = futures[future]
            try:
                results[url] = future.result()
            except Exception as e:
                logger.error(f"YouTube {mode} failed for {url}: {e}")
                results[url] = '[Failed]'
        return results

def get_youtube_metadata(url):
    print("[INFO] Getting Youtube Metadata")
    parsed_url = urlparse(url)
    if "youtube.com" not in parsed_url.netloc and "youtu.be" not in parsed_url.netloc:
        print("Not a valid YouTube URL.")
        return None

    try:
        metadata = youtubeMetadata(url)
        return metadata
    except Exception as e:
        print(f"Error fetching metadata for {url}: {type(e).__name__} - {e}")
        return None


def get_youtube_video_id(url):
    print("[INFO] Getting Youtube video ID")
    parsed_url = urlparse(url)
    if "youtube.com" in parsed_url.netloc:
        video_id = parse_qs(parsed_url.query).get('v')
        if video_id:
            return video_id[0]
        if parsed_url.path:
            match = re.search(r'/(?:embed|v)/([^/?#&]+)', parsed_url.path)
            if match:
                return match.group(1)
    elif "youtu.be" in parsed_url.netloc:
        path = parsed_url.path.lstrip('/')
        if path:
            video_id = path.split('/')[0].split('?')[0].split('#')[0]
            video_id = video_id.split('&')[0]
            return video_id
    return None



def get_youtube_transcript(url, query, full_transcript: bool = False, languages: Iterable[str] = ("en",),preserve_formatting: bool = False,):
    print("[INFO] Getting Youtube Transcript")
    video_id = get_youtube_video_id(url)
    if not video_id:
        print("Attempted to get transcript with no video ID.")
        return None

    try:
        try:
            entries = YouTubeTranscriptApi().list(video_id).find_transcript(languages).fetch(preserve_formatting=preserve_formatting)
            print(f"Found English ('en') transcript for video ID: {video_id}")
        except NoTranscriptFound:
            print(f"No 'en' transcript found. Trying other available languages.")
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            available = list(transcript_list._manually_created_transcripts.values()) + list(transcript_list._generated_transcripts.values())
            if not available:
                print(f"No transcripts found in any language for video ID: {video_id}")
                return None
            transcript = available[0]
            print(f"Using transcript in '{transcript.language_code}'")
            entries = transcript.fetch()

        if not entries:
            raise ValueError("Transcript fetch returned no entries.")
        full_text = " ".join(entry.text for entry in entries)
        if full_transcript:
            return full_text
        else:
            full_text = full_text.split(". ")
            data_embed, query_embed = embedModelService.encodeSemantic(full_text, list(query))
            scores = embedModelService.cosineScore(query_embed, data_embed, k=5)
            relevant_texts = [full_text[idx] for idx, score in scores if score > 0.8]
            return ". ".join(relevant_texts) if relevant_texts else full_text
        
        

    except NoTranscriptFound:
        print(f"No transcript available for video ID: {video_id}")
    except TranscriptsDisabled:
        print(f"Transcripts are disabled for video ID: {video_id}")
    except Exception as e:
        print(f"Unexpected error while fetching transcript for {video_id}: {type(e).__name__} - {e}")

    return None


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


def testYoutubeTranscript():
    url = "https://www.youtube.com/watch?v=FLal-KvTNAQ"
    query = "summarize me the video "
    transcript = get_youtube_transcript(url, query, full_transcript=False)
    print("Transcript snippet:", transcript[:500])
    print("="*50)
    metadata = get_youtube_metadata(url)
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
    testYoutubeTranscript()