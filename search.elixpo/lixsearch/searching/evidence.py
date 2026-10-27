"""Structured, bounded web evidence primitives shared by MCP and research."""

from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from commons.searching_based import webSearch
from pipeline.utils import clean_url
from searching.fetch_full_text import USER_AGENTS

MAX_SEARCH_RESULTS = 10
MAX_FETCH_URLS = 8
MAX_PAGE_CHARACTERS = 20_000
MAX_RESPONSE_BYTES = 2_000_000
MAX_TOTAL_FETCH_CHARACTERS = 60_000
MAX_REDIRECTS = 5


@dataclass(slots=True)
class SearchResult:
    title: str
    url: str
    author: str | None = None
    published_at: str | None = None
    highlights: list[str] | None = None
    rank: int | None = None
    provider: str = "oreolook"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class FetchedPage:
    url: str
    canonical_url: str | None
    title: str | None
    text: str
    author: str | None = None
    published_at: str | None = None
    fetched_at: str | None = None
    status: str = "ok"
    error: str | None = None
    truncated: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SearchProvider(Protocol):
    async def search(self, query: str) -> list[str | dict[str, Any]]: ...


class OreoLookSearchProvider:
    async def search(self, query: str) -> list[str | dict[str, Any]]:
        results = await webSearch(query)
        return results if isinstance(results, list) else []


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def public_https_url(url: str, *, resolve_dns: bool = True) -> str:
    candidate = clean_url((url or "").strip())
    if not candidate:
        raise ValueError("URL is empty or blocked")
    parsed = urlparse(candidate)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Only public HTTPS URLs without embedded credentials are allowed")
    if parsed.port not in (None, 443):
        raise ValueError("Only the standard HTTPS port is allowed")
    hostname = parsed.hostname.rstrip(".").lower()
    if hostname == "localhost" or hostname.endswith(".localhost"):
        raise ValueError("Local hosts are not allowed")
    if resolve_dns:
        try:
            addresses = {
                item[4][0]
                for item in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
            }
        except socket.gaierror as exc:
            raise ValueError("Hostname could not be resolved") from exc
        if not addresses:
            raise ValueError("Hostname resolved to no addresses")
        if any(not ipaddress.ip_address(address).is_global for address in addresses):
            raise ValueError("URL resolves to a private or non-routable address")
    return candidate


def _meta(soup: BeautifulSoup, *names: str) -> str | None:
    wanted = {name.lower() for name in names}
    for tag in soup.find_all("meta"):
        key = str(tag.get("property") or tag.get("name") or tag.get("itemprop") or "").lower()
        value = str(tag.get("content") or "").strip()
        if key in wanted and value:
            return value[:500]
    return None


def _clean_page_text(soup: BeautifulSoup, max_characters: int) -> str:
    for element in soup([
        "script", "style", "nav", "footer", "header", "aside", "form",
        "button", "noscript", "iframe", "svg",
    ]):
        element.decompose()
    root = soup.find("article") or soup.find("main") or soup.find("body") or soup
    parts: list[str] = []
    seen: set[str] = set()
    size = 0
    for tag in root.find_all(["h1", "h2", "h3", "p", "li", "blockquote", "td"]):
        text = re.sub(r"\s+", " ", tag.get_text(" ", strip=True)).strip()
        if len(text) < 20 or text in seen:
            continue
        seen.add(text)
        remaining = max_characters - size
        if remaining <= 0:
            break
        parts.append(text[:remaining])
        size += min(len(text), remaining) + 2
    return "\n\n".join(parts)[:max_characters]


