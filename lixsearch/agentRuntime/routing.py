"""Model-driven routing entry point."""

from __future__ import annotations


def route_request(prompt: str) -> str:
    """Route every automatic request through the bounded decision agent."""
    del prompt
    return "decision"
