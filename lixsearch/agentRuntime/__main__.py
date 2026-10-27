from __future__ import annotations

import argparse
import asyncio
import json

from agentRuntime import AGENT_SPECS, AgentRunner
from agentRuntime.runner import response_content
from agentRuntime.state import ResponseStateStore, canonical_conversation_id, new_response_id


async def _run(args) -> dict:
    runner = AgentRunner()
    if not args.session_id:
        return await runner.run(args.agent, args.prompt)

    state = ResponseStateStore()
    conversation_id = canonical_conversation_id(args.session_id)
    conversation = state.get_conversation(conversation_id) or {}
    history = conversation.get("messages", [])
    result = await runner.run(args.agent, args.prompt, history=history)
    content = response_content(result)
    response_id = new_response_id()
    messages = [*history, {"role": "user", "content": args.prompt}, {"role": "assistant", "content": content}]
    state.save(
        response_id=response_id,
        conversation_id=conversation_id,
        previous_response_id=conversation.get("last_response_id"),
        messages=messages,
        model=result["model"],
        agent=result["agent"],
    )
    return {**result, "response_id": response_id, "conversation_id": conversation_id}


def main() -> int:
    parser = argparse.ArgumentParser(description="Run one skill-scoped lixSearch agent through OreoFlow")
    parser.add_argument("--agent", choices=("auto", *AGENT_SPECS), default="auto")
    parser.add_argument("--prompt", required=True, help="Literal user prompt")
    parser.add_argument("--session-id", help="CLI alias mapped deterministically to an OpenAI conv_* ID")
    parser.add_argument("--dry-run", action="store_true", help="Print routing/model/tools without calling Pollinations")
    args = parser.parse_args()

    runner = AgentRunner()
    if args.dry_run:
        print(json.dumps(runner.prepare(args.agent, args.prompt).to_dict(), indent=2))
        return 0
    print(json.dumps(asyncio.run(_run(args)), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
