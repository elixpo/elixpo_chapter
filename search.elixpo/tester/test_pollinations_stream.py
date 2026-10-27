import requests
import time

URL = (
    "https://gen.pollinations.ai/text/stream%20me%20some%20random%20text"
    "?model=gemini-fast&stream=true"
    "&key=sk_5BhR9xkLDsfzwwW4u5UiSAaWjTnzDTR6Dr81r0LYlq3wnUddj4Ftx1GHUQqaDD3B"
)

print(f"GET {URL[:100]}...\n")

t0 = time.perf_counter()
first_byte = None
chunks = []

with requests.get(URL, stream=True, timeout=30) as r:
    print(f"Status: {r.status_code}")
    print(f"Content-Type: {r.headers.get('Content-Type')}")
    print(f"Transfer-Encoding: {r.headers.get('Transfer-Encoding', 'N/A')}")
    print(f"--- chunks ---")

    for chunk in r.iter_content(chunk_size=None):
        now = time.perf_counter()
        if first_byte is None:
            first_byte = now
            print(f"[TTFB: {first_byte - t0:.3f}s]")

        text = chunk.decode("utf-8", errors="replace")
        elapsed = now - t0
        chunks.append((elapsed, len(text), text[:80]))
        print(f"  [{elapsed:6.3f}s] +{len(text):4d}B  {text[:80]!r}")

total = time.perf_counter() - t0
print(f"\n--- summary ---")
print(f"Total chunks: {len(chunks)}")
print(f"Total time:   {total:.3f}s")
print(f"TTFB:         {first_byte - t0:.3f}s" if first_byte else "No data received")

if len(chunks) >= 2:
    gaps = []
    for i in range(1, len(chunks)):
        gaps.append(chunks[i][0] - chunks[i-1][0])
    avg_gap = sum(gaps) / len(gaps)
    print(f"Avg gap between chunks: {avg_gap:.3f}s")
    if avg_gap < 0.01 and total > 0.5:
        print("VERDICT: Likely FAKE streaming (all chunks arrived at once)")
    elif avg_gap > 0.02:
        print("VERDICT: REAL streaming (chunks arrive progressively)")
    else:
        print("VERDICT: Inconclusive")
else:
    print("VERDICT: Only 1 chunk — not streaming")
