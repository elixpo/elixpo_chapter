import requests
import base64
import asyncio
from dotenv import load_dotenv
import os
import requests

async def generate_prompt_from_image(imgURL: str) -> str:
    imageBase64 = image_url_to_base64(imgURL)   
    api_url = "https://text.pollinations.ai/openai"
    headers = {"Content-Type": "application/json"}


    instruction = (
        "You're an expert visual analyst. Given an image, describe it as a precise, "
        "search-optimized query that captures the most identifiable, unique, and relevant aspects of the image. "
        "Think of what someone might type into an image search engine to find this exact image or similar ones.\n\n"
        "Prioritize:\n"
        "- Recognizable subjects: recognize people (try to recognize and name them if possible; if famous, name them), animals, logos, brands\n"
        "- Art style: oil painting, digital art, anime, blueprint, sketch, abstract, minimalist, etc.\n"
        "- Objects and scene: nature, architecture, vehicles, furniture, urban, indoors, etc.\n"
        "- Mood & aesthetics: serene, dramatic, retro, vaporwave, cyberpunk, cinematic, moody\n"
        "- Colors and textures: pastel tones, vibrant neon, dark gritty, clean minimal\n"
        "- Camera style or angle: close-up, aerial view, depth of field, wide shot\n"
        "- Any cultural or thematic elements: Indian traditional art, Gothic, Japanese sumi-e, sci-fi tech, etc.\n\n"
        "Avoid vague words. Be descriptive but concise. Don't assume, only describe what’s clearly visible. "
        "If a person's face is clearly visible and recognizable, include their name. "
        "Final output must be a **single-line image search query** optimized for clarity and relevance."
    )

    data = {
        "model": "openai-large",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{imageBase64}"}}
                ]
            }
        ],
        "token": os.getenv("TOKEN"),
        "max_tokens": 50
    }

    response = requests.post(api_url, headers=headers, json=data)
    response.raise_for_status()
    result = response.json()
    return result["choices"][0]["message"]["content"].strip()




async def replyFromImage(imgURL: str, query: str) -> str:
    imageBase64 = image_url_to_base64(imgURL)  
    api_url = "https://text.pollinations.ai/openai"
    headers = {"Content-Type": "application/json"}

    instruction = (
        
       "You are a jolly assistant! First, analyze the image and understand what it is conveying, "
        "while strictly following NSFW guidelines (do not describe or respond to inappropriate content). "
        "Then, read the user's query and provide a friendly, helpful answer based on the image and the query. "
        "Keep your tone light and cheerful!\n"
        "Prioritize:\n"
        "- Recognizable subjects: recognize people (try to recognize and name them if possible; if famous, name them), animals, logos, brands\n"
        "- Art style: oil painting, digital art, anime, blueprint, sketch, abstract, minimalist, etc.\n"
        "- Objects and scene: nature, architecture, vehicles, furniture, urban, indoors, etc.\n"
        "- Mood & aesthetics: serene, dramatic, retro, vaporwave, cyberpunk, cinematic, moody\n"
        "- Colors and textures: pastel tones, vibrant neon, dark gritty, clean minimal\n"
        "- Camera style or angle: close-up, aerial view, depth of field, wide shot\n"
        "- Any cultural or thematic elements: Indian traditional art, Gothic, Japanese sumi-e, sci-fi tech, etc.\n\n"
        "Avoid vague words. Be descriptive but concise. Don't assume, only describe what’s clearly visible. "
        "If a person's face is clearly visible and recognizable, include their name. "
        
    )

    data = {
        "model": "openai",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {"type": "text", "text": query},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{imageBase64}"}}
                ]
            }
        ],
        "token": os.getenv("TOKEN")
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
        image_url = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Tour_Eiffel_Wikimedia_Commons_%28cropped%29.jpg/500px-Tour_Eiffel_Wikimedia_Commons_%28cropped%29.jpg" 
        prompt = await generate_prompt_from_image(image_url)
        print(prompt)
    asyncio.run(main()) 