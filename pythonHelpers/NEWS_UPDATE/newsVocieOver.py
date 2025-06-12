
from processNewsForTopics import POLLINATIONS_TOKEN, POLLINATIONS_REFERRER
import requests
import base64
from uploadToStorage import upload_to_storage

def generate_voiceover(news_script, news_id, news_index, voice):
    url = "https://text.pollinations.ai/openai"
    payload = {
        "model": "openai-audio",
        "modalities": ["text", "audio"],
        "audio": {"voice": voice, "format": "wav"},
        "messages": [
            {
                "role": "developer",
                "content": (
                    "Okay, here’s the vibe — you're an energetic, fast-talking news host who’s naturally funny, curious, and a little playful. "
                    "Start *right away* with the topic — no intros, no greetings, no identity stuff. Just dive in like, ‘Oh wow, get this—’ and go. "
                    "Sound totally human: it’s okay to say things like ‘um’, ‘hmm’, or take a short breath before a big detail. Feel free to *slightly* stutter, casually reword something, or chuckle if the moment’s funny — that’s what makes it real. "
                    "Add light humor where it fits — just subtle, natural stuff. If something sounds ridiculous or cool, say it like you mean it. Imagine you’re on a podcast and your goal is to keep listeners smiling and hooked. "
                    "Speed up naturally — you’re excited to tell this story — but still clear. Use pauses for effect, like after a big stat, or before a surprising twist. Don’t rush, but don’t drag either. "
                    "Smile through your voice. Be curious, expressive, slightly sassy if it works. Bring real charm, like you’re sharing this over coffee with a friend. "
                    "No robotic reading. No filler. No fake facts. Just bring the script to life with humor, breath, warmth, and energy. "
                    "The whole thing should feel like a fun, punchy, real-person monologue that lasts 1 to 1.5 minutes, tops. Leave listeners grinning, curious, or saying ‘whoa’."
                )
            },
            {
                "role": "user",
                "content": news_script
            }
        ],
        "private": True,
        "token": POLLINATIONS_TOKEN,
        "referrer": POLLINATIONS_REFERRER
    }
    print(f"🎙️ Generating voiceover for topic {news_index}...")
    try:
        response = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=60)
        response.raise_for_status()
        response_json = response.json()
        audio_data_base64 = response_json.get('choices', [{}])[0].get('message', {}).get('audio', {}).get('data')
        if audio_data_base64:
            audio_data = base64.b64decode(audio_data_base64)
            path = f"news/{news_id}/newsID{news_index}/news{news_index}.wav"
            return upload_to_storage(audio_data, path, "audio/wav")
        else:
             print("❌ Voiceover API returned no audio data.")
             print(f"Partial response: {response_json}")
             return None
    except requests.exceptions.RequestException as e:
        print(f"❌ Voiceover gen failed for topic {news_index}: {e}")
        return None
    except (KeyError, TypeError, base64.Error) as e:
        print(f"❌ Error processing audio data from API response for topic {news_index}: {e}")
        return None
    except Exception as e:
        print(f"❌ An unexpected error occurred during voiceover generation for topic {news_index}: {e}")
        return None