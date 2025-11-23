import requests
from dotenv import load_dotenv
from typing import Optional
import os
from loguru import logger
import asyncio
import random
import json
load_dotenv()

token_map = {
    "high" : 300,
    "medium" : 100,
    "low" : 50
}
async def generate_intermediate_response(urls, query, information, priority) -> str:
    logger.info(f"Generating intermediate response for query: {query}")
    system_prompt = f"""You are an expert research assistant. Your task is to create a comprehensive, well-structured markdown response based on the provided search results.
    Requirements:
    Start with the query as an H1 heading
    Provide a detailed, elaborate explanation of the topic
    Use proper markdown formatting (headings, lists, emphasis)
    Structure the information logically
    Be comprehensive and informative
    Use clear, engaging language
    Include relevant details and context
    Take the information of the URLs only if provided by the user and then cite them as [1][2] with the URLs at the end mapped with numberings 
    appropriately in the response [this is a must]
    Format your response in clean markdown without code blocks.
    Output max tokens of  {token_map[priority]} for this query
    """
    user_prompt = f"""Based on this search information, create a comprehensive markdown response:
    Query: {query}
    Information: {information}
    Priority: {priority}
    URLs: {", ".join(urls) if urls else "No URLs provided"}
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
        "max_tokens": token_map[priority],
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
        plan_data = {
            "query": "capital of france",
            "urls": [
                "https://en.wikipedia.org/wiki/Paris",
                "https://www.britannica.com/place/Paris",
                "https://www.mappr.co/capital-cities/france/",
                "https://theworldcountries.com/geo/capital-city/Paris",
                "https://www.newworldencyclopedia.org/entry/Paris,_France",
                "https://www.countryaah.com/france-faqs/",
                "https://alea-quiz.com/en/what-is-the-capital-of-france/"
            ],
            "information": "The capital of France is Paris. geography What is the capital of France? geography  What is the capital of France? Answer The capital of France is Paris.",
            "id": 2,
            "priority": "low",
            "time_taken": "5.10s",
            "reqID": "test123"
        }
        
        markdown_response = await generate_intermediate_response(plan_data["urls"], plan_data["query"], plan_data["information"], plan_data["priority"])
        print("\n--- Generated Markdown Response ---\n")
        print(markdown_response)

    asyncio.run(main())