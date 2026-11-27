#!/usr/bin/env python3
"""Write the poster's QR codes as SVG (assets/qr-*.svg): plain square
modules in the brand ink on white, with a quiet zone, error correction Q.
Rounded finders stopped OpenCV decoding the name cards' QR, so these stay
square. Run: python3 make_qr.py   (needs the qrcode package)
"""
from pathlib import Path

import qrcode

HERE = Path(__file__).resolve().parent
INK = "#142018"
CODES = {
    "qr-github": "https://github.com/elixpo/falera",
    "qr-arxiv": "https://arxiv.org/abs/2610.35935",
    "qr-fund": "https://payouts.elixpo.com/f/falera-badge",
}


def svg(url):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q, border=0)
    q.add_data(url)
    q.make(fit=True)
    m = q.get_matrix()
    n, b = len(m), 4                       # modules, quiet zone
    d = "".join(f"M{x + b},{y + b}h1v1h-1z" for y in range(n) for x in range(n) if m[y][x])
    s = n + 2 * b
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {s} {s}" shape-rendering="crispEdges">'
            f'<rect width="{s}" height="{s}" fill="#fff"/><path fill="{INK}" d="{d}"/></svg>\n')


for name, url in CODES.items():
    (HERE / "assets" / f"{name}.svg").write_text(svg(url))
    print(name, url)
