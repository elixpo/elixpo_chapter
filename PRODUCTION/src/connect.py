import aiohttp
import asyncio
import sys

SERVER_URL = "http://127.0.0.1:5000/search/sse"

async def sse_search(query):
    async with aiohttp.ClientSession() as session:
        async with session.post(SERVER_URL, json={"query": query}) as resp:
            if resp.status != 200:
                print(f"Error: {resp.status}")
                print(await resp.text())
                return
            buffer = ""
            async for line in resp.content:
                decoded = line.decode("utf-8")
                buffer += decoded
                while "\n\n" in buffer:
                    part, buffer = buffer.split("\n\n", 1)
                    handle_sse_part(part)

def handle_sse_part(part):
    lines = part.strip().split("\n")
    event = ""
    data = ""
    for line in lines:
        if line.startswith("event:"):
            event = line.replace("event:", "").strip()
        elif line.startswith("data:"):
            data += line.replace("data:", "").strip() + "\n"
    data = data.strip()
    if event == "final" or event == "final-part":
        print(f"[{event}] {data}")
    elif event == "error":
        print(f"[ERROR] {data}")
    elif event:
        print(f"[{event}] {data}")

if __name__ == "__main__":
    query = "what's the latest news from india?"
    asyncio.run(sse_search(query))