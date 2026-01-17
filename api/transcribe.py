import os
from faster_whisper import WhisperModel
import time 

t0 = time.perf_counter()   
model = WhisperModel(
    "small",
    device="cuda",
    compute_type="int8_float32",      
    download_root="model_cache",
    local_files_only=True
)

def transcribe(AUDIO_FILE: str) -> str:
    t1 = time.perf_counter()
    print(f"Model loaded in {t1 - t0:.2f} seconds")
    # -------------------------
    # Transcription
    # -------------------------
    # transcribe returns (segments_generator, transcription_info)
    t2 = time.perf_counter()
    segments, info = model.transcribe(AUDIO_FILE, beam_size=5)
    print ("Transcription:")

    transcription =  "".join([segment.text.strip() for segment in segments])
    t3 = time.perf_counter()
    print(f"Transcription completed in {t3 - t2:.2f} seconds")
    return transcription


if __name__ == "__main__":

    AUDIO_FILE  = "synthesis.wav"
    trans  = transcribe(AUDIO_FILE)
    print(trans)