import json
import os
import sys
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lixsearch"))

from mcpServer.asgi import MCPMount
from mcpServer.server import _bounded_integer, _clean_query, _sources, build_mcp_server
import mcpServer.server as mcp_server_module
from searching.evidence import FetchedPage, SearchResult


async def _fallback(scope, receive, send):
    await send({"type": "http.response.start", "status": 404, "headers": []})
    await send({"type": "http.response.body", "body": b""})


def _sse_payload(response: httpx.Response) -> dict:
    data = next(line[6:] for line in response.text.splitlines() if line.startswith("data: "))
    return json.loads(data)


@pytest.mark.asyncio
async def test_health_is_public_and_auth_is_required(monkeypatch):
    monkeypatch.setenv("API_KEY", "mcp-test-secret")
    server = build_mcp_server()
    app = MCPMount(_fallback, server.streamable_http_app())
    async with server.session_manager.run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="https://search.elixpo.com"
        ) as client:
            health = await client.get("/mcp/health")
            assert health.status_code == 200
            assert health.json()["stateless"] is True

            missing = await client.post("/mcp", json={})
            assert missing.status_code == 401
            assert missing.headers["www-authenticate"] == 'Bearer realm="oreolook-mcp"'

            invalid = await client.post(
                "/mcp", json={}, headers={"Authorization": "Bearer wrong"}
            )
            assert invalid.status_code == 403


@pytest.mark.asyncio
async def test_stateless_initialize_and_tool_catalog(monkeypatch):
    monkeypatch.setenv("API_KEY", "mcp-test-secret")
    server = build_mcp_server()
    app = MCPMount(_fallback, server.streamable_http_app())
    headers = {
        "Authorization": "Bearer mcp-test-secret",
        "Accept": "application/json, text/event-stream",
    }
    async with server.session_manager.run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="https://search.elixpo.com"
        ) as client:
            initialized = await client.post(
                "/mcp",
                headers=headers,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-11-25",
                        "capabilities": {},
                        "clientInfo": {"name": "pytest", "version": "1"},
                    },
                },
            )
            assert initialized.status_code == 200
            assert initialized.headers.get("mcp-session-id") is None
            assert _sse_payload(initialized)["result"]["serverInfo"]["name"] == "oreolook-mcp"

            listed = await client.post(
                "/mcp",
                headers={**headers, "MCP-Protocol-Version": "2025-11-25"},
                json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
            )
            names = {tool["name"] for tool in _sse_payload(listed)["result"]["tools"]}
            assert names == {"search_web", "fetch_pages", "research_web", "deep_research", "export_research_pdf"}
            assert listed.headers.get("mcp-session-id") is None


def test_input_and_source_bounds():
    assert _clean_query("  current weather  ") == "current weather"
    with pytest.raises(ValueError, match="must not be empty"):
        _clean_query("  ")
    with pytest.raises(ValueError, match="between 1 and 4"):
        _bounded_integer(5, name="max_sources", minimum=1, maximum=4)
    assert _sources("[A](https://a.test/x) and https://b.test/y.", 1) == ["https://a.test/x"]



async def _call_tool(client, headers, request_id, name, arguments):
    response = await client.post(
        "/mcp",
        headers={**headers, "MCP-Protocol-Version": "2025-11-25"},
        json={"jsonrpc": "2.0", "id": request_id, "method": "tools/call", "params": {"name": name, "arguments": arguments}},
    )
    assert response.status_code == 200
    return _sse_payload(response)["result"]


@pytest.mark.asyncio
async def test_research_tools_return_bounded_structured_results(monkeypatch):
    monkeypatch.setenv("API_KEY", "mcp-test-secret")

    async def quick(_query):
        return "Answer [A](https://a.test/page) and [B](https://b.test/page)."

    async def deep(_query):
        return "Deep answer [A](https://a.test/page), [B](https://b.test/page), and https://c.test/page."

    async def evidence(_query, limit):
        return [SearchResult(title="A", url="https://a.test/page", highlights=["Evidence A"])]

    monkeypatch.setattr(mcp_server_module, "_quick_research", quick)
    monkeypatch.setattr(mcp_server_module, "_deep_research", deep)
    monkeypatch.setattr(mcp_server_module, "_search_evidence", evidence)
    server = build_mcp_server()
    app = MCPMount(_fallback, server.streamable_http_app())
    headers = {"Authorization": "Bearer mcp-test-secret", "Accept": "application/json, text/event-stream"}
    async with server.session_manager.run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://search.elixpo.com") as client:
            quick_result = await _call_tool(client, headers, 3, "research_web", {"query": "test", "max_sources": 1})
            assert quick_result["structuredContent"]["depth"] == "research"
            assert quick_result["structuredContent"]["sources"] == ["https://a.test/page"]
            assert quick_result["structuredContent"]["citations"][0]["title"] == "A"

            deep_result = await _call_tool(client, headers, 4, "deep_research", {"query": "test", "max_sources": 2})
            assert deep_result["structuredContent"]["depth"] == "deep"
            assert len(deep_result["structuredContent"]["sources"]) == 2


@pytest.mark.asyncio
async def test_pdf_tool_returns_native_resource_link(monkeypatch):
    monkeypatch.setenv("API_KEY", "mcp-test-secret")

    async def pdf(_content, title=None):
        return "https://search.elixpo.com/api/content/test.pdf"

    monkeypatch.setattr(mcp_server_module, "create_pdf_from_content", pdf)
    server = build_mcp_server()
    app = MCPMount(_fallback, server.streamable_http_app())
    headers = {"Authorization": "Bearer mcp-test-secret", "Accept": "application/json, text/event-stream"}
    async with server.session_manager.run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://search.elixpo.com") as client:
            result = await _call_tool(client, headers, 5, "export_research_pdf", {"content": "# Completed research", "title": "Test"})
            assert result["structuredContent"]["mime_type"] == "application/pdf"
            links = [item for item in result["content"] if item["type"] == "resource_link"]
            assert links[0]["uri"].endswith("/test.pdf")


@pytest.mark.asyncio
async def test_search_and_fetch_tools_return_structured_evidence(monkeypatch):
    monkeypatch.setenv("API_KEY", "mcp-test-secret")

    async def search(*args, **kwargs):
        return [SearchResult(title="Result", url="https://a.test/page", rank=1)]

    async def fetch(*args, **kwargs):
        return [FetchedPage(url="https://a.test/page", canonical_url="https://a.test/page", title="Result", text="Useful evidence", status="ok")]

    monkeypatch.setattr(mcp_server_module, "structured_search", search)
    monkeypatch.setattr(mcp_server_module, "fetch_evidence_pages", fetch)
    server = build_mcp_server()
    app = MCPMount(_fallback, server.streamable_http_app())
    headers = {"Authorization": "Bearer mcp-test-secret", "Accept": "application/json, text/event-stream"}
    async with server.session_manager.run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://search.elixpo.com") as client:
            searched = await _call_tool(client, headers, 6, "search_web", {"query": "test", "num_results": 3})
            assert searched["structuredContent"]["results"][0]["title"] == "Result"
            fetched = await _call_tool(client, headers, 7, "fetch_pages", {"urls": ["https://a.test/page"]})
            assert fetched["structuredContent"]["successful"] == 1
            assert fetched["structuredContent"]["pages"][0]["text"] == "Useful evidence"