def fetch_page(
    url: str, *, max_characters: int = 8_000, timeout_seconds: float = 12.0
) -> FetchedPage:
    """Fetch one page while validating the initial URL and every redirect hop."""
    if not 200 <= max_characters <= MAX_PAGE_CHARACTERS:
        raise ValueError(f"max_characters must be between 200 and {MAX_PAGE_CHARACTERS}")
    original = url
    response: requests.Response | None = None
    session = requests.Session()
    try:
        current = public_https_url(url)
        for redirect_count in range(MAX_REDIRECTS + 1):
            response = session.get(
                current,
                headers={
                    "User-Agent": USER_AGENTS[redirect_count % len(USER_AGENTS)],
                    "Accept": "text/html,application/xhtml+xml",
                },
                timeout=timeout_seconds,
                allow_redirects=False,
                stream=True,
            )
            if response.is_redirect or response.is_permanent_redirect:
                if redirect_count == MAX_REDIRECTS:
                    raise ValueError("Too many redirects")
                location = response.headers.get("location")
                if not location:
                    raise ValueError("Redirect response is missing Location")
                current = public_https_url(urljoin(current, location))
                response.close()
                continue
            break
        assert response is not None
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").lower()
        if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
            raise ValueError("URL did not return HTML content")
        chunks: list[bytes] = []
        size = 0
        for chunk in response.iter_content(64 * 1024):
            size += len(chunk)
            if size > MAX_RESPONSE_BYTES:
                raise ValueError("Response exceeded the download limit")
            chunks.append(chunk)
        soup = BeautifulSoup(b"".join(chunks), "html.parser")
        title = _meta(soup, "og:title", "twitter:title")
        if not title and soup.title:
            title = soup.title.get_text(" ", strip=True)
        canonical = current
        canonical_tag = soup.find("link", rel=lambda value: value and "canonical" in value)
        if canonical_tag and canonical_tag.get("href"):
            try:
                canonical = public_https_url(
                    urljoin(current, str(canonical_tag["href"])), resolve_dns=False
                )
            except ValueError:
                pass
        text = _clean_page_text(soup, max_characters)
        return FetchedPage(
            url=current,
            canonical_url=canonical,
            title=title[:500] if title else None,
            text=text,
            author=_meta(soup, "author", "article:author", "byl"),
            published_at=_meta(
                soup, "article:published_time", "datepublished", "date",
                "pubdate", "publishdate",
            ),
            fetched_at=_utc_now(),
            status="ok" if text else "empty",
            error=None if text else "No useful page text found",
        )
    except Exception as exc:
        return FetchedPage(
            url=original,
            canonical_url=None,
            title=None,
            text="",
            fetched_at=_utc_now(),
            status="error",
            error=str(exc)[:500],
        )
    finally:
        if response is not None:
            response.close()
        session.close()


async def fetch_pages(
    urls: list[str],
    *,
    max_characters: int = 8_000,
    max_concurrency: int = 4,
    browser_fallback: bool = False,
) -> list[FetchedPage]:
    if not isinstance(urls, list) or not urls:
        raise ValueError("urls must contain at least one URL")
    if len(urls) > MAX_FETCH_URLS:
        raise ValueError(f"urls may contain at most {MAX_FETCH_URLS} entries")
    if not 1 <= max_concurrency <= 4:
        raise ValueError("max_concurrency must be between 1 and 4")
    semaphore = asyncio.Semaphore(max_concurrency)

    async def run(url: str) -> FetchedPage:
        async with semaphore:
            return await asyncio.to_thread(
                fetch_page, url, max_characters=max_characters
            )

    pages = await asyncio.gather(*(run(url) for url in dict.fromkeys(urls)))
    if browser_fallback:
        for index, page in enumerate(pages):
            if page.status != "ok":
                pages[index] = await render_page(
                    page.url, max_characters=max_characters
                )
    remaining = MAX_TOTAL_FETCH_CHARACTERS
    for page in pages:
        if len(page.text) > remaining:
            page.text = page.text[:remaining]
            page.truncated = True
        remaining = max(0, remaining - len(page.text))
    return pages


async def render_page(
    url: str, *, max_characters: int = 8_000, timeout_seconds: float = 18.0
) -> FetchedPage:
    """Render a JS page while blocking every non-public network request."""
    original = url
    try:
        target = await asyncio.to_thread(public_https_url, url)
        from playwright.async_api import async_playwright

        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            context = await browser.new_context(java_script_enabled=True)
            page = await context.new_page()

            async def guard(route):
                request_url = route.request.url
                if not request_url.startswith("https://"):
                    await route.abort()
                    return
                try:
                    await asyncio.to_thread(public_https_url, request_url)
                except ValueError:
                    await route.abort()
                    return
                await route.continue_()

            await page.route("**/*", guard)
            await page.goto(
                target,
                wait_until="domcontentloaded",
                timeout=int(timeout_seconds * 1000),
            )
            final_url = await asyncio.to_thread(public_https_url, page.url)
            html = await page.content()
            await context.close()
            await browser.close()
        soup = BeautifulSoup(html, "html.parser")
        text = _clean_page_text(soup, max_characters)
        title = _meta(soup, "og:title", "twitter:title")
        if not title and soup.title:
            title = soup.title.get_text(" ", strip=True)
        return FetchedPage(
            url=final_url,
            canonical_url=final_url,
            title=title[:500] if title else None,
            text=text,
            author=_meta(soup, "author", "article:author", "byl"),
            published_at=_meta(
                soup, "article:published_time", "datepublished", "date"
            ),
            fetched_at=_utc_now(),
            status="ok" if text else "empty",
            error=None if text else "No useful rendered text found",
        )
    except Exception as exc:
        return FetchedPage(
            url=original,
            canonical_url=None,
            title=None,
            text="",
            fetched_at=_utc_now(),
            status="error",
            error=str(exc)[:500],
        )


