import os
from config import BASE_CACHE_DIR
from pytubefix import AsyncYouTube
from pydub import AudioSegment
from multiprocessing.managers import BaseManager
import asyncio
import re
import time
from urllib.parse import urlparse, parse_qs
from typing import Optional, Iterable
from responseGenerator import generate_intermediate_response
from writer import write_to_plan


class modelManager(BaseManager): pass
modelManager.register("accessSearchAgents")
modelManager.register("ipcService")
manager = modelManager(address=("localhost", 5010), authkey=b"ipcService")
manager.connect()
search_service = manager.accessSearchAgents()
modelService = manager.ipcService()

def youtubeMetadata(url: str):
    metadata = search_service.get_youtube_metadata(url)
    return metadata

def ensure_cache_dir(video_id):
    path = os.path.join(BASE_CACHE_DIR, video_id)
    os.makedirs(path, exist_ok=True)
    return path

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

async def download_audio(url):
    video_id = get_youtube_video_id(url)
    cache_folder = ensure_cache_dir(video_id)
    wav_path = os.path.join(cache_folder, f"{video_id}.wav")
    
    if os.path.exists(wav_path):
        return wav_path
    
    yt = AsyncYouTube(url, use_oauth=True, allow_oauth_cache=True)
    streams = await yt.streams()
    audio_streams = streams.filter(only_audio=True)
    preferred_codecs = ["opus", "aac", "mp4a.40.2", "vorbis"]
    audio_streams = [s for s in audio_streams if s.audio_codec in preferred_codecs]
    audio_stream = max(audio_streams, key=lambda s: int(s.abr.replace("kbps", "")))
    
    extension = audio_stream.mime_type.split("/")[1]
    tmp_path = os.path.join(cache_folder, f"{video_id}.{extension}")
    audio_stream.download(output_path=os.path.dirname(tmp_path), filename=os.path.basename(tmp_path))
    
    audio = AudioSegment.from_file(tmp_path, format=extension)
    audio.export(wav_path, format="wav")
    os.remove(tmp_path)
    
    return wav_path


async def transcribe_audio(url, full_transcript: Optional[str] = None, query: Optional[str] = None, priority: str = "high", reqID: str = "", id: int = 0):
    start_time = time.time()
    transcription = ""
    video_id = get_youtube_video_id(url)
    print(f"[INFO] Starting transcription for video ID: {video_id}")
    meta_data = youtubeMetadata(url)
    print(f"[INFO] Video title: {meta_data}")
    audio = await download_audio(url)
    transcription = modelService.transcribeAudio(audio)
    print(f"[INFO] Completed transcription for video ID: {video_id}")
    if full_transcript:
        print("[INFO] Using provided full transcript.")
        transcription = full_transcript
    else:
        query = query or "Provide a brief summary of the video content."
        print("[INFO] Using generated transcription for query inference.")
        result = ""
        information_piece = modelService.extract_relevant(transcription, query)
        print(f"[INFO] Extracted {len(information_piece)} relevant pieces.")
        for i in information_piece:
            sentences = []
            for piece in i:
                sentences.extend([s.strip() for s in piece.split('.') if s.strip()])
            transcription += '. '.join(sentences) + '. '
    transcription += f"Video Titled as {meta_data}"
    end_time = time.time()
    print(f"[INFO] Transcription and extraction took {end_time - start_time:.2f} seconds.")
    transcription = await generate_intermediate_response(url, query, transcription, priority)
    print(f"[INFO] LLM response: {transcription}")

    return {
        "query": query,
        "id" : id,
        "url": url,
        "priority": priority,
        "time_taken" : f"{(end_time - start_time):.2f}s",
        "videoTitle": meta_data,
        "information": transcription,
    }

if __name__ == "__main__":
    data_block = {
            "id": 4,
            "q": "summarize the video",
            "priority": "high",
            "direct_text": False,
            "youtube": [
                {
                    "url" : "https://www.youtube.com/watch?v=FLal-KvTNAQ",
                    "full_transcript": False
                }
            ],
            "document": [],
            "time": None,
            "full_transcript": False,
            "max_tokens": 700,
            "requestID": "test123"
        },
    url = data_block["youtube"][0]["url"]
    full_transcript = data_block["youtube"][0].get("full_transcript", None)
    query = data_block["q"]
    priority = data_block["priority"]
    reqID = data_block["requestID"]
    id = data_block["id"]

    transcript = asyncio.run(transcribe_audio(url, full_transcript, query, priority, reqID, id))
    write_to_plan(reqID, transcript)
