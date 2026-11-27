#!/usr/bin/env python3
"""Render the FaleraOS sponsor deck to PNGs and a PDF.

Every slides/*.html, in filename order, is opened in headless Chromium at
1920x1080 and saved as out/01.png, out/02.png, ...; then all the PNGs go
into out/FaleraOS-pitch.pdf, one page per slide, losslessly (each page is
the PNG's pixels, Flate-compressed, on a 13.333 x 7.5 in 16:9 page).

    python3 render.py               # every slide, then the PDF
    python3 render.py --only 04     # just slides/04-*.html (no PDF)
    python3 render.py --scale 2     # 3840x2160 PNGs, crisper PDF
    python3 render.py --out ~/Documents/falera-pitch

Needs Playwright for Python and Pillow:

    python3 -m pip install playwright pillow
    python3 -m playwright install chromium-headless-shell

The browser is, in order: $CHROME if set, Playwright's chrome-headless-shell
from its browser cache, then Playwright's own Chromium.
"""

from __future__ import annotations

import argparse
import glob
import os
import re
import sys
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
SLIDES = HERE / "slides"
W, H = 1920, 1080
PDF_NAME = "FaleraOS-pitch.pdf"


def slide_files() -> list[Path]:
    files = sorted(SLIDES.glob("*.html"))
    if not files:
        sys.exit(f"No slides found in {SLIDES}")
    return files


def check_footers(files: list[Path]) -> None:
    """Warn when a footer's "n / N" doesn't match the file's position."""
    total = len(files)
    for i, f in enumerate(files, 1):
        m = re.search(r'class="num">\s*(\d+)\s*/\s*(\d+)\s*<', f.read_text(encoding="utf-8"))
        if not m:
            print(f"warning: {f.name}: no footer number found", file=sys.stderr)
        elif (int(m.group(1)), int(m.group(2))) != (i, total):
            print(
                f"warning: {f.name}: footer says {m.group(1)} / {m.group(2)}, "
                f"but it is slide {i} / {total}",
                file=sys.stderr,
            )


def find_headless_shell() -> str | None:
    env = os.environ.get("CHROME")
    if env:
        return env
    roots = [os.environ.get("PLAYWRIGHT_BROWSERS_PATH"), os.path.expanduser("~/.cache/ms-playwright"),
             os.path.expanduser("~/Library/Caches/ms-playwright")]
    for root in filter(None, roots):
        hits = sorted(glob.glob(os.path.join(
            root, "chromium_headless_shell-*", "chrome-*", "chrome-headless-shell*")))
        hits = [h for h in hits if os.path.isfile(h) and os.access(h, os.X_OK)]
        if hits:
            return hits[-1]
    return None


def launch(p):
    shell = find_headless_shell()
    if shell:
        try:
            return p.chromium.launch(executable_path=shell)
        except Exception as e:  # noqa: BLE001 - fall back to Playwright's own build
            print(f"warning: could not start {shell}: {e}", file=sys.stderr)
    try:
        return p.chromium.launch()
    except Exception as e:  # noqa: BLE001
        sys.exit(
            "No usable Chromium. Install one with\n"
            "    python3 -m playwright install chromium-headless-shell\n"
            "or point $CHROME at a Chrome/Chromium binary.\n"
            f"({e})"
        )


WAIT_FOR_ASSETS = """async () => {
  await document.fonts.ready;
  await Promise.all(Array.from(document.images).map(img =>
    img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
  const broken = Array.from(document.images)
    .filter(img => !img.naturalWidth).map(img => img.getAttribute('src'));
  return broken;
}"""


# Wait for two animation frames so the page has painted before the capture.
PAINTED = "() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"


