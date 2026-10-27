import asyncio
import os
from pathlib import Path
from pprint import pprint
from dotenv import load_dotenv
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env.local")

async def main():
    key = os.getenv("API_KEY", "").strip()
    if not key:
        raise RuntimeError("API_KEY is missing from the repository .env.local")

    async with streamablehttp_client(
        "https://search.elixpo.com/mcp",
        headers={"Authorization": f"Bearer {key}"},
        timeout=150,
    ) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(
                "research_web",
                {
                    "query": "What changed recently in the Model Context Protocol?",
                    "max_sources": 4,
                },
            )
            data = result.structuredContent
            print("\nANSWER:\n", data["answer"])
            print("\nCITATIONS:")
            pprint(data["citations"])
            print("\nEVIDENCE:")
            pprint(data["evidence"])


if __name__ == "__main__":
    asyncio.run(main())