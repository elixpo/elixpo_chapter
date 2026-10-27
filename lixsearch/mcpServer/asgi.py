"""ASGI mount and bearer authentication for the OreoLook MCP server."""

from __future__ import annotations

import hmac
import json
import os
from collections.abc import Awaitable, Callable
from typing import Any

ASGIApp = Callable[[dict[str, Any], Callable[..., Awaitable[Any]], Callable[..., Awaitable[Any]]], Awaitable[None]]


async def _json_response(send, status: int, body: dict[str, Any], headers: list[tuple[bytes, bytes]] | None = None):
    payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
    response_headers = [(b"content-type", b"application/json"), (b"content-length", str(len(payload)).encode("ascii"))]
    response_headers.extend(headers or [])
    await send({"type": "http.response.start", "status": status, "headers": response_headers})
    await send({"type": "http.response.body", "body": payload})


def _header(scope: dict[str, Any], name: bytes) -> str:
    for key, value in scope.get("headers", []):
        if key.lower() == name:
            return value.decode("latin-1")
    return ""


class MCPMount:
    """Dispatch `/mcp` directly to the SDK app while preserving Quart elsewhere."""

    def __init__(self, primary: ASGIApp, mcp_app: ASGIApp) -> None:
        self.primary = primary
        self.mcp_app = mcp_app

    async def __call__(self, scope, receive, send) -> None:
        if scope.get("type") != "http":
            await self.primary(scope, receive, send)
            return
        path = scope.get("path", "")
        if path != "/mcp" and not path.startswith("/mcp/"):
            await self.primary(scope, receive, send)
            return

        child_path = path[4:] or "/"
        if child_path != "/health":
            expected = os.getenv("MCP_API_KEY") or os.getenv("API_KEY", "")
            authorization = _header(scope, b"authorization")
            token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
            if not expected:
                await _json_response(send, 503, {"error": "MCP authentication is not configured"})
                return
            if not token:
                await _json_response(send, 401, {"error": "unauthorized", "message": "Send an API key as a bearer token."}, [(b"www-authenticate", b'Bearer realm="oreolook-mcp"')])
                return
            if not hmac.compare_digest(token, expected):
                await _json_response(send, 403, {"error": "forbidden", "message": "Invalid API key."})
                return

        child_scope = dict(scope)
        child_scope["path"] = child_path
        child_scope["raw_path"] = child_path.encode("utf-8")
        child_scope["root_path"] = f"{scope.get('root_path', '')}/mcp"
        await self.mcp_app(child_scope, receive, send)
