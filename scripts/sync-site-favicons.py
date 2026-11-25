#!/usr/bin/env python3
"""Sync the favicon each deployed Elixpo site declares into the portal.

Every directory entry with a ``website`` is fetched, its best declared icon is
downloaded, resized to a 96px WebP in ``public/brand/favicons``, and recorded in
``content/site-favicons.json``. Directory cards then show the live site's icon
without loading third-party images at view time. Requires Pillow.
"""

from __future__ import annotations

import io
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "brand" / "favicons"
RECORD = ROOT / "content" / "site-favicons.json"
SIZE = 96
RANK = {"apple-touch-icon": 3, "icon": 2, "shortcut icon": 1}
HEADERS = {"User-Agent": "elixpo-portal-favicon-sync"}


def fetch(url: str) -> tuple[bytes, str]:
    with urlopen(Request(url, headers=HEADERS), timeout=15) as response:
        return response.read(), response.geturl()


def candidates(html: str, base: str) -> list[str]:
    """Largest declared raster icon first, then the conventional /favicon.ico."""
    links = []
    for tag in re.findall(r"<link\b[^>]*>", html, re.I):
        attr = lambda name: (re.search(rf'\b{name}\s*=\s*["\']([^"\']+)["\']', tag, re.I) or [None, None])[1]
        rel, href = (attr("rel") or "").lower(), attr("href")
        if href and rel in RANK and not href.lower().endswith(".svg"):
            declared = re.match(r"\d+", attr("sizes") or "")  # "any" or missing counts as 0
            size = int(declared.group()) if declared else 0
            links.append((size, RANK[rel], urljoin(base, href)))
    links.sort(reverse=True)
    return [url for *_, url in links] + [urljoin(base, "/favicon.ico")]


def main() -> int:
    directory = json.loads((ROOT / "content" / "directory.json").read_text())["entries"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    record: dict[str, dict[str, str]] = {}
    for repository, entry in directory.items():
        website = entry.get("website")
        if not website:
            continue
        try:
            html, final_url = fetch(website)
        except OSError as error:
            print(f"{repository}: {website} unreachable ({error})", file=sys.stderr)
            continue
        for url in candidates(html.decode("utf-8", "replace"), final_url):
            try:
                image = Image.open(io.BytesIO(fetch(url)[0])).convert("RGBA")  # .ico opens its largest frame
                image.thumbnail((SIZE, SIZE), Image.LANCZOS)
            except (OSError, ValueError):
                continue
            name = f"{repository}.webp"
            image.save(OUT_DIR / name, "WEBP", quality=90, method=6)
            record[repository] = {"path": f"/brand/favicons/{name}", "source": url.split("?")[0]}
            print(f"{repository}: {url}")
            break
        else:
            print(f"{repository}: no usable favicon at {website}", file=sys.stderr)

    payload = {"$schema": "./schemas/site-favicons.schema.json", "schemaVersion": 1, "lastVerified": date.today().isoformat(), "entries": record}
    RECORD.write_text(json.dumps(payload, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
