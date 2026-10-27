"""Firecrawl-compatible scraping core: scrape, search, map and extract.

Implemented from lixSearch's own public API contract. Fetching reuses the
realistic-header HTTP path from ``searching.fetch_full_text``; JS rendering and
screenshots go through the shared Playwright pool in the ipc-service; search
reuses the existing ``web_search`` IPC path; JSON extraction reuses the
Pollinations chat-completions call with ``LLM_MODEL`` -> ``LLM_MODEL_FALLBACK``.
Every user-supplied URL, redirect hop and browser subrequest goes through the
SSRF guard in ``commons.url_safety``.
"""
from __future__ import annotations

import asyncio
import json
import re
import xml.etree.ElementTree as ET
import zlib
from dataclasses import dataclass, field
from typing import Any, Optional
from urllib.parse import urldefrag, urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Comment, Doctype, NavigableString, Tag
from loguru import logger

from commons.url_safety import UnsafeURLError, check_public_url, guarded_session
from pipeline.config import (
    LLM_HTTP_TIMEOUT,
    LLM_MODEL,
    LLM_MODEL_FALLBACK,
    POLLINATIONS_ENDPOINT,
    SCRAPE_BROWSER_FALLBACK,
    SCRAPE_DEFAULT_TIMEOUT_MS,
    SCRAPE_EXTRACT_MAX_CONTEXT_CHARS,
    SCRAPE_EXTRACT_MAX_PROMPT_CHARS,
    SCRAPE_EXTRACT_MAX_URLS,
    SCRAPE_HTTP_TIMEOUT_SECONDS,
    SCRAPE_MAP_MAX_SITEMAPS,
    SCRAPE_MAX_LINKS_PER_PAGE,
    SCRAPE_MAX_MARKDOWN_CHARS,
    SCRAPE_MAX_REDIRECTS,
    SCRAPE_MAX_RESPONSE_BYTES,
    SCRAPE_MAX_TIMEOUT_MS,
    SCRAPE_MAX_URL_CHARS,
    SCRAPE_MAX_WAIT_FOR_MS,
    SCRAPE_SCREENSHOT_FULL_PAGE,
    SCRAPE_SEARCH_CONCURRENCY,
)
from searching.fetch_full_text import get_realistic_headers

SIMPLE_FORMATS = ("markdown", "html", "rawHtml", "links", "screenshot")
_HTML_TYPES = ("text/html", "application/xhtml+xml")
_GZIP_TYPES = ("application/gzip", "application/x-gzip", "application/octet-stream")
_TEXT_TYPES = ("text/plain", "text/markdown", "application/xml", "text/xml", "application/rss+xml", "application/atom+xml")
_FALLBACK_STATUSES = {403, 429, 503}
_CHARSET_RE = re.compile(rb"<meta[^>]+charset=[\"']?([A-Za-z0-9_\-]+)", re.I)


class ScrapeError(Exception):
    """A scrape failure that maps onto an HTTP status for the API layer."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


@dataclass
class RawPage:
    url: str
    status_code: Optional[int]
    html: str
    content_type: str = "text/html"
    screenshot: Optional[str] = None


@dataclass
class ScrapeOptions:
    formats: list[str] = field(default_factory=lambda: ["markdown"])
    only_main_content: bool = True
    wait_for: int = 0
    timeout_ms: int = SCRAPE_DEFAULT_TIMEOUT_MS
    full_page_screenshot: bool = SCRAPE_SCREENSHOT_FULL_PAGE
    json_prompt: Optional[str] = None
    json_schema: Optional[dict] = None

    def to_dict(self) -> dict:
        return {
            "formats": list(self.formats),
            "only_main_content": self.only_main_content,
            "wait_for": self.wait_for,
            "timeout_ms": self.timeout_ms,
            "full_page_screenshot": self.full_page_screenshot,
            "json_prompt": self.json_prompt,
            "json_schema": self.json_schema,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ScrapeOptions":
        return cls(**data)


# ---------------------------------------------------------------------------
# Request validation (shared by the HTTP gateway and the MCP tools)
# ---------------------------------------------------------------------------

def require_url(value: Any, name: str = "url") -> str:
    """Syntactic URL check (scheme, host, literal IPs). DNS is checked at fetch time."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} must be a non-empty string")
    return check_public_url(value, resolve_dns=False, max_chars=SCRAPE_MAX_URL_CHARS)


