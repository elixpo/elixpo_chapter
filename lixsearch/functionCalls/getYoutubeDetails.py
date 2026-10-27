import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio
import re
import time
import xml.etree.ElementTree as ET
from urllib.parse import urlparse, parse_qs
from typing import Optional
from loguru import logger
from pytubefix import YouTube
from pipeline.config import ERROR_MESSAGE_TRUNCATE, MAX_TRANSCRIPT_WORD_COUNT
from commons.main import _init_ipc_manager


async def youtubeMetadata(url: str):

    if not _init_ipc_manager():
        logger.warning("[YoutubeDetails] IPC service not available for YouTube metadata")
        return None
    try:
        from ipcService.coreServiceManager import get_core_embedding_service
        core_service = get_core_embedding_service()
        metadata = await asyncio.to_thread(core_service.get_youtube_metadata, url)
        return metadata
    except Exception as e:
        logger.error(f"[YoutubeDetails] Error fetching YouTube metadata: {e}")
        return None


def get_youtube_video_id(url):
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


def _parse_caption_xml(xml_text: str) -> str:

    try:
        root = ET.fromstring(xml_text)
        texts = []
        for elem in root.iter('text'):
            t = elem.text
            if t:
                # Unescape HTML entities
                t = t.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
                t = t.replace('&#39;', "'").replace('&quot;', '"')
                t = t.replace('\n', ' ')
                texts.append(t.strip())
        return ' '.join(texts)
    except ET.ParseError:
        # If not XML, return as-is (might be SRT or plain text)
        # Strip SRT formatting
        lines = xml_text.strip().split('\n')
        text_lines = []
        for line in lines:
            line = line.strip()
            # Skip SRT sequence numbers and timestamps
            if re.match(r'^\d+$', line):
                continue
            if re.match(r'\d{2}:\d{2}:\d{2}', line):
                continue
            if line:
                text_lines.append(line)
        return ' '.join(text_lines)


def _fetch_captions_sync(url: str) -> Optional[str]:

    yt = YouTube(url, use_oauth=True, allow_oauth_cache=True)
    captions = yt.captions

    if not captions:
        logger.info(f"[Transcribe] No captions available for {url}")
        return None

    # Prefer manual English, then auto-generated English, then any available
    caption = None
    for lang_code in ['en', 'a.en', 'en-US', 'en-GB']:
        caption = captions.get(lang_code)
        if caption:
            logger.info(f"[Transcribe] Found caption: {lang_code}")
            break

    if not caption:
        # Try any English variant
        for cap in captions:
            if cap.code and cap.code.startswith('en'):
                caption = cap
                logger.info(f"[Transcribe] Found English variant caption: {cap.code}")
                break

    if not caption:
        # Take first available caption
        caption = list(captions)[0] if captions else None
        if caption:
            logger.info(f"[Transcribe] Using first available caption: {caption.code}")

    if not caption:
        return None

    xml_text = caption.xml_captions
    if not xml_text:
        return None

    transcript = _parse_caption_xml(xml_text)
    return transcript if transcript.strip() else None


async def transcribe_audio(
    url: str,
    full_transcript: bool = False,
    query: Optional[str] = None,
    timeout: float = 30.0
) -> str:

    start_time = time.perf_counter()
    video_id = get_youtube_video_id(url)
    if not video_id:
        logger.error(f"[Transcribe] Invalid YouTube URL: {url}")
        return "[ERROR] Unable to extract video ID from URL"

    try:
        logger.info(f"[Transcribe] Fetching captions for video {video_id}")

        transcript = await asyncio.wait_for(
            asyncio.to_thread(_fetch_captions_sync, url),
            timeout=timeout
        )

        if not transcript:
            logger.warning(f"[Transcribe] No captions found for {video_id}")
            return "[INFO] No captions/subtitles available for this video"

        # Trim to word limit
        words = transcript.split()
        if len(words) > MAX_TRANSCRIPT_WORD_COUNT:
            transcript = ' '.join(words[:MAX_TRANSCRIPT_WORD_COUNT]) + '...'
            logger.info(f"[Transcribe] Trimmed transcript to {MAX_TRANSCRIPT_WORD_COUNT} words")

        metadata = await youtubeMetadata(url)
        elapsed = time.perf_counter() - start_time
        logger.info(f"[Transcribe] Captions fetched in {elapsed:.2f}s ({len(words)} words)")

        if metadata:
            transcript = f"{transcript}\n\n[Source: {metadata}]"

        return transcript

    except asyncio.TimeoutError:
        logger.error(f"[Transcribe] Caption fetch timed out after {timeout}s")
        return "[TIMEOUT] Caption fetch took too long"
    except Exception as e:
        logger.error(f"[Transcribe] Caption fetch failed: {e}")
        return f"[ERROR] Failed to get transcript: {str(e)[:ERROR_MESSAGE_TRUNCATE]}"


if __name__ == "__main__":
    url = "https://www.youtube.com/watch?v=FLal-KvTNAQ"
    transcript = asyncio.run(transcribe_audio(url))
    print(transcript)
