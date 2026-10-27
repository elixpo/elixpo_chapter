#!/usr/bin/env python3
"""Run Search's real skill-scoped AgentRunner from a hard-coded Python prompt."""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIXSEARCH = ROOT / "lixsearch"
if str(LIXSEARCH) not in sys.path:
    sys.path.insert(0, str(LIXSEARCH))

from agentRuntime import AgentRunner
from agentRuntime.runner import response_content

DEFAULT_PROMPT = "Write a Python function that validates URLs"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent", default="coding", help="coding, writing, web-search, auto, etc.")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--effort", choices=("low", "medium", "high"), default="low")
    parser.add_argument("--live", action="store_true", help="Perform a Pollinations request")
    parser.add_argument("--stream", action="store_true", help="Print streamed text deltas")
    return parser.parse_args()


async def run(args: argparse.Namespace) -> None:
    runner = AgentRunner()
    prepared = runner.prepare(args.agent, args.prompt)
    print(json.dumps({
        "agent": prepared.agent,
        "role": prepared.role,
        "model": prepared.model,
        "skills": prepared.skills,
        "tools": [tool["function"]["name"] for tool in prepared.tools],
        "prompt": prepared.messages[-1]["content"],
    }, indent=2))
    if not args.live:
        print("dry-run=ok (add --live to call OreoFlow/Pollinations)")
        return
    if args.stream:
        async for event in runner.stream(args.agent, args.prompt, effort=args.effort):
            if event["type"] == "delta":
                print(event["content"], end="", flush=True)
            elif event["type"] == "done":
                print("\n" + json.dumps(event["result"]["response"]["usage"], indent=2))
        return
    result = await runner.run(args.agent, args.prompt, effort=args.effort)
    print(response_content(result))
    print(json.dumps(result["response"]["usage"], indent=2))


def main() -> None:
    asyncio.run(run(parse_args()))


if __name__ == "__main__":
    main()