def bounded_int(value: Any, name: str, default: int, minimum: int, maximum: int) -> int:
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} must be an integer")
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


def optional_bool(value: Any, name: str, default: bool) -> bool:
    if value is None:
        return default
    if not isinstance(value, bool):
        raise ValueError(f"{name} must be a boolean")
    return value


def _json_options(prompt: Any, schema: Any) -> tuple[Optional[str], Optional[dict]]:
    if prompt is not None and not isinstance(prompt, str):
        raise ValueError("json prompt must be a string")
    if prompt and len(prompt) > SCRAPE_EXTRACT_MAX_PROMPT_CHARS:
        raise ValueError(f"prompt exceeds {SCRAPE_EXTRACT_MAX_PROMPT_CHARS} characters")
    if schema is not None and not isinstance(schema, dict):
        raise ValueError("json schema must be an object")
    return (prompt or None), schema


def parse_scrape_options(body: Optional[dict], *, default_formats=("markdown",)) -> ScrapeOptions:
    body = body or {}
    if not isinstance(body, dict):
        raise ValueError("scrape options must be an object")
    raw_formats = body.get("formats")
    if raw_formats is None:
        raw_formats = list(default_formats)
    if not isinstance(raw_formats, list):
        raise ValueError("formats must be an array")
    formats: list[str] = []
    full_page = SCRAPE_SCREENSHOT_FULL_PAGE
    json_prompt = json_schema = None
    for item in raw_formats:
        if isinstance(item, dict):
            if item.get("type") != "json":
                raise ValueError("object formats must have type 'json'")
            json_prompt, json_schema = _json_options(item.get("prompt"), item.get("schema"))
            name = "json"
        elif item == "json":
            opts = body.get("jsonOptions") or {}
            if not isinstance(opts, dict):
                raise ValueError("jsonOptions must be an object")
            json_prompt, json_schema = _json_options(opts.get("prompt"), opts.get("schema"))
            name = "json"
        elif item == "screenshot@fullPage":
            full_page, name = True, "screenshot"
        elif item in SIMPLE_FORMATS:
            name = item
        else:
            raise ValueError(f"Unsupported format: {item!r}")
        if name not in formats:
            formats.append(name)
    timeout_ms = bounded_int(body.get("timeout"), "timeout", SCRAPE_DEFAULT_TIMEOUT_MS, 1000, SCRAPE_MAX_TIMEOUT_MS)
    wait_for = bounded_int(body.get("waitFor"), "waitFor", 0, 0, SCRAPE_MAX_WAIT_FOR_MS)
    if wait_for >= timeout_ms:
        raise ValueError("waitFor must be smaller than timeout")
    return ScrapeOptions(
        formats=formats,
        only_main_content=optional_bool(body.get("onlyMainContent"), "onlyMainContent", True),
        wait_for=wait_for,
        timeout_ms=timeout_ms,
        full_page_screenshot=full_page,
        json_prompt=json_prompt,
        json_schema=json_schema,
    )


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------

def _decode(body: bytes, content_type: str) -> str:
    match = re.search(r"charset=([\w\-]+)", content_type, re.I)
    encoding = match.group(1) if match else None
    if not encoding:
        sniff = _CHARSET_RE.search(body[:4096])
        encoding = sniff.group(1).decode("ascii", "ignore") if sniff else "utf-8"
    try:
        return body.decode(encoding, errors="replace")
    except LookupError:
        return body.decode("utf-8", errors="replace")


