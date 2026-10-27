"""Tests for the Firecrawl-compatible scraping API (all network/IPC/LLM mocked)."""
import asyncio
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lixsearch"))
os.environ.setdefault("REDIS_PORT", "9530")
os.environ.setdefault("IPC_PORT", "9510")
# Importing app.* creates the image/content stores; keep them writable off-container.
for _var in ("IMAGE_STORE_DIR", "CONTENT_STORE_DIR"):
    try:
        os.makedirs(os.environ.get(_var) or "/app/data/cache/x", exist_ok=True)
    except OSError:
        import tempfile

        os.environ[_var] = tempfile.mkdtemp(prefix="lix-fc-")

from quart import Quart

import commons.auth_context as auth_context
import commons.url_safety as url_safety
from app.auth import install_api_auth
from app.gateways import firecrawl
from commons.url_safety import UnsafeURLError, check_public_url
from searching import scrape, scrape_jobs

API_KEY = "fc-test-secret"
AUTH = {"Authorization": f"Bearer {API_KEY}"}

DNS = {
    "example.com": {"93.184.216.34"},
    "www.example.com": {"93.184.216.34"},
    "docs.example.com": {"93.184.216.35"},
    "other.org": {"151.101.1.1"},
    "internal.test": {"10.0.0.5"},
    "rebind.test": {"93.184.216.34", "127.0.0.1"},
    "metadata.test": {"169.254.169.254"},
}

PAGES = {
    "https://example.com/": (
        '<html lang="en"><head><title>Home</title><meta name="description" content="Home page">'
        "</head><body><nav>menu</nav><main><h1>Welcome</h1><p>Hello <b>world</b> and "
        '<a href="/docs">docs</a>.</p><a href="/blog/post-1">Post</a><a href="/private/x">P</a>'
        '<a href="https://other.org/">ext</a><a href="https://docs.example.com/a">sub</a>'
        "<script>evil()</script></main></body></html>"
    ),
    "https://example.com/docs": (
        "<html><head><title>Docs</title></head><body><main><h2>Docs</h2><p>Read these docs carefully.</p>"
        '<a href="/docs/deep">deeper</a></main></body></html>'
    ),
    "https://example.com/blog/post-1": "<html><head><title>Post 1</title></head><body><p>First post body text.</p></body></html>",
    "https://example.com/docs/deep": "<html><head><title>Deep</title></head><body><p>Deep page body text.</p></body></html>",
    "https://example.com/private/x": "<html><head><title>Private</title></head><body><p>Private stuff here.</p></body></html>",
    "https://example.com/sitemap.xml": (
        '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        "<url><loc>https://example.com/pricing</loc></url><url><loc>https://other.org/x</loc></url>"
        "</urlset>"
    ),
}
REDIRECTS = {
    "https://example.com/redirect-private": "http://internal.test/admin",
    "https://example.com/redirect-ok": "/docs",
}


class FakeResponse:
    def __init__(self, status=200, body=b"", headers=None, payload=None):
        self.status_code = status
        self._body = body
        self.headers = headers or {}
        self._payload = payload
        self.is_redirect = status in (301, 302, 303, 307, 308)
        self.is_permanent_redirect = status in (301, 308)

    def iter_content(self, _size):
        yield self._body

    def close(self):
        pass

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


class FakeSession:
    calls: list = []

    def get(self, url, **_kwargs):
        FakeSession.calls.append(url)
        if url in REDIRECTS:
            return FakeResponse(302, headers={"location": REDIRECTS[url]})
        if url in PAGES:
            kind = "application/xml" if url.endswith(".xml") else "text/html; charset=utf-8"
            return FakeResponse(200, PAGES[url].encode(), {"content-type": kind})
        return FakeResponse(404, b"<html><body>missing</body></html>", {"content-type": "text/html"})

    def close(self):
        pass


