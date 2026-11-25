"""rv565: encode, inspect, verify and export RV565 video files.

  rv565 encode SOURCE OUT.rv565 [--start S] [--seconds N] [--fps F] [--size WxH]
                [--format F] [--codec C] [--keyframe-interval K] [--band-lines B]
                [--motion-range M] [--tolerance T] [--level L] [--v6]
  rv565 info FILE.rv565 [--chip C] [--transfer-us T]
  rv565 verify FILE.rv565
  rv565 c-array FILE.rv565 OUT.h [--name NAME]
  rv565 testpattern OUT.rv565 [--frames N] [--fps F] [--size WxH] [--format F] [--v6]

`encode` needs FFmpeg on PATH. Everything else uses only the standard library.
"""

import argparse
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

from . import (BAND_LINES, CODECS, MOTION_RANGE, COST_ESP32S3_180x135, COST_RP2350_180x135, MAX_FPS,
               PIXEL_FORMATS, RV565Error, convert, frame_lines, open as open_clip, write)


def parse_size(text):
    try:
        width, height = (int(v) for v in text.lower().split("x"))
    except ValueError:
        raise argparse.ArgumentTypeError("size must look like 180x135")
    if not (0 < width <= 1024 and 0 < height <= 1024):
        raise argparse.ArgumentTypeError("size out of range")
    return width, height