def _gunzip_limited(body: bytes) -> bytes:
    """Inflate a gzip payload (e.g. sitemap.xml.gz) within the download limit."""
    if body[:2] != b"\x1f\x8b":
        return body
    inflater = zlib.decompressobj(16 + zlib.MAX_WBITS)
    try:
        out = inflater.decompress(body, SCRAPE_MAX_RESPONSE_BYTES + 1)
    except zlib.error as exc:
        raise ScrapeError("Invalid gzip response body") from exc
    if len(out) > SCRAPE_MAX_RESPONSE_BYTES or inflater.unconsumed_tail:
        raise ScrapeError("Decompressed response exceeded the download limit", 413)
    return out


def http_fetch(url: str, timeout_seconds: float = SCRAPE_HTTP_TIMEOUT_SECONDS,
               allowed_types: tuple[str, ...] = _HTML_TYPES + _TEXT_TYPES) -> RawPage:
    """GET a public URL, re-validating every redirect hop against the SSRF guard."""
    current = check_public_url(url)
    session = guarded_session()
    response = None
    try:
        for hop in range(SCRAPE_MAX_REDIRECTS + 1):
            headers = get_realistic_headers(current, hop)
            headers["Accept-Encoding"] = "gzip, deflate"
            try:
                response = session.get(current, headers=headers, timeout=timeout_seconds,
                                       allow_redirects=False, stream=True)
            except UnsafeURLError:
                raise
            except requests.exceptions.Timeout as exc:
                raise ScrapeError(f"Timed out fetching {current}", 408) from exc
            except requests.exceptions.RequestException as exc:
                raise ScrapeError(f"Failed to fetch {current}: {type(exc).__name__}") from exc
            if response.is_redirect or response.is_permanent_redirect:
                location = response.headers.get("location")
                response.close()
                if not location or hop == SCRAPE_MAX_REDIRECTS:
                    raise ScrapeError("Too many redirects or missing Location header")
                current = check_public_url(urljoin(current, location))
                continue
            break
        content_type = (response.headers.get("content-type") or "").lower()
        if content_type and not any(kind in content_type for kind in allowed_types):
            raise ScrapeError(f"Unsupported content type: {content_type.split(';')[0]}", 415)
        chunks, size = [], 0
        for chunk in response.iter_content(64 * 1024):
            size += len(chunk)
            if size > SCRAPE_MAX_RESPONSE_BYTES:
                raise ScrapeError("Response exceeded the download limit", 413)
            chunks.append(chunk)
        body = _gunzip_limited(b"".join(chunks))
        return RawPage(
            url=current,
            status_code=response.status_code,
            html=_decode(body, content_type),
            content_type=content_type or "text/html",
        )
    finally:
        if response is not None:
            response.close()
        session.close()


async def browser_render(url: str, timeout_ms: int, wait_for_ms: int, screenshot: bool,
                         full_page: bool = False) -> RawPage:
    """Render through the shared Playwright pool in the ipc-service."""
    from commons.main import _init_ipc_manager

    if not await asyncio.to_thread(_init_ipc_manager):
        raise ScrapeError("Browser rendering is unavailable", 503)
    from ipcService.coreServiceManager import CoreServiceManager

    manager = CoreServiceManager.get_instance()
    result = await asyncio.to_thread(
        manager.call, "agents", "browser_render", url,
        timeout_ms=timeout_ms, wait_for_ms=wait_for_ms,
        screenshot=screenshot, full_page=full_page,
    )
    if not isinstance(result, dict) or result.get("error") or not result.get("html"):
        error = (result or {}).get("error") if isinstance(result, dict) else "no result"
        raise ScrapeError(f"Browser render failed: {error}")
    shot = result.get("screenshot")
    return RawPage(
        url=result.get("url") or url,
        status_code=result.get("status_code"),
        html=result["html"],
        content_type="text/html",
        screenshot=f"data:image/png;base64,{shot}" if shot else None,
    )


# ---------------------------------------------------------------------------
# HTML -> markdown / metadata / links
# ---------------------------------------------------------------------------

