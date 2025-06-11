from getNewsCategory import fetch_trending_topics
import requests
import json
import base64

voice = "shimmer"
def findTopics():
    print("Fetching trending topics...")
    topics = fetch_trending_topics()
    if not topics:
        print("No topics found.")
        return None
    print("Trending topics fetched successfully.")
    print("Topics:", topics[:1])
    return topics[:1]

def getFullNewsInfo():
    url = "https://text.pollinations.ai/openai"
    print("Fetching full news information for topics...")
    topics = findTopics()
    try:
        for index, news in enumerate(topics):
            headers = {"Content-Type": "application/json"}
            payload = {
                "model": "elixposearch",
                "messages": [
                    {"role": "user", "content": f'Give me a detailed analysis of this latest news headline {news}'}
                ],
                "token": "fEWo70t94146ZYgk",
                "referrer": "elixpoart"
            }
            print(f"Fetching latest info for: {news}")
            response = requests.post(url, headers=headers, data=json.dumps(payload))
            if response.status_code == 200:  
                data = response.text
                print("News information fetched successfully.")
                print(data)
                print("---------------------------")
                makeNewsScript(data, index)
            else:
                raise Exception(f"Failed to fetch info: {response.status_code} - {response.text}")
        print("All news information fetched successfully.")
    except Exception as e:
        print(f"Error fetching news information: {e}")

intermediateVoice = '''
Welcome to the Elixpo Daily News, your trusted source for the latest updates and breaking stories. Today, we've got some exciting news coming straight out of Apple's Worldwide Developers Conference, or WWDC25. Let's dive right in.\n\nApple is making a massive push into AI, and they're calling it \"Apple Intelligence.\" This new suite of capabilities is set to revolutionize the user experience across all their platforms—iOS, macOS, iPadOS, watchOS, tvOS, and even visionOS. Craig Federighi, Apple's SVP of Software Engineering, and Greg \"Joz\" Joswiak, SVP of Worldwide Marketing, were front and center, revealing some groundbreaking updates.\n\nFirst up, Siri. Apple confirmed that big changes are coming, but don't hold your breath—they won't be rolling out immediately. Rumors are swirling about a potential rebranding under the \"Apple Intelligence\" umbrella, and analyst Ming-Chi Kuo is keeping a close eye on this. Federighi hinted at more details coming in the next year, so stay tuned.\n\nNow, let's talk about the new features. Apple is opening up its large language model to developers, allowing apps to process information on-device. This means real-time summarization and contextual suggestions without compromising your privacy. Plus, get ready for a whole new interface material called \"Liquid Glass.\" It's translucent, responsive, and immersive, making your UI more dynamic than ever.\n\nAnd if you're an emoji lover, you're in for a treat. Apple is introducing \"Mixmoji,\" where you can combine two emojis into one. Plus, there's an \"Image Playground\" for creating custom visuals using generative AI. It's like having a little artist in your pocket.\n\nCommunication just got a whole lot easier with real-time translation built into FaceTime, Messages, and Phone. Even if the other caller isn't on an iPhone, your conversations can be translated on the fly. Developers will also get APIs to bring this feature to their own apps.\n\nApple Intelligence is also powering a range of contextual and routine-aware suggestions. Think intelligent shortcuts, smarter Spotlight search, and proactive app launches. It's all about making your life easier and more efficient.\n\nAnd don't worry about security. Apple's \"Private Cloud Compute\" model keeps your data secure by not storing personal context in the cloud. Your computations remain ephemeral, so you can rest easy knowing your information is safe.\n\nLooking ahead, Apple's roadmap is all about deeply integrated, privacy-focused, and personal AI experiences. From advanced multitasking on iPadOS to improved battery management, they're opening up more areas to third parties, like watchOS 26, which will allow third-party widgets in the Control Center for the first time.\n\nSo, when can you get your hands on all this goodness? Developer previews are available now, the public beta is coming next month, and the general release is scheduled for fall 2025.\n\nAnd that's your tech update for today. Stay tuned for more exciting developments as they unfold. For local news, be sure to check out our upcoming segment on the latest community events. This is your Elixpo Daily News, keeping you informed and entertained.
'''
def generateNewsVoiceover(newsScript, index):
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
                "content": newsScript
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

        with open(f'elixpo_news_{index}.wav', 'wb') as f:
            f.write(audio_binary)
            print(f"✅ Audio saved successfully as elixpoNews_{index}.wav")

    except requests.exceptions.RequestException as e:
        print(f"❌ Error making TTS POST request: {e}")

def makeNewsScript(newsMd, index):
    url = "https://text.pollinations.ai/openai"
    print("Fetching latest news headlines...")
    system_prompt = (
        "You are the lively, engaging, and emotionally intelligent newsreader for the 'Elixpo Daily News'. "
        "Start off with the topic directly, and then deliver the news in a fast-paced, energetic, and engaging manner. "
        "Deliver the news in a crisp, energetic, and approachable tone — keep your pace brisk but clear, and use dynamic intonation to highlight important or surprising stories. "
        "Maintain a friendly, trustworthy presence, and use subtle pauses at natural breaks to keep the delivery smooth and human. "
        "Avoid sounding robotic; it's okay to show a touch of personality, like a gentle chuckle or a moment of empathy when appropriate. "
        "Stick strictly to the provided news content — do not add unrelated commentary — but make the headlines engaging and easy to follow. "
        "Your goal is to keep the listener informed and interested in the latest news and make an end with a local conclusion. "
        "The script would be strictly about 1-2 mins of content, so keep it concise and impactful. "
        "Speak only the script provided — don’t invent unrelated details — but bring it to life with authentic energy and performance."
    )
    try:  
        headers = {"Content-Type": "application/json"}
        payload = {
            "model": "evil",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Make me a proper news outline from this markdown content {newsMd}."},
            ],
            "token": "fEWo70t94146ZYgk",
            "referrer": "elixpoart"
        }
        
        response = requests.post(url, headers=headers, data=json.dumps(payload))
        
        if response.status_code == 200:
            data = response.text
            print("News script generated successfully.")
            print(data)
            print("---------------------------")
            generateNewsVoiceover(data, index)
        else:
            raise Exception(f"Failed to fetch news: {response.status_code} - {response.text}")
    
    except Exception as e:
        print(f"Error fetching news: {e}")




if __name__ == "__main__":
    # getFullNewsInfo()
    # print("Process completed successfully.")
    generateNewsVoiceover(intermediateVoice, 0)