def ffmpeg_frames(source, start, seconds, fps, width, height, pixel_format="rgb565be"):
    """Decode, resample and crop with FFmpeg; yield frames in ``pixel_format``.

    RGB565 big-endian comes straight from FFmpeg (as the paper measured);
    every other format is converted from RGB888 with rv565.convert, so the
    result matches the reference conversion bit for bit.
    """
    native = pixel_format == "rgb565be"
    pix = "rgb565be" if native else "rgb24"
    vf = ("fps=%d,scale=%d:%d:force_original_aspect_ratio=increase:flags=lanczos,"
          "crop=%d:%d,format=%s" % (fps, width, height, width, height, pix))
    cmd = ["ffmpeg", "-v", "error", "-ss", str(start), "-i", str(source),
           "-t", str(seconds), "-an", "-vf", vf, "-pix_fmt", pix,
           "-f", "rawvideo", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    frame_bytes = width * height * (2 if native else 3)
    try:
        while True:
            frame = proc.stdout.read(frame_bytes)
            if not frame:
                break
            if len(frame) != frame_bytes:
                raise SystemExit("ffmpeg returned a partial frame")
            yield frame if native else convert(frame, width, height, pixel_format)
    finally:
        proc.stdout.close()
        if proc.wait() != 0:
            raise SystemExit("ffmpeg failed")


def cmd_encode(args):
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg is required for encode")
    width, height = args.size
    frames = ffmpeg_frames(args.source, args.start, args.seconds, args.fps, width, height,
                           args.format)
    count = write(args.output, width, height, args.fps, frames, args.level,
                  **container_options(args))
    print("encoded %d frames, %dx%d, %d FPS, %s -> %s (%d bytes)" % (
        count, width, height, args.fps, describe(args), args.output,
        Path(args.output).stat().st_size))


def container_options(args):
    if args.v6 and args.v7:
        raise SystemExit("choose one of --v6 and --v7")
    if args.keyframe_interval is None:
        args.keyframe_interval = 1 if args.v6 else min(args.fps, 255)
    if args.v6:
        if args.format != "rgb565be" or args.codec != "zlib" or args.keyframe_interval != 1:
            raise SystemExit("--v6 allows only --format rgb565be --codec zlib --keyframe-interval 1")
        if args.fps > 30:
            raise SystemExit("--v6 allows at most 30 FPS")
        if args.tolerance:
            return {"version": 6, "tolerance": args.tolerance, "band_lines": 0}
        return {"version": 6}
    return {"pixel_format": args.format, "codec": args.codec,
            "keyframe_interval": args.keyframe_interval, "band_lines": args.band_lines,
            "tolerance": args.tolerance, "motion_range": args.motion_range,
            "version": 7 if args.v7 else None}


def describe(args):
    if args.v6:
        return "version 6"
    text = "%s, %s, keyframe every %d" % (args.format, args.codec, args.keyframe_interval)
    if args.v7:
        text = "version 7, " + text
    if args.tolerance:
        text += ", tolerance %d" % args.tolerance
    return text


# Cost model and measured 320x240 display transfer for each measured chip.
CHIPS = {
    "esp32s3": (COST_ESP32S3_180x135, 31312.0, "ESP32-S3"),   # 40 MHz SPI
    "rp2350": (COST_RP2350_180x135, 33419.0, "RP2350"),       # 37.5 MHz SPI
}


def cmd_info(args):
    clip = open_clip(args.file)
    h, sizes = clip.header, clip.payload_sizes()
    raw = h.header_size + h.frame_bytes * h.frames
    print("file      %s" % args.file)
    print("sha256    %s" % hashlib.sha256(clip.data).hexdigest())
    print("format    RV565 v%d, %dx%d, %d FPS, %d frames (%.2f s)" % (
        h.version, h.width, h.height, h.fps, h.frames, h.duration))
    print("pixels    %s, %d bytes per frame" % (h.pixel_format, h.frame_bytes))
    types = [clip.frame_type(i) for i in range(len(clip))]
    print("frames    %s, keyframe interval %d: %d key, %d delta, %d partial, %d region, "
          "%d repeat" % (h.codec, h.keyframe_interval, types.count("key"), types.count("delta"),
                         types.count("partial"), types.count("region"), types.count("repeat")))
    lines = frame_lines(h.pixel_format, h.width, h.height)[0]
    sent = [sum(n for _, n in clip.changed_lines(i)) for i in range(len(clip))]
    print("display   %.0f%% of lines sent per frame on average (repeats and unchanged "
          "bands skipped)" % (100.0 * sum(sent) / (lines * len(sent))))
    line_bytes = frame_lines(h.pixel_format, h.width, h.height)[1]
    area = [sum(n * xw for _, n, _, xw in clip.changed_rects(i)) for i in range(len(clip))]
    windows = [len(clip.changed_rects(i)) for i in range(len(clip))]
    print("          %.0f%% of pixels sent per frame, in %.1f windows on average" % (
        100.0 * sum(area) / (lines * line_bytes * len(area)), sum(windows) / len(windows)))
    print("size      %d bytes (raw %d, ratio %.2fx)" % (len(clip.data), raw, raw / len(clip.data)))
    coded = [s for s in sizes if s] or [0]
    print("payloads  min %d, mean %.0f, max %d bytes" % (
        min(coded), sum(coded) / len(coded), max(coded)))
    if h.pixel_format != "rgb565be" or h.codec != "zlib":
        print("schedule  cost models are fitted for rgb565be zlib clips; not predicted")
        return
    if (h.width, h.height) != (180, 135):
        print("schedule  cost model fitted for 180x135; refit before trusting it")
    model, transfer_us, name = CHIPS[args.chip]
    if args.transfer_us is not None:
        transfer_us = args.transfer_us
    for label, overlap in (("serial", False), ("overlap", True)):
        r = clip.check_schedule(model, transfer_us, overlap)
        print("schedule  %-7s worst %.2f ms, %d/%d frames late at %d FPS (%s model)" % (
            label, r.worst_frame_us / 1e3, r.late_frames, h.frames, h.fps, name))


def cmd_verify(args):
    count = open_clip(args.file).verify()
    print("ok: %d frames verified" % count)


def cmd_c_array(args):
    clip = open_clip(args.file)
    h, data, name = clip.header, clip.data, args.name
    lines = ["/* Generated by tools/rv565.py from %s: %dx%d, %d FPS, %d frames. */" % (
        Path(args.file).name, h.width, h.height, h.fps, h.frames),
        "#pragma once", "#include <stddef.h>", "#include <stdint.h>", "",
        "static const uint8_t %s[] __attribute__((aligned(4))) = {" % name]
    for i in range(0, len(data), 16):
        lines.append("    " + ", ".join("0x%02x" % b for b in data[i:i + 16]) + ",")
    lines += ["};", "static const size_t %s_size = sizeof(%s);" % (name, name), ""]
    Path(args.output).write_text("\n".join(lines))
    print("wrote %s (%d bytes of data)" % (args.output, len(data)))


def testpattern_rgb(count, width, height):
    """Scrolling colour bars as RGB888 frames."""
    bars = [(0xFF, 0xFF, 0xFF), (0xFF, 0xFF, 0x00), (0x00, 0xFF, 0xFF), (0x00, 0xFF, 0x00),
            (0xFF, 0x00, 0xFF), (0xFF, 0x00, 0x00), (0x00, 0x00, 0xFF), (0x00, 0x00, 0x00)]
    for f in range(count):
        shift = f * width // count
        row = b"".join(bytes(bars[((x + shift) % width) * len(bars) // width])
                       for x in range(width))
        yield row * height


def testpattern_frames(count, width, height):
    """Scrolling colour bars: deterministic and highly compressible."""
    bars = [(0xFF, 0xFF, 0xFF), (0xFF, 0xFF, 0x00), (0x00, 0xFF, 0xFF), (0x00, 0xFF, 0x00),
            (0xFF, 0x00, 0xFF), (0xFF, 0x00, 0x00), (0x00, 0x00, 0xFF), (0x00, 0x00, 0x00)]

    def rgb565be(r, g, b):
        v = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)
        return bytes((v >> 8, v & 0xFF))

    for f in range(count):
        shift = f * width // count
        row = b"".join(rgb565be(*bars[((x + shift) % width) * len(bars) // width])
                       for x in range(width))
        yield row * height


def cmd_testpattern(args):
    width, height = args.size
    if args.format == "rgb565be":
        frames = testpattern_frames(args.frames, width, height)
    else:
        frames = (convert(f, width, height, args.format)
                  for f in testpattern_rgb(args.frames, width, height))
    count = write(args.output, width, height, args.fps, frames, 9, **container_options(args))
    print("wrote %d-frame test pattern %dx%d -> %s (%d bytes)" % (
        count, width, height, args.output, Path(args.output).stat().st_size))


def add_container_args(p):
    p.add_argument("--fps", type=int, default=24, choices=range(1, MAX_FPS + 1),
                   metavar="1-%d" % MAX_FPS)
    p.add_argument("--size", type=parse_size, default=(180, 135))
    p.add_argument("--format", choices=PIXEL_FORMATS, default="rgb565be",
                   help="pixel format the display takes (default rgb565be, for ST7789-class SPI panels)")
    p.add_argument("--codec", choices=CODECS, default="zlib")
    p.add_argument("--keyframe-interval", type=int, default=None, choices=range(1, 256),
                   metavar="1-255",
                   help="a keyframe at least every K frames; frames between are deltas or "
                        "repeats when smaller (default: one second of frames; 1 makes every "
                        "frame a keyframe)")
    p.add_argument("--band-lines", type=int, default=BAND_LINES, choices=range(0, 256),
                   metavar="0-255",
                   help="band height for partial deltas, which store and send only the "
                        "changed bands (default %d; 0 turns them off)" % BAND_LINES)
    p.add_argument("--motion-range", type=int, default=MOTION_RANGE, choices=range(0, 64),
                   metavar="0-63",
                   help="search a shift of up to M pixels for each changed band, so "
                        "scrolling and panning cost less (default %d; 0 turns it off)"
                        % MOTION_RANGE)
    p.add_argument("--tolerance", type=int, default=0, choices=range(0, 256), metavar="0-255",
                   help="keep the previous pixel when every channel is within T of it "
                        "(8-bit levels); 0, the default, is lossless. 8 is about one step "
                        "of RGB565's red and blue")
    p.add_argument("--v6", action="store_true",
                   help="write a version 6 file for players older than RV565 2.0")
    p.add_argument("--v7", action="store_true",
                   help="write a version 7 file (no region deltas) for players older "
                        "than RV565 3.0; by default the file is version 8 only if it "
                        "uses region deltas")


def main(argv=None):
    parser = argparse.ArgumentParser(prog="rv565", description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("encode", help="encode a video with FFmpeg")
    p.add_argument("source", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--start", type=float, default=0.0, help="offset into the source, in seconds")
    p.add_argument("--seconds", type=float, default=10.0)
    add_container_args(p)
    p.add_argument("--level", type=int, default=1, choices=range(1, 10), metavar="1-9",
                   help="zlib level; 1 is what the paper measured")
    p.set_defaults(func=cmd_encode)

    p = sub.add_parser("info", help="print header, sizes and a schedule prediction")
    p.add_argument("file", type=Path)
    p.add_argument("--chip", choices=sorted(CHIPS), default="esp32s3",
                   help="cost model and measured display transfer to predict with")
    p.add_argument("--transfer-us", type=float, default=None,
                   help="override the display transfer per frame (ESP32-S3 31312 us, "
                        "RP2350 33419 us for 320x240)")
    p.set_defaults(func=cmd_info)

    p = sub.add_parser("verify", help="decode every frame and check its size")
    p.add_argument("file", type=Path)
    p.set_defaults(func=cmd_verify)

    p = sub.add_parser("c-array", help="export a file as a C header for Arduino sketches")
    p.add_argument("file", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--name", default="rv565_clip")
    p.set_defaults(func=cmd_c_array)

    p = sub.add_parser("testpattern", help="write a synthetic scrolling colour-bar clip")
    p.add_argument("output", type=Path)
    p.add_argument("--frames", type=int, default=24)
    add_container_args(p)
    p.set_defaults(func=cmd_testpattern)

    args = parser.parse_args(argv)
    try:
        args.func(args)
    except RV565Error as exc:
        raise SystemExit("rv565: %s" % exc)


if __name__ == "__main__":
    sys.exit(main())
