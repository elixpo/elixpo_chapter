import requests
from dotenv import load_dotenv
from typing import Optional
import os
from loguru import logger
import asyncio
import random
import json


load_dotenv()

async def generate_reply(prompt: str, max_tokens: Optional[int] = 120) -> str:
    logger.info(f"Generating planning for prompt: {prompt} with max tokens: {max_tokens}")

    system_prompt = """
    You are an intelligent conversational AI with an integrated "research detection engine".

    Your behavior:

    First, classify the user's query into one of two types:
    A. Simple / conversational / trivial questions
        Examples: greetings, jokes, small talk, math like 1+1, trivial facts.
    B. Research-required queries
        Examples: technical topics, science, history, deep questions, anything requiring external information.

    If the query is Type A (simple):
        Respond with a short, casual, natural reply.
        Reply in json format as:
            {"response": "<your casual reply here>" }
    If the query is Type B (research-required):
        DO NOT answer the question directly.
        Instead, output ONLY a JSON object representing a "sub-query research plan".
        The JSON must follow this structure:
    {
    "main_query": "<the user's main question>",
    "subqueries": [
        { "id": 1, "q": "<expanded subquery 1>", "priority": "high/medium/low" },
        { "id": 2, "q": "<expanded subquery 2>", "priority": "..." }
    ],
    "targets": ["web", "pdf", "academic"],
    "depth": <1-4 based on complexity>
    }
    Never mix normal conversational text with JSON.
    Do not explain the JSON. Just output it raw.
    Do not include emojis.
    """

    payload = {
        "model": os.getenv("MODEL"),
        "messages": [
            {
                "role": "system",
                "content": system_prompt.replace("\n", " ").strip()
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.7,
        "stream": False,
        "private": True,
        "referrer": "elixpoart",
        "max_tokens": max_tokens,
        "seed": random.randint(1000, 1000000)
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {os.getenv('TOKEN')}"
    }

    try:
        response = requests.post(
            "https://enter.pollinations.ai/api/generate/v1/chat/completions",
            headers=headers, json=payload, timeout=30
        )
        if response.status_code != 200:
            raise RuntimeError(f"Request failed: {response.status_code}, {response.text}")

        data = response.json()
        try:
            reply = data["choices"][0]["message"]["content"]
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
        user_prompt = "Who invented the light bulb and what were the key challenges they faced?"
        reply = await generate_reply(user_prompt)
        reqID = "test123"
        try:
            reply_json = json.loads(reply)
            if "response" not in reply_json:
                os.makedirs("searchSessions", exist_ok=True)
                with open(f"searchSessions/{reqID}/{reqID}_planning.json", "w") as f:   
                    f.write(json.dumps(reply_json, indent=2))
        except Exception:
            pass
        print("\n--- Generated Reply ---\n")
        print(reply)

    asyncio.run(main())
