import logging
import os
import time
import threading
from quart import Response, request

from commons.artifact_access import artifact_access_allowed, prepare_artifact_access

logger = logging.getLogger("lixsearch-api")

IMAGE_DIR = os.environ.get("IMAGE_STORE_DIR", "/app/data/cache/images")
IMAGE_TTL_SECONDS = int(os.environ.get("IMAGE_TTL_SECONDS", "604800"))  # 7 days default

os.makedirs(IMAGE_DIR, exist_ok=True)

_cleanup_lock = threading.Lock()
_last_cleanup = 0.0


def _ext_from_content_type(ct: str) -> str:
    return {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(ct, ".png")


def _content_type_from_ext(ext: str) -> str:
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "image/png")


def store_image(image_id: str, data: bytes, content_type: str = "image/png") -> str | None:

    capability = prepare_artifact_access(IMAGE_DIR, image_id)
    ext = _ext_from_content_type(content_type)
    path = os.path.join(IMAGE_DIR, f"{image_id}{ext}")
    with open(path, "wb") as f:
        f.write(data)
    logger.debug(f"[Image] Stored {image_id} ({len(data)} bytes, {content_type})")
    return capability


def _cleanup_expired_images() -> None:

    global _last_cleanup
    now = time.time()
    if now - _last_cleanup < 600:
        return
    with _cleanup_lock:
        if now - _last_cleanup < 600:
            return
        _last_cleanup = now
        removed = 0
        try:
            for fname in os.listdir(IMAGE_DIR):
                fpath = os.path.join(IMAGE_DIR, fname)
                if not os.path.isfile(fpath):
                    continue
                age = now - os.path.getmtime(fpath)
                if age > IMAGE_TTL_SECONDS:
                    os.remove(fpath)
                    removed += 1
        except Exception as e:
            logger.warning(f"[Image] Cleanup error: {e}")
        if removed:
            logger.info(f"[Image] Cleaned up {removed} expired images")


async def serve_image(image_id: str):

    import asyncio

    # Strip extension from ID if present (e.g. "abc123.png" → "abc123")
    image_id = os.path.splitext(image_id)[0]

    if not artifact_access_allowed(IMAGE_DIR, image_id, request.args.get("access", "")):
        return Response("Image not found", status=404)

    _cleanup_expired_images()

    # Try to find the file, with back-off for in-progress generation
    delays = [0.5, 1, 2, 3, 4, 5, 5, 5, 5]  # ~30s total
    for attempt in range(len(delays) + 1):
        for fname in os.listdir(IMAGE_DIR):
            name, ext = os.path.splitext(fname)
            if name == image_id:
                fpath = os.path.join(IMAGE_DIR, fname)
                try:
                    with open(fpath, "rb") as f:
                        data = f.read()
                    content_type = _content_type_from_ext(ext)
                    return Response(data, content_type=content_type, headers={
                        "Cache-Control": "private, max-age=86400",
                    })
                except Exception as e:
                    logger.error(f"[Image] Failed to read {fpath}: {e}")
                    return Response("Image read error", status=500)

        if attempt < len(delays):
            await asyncio.sleep(delays[attempt])

    return Response("Image not found", status=404)
