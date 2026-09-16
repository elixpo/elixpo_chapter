import asyncio
import random
import os
import uuid
import requests
from urllib.parse import quote
from commons.environment import load_local_environment
from commons.auth_context import pollinations_auth_headers
from loguru import logger
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.config import POLLINATIONS_ENDPOINT_IMAGE, IMAGE_MODEL1, IMAGE_MODEL2

load_local_environment()

_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://search.elixpo.com").rstrip("/")
_IMAGE_MODELS = list(dict.fromkeys([IMAGE_MODEL1, IMAGE_MODEL2]))


async def _try_generate(prompt: str, model: str, seed: int, headers: dict, timeout: int = 60) -> tuple[bytes, str]:
    upstream_url = (
        f"{POLLINATIONS_ENDPOINT_IMAGE}{quote(prompt)}"
        f"?model={model}&height=462&width=768&seed={seed}&quality=hd&enhance=true"
    )
    logger.info(f"[Image] Trying model={model} seed={seed} url={upstream_url[:180]}")

    response = await asyncio.to_thread(
        requests.get, upstream_url, headers=headers, timeout=timeout
    )
    response.raise_for_status()

    content_type = response.headers.get("Content-Type", "image/png")
    if not content_type.startswith("image/"):
        raise ValueError(f"Expected image, got Content-Type: {content_type}")
    if len(response.content) < 1000:
        raise ValueError(f"Response too small to be an image: {len(response.content)} bytes")

    return response.content, content_type


async def create_image_from_prompt(prompt: str) -> str:
    seed = random.randint(0, 10000)
    image_id = str(uuid.uuid4())
    headers = pollinations_auth_headers(json_content=False)

    t0 = time.perf_counter()
    last_error = None

    for model in _IMAGE_MODELS:
        try:
            image_bytes, content_type = await _try_generate(prompt, model, seed, headers)
            from app.gateways.image import store_image
            capability = store_image(image_id, image_bytes, content_type)
            access = f"?access={quote(capability, safe='')}" if capability else ""
            url = f"{_BASE_URL}/api/image/{image_id}.png{access}"
            elapsed = time.perf_counter() - t0
            logger.info(f"[Image] Generated with {model} (seed={seed}) in {elapsed:.2f}s ({len(image_bytes)} bytes) -> {image_id}")
            return url
        except Exception as e:
            last_error = e
            logger.warning(f"[Image] {model} failed: {type(e).__name__}: {e}")

    logger.error(f"[Image] All models failed for seed={seed} | last error: {last_error}")
    raise RuntimeError(f"Image generation failed with all models: {last_error}")


if __name__ == "__main__":
    async def main():
        prompt = "A lone celestial sorceress standing atop a crystalline tower, her flowing iridescent robes dissolving into trails of stardust, overlooking an endless ocean of glowing nebulae and floating ancient ruins, dramatic golden-hour lighting piercing through cosmic clouds, ultra-detailed digital painting, cinematic atmosphere"
        print(f"Generating image for: {prompt[:60]}...")
        try:
            url = await create_image_from_prompt(prompt)
            print(f"Success: {url}")
        except Exception as e:
            print(f"Failed: {e}")

    asyncio.run(main())
