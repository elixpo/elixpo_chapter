import requests
import urllib.parse
import json
import random

def generate_visual_prompt(topic, image_type):
    import requests, json, random

    api_url = "https://text.pollinations.ai/openai"
    headers = {"Content-Type": "application/json"}

    if image_type == "thumbnail":
        system_prompt = (
            "You're a prompt engineer for AI image generation. Given a podcast title or topic, craft a striking thumbnail description in a short sentence. "
            "The output should be visually bold and conceptually relevant to the topic. "
            "Avoid generic robotic faces or tech blobs. Instead, understand the topic and hint at metaphors or symbols like colorful microphones, headphones, "
            "scenes from the theme (e.g., astronomy, gaming), or artistic interpretations that would attract a viewer. "
            "Make it pop: use vivid adjectives, 'illustration', 'vector art', 'vibrant colors', and strong contrast. Avoid all text or logos. "
            "Output only a single sentence, about 30 words, no formatting or lists."
        )
    elif image_type == "banner":
        system_prompt = (
            "You're a visual prompt generator for AI art. Given a podcast topic, produce a realistic, serene, oil-painting-style scene in a short sentence suitable for a cinematic banner (1280x720). "
            "Focus on atmosphere, lighting, and visual clarity — avoid clutter or text. Use phrases like 'oil painting', 'cinematic lighting', 'soft focus', or 'Tyndall effect'. "
            "Produce a single, clear image description in 30 words, no markdown formatting or overheads."
        )
    else:
        return None

    payload = {
        "model": "openai-fast",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": topic}
        ],
        "seed": random.randint(1000, 999999),
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


def generate_podcast_thumbnail(topic, podcastID):
    refined_prompt = generate_visual_prompt(topic, "thumbnail")
    if not refined_prompt:
        return False

    params = {
        "width": 512,
        "height": 512,
        "model": "flux",
        "seed": 56,
        "token": "fEWo70t94146ZYgk",
        "referrer": "elixpoart",
        "private": True,
        "nologo": True,
    }

    encoded_prompt = urllib.parse.quote(refined_prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt} -- aspect ratio of 1:1 square mode"

    try:
        response = requests.get(url, params=params, timeout=300)
        response.raise_for_status()
        filename = f'podcastThumbnail_{podcastID}'
        with open(f"{filename}.jpg", 'wb') as f:
            f.write(response.content)
        print(f"✅ Thumbnail saved as {filename+".jpg"}")
        return filename
    except requests.exceptions.RequestException as e:
        print(f"❌ Error generating thumbnail: {e}")
        return False


def generate_podcast_banner(topic, podcastID):
    refined_prompt = generate_visual_prompt(topic, "banner")
    print(f"Refined prompt for banner: {refined_prompt}")
    if not refined_prompt:
        return False

    params = {
        "width": 1280,
        "height": 720,
        "model": "flux",
        "seed": 56,
        "token": "fEWo70t94146ZYgk",
        "referrer": "elixpoart",
        "private": True,
        "nologo": True,
    }

    encoded_prompt = urllib.parse.quote(refined_prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt} -- aspect ratio of 16:9 landscape mode"

    try:
        response = requests.get(url, params=params, timeout=600)
        response.raise_for_status()
        filename = f'podcastBanner_{podcastID}'
        with open(f'{filename+".jpg"}', 'wb') as f:
            f.write(response.content)
        print(f"✅ Banner saved as {filename+".jpg"}")
        return filename
    except requests.exceptions.RequestException as e:
        print(f"❌ Error generating banner: {e}")
        return False


# if __name__ == "__main__":
    # generate_podcast_thumbnail("Fake AI Podcasts Your Search Results", "12345")
#     generate_podcast_thumbnail("Nintendo Switch 2: The new gaming era", "12345")