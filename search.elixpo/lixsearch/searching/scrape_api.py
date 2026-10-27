"""Request handling for the Firecrawl-compatible API, shared by HTTP and MCP.

Each ``do_*`` function validates a Firecrawl-shaped request body and returns
the Firecrawl-shaped response body. Validation problems raise ``ValueError``
(HTTP 400), SSRF rejections raise ``UnsafeURLError`` (a ValueError, HTTP 400)
and upstream failures raise ``ScrapeError`` carrying their own status.
"""
from __future__ import annotations

import asyncio
from typing import Any, Optional

from commons.url_safety import check_public_url
from pipeline.config import (
    SCRAPE_BATCH_MAX_URLS,
    SCRAPE_CRAWL_DEFAULT_LIMIT,
    SCRAPE_CRAWL_DEFAULT_MAX_DEPTH,
    SCRAPE_CRAWL_MAX_DEPTH,
    SCRAPE_CRAWL_MAX_LIMIT,
    SCRAPE_CRAWL_MAX_PATTERNS,
    SCRAPE_EXTRACT_TIMEOUT_SECONDS,
    SCRAPE_MAP_DEFAULT_LIMIT,
    SCRAPE_MAP_MAX_LIMIT,
    SCRAPE_SEARCH_DEFAULT_LIMIT,
    SCRAPE_SEARCH_MAX_LIMIT,
    SCRAPE_SEARCH_TIMEOUT_SECONDS,
)
from searching import scrape, scrape_jobs
from searching.scrape import ScrapeError, bounded_int, optional_bool, parse_scrape_options, require_url


def _body(body: Any) -> dict:
    if not isinstance(body, dict):
        raise ValueError("Request body must be a JSON object")
    return body


async def do_scrape(body: Any) -> dict:
    body = _body(body)
    url = require_url(body.get("url"))
    options = parse_scrape_options(body)
    return {"success": True, "data": await scrape.scrape_url(url, options)}


async def do_search(body: Any) -> dict:
    body = _body(body)
    query = body.get("query")
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query must be a non-empty string")
    if len(query) > 1000:
        raise ValueError("query exceeds 1000 characters")
    limit = bounded_int(body.get("limit"), "limit", SCRAPE_SEARCH_DEFAULT_LIMIT, 1, SCRAPE_SEARCH_MAX_LIMIT)
    raw_options = body.get("scrapeOptions")
    options = parse_scrape_options(raw_options, default_formats=()) if raw_options is not None else None
    if options is not None and not options.formats:
        options = None
    try:
        data = await asyncio.wait_for(scrape.search(query.strip(), limit, options), SCRAPE_SEARCH_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as exc:
        raise ScrapeError("Search timed out", 408) from exc
    return {"success": True, "data": data}


async def do_map(body: Any) -> dict:
    body = _body(body)
    url = require_url(body.get("url"))
    search = body.get("search")
    if search is not None and not isinstance(search, str):
        raise ValueError("search must be a string")
    limit = bounded_int(body.get("limit"), "limit", SCRAPE_MAP_DEFAULT_LIMIT, 1, SCRAPE_MAP_MAX_LIMIT)
    include_subdomains = optional_bool(body.get("includeSubdomains"), "includeSubdomains", False)
    links = await scrape.map_site(url, search or None, limit, include_subdomains)
    return {"success": True, "links": links}


async def do_crawl(body: Any, base_url: str = "") -> dict:
    body = _body(body)
    url = require_url(body.get("url"))
    limit = bounded_int(body.get("limit"), "limit", SCRAPE_CRAWL_DEFAULT_LIMIT, 1, SCRAPE_CRAWL_MAX_LIMIT)
    max_depth = bounded_int(body.get("maxDepth"), "maxDepth", SCRAPE_CRAWL_DEFAULT_MAX_DEPTH, 0, SCRAPE_CRAWL_MAX_DEPTH)
    include = scrape_jobs.compile_patterns(body.get("includePaths"), "includePaths", SCRAPE_CRAWL_MAX_PATTERNS)
    exclude = scrape_jobs.compile_patterns(body.get("excludePaths"), "excludePaths", SCRAPE_CRAWL_MAX_PATTERNS)
    options = parse_scrape_options(body.get("scrapeOptions"))
    # Full DNS-level SSRF check up front so obviously bad targets fail fast.
    await asyncio.to_thread(check_public_url, url)
    job_id = scrape_jobs.start_crawl(url, limit=limit, max_depth=max_depth, include_paths=include,
                                     exclude_paths=exclude, options=options)
    return {"success": True, "id": job_id, "url": f"{base_url}/v1/crawl/{job_id}"}


async def do_batch(body: Any, base_url: str = "") -> dict:
    body = _body(body)
    urls = body.get("urls")
    if not isinstance(urls, list) or not urls:
        raise ValueError("urls must be a non-empty array")
    if len(urls) > SCRAPE_BATCH_MAX_URLS:
        raise ValueError(f"urls may contain at most {SCRAPE_BATCH_MAX_URLS} entries")
    clean = list(dict.fromkeys(require_url(u, "urls[]") for u in urls))
    options = parse_scrape_options(body)
    job_id = scrape_jobs.start_batch(clean, options)
    return {"success": True, "id": job_id, "url": f"{base_url}/v1/batch/scrape/{job_id}"}


def job_status(job_id: str, kind: str, skip: int = 0, base_url: Optional[str] = None) -> Optional[dict]:
    path = "crawl" if kind == "crawl" else "batch/scrape"
    next_base = f"{base_url}/v1/{path}/{job_id}" if base_url is not None else None
    return scrape_jobs.job_status(job_id, kind, skip=max(0, skip), next_base=next_base)


def cancel(job_id: str, kind: str) -> bool:
    return scrape_jobs.cancel_job(job_id, kind)


async def do_extract(body: Any) -> dict:
    body = _body(body)
    urls, prompt, schema = scrape.parse_extract_request(body)
    try:
        data = await asyncio.wait_for(scrape.extract_from_urls(urls, prompt, schema), SCRAPE_EXTRACT_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as exc:
        raise ScrapeError("Extraction timed out", 408) from exc
    return {"success": True, "data": data}