_SKIP_TAGS = {"script", "style", "noscript", "template", "svg", "iframe", "head", "meta", "link", "object", "embed", "canvas"}
_CHROME_TAGS = ["nav", "footer", "header", "aside", "form", "button", "dialog"]
_BLOCK_TAGS = {
    "div", "section", "article", "main", "header", "footer", "nav", "aside", "figure",
    "figcaption", "dl", "dt", "dd", "details", "summary", "address", "body", "html", "form",
}
_LIST_MARKER = re.compile(r"^\s*([-*]|\d+\.)\s")


def _abs(base: str, href: Optional[str]) -> Optional[str]:
    if not href:
        return None
    href = href.strip()
    if href.startswith(("javascript:", "mailto:", "tel:", "data:", "#")):
        return None
    return urldefrag(urljoin(base, href))[0]


def _render(node, base: str, depth: int = 0) -> str:
    if isinstance(node, (Comment, Doctype)):
        return ""
    if isinstance(node, NavigableString):
        return re.sub(r"\s+", " ", str(node))
    if not isinstance(node, Tag):
        return ""
    name = node.name
    if name in _SKIP_TAGS:
        return ""

    def inner(d: int = depth) -> str:
        return "".join(_render(child, base, d) for child in node.children)

    if name in ("h1", "h2", "h3", "h4", "h5", "h6"):
        text = inner().strip()
        return f"\n\n{'#' * int(name[1])} {text}\n\n" if text else ""
    if name == "p":
        text = inner().strip()
        return f"\n\n{text}\n\n" if text else ""
    if name == "br":
        return "\n"
    if name == "hr":
        return "\n\n---\n\n"
    if name in ("strong", "b"):
        text = inner().strip()
        return f"**{text}**" if text else ""
    if name in ("em", "i"):
        text = inner().strip()
        return f"*{text}*" if text else ""
    if name == "code":
        text = node.get_text()
        return f"`{text}`" if text.strip() else ""
    if name == "pre":
        code_tag = node.find("code")
        classes = " ".join((code_tag or node).get("class") or [])
        lang = re.search(r"(?:language|lang)-([\w+-]+)", classes)
        return f"\n\n```{lang.group(1) if lang else ''}\n{node.get_text().rstrip()}\n```\n\n"
    if name == "a":
        text = inner().strip()
        href = _abs(base, node.get("href"))
        return f"[{text}]({href})" if text and href else text
    if name == "img":
        src = _abs(base, node.get("src"))
        return f"![{(node.get('alt') or '').strip()}]({src})" if src else ""
    if name in ("ul", "ol"):
        items = []
        for index, li in enumerate(node.find_all("li", recursive=False), 1):
            marker = f"{index}." if name == "ol" else "-"
            body = re.sub(r"\n{2,}", "\n", "".join(_render(c, base, depth + 1) for c in li.children)).strip()
            if body:
                items.append("  " * depth + f"{marker} {body}")
        return "\n\n" + "\n".join(items) + "\n\n" if items else ""
    if name == "li":
        text = inner().strip()
        return f"\n- {text}\n" if text else ""
    if name == "blockquote":
        text = inner().strip()
        return "\n\n" + "\n".join(f"> {line}" for line in text.splitlines()) + "\n\n" if text else ""
    if name == "table":
        rows = []
        for tr in node.find_all("tr"):
            cells = [re.sub(r"\s+", " ", c.get_text(" ", strip=True)).replace("|", "\\|")
                     for c in tr.find_all(["th", "td"], recursive=False)]
            if cells:
                rows.append(cells)
        if not rows:
            return ""
        width = max(len(r) for r in rows)
        rows = [r + [""] * (width - len(r)) for r in rows]
        lines = ["| " + " | ".join(rows[0]) + " |", "|" + " --- |" * width]
        lines += ["| " + " | ".join(r) + " |" for r in rows[1:]]
        return "\n\n" + "\n".join(lines) + "\n\n"
    if name in _BLOCK_TAGS:
        return f"\n\n{inner()}\n\n"
    return inner()


