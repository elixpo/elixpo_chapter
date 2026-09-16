import logging
import os
import time
import threading
from quart import Response, request

from commons.artifact_access import artifact_access_allowed, prepare_artifact_access

logger = logging.getLogger("lixsearch-api")

CONTENT_DIR = os.environ.get("CONTENT_STORE_DIR", "/app/data/cache/content")
CONTENT_TTL_SECONDS = int(os.environ.get("CONTENT_TTL_SECONDS", "604800"))  # 7 days

os.makedirs(CONTENT_DIR, exist_ok=True)

_cleanup_lock = threading.Lock()
_last_cleanup = 0.0


def store_content(content_id: str, data: bytes, extension: str = ".pdf") -> str | None:

    capability = prepare_artifact_access(CONTENT_DIR, content_id)
    path = os.path.join(CONTENT_DIR, f"{content_id}{extension}")
    with open(path, "wb") as f:
        f.write(data)
    logger.debug(f"[Content] Stored {content_id} ({len(data)} bytes, {extension})")
    return capability


def _content_type_from_ext(ext: str) -> str:
    return {
        ".pdf": "application/pdf",
        ".html": "text/html",
        ".json": "application/json",
        ".txt": "text/plain",
    }.get(ext, "application/octet-stream")


def _cleanup_expired_content() -> None:

    global _last_cleanup
    now = time.time()
    if now - _last_cleanup < 1800:
        return
    with _cleanup_lock:
        if now - _last_cleanup < 1800:
            return
        _last_cleanup = now
        removed = 0
        try:
            for fname in os.listdir(CONTENT_DIR):
                fpath = os.path.join(CONTENT_DIR, fname)
                if not os.path.isfile(fpath):
                    continue
                age = now - os.path.getmtime(fpath)
                if age > CONTENT_TTL_SECONDS:
                    os.remove(fpath)
                    removed += 1
        except Exception as e:
            logger.warning(f"[Content] Cleanup error: {e}")
        if removed:
            logger.info(f"[Content] Cleaned up {removed} expired files")


async def serve_content(content_id: str):

    # Strip extension from ID if present (e.g. "my-doc-abc123.pdf" → "my-doc-abc123")
    content_id = os.path.splitext(content_id)[0]

    if not artifact_access_allowed(CONTENT_DIR, content_id, request.args.get("access", "")):
        return Response("Content not found", status=404)

    _cleanup_expired_content()

    for fname in os.listdir(CONTENT_DIR):
        name, ext = os.path.splitext(fname)
        if name == content_id:
            fpath = os.path.join(CONTENT_DIR, fname)
            try:
                with open(fpath, "rb") as f:
                    data = f.read()
                content_type = _content_type_from_ext(ext)
                headers = {
                    "Cache-Control": "private, max-age=86400",
                }
                if content_type == "application/pdf":
                    headers["Content-Disposition"] = f'inline; filename="{content_id}.pdf"'
                return Response(data, content_type=content_type, headers=headers)
            except Exception as e:
                logger.error(f"[Content] Failed to read {fpath}: {e}")
                return Response("Content read error", status=500)

    return Response("Content not found", status=404)
