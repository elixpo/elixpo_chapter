"""HTTP handlers for the Firecrawl-compatible API (/v1/scrape, /v1/crawl, ...).

Responses follow the contract: success bodies carry ``success: true`` and
errors are ``{"success": false, "error": "<message>"}`` with a 4xx/5xx status.
"""
from __future__ import annotations

from loguru import logger
from quart import jsonify, request

from commons.url_safety import UnsafeURLError
from pipeline.config import SCRAPE_PUBLIC_BASE_URL
from searching import scrape_api
from searching.scrape import ScrapeError


def _error(message: str, status: int):
    return jsonify({"success": False, "error": message}), status


def _base_url() -> str:
    if SCRAPE_PUBLIC_BASE_URL:
        return SCRAPE_PUBLIC_BASE_URL
    proto = (request.headers.get("X-Forwarded-Proto") or request.scheme or "https").split(",")[0].strip()
    host = request.headers.get("X-Forwarded-Host") or request.headers.get("Host") or request.host
    return f"{proto}://{host.split(',')[0].strip()}"


async def _json_body():
    return await request.get_json(force=True, silent=True)


async def _run(handler, *args):
    try:
        return jsonify(await handler(*args)), 200
    except UnsafeURLError as exc:
        logger.warning(f"[Scrape] Rejected URL on {request.path}: {exc}")
        return _error(f"URL rejected: {exc}", 400)
    except ValueError as exc:
        return _error(str(exc), 400)
    except ScrapeError as exc:
        return _error(str(exc), exc.status)
    except Exception as exc:
        logger.error(f"[Scrape] {request.path} failed: {type(exc).__name__}: {exc}", exc_info=True)
        return _error("Internal error while processing the request", 500)


async def scrape_endpoint():
    return await _run(scrape_api.do_scrape, await _json_body())


async def search_endpoint():
    return await _run(scrape_api.do_search, await _json_body())


async def map_endpoint():
    return await _run(scrape_api.do_map, await _json_body())


async def extract_endpoint():
    return await _run(scrape_api.do_extract, await _json_body())


async def crawl_start():
    return await _run(scrape_api.do_crawl, await _json_body(), _base_url())


async def batch_start():
    return await _run(scrape_api.do_batch, await _json_body(), _base_url())


def _skip() -> int:
    try:
        return max(0, int(request.args.get("skip", "0")))
    except ValueError:
        return 0


async def _status(job_id: str, kind: str):
    try:
        body = scrape_api.job_status(job_id, kind, _skip(), _base_url())
    except Exception as exc:
        logger.error(f"[Scrape] Status lookup failed for {job_id}: {type(exc).__name__}: {exc}")
        return _error("Job store unavailable", 503)
    if body is None:
        return _error("Job not found", 404)
    return jsonify(body), 200


async def _cancel(job_id: str, kind: str):
    try:
        found = scrape_api.cancel(job_id, kind)
    except Exception as exc:
        logger.error(f"[Scrape] Cancel failed for {job_id}: {type(exc).__name__}: {exc}")
        return _error("Job store unavailable", 503)
    if not found:
        return _error("Job not found", 404)
    return jsonify({"success": True, "status": "cancelled"}), 200


async def crawl_status(job_id: str):
    return await _status(job_id, "crawl")


async def crawl_cancel(job_id: str):
    return await _cancel(job_id, "crawl")


async def batch_status(job_id: str):
    return await _status(job_id, "batch")


async def batch_cancel(job_id: str):
    return await _cancel(job_id, "batch")


def register(app) -> None:
    app.route("/v1/scrape", methods=["POST"])(scrape_endpoint)
    app.route("/v1/search", methods=["POST"])(search_endpoint)
    app.route("/v1/map", methods=["POST"])(map_endpoint)
    app.route("/v1/extract", methods=["POST"])(extract_endpoint)
    app.route("/v1/crawl", methods=["POST"])(crawl_start)
    app.route("/v1/crawl/<job_id>", methods=["GET"])(crawl_status)
    app.route("/v1/crawl/<job_id>", methods=["DELETE"])(crawl_cancel)
    app.route("/v1/batch/scrape", methods=["POST"])(batch_start)
    app.route("/v1/batch/scrape/<job_id>", methods=["GET"])(batch_status)
    app.route("/v1/batch/scrape/<job_id>", methods=["DELETE"])(batch_cancel)
