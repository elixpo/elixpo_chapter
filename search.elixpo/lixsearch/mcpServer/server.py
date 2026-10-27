"""Stateless MCP tools backed by the existing OreoLook research pipeline."""

from __future__ import annotations

import asyncio
import os
import re
import time
from collections.abc import Callable
from typing import Any

from mcp.server.fastmcp import Context, FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import CallToolResult, ResourceLink, TextContent
from starlette.requests import Request
from starlette.responses import JSONResponse

from functionCalls.generatePDF import create_pdf_from_content
from pipeline.deep_search import _run_deep_search_pipeline
from pipeline.lixsearch import run_elixposearch_pipeline
from searching.citations import normalize_citations
from searching.evidence import fetch_pages as fetch_evidence_pages
from searching.evidence import structured_search

_URL_RE = re.compile(r"https?://[^\s<>\]\)\"']+")
_TASK_RE = re.compile(r"<TASK>.*?</TASK>", re.IGNORECASE | re.DOTALL)

MCP_QUERY_MAX_CHARS = int(os.getenv("MCP_QUERY_MAX_CHARS", "4000"))
MCP_RESULT_MAX_CHARS = int(os.getenv("MCP_RESULT_MAX_CHARS", "60000"))
MCP_PDF_MAX_CHARS = int(os.getenv("MCP_PDF_MAX_CHARS", "80000"))
MCP_RESEARCH_TIMEOUT_SECONDS = float(os.getenv("MCP_RESEARCH_TIMEOUT_SECONDS", "90"))
MCP_DEEP_RESEARCH_TIMEOUT_SECONDS = float(os.getenv("MCP_DEEP_RESEARCH_TIMEOUT_SECONDS", "240"))
MCP_MAX_CONCURRENCY = int(os.getenv("MCP_MAX_CONCURRENCY", "4"))

_research_slots = asyncio.Semaphore(max(1, MCP_MAX_CONCURRENCY))


def _clean_query(query: str) -> str:
    value = (query or "").strip()
    if not value:
        raise ValueError("query must not be empty")
    if len(value) > MCP_QUERY_MAX_CHARS:
        raise ValueError(f"query exceeds {MCP_QUERY_MAX_CHARS} characters")
    return value


def _bounded_integer(value: int, *, name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} must be an integer")
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


def _clean_result(chunks: list[str]) -> str:
    text = "\n\n".join(part.strip() for part in chunks if part and part.strip())
    text = _TASK_RE.sub("", text).strip()
    if not text:
        raise RuntimeError("OreoLook returned no research content")
    return text[:MCP_RESULT_MAX_CHARS]


def _sources(text: str, limit: int) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for match in _URL_RE.findall(text):
        url = match.rstrip(".,;:")
        if url not in seen:
            seen.add(url)
            found.append(url)
        if len(found) >= limit:
            break
    return found


async def _quick_research(query: str) -> str:
    prompt = (
        "Research this request using live web sources. Search first, read the best "
        "sources, synthesize the answer, and cite concrete claims. Do not answer only "
        f"from prior knowledge.\n\nRequest: {query}"
    )
    chunks: list[str] = []
    async for chunk in run_elixposearch_pipeline(
        user_query=prompt,
        user_image="",
        event_id=None,
        session_id=None,
        user_images=[],
        chat_history=None,
        is_ephemeral=True,
    ):
        if isinstance(chunk, bytes):
            chunk = chunk.decode("utf-8", errors="replace")
        if isinstance(chunk, str):
            chunks.append(chunk)
    return _clean_result(chunks)


async def _deep_research(query: str) -> str:
    chunks: list[str] = []

    def emit_event(_event_type: str, _message: str):
        return None

    async for chunk in _run_deep_search_pipeline(
        user_query=query,
        user_image="",
        event_id=None,
        session_id=None,
        emit_event=emit_event,
    ):
        if isinstance(chunk, bytes):
            chunk = chunk.decode("utf-8", errors="replace")
        if isinstance(chunk, str):
            chunks.append(chunk)
    return _clean_result(chunks)


async def _maybe_pdf(answer: str, title: str | None, include_pdf: bool) -> str | None:
    if not include_pdf:
        return None
    return await create_pdf_from_content(answer[:MCP_PDF_MAX_CHARS], title=title)


async def _search_evidence(query: str, limit: int):
    try:
        return await structured_search(query, num_results=limit, include_highlights=True)
    except Exception:
        return []


def _research_result(
    answer: str, evidence: list[Any], depth: str, limit: int, started: float
) -> dict[str, Any]:
    citations = normalize_citations(answer, evidence, limit)
    source_urls = [citation.url for citation in citations] or _sources(answer, limit)
    return {
        "answer": answer,
        "sources": source_urls,
        "citations": [citation.to_dict() for citation in citations],
        "evidence": [item.to_dict() for item in evidence[:limit]],
        "depth": depth,
        "duration_ms": round((time.monotonic() - started) * 1000),
    }


