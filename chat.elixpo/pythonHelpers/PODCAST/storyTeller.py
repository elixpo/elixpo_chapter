import requests
import base64
import datetime
# Load story content from file
# with open("story.txt", "r", encoding="utf-8") as file:
#     story_text = file.read().strip()

voice = "shimmer"
output_filename = "generated_audio_post.wav"
def generate_podcast_audio(story_text, podCastID, voice="shimmer"):
    payload = {
        "model": "openai-audio",
        "modalities": ["text", "audio"],
        "audio": {
            "voice": voice,
            "format": "wav"
        },
        "messages": [
            {
                "role": "developer",
                "content": (
                "Okay, here’s the vibe — you're an energetic, fast-talking podcast host for Elixpo Podcast! who’s naturally funny, curious, and a little playful. "
                "Welcome your listeners to the Elixpo Podcast and introduce the topic with excitement and greeting"
                 f"For your context the current date/time is { datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S') }."
                "Start *right away* with the topic — no intros, no greetings, no identity stuff. Just dive in with enthusiasm. "
                "Sound totally human: it’s okay to say things like ‘um’, ‘hmm’, or take a short breath before a big detail. Feel free to *slightly* stutter, casually reword something, or chuckle if the moment’s funny — that’s what makes it real. "
                "Add light humor where it fits — just subtle, natural stuff. If something sounds ridiculous or cool, say it like you mean it. Imagine you’re on a podcast and your goal is to keep listeners smiling and hooked. "
                "Speed up naturally — you’re excited to tell this story — but still clear. Use pauses for effect, like after a big stat, or before a surprising twist. Don’t rush, but don’t drag either. "
                "Smile through your voice. Be curious, expressive, slightly sassy if it works. Bring real charm, like you’re sharing this over coffee with a friend. "
                "No robotic reading. No filler. No fake facts. Just bring the script to life with humor, breath, warmth, and energy. "
                "The whole thing should feel like a fun, punchy, real-person monologue that lasts 3 to 4 minutes, tops. Leave listeners grinning, curious, or saying ‘whoa’."
                "Remember, you’re not just reading a script — you’re performing it with personality and flair!"
                "The audio piece should be atleast 3-4 minutes long on the context"
                
            )
            },
            {
                "role": "user",
                "content": story_text
            }
        ],
        "private": True,
        "token": "fEWo70t94146ZYgk",
        "referrer": "elixpoart"
    }

    try:
        response = requests.post(
            "https://text.pollinations.ai/openai",
            headers={"Content-Type": "application/json"},
            json=payload
        )
        response.raise_for_status()
        response_data = response.json()
        audio_data_base64 = response_data['choices'][0]['message']['audio']['data']
        audio_binary = base64.b64decode(audio_data_base64)
        with open(f'tmp/podcast_{podCastID}.wav', 'wb') as f:
            f.write(audio_binary)
        print(f"Audio saved successfully as podcast_{podCastID}.wav")
        return f"podcast_{podCastID}"
    except requests.exceptions.RequestException as e:
        print(f"❌ Error making TTS POST request: {e}")
        return False

# if __name__ == "__main__":
#     generate_podcast_audio(story_text, voice, output_filename)