def _tidy_markdown(text: str) -> str:
    out, fenced = [], False
    for line in text.split("\n"):
        if line.strip().startswith("```"):
            fenced = not fenced
            out.append(line.strip())
            continue
        if fenced:
            out.append(line)
            continue
        line = line.rstrip()
        if not _LIST_MARKER.match(line):
            line = line.lstrip()
        out.append(line)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()


def html_to_markdown(root, base_url: str) -> str:
    return _tidy_markdown(_render(root, base_url))[:SCRAPE_MAX_MARKDOWN_CHARS]


def _main_content(soup: BeautifulSoup, only_main: bool):
    for tag in soup(list(_SKIP_TAGS - {"head", "meta", "link"})):
        tag.decompose()
    if not only_main:
        return soup.body or soup
    for tag in soup(_CHROME_TAGS):
        tag.decompose()
    articles = soup.find_all("article")
    return (
        soup.find("main")
        or soup.find(attrs={"role": "main"})
        or (articles[0] if len(articles) == 1 else None)
        or soup.body
        or soup
    )


def _meta(soup: BeautifulSoup, *names: str) -> Optional[str]:
    wanted = {name.lower() for name in names}
    for tag in soup.find_all("meta"):
        key = str(tag.get("property") or tag.get("name") or "").lower()
        if key in wanted and tag.get("content"):
            return str(tag["content"]).strip()[:1000]
    return None


def page_metadata(soup: BeautifulSoup, source_url: str, final_url: str, status: Optional[int]) -> dict:
    title = soup.title.get_text(" ", strip=True) if soup.title else None
    html_tag = soup.find("html")
    meta = {
        "title": title or _meta(soup, "og:title", "twitter:title") or "",
        "description": _meta(soup, "description", "og:description", "twitter:description") or "",
        "language": (html_tag.get("lang") if html_tag else None) or "",
        "sourceURL": source_url,
        "url": final_url,
        "statusCode": status,
    }
    og_image = _meta(soup, "og:image")
    if og_image:
        meta["ogImage"] = og_image
    return meta


def page_links(soup: BeautifulSoup, base_url: str) -> list[str]:
    links: list[str] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        url = _abs(base_url, anchor["href"])
        if url and urlparse(url).scheme in ("http", "https") and url not in seen:
            seen.add(url)
            links.append(url)
            if len(links) >= SCRAPE_MAX_LINKS_PER_PAGE:
                break
    return links


def build_document(raw: RawPage, source_url: str, options: ScrapeOptions) -> tuple[dict, list[str]]:
    """Turn a fetched page into a Firecrawl-style data object plus its outgoing links."""
    is_html = any(kind in raw.content_type for kind in _HTML_TYPES) or "<html" in raw.html[:2048].lower()
    if not is_html:
        doc: dict[str, Any] = {}
        if "markdown" in options.formats or "json" in options.formats:
            doc["markdown"] = raw.html[:SCRAPE_MAX_MARKDOWN_CHARS]
        if "rawHtml" in options.formats:
            doc["rawHtml"] = raw.html
        if "links" in options.formats:
            doc["links"] = []
        doc["metadata"] = {"title": "", "description": "", "language": "", "sourceURL": source_url,
                           "url": raw.url, "statusCode": raw.status_code}
        return doc, []

    soup = BeautifulSoup(raw.html, "html.parser")
    metadata = page_metadata(soup, source_url, raw.url, raw.status_code)
    links = page_links(soup, raw.url)
    doc = {}
    if "rawHtml" in options.formats:
        doc["rawHtml"] = raw.html
    root = _main_content(soup, options.only_main_content)
    if "markdown" in options.formats or "json" in options.formats:
        doc["markdown"] = html_to_markdown(root, raw.url)
    if "html" in options.formats:
        doc["html"] = str(root)
    if "links" in options.formats:
        doc["links"] = links
    if "screenshot" in options.formats and raw.screenshot:
        doc["screenshot"] = raw.screenshot
    doc["metadata"] = metadata
    return doc, links


