import asyncio
from pytubefix import AsyncYouTube
import whisper
import tempfile
import os

URL = "https://www.youtube.com/watch?v=dwI0R8MxycA"

async def main():
    # Initialize YouTube object with OAuth (optional)
    yt = AsyncYouTube(URL, use_oauth=True, allow_oauth_cache=True)

    # Fetch streams
    streams = await yt.streams()

    # Filter audio-only streams
    audio_streams = streams.filter(only_audio=True)

    # Select highest bitrate audio stream
    audio_stream = max(audio_streams, key=lambda s: int(s.abr.replace("kbps", "")))

    print(f"Downloading audio: {await yt.title()}")
    print(f"Selected audio stream: {audio_stream}")

    # Save audio to a temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_file:
        tmp_path = tmp_file.name
    audio_stream.download(output_path=os.path.dirname(tmp_path), filename=os.path.basename(tmp_path))
    print("Audio download completed!")

    # Load Whisper model
    model = whisper.load_model("small")

    # Transcribe audio
    print("Transcribing...")
    result = model.transcribe(tmp_path)
    text = result["text"]

    print("\n=== TRANSCRIPTION ===")
    print(text)

    # Clean up temp file
    os.remove(tmp_path)

if __name__ == "__main__":
    asyncio.run(main())
