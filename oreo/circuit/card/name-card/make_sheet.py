#!/usr/bin/env python3
"""Lay the cards in cards/ out six to an A4 sheet, ready to print and cut.

Each card is printed from its HTML to a PDF page exactly the card's size
(cards/<handle>.html?card), and six of those pages are placed on A4: two
columns, three rows, centred, with gaps to cut between and crop marks at
every corner. The cards stay vector, so text and the QR code print sharp.
Spare places on the last sheet get just the cut line.

Cards go in people.json order (so No. 01, 02, ... read across the sheet);
any card in cards/ that isn't in people.json follows, by name.

Run:
    python3 make_cards.py    # build cards/ first
    python3 make_sheet.py    # renders/sheet-1.pdf (+ sheet-1.png), ...

Needs pypdf (pip install pypdf) and a headless Chromium (see make_cards.py,
or set CHROME). The PNG preview needs pdftoppm (poppler-utils), if present.
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from pypdf import PageObject, PdfReader, PdfWriter, Transformation
from pypdf.generic import DecodedStreamObject, NameObject

from make_cards import HERE, HT, W, chrome   # HT: the card with its fold-back tab

PER_SHEET = 6
A4_W, A4_H = 210.0, 297.0
GAP_X, GAP_Y = 10.0, 14.0                   # space between cards, for cutting
X0 = (A4_W - 2 * W - GAP_X) / 2              # top-left of the first card
Y0 = (A4_H - 3 * HT - 2 * GAP_Y) / 2
MARK, MARK_OFF = 3.0, 1.5                    # crop mark length and gap from the corner
PT = 72 / 25.4                               # points per millimetre


def card_files():
    """cards/*.html in people.json order, then any others by name."""
    files = {f.stem: f for f in (HERE / "cards").glob("*.html")}
    order = [p["handle"] for p in json.loads((HERE / "people.json").read_text())]
    return [files.pop(h) for h in order if h in files] + [files[k] for k in sorted(files)]


def card_pdf(exe, html, mode, out):
    """Print one card page to a card-sized PDF (mode: 'card' or 'blank')."""
    subprocess.run([exe, "--headless", "--no-sandbox", "--allow-file-access-from-files",
                    "--no-pdf-header-footer", f"--print-to-pdf={out}",
                    html.resolve().as_uri() + "?" + mode], capture_output=True, check=True)
    return PdfReader(out).pages[0]


def crop_marks(x, y):
    """PDF drawing operators for the crop marks of a card at (x, y) mm from the
    sheet's top-left (PDF's origin is bottom-left, in points)."""
    ops = []
    for cx, cy in ((x, y), (x + W, y), (x, y + HT), (x + W, y + HT)):
        sx = 1 if cx > x else -1
        sy = 1 if cy > y else -1
        for (ax, ay), (bx, by) in (
            ((cx + sx * MARK_OFF, cy), (cx + sx * (MARK_OFF + MARK), cy)),   # horizontal
            ((cx, cy + sy * MARK_OFF), (cx, cy + sy * (MARK_OFF + MARK))),   # vertical
        ):
            ops.append(f"{ax * PT:.2f} {(A4_H - ay) * PT:.2f} m {bx * PT:.2f} {(A4_H - by) * PT:.2f} l S")
    return ops


def build_sheet(writer, cards, blank):
    page = PageObject.create_blank_page(width=A4_W * PT, height=A4_H * PT)
    ops = ["0 G", f"{0.1 * PT:.3f} w"]
    for k in range(PER_SHEET):
        x = X0 + (k % 2) * (W + GAP_X)
        y = Y0 + (k // 2) * (HT + GAP_Y)
        src = cards[k] if k < len(cards) else blank
        sx = W * PT / float(src.mediabox.width)     # 1.0 when Chromium kept the size exactly
        sy = HT * PT / float(src.mediabox.height)
        page.merge_transformed_page(src, Transformation().scale(sx, sy).translate(x * PT, (A4_H - y - HT) * PT))
        ops += crop_marks(x, y)
    marks = DecodedStreamObject()
    marks.set_data("\n".join(ops).encode())
    page.merge_page(_stream_page(writer, marks))
    writer.add_page(page)


def _stream_page(writer, stream):
    """A blank A4 page whose content is the given drawing stream."""
    p = PageObject.create_blank_page(width=A4_W * PT, height=A4_H * PT)
    p[NameObject("/Contents")] = writer._add_object(stream)
    return p


def main():
    exe = chrome()
    if not exe:
        sys.exit("no headless Chromium found: set CHROME to its path")
    files = card_files()
    if not files:
        sys.exit("no cards in cards/: run make_cards.py first")
    out_dir = HERE / "renders"
    out_dir.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        cards = [card_pdf(exe, f, "card", tmp / f"{f.stem}.pdf") for f in files]
        blank = card_pdf(exe, files[0], "blank", tmp / "_blank.pdf")
        for n, k in enumerate(range(0, len(cards), PER_SHEET), 1):
            writer = PdfWriter()
            build_sheet(writer, cards[k:k + PER_SHEET], blank)
            pdf = out_dir / f"sheet-{n}.pdf"
            with open(pdf, "wb") as fh:
                writer.write(fh)
            names = ", ".join(f.stem for f in files[k:k + PER_SHEET])
            print(f"{pdf.relative_to(HERE)}: {names}")
            if shutil.which("pdftoppm"):
                subprocess.run(["pdftoppm", "-r", "110", "-png", "-singlefile", str(pdf),
                                str(out_dir / f"sheet-{n}")], check=True)


if __name__ == "__main__":
    main()