async def _scrape(url: str, options: ScrapeOptions) -> tuple[dict, list[str]]:
    target = await asyncio.to_thread(check_public_url, url, max_chars=SCRAPE_MAX_URL_CHARS)
    needs_browser = "screenshot" in options.formats or options.wait_for > 0
    raw: Optional[RawPage] = None
    error: Optional[ScrapeError] = None

    if not needs_browser:
        try:
            raw = await asyncio.to_thread(http_fetch, target, min(SCRAPE_HTTP_TIMEOUT_SECONDS, options.timeout_ms / 1000))
        except ScrapeError as exc:
            error = exc
        if raw is not None:
            doc, links = build_document(raw, url, options)
            empty = "markdown" in doc and not doc["markdown"]
            if (raw.status_code not in _FALLBACK_STATUSES and not empty) or not SCRAPE_BROWSER_FALLBACK:
                return doc, links
        elif not SCRAPE_BROWSER_FALLBACK or error.status in (413, 415):
            raise error
        logger.info(f"[Scrape] Falling back to browser render for {target}")

    try:
        rendered = await browser_render(target, options.timeout_ms, options.wait_for,
                                        "screenshot" in options.formats, options.full_page_screenshot)
        return build_document(rendered, url, options)
    except ScrapeError as exc:
        if raw is not None:
            return build_document(raw, url, options)
        raise error or exc


async def scrape_url(url: str, options: ScrapeOptions, *, with_links: bool = False):
    """Scrape one URL. Returns the data object, or (data, links) when with_links=True."""
    try:
        doc, links = await asyncio.wait_for(_scrape(url, options), timeout=options.timeout_ms / 1000)
    except asyncio.TimeoutError as exc:
        raise ScrapeError(f"Scrape timed out after {options.timeout_ms}ms", 408) from exc
    if "json" in options.formats:
        doc["json"] = await extract_json(doc.get("markdown", ""), options.json_prompt, options.json_schema)
        if "markdown" not in options.formats:
            doc.pop("markdown", None)
    logger.info(f"[Scrape] Scraped {url} formats={options.formats} status={doc['metadata'].get('statusCode')}")
    return (doc, links) if with_links else doc


async def scrape_or_error(url: str, options: ScrapeOptions, *, with_links: bool = False):
    """Like scrape_url, but returns a failed document instead of raising (crawl/batch/search)."""
    try:
        return await scrape_url(url, options, with_links=with_links)
    except (ScrapeError, UnsafeURLError) as exc:
        logger.warning(f"[Scrape] {url} failed: {exc}")
        doc = {"metadata": {"sourceURL": url, "url": url, "statusCode": None, "error": str(exc)}}
        return (doc, []) if with_links else doc


# ---------------------------------------------------------------------------
# JSON extraction via the existing Pollinations LLM path
# ---------------------------------------------------------------------------

def _parse_json_object(text: str) -> Optional[dict]:
    text = (text or "").strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fenced:
        text = fenced.group(1).strip()
    for candidate in (text, text[text.find("{"): text.rfind("}") + 1] if "{" in text else ""):
        if not candidate:
            continue
        try:
            value = json.loads(candidate)
        except ValueError:
            continue
        if isinstance(value, dict):
            return value
    return None


def _schema_valid(value: dict, schema: Optional[dict]) -> bool:
    if not schema:
        return True
    try:
        import jsonschema

        jsonschema.validate(value, schema)
        return True
    except Exception:
        return False