def build_mcp_server(is_ready: Callable[[], bool] | None = None) -> FastMCP:
    """Build one MCP server per app replica; every tool call remains stateless."""
    ready = is_ready or (lambda: True)
    allowed_hosts = [
        item.strip()
        for item in os.getenv(
            "MCP_ALLOWED_HOSTS",
            "search.elixpo.com,search.elixpo.com:*,localhost,localhost:*,127.0.0.1,127.0.0.1:*",
        ).split(",")
        if item.strip()
    ]
    allowed_origins = [
        item.strip()
        for item in os.getenv("MCP_ALLOWED_ORIGINS", "https://search.elixpo.com").split(",")
        if item.strip()
    ]
    server = FastMCP(
        "oreolook-mcp",
        instructions=(
            "Use search_web for structured discovery and fetch_pages to read known URLs. "
            "Use research_web for focused synthesis and deep_research for multi-angle investigations. "
            "Use export_research_pdf only for content already available in the conversation."
        ),
        website_url="https://search.elixpo.com",
        streamable_http_path="/",
        stateless_http=True,
        json_response=False,
        max_request_body_size=256 * 1024,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=allowed_hosts,
            allowed_origins=allowed_origins,
        ),
    )

    @server.custom_route("/health", methods=["GET"])
    async def health(_request: Request):
        healthy = bool(ready())
        return JSONResponse(
            {
                "name": "oreolook-mcp",
                "transport": "streamable-http",
                "stateless": True,
                "ready": healthy,
                "tools": ["search_web", "fetch_pages", "research_web", "deep_research", "export_research_pdf"],
            },
            status_code=200 if healthy else 503,
        )

    @server.tool(
        name="search_web",
        description="Search the live web and return bounded structured results. Use research_web when you need a synthesized answer.",
        structured_output=True,
    )
    async def search_web(
        query: str,
        num_results: int = 5,
        freshness: str | None = None,
        include_domains: list[str] | None = None,
        exclude_domains: list[str] | None = None,
        include_highlights: bool = True,
    ) -> dict[str, Any]:
        async with _research_slots:
            async with asyncio.timeout(MCP_RESEARCH_TIMEOUT_SECONDS):
                results = await structured_search(
                    query,
                    num_results=num_results,
                    freshness=freshness,
                    include_domains=include_domains,
                    exclude_domains=exclude_domains,
                    include_highlights=include_highlights,
                )
        return {"query": query, "count": len(results), "results": [item.to_dict() for item in results]}

    @server.tool(
        name="fetch_pages",
        description="Fetch up to eight public HTTPS pages as clean structured text. Redirects and private network targets are blocked.",
        structured_output=True,
    )
    async def fetch_pages(
        urls: list[str], max_characters: int = 8_000, max_concurrency: int = 4,
        browser_fallback: bool = False,
    ) -> dict[str, Any]:
        async with _research_slots:
            async with asyncio.timeout(MCP_RESEARCH_TIMEOUT_SECONDS):
                pages = await fetch_evidence_pages(
                    urls,
                    max_characters=max_characters,
                    max_concurrency=max_concurrency,
                    browser_fallback=browser_fallback,
                )
        return {
            "count": len(pages),
            "successful": sum(page.status == "ok" for page in pages),
            "pages": [page.to_dict() for page in pages],
        }

    @server.tool(name="research_web", description="Research a focused question using live web sources and return a concise synthesized answer with normalized citations and evidence.", structured_output=True)
    async def research_web(query: str, ctx: Context, max_sources: int = 4, include_pdf: bool = False, title: str | None = None) -> dict[str, Any]:
        query = _clean_query(query)
        max_sources = _bounded_integer(max_sources, name="max_sources", minimum=1, maximum=4)
        started = time.monotonic()
        await ctx.report_progress(0, 2, "Searching and reading sources")
        async with _research_slots:
            async with asyncio.timeout(MCP_RESEARCH_TIMEOUT_SECONDS):
                answer, evidence = await asyncio.gather(
                    _quick_research(query), _search_evidence(query, max_sources)
                )
        await ctx.report_progress(1, 2, "Synthesizing cited answer")
        pdf_url = await _maybe_pdf(answer, title, include_pdf)
        await ctx.report_progress(2, 2, "Complete")
        result = _research_result(answer, evidence, "research", max_sources, started)
        if pdf_url:
            result["pdf_url"] = pdf_url
        return result

    @server.tool(name="deep_research", description="Run a bounded multi-angle investigation in parallel and return detailed findings with normalized citations and evidence.", structured_output=True)
    async def deep_research(query: str, ctx: Context, max_sources: int = 8, include_pdf: bool = False, title: str | None = None) -> dict[str, Any]:
        query = _clean_query(query)
        max_sources = _bounded_integer(max_sources, name="max_sources", minimum=2, maximum=8)
        started = time.monotonic()
        await ctx.report_progress(0, 3, "Planning research threads")
        async with _research_slots:
            async with asyncio.timeout(MCP_DEEP_RESEARCH_TIMEOUT_SECONDS):
                answer, evidence = await asyncio.gather(
                    _deep_research(query), _search_evidence(query, max_sources)
                )
        await ctx.report_progress(2, 3, "Combining findings and citations")
        pdf_url = await _maybe_pdf(answer, title, include_pdf)
        await ctx.report_progress(3, 3, "Complete")
        result = _research_result(answer, evidence, "deep", max_sources, started)
        if pdf_url:
            result["pdf_url"] = pdf_url
        return result

    @server.tool(name="export_research_pdf", description="Export already-completed markdown research as a hosted OreoLook PDF resource link. Do not launch new research with this tool.")
    async def export_research_pdf(content: str, title: str | None = None) -> CallToolResult:
        value = (content or "").strip()
        if not value:
            raise ValueError("content must not be empty")
        if len(value) > MCP_PDF_MAX_CHARS:
            raise ValueError(f"content exceeds {MCP_PDF_MAX_CHARS} characters")
        if title is not None and len(title) > 160:
            raise ValueError("title exceeds 160 characters")
        url = await create_pdf_from_content(value, title=title)
        structured = {"url": url, "mime_type": "application/pdf", "expires_in_seconds": int(os.getenv("CONTENT_TTL_SECONDS", "604800"))}
        return CallToolResult(
            content=[
                TextContent(type="text", text=f"Research PDF ready: {url}"),
                ResourceLink(type="resource_link", name=title or "OreoLook research PDF", uri=url, mimeType="application/pdf"),
            ],
            structuredContent=structured,
        )

    return server
