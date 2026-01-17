import os
import time
from faster_whisper import WhisperModel
from pydub import AudioSegment

t0 = time.perf_counter()
model = WhisperModel(
    "small",
    device="cuda",
    compute_type="int8_float32",
    download_root="model_cache",
    local_files_only=True
)

def chunk_audio_to_disk(audio: AudioSegment, chunk_length_ms: int, reqID: str, base_tmp: str = "tmp_cache"):
    import shutil
    chunk_dir = os.path.join(base_tmp, reqID)
    if os.path.exists(chunk_dir):
        shutil.rmtree(chunk_dir)
    os.makedirs(chunk_dir, exist_ok=True)

    chunk_paths = []
    for i, start in enumerate(range(0, len(audio), chunk_length_ms)):
        end = min(start + chunk_length_ms, len(audio))
        chunk_audio = audio[start:end]
        chunk_path = os.path.join(chunk_dir, f"chunk_{i}.wav")
        chunk_audio.export(chunk_path, format="wav")
        chunk_paths.append(chunk_path)

    return chunk_paths

def transcribe(AUDIO_FILE: str, reqID: str, timings: list | None = None) -> str:
    if timings is None:
        timings = []

    audio = AudioSegment.from_file(AUDIO_FILE)
    duration_sec = len(audio) / 1000

    # ---------- BASE CASE ----------
    if duration_sec <= 5 * 60:
        t_start = time.perf_counter()
        segments, _ = model.transcribe(AUDIO_FILE, beam_size=5)
        t_end = time.perf_counter()

        elapsed = t_end - t_start
        timings.append(elapsed)

        print(
            f"[BASE] {os.path.basename(AUDIO_FILE)} | "
            f"duration={duration_sec:.2f}s | "
            f"time={elapsed:.3f}s"
        )

        return "".join(segment.text.strip() for segment in segments)

    # ---------- RECURSIVE CASE ----------
    print(
        f"[RECURSE] {os.path.basename(AUDIO_FILE)} | "
        f"{duration_sec/60:.2f} min → chunking"
    )

    chunk_length_ms = 2 * 60 * 1000
    chunk_paths = chunk_audio_to_disk(audio, chunk_length_ms, reqID)

    transcriptions = []
    for idx, chunk_path in enumerate(chunk_paths):
        print(f"[CALL] chunk {idx+1}/{len(chunk_paths)} → {chunk_path}")
        text = transcribe(chunk_path, reqID, timings)
        transcriptions.append(text)

    return " ".join(transcriptions)

if __name__ == "__main__":
    AUDIO_FILE = "audio_cache/2gUAxUWXelg.wav"
    reqID = "test123"

    t1 = time.perf_counter()
    result = transcribe(AUDIO_FILE, reqID)
    t2 = time.perf_counter()

    print("\n=== Timing Summary ===")
    print(result)
