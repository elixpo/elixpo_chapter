import yt_dlp
import os
import requests
import json
from config import BASE_CACHE_DIR
from pytubefix import AsyncYouTube
from pydub import AudioSegment
from multiprocessing.managers import BaseManager
import asyncio
import re
from urllib.parse import urlparse, parse_qs
from typing import Optional, Iterable
from utility import rerank
from responseGenerator import generate_intermediate_response

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
    
    # Reuse cached audio if exists
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
    
    # Convert to WAV
    audio = AudioSegment.from_file(tmp_path, format=extension)
    audio.export(wav_path, format="wav")
    os.remove(tmp_path)
    
    return wav_path

def transcribe_audio(url,full_transcript: Optional[str] = None, query: Optional[str] = None):
    wav_path = asyncio.run(download_audio(url))
    videoID = get_youtube_video_id(url)
    videoTitle = youtubeMetadata(url)
    transcription = modelService.transcribeAudio(wav_path)
    if full_transcript:
        transcription = full_transcript
    elif query:
        modelService = rerank(transcription, [query])
        transcription = " ".join(modelService)
        transcription = generate_intermediate_response(url, query, transcription, "high")
    return {
        "video_id": videoID,
        "video_title": videoTitle,
        "transcription": transcription
    }


if __name__ == "__main__":
    url = "https://www.youtube.com/watch?v=a_hdKTJGukk"
    query = "Explain the main topic of the video."  
    transcript = transcribe_audio(url, full_transcript=None, query=query)
    print("Transcript:", transcript)