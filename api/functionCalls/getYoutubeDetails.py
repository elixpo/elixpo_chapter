import os
from config import BASE_CACHE_DIR
from pytubefix import AsyncYouTube
from pydub import AudioSegment
from multiprocessing.managers import BaseManager
from loguru import logger
import torch
import asyncio
import re
import time
from urllib.parse import urlparse, parse_qs
from typing import Optional
from config import AUDIO_TRANSCRIBE_SIZE
from faster_whisper import WhisperModel

class ModelManager(BaseManager): 
    pass

ModelManager.register("CoreEmbeddingService", callable=object)

core_service = None
_ipc_ready = False
_ipc_initialized = False
device = "cuda" if torch.cuda.is_available() else "cpu"

logger.info(f"[YoutubeDetails] Loading faster-whisper model {AUDIO_TRANSCRIBE_SIZE} on {device}")
whisper_model = WhisperModel(AUDIO_TRANSCRIBE_SIZE, device=device, compute_type="auto")

def _init_ipc_manager(max_retries: int = 3, retry_delay: float = 1.0):
    global core_service, _ipc_ready, _ipc_initialized
    if _ipc_initialized:
        return _ipc_ready
    _ipc_initialized = True
    for attempt in range(max_retries):
        try:
            manager = ModelManager(address=("localhost", 5010), authkey=b"ipcService")
            manager.connect()
            core_service = manager.CoreEmbeddingService()
            _ipc_ready = True
            logger.info("[YoutubeDetails] IPC connection established with CoreEmbeddingService")
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

async def youtubeMetadata(url: str):
    if not _init_ipc_manager() or core_service is None:
        logger.warning("[YoutubeDetails] IPC service not available for YouTube metadata")
        return None
    try:
        metadata = await asyncio.to_thread(core_service.get_youtube_metadata, url)
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
    """Download audio from YouTube video"""
    video_id = get_youtube_video_id(url)
    cache_folder = ensure_cache_dir(video_id)
    wav_path = os.path.join(cache_folder, f"{video_id}.wav")
    if os.path.exists(wav_path):
        logger.info(f"[Download] Using cached audio: {wav_path}")
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
    logger.info(f"[Download] Audio saved to {wav_path}")
    return wav_path

async def transcribe_audio(
    url: str,
    full_transcript: bool = False,
    query: Optional[str] = None,
    timeout: float = 300.0
) -> str:
    """
    Transcribe YouTube video using faster-whisper (via IPC if available, local fallback)
    
    Args:
        url: YouTube URL to transcribe
        full_transcript: Whether to get full transcript (unused but kept for compatibility)
        query: Optional query to filter transcript relevance
        timeout: Transcription timeout in seconds
    
    Returns:
        Transcription text with source metadata
    """
    start_time = time.perf_counter()
    video_id = get_youtube_video_id(url)
    if not video_id:
        logger.error(f"[Transcribe] Invalid YouTube URL: {url}")
        return "[ERROR] Unable to extract video ID from URL"
    
    try:
        logger.info(f"[Transcribe] Starting transcription for video {video_id}")
        
        # Try IPC first if available
        if _init_ipc_manager() and core_service is not None:
            try:
                logger.info(f"[Transcribe] Using IPC CoreEmbeddingService for transcription")
                audio_path = await download_audio(url)
                # IPC call to core service transcribe method
                transcription = await asyncio.to_thread(
                    core_service.transcribe_audio, 
                    audio_path
                )
                metadata = await youtubeMetadata(url)
                elapsed = time.perf_counter() - start_time
                logger.info(f"[Transcribe] IPC transcription completed in {elapsed:.2f}s")
                if metadata:
                    transcription = f"{transcription}\n\n[Source: {metadata}]"
                return transcription
            except Exception as e:
                logger.warning(f"[Transcribe] IPC transcription failed: {e}. Falling back to local faster-whisper")
        
        # Local fallback using faster-whisper
        logger.info(f"[Transcribe] Using local faster-whisper model on {device}")
        audio_path = await download_audio(url)
        
        # Use faster-whisper for transcription
        segments, info = await asyncio.to_thread(
            whisper_model.transcribe,
            audio_path,
            language="en",
            beam_size=5
        )
        
        # Combine segments into full text
        transcription = " ".join([segment.text for segment in segments])
        
        metadata = await youtubeMetadata(url)
        elapsed = time.perf_counter() - start_time
        logger.info(f"[Transcribe] Local transcription completed in {elapsed:.2f}s")
        
        if metadata:
            transcription = f"{transcription}\n\n[Source: {metadata}]"
        
        return transcription
    
    except asyncio.TimeoutError:
        logger.error(f"[Transcribe] Transcription timed out after {timeout}s")
        return "[TIMEOUT] Video transcription took too long"
    except Exception as e:
        logger.error(f"[Transcribe] Transcription failed: {e}")
        return f"[ERROR] Failed to transcribe: {str(e)[:100]}"

async def transcribe_long(
    url: str,
    chunk_sec: int = 120,
    beam_size: int = 5,
    query: Optional[str] = None
) -> str:
    """
    Transcribe long-form YouTube video with faster-whisper (chunked processing)
    
    Args:
        url: YouTube URL to transcribe
        chunk_sec: Audio chunk size in seconds for processing
        beam_size: Faster-whisper beam search size (higher = better quality, slower)
        query: Optional query to filter transcript relevance
    
    Returns:
        Transcription text with source metadata and performance stats
    """
    start_time = time.perf_counter()
    video_id = get_youtube_video_id(url)
    
    if not video_id:
        logger.error(f"[TranscribeLong] Invalid YouTube URL: {url}")
        return "[ERROR] Unable to extract video ID from URL"
    
    try:
        logger.info(f"[TranscribeLong] Starting long-form transcription for video {video_id}")
        audio_path = await download_audio(url)
        
        # Verify file exists
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        # Use faster-whisper for long transcription
        logger.info(f"[TranscribeLong] Using faster-whisper on {device} with beam_size={beam_size}")
        segments, info = await asyncio.to_thread(
            whisper_model.transcribe,
            audio_path,
            language="en",
            beam_size=beam_size,
            vad_filter=True  # Use voice activity detection for better quality
        )
        
        # Combine segments into full text
        transcription = " ".join([segment.text for segment in segments])
        
        # Get metadata
        metadata = await youtubeMetadata(url)
        
        elapsed = time.perf_counter() - start_time
        logger.info(f"[TranscribeLong] Transcription completed in {elapsed:.2f}s")
        
        # Build response with stats
        response = f"{transcription}\n\n---\n**Transcription Stats:**\n"
        response += f"- Duration: {info.duration:.1f}s\n"
        response += f"- Language: {info.language}\n"
        response += f"- Processing time: {elapsed:.2f}s\n"
        
        if metadata:
            response += f"- Source: {metadata}\n"
        
        return response
    
    except Exception as e:
        logger.error(f"[TranscribeLong] Transcription failed: {e}")
        return f"[ERROR] Failed to transcribe: {str(e)[:100]}"

if __name__ == "__main__":
    url = "https://www.youtube.com/watch?v=FLal-KvTNAQ"
    full_transcript = True
    query = None
    transcript = asyncio.run(transcribe_audio(url, full_transcript, query))
