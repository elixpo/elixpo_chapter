#!/usr/bin/env python3
"""Compare RV565 version 7, version 8 and ZMBV on the same lossless frames.

    python3 tools/compare_zmbv.py SOURCE [--start 90] [--seconds 10]
                                  [--size 180x135 320x240] [--ui]

For each size: file size, the share of pixels a display player must send per
frame, and the number of display windows it takes. RV565 sends what the file
says changed (whole frames for keyframes and deltas, a band per window for
partial deltas, a band's range per window for region deltas). For ZMBV the
player is given the best case: it skips every 16x16 block that is identical
to the previous frame and sends each changed block as its own window (ZMBV's
blocks are 16x16 at these sizes in FFmpeg's encoder), keyframes included.

Both formats are lossless here, from the same RGB565 little-endian frames
(FFmpeg's ZMBV encoder takes rgb565le), with a keyframe every second, zlib
level 9. --ui uses tools/make_ui_clip.py instead of SOURCE.
"""

import argparse
import io
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python" / "src"))

import rv565  # noqa: E402

FPS = 24


def note(text):
    """Progress on stderr, so stdout stays the Markdown table."""
    print("  ... " + text, file=sys.stderr, flush=True)


def frames_from(path, width, height, extra=()):
    raw = subprocess.run(["ffmpeg", "-v", "error", *extra, "-i", str(path), "-an",
                          "-f", "rawvideo", "-pix_fmt", "rgb565le", "-"],
                         capture_output=True, check=True).stdout
    size = 2 * width * height
    return [raw[i:i + size] for i in range(0, len(raw), size)]


def source_frames(args, width, height, tmp):
    if args.ui:
        ui = tmp / "ui.mkv"
        if not ui.exists():
            subprocess.run([sys.executable, str(ROOT / "tools" / "make_ui_clip.py"), str(ui),
                            "--seconds", str(int(args.seconds)), "--fps", str(FPS),
                            "--size", "180x135"], check=True)
        vf = "scale=%d:%d:flags=neighbor,format=rgb565le" % (width, height)
        src = tmp / ("ui-%dx%d.mkv" % (width, height))
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ui), "-vf", vf,
                        "-c:v", "ffv1", str(src)], check=True)
    else:
        vf = ("fps=%d,scale=%d:%d:flags=lanczos,format=rgb565le" % (FPS, width, height))
        src = tmp / ("src-%dx%d.mkv" % (width, height))
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(args.start), "-i",
                        str(args.source), "-t", str(args.seconds), "-an", "-vf", vf,
                        "-c:v", "ffv1", str(src)], check=True)
    return src, frames_from(src, width, height)


def zmbv(src, frames, width, height, tmp):
    out = tmp / ("zmbv-%dx%d.avi" % (width, height))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-pix_fmt", "rgb565le",
                    "-c:v", "zmbv", "-g", str(FPS), "-compression_level", "9", str(out)],
                   check=True)
    assert frames_from(out, width, height) == frames, "ZMBV is not lossless here"
    stride, sent, windows = 2 * width, [], []
    bw, bh = -(-width // 16), -(-height // 16)
    for i in range(1, len(frames)):
        cur, prev = frames[i], frames[i - 1]
        key = i % FPS == 0
        n = area = 0
        for by in range(bh):
            for bx in range(bw):
                x0, x1 = 2 * 16 * bx, 2 * min(width, 16 * (bx + 1))
                rows = range(16 * by, min(height, 16 * (by + 1)))
                if key or any(cur[y * stride + x0:y * stride + x1] !=
                              prev[y * stride + x0:y * stride + x1] for y in rows):
                    n += 1
                    area += (x1 - x0) // 2 * len(rows)   # edge blocks are clipped
        sent.append(area / (width * height))
        windows.append(n)
    return out.stat().st_size, sent, windows


def rv565_run(frames, width, height, version):
    buf = io.BytesIO()
    rv565.write(buf, width, height, FPS, frames, 9, pixel_format="rgb565le",
                keyframe_interval=FPS, version=version)
    clip = rv565.open(buf.getvalue())
    assert list(clip) == frames, "RV565 is not lossless here"
    lines, line_bytes = rv565.frame_lines("rgb565le", width, height)
    sent, windows = [], []
    for i in range(1, len(clip)):
        rects = clip.changed_rects(i)
        sent.append(sum(n * xw for _, n, _, xw in rects) / (lines * line_bytes))
        windows.append(len(rects))
    return len(buf.getvalue()), buf.getvalue()[3], sent, windows


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("source", type=Path, nargs="?")
    p.add_argument("--ui", action="store_true", help="use the UI clip (tools/make_ui_clip.py)")
    p.add_argument("--start", type=float, default=0.0)
    p.add_argument("--seconds", type=float, default=10.0)
    p.add_argument("--size", nargs="+", default=["180x135", "320x240"])
    args = p.parse_args()
    if not args.ui and args.source is None:
        p.error("give a SOURCE or --ui")
    mean = lambda v: sum(v) / len(v)  # noqa: E731
    print("| Size | Format | Bytes | Pixels sent | Windows per frame |")
    print("| --- | --- | ---: | ---: | ---: |")
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        for size in args.size:
            width, height = (int(v) for v in size.split("x"))
            note("%s: preparing %d s of frames" % (size, args.seconds))
            src, frames = source_frames(args, width, height, tmp)
            for label, version in (("RV565 v7", 7), ("RV565 v8", None)):
                note("%s: encoding %s (%d frames, the Python encoder is slow)" % (
                    size, label, len(frames)))
                t0 = time.time()
                n, ver, sent, win = rv565_run(frames, width, height, version)
                note("%s: %s done in %.0f s" % (size, label, time.time() - t0))
                print("| %s | %s (file v%d) | %d | %.1f%% | %.1f |" % (
                    size, label, ver, n, 100 * mean(sent), mean(win)))
            note("%s: encoding ZMBV" % size)
            n, sent, win = zmbv(src, frames, width, height, tmp)
            print("| %s | ZMBV, best-case player | %d | %.1f%% | %.1f |" % (
                size, n, 100 * mean(sent), mean(win)))


if __name__ == "__main__":
    main()
