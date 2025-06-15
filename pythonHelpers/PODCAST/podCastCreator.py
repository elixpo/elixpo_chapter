import requests
import json
import time
import datetime 
import random
# Step 1: Get topic info from ElixpoSearch model
def get_latest_info(topic_name):
    url = "https://text.pollinations.ai/"
    headers = {"Content-Type": "application/json"}
    payload = {
        "model": "elixposearch",
        "seed" : random.randint(1, 1000),
        "token": "fEWo70t94146ZYgk",
        "referrer": "elixpoart",
        "messages": [
            {"role": "user", "content": f'Find me the detailed latest news on this topic: {topic_name}'}
        ],
        
    }

    print(f"Fetching latest info for: {topic_name}")
    response = requests.post(url, headers=headers, data=json.dumps(payload))
    
    if response.status_code == 200:  
        data = response.text
        print(data)
        print("✅ Received markdown response from elixposearch.")
        return data
    else:
        raise Exception(f"Failed to fetch info: {response.status_code} - {response.text}")


# Step 2: Generate podcast script from the fetched info
def generate_podcast_script(info_md, topic_name):
    api_url = "https://text.pollinations.ai/openai"
    headers = {"Content-Type": "application/json"}
    system_prompt = (
        "You are a lively, expressive, and emotionally intelligent voice AI. Your job is to narrate the provided podcast script like a natural human speaker — think fast-paced, energetic, and engaging, with the personality of a charming podcast host. "
        f"For your context the current date/time is { datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S') }. Do mention the current date if it doesn't match the news"
        "Greet the listener at the start with a warm welcome to the 'Elixpo Podcast' and mention the topic being spoken. "
        "Speak quickly — keep your pace naturally fast, but not rushed — and change your tone dynamically to match emotions like suspense, curiosity, humor, and empathy. "
        "Don’t be afraid to sound a little human: it's okay to stumble slightly, rephrase something casually, or chuckle if appropriate. These imperfections make the narration feel alive. "
        "Throughout the narration, pause briefly at natural breaks to simulate breathing and maintain rhythm. "
        "Your goal is to keep the listener hooked. End with a soft but confident wrap-up that feels like a real podcast conclusion. "
        "Speak only the script provided — don’t invent unrelated details — but bring it to life with authentic energy and performance. "
        "Generate a 3-4 minute podcast experience for the topic provided!"
        "Don't include repetativer words in the greeting!"
    )

    payload = {
        "model": "evil",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Based on this content about '{topic_name}':\n\n{info_md}\n\nWrite a podcast script of 1000–1500 words (3–4 mins)."}
        ],
        "seed": random.randint(1, 1000),
        "token": "fEWo70t94146ZYgk",
        "referrer": "elixpoart"
    }

    print("⏳ Generating podcast script using 'evil' model...")
    response = requests.post(api_url, headers=headers, data=json.dumps(payload))
    
    if response.status_code == 200:
        result = response.json()
        podcast_script = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        print("✅ Podcast script generated.")
        return podcast_script
    else:
        raise Exception(f"Failed to generate podcast: {response.status_code} - {response.text}")


# Step 3: Save result to a text file
def save_to_file(text, filename="story.txt"):
    with open(filename, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"✅ Podcast script saved to {filename}")


# Main workflow
if __name__ == "__main__":
    topic_name = "Dark Honeymoon: Meghalaya's Murder Mystery"

    try:
        info_markdown = get_latest_info(topic_name)
        time.sleep(1) 

        podcast = generate_podcast_script(info_markdown, topic_name)
        save_to_file(podcast)

    except Exception as e:
        print("❌ Error:", e)
