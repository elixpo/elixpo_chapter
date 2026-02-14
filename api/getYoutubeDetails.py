import os
from config import BASE_CACHE_DIR
from pytubefix import AsyncYouTube
from pydub import AudioSegment
from multiprocessing.managers import BaseManager
from loguru import logger
import torch
import whisper
import asyncio
import re
import time
from urllib.parse import urlparse, parse_qs
from typing import Optional, Iterable


class modelManager(BaseManager): 
    pass

modelManager.register("accessSearchAgents")

search_service = None
_ipc_ready = False
_ipc_initialized = False

def _init_ipc_manager(max_retries: int = 3, retry_delay: float = 1.0):
    global search_service, _ipc_ready, _ipc_initialized
    
    # Avoid re-attempting if already tried
    if _ipc_initialized:
        return _ipc_ready
    
    _ipc_initialized = True
    
    for attempt in range(max_retries):
        try:
            manager = modelManager(address=("localhost", 5010), authkey=b"ipcService")
            manager.connect()
            search_service = manager.accessSearchAgents()
            _ipc_ready = True
            logger.info("[YoutubeDetails] IPC connection established")
            return True
        except Exception as e:
            if attempt < max_retries - 1:
                logger.warning(f"[YoutubeDetails] IPC connection failed (attempt {attempt + 1}/{max_retries}): {e}")
                time.sleep(retry_delay)
            else:
                logger.debug(f"[YoutubeDetails] IPC server not available - running in standalone mode")
                _ipc_ready = False
                return False
    
    _ipc_ready = False
    return False

AUDIO_TRANSCRIBE_SIZE = "small"
device = "cuda" if torch.cuda.is_available() else "cpu"
whisper_model = whisper.load_model(AUDIO_TRANSCRIBE_SIZE).to(device)

async def youtubeMetadata(url: str):
    if not _init_ipc_manager() or search_service is None:
        logger.warning("[YoutubeDetails] IPC service not available for YouTube metadata")
        return None
    try:
        # CRITICAL FIX #7: Use asyncio.to_thread to avoid blocking event loop
        # The IPC call is synchronous, so we run it in a thread pool executor
        metadata = await asyncio.to_thread(search_service.get_youtube_metadata, url)
        return metadata
    except Exception as e:
        logger.error(f"[YoutubeDetails] Error fetching YouTube metadata: {e}")
        return None

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


async def transcribe_audio(
    url: str,
    full_transcript: bool = False,
    query: Optional[str] = None,
    timeout: float = 300.0
) -> str:
    """
    Transcribe YouTube audio via IPC. Falls back to local Whisper if IPC unavailable.
    
    Args:
        url: YouTube video URL
        full_transcript: Return complete transcript (ignores query-based extraction)
        query: Optional query for relevance extraction
        timeout: Maximum time to wait for transcription in seconds
        
    Returns:
        Transcribed text with video metadata
    """
    start_time = time.perf_counter()
    video_id = get_youtube_video_id(url)
    
    if not video_id:
        logger.error(f"[Transcribe] Invalid YouTube URL: {url}")
        return "[ERROR] Unable to extract video ID from URL"
    
    try:
        logger.info(f"[Transcribe] Starting transcription for video {video_id}")
        
        # Try IPC server first (optimized)
        if _init_ipc_manager() and search_service is not None:
            try:
                logger.info(f"[Transcribe] Using IPC server for transcription")
                metadata = search_service.get_youtube_metadata(url)
                audio_path = await download_audio(url)
                transcription = search_service.transcribe_audio(audio_path)
                
                elapsed = time.perf_counter() - start_time
                logger.info(f"[Transcribe] IPC transcription completed in {elapsed:.2f}s")
                
                # Append metadata
                if metadata:
                    transcription = f"{transcription}\n\n[Source: {metadata}]"
                return transcription
            except Exception as e:
                logger.warning(f"[Transcribe] IPC transcription failed: {e}. Falling back to local Whisper")
        
        # Fallback to local Whisper
        logger.info(f"[Transcribe] Using local Whisper model on {device}")
        metadata = await youtubeMetadata(url)
        audio_path = await download_audio(url)
        
        result = whisper_model.transcribe(audio_path)
        transcription = result["text"]
        
        if metadata:
            transcription = f"{transcription}\n\n[Source: {metadata}]"
        
        elapsed = time.perf_counter() - start_time
        logger.info(f"[Transcribe] Local transcription completed in {elapsed:.2f}s")
        return transcription
        
    except asyncio.TimeoutError:
        logger.error(f"[Transcribe] Transcription timed out after {timeout}s")
        return "[TIMEOUT] Video transcription took too long"
    except Exception as e:
        logger.error(f"[Transcribe] Transcription failed: {e}")
        return f"[ERROR] Failed to transcribe: {str(e)[:100]}"


async def transcribe_audio_deprecated(url, full_transcript: Optional[str] = None, query: Optional[str] = None):
    """Deprecated: Use transcribe_audio instead"""
    return await transcribe_audio(url, full_transcript=bool(full_transcript), query=query)


if __name__ == "__main__":
    url = "https://www.youtube.com/watch?v=FLal-KvTNAQ"
    full_transcript = True
    query = None

    transcript = asyncio.run(transcribe_audio(url, full_transcript, query))
    
