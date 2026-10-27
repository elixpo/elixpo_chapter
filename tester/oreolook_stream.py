"""Stream OreoLook through its public Pollinations model listing.

Loads ``LIXSEARCH_TEST_TOKEN`` from the repository's ``.env.local`` file.
Task/status events are hidden by default; pass ``--show-tasks`` to display them.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Iterator

import requests
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_URL = "https://gen.pollinations.ai/v1/chat/completions"
DEFAULT_MODEL = "Circuit-Overtime/OreoLook"
TASK_RE = re.compile(r"<TASKS?>(.*?)</TASKS?>", re.IGNORECASE | re.DOTALL)


def iter_sse_data(response: requests.Response) -> Iterator[str]:
    """Yield complete data payloads from an SSE response."""
    data_lines: list[str] = []
    # Keep the manual harness honest: requests otherwise buffers up to 512
    # bytes and can make a healthy SSE stream look like one delayed response.
    for raw_line in response.iter_lines(chunk_size=1, decode_unicode=True):
        line = raw_line or ""
        if not line:
            if data_lines:
                yield "\n".join(data_lines)
                data_lines.clear()
            continue
        if line.startswith(":"):
            continue
        if line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
    if data_lines:
        yield "\n".join(data_lines)


def split_content(content: str, *, info_event: bool) -> tuple[list[str], str]:
    """Return task messages and user-facing content from one delta."""
    tasks = [match.strip() for match in TASK_RE.findall(content) if match.strip()]
    visible = TASK_RE.sub("", content)
    if info_event:
        return tasks, ""
    return tasks, visible


def stream_oreolook(
    prompt: str,
    *,
    show_tasks: bool = False,
    token: str,
    model: str = DEFAULT_MODEL,
    url: str = DEFAULT_URL,
    timeout: float = 120.0,
) -> str:
    payload = {
        "model": model,
        "stream": True,
        "messages": [{"role": "user", "content": prompt}],
    }
    headers = {
        "Accept": "text/event-stream",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    answer: list[str] = []

    with requests.post(
        url,
        json=payload,
        headers=headers,
        stream=True,
        timeout=(10, timeout),
    ) as response:
        if not response.ok:
            try:
                detail = response.json()
            except ValueError:
                detail = response.text[:1000]
            raise RuntimeError(f"OreoLook request failed ({response.status_code}): {detail}")

        for data in iter_sse_data(response):
            if data == "[DONE]":
                break
            try:
                event = json.loads(data)
            except json.JSONDecodeError:
                continue

            choices = event.get("choices") or []
            if not choices:
                continue
            content = (choices[0].get("delta") or {}).get("content") or ""
            tasks, visible = split_content(
                content,
                info_event=event.get("event_type") == "INFO",
            )
            if show_tasks:
                for task in tasks:
                    print(f"\n[TASK] {task}", file=sys.stderr, flush=True)
            if visible:
                answer.append(visible)
                print(visible, end="", flush=True)

    print(flush=True)
    return "".join(answer)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Stream the public OreoLook model via Pollinations")
    parser.add_argument("prompt", nargs="?", help="Question to ask; omitted to read from stdin")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument(
        "--show-tasks",
        action=argparse.BooleanOptionalAction,
        default=os.getenv("OREOLOOK_SHOW_TASKS", "false").lower() in {"1", "true", "yes", "on"},
        help="show OreoLook task/status events on stderr (default: false)",
    )
    return parser.parse_args()


def main() -> int:
    load_dotenv(ROOT / ".env.local")
    args = parse_args()
    token = os.getenv("LIXSEARCH_TEST_TOKEN", "").strip()
    if not token:
        print("LIXSEARCH_TEST_TOKEN is missing from .env.local", file=sys.stderr)
        return 2

    prompt = args.prompt or (input("Ask OreoLook: ") if sys.stdin.isatty() else sys.stdin.read().strip())
    if not prompt:
        print("A prompt is required", file=sys.stderr)
        return 2

    try:
        stream_oreolook(
            prompt,
            show_tasks=args.show_tasks,
            token=token,
            model=args.model,
            url=args.url,
        )
    except (requests.RequestException, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