async def extract_json(content: str, prompt: Optional[str], schema: Optional[dict]) -> dict:
    from commons.auth_context import pollinations_auth_headers

    instructions = (
        "You extract structured data from web page content. Respond with a single JSON object "
        "and nothing else. Use null for values that are not present in the content; never invent facts."
    )
    if schema:
        instructions += "\nThe JSON object must conform to this JSON Schema:\n" + json.dumps(schema)[:SCRAPE_EXTRACT_MAX_PROMPT_CHARS * 2]
    user = (prompt or "Extract the key information from the content.") + "\n\nCONTENT:\n" + content[:SCRAPE_EXTRACT_MAX_CONTEXT_CHARS]
    payload = {"messages": [{"role": "system", "content": instructions}, {"role": "user", "content": user}],
               "temperature": 0, "stream": False}
    try:
        headers = pollinations_auth_headers()
    except RuntimeError as exc:
        raise ScrapeError("LLM extraction is not configured", 503) from exc

    fallback: Optional[dict] = None
    for model in dict.fromkeys((LLM_MODEL, LLM_MODEL_FALLBACK)):
        try:
            response = await asyncio.to_thread(
                requests.post, POLLINATIONS_ENDPOINT, json={**payload, "model": model},
                headers=headers, timeout=LLM_HTTP_TIMEOUT,
            )
            response.raise_for_status()
            message = response.json()["choices"][0]["message"]
            parsed = _parse_json_object(message.get("content") or "")
        except Exception as exc:
            logger.warning(f"[Scrape] JSON extraction model={model} failed: {type(exc).__name__}")
            continue
        if parsed is None:
            logger.warning(f"[Scrape] JSON extraction model={model} returned non-JSON")
            continue
        if _schema_valid(parsed, schema):
            return parsed
        fallback = fallback or parsed
    if fallback is not None:
        logger.warning("[Scrape] JSON extraction did not match schema; returning best effort")
        return fallback
    raise ScrapeError("LLM extraction failed", 502)


async def extract_from_urls(urls: list[str], prompt: Optional[str], schema: Optional[dict]) -> dict:
    options = ScrapeOptions(formats=["markdown"])
    semaphore = asyncio.Semaphore(SCRAPE_SEARCH_CONCURRENCY)

    async def one(url: str):
        async with semaphore:
            return await scrape_or_error(url, options)

    docs = await asyncio.gather(*(one(url) for url in urls))
    sections, budget = [], SCRAPE_EXTRACT_MAX_CONTEXT_CHARS
    for url, doc in zip(urls, docs):
        text = (doc.get("markdown") or "")[: max(0, budget)]
        if text:
            sections.append(f"## Source: {url}\n\n{text}")
            budget -= len(text)
    if not sections:
        raise ScrapeError("None of the URLs could be scraped", 502)
    logger.info(f"[Scrape] Extracting from {len(sections)}/{len(urls)} pages")
    return await extract_json("\n\n".join(sections), prompt, schema)


def parse_extract_request(body: dict) -> tuple[list[str], Optional[str], Optional[dict]]:
    urls = body.get("urls")
    if not isinstance(urls, list) or not urls:
        raise ValueError("urls must be a non-empty array")
    if len(urls) > SCRAPE_EXTRACT_MAX_URLS:
        raise ValueError(f"urls may contain at most {SCRAPE_EXTRACT_MAX_URLS} entries")
    clean = list(dict.fromkeys(require_url(u, "urls[]") for u in urls))
    prompt, schema = _json_options(body.get("prompt"), body.get("schema"))
    if not prompt and not schema:
        raise ValueError("prompt or schema is required")
    return clean, prompt, schema


# ---------------------------------------------------------------------------
# Search and map
# ---------------------------------------------------------------------------

async def web_search_urls(query: str, limit: int) -> list[str]:
    from commons.searching_based import webSearch

    urls = await webSearch(query, max_links=limit)
    return list(dict.fromkeys(u for u in urls or [] if isinstance(u, str)))[:limit]


async def search(query: str, limit: int, scrape_options: Optional[ScrapeOptions]) -> list[dict]:
    urls = await web_search_urls(query, limit)
    options = scrape_options or ScrapeOptions(formats=[])
    semaphore = asyncio.Semaphore(SCRAPE_SEARCH_CONCURRENCY)

    async def one(url: str) -> dict:
        async with semaphore:
            doc = await scrape_or_error(url, options)
        meta = doc.get("metadata", {})
        item = {"url": url, "title": meta.get("title") or "", "description": meta.get("description") or ""}
        if scrape_options is not None:
            item.update({k: v for k, v in doc.items() if k != "metadata"})
            item["metadata"] = meta
        return item

    results = await asyncio.gather(*(one(url) for url in urls))
    logger.info(f"[Scrape] Search returned {len(results)} results")
    return list(results)


