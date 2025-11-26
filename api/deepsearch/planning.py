import requests
from dotenv import load_dotenv
from typing import Optional
import os
from loguru import logger
import asyncio
import random
import json


load_dotenv()

async def generate_plan(prompt: str, max_tokens: Optional[int] = 120) -> str:
    logger.info(f"Generating planning for prompt: {prompt} with max tokens: {max_tokens}")

    system_prompt = """ You are an intelligent conversational AI with an integrated "research detection engine".
    Your task is to classify queries and produce a structured JSON plan for a deep-search pipeline.
    Type A — Simple / conversational / trivial queries:
    Examples: greetings, jokes, small talk, math like 1+1, trivial facts.
    Type B — Research-required queries:
    Examples: technical topics, complex reasoning, multi-step reasoning,
    YouTube summaries, video-based queries, document-based questions,
    historical or scientific analyses, or anything requiring retrieval
    from links, PDFs, videos, or web content.
    If the user query is Type A, output ONLY:
    {
    "main_query": "<the user's query>",
    "is_final": true,
    "response": "<your short natural reply>",
    "subqueries": [],
    "targets": [],
    "depth": 0,
    "max_tokens": 200
    }
    If the query requires research, output ONLY this JSON:

    {
    "main_query": "<the user's full query>",
    "is_final": false,
    "max_tokens": <global token budget>,
    "subqueries": [
        {
        "id": 1,
        "q": "<expanded subquery for LLM reasoning OR a list depending on content>",
        "priority": "high/medium/low",
        "direct_text": true/false,
        "youtube": ["<only YouTube URLs explicitly provided>"],
        "document": ["<only URLs explicitly provided>"],
        "time": "<timezone or null>",
        "full_transcript": true/false,
        "max_tokens": <token budget for this subquery>
        }
    ],
    "targets": ["web", "pdf", "academic", "youtube"],
    "depth": <1 to 6>
    }
    1. Never output text outside JSON.
    2. Never include emojis.
    3. Use at least 2 subqueries for complex questions.
    4. Document URLs:
    - Only include URLs explicitly typed by the user.
    - Never infer or create URLs.
    5. YouTube URLs:
    - Only if explicitly included in the user's query.
    You MUST analyze what the user wants from each YouTube URL.
    A. If the user clearly wants a full transcript:
    - Set "full_transcript": true
    - Set "q": []
    B. If the user wants contextual information (e.g., summary, explanation, extraction):
    - Set "full_transcript": false
    - Set "q": "explain what the user needs from the video in short"
    C. If user asks multiple questions about the same video:
    - "q" must be a list of all such questions, each as a separate item.

    D. If user provides a YouTube URL but does not clarify intent:
    - Infer the intent minimally:
        → If they say "video about X?" → treat as contextual query with ["describe"].
        → Otherwise default to summary:
            "q": ["summary"], "full_transcript": false.
    - Each subquery MUST contain "max_tokens".
    - The main plan MUST contain a top-level "max_tokens".
    - High priority tasks → larger token budgets.
    - Full transcript tasks → largest token budget.
    - Never exceed global max_tokens.
    - Only strict JSON.
    - No markdown.
    - No explanations. """


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
        user_prompt = "what's 1+1 and who invented zero, what's the time of kolkata now? and summarize the youtube video https://www.youtube.com/watch?v=dQw4w9WgXcQ and tell me what's in this document url https://www.w3.org/"
        reply = await generate_plan(user_prompt)
        reqID = "test123"
        try:
            reply_json = json.loads(reply)
            os.makedirs(f"searchSessions/{reqID}", exist_ok=True)
            with open(f"searchSessions/{reqID}/{reqID}_planning.json", "w") as f:   
                f.write(json.dumps(reply_json, indent=2))
        except Exception:
            pass
        print("\n--- Generated Reply ---\n")
        print(reply)

    asyncio.run(main())