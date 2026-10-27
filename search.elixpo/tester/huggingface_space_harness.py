"""Verify that the deployed OreoLook Space preserves live chat streaming."""
from __future__ import annotations

import argparse
from typing import Any, Mapping

import requests


DEFAULT_SPACE_URL = "https://elixpo-oreolook.hf.space"


class SpaceStreamingContractError(RuntimeError):
    """Raised when the deployed Gradio graph would buffer or replace chat UI."""


def _component_id(config: Mapping[str, Any], elem_id: str) -> int:
    for component in config.get("components", []):
        if (component.get("props") or {}).get("elem_id") == elem_id:
            return int(component["id"])
    raise SpaceStreamingContractError(f"missing Gradio component #{elem_id}")


def validate_streaming_contract(config: Mapping[str, Any]) -> dict[str, Any]:
    """Validate the immediate-paint → streaming-generator dependency graph."""
    protocol = str(config.get("protocol") or "")
    if not protocol.startswith("sse"):
        raise SpaceStreamingContractError(f"expected SSE protocol, got {protocol!r}")

    send_id = _component_id(config, "research-send")
    chat_id = _component_id(config, "research-chat")
    dependencies = list(config.get("dependencies") or [])
    stages = [
        item
        for item in dependencies
        if [send_id, "click"] in (item.get("targets") or [])
    ]
    if len(stages) != 1:
        raise SpaceStreamingContractError("Send must have exactly one immediate stage")
    stage = stages[0]
    if stage.get("queue") is not False or (stage.get("types") or {}).get("generator"):
        raise SpaceStreamingContractError("Send stage must be unqueued and non-generating")
    if chat_id not in (stage.get("outputs") or []):
        raise SpaceStreamingContractError("Send stage must paint the chat immediately")

    streams = [
        item
        for item in dependencies
        if item.get("trigger_after") == stage.get("id")
    ]
    if len(streams) != 1:
        raise SpaceStreamingContractError("Send stage must chain one research stream")
    stream = streams[0]
    if stream.get("queue") is not True or not (stream.get("types") or {}).get("generator"):
        raise SpaceStreamingContractError("Research must be a queued generator")
    if chat_id not in (stream.get("outputs") or []):
        raise SpaceStreamingContractError("Research stream must update the same chat")
    cadence = float(stream.get("stream_every", 1.0))
    if cadence > 0.1:
        raise SpaceStreamingContractError(
            f"research repaint cadence regressed to {cadence:.3f}s"
        )
    return {
        "protocol": protocol,
        "stage_id": stage.get("id"),
        "stream_id": stream.get("id"),
        "stream_every": cadence,
    }


def inspect_space(space_url: str = DEFAULT_SPACE_URL, *, session=requests) -> dict[str, Any]:
    """Fetch and validate the live Space's public Gradio configuration."""
    response = session.get(f"{space_url.rstrip('/')}/config", timeout=(10.0, 20.0))
    response.raise_for_status()
    return validate_streaming_contract(response.json())


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check OreoLook's deployed Gradio streaming contract"
    )
    parser.add_argument("--space-url", default=DEFAULT_SPACE_URL)
    args = parser.parse_args()
    try:
        result = inspect_space(args.space_url)
    except (requests.RequestException, ValueError, SpaceStreamingContractError) as exc:
        print(f"FAIL: {exc}")
        return 1
    print(
        "PASS: immediate chat paint → SSE generator "
        f"({result['stream_every']:.3f}s cadence)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