def shoot(browser, page, f: Path, png: Path, scale: float, tries: int = 3):
    """Screenshot the slide, retrying Chromium's intermittent "Unable to
    capture screenshot" (no frame painted yet, often under memory pressure)
    with a pause, then on a fresh page. Returns the page to keep using."""
    for attempt in range(1, tries + 1):
        try:
            page.evaluate(PAINTED)
            page.screenshot(path=str(png), clip={"x": 0, "y": 0, "width": W, "height": H},
                            animations="disabled")
            return page
        except Exception as e:  # noqa: BLE001 - Playwright raises a generic Error
            if attempt == tries:
                sys.exit(f"{f.name}: screenshot failed after {tries} tries: {e}")
            print(f"warning: {f.name}: screenshot failed ({e.__class__.__name__}), retrying",
                  file=sys.stderr)
            page.wait_for_timeout(500 * attempt)
            if attempt == tries - 1:
                page.close()
                page = browser.new_page(viewport={"width": W, "height": H},
                                        device_scale_factor=scale)
                page.goto(f.as_uri(), wait_until="load")
                page.evaluate(WAIT_FOR_ASSETS)
    return page


def render(files: list[tuple[int, Path]], out: Path, scale: float) -> list[Path]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("Playwright is missing: python3 -m pip install playwright pillow")

    written = []
    with sync_playwright() as p:
        browser = launch(p)
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=scale)
        for n, f in files:
            page.goto(f.as_uri(), wait_until="load")
            broken = page.evaluate(WAIT_FOR_ASSETS)
            for src in broken:
                print(f"warning: {f.name}: image did not load: {src}", file=sys.stderr)
            png = out / f"{n:02d}.png"
            page = shoot(browser, page, f, png, scale)
            print(png)
            written.append(png)
        browser.close()
    return written


def write_pdf(pngs: list[Path], pdf: Path) -> None:
    """A minimal PDF writer: one 16:9 page per PNG, pixels kept exactly."""
    from PIL import Image

    objs: list[bytes] = []

    def add(data: bytes) -> int:
        objs.append(data)
        return len(objs)

    pw, ph = 960, 540  # points: 13.333 x 7.5 in
    pages_id = add(b"")  # filled in below
    kids = []
    for png in pngs:
        with Image.open(png) as im:
            im = im.convert("RGB")
            w, h = im.size
            raw = zlib.compress(im.tobytes(), 9)
        img = add(
            b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB "
            b"/BitsPerComponent 8 /Filter /FlateDecode /Length %d >>\nstream\n" % (w, h, len(raw))
            + raw
            + b"\nendstream"
        )
        content = b"q %d 0 0 %d 0 0 cm /Im0 Do Q" % (pw, ph)
        cid = add(b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream")
        kids.append(add(
            b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %d %d] "
            b"/Resources << /XObject << /Im0 %d 0 R >> >> /Contents %d 0 R >>"
            % (pages_id, pw, ph, img, cid)
        ))
    objs[pages_id - 1] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (
        b" ".join(b"%d 0 R" % k for k in kids), len(kids))
    info = add(b"<< /Title (FaleraOS sponsor deck) /Author (Elixpo) >>")
    catalog = add(b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id)

    buf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, data in enumerate(objs, 1):
        offsets.append(len(buf))
        buf += b"%d 0 obj\n" % i + data + b"\nendobj\n"
    xref = len(buf)
    buf += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for off in offsets:
        buf += b"%010d 00000 n \n" % off
    buf += b"trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objs) + 1, catalog, info, xref)
    pdf.write_bytes(bytes(buf))


def main() -> None:
    ap = argparse.ArgumentParser(description="Render slides/*.html to PNGs and a PDF.")
    ap.add_argument("--only", metavar="NN", help="render one slide, by its number (e.g. 04); skips the PDF")
    ap.add_argument("--out", default=str(HERE / "out"), help="output folder (default: pitch-deck/out)")
    ap.add_argument("--scale", type=float, default=1, help="device scale factor (default: 1; 2 for 3840x2160)")
    args = ap.parse_args()

    files = slide_files()
    check_footers(files)
    numbered = list(enumerate(files, 1))
    if args.only:
        numbered = [(n, f) for n, f in numbered if n == int(args.only)]
        if not numbered:
            sys.exit(f"No slide {args.only}; there are {len(files)}.")

    out = Path(os.path.expanduser(args.out))
    out.mkdir(parents=True, exist_ok=True)
    pngs = render(numbered, out, args.scale)

    if args.only:
        return
    pdf = out / PDF_NAME
    write_pdf(pngs, pdf)
    print(f"{pdf} ({len(pngs)} pages)")


if __name__ == "__main__":
    main()
