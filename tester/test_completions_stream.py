import requests
import json
import time

URL = "https://search.elixpo.com/v1/chat/completions"

payload = {
    "messages": [
        {"role": "user", "content": "I'm planning a trip to Japan next month"},
        {"role": "assistant", "content": "That sounds exciting! Japan is a wonderful destination. Are you looking for recommendations on places to visit, food to try, or travel logistics?"},
        {"role": "user", "content": "I'm mostly interested in traditional temples and shrines in Kyoto"},
        {"role": "assistant", "content": "Kyoto is the heart of traditional Japan with over 2,000 temples and shrines. Some must-visits include Fushimi Inari Taisha with its thousands of vermillion torii gates, Kinkaku-ji (Golden Pavilion), and Arashiyama Bamboo Grove. The best time to explore is early morning to avoid crowds."},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Tell me some latest news in detail of Germany."}
            ]
        }
    ],
    "stream": True
}

print(f"POST {URL}")
print(f"stream=true\n")

t0 = time.perf_counter()
first_byte = None
full_content = ""
chunk_count = 0

with requests.post(URL, json=payload, stream=True, timeout=120) as r:
    print(f"Status: {r.status_code}")
    print(f"Content-Type: {r.headers.get('Content-Type')}\n")

    for line in r.iter_lines(decode_unicode=True):
        if not line:
            continue

        now = time.perf_counter()
        if first_byte is None:
            first_byte = now
            print(f"[TTFB: {first_byte - t0:.3f}s]\n")

        if not line.startswith("data: "):
            continue

        data_str = line[6:]
        if data_str.strip() == "[DONE]":
            print(f"\n[DONE] at {now - t0:.3f}s")
            break

        try:
            obj = json.loads(data_str)
            choices = obj.get("choices", [])
            if not choices:
                continue
            delta = choices[0].get("delta", {})
            content = delta.get("content", "")
            finish = choices[0].get("finish_reason")
            event_type = obj.get("event_type", "")

            if content:
                full_content += content
                chunk_count += 1
                # Print first few chunks with timing, then just dots
                if chunk_count <= 5:
                    print(f"  [{now - t0:6.3f}s] chunk {chunk_count}: {content[:80]!r}")
                elif chunk_count % 20 == 0:
                    print(f"  [{now - t0:6.3f}s] ... {chunk_count} chunks so far")

            if event_type and event_type != "RESPONSE":
                print(f"  [{now - t0:6.3f}s] EVENT: {event_type} | {content[:60]}")

            if finish:
                print(f"  [{now - t0:6.3f}s] finish_reason={finish}")
        except json.JSONDecodeError:
            pass

total = time.perf_counter() - t0
print(f"\n--- summary ---")
print(f"Total time:    {total:.3f}s")
print(f"TTFB:          {(first_byte - t0):.3f}s" if first_byte else "No data")
print(f"Content chunks: {chunk_count}")
print(f"Content length: {len(full_content)} chars")
print(f"\n--- full response ---\n{full_content}")
