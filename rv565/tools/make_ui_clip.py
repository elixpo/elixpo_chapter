#!/usr/bin/env python3
"""Write a deterministic UI animation as a lossless video, for measurements.

    python3 tools/make_ui_clip.py ui.mkv [--seconds 10] [--fps 24] [--size 180x135]

The kind of content small displays show: a static themed background and
header, a clock that changes once a second, an animated progress bar, a
spinner and a scrolling ticker line. Needs Pillow and FFmpeg (FFV1 output,
lossless, so the RV565 reference frames are exactly these pixels in RGB565).
"""

import argparse
import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def frames(count, fps, width, height):
    font = ImageFont.load_default()
    background = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(background)
    for y in range(height):  # vertical gradient
        draw.line([(0, y), (width, y)], fill=(16, 24 + y // 3, 48 + y // 2))
    draw.rectangle([0, 0, width, 15], fill=(200, 60, 40))
    draw.text((4, 2), "OREO  status", font=font, fill=(255, 255, 255))
    draw.rectangle([8, 70, width - 9, 82], outline=(220, 220, 220))
    ticker = "  weather 18C  |  battery 82%  |  3 new badges nearby  |  next talk 14:30  "
    for f in range(count):
        im = background.copy()
        d = ImageDraw.Draw(im)
        seconds = f // fps
        d.text((width - 52, 2), "12:%02d:%02d" % (34 + seconds // 60, seconds % 60), font=font,
               fill=(255, 255, 255))
        progress = (f % (fps * 4)) / (fps * 4)
        d.rectangle([10, 72, 10 + int((width - 21) * progress), 80], fill=(80, 200, 120))
        d.text((10, 50), "Downloading app %3d%%" % int(progress * 100), font=font,
               fill=(230, 230, 230))
        cx, cy, r = width - 24, 46, 9
        for k in range(8):  # spinner: 8 dots, one bright, rotating
            a = 2 * math.pi * k / 8
            bright = (k - f) % 8 == 0
            x, y = cx + r * math.cos(a), cy + r * math.sin(a)
            d.ellipse([x - 2, y - 2, x + 2, y + 2],
                      fill=(255, 255, 255) if bright else (90, 110, 140))
        offset = (f * 2) % (6 * len(ticker))
        d.rectangle([0, height - 14, width, height], fill=(10, 10, 20))
        d.text((-offset, height - 12), ticker * 3, font=font, fill=(250, 210, 90))
        yield im.tobytes()


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("output", type=Path)
    parser.add_argument("--seconds", type=int, default=10)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--size", default="180x135")
    args = parser.parse_args()
    width, height = (int(v) for v in args.size.split("x"))
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt",
                             "rgb24", "-s", args.size, "-r", str(args.fps), "-i", "-",
                             "-c:v", "ffv1", "-pix_fmt", "bgr0", str(args.output)],
                            stdin=subprocess.PIPE)
    for frame in frames(args.seconds * args.fps, args.fps, width, height):
        proc.stdin.write(frame)
    proc.stdin.close()
    if proc.wait() != 0:
        raise SystemExit("ffmpeg failed")
    print("wrote %s" % args.output)


if __name__ == "__main__":
    main()
