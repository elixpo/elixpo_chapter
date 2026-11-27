"""Write the extra region-delta clips the LVGL widget test plays.

    python3 -I make_clips.py OUT_DIR

The conformance vectors are small (21x13); these are 60x40 with one-line
bands, so a region delta can have more rectangles than the widget
invalidates one by one (LV_RV565_MAX_RECTS, 32), and with content that
scrolls sideways, so bands carry shifts whose source bytes lie outside
their range.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "python" / "src"))
import rv565  # noqa: E402

W, H = 60, 40


def pixel(r, g, b, fmt):
    v = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
    return bytes((v >> 8, v & 255)) if fmt == "rgb565be" else bytes((v & 255, v >> 8))


def frame(t, fmt, kind):
    out = bytearray()
    for y in range(H):
        for x in range(W):
            r, g, b = (x * 4) & 255, (y * 6) & 255, ((x ^ y) * 9) & 255
            if kind == "bar" and t * 3 <= x < t * 3 + 4:
                r, g, b = 255, 255, 255          # a bar over every line
            if kind == "scroll" and 8 <= y < 20 and 12 <= x < 48:
                u = x + 3 * t                    # stripes scrolling left in a window
                r, g, b = (u * 37) & 255, (u * 11 + y) & 255, 200 if u % 7 < 3 else 20
            if kind == "scroll" and 28 <= y < 31 and 10 + t <= x < 18 + t:
                r, g, b = 250, 40, 40            # a small box moving right
            out += pixel(r, g, b, fmt)
    return bytes(out)


def main(out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    for fmt in ("rgb565be", "rgb565le"):
        for kind in ("bar", "scroll"):
            frames = [frame(t, fmt, kind) for t in range(12)]
            path = out / ("gen_%s_%s.rv565" % (fmt, kind))
            rv565.write(str(path), W, H, 10, frames, pixel_format=fmt, codec="zlib",
                        keyframe_interval=12, band_lines=1)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
