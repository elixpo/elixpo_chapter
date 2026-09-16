import requests
import base64
import asyncio
from commons.environment import load_local_environment
from commons.auth_context import pollinations_auth_headers
import os
import re
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.config import IMAGE_SEARCH_QUERY_WORDS_LIMIT, VISION_MODEL, POLLINATIONS_ENDPOINT

load_local_environment()


def image_url_to_base64(image_url):
    # Handle data: URLs (already base64-encoded)
    if image_url.startswith("data:"):
        # Format: data:image/jpeg;base64,/9j/4AAQ...
        try:
            _, payload = image_url.split(",", 1)
            return payload
        except ValueError:
            pass
    response = requests.get(image_url, timeout=15)
    response.raise_for_status()
    image_bytes = response.content
    b64 = base64.b64encode(image_bytes).decode('utf-8')
    del image_bytes
    return b64


def _call_vision_model(messages, max_tokens=300):

    api_url = POLLINATIONS_ENDPOINT
    headers = pollinations_auth_headers()
    data = {
        "model": VISION_MODEL,
        "messages": messages,
        "max_tokens": max_tokens
    }
    response = requests.post(api_url, headers=headers, json=data, timeout=30)
    response.raise_for_status()
    result = response.json()
    choice = result.get("choices", [{}])[0]
    msg = choice.get("message") or choice.get("delta") or {}
    return msg.get("content", "").strip()


async def describe_image(imgURL: str) -> str:

    imageBase64 = await asyncio.to_thread(image_url_to_base64, imgURL)
    try:
        instruction = """Analyze this image and describe what you see in detail.

Rules:
- Identify recognizable subjects (name famous people, brands, logos)
- Describe art style, scene, objects, mood, colors, camera angle
- Be descriptive but concise — 2-4 paragraphs max
- Use markdown formatting
- If text is visible, transcribe it
- NSFW content: decline to describe inappropriate content"""

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{imageBase64}"}}
                ]
            }
        ]
        return await asyncio.to_thread(_call_vision_model, messages, 500)
    finally:
        del imageBase64


async def generate_prompt_from_image(imgURL: str) -> str:

    imageBase64 = await asyncio.to_thread(image_url_to_base64, imgURL)
    try:
        instruction = """TASK: Generate a single-line search query for the provided image.

OUTPUT RULES (CRITICAL):
- RESPOND ONLY WITH THE SEARCH QUERY
- NO explanations, NO meta-text, NO "The image shows...", NO "This is...", NO preamble
- If you must respond, output ONLY keywords separated by spaces
- Maximum 15 words
- Be precise and search-optimized

QUERY GUIDELINES:
- Include recognizable subjects (people names if famous, animals, brands, logos)
- Include art style if relevant (oil painting, digital art, anime, sketch, etc)
- Include scene type (nature, architecture, vehicles, urban, indoor, etc)
- Include mood/aesthetics (serene, dramatic, retro, cyberpunk, cinematic, etc)
- Include dominant colors if notable (neon, pastel, dark, vibrant)
- Include camera angle if distinctive (close-up, aerial, wide shot)

EXAMPLES OF CORRECT OUTPUT:
- "Eiffel Tower Paris blue sky architecture cityscape"
- "Anime girl cherry blossoms serene digital art"
- "Cyberpunk neon city dark moody futuristic"
- "Golden Retriever running grass park sunny day"

NOW GENERATE ONLY THE SEARCH QUERY FOR THIS IMAGE - NO OTHER TEXT:"""

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{imageBase64}"}}
                ]
            }
        ]
        content = await asyncio.to_thread(_call_vision_model, messages, 300)
    finally:
        del imageBase64

    meta_patterns = [
        r"^the user wants.*?query[:\s]+",
        r"^search query[:\s]*",
        r"^query[:\s]*",
        r"^image[:\s]*",
        r"^the image[:\s]*",
        r"^this is[:\s]*",
        r"^this shows[:\s]*",
        r"^image shows[:\s]*",
        r"^it shows[:\s]*",
    ]
    for pattern in meta_patterns:
        content = re.sub(pattern, "", content, flags=re.IGNORECASE).strip()
    if content.lower().startswith("the image"):
        parts = content.split(":", 1)
        if len(parts) > 1:
            content = parts[1].strip()
    content = content.strip('"\'')
    sentences = content.split('.')[0].strip()
    words = sentences.split()[:IMAGE_SEARCH_QUERY_WORDS_LIMIT]
    final_query = " ".join(words).strip()
    if not final_query or len(final_query) < 3:
        return "image search"
    return final_query


async def replyFromImage(imgURL: str, query: str) -> str:

    imageBase64 = await asyncio.to_thread(image_url_to_base64, imgURL)
    try:
        instruction = """You are a helpful assistant. Analyze the image and answer the user's query based on what you see. Be descriptive but concise.
Prioritize:
- Recognizable subjects: recognize people (name them if famous), animals, logos, brands
- Art style, objects, scene, mood, colors, camera angle
- Any text visible in the image
Avoid vague words. Only describe what's clearly visible. Use markdown formatting."""

        messages = [
            {
                "role": "system",
                "content": [
                    {"type": "text", "text": instruction},
                ]
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": query},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{imageBase64}"}}
                ]
            },
        ]
        return await asyncio.to_thread(_call_vision_model, messages, 500)
    finally:
        del imageBase64


if __name__ == "__main__":
    async def main():
        image_url = "https://media.architecturaldigest.com/photos/66a951edce728792a48166e6/16:9/w_1920,c_limit/GettyImages-955441104.jpg"
        prompt = await replyFromImage(image_url, "what is this?")
        print(prompt)
    asyncio.run(main())
