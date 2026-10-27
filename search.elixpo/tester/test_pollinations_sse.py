"""Test Pollinations /v1/chat/completions with stream=true to see SSE format."""
import requests
import json
import time
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
POLLINATIONS_API_KEY = os.getenv("POLLINATIONS_API_KEY")

URL = "https://gen.pollinations.ai/v1/chat/completions"
payload = {
    "model": "kimi",
    "messages": [{"role": "user", "content": "Say hello in 3 languages, one sentence each."}],
    "stream": True,
    "max_tokens": 500,
}
headers = {"Content-Type": "application/json", "Authorization": f"Bearer {POLLINATIONS_API_KEY}"}

print(f"POST {URL}")
print(f"stream=true\n")

t0 = time.perf_counter()
first_byte = None
chunks = []
full_content = ""
tool_calls_seen = False

with requests.post(URL, json=payload, headers=headers, stream=True, timeout=30) as r:
    print(f"Status: {r.status_code}")
    print(f"Content-Type: {r.headers.get('Content-Type')}")
    print(f"--- SSE events ---")

    for line in r.iter_lines(decode_unicode=True):
        now = time.perf_counter()
        if first_byte is None:
            first_byte = now
            print(f"[TTFB: {first_byte - t0:.3f}s]\n")

        if not line:
            continue

        elapsed = now - t0
        # Print raw line (truncated)
        print(f"  [{elapsed:6.3f}s] {line[:120]}")

        if line.startswith("data: "):
            data_str = line[6:]
            if data_str.strip() == "[DONE]":
                print(f"\n  [{elapsed:6.3f}s] >>> [DONE] signal")
                break
            try:
                obj = json.loads(data_str)
                choices = obj.get("choices", [])
                if not choices:
                    continue
                delta = choices[0].get("delta", {})
                if "content" in delta:
                    full_content += delta["content"]
                if "tool_calls" in delta:
                    tool_calls_seen = True
                    print(f"           ^ TOOL CALL delta: {delta['tool_calls']}")
                finish = choices[0].get("finish_reason")
                if finish:
                    print(f"           ^ finish_reason={finish}")
            except json.JSONDecodeError:
                pass

        chunks.append((elapsed, line))

total = time.perf_counter() - t0
print(f"\n--- summary ---")
print(f"Total chunks: {len(chunks)}")
print(f"Total time:   {total:.3f}s")
print(f"TTFB:         {(first_byte - t0):.3f}s" if first_byte else "No data")
print(f"Tool calls:   {tool_calls_seen}")
print(f"\nFull content:\n{full_content}")
