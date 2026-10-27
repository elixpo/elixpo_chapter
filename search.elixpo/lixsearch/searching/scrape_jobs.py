"""Async crawl and batch-scrape jobs for the Firecrawl-compatible API.

Job state lives in Redis (``SCRAPE_JOB_REDIS_DB``, keys under
``SCRAPE_JOB_KEY_PREFIX``) so any app replica can answer status requests. The
replica that accepted the job runs it as a background task in its own event
loop, with a per-worker cap on active jobs and on concurrent page fetches.
Everything expires after ``SCRAPE_JOB_TTL_SECONDS`` (24h).
"""
from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urldefrag, urlparse

from loguru import logger

from pipeline.config import (
    SCRAPE_JOB_HEARTBEAT_SECONDS,
    SCRAPE_JOB_KEY_PREFIX,
    SCRAPE_JOB_PAGE_CONCURRENCY,
    SCRAPE_JOB_REDIS_DB,
    SCRAPE_JOB_STALE_SECONDS,
    SCRAPE_JOB_STATUS_PAGE_SIZE,
    SCRAPE_JOB_TTL_SECONDS,
    SCRAPE_MAX_ACTIVE_JOBS,
)
from searching import scrape
from searching.scrape import ScrapeOptions

TERMINAL = {"completed", "failed", "cancelled"}


class JobStore:
    """Thin Redis wrapper. ``client`` is injectable for tests."""

    def __init__(self, client=None):
        self._client = client

    @property
    def client(self):
        if self._client is None:
            from pipeline.config import create_redis_client

            self._client = create_redis_client(db=SCRAPE_JOB_REDIS_DB, decode_responses=True)
        return self._client

    @staticmethod
    def _key(job_id: str, part: str) -> str:
        return f"{SCRAPE_JOB_KEY_PREFIX}:{job_id}:{part}"

    def create(self, job_id: str, meta: dict) -> None:
        self.client.set(self._key(job_id, "meta"), json.dumps(meta), ex=SCRAPE_JOB_TTL_SECONDS)

    def get(self, job_id: str) -> Optional[dict]:
        raw = self.client.get(self._key(job_id, "meta"))
        return json.loads(raw) if raw else None

    def update(self, job_id: str, **fields: Any) -> None:
        meta = self.get(job_id)
        if meta is None:
            return
        meta.update(fields)
        ttl = max(1, int(meta["expires_at"] - time.time()))
        self.client.set(self._key(job_id, "meta"), json.dumps(meta), ex=ttl)

    def append(self, job_id: str, doc: dict) -> None:
        key = self._key(job_id, "data")
        self.client.rpush(key, json.dumps(doc))
        self.client.expire(key, SCRAPE_JOB_TTL_SECONDS)

    def count(self, job_id: str) -> int:
        return int(self.client.llen(self._key(job_id, "data")))

    def page(self, job_id: str, skip: int, size: int) -> list[dict]:
        rows = self.client.lrange(self._key(job_id, "data"), skip, skip + size - 1)
        return [json.loads(row) for row in rows]

    def cancel(self, job_id: str) -> None:
        self.client.set(self._key(job_id, "cancel"), "1", ex=SCRAPE_JOB_TTL_SECONDS)

    def is_cancelled(self, job_id: str) -> bool:
        return bool(self.client.get(self._key(job_id, "cancel")))


_store: Optional[JobStore] = None
_tasks: set[asyncio.Task] = set()
_slots: dict[int, asyncio.Semaphore] = {}


def get_store() -> JobStore:
    global _store
    if _store is None:
        _store = JobStore()
    return _store


def set_store(store: Optional[JobStore]) -> None:
    """Swap the job store (tests)."""
    global _store
    _store = store


def _job_slots() -> asyncio.Semaphore:
    loop_id = id(asyncio.get_running_loop())
    if loop_id not in _slots:
        _slots[loop_id] = asyncio.Semaphore(max(1, SCRAPE_MAX_ACTIVE_JOBS))
    return _slots[loop_id]


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _new_job(kind: str, extra: dict) -> str:
    job_id = str(uuid.uuid4())
    now = time.time()
    get_store().create(job_id, {
        "kind": kind, "status": "scraping", "total": 0, "completed": 0,
        "created_at": now, "heartbeat_at": now, "expires_at": now + SCRAPE_JOB_TTL_SECONDS, "error": None, **extra,
    })
    return job_id


def _spawn(coro) -> None:
    task = asyncio.get_running_loop().create_task(coro)
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


def compile_patterns(patterns: Any, name: str, max_patterns: int) -> list[str]:
    if patterns is None:
        return []
    if not isinstance(patterns, list) or not all(isinstance(p, str) for p in patterns):
        raise ValueError(f"{name} must be an array of strings")
    if len(patterns) > max_patterns:
        raise ValueError(f"{name} may contain at most {max_patterns} patterns")
    for pattern in patterns:
        try:
            re.compile(pattern)
        except re.error as exc:
            raise ValueError(f"{name} contains an invalid regex: {pattern!r}") from exc
    return patterns


def _path_allowed(url: str, include: list[str], exclude: list[str]) -> bool:
    parsed = urlparse(url)
    path = parsed.path or "/"
    if parsed.query:
        path += "?" + parsed.query
    if exclude and any(re.search(p, path) for p in exclude):
        return False
    return not include or any(re.search(p, path) for p in include)


async def _heartbeat(job_id: str) -> None:
    store = get_store()
    while True:
        await asyncio.sleep(SCRAPE_JOB_HEARTBEAT_SECONDS)
        try:
            store.update(job_id, heartbeat_at=time.time())
        except Exception as exc:
            logger.warning(f"[Scrape] Job {job_id} heartbeat failed: {exc}")


