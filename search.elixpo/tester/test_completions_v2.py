"""
Test suite for /v1/chat/completions endpoint.
Covers: sessionless usage, multi-turn via messages array, image URL,
base64 image, streaming, and non-streaming modes.

Usage:
    python tester/test_completions_v2.py [--base-url URL]

Defaults to http://localhost (nginx) so it works right after deploy.
"""

import requests
import json
import time
import base64
import sys
import os
from pathlib import Path
from dotenv import dotenv_values

BASE_URL = "http://localhost"
ENDPOINT = "/v1/chat/completions"

# Allow override via CLI or env
if len(sys.argv) > 2 and sys.argv[1] == "--base-url":
    BASE_URL = sys.argv[2].rstrip("/")
elif os.getenv("TEST_BASE_URL"):
    BASE_URL = os.getenv("TEST_BASE_URL").rstrip("/")

URL = f"{BASE_URL}{ENDPOINT}"
TEST_IMAGE_URL = "https://thewildlylife.com/wp-content/uploads/2025/01/trocadero-steps-2-1-scaled.jpg"

# API key: from env, CLI, or default to none (port 80 internal server has no auth)
_ROOT = Path(__file__).resolve().parents[1]
_ENV = dotenv_values(_ROOT / ".env.local")
API_KEY = os.getenv("LIXSEARCH_API_KEY") or _ENV.get("API_KEY", "")
if len(sys.argv) > 2 and sys.argv[1] == "--api-key":
    API_KEY = sys.argv[2]
elif len(sys.argv) > 4 and sys.argv[3] == "--api-key":
    API_KEY = sys.argv[4]

# ── Helpers ──────────────────────────────────────────────────────

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
SKIP = "\033[93mSKIP\033[0m"
results = []


def report(name, ok, detail=""):
    tag = PASS if ok else FAIL
    results.append((name, ok))
    print(f"  [{tag}] {name}" + (f"  ({detail})" if detail else ""))


def _headers():
    h = {"Content-Type": "application/json"}
    if API_KEY:
        h["Authorization"] = f"Bearer {API_KEY}"
    return h


def post(payload, stream=False, timeout=120):
    return requests.post(URL, json=payload, headers=_headers(), stream=stream, timeout=timeout)


def collect_stream(resp):
    """Read an SSE stream, return (full_content, chunk_count, got_done, raw_lines)."""
    content = ""
    chunks = 0
    got_done = False
    raw = []
    for line in resp.iter_lines(decode_unicode=True):
        if not line:
            continue
        raw.append(line)
        if not line.startswith("data: "):
            continue
        data_str = line[6:]
        if data_str.strip() == "[DONE]":
            got_done = True
            break
        try:
            obj = json.loads(data_str)
            delta = obj.get("choices", [{}])[0].get("delta", {})
            c = delta.get("content", "")
            if c:
                content += c
                chunks += 1
        except json.JSONDecodeError:
            pass
    return content, chunks, got_done, raw


# ── 1. Simple text, no session, explicit non-streaming ─────────