def _host_key(host: str) -> str:
    host = (host or "").lower().rstrip(".")
    return host[4:] if host.startswith("www.") else host


def same_site(url: str, base_host: str, include_subdomains: bool = False) -> bool:
    host = _host_key(urlparse(url).hostname or "")
    base = _host_key(base_host)
    return host == base or (include_subdomains and host.endswith("." + base))


def _sitemap_locs(xml_text: str) -> tuple[list[str], list[str]]:
    """Return (page urls, nested sitemap urls) from a sitemap or sitemap index."""
    try:
        root = ET.fromstring(xml_text.strip().encode("utf-8"))
    except ET.ParseError:
        return [], []
    pages, nested = [], []
    for element in root.iter():
        if element.tag.split("}")[-1] != "loc" or not (element.text or "").strip():
            continue
        loc = element.text.strip()
        (nested if root.tag.split("}")[-1] == "sitemapindex" else pages).append(loc)
    return pages, nested


def _sitemap_urls(origin: str, limit: int) -> list[str]:
    queue = [urljoin(origin, "/sitemap.xml")]
    try:
        robots = http_fetch(urljoin(origin, "/robots.txt"), allowed_types=_TEXT_TYPES + _HTML_TYPES)
        if robots.status_code == 200:
            queue += [line.split(":", 1)[1].strip() for line in robots.html.splitlines()
                      if line.lower().startswith("sitemap:")]
    except (ScrapeError, UnsafeURLError):
        pass
    found: list[str] = []
    visited: set[str] = set()
    while queue and len(visited) < SCRAPE_MAP_MAX_SITEMAPS and len(found) < limit:
        sitemap = queue.pop(0)
        if sitemap in visited:
            continue
        visited.add(sitemap)
        try:
            raw = http_fetch(sitemap, allowed_types=_TEXT_TYPES + _HTML_TYPES + _GZIP_TYPES)
        except (ScrapeError, UnsafeURLError):
            continue
        if raw.status_code != 200:
            continue
        pages, nested = _sitemap_locs(raw.html)
        found += pages
        queue += nested
    return found


async def map_site(url: str, search_term: Optional[str], limit: int, include_subdomains: bool) -> list[dict]:
    target = await asyncio.to_thread(check_public_url, url, max_chars=SCRAPE_MAX_URL_CHARS)
    base_host = urlparse(target).hostname or ""
    origin = f"{urlparse(target).scheme}://{urlparse(target).netloc}"
    start_doc, page_found = await scrape_or_error(target, ScrapeOptions(formats=[]), with_links=True)
    sitemap_found = await asyncio.to_thread(_sitemap_urls, origin, limit * 2)

    entries: dict[str, dict] = {}
    meta = start_doc.get("metadata", {})
    entries[target] = {"url": target}
    if meta.get("title"):
        entries[target]["title"] = meta["title"]
    if meta.get("description"):
        entries[target]["description"] = meta["description"]
    for link in page_found + sitemap_found:
        link = urldefrag(link)[0]
        if link not in entries and urlparse(link).scheme in ("http", "https") and same_site(link, base_host, include_subdomains):
            entries[link] = {"url": link}

    results = list(entries.values())
    if search_term:
        terms = [t for t in re.split(r"\s+", search_term.lower()) if t]
        scored = [(sum(t in item["url"].lower() or t in item.get("title", "").lower() for t in terms), i, item)
                  for i, item in enumerate(results)]
        results = [item for score, _, item in sorted(scored, key=lambda s: (-s[0], s[1])) if score > 0]
    logger.info(f"[Scrape] Map {target}: {len(results)} links (page={len(page_found)}, sitemap={len(sitemap_found)})")
    return results[:limit]
