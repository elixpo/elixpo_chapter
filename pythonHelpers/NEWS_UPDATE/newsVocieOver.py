
from processNewsGeneral import POLLINATIONS_TOKEN, POLLINATIONS_REFERRER
import requests
import base64
# from uploadToStorage import upload_to_storage

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
        "referrer": POLLINATIONS_REFERRER,
        "seed": 42
    }
    print(f"🎙️ Generating voiceover for topic {news_index}...")
    try:
        response = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=60)
        response.raise_for_status()
        response_json = response.json()
        audio_data_base64 = response_json.get('choices', [{}])[0].get('message', {}).get('audio', {}).get('data')
        return audio_data_base64
    except requests.exceptions.RequestException as e:
        print(f"❌ Voiceover gen failed for topic {news_index}: {e}")
        return None
    except (KeyError, TypeError, base64.Error) as e:
        print(f"❌ Error processing audio data from API response for topic {news_index}: {e}")
        return None
    except Exception as e:
        print(f"❌ An unexpected error occurred during voiceover generation for topic {news_index}: {e}")
        return None
    
if __name__ == "__main__":
    newsScript = '''
    Well, folks, the 125th U.S. Open is off to a roaring start at the legendary Oakmont Country Club, and let me tell you, this place is living up to its reputation as one of the toughest tests in golf. The rough is so thick, even Bryson DeChambeau is calling it 'cooked beyond belief.' But amidst the chaos, one man has emerged as the early leader, and it's not who you might think. J.J. Spaun, that's right, J.J. Spaun, has surged to a 4-under-par 66, making him the solo leader and the only player to go significantly below par on this beast of a course. The scoring average for the day was over four shots above par, folks. That's how tough Oakmont is playing. Brooks Koepka, representing LIV Golf, is right on his tail, quietly positioning himself among the contenders. Jon Rahm is in the hunt, but he's not in the top echelon just yet. And Rory McIlroy? Well, he's had a rough start, reminding us all of the relentless challenge that Oakmont presents. But it's not all doom and gloom. We've seen some historic shots already. Patrick Reed made only the fourth recorded albatross in U.S. Open history, and Shane Lowry notched a shot never seen before at Oakmont. Now, experts and players alike are suggesting that even par could be good enough to win this championship, given Thursday’s carnage and the USGA’s reputation for making the weekend even tougher. So, buckle up, folks. We're in for a wild ride. For up-to-date scores and highlights, tune into the scheduled TV coverage throughout the weekend. It's going to be a thrilling finish, that's for sure. https://www.usatoday.com/story/sports/golf/2025/06/09/us-open-2025-time-tv-odds-live-stream/84070189007/
    '''
    generate_voiceover(newsScript, "12345", 0, "shimmer")