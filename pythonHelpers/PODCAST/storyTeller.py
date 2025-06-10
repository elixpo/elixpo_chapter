import requests
import datetime
# Load story content from file
# with open("story.txt", "r", encoding="utf-8") as file:
#     story_text = file.read().strip()

voice = "shimmer"
output_filename = "generated_audio_post.wav"
def generate_podcast_audio(story_text, voice="shimmer", output_filename="generated_audio_post.wav"):
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
                    "You are a lively, expressive, and emotionally intelligent voice AI. Your job is to narrate the provided podcast script like a natural human speaker — think fast-paced, energetic, and engaging, with the personality of a charming podcast host. "
                    "Greet the listener at the start with a warm welcome to the 'Elixpo Podcast' and mention the topic being spoken. "
                    "Speak quickly — keep your pace naturally fast, but not rushed — and change your tone dynamically to match emotions like suspense, curiosity, humor, and empathy. "
                    "Don’t be afraid to sound a little human: it's okay to stumble slightly, rephrase something casually, or chuckle if appropriate. These imperfections make the narration feel alive. "
                    "Throughout the narration, pause briefly at natural breaks to simulate breathing and maintain rhythm. "
                    "Your goal is to keep the listener hooked. End with a soft but confident wrap-up that feels like a real podcast conclusion. "
                    "Speak only the script provided — don’t invent unrelated details — but bring it to life with authentic energy and performance. "
                    "Generate a 2–3 minute podcast experience for the topic provided!"
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
            "https://text.pollinations.ai",
            headers={"Content-Type": "application/json"},
            json=payload
        )
        response.raise_for_status()

        with open(output_filename, 'wb') as f:
            f.write(response.content)
            print(f"✅ Audio saved successfully as {output_filename}")

    except requests.exceptions.RequestException as e:
        print(f"❌ Error making TTS POST request: {e}")

# if __name__ == "__main__":
#     generate_podcast_audio(story_text, voice, output_filename)
