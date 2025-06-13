import requests
from processNewsGeneral import POLLINATIONS_REFERRER, POLLINATIONS_TOKEN


def create_combined_news_summary(topics):
    base_instruction = (
        "Given several news headlines, write a single concise summary that combines their main ideas. "
        "The summary should be 20 words long, clear, and capture the essence of all topics."
    )
    if isinstance(topics, (list, tuple)):
        combined_topic = " | ".join(topics)
    else:
        combined_topic = str(topics)
    payload = {
        "model": "openai-fast",
        "messages": [
            {"role": "system", "content": base_instruction},
            {"role": "user", "content": combined_topic}
        ],
        "token": "fEWo70t94146ZYgk",  
        "referrer": "elixpoart",
        "seed": 42,
        "temperature": 0.4,
        "top_p": 0.9,
        "presence_penalty": 0.5,
        "frequency_penalty": 0.5
    }
    try:
        res = requests.post(
            "https://text.pollinations.ai/openai",
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=60
        )
        res.raise_for_status()
        return res.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    except requests.RequestException as e:
        print(f"❌ Failed to get news summary: {e}")
        return None
    

def create_combined_visual_prompt(*topics):
    """Takes 5 topics and combines them into a single artistic visual prompt."""
    base_instruction = (
        "You're an AI art prompt generator. Given multiple news topics, combine their essence into a single cohesive visual scene. "
        "Generate a colored vector digital illustration (not realistic) in a 1:1 square format (512x512), suitable for icon or thumbnail use. "
        "The style should be vibrant, minimal yet meaningful, and thematically unified — no text, no faces. Think in terms of abstract symbols, color harmony, and metaphor. "
        "Output just one short prompt of 40-50 words, describing what the image should look like — in vector art terms."
    )

    combined_topic = " | ".join(topics)
    payload = {
        "model": "openai-fast",
        "messages": [
            {"role": "system", "content": base_instruction},
            {"role": "user", "content": combined_topic}
        ],
        "token": "fEWo70t94146ZYgk",  
        "referrer": "elixpoart",
        "seed": 42,
        "temperature": 0.4,
        "top_p": 0.9,
        "presence_penalty": 0.5,
        "frequency_penalty": 0.5
    }

    try:
        res = requests.post(
            "https://text.pollinations.ai/openai",
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=60
        )
        res.raise_for_status()
        return res.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    except requests.RequestException as e:
        print(f"❌ Failed to get visual prompt: {e}")
        return None

def generate_vector_image(news_id, prompt):
    """Generates a colored vector-style image from the prompt and uploads it."""
    url = f"https://image.pollinations.ai/prompt/{requests.utils.quote(prompt)} -- vector digital art -- colorful -- 1:1 icon style"
    params = {
        "height": 512,
        "width": 512,
        "model": "flux",
        "nologo": True,
        "private": True,
        "token": POLLINATIONS_TOKEN,
        "referrer": POLLINATIONS_REFERRER,
        "seed": 42,
    }

    print(f"🎨 Generating combined vector image for prompt: {prompt}")
    try:
        response = requests.get(url, params=params, timeout=60)
        response.raise_for_status()
        return response.content

        
    except requests.RequestException as e:
        print(f"❌ Failed to generate or upload vector image: {e}")
        return None
    except Exception as e:
        print(f"❌ Unexpected error during vector image generation: {e}")
        return None

if __name__ == "__main__":

    topic1 = "SpaceX launches new Starship for orbital flight test"
    topic2 = "Breakthrough in coral reef restoration using AI drones"
    topic3 = "Olympics 2025 to feature climate-neutral venues"
    topic4 = "New electric air taxis approved for urban use"
    topic5 = "Nobel Prize awarded for quantum computing research"

    visual_prompt = create_combined_visual_prompt(topic1, topic2, topic3, topic4, topic5)
    print("🧠 Visual Prompt:", visual_prompt)
    
    if visual_prompt:
        result_url = generate_vector_image("combined_2025_01", visual_prompt)
    news_summary = create_combined_news_summary(topic1, topic2, topic3, topic4, topic5)
    print("📰 Combined News Summary:", news_summary)