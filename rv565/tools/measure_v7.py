#!/usr/bin/env python3
"""Measure RV565 version 7 encodings of a video window: size, PSNR, display lines.

    python3 tools/measure_v7.py SOURCE --start 90 [--seconds 10] [--tolerance 0 8 16]
                                [--keyframe-interval 24] [--level 1 9]

The reference frames are the RGB565 big-endian frames FFmpeg produces (the
frames the paper and docs/RESULTS_MJPEG.md use), so PSNR is computed the same
way as there: against those frames, in 8-bit RGB, pooled over all frames
(mean MSE), plus the worst frame. "Lines sent" is the share of frame rows a
player transfers to the display: all of them for keyframes and deltas, the
changed bands for partial deltas, none for repeats.
"""

import argparse
import io
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python" / "src"))

import rv565  # noqa: E402


def reference_frames(source, start, seconds, fps, width, height):
    vf = ("fps=%d,scale=%d:%d:force_original_aspect_ratio=increase:flags=lanczos,"
          "crop=%d:%d,format=rgb565be" % (fps, width, height, width, height))
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(start), "-i", str(source),
                          "-t", str(seconds), "-an", "-vf", vf, "-pix_fmt", "rgb565be",
                          "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    size = 2 * width * height
    return [raw[i:i + size] for i in range(0, len(raw), size)]


def mse(a, b, width, height):
    x = rv565.to_rgb888(a, width, height, "rgb565be")
    y = rv565.to_rgb888(b, width, height, "rgb565be")
    try:
        import numpy as np
        d = np.frombuffer(x, np.uint8).astype(np.float64) - np.frombuffer(y, np.uint8)
        return float(np.mean(d * d))
    except ImportError:
        return sum((p - q) ** 2 for p, q in zip(x, y)) / len(x)


def db(m):
    return math.inf if m == 0 else 10 * math.log10(255.0 ** 2 / m)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source", type=Path)
    parser.add_argument("--start", type=float, default=0.0)
    parser.add_argument("--seconds", type=float, default=10.0)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--size", default="180x135")
    parser.add_argument("--keyframe-interval", type=int, default=24)
    parser.add_argument("--tolerance", type=int, nargs="+", default=[0, 8, 16])
    parser.add_argument("--level", type=int, nargs="+", default=[1, 9])
    parser.add_argument("--band-lines", type=int, default=rv565.BAND_LINES)
    args = parser.parse_args()
    width, height = (int(v) for v in args.size.split("x"))
    ref = reference_frames(args.source, args.start, args.seconds, args.fps, width, height)
    print("%s from %gs, %d frames, %dx%d, keyframe every %d, bands of %d lines" % (
        args.source.name, args.start, len(ref), width, height, args.keyframe_interval,
        args.band_lines))
    print("| Tolerance | zlib level | Size (MiB) | key / delta / partial / repeat | "
          "Lines sent | PSNR mean (worst) |")
    print("| ---: | ---: | ---: | --- | ---: | --- |")
    for tolerance in args.tolerance:
        for level in args.level:
            buf = io.BytesIO()
            rv565.write(buf, width, height, args.fps, ref, level,
                        keyframe_interval=args.keyframe_interval,
                        band_lines=args.band_lines, tolerance=tolerance)
            clip = rv565.open(buf.getvalue())
            types = [clip.frame_type(i) for i in range(len(clip))]
            sent = sum(n for i in range(len(clip)) for _, n in clip.changed_lines(i))
            errors = [mse(f, r, width, height) for f, r in zip(clip, ref)]
            mean, worst = db(sum(errors) / len(errors)), db(max(errors))
            quality = "exact" if mean == math.inf else "%.1f dB (%.1f)" % (mean, worst)
            print("| %d | %d | %.2f | %d / %d / %d / %d | %.0f%% | %s |" % (
                tolerance, level, len(buf.getvalue()) / 2**20, types.count("key"),
                types.count("delta"), types.count("partial"), types.count("repeat"),
                100.0 * sent / (height * len(clip)), quality))
            sys.stdout.flush()


if __name__ == "__main__":
    main()
