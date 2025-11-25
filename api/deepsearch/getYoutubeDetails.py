from urllib.parse import urlparse, parse_qs
from typing import Optional, Iterable
import re
from pytube import YouTube, exceptions
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled
from youtube_transcript_api.formatters import TextFormatter
from pytube import YouTube
from config import MAX_TRANSCRIPT_WORD_COUNT, get_youtube_video_metadata_show_log
from multiprocessing.managers import BaseManager
import json 

class modelManager(BaseManager): pass
modelManager.register("ipcService")
manager = modelManager(address=("localhost", 5010), authkey=b"ipcService")
manager.connect()
embedModelService = manager.ipcService()



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


def get_youtube_metadata(url):
    yt = YouTube(url)
    title = yt.title
    duration = yt.length
    m, s = divmod(duration, 60)
    return f"{title}"



# def get_youtube_transcript(url, query, full_transcript: bool = False, languages: Iterable[str] = ("en",),preserve_formatting: bool = False,):
#     print("[INFO] Getting Youtube Transcript")
#     video_id = get_youtube_video_id(url)
#     if not video_id:
#         print("Attempted to get transcript with no video ID.")
#         return None

#     try:
#         try:
#             entries = YouTubeTranscriptApi().list(video_id).find_transcript(languages).fetch(preserve_formatting=preserve_formatting)
#             print(f"Found English ('en') transcript for video ID: {video_id}")
#         except NoTranscriptFound:
#             print(f"No 'en' transcript found. Trying other available languages.")
#             transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
#             available = list(transcript_list._manually_created_transcripts.values()) + list(transcript_list._generated_transcripts.values())
#             if not available:
#                 print(f"No transcripts found in any language for video ID: {video_id}")
#                 return None
#             transcript = available[0]
#             print(f"Using transcript in '{transcript.language_code}'")
#             entries = transcript.fetch()

#         if not entries:
#             raise ValueError("Transcript fetch returned no entries.")
#         full_text = " ".join(entry.text for entry in entries)
#         if full_transcript:
#             return full_text
#         else:
#             full_text = full_text.split(". ")
#             data_embed, query_embed = embedModelService.encodeSemantic(full_text, list(query))
#             scores = embedModelService.cosineScore(query_embed, data_embed, k=5)
#             relevant_texts = [full_text[idx] for idx, score in scores if score > 0.8]
#             return ". ".join(relevant_texts) if relevant_texts else full_text
        
        

#     except NoTranscriptFound:
#         print(f"No transcript available for video ID: {video_id}")
#     except TranscriptsDisabled:
#         print(f"Transcripts are disabled for video ID: {video_id}")
#     except Exception as e:
#         print(f"Unexpected error while fetching transcript for {video_id}: {type(e).__name__} - {e}")

#     return None



if __name__ == "__main__":
    data_block = {
        "id": 4,
        "q": "summarize the video",
        "priority": "high",
        "direct_text": False,
        "youtube": [
            {
                "url": "https://www.youtube.com/watch?v=FLal-KvTNAQ",
                "full_text": True
            }
        ],
        "document": [],
        "time": None,
        "max_tokens": 700
    }

    youtube_url = data_block["youtube"]
    for i in youtube_url:
        url = i["url"]
        metadata = get_youtube_metadata(url)
        print("Metadata:", metadata)
    # video_id = get_youtube_video_id(youtube_url)
    # print("YouTube Video ID:", video_id)


