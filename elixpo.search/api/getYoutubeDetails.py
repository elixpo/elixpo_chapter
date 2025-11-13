from urllib.parse import urlparse, parse_qs
from typing import Optional, Iterable
import re
from conditional_print import conditional_print
from pytube import YouTube, exceptions
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled
from youtube_transcript_api.formatters import TextFormatter
import yt_dlp
from config import MAX_TRANSCRIPT_WORD_COUNT, get_youtube_video_metadata_show_log


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


def get_youtube_metadata(url, show_logs=get_youtube_video_metadata_show_log):
    print("[INFO] Getting Youtube Metadata")
    video_id = get_youtube_video_id(url)
    if not video_id:
        conditional_print(f"[yt-dlp] Invalid URL provided for metadata: {url}", show_logs)
        return None
    url = f"https://youtu.be/{video_id}" 
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'simulate': True,
        'extract_flat': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        title = info.get('title')
        duration = info.get('duration', 0)
        duration_m, duration_s = divmod(duration, 60)
        finalDetails = f"{title} ({duration_m}m {duration_s}s)"
        return finalDetails



def get_youtube_transcript(url, show_logs=True, languages: Iterable[str] = ("en",),preserve_formatting: bool = False,):
    print("[INFO] Getting Youtube Transcript")
    video_id = get_youtube_video_id(url)
    if not video_id:
        conditional_print("Attempted to get transcript with no video ID.", show_logs)
        return None

    try:
        try:
            entries = YouTubeTranscriptApi().list(video_id).find_transcript(languages).fetch(preserve_formatting=preserve_formatting)
            conditional_print(f"Found English ('en') transcript for video ID: {video_id}", show_logs)
        except NoTranscriptFound:
            conditional_print(f"No 'en' transcript found. Trying other available languages.", show_logs)
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            available = list(transcript_list._manually_created_transcripts.values()) + list(transcript_list._generated_transcripts.values())
            if not available:
                conditional_print(f"No transcripts found in any language for video ID: {video_id}", show_logs)
                return None
            transcript = available[0]
            conditional_print(f"Using transcript in '{transcript.language_code}'", show_logs)
            entries = transcript.fetch()

        if not entries:
            raise ValueError("Transcript fetch returned no entries.")
        full_text = " ".join(entry.text for entry in entries)
        
        words = full_text.split()
        if len(words) > MAX_TRANSCRIPT_WORD_COUNT:
            conditional_print(f"Transcript length ({len(words)} words) exceeds MAX_TRANSCRIPT_WORD_COUNT ({MAX_TRANSCRIPT_WORD_COUNT}). Truncating.", show_logs)
            return " ".join(words[:MAX_TRANSCRIPT_WORD_COUNT]) + "..."
        return full_text
        
        

    except NoTranscriptFound:
        conditional_print(f"No transcript available for video ID: {video_id}", show_logs)
    except TranscriptsDisabled:
        conditional_print(f"Transcripts are disabled for video ID: {video_id}", show_logs)
    except Exception as e:
        conditional_print(f"Unexpected error while fetching transcript for {video_id}: {type(e).__name__} - {e}", show_logs)

    return None



if __name__ == "__main__":
    # metadata = get_youtube_metadata("https://youtu.be/S39b5laVmjs?si=myqFLQIM_A8QuyLv")
    # print("Metadata:", metadata)
    transcript = get_youtube_transcript("https://youtu.be/S39b5laVmjs?si=myqFLQIM_A8QuyLv")
    print("Transcript:", transcript)