async def _run_guarded(job_id: str, runner) -> None:
    store = get_store()
    beat = asyncio.get_running_loop().create_task(_heartbeat(job_id))
    try:
        async with _job_slots():
            await runner()
        if store.is_cancelled(job_id):
            store.update(job_id, status="cancelled")
        else:
            store.update(job_id, status="completed")
        logger.info(f"[Scrape] Job {job_id} finished")
    except asyncio.CancelledError:
        store.update(job_id, status="failed", error="Job interrupted by shutdown")
        raise
    except Exception as exc:
        logger.error(f"[Scrape] Job {job_id} failed: {type(exc).__name__}: {exc}")
        store.update(job_id, status="failed", error=str(exc)[:500])
    finally:
        beat.cancel()


async def _crawl(job_id: str, start_url: str, limit: int, max_depth: int, include: list[str],
                 exclude: list[str], options: ScrapeOptions) -> None:
    store = get_store()
    base_host = urlparse(start_url).hostname or ""
    seen = {urldefrag(start_url)[0]}
    frontier = [start_url]
    scheduled = completed = 0
    page_slots = asyncio.Semaphore(max(1, SCRAPE_JOB_PAGE_CONCURRENCY))

    async def scrape_one(url: str):
        async with page_slots:
            if store.is_cancelled(job_id):
                return []
            doc, links = await scrape.scrape_or_error(url, options, with_links=True)
        store.append(job_id, doc)
        return links

    for depth in range(max_depth + 1):
        if not frontier or store.is_cancelled(job_id):
            break
        batch = frontier[: limit - scheduled]
        scheduled += len(batch)
        store.update(job_id, total=scheduled)
        next_frontier: list[str] = []
        for coro in asyncio.as_completed([scrape_one(u) for u in batch]):
            links = await coro
            completed += 1
            store.update(job_id, completed=completed)
            if depth == max_depth:
                continue
            for link in links:
                link = urldefrag(link)[0]
                if (link not in seen and scrape.same_site(link, base_host)
                        and _path_allowed(link, include, exclude)):
                    seen.add(link)
                    next_frontier.append(link)
        frontier = next_frontier
        if scheduled >= limit:
            break


async def _batch(job_id: str, urls: list[str], options: ScrapeOptions) -> None:
    store = get_store()
    page_slots = asyncio.Semaphore(max(1, SCRAPE_JOB_PAGE_CONCURRENCY))
    completed = 0

    async def scrape_one(url: str):
        async with page_slots:
            if store.is_cancelled(job_id):
                return
            store.append(job_id, await scrape.scrape_or_error(url, options))

    for coro in asyncio.as_completed([scrape_one(u) for u in urls]):
        await coro
        completed += 1
        store.update(job_id, completed=completed)


def start_crawl(url: str, *, limit: int, max_depth: int, include_paths: list[str],
                exclude_paths: list[str], options: ScrapeOptions) -> str:
    job_id = _new_job("crawl", {"url": url, "total": 1})
    _spawn(_run_guarded(job_id, lambda: _crawl(job_id, url, limit, max_depth, include_paths, exclude_paths, options)))
    logger.info(f"[Scrape] Crawl {job_id} started for {url} limit={limit} maxDepth={max_depth}")
    return job_id


def start_batch(urls: list[str], options: ScrapeOptions) -> str:
    job_id = _new_job("batch", {"total": len(urls)})
    _spawn(_run_guarded(job_id, lambda: _batch(job_id, urls, options)))
    logger.info(f"[Scrape] Batch {job_id} started with {len(urls)} URLs")
    return job_id


def _is_stale(meta: dict) -> bool:
    last = meta.get("heartbeat_at")
    if last is None:
        last = meta.get("created_at", time.time())
    return time.time() - last > SCRAPE_JOB_STALE_SECONDS


def job_status(job_id: str, kind: str, *, skip: int = 0, next_base: Optional[str] = None) -> Optional[dict]:
    """Firecrawl-style status body, or None if the job does not exist / is another kind."""
    store = get_store()
    meta = store.get(job_id)
    if meta is None or meta.get("kind") != kind:
        return None
    status = meta["status"]
    if status not in TERMINAL and store.is_cancelled(job_id):
        status = "cancelled"
    elif status not in TERMINAL and _is_stale(meta):
        status = "failed"
        meta["error"] = "Job worker stopped responding"
        store.update(job_id, status=status, error=meta["error"])
        logger.warning(f"[Scrape] Job {job_id} marked failed: no heartbeat")
    stored = store.count(job_id)
    data = store.page(job_id, skip, SCRAPE_JOB_STATUS_PAGE_SIZE)
    body = {
        "success": True,
        "status": status,
        "total": meta.get("total", 0),
        "completed": meta.get("completed", 0),
        "expiresAt": _iso(meta["expires_at"]),
        "data": data,
    }
    if meta.get("error"):
        body["error"] = meta["error"]
    if skip + len(data) < stored:
        if next_base:
            body["next"] = f"{next_base}?skip={skip + len(data)}"
        else:
            body["next_skip"] = skip + len(data)
    return body


def cancel_job(job_id: str, kind: str) -> bool:
    store = get_store()
    meta = store.get(job_id)
    if meta is None or meta.get("kind") != kind:
        return False
    store.cancel(job_id)
    if meta["status"] not in TERMINAL:
        store.update(job_id, status="cancelled")
    logger.info(f"[Scrape] Job {job_id} cancelled")
    return True