def _freshness_query(query: str, freshness: str | None) -> str:
    if freshness in (None, "any"):
        return query
    days = {"day": 1, "week": 7, "month": 31, "year": 366}.get(freshness)
    if days is None:
        raise ValueError("freshness must be one of any, day, week, month, or year")
    after = (datetime.now(UTC) - timedelta(days=days)).date().isoformat()
    return f"{query} after:{after}"


def _url_identity(url: str) -> tuple[str, str, str]:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().removeprefix("www.")
    path = parsed.path.rstrip("/") or "/"
    return host, path, parsed.query


def _extract_highlights(text: str, query: str, limit: int = 3) -> list[str]:
    terms = {term.lower() for term in re.findall(r"[A-Za-z0-9]{3,}", query)}
    sentences = [
        value.strip()
        for value in re.split(r"(?<=[.!?])\s+|\n+", text)
        if len(value.strip()) >= 40
    ]
    ranked = sorted(
        enumerate(sentences),
        key=lambda item: (
            -sum(term in item[1].lower() for term in terms),
            item[0],
        ),
    )
    return [sentence[:500] for _, sentence in ranked[:limit]]


async def structured_search(
    query: str,
    *,
    num_results: int = 5,
    freshness: str | None = None,
    include_domains: list[str] | None = None,
    exclude_domains: list[str] | None = None,
    include_highlights: bool = False,
    provider: SearchProvider | None = None,
) -> list[SearchResult]:
    query = (query or "").strip()
    if not query or len(query) > 4_000:
        raise ValueError("query must contain between 1 and 4000 characters")
    if not 1 <= num_results <= MAX_SEARCH_RESULTS:
        raise ValueError(f"num_results must be between 1 and {MAX_SEARCH_RESULTS}")
    def normalize_domain(domain: str) -> str:
        value = domain.strip().lower().removeprefix("www.").rstrip(".")
        if len(value) > 253 or not re.fullmatch(
            r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", value
        ):
            raise ValueError(f"Invalid domain filter: {domain}")
        return value

    include = {normalize_domain(domain) for domain in (include_domains or [])}
    exclude = {normalize_domain(domain) for domain in (exclude_domains or [])}
    if len(include) > 10 or len(exclude) > 10:
        raise ValueError("domain filters may contain at most 10 entries each")
    search_query = _freshness_query(query, freshness)
    if include:
        search_query += " " + " OR ".join(
            f"site:{domain}" for domain in sorted(include)
        )
    raw = await (provider or OreoLookSearchProvider()).search(search_query)
    results: list[SearchResult] = []
    seen: set[tuple[str, str, str]] = set()
    for item in raw:
        data = item if isinstance(item, dict) else {"url": item}
        url = clean_url(str(data.get("url") or ""))
        identity = _url_identity(url) if url else None
        if not url or identity in seen:
            continue
        domain = (urlparse(url).hostname or "").lower().removeprefix("www.")
        if include and not any(
            domain == allowed or domain.endswith(f".{allowed}") for allowed in include
        ):
            continue
        if any(
            domain == blocked or domain.endswith(f".{blocked}") for blocked in exclude
        ):
            continue
        seen.add(identity)
        results.append(SearchResult(
            title=str(data.get("title") or domain or url)[:500],
            url=url,
            author=data.get("author"),
            published_at=data.get("published_at") or data.get("publishedDate"),
            highlights=list(data.get("highlights") or [])[:3],
            rank=len(results) + 1,
            provider=str(data.get("provider") or "oreolook"),
        ))
        if len(results) >= num_results:
            break
    if include_highlights and results:
        pages = await fetch_pages(
            [item.url for item in results], max_characters=3_000
        )
        for result, page in zip(results, pages):
            if page.status != "ok":
                continue
            result.title = page.title or result.title
            result.author = page.author or result.author
            result.published_at = page.published_at or result.published_at
            result.highlights = (
                result.highlights or _extract_highlights(page.text, query)
            )
    return results
