import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lixsearch"))

from searching.citations import normalize_citations
from searching.evidence import FetchedPage, SearchResult, fetch_pages, public_https_url, structured_search
import searching.evidence as evidence_module


class FakeProvider:
    def __init__(self, results):
        self.results = results
        self.query = None

    async def search(self, query):
        self.query = query
        return self.results


def test_public_https_url_blocks_unsafe_targets(monkeypatch):
    monkeypatch.setattr(evidence_module.socket, "getaddrinfo", lambda *args, **kwargs: [(None, None, None, None, ("127.0.0.1", 443))])
    with pytest.raises(ValueError, match="private or non-routable"):
        public_https_url("https://example.test/path")
    with pytest.raises(ValueError, match="Only public HTTPS"):
        public_https_url("http://example.com")
    with pytest.raises(ValueError, match="Only public HTTPS"):
        public_https_url("https://user:pass@example.com")


@pytest.mark.asyncio
async def test_structured_search_filters_deduplicates_and_adds_freshness():
    provider = FakeProvider([
        {"url": "https://www.example.com/a?utm_source=x", "title": "A", "highlights": ["one"]},
        {"url": "https://example.com/a", "title": "duplicate"},
        {"url": "https://blocked.test/b", "title": "blocked"},
    ])
    results = await structured_search(
        "latest test",
        num_results=3,
        freshness="week",
        exclude_domains=["blocked.test"],
        provider=provider,
    )
    assert len(results) == 1
    assert results[0].url == "https://www.example.com/a"
    assert results[0].highlights == ["one"]
    assert "after:" in provider.query


@pytest.mark.asyncio
async def test_fetch_pages_is_bounded_and_preserves_partial_errors(monkeypatch):
    def fake_fetch(url, *, max_characters):
        if url.endswith("bad"):
            return FetchedPage(url=url, canonical_url=None, title=None, text="", status="error", error="blocked")
        return FetchedPage(url=url, canonical_url=url, title="Good", text="evidence", status="ok")

    monkeypatch.setattr(evidence_module, "fetch_page", fake_fetch)
    pages = await fetch_pages(["https://a.test/good", "https://a.test/bad"], max_characters=500)
    assert [page.status for page in pages] == ["ok", "error"]
    with pytest.raises(ValueError, match="at most"):
        await fetch_pages([f"https://a.test/{i}" for i in range(9)])


def test_normalized_citations_map_claims_and_metadata():
    answer = "The protocol is stateless [MCP spec](https://model.test/spec)."
    evidence = [SearchResult(
        title="Official MCP specification",
        url="https://model.test/spec",
        author="MCP",
        published_at="2026-01-01",
        highlights=["The protocol is stateless."],
    )]
    citations = normalize_citations(answer, evidence)
    assert len(citations) == 1
    assert citations[0].id == "src_1"
    assert citations[0].title == "Official MCP specification"
    assert citations[0].claim.startswith("The protocol is stateless")
    assert citations[0].excerpt == "The protocol is stateless."
    assert citations[0].confidence == 1.0


@pytest.mark.asyncio
async def test_structured_search_can_enrich_metadata_and_highlights(monkeypatch):
    provider = FakeProvider([{"url": "https://example.com/a"}])

    async def fake_pages(urls, **kwargs):
        return [FetchedPage(
            url=urls[0], canonical_url=urls[0], title="Enriched title",
            author="Author", published_at="2026-08-01",
            text="A relevant protocol sentence with enough detail for a useful search highlight.",
        )]

    monkeypatch.setattr(evidence_module, "fetch_pages", fake_pages)
    results = await structured_search("protocol detail", provider=provider, include_highlights=True)
    assert results[0].title == "Enriched title"
    assert results[0].author == "Author"
    assert results[0].highlights


@pytest.mark.asyncio
async def test_fetch_pages_uses_opt_in_browser_fallback(monkeypatch):
    monkeypatch.setattr(
        evidence_module,
        "fetch_page",
        lambda url, **kwargs: FetchedPage(
            url=url, canonical_url=None, title=None, text="",
            status="empty", error="needs javascript",
        ),
    )

    async def fake_render(url, **kwargs):
        return FetchedPage(
            url=url, canonical_url=url, title="Rendered",
            text="Rendered evidence", status="ok",
        )

    monkeypatch.setattr(evidence_module, "render_page", fake_render)
    pages = await fetch_pages(
        ["https://app.test/page"], browser_fallback=True
    )
    assert pages[0].title == "Rendered"
    assert pages[0].status == "ok"


@pytest.mark.asyncio
async def test_fetch_pages_enforces_aggregate_character_budget(monkeypatch):
    monkeypatch.setattr(
        evidence_module,
        "fetch_page",
        lambda url, **kwargs: FetchedPage(
            url=url, canonical_url=url, title="Page",
            text="x" * 40_000, status="ok",
        ),
    )
    pages = await fetch_pages(
        ["https://a.test/one", "https://a.test/two"],
        max_characters=20_000,
    )
    assert sum(len(page.text) for page in pages) <= 60_000
