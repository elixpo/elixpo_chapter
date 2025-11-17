import requests
from dotenv import load_dotenv
from typing import Optional
import os 
from loguru import logger
import asyncio 
import random
load_dotenv()

async def generate_reply(prompt: str, max_tokens: Optional[int] = 60) -> str:
    logger.info(f"Generating reply for prompt: {prompt} with max tokens: {max_tokens}")
    payload = {
        "model": os.getenv("MODEL"),
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a friendly and natural conversational AI. "
                    "Your job is to generate a short, casual reply to the user's message. "
                    "Keep it concise, engaging, and natural sounding, as if chatting with a friend. "
                    "Do not write scripts, narration, or long paragraphs."
                    "don't add any emojis or any other thing than just alphabets and numbers"
                )
            },
            {
                "role": "user",
                "content": f"{prompt}"
            }
        ],
        "temperature": 0.7,
        "stream": False,
        "private": True,
        "referrer": "elixpoart",
        "max_tokens": max_tokens,
        "seed": random.randint(1000, 1000000)
    }

    header = {
        "Content-Type": "application/json",
        "Authorization" : f"Bearer {os.getenv('POLLI_TOKEN')}"
    }

    try:
        response = requests.post("https://enter.pollinations.ai/api/generate/v1/chat/completions", headers=header, json=payload, timeout=30)
        if response.status_code != 200:
            raise RuntimeError(f"Request failed: {response.status_code}, {response.text}")

        data = response.json()
        try:
            reply: str = data["choices"][0]["message"]["content"]
            if "---" in reply and "**Sponsor**" in reply:
                sponsor_start = reply.find("---")
                if sponsor_start != -1:
                    sponsor_section = reply[sponsor_start:]
                    if "**Sponsor**" in sponsor_section:
                        reply = reply[:sponsor_start].strip()
        except Exception as e:
            raise RuntimeError(f"Unexpected response format: {data}") from e

        return reply.strip()
    except requests.exceptions.Timeout:
        logger.warning("Timeout occurred in generate_reply, returning generic system instruction.")
        return f"{prompt}"


if __name__ == "__main__":
    async def main():
        user_prompt = "Hey, what's going on guys!! Do you wanna play a game of tug?"
        reply = await generate_reply(user_prompt)

        print("\n--- Generated Reply ---\n")
        print(reply)
    asyncio.run(main())