class FakeRedis:
    def __init__(self):
        self.kv, self.lists = {}, {}

    def set(self, key, value, ex=None):
        self.kv[key] = value

    def get(self, key):
        return self.kv.get(key)

    def rpush(self, key, value):
        self.lists.setdefault(key, []).append(value)

    def expire(self, key, _ttl):
        return True

    def llen(self, key):
        return len(self.lists.get(key, []))

    def lrange(self, key, start, end):
        return self.lists.get(key, [])[start:end + 1]


@pytest.fixture(autouse=True)
def mocked_world(monkeypatch):
    monkeypatch.setenv("API_KEY", API_KEY)

    def fake_resolve(hostname, _port):
        if hostname not in DNS:
            raise UnsafeURLError(f"Hostname could not be resolved: {hostname}")
        return DNS[hostname]

    monkeypatch.setattr(url_safety, "resolve_host", fake_resolve)
    monkeypatch.setattr(scrape, "guarded_session", FakeSession)
    FakeSession.calls = []

    async def fake_render(url, timeout_ms, wait_for_ms, screenshot, full_page=False):
        html = PAGES.get(url, "<html><body><p>Rendered by browser.</p></body></html>")
        return scrape.RawPage(url=url, status_code=200, html=html,
                              screenshot="data:image/png;base64,iVBORw0KGgo=" if screenshot else None)

    monkeypatch.setattr(scrape, "browser_render", fake_render)

    async def fake_search(query, limit):
        return ["https://example.com/", "https://example.com/docs", "https://example.com/missing"][:limit]

    monkeypatch.setattr(scrape, "web_search_urls", fake_search)

    def fake_post(url, json=None, headers=None, timeout=None):
        fake_post.calls.append(json)
        return FakeResponse(200, payload={"choices": [{"message": {"content": '```json\n{"title": "Home", "count": 2}\n```'}}]})

    fake_post.calls = []
    monkeypatch.setattr(scrape.requests, "post", fake_post)
    monkeypatch.setattr(auth_context, "pollinations_auth_headers", lambda **_: {"Authorization": "Bearer x"})

    store = scrape_jobs.JobStore(FakeRedis())
    scrape_jobs.set_store(store)
    yield {"post": fake_post, "store": store}
    scrape_jobs.set_store(None)


@pytest.fixture
def client():
    app = Quart(__name__)
    install_api_auth(app)
    firecrawl.register(app)
    return app.test_client()


async def _wait_terminal(client, path, timeout=5.0):
    deadline = asyncio.get_running_loop().time() + timeout
    while True:
        body = await (await client.get(path, headers=AUTH)).get_json()
        if body["status"] in scrape_jobs.TERMINAL or asyncio.get_running_loop().time() > deadline:
            return body
        await asyncio.sleep(0.02)


# ---------------------------------------------------------------- auth ----

@pytest.mark.asyncio
async def test_auth_accepts_bearer_and_x_api_key_and_rejects_others(client):
    body = {"url": "https://example.com/"}
    missing = await client.post("/v1/scrape", json=body)
    assert missing.status_code == 401
    assert (await missing.get_json())["success"] is False
    wrong = await client.post("/v1/scrape", json=body, headers={"Authorization": "Bearer nope"})
    assert wrong.status_code == 403
    assert (await client.post("/v1/scrape", json=body, headers=AUTH)).status_code == 200
    assert (await client.post("/v1/scrape", json=body, headers={"X-API-Key": API_KEY})).status_code == 200
    assert (await client.get("/v1/crawl/unknown", headers={})).status_code == 401


# ---------------------------------------------------------- validation ----

