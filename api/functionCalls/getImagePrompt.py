import requests
import base64
import asyncio
from dotenv import load_dotenv
import os
import requests
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.config import IMAGE_SEARCH_QUERY_WORDS_LIMIT

load_dotenv()

async def generate_prompt_from_image(imgURL: str) -> str:
    imageBase64 = image_url_to_base64(imgURL)   
    api_url = "https://gen.pollinations.ai/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {os.getenv('TOKEN')}"
        }

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

    data = {
        "model": os.getenv("IMAGE_MODEL"),
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{imageBase64}"}}
                ]
            }
        ],
        "max_tokens": 300
    }

    response = requests.post(api_url, headers=headers, json=data)
    response.raise_for_status()
    result = response.json()
    content = result["choices"][0]["message"]["content"].strip()
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
    
    import re
    for pattern in meta_patterns:
        content = re.sub(pattern, "", content, flags=re.IGNORECASE).strip()
    
    # Remove common explanation starters
    if content.lower().startswith("the image"):
        parts = content.split(":", 1)
        if len(parts) > 1:
            content = parts[1].strip()
    
    # Remove quotes
    content = content.strip('"\'')
    
    # Split into sentences and take the first one (could be multiple sentences)
    sentences = content.split('.')[0].strip()
    
    # Limit to first N words for search query
    words = sentences.split()[:IMAGE_SEARCH_QUERY_WORDS_LIMIT]
    final_query = " ".join(words).strip()
    
    # Ensure we got actual content, not just meta-text
    if not final_query or len(final_query) < 3:
        return "image search"
    
    return final_query




async def replyFromImage(imgURL: str, query: str) -> str:
    imageBase64 = image_url_to_base64(imgURL)  
    api_url = "https://gen.pollinations.ai/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {os.getenv('TOKEN')}"
        }

    instruction = """You are a jolly assistant! First, analyze the image and understand what it is conveying, while strictly following NSFW guidelines (do not describe or respond to inappropriate content). Then, read the user's query and provide a friendly, helpful answer based on the image and the query. Keep your tone light and cheerful!
Prioritize:
- Recognizable subjects: recognize people (try to recognize and name them if possible; if famous, name them), animals, logos, brands
- Art style: oil painting, digital art, anime, blueprint, sketch, abstract, minimalist, etc.
- Objects and scene: nature, architecture, vehicles, furniture, urban, indoors, etc.
- Mood & aesthetics: serene, dramatic, retro, vaporwave, cyberpunk, cinematic, moody
- Colors and textures: pastel tones, vibrant neon, dark gritty, clean minimal
- Camera style or angle: close-up, aerial view, depth of field, wide shot
- Any cultural or thematic elements: Indian traditional art, Gothic, Japanese sumi-e, sci-fi tech, etc.

Avoid vague words. Be descriptive but concise. Don't assume, only describe what's clearly visible. If a person's face is clearly visible and recognizable, include their name."""

    data = {
        "model": os.getenv("IMAGE_MODEL"),
        "messages": [
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
            
        ],
        "max_tokens": 250
    }

    response = requests.post(api_url, headers=headers, json=data)
    response.raise_for_status()
    result = response.json()
    return result["choices"][0]["message"]["content"].strip()

def image_url_to_base64(image_url):
    response = requests.get(image_url)
    response.raise_for_status()
    return base64.b64encode(response.content).decode('utf-8')




if __name__ == "__main__":
    async def main():
        image_url = "https://media.architecturaldigest.com/photos/66a951edce728792a48166e6/16:9/w_1920,c_limit/GettyImages-955441104.jpg" 
        prompt = await generate_prompt_from_image(image_url)
        print(prompt)
    asyncio.run(main()) 