def test_simple_text():
    print("\n1. Simple text query (no session, stream=false)")
    payload = {
        "messages": [{"role": "user", "content": "What is the capital of France?"}],
        "stream": False,
    }
    t0 = time.perf_counter()
    r = post(payload)
    elapsed = time.perf_counter() - t0

    report("status 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code != 200:
        print(f"    body: {r.text[:300]}")
        return

    data = r.json()
    report("has choices", bool(data.get("choices")))
    msg = data["choices"][0].get("message", {})
    content = msg.get("content", "")
    report("has content", len(content) > 20, f"{len(content)} chars")
    report("finish_reason=stop", data["choices"][0].get("finish_reason") == "stop")
    report("has usage", "usage" in data)
    report("object=chat.completion", data.get("object") == "chat.completion")
    print(f"    time: {elapsed:.2f}s | content preview: {content[:120]}...")


# ── 2. Multi-turn via messages array, no session ────────────────

def test_multi_turn():
    print("\n2. Multi-turn conversation (messages array, no session)")
    payload = {
        "messages": [
            {"role": "user", "content": "My name is Alice and I like cats."},
            {"role": "assistant", "content": "Nice to meet you, Alice! Cats are wonderful companions."},
            {"role": "user", "content": "What did I just tell you my name was?"},
        ],
        "stream": False,
    }
    r = post(payload)
    report("status 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code != 200:
        return

    content = r.json()["choices"][0]["message"]["content"]
    has_name = "alice" in content.lower()
    report("model recalls name from history", has_name, f"content mentions Alice: {has_name}")
    print(f"    response: {content[:200]}...")


# ── 3. Streaming ────────────────────────────────────────────────

def test_streaming():
    print("\n3. Streaming (stream=true)")
    payload = {
        "messages": [{"role": "user", "content": "List 3 interesting facts about the Moon."}],
        "stream": True,
    }
    t0 = time.perf_counter()
    with post(payload, stream=True) as r:
        report("status 200", r.status_code == 200, f"got {r.status_code}")
        ct = r.headers.get("Content-Type", "")
        report("content-type is event-stream", "text/event-stream" in ct, ct)

        content, chunks, got_done, raw = collect_stream(r)

    elapsed = time.perf_counter() - t0
    report("got content", len(content) > 30, f"{len(content)} chars in {chunks} chunks")
    report("got [DONE]", got_done)

    # Check no raw SSE leaked through (every data line should be valid JSON or [DONE])
    leaked = [l for l in raw if l.startswith("event:") and "data:" not in l]
    report("no raw SSE leaks", len(leaked) == 0, f"{len(leaked)} leaked lines")

    print(f"    time: {elapsed:.2f}s | chunks: {chunks} | preview: {content[:120]}...")


# ── 4. Image URL input ──────────────────────────────────────────

def test_image_url():
    print("\n4. Image input via URL")
    payload = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "What is in this image?"},
                    {"type": "image_url", "image_url": {"url": TEST_IMAGE_URL}},
                ],
            }
        ],
        "stream": False,
    }
    t0 = time.perf_counter()
    r = post(payload, timeout=180)
    elapsed = time.perf_counter() - t0

    report("status 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code != 200:
        print(f"    body: {r.text[:300]}")
        return

    content = r.json()["choices"][0]["message"]["content"]
    report("has content", len(content) > 20, f"{len(content)} chars")
    print(f"    time: {elapsed:.2f}s | preview: {content[:200]}...")


# ── 5. Base64 image input ───────────────────────────────────────

def test_image_base64():
    print("\n5. Image input via base64 data URI")

    # Download a real image and convert to base64
    img_url = TEST_IMAGE_URL  # same image used in other tests
    print(f"    Downloading {img_url} ...")
    img_resp = requests.get(img_url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
    img_resp.raise_for_status()
    b64_str = base64.b64encode(img_resp.content).decode()
    ct = img_resp.headers.get("Content-Type", "image/jpeg").split(";")[0]
    data_uri = f"data:{ct};base64,{b64_str}"
    print(f"    Base64 size: {len(b64_str)} chars ({ct})")

    payload = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe this image"},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ],
            }
        ],
        "stream": False,
    }

    t0 = time.perf_counter()
    r = post(payload, timeout=180)
    elapsed = time.perf_counter() - t0

    report("status 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code != 200:
        print(f"    body: {r.text[:300]}")
        return

    content = r.json()["choices"][0]["message"]["content"]
    report("has content", len(content) > 10, f"{len(content)} chars")
    # The image was tiny so the model might say it's too small / describe colors
    print(f"    time: {elapsed:.2f}s | preview: {content[:200]}...")


# ── 6. Image-only (no text query) ──────────────────────────────

def test_image_only():
    print("\n6. Image-only input (no text)")
    payload = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": TEST_IMAGE_URL}},
                ],
            }
        ],
        "stream": False,
    }
    t0 = time.perf_counter()
    r = post(payload, timeout=180)
    elapsed = time.perf_counter() - t0

    report("status 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code != 200:
        print(f"    body: {r.text[:300]}")
        return

    content = r.json()["choices"][0]["message"]["content"]
    report("has content", len(content) > 20, f"{len(content)} chars")
    print(f"    time: {elapsed:.2f}s | preview: {content[:200]}...")


# ── 7. Streaming with image URL ─────────────────────────────────

def test_streaming_with_image():
    print("\n7. Streaming + image URL")
    payload = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Briefly describe this image"},
                    {"type": "image_url", "image_url": {"url": TEST_IMAGE_URL}},
                ],
            }
        ],
        "stream": True,
    }
    t0 = time.perf_counter()
    with post(payload, stream=True, timeout=180) as r:
        report("status 200", r.status_code == 200, f"got {r.status_code}")
        content, chunks, got_done, raw = collect_stream(r)

    elapsed = time.perf_counter() - t0
    report("got content", len(content) > 10, f"{len(content)} chars in {chunks} chunks")
    report("got [DONE]", got_done)
    print(f"    time: {elapsed:.2f}s | preview: {content[:150]}...")


# ── 8. Error cases ──────────────────────────────────────────────

def test_errors():
    print("\n8. Error handling")

    # Empty messages
    r = post({"messages": []})
    report("empty messages → 400", r.status_code == 400)

    # No messages key
    r = post({"query": "hello"})
    report("missing messages → 400", r.status_code == 400)

    # No user message (only system)
    r = post({"messages": [{"role": "system", "content": "You are helpful"}]})
    report("no user message → 400", r.status_code == 400)


# ── 9. Keepalive during streaming (SSE stays alive) ─────────────

def test_keepalive():
    print("\n9. SSE keepalive (stream should not stall)")
    payload = {
        "messages": [{"role": "user", "content": "What are the latest developments in quantum computing?"}],
        "stream": True,
    }
    t0 = time.perf_counter()
    ttfb = None
    with post(payload, stream=True, timeout=120) as r:
        report("status 200", r.status_code == 200, f"got {r.status_code}")
        for line in r.iter_lines(decode_unicode=True):
            if line and line.startswith("data: "):
                ttfb = time.perf_counter() - t0
                break

    if ttfb:
        report("TTFB < 30s", ttfb < 30, f"{ttfb:.2f}s")
    else:
        report("TTFB < 30s", False, "no data received")


# ── Run all ──────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Testing {URL}")
    print("=" * 60)

    # Quick health check first
    try:
        hr = requests.get(f"{BASE_URL}/api/health", timeout=10)
        if hr.status_code != 200:
            print(f"Health check failed ({hr.status_code}). Is the service running?")
            sys.exit(1)
        print(f"Health: OK\n")
    except Exception as e:
        print(f"Cannot reach {BASE_URL}/api/health: {e}")
        sys.exit(1)

    test_simple_text()
    test_multi_turn()
    test_streaming()
    test_image_url()
    test_image_base64()
    test_image_only()
    test_streaming_with_image()
    test_errors()
    test_keepalive()

    # ── Summary ──
    print("\n" + "=" * 60)
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    failed = total - passed
    color = "\033[92m" if failed == 0 else "\033[91m"
    print(f"{color}{passed}/{total} checks passed\033[0m" + (f" ({failed} failed)" if failed else ""))
    sys.exit(0 if failed == 0 else 1)