@pytest.mark.asyncio
@pytest.mark.parametrize("path,payload,fragment", [
    ("/v1/scrape", {}, "url"),
    ("/v1/scrape", {"url": "https://example.com/", "formats": "markdown"}, "formats"),
    ("/v1/scrape", {"url": "https://example.com/", "formats": ["pdf"]}, "Unsupported format"),
    ("/v1/scrape", {"url": "https://example.com/", "timeout": 999_999}, "timeout"),
    ("/v1/scrape", {"url": "https://example.com/", "timeout": 2000, "waitFor": 5000}, "waitFor"),
    ("/v1/scrape", {"url": "https://example.com/", "onlyMainContent": "yes"}, "onlyMainContent"),
    ("/v1/search", {"query": ""}, "query"),
    ("/v1/search", {"query": "x", "limit": 21}, "limit"),
    ("/v1/map", {"url": "https://example.com/", "limit": 5001}, "limit"),
    ("/v1/crawl", {"url": "https://example.com/", "includePaths": ["("]}, "invalid regex"),
    ("/v1/crawl", {"url": "https://example.com/", "limit": 501}, "limit"),
    ("/v1/batch/scrape", {"urls": []}, "urls"),
    ("/v1/extract", {"urls": ["https://example.com/"]}, "prompt or schema"),
    ("/v1/extract", {"urls": [f"https://example.com/{i}" for i in range(11)], "prompt": "x"}, "at most 10"),
])
async def test_request_validation(client, path, payload, fragment):
    response = await client.post(path, json=payload, headers=AUTH)
    assert response.status_code == 400
    body = await response.get_json()
    assert body["success"] is False and fragment in body["error"]


@pytest.mark.asyncio
async def test_non_json_body_is_rejected(client):
    response = await client.post("/v1/scrape", data="not json", headers={**AUTH, "Content-Type": "application/json"})
    assert response.status_code == 400
    assert (await response.get_json())["success"] is False


# ----------------------------------------------------------------- SSRF ----

@pytest.mark.parametrize("url", [
    "http://127.0.0.1/",
    "http://localhost:8080/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://10.1.2.3/",
    "http://0.0.0.0/",
    "http://internal.test/",
    "http://rebind.test/",
    "http://metadata.test/",
    "http://metadata.google.internal/",
    "ftp://example.com/file",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://user:pw@example.com/",
])
def test_ssrf_guard_rejects(url):
    with pytest.raises(UnsafeURLError):
        check_public_url(url)


def test_ssrf_guard_accepts_public_http_and_https():
    assert check_public_url("http://example.com/a") == "http://example.com/a"
    assert check_public_url("https://example.com:8443/a?b=1") == "https://example.com:8443/a?b=1"


@pytest.mark.asyncio
@pytest.mark.parametrize("path,payload", [
    ("/v1/scrape", {"url": "http://169.254.169.254/latest/meta-data/"}),
    ("/v1/scrape", {"url": "http://internal.test/"}),
    ("/v1/map", {"url": "http://127.0.0.1/"}),
    ("/v1/crawl", {"url": "http://internal.test/"}),
    ("/v1/batch/scrape", {"urls": ["https://example.com/", "http://10.0.0.1/"]}),
    ("/v1/extract", {"urls": ["http://[::1]/"], "prompt": "x"}),
])
async def test_endpoints_reject_private_targets(client, path, payload):
    response = await client.post(path, json=payload, headers=AUTH)
    assert response.status_code == 400
    assert "URL rejected" in (await response.get_json())["error"]


@pytest.mark.asyncio
async def test_redirect_to_private_address_is_blocked(client):
    response = await client.post("/v1/scrape", json={"url": "https://example.com/redirect-private"}, headers=AUTH)
    assert response.status_code == 400
    assert "private" in (await response.get_json())["error"]
    assert "http://internal.test/admin" not in FakeSession.calls


@pytest.mark.asyncio
async def test_public_redirect_is_followed(client):
    response = await client.post("/v1/scrape", json={"url": "https://example.com/redirect-ok"}, headers=AUTH)
    data = (await response.get_json())["data"]
    assert data["metadata"]["url"] == "https://example.com/docs"
    assert data["metadata"]["sourceURL"] == "https://example.com/redirect-ok"


# ------------------------------------------------------ response shapes ----

@pytest.mark.asyncio
async def test_scrape_default_returns_markdown_and_metadata(client):
    response = await client.post("/v1/scrape", json={"url": "https://example.com/"}, headers=AUTH)
    body = await response.get_json()
    assert response.status_code == 200 and body["success"] is True
    data = body["data"]
    assert set(data) == {"markdown", "metadata"}
    assert "# Welcome" in data["markdown"]
    assert "**world**" in data["markdown"] and "[docs](https://example.com/docs)" in data["markdown"]
    assert "menu" not in data["markdown"] and "evil" not in data["markdown"]
    assert data["metadata"] == {
        "title": "Home", "description": "Home page", "language": "en",
        "sourceURL": "https://example.com/", "url": "https://example.com/", "statusCode": 200,
    }


