"""Rasterise a TrueType font into a MicroPython-loadable bitmap module.

Output format (row-major, MSB-first, packed into bytes per row):

    GLYPH_W  = 12
    GLYPH_H  = 16
    BPR      = (GLYPH_W + 7) // 8    # bytes per row
    KERN     = 1                      # extra pixel between glyphs
    BASELINE = 12                     # row the baseline sits on (y of the
                                      # first row below 'x', 'H', ...)
    _FONT   = {
        ' ': b'\\x00\\x00...',          # BPR*GLYPH_H bytes per glyph
        '!': b'...',
        ...
    }

Render-side glyph cost: GLYPH_H × GLYPH_W loop, only set-bit pixels call
d.rect — typical pixel font is ~30% filled so a 12×16 glyph emits ~50 rects.

Usage:
    python tools/rasterise_font.py \\
        --ttf assets/fonts/raw/PixelifySans-Regular.ttf \\
        --out assets/fonts/optimized/pixelify_12.py \\
        --size 12

`--size` is the font's pixel size. Every glyph is drawn into one shared
cell with its baseline on row BASELINE, so short letters (a, e, o), caps
and descenders (g, p, y) all line up: GLYPH_H spans the highest ascender
to the lowest descender in the ASCII set. GLYPH_W is the widest glyph's
ink (or `--max-width`); each glyph's ink starts at column 0 and the
renderer trims it to its ink width for proportional spacing.
"""

import sys
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ASCII_START = 0x20      # space
ASCII_END   = 0x7E      # tilde


def _argparse():
    p = argparse.ArgumentParser()
    p.add_argument("--ttf",       required=True, help="path to TrueType font")
    p.add_argument("--out",       required=True, help="output .py module")
    p.add_argument("--size",      type=int, required=True,
                   help="rendering pixel height (glyph_h)")
    p.add_argument("--max-width", type=int, default=None,
                   help="cap glyph width (default = widest glyph's ink)")
    p.add_argument("--kern",      type=int, default=1,
                   help="inter-glyph spacing in pixels (default 1)")
    p.add_argument("--threshold", type=int, default=80,
                   help="alpha threshold for considering a pixel 'set'")
    return p.parse_args()


def _render_glyph(font, ch, target_w, target_h, baseline, threshold):
    """Render one character into a target_w x target_h binary bitmap.

    The glyph's baseline lands on row `baseline` (anchor 'ls' = left,
    baseline), never on its own ink top, so all glyphs share one baseline.
    Horizontally the ink is shifted to start at column 0.
    """
    img  = Image.new("L", (target_w, target_h), 0)
    draw = ImageDraw.Draw(img)
    left = font.getbbox(ch, anchor="ls")[0]
    draw.text((-left, baseline), ch, fill=255, font=font, anchor="ls")
    return img.point(lambda v: 255 if v >= threshold else 0)


def _cell_metrics(font, chars):
    """(width, height, baseline) of a cell that holds every glyph unclipped."""
    top, bot, wid = 0, 0, 1
    for ch in chars:
        x0, y0, x1, y1 = font.getbbox(ch, anchor="ls")
        if x1 <= x0:                # space: no ink
            continue
        top = min(top, y0)
        bot = max(bot, y1)
        wid = max(wid, x1 - x0)
    return wid, bot - top, -top


def _pack_glyph(bitmap):
    """Bytes packing: row-major, MSB-first within each byte."""
    w, h = bitmap.size
    px   = bitmap.load()
    bpr  = (w + 7) // 8
    out  = bytearray(bpr * h)
    for y in range(h):
        for x in range(w):
            if px[x, y]:
                out[y * bpr + (x >> 3)] |= 0x80 >> (x & 7)
    return bytes(out)


def _format_bytes(data):
    """Compact `\\xab\\xcd` representation."""
    return "".join("\\x%02x" % b for b in data)


def main():
    args      = _argparse()
    ttf_path  = Path(args.ttf)
    out_path  = Path(args.out)
    size      = args.size

    font  = ImageFont.truetype(str(ttf_path), size=size)
    chars = [chr(c) for c in range(ASCII_START, ASCII_END + 1)]
    glyph_w, glyph_h, baseline = _cell_metrics(font, chars)
    if args.max_width:
        glyph_w = min(glyph_w, args.max_width)
    bpr = (glyph_w + 7) // 8

    print("Rasterising %s @ %d px → %dx%d cells (bpr=%d, baseline row %d)"
          % (ttf_path.name, size, glyph_w, glyph_h, bpr, baseline))

    packed = {}
    for ch in chars:
        bitmap     = _render_glyph(font, ch, glyph_w, glyph_h, baseline,
                                   args.threshold)
        packed[ch] = _pack_glyph(bitmap)

    lines = [
        '"""Auto-generated bitmap font — do not edit. Re-run tools/rasterise_font.py."""',
        '',
        'GLYPH_W  = %d' % glyph_w,
        'GLYPH_H  = %d' % glyph_h,
        'BPR      = %d' % bpr,
        'KERN     = %d' % args.kern,
        'BASELINE = %d' % baseline,
        '',
        '_FONT = {',
    ]
    for ch in chars:
        if ch == '\\':
            esc = "'\\\\'"
        elif ch == "'":
            esc = '"\'"'
        else:
            esc = "'%s'" % ch
        lines.append("    %s: b'%s'," % (esc, _format_bytes(packed[ch])))
    lines.append("}")
    lines.append("")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines))
    size_kb = out_path.stat().st_size // 1024
    print("Wrote %s  (%d KB, %d glyphs)" % (out_path, size_kb, len(chars)))


if __name__ == "__main__":
    main()
