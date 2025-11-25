import asyncio
from pytubefix import AsyncYouTube
import whisper
import tempfile
import os
from pydub import AudioSegment
import torch
import time

URL = "https://www.youtube.com/watch?v=v8eUhkhC8lw"
BASE_CACHE_DIR = "./cached_audio"  
MIN_CHUNK_MS = 10_000              
CHUNK_LENGTH_MS = 60_000           

def ensure_cache_dir(video_id):
    path = os.path.join(BASE_CACHE_DIR, video_id)
    os.makedirs(path, exist_ok=True)
    return path

def chunk_audio(audio_path, chunk_length_ms=CHUNK_LENGTH_MS, min_length_ms=MIN_CHUNK_MS):
    audio = AudioSegment.from_file(audio_path)
    chunks = []
    for i in range(0, len(audio), chunk_length_ms):
        chunk = audio[i:i + chunk_length_ms]
        if len(chunk) >= min_length_ms:  # skip too short chunks
            chunks.append(chunk)
    return chunks

def save_chunks_to_files(chunks, folder):
    paths = []
    for idx, chunk in enumerate(chunks):
        path = os.path.join(folder, f"chunk_{idx}.wav")
        chunk.export(path, format="wav")
        paths.append(path)
    return paths

async def transcribe_chunk(model, wav_path):
    # Whisper's CPU/GPU transcribe runs in a separate thread to not block asyncio
    result = await asyncio.to_thread(model.transcribe, wav_path, language="en")
    return result["text"]

async def download_audio(video_id, url):
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

async def main(url):
    video_id = url.split("v=")[-1].split("&")[0]
    wav_path = await download_audio(video_id, url)
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = whisper.load_model("small", device=device)
    
    chunks = chunk_audio(wav_path)
    if not chunks:
        print("Audio too short to chunk, using full audio.")
        chunks = [AudioSegment.from_file(wav_path)]
    
    chunk_folder = os.path.join(BASE_CACHE_DIR, video_id, "chunks")
    os.makedirs(chunk_folder, exist_ok=True)
    chunk_paths = save_chunks_to_files(chunks, chunk_folder)
    
    start_time = time.time()
    tasks = [transcribe_chunk(model, path) for path in chunk_paths]
    results = await asyncio.gather(*tasks)
    final_text = " ".join(results)
    end_time = time.time()
    
    print("="*50)
    print(f"Transcription completed in {end_time - start_time:.2f} seconds")
    print("="*50)
    print(final_text)

if __name__ == "__main__":
    asyncio.run(main(URL))