@pytest.mark.asyncio
async def test_scrape_all_formats(client, mocked_world):
    payload = {
        "url": "https://example.com/",
        "formats": ["markdown", "html", "rawHtml", "links", "screenshot",
                    {"type": "json", "prompt": "Get the title", "schema": {"type": "object"}}],
        "onlyMainContent": False,
    }
    data = (await (await client.post("/v1/scrape", json=payload, headers=AUTH)).get_json())["data"]
    assert data["screenshot"].startswith("data:image/png;base64,")
    assert "<script>" in data["rawHtml"] and "<script>" not in data["html"]
    assert "menu" in data["markdown"]  # onlyMainContent=false keeps nav
    assert "https://example.com/docs" in data["links"] and "https://other.org/" in data["links"]
    assert data["json"] == {"title": "Home", "count": 2}
    sent = mocked_world["post"].calls[0]
    assert sent["model"] == scrape.LLM_MODEL and "Get the title" in sent["messages"][1]["content"]


@pytest.mark.asyncio
async def test_json_extraction_falls_back_to_second_model(client, monkeypatch):
    calls = []

    def flaky(url, json=None, headers=None, timeout=None):
        calls.append(json["model"])
        if len(calls) == 1:
            return FakeResponse(500)
        return FakeResponse(200, payload={"choices": [{"message": {"content": '{"ok": true}'}}]})

    monkeypatch.setattr(scrape, "LLM_MODEL", "primary")
    monkeypatch.setattr(scrape, "LLM_MODEL_FALLBACK", "fallback")
    monkeypatch.setattr(scrape.requests, "post", flaky)
    data = (await (await client.post("/v1/scrape", json={"url": "https://example.com/", "formats": [{"type": "json", "prompt": "x"}]}, headers=AUTH)).get_json())["data"]
    assert data["json"] == {"ok": True} and calls == ["primary", "fallback"]
    assert "markdown" not in data


@pytest.mark.asyncio
async def test_search_shapes(client):
    plain = await (await client.post("/v1/search", json={"query": "example", "limit": 2}, headers=AUTH)).get_json()
    assert plain["success"] is True
    assert plain["data"][0] == {"url": "https://example.com/", "title": "Home", "description": "Home page"}
    assert len(plain["data"]) == 2

    scraped = await (await client.post("/v1/search", json={"query": "example", "scrapeOptions": {"formats": ["markdown", "links"]}}, headers=AUTH)).get_json()
    first = scraped["data"][0]
    assert {"url", "title", "description", "markdown", "links", "metadata"} <= set(first)
    assert scraped["data"][2]["metadata"]["statusCode"] == 404


@pytest.mark.asyncio
async def test_map_combines_sitemap_and_page_links(client):
    body = await (await client.post("/v1/map", json={"url": "https://example.com/"}, headers=AUTH)).get_json()
    urls = [item["url"] for item in body["links"]]
    assert body["success"] is True
    assert urls[0] == "https://example.com/" and body["links"][0]["title"] == "Home"
    assert "https://example.com/pricing" in urls and "https://example.com/docs" in urls
    assert not any("other.org" in u or "docs.example.com" in u for u in urls)

    subs = await (await client.post("/v1/map", json={"url": "https://example.com/", "includeSubdomains": True}, headers=AUTH)).get_json()
    assert "https://docs.example.com/a" in [i["url"] for i in subs["links"]]

    searched = await (await client.post("/v1/map", json={"url": "https://example.com/", "search": "blog", "limit": 5}, headers=AUTH)).get_json()
    assert [i["url"] for i in searched["links"]] == ["https://example.com/blog/post-1"]

    limited = await (await client.post("/v1/map", json={"url": "https://example.com/", "limit": 2}, headers=AUTH)).get_json()
    assert len(limited["links"]) == 2


