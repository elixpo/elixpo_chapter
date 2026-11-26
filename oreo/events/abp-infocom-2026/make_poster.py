#!/usr/bin/env python3
"""Build the ABP Infocom 2026 print files from poster.html and cards.html.

Writes, into out/:
    poster-a3.pdf            A3 landscape, 420 x 297 mm, no bleed
    poster-a3-bleed3mm.pdf   426 x 303 mm: 3 mm of background on every side
    poster-a3-cmyk.pdf       the no-bleed poster converted to CMYK (Ghostscript)
    poster-a3-preview.png    a preview at 100 dpi
    qr-cards-a4.pdf          85 x 55 mm QR cards, ten to an A4 sheet, crop marks
    qr-cards-preview.png
    funding-card.pdf         A5 portrait: the fundraiser QR, to stand on the table
    cue-cards-a4.pdf         four A6 cue cards: the opener and the three pitches (PITCH.md)

Chromium prints the pages at their CSS millimetre sizes; images are placed at
their full resolution (every image prints above 300 dpi).

Run: python3 make_poster.py
     (needs a headless Chromium, as for circuit/card/name-card/make_cards.py,
      Ghostscript for the CMYK copy and pdftoppm for the previews)
"""
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "circuit" / "card" / "name-card"))
from make_cards import chrome  # noqa: E402

OUT = HERE / "out"


def pdf(exe, page, query, out):
    url = (HERE / page).as_uri() + (f"?{query}" if query else "")
    subprocess.run([exe, "--headless", "--no-sandbox", "--allow-file-access-from-files", "--no-pdf-header-footer",
                    "--virtual-time-budget=5000", f"--print-to-pdf={out}", url], capture_output=True, check=True)
    print(out.relative_to(HERE))


def preview(src, out, dpi):
    if shutil.which("pdftoppm"):
        subprocess.run(["pdftoppm", "-r", str(dpi), "-png", "-singlefile", str(src), str(out.with_suffix(""))], check=True)
        print(out.relative_to(HERE))


def main():
    exe = chrome()
    if not exe:
        sys.exit("no headless Chromium found: set CHROME to its path")
    OUT.mkdir(exist_ok=True)
    pdf(exe, "poster.html", "", OUT / "poster-a3.pdf")
    pdf(exe, "poster.html", "bleed", OUT / "poster-a3-bleed3mm.pdf")
    if shutil.which("gs"):
        subprocess.run(["gs", "-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite",
                        "-sColorConversionStrategy=CMYK", "-dProcessColorModel=/DeviceCMYK",
                        "-dDownsampleColorImages=false", "-dAutoFilterColorImages=false",
                        "-dColorImageFilter=/FlateEncode",
                        f"-sOutputFile={OUT / 'poster-a3-cmyk.pdf'}", str(OUT / "poster-a3.pdf")], check=True)
        print("out/poster-a3-cmyk.pdf")
    preview(OUT / "poster-a3.pdf", OUT / "poster-a3-preview.png", 100)
    if (HERE / "cards.html").exists():
        pdf(exe, "cards.html", "", OUT / "qr-cards-a4.pdf")
        preview(OUT / "qr-cards-a4.pdf", OUT / "qr-cards-preview.png", 100)
    for page, name in (("funding-card.html", "funding-card"), ("cue-cards.html", "cue-cards-a4")):
        if (HERE / page).exists():
            pdf(exe, page, "", OUT / f"{name}.pdf")
            preview(OUT / f"{name}.pdf", OUT / f"{name}-preview.png", 100)


if __name__ == "__main__":
    main()
