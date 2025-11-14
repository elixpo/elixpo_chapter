import os
import json
import requests
import dotenv
import asyncio
import concurrent.futures
from getTimeZone import get_local_time

dotenv.load_dotenv()
POLLINATIONS_ENDPOINT = "https://enter.pollinations.ai/api/generate/v1/chat/completions"
POLLINATIONS_TOKEN = os.getenv("TOKEN")
MODEL = os.getenv("MODEL", "openai")
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_local_time",
            "description": "Get local time for a specific location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location_name": {
                        "type": "string",
                        "description": "The location name"
                    }
                },
                "required": ["location_name"]
            }
        }
    }
]


def format_sse(event: str, data: str) -> str:
    lines = data.splitlines()
    data_str = ''.join(f"data: {line}\n" for line in lines)
    return f"event: {event}\n{data_str}\n\n"


async def run_elixposearch_pipeline(user_query: str, event_id: str = None):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {POLLINATIONS_TOKEN}"
    }

    messages = [
        {"role": "system", "content": "You may call get_local_time(location_name) if the user asks for a local time."},
        {"role": "user", "content": user_query}
    ]

    payload = {
        "model": MODEL,
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
        "stream": False,
        "retry": {}       
    }

    loop = asyncio.get_event_loop()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(
            requests.post,
            POLLINATIONS_ENDPOINT,
            headers=headers,
            json=payload,
            timeout=30
        )

        try:
            response = await loop.run_in_executor(None, lambda: future.result())
            resp_text = response.text

            try:
                response.raise_for_status()
                data = response.json()
            except requests.HTTPError as he:
                yield format_sse("error", f"Request failed: {he}\nResponse body: {resp_text}")
                return
            except ValueError:
                yield format_sse("error", f"Invalid JSON returned:\n{resp_text}")
                return
        except Exception as e:
            yield format_sse("error", f"Request failed: {e}")
            return

    assistant = data.get("choices", [{}])[0].get("message", {})
    tool_calls = assistant.get("tool_calls") or []

    if not tool_calls:
        yield format_sse("final", assistant.get("content", ""))
        return

    # Tool processing
    for tc in tool_calls:
        fname = tc["function"]["name"]
        try:
            args = json.loads(tc["function"]["arguments"])
        except:
            args = {}

        if fname == "get_local_time":
            location = args.get("location_name", "")
            try:
                result = get_local_time(location)
            except Exception as e:
                result = f"[ERROR] get_local_time failed: {e}"

            final = assistant.get("content", "")
            combined = f"{final}\n\nLocal time for {location}: {result}"
            yield format_sse("final", combined)
            return

        yield format_sse("final", f"[UNKNOWN TOOL REQUESTED] {fname}")
        return



if __name__ == "__main__":
    import asyncio
    async def main():
        async for chunk in run_elixposearch_pipeline("What's the time in Kolkata?"):
            print(chunk)
    asyncio.run(main())