from processNewsGeneral import POLLINATIONS_TOKEN, POLLINATIONS_REFERRER
import requests
from datetime import timezone, datetime

def generate_news_analysis(news_title):
    url = "https://text.pollinations.ai/openai"
    payload = {
        "model": "elixposearch",
        "messages": [{"role": "user", "content": f"Give me the latest detailed news for the topic: {news_title}"}],
        "token": POLLINATIONS_TOKEN,
        "referrer": POLLINATIONS_REFERRER,
        "json": True
    }
    print(f"🔬 Getting detailed analysis using elixposearch for '{news_title}'...")
    try:
        response = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=180)
        response.raise_for_status()
        response_json = response.json()

        message_content = response_json.get("choices", [{}])[0].get("message", {}).get("content", "")
        if message_content:
            try:
                print("✅ Analysis received from elixposearch.")
                return message_content
            except:
                print("❌ elixposearch API returned non-JSON content inside the 'content' field.")
                return None
        else:
            print("❌ elixposearch API returned empty content.")
            return None
    except Exception as e:
        print(f"❌ An unexpected error occurred during elixposearch analysis for '{news_title}': {e}")
        return None

def generate_news_script(analysis_content):
    url = "https://text.pollinations.ai/openai"
    system_prompt = (
    "You are the lively, engaging, and emotionally intelligent newswriter for the 'Elixpo Daily News'. "
    "Start directly with the topic — no introductions or identity mentions. "
    "Write the news in a crisp, energetic, and approachable tone based *only* on the provided analysis. "
    "Use fast-paced storytelling, clear language, and emotional color where appropriate, maintaining a warm, human, and trustworthy presence. "
    "You may add a gentle chuckle, subtle pauses, or light empathy if appropriate — never robotic or dull. "
    "Avoid markdown, bullet points, or any formatting — just plain text. Write the final script in fluent, flowing prose. "
    "Do not invent facts or add commentary beyond the content provided in the analysis. Stick tightly to the given material, but write with charm and energy. "
    "Keep the script suitable for a short podcast narration of about 1–2 minutes. Use natural transitions and avoid formal tone or filler. "
    "Ensure the script flows well for natural speech."
    "Return the script and the link of the news source in a JSON object with keys 'script' and 'source_link'. "
    "Example: {\"script\": \"Your script here.\", \"source_link\": \"the news link here\"}"
    )

    payload = {
        "model": "evil",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Create a news script based on this analysis: {analysis_content}"},
        ],
        "token": POLLINATIONS_TOKEN,
        "referrer": POLLINATIONS_REFERRER,
        "json": True,
        "seed": 123
    }
    print("📝 Generating news script from analysis...")
    try:
        response = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=60)
        response.raise_for_status()
        response_json = response.json()
        script_content = response_json.get("choices", [{}])[0].get("message", {}).get("content", "")
        if script_content:
             print("✅ News script generated.")
             return script_content
        else:
             print("❌ Script generation API returned empty content.")
             return None
    except requests.exceptions.RequestException as e:
        print(f"❌ Script generation failed: {e}")
        return None
    except Exception as e:
        print(f"❌ An unexpected error occurred during script generation: {e}")
        return None



if __name__ == "__main__":
    generate_news_analysis("Sample News Title")
   