@pytest.mark.asyncio
async def test_extract_shape(client, mocked_world):
    body = await (await client.post("/v1/extract", json={
        "urls": ["https://example.com/", "https://example.com/docs"], "prompt": "Summarize", "schema": {"type": "object"},
    }, headers=AUTH)).get_json()
    assert body == {"success": True, "data": {"title": "Home", "count": 2}}
    content = mocked_world["post"].calls[0]["messages"][1]["content"]
    assert "Source: https://example.com/docs" in content


@pytest.mark.asyncio
async def test_extract_fails_cleanly_when_no_page_scrapes(client, monkeypatch):
    monkeypatch.setattr(scrape, "SCRAPE_BROWSER_FALLBACK", False)

    def boom(*_a, **_k):
        raise scrape.ScrapeError("down")

    monkeypatch.setattr(scrape, "http_fetch", boom)
    response = await client.post("/v1/extract", json={"urls": ["https://example.com/"], "prompt": "x"}, headers=AUTH)
    assert response.status_code == 502
    assert (await response.get_json()) == {"success": False, "error": "None of the URLs could be scraped"}


# ------------------------------------------------------- job lifecycle ----

@pytest.mark.asyncio
async def test_crawl_job_lifecycle(client, monkeypatch):
    started = await client.post("/v1/crawl", json={
        "url": "https://example.com/", "limit": 10, "maxDepth": 1,
        "excludePaths": ["^/private"], "scrapeOptions": {"formats": ["markdown"]},
    }, headers={**AUTH, "X-Forwarded-Proto": "https", "Host": "api.test"})
    body = await started.get_json()
    assert started.status_code == 200 and body["success"] is True
    job_id = body["id"]
    assert body["url"] == f"https://api.test/v1/crawl/{job_id}" or body["url"].endswith(f"/v1/crawl/{job_id}")

    status = await _wait_terminal(client, f"/v1/crawl/{job_id}")
    assert status["status"] == "completed"
    sources = sorted(doc["metadata"]["sourceURL"] for doc in status["data"])
    # depth 0 = start page, depth 1 = same-host links minus excluded /private; /docs/deep is depth 2
    assert sources == ["https://example.com/", "https://example.com/blog/post-1", "https://example.com/docs"]
    assert status["total"] == 3 and status["completed"] == 3
    assert status["expiresAt"].endswith("Z")
    assert all("markdown" in doc for doc in status["data"])

    # Pagination via `next`
    monkeypatch.setattr(scrape_jobs, "SCRAPE_JOB_STATUS_PAGE_SIZE", 2)
    page1 = await (await client.get(f"/v1/crawl/{job_id}", headers=AUTH)).get_json()
    assert len(page1["data"]) == 2 and page1["next"].endswith(f"/v1/crawl/{job_id}?skip=2")
    page2 = await (await client.get(f"/v1/crawl/{job_id}?skip=2", headers=AUTH)).get_json()
    assert len(page2["data"]) == 1 and "next" not in page2

    # Wrong job kind and unknown ids are 404
    assert (await client.get(f"/v1/batch/scrape/{job_id}", headers=AUTH)).status_code == 404
    missing = await client.get("/v1/crawl/does-not-exist", headers=AUTH)
    assert missing.status_code == 404 and (await missing.get_json())["success"] is False


@pytest.mark.asyncio
async def test_crawl_respects_limit_and_include_paths(client):
    body = await (await client.post("/v1/crawl", json={
        "url": "https://example.com/", "limit": 2, "maxDepth": 3, "includePaths": ["^/docs"],
    }, headers=AUTH)).get_json()
    status = await _wait_terminal(client, f"/v1/crawl/{body['id']}")
    sources = [doc["metadata"]["sourceURL"] for doc in status["data"]]
    assert status["status"] == "completed" and len(sources) == 2
    assert set(sources) == {"https://example.com/", "https://example.com/docs"}


