import requests
from processNewsGeneral import POLLINATIONS_REFERRER, POLLINATIONS_TOKEN


def generate_visual_prompt(topic):
    import requests, json, random

    api_url = "https://text.pollinations.ai/openai"
    headers = {"Content-Type": "application/json"}
    system_prompt = (
    "You are a visual scene translator for podcast topics. Your task is to deeply understand the given text and extract the core setting or subject it refers to, "
    "ignoring specific names, brands, or people. Instead, convert it into a relaxing, realistic scene described in the style of a watercolor painting. "
    "Always focus on evoking calm, cinematic imagery — like misty mornings, soft backlighting, natural textures, and the Tyndall effect. "
    "Avoid text, characters, or clutter. Think in terms of peaceful visual therapy. Use artistic terms like 'water painting', 'sun-drenched landscape', 'serene golf course at dawn', "
    "'cinematic lighting', 'soft haze', or 'distant silhouette'. Output just one 25-30 word image description suitable for a banner (1280x720)."
    )


    payload = {
        "model": "openai-fast",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": topic}
        ],
        "seed": 42,
        "token": "fEWo70t94146ZYgk",
        "referrer": "elixpoart"
    }

    try:
        res = requests.post(api_url, headers=headers, data=json.dumps(payload), timeout=60)
        res.raise_for_status()
        return res.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    except requests.RequestException as e:
        print(f"❌ Failed to get refined prompt: {e}")
        return None

def generate_overall_banner_image(news_id, prompt):

    url = f"https://image.pollinations.ai/prompt/{requests.utils.quote(prompt)} -- aspect ratio of 16:9 landscape mode"
    params = {
        "height": 720,
        "width": 1280,
        "model": "turbo",
        "nologo": True,
        "private": True,
        "token": POLLINATIONS_TOKEN,
        "referrer": POLLINATIONS_REFERRER,
        "seed": 42
    }
    print(f"🖼️ Generating overall banner image for '{prompt}'...")
    try:
        response = requests.get(url, params=params, timeout=60)
        response.raise_for_status()
        return response
    except requests.exceptions.RequestException as e:
        print(f"❌ Overall banner image gen failed: {e}")
        return None
    except Exception as e:
        print(f"❌ An unexpected error occurred during overall banner image generation: {e}")
        return None
    
if __name__ == "__main__":
    getVisualPrompt = generate_visual_prompt("2025 U.S. Open leaderboard: J.J. Spaun sizzles as Brooks Koepka, Jon Rahm chase in difficult start at Oakmont - CBS Sports")
    print(getVisualPrompt)
    imageResponse = generate_overall_banner_image("12345", getVisualPrompt)

    