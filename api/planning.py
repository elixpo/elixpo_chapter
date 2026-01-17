import requests
from dotenv import load_dotenv
from typing import Optional
import os
from loguru import logger
import asyncio
import random
import json
import textwrap
load_dotenv()


async def generate_plan(prompt: str, max_tokens: Optional[int] = 600) -> str:
    logger.info(f"Generating planning for prompt: {prompt} with max tokens: {max_tokens}")

    system_prompt = """You are an intelligent conversational AI with an integrated "research detection engine".
    Your task is to classify queries and produce a structured JSON plan for a deep-search pipeline.
    {
    "main_query": "<the user's full query>",
    "max_tokens": <global token budget>,
    "subqueries": [
        {
        "id": 1,
        "q": "<expanded subquery for LLM reasoning OR a list depending on content>",
        "priority": "high/medium/low",
        "direct_response": true/false,
        "youtube": [
            {"url": "<youtube video URL>"},
            {"full_text": true/false}
        ],
        "document": [
            {"url": "<document URL given by user>"},
            {"query" : "<specific info to extract from the document>"}
        ],
        "time_based_query": "<timezone or null>",
        "max_tokens": <token budget for this subquery>
        }
        ]
    }
        Never output text outside JSON. Never include emojis.
        Use at least 2 subqueries for complex questions.
        Document URLs/Youtube URLs: Only include URLs explicitly typed by the user.
        Don't mention youtube urls in queries, just extract them to the youtube field.
        Prioritize direct_response true for simple factual queries.
        Allocate token budgets based on subquery complexity.
        Ensure the final JSON is syntactically correct.
        Make the user made queries better with sentence case.
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
        "seed": random.randint(1000, 1000000),
        "frequency_penalty" : 1,
        "logit_bias": {},
        "logprobs": False,
        "modalities" : ["text"]
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {os.getenv('TOKEN')}"
    }

    try:
        response = requests.post(
            "https://gen.pollinations.ai/v1/chat/completions",
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
        # user_prompt = "what's 1+1 and who invented zero, what's the time of kolkata now? and summarize the youtube video https://www.youtube.com/watch?v=dQw4w9WgXcQ and tell me what's in this document url https://www.w3.org/"
        # reply = await generate_plan(user_prompt)
        reqID = "test124"
        reply = """
        {
            "main_query": "what's 1+1 and who invented zero, what's the time of kolkata now? and summarize the youtube video https://www.youtube.com/watch?v=dQw4w9WgXcQ and tell me what's in this document url https://www.w3.org/",
            "max_tokens": 1500,
            "subqueries": [
                {
                    "id": 1,
                    "q": "What is 1+1?",
                    "priority": "high",
                    "direct_response": true,
                    "max_tokens": 100
                },
                {
                    "id": 2,
                    "q": "Who invented zero?",
                    "priority": "high",
                    "direct_response": true,
                    "max_tokens": 200
                },
                {
                    "id": 3,
                    "q": "What is the current time in Kolkata?",
                    "priority": "high",
                    "direct_response": true,
                    "time_based_query": "Asia/Kolkata",
                    "max_tokens": 100
                },
                {
                    "id": 4,
                    "q": "Summarize the content of the YouTube video.",
                    "priority": "high",
                    "direct_response": false,
                    "youtube": [
                        {
                            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                            "full_text": true
                        }
                    ],
                    "max_tokens": 800
                },
                {
                    "id": 5,
                    "q": "What is the World Wide Web Consortium (W3C)?",
                    "priority": "medium",
                    "direct_response": false,
                    "document": [
                        {
                            "url": "https://www.w3.org/",
                            "query": "Provide a summary of the W3C organization and its mission."
                        }
                    ],
                    "max_tokens": 300
                }
            ]
        }"""
        
            

    asyncio.run(main())