@pytest.mark.asyncio
async def test_crawl_cancel(client, monkeypatch):
    release = asyncio.Event()
    original = scrape.scrape_or_error

    async def slow(url, options, *, with_links=False):
        await release.wait()
        return await original(url, options, with_links=with_links)

    monkeypatch.setattr(scrape, "scrape_or_error", slow)
    body = await (await client.post("/v1/crawl", json={"url": "https://example.com/"}, headers=AUTH)).get_json()
    job_id = body["id"]
    running = await (await client.get(f"/v1/crawl/{job_id}", headers=AUTH)).get_json()
    assert running["status"] == "scraping"

    cancelled = await client.delete(f"/v1/crawl/{job_id}", headers=AUTH)
    assert (await cancelled.get_json()) == {"success": True, "status": "cancelled"}
    release.set()
    final = await _wait_terminal(client, f"/v1/crawl/{job_id}")
    assert final["status"] == "cancelled"
    assert (await client.delete("/v1/crawl/nope", headers=AUTH)).status_code == 404


@pytest.mark.asyncio
async def test_batch_scrape_lifecycle(client):
    started = await (await client.post("/v1/batch/scrape", json={
        "urls": ["https://example.com/", "https://example.com/docs", "https://example.com/docs", "https://example.com/missing"],
        "formats": ["markdown", "links"],
    }, headers=AUTH)).get_json()
    assert started["success"] is True and started["url"].endswith(f"/v1/batch/scrape/{started['id']}")
    status = await _wait_terminal(client, f"/v1/batch/scrape/{started['id']}")
    assert status["status"] == "completed" and status["total"] == 3 and status["completed"] == 3
    by_url = {doc["metadata"]["sourceURL"]: doc for doc in status["data"]}
    assert "links" in by_url["https://example.com/"]
    assert by_url["https://example.com/missing"]["metadata"]["statusCode"] == 404
    assert (await client.get(f"/v1/crawl/{started['id']}", headers=AUTH)).status_code == 404


@pytest.mark.asyncio
async def test_batch_records_failed_pages_without_failing_job(client, monkeypatch):
    def fake_resolve(hostname, _port):
        if hostname == "late-private.test":
            return {"192.168.1.10"}
        return DNS[hostname]

    monkeypatch.setattr(url_safety, "resolve_host", fake_resolve)
    started = await (await client.post("/v1/batch/scrape", json={
        "urls": ["https://example.com/", "https://late-private.test/"],
    }, headers=AUTH)).get_json()
    status = await _wait_terminal(client, f"/v1/batch/scrape/{started['id']}")
    assert status["status"] == "completed"
    failed = [d for d in status["data"] if d["metadata"].get("error")]
    assert len(failed) == 1 and "private" in failed[0]["metadata"]["error"]


def test_connect_public_blocks_dns_rebinding(monkeypatch):
    # The pre-check saw a public IP; at connect time the name now points inward.
    monkeypatch.setattr(url_safety, "resolve_host", lambda host, port: {"10.0.0.5"})
    with pytest.raises(UnsafeURLError):
        url_safety.connect_public("rebind.test", 443, timeout=1)


def test_gzip_sitemap_body_is_inflated():
    import gzip
    xml = b"<urlset><url><loc>https://a.test/x</loc></url></urlset>"
    assert scrape._gunzip_limited(gzip.compress(xml)) == xml
    assert scrape._gunzip_limited(xml) == xml


def test_gzip_bomb_is_rejected():
    import gzip
    bomb = gzip.compress(b"\0" * (scrape.SCRAPE_MAX_RESPONSE_BYTES + 1))
    with pytest.raises(scrape.ScrapeError):
        scrape._gunzip_limited(bomb)


def test_stale_job_is_reported_failed(monkeypatch):
    job_id = scrape_jobs._new_job("crawl", {})
    store = scrape_jobs.get_store()
    store.update(job_id, heartbeat_at=0)
    body = scrape_jobs.job_status(job_id, "crawl")
    assert body["status"] == "failed"
    assert "stopped responding" in body["error"]
    assert store.get(job_id)["status"] == "failed"


def test_live_job_is_not_stale():
    job_id = scrape_jobs._new_job("crawl", {})
    assert scrape_jobs.job_status(job_id, "crawl")["status"] == "scraping"
