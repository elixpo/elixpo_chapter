import requests
from dotenv import load_dotenv
from typing import Optional
import os
from loguru import logger
import asyncio
import random
import json
load_dotenv()

async def generate_intermediate_response(json_data: dict) -> str:
    logger.info(f"Generating intermediate response for query: {json_data.get('query', 'Unknown')}")
    query = json_data.get('query', 'Research Query')
    information = json_data.get('information', '')
    urls = json_data.get('urls', [])
    priority = json_data.get('priority', 'medium')
    system_prompt = """
    You are an expert research assistant. Your task is to create a comprehensive, well-structured markdown response based on the provided search results.

    Requirements:
    1. Start with the query as an H1 heading
    2. Provide a detailed, elaborate explanation of the topic
    3. Use proper markdown formatting (headings, lists, emphasis)
    4. Structure the information logically
    5. Be comprehensive and informative
    6. Use clear, engaging language
    7. Include relevant details and context
    8. Do not mention sources or URLs in the content

    Format your response in clean markdown without code blocks.
    """
    user_prompt = f"""
    Based on this search information, create a comprehensive markdown response:
    
    Query: {query}
    Information: {information}
    Priority: {priority}
    
    Please provide a detailed, well-structured markdown response that thoroughly explains the topic.
    """
    
    payload = {
        "model": os.getenv("MODEL"),
        "messages": [
            {
                "role": "system",
                "content": system_prompt.strip()
            },
            {
                "role": "user",
                "content": user_prompt
            }
        ],
        "temperature": 0.7,
        "stream": False,
        "private": True,
        "referrer": "elixpoart",
        "max_tokens": 500, 
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
                    reply = reply[:sponsor_start].strip()
        except Exception as e:
            raise RuntimeError(f"Unexpected response format: {data}") from e

        return reply.strip()

    except requests.exceptions.Timeout:
        logger.warning("Timeout occurred in generate_intermediate_response")
        return f"# {query}\n\nUnable to generate response due to timeout."
    except Exception as e:
        logger.error(f"Error generating intermediate response: {e}")
        return f"# {query}\n\nError generating response: {str(e)}"



if __name__ == "__main__":
    async def main():
        test_json = {
            "query": "Who is credited with the invention of the incandescent light bulb?",
            "urls": [
                "https://www.sciencefocus.com/science/who-really-invented-the-light-bulb",
                "https://www.energy.gov/articles/history-light-bulb"
            ],
            "information": "Who really invented the light bulb? While perhaps the most famous creation attributed to inventor extraordinaire Thomas Edison, the incandescent light bulb was actually in development for nearly a century before Edison finally perfected it and brought it to the masses.",
            "id": 1,
            "priority": "high"
        }
        
        markdown_response = await generate_intermediate_response(test_json)
        print("\n--- Generated Markdown Response ---\n")
        print(markdown_response)

    asyncio.run(main())