"""Encode the MJPEG baseline clip for the RV565 comparison benchmark.

The frames are exactly the RGB565 frames RV565 stores (same window, filter
chain and 180x135 size, see encode_video_benchmark.video_filter); each is then
JPEG-encoded on its own at one FFmpeg quality (-q:v, 2 = best, 31 = worst),
with 4:2:0 (the usual MJPEG choice) or 4:4:4 chroma. The container mirrors RV565 v6 so the firmware parses both the same way:

    "MJP" 0x01 | u16 width | u16 height | u8 fps | u8 0 | u16 frames
    then per frame: u32 little-endian length | baseline JPEG

JPEG is lossy, so the script also decodes the JPEGs back to RGB565 and reports
PSNR against the frames RV565 stores losslessly, plus sizes. The report goes to
<output>.json.
"""

import argparse
import json
import math
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from encode_video_benchmark import video_filter


def run(cmd, stdin=None):
    result = subprocess.run(cmd, input=stdin, stdout=subprocess.PIPE, check=False)
    if result.returncode != 0:
        raise SystemExit("ffmpeg failed: %s" % " ".join(cmd[:6]))
    return result.stdout


def to_rgb888(frames, width, height):
    """Expand big-endian RGB565 to 8-bit channels the way a panel shows them."""
    v = np.frombuffer(frames, dtype=">u2").astype(np.uint16).reshape(-1, height, width)
    r = (v >> 11) & 0x1F
    g = (v >> 5) & 0x3F
    b = v & 0x1F
    return np.stack(((r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)),
                    axis=-1).astype(np.float64)


def psnr(mse):
    return math.inf if mse == 0 else 10 * math.log10(255.0 ** 2 / mse)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument(
        "output", type=Path, nargs="?",
        default=Path("benchmarks/esp32s3_video_dma/main/video.mjpeg"))
    parser.add_argument("--start", type=float, default=0.0)
    parser.add_argument("--seconds", type=float, default=10.0)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--width", type=int, default=180)
    parser.add_argument("--height", type=int, default=135)
    parser.add_argument("--q", type=int, default=5,
                        help="FFmpeg MJPEG -q:v, 2 (best) to 31 (worst)")
    parser.add_argument("--subsampling", choices=("420", "444"), default="420")
    args = parser.parse_args()

    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg is required")
    if not args.source.is_file():
        raise SystemExit("source not found: %s" % args.source)
    if not 2 <= args.q <= 31:
        raise SystemExit("--q must be between 2 and 31")
    size = "%dx%d" % (args.width, args.height)
    frame_bytes = args.width * args.height * 2

    reference = run([
        "ffmpeg", "-v", "error", "-ss", str(args.start), "-i", str(args.source),
        "-t", str(args.seconds), "-an",
        "-vf", video_filter(args.fps, args.width, args.height),
        "-pix_fmt", "rgb565be", "-f", "rawvideo", "-"])
    frames = len(reference) // frame_bytes
    if frames == 0 or len(reference) != frames * frame_bytes or frames > 0xFFFF:
        raise SystemExit("unexpected reference size %d" % len(reference))

    raw_in = ["-f", "rawvideo", "-pix_fmt", "rgb565be", "-s", size,
              "-r", str(args.fps), "-i", "-"]
    with tempfile.TemporaryDirectory() as tmp:
        pattern = str(Path(tmp) / "%05d.jpg")
        run(["ffmpeg", "-v", "error", *raw_in, "-c:v", "mjpeg",
             "-q:v", str(args.q), "-pix_fmt", "yuvj%sp" % args.subsampling, "-f", "image2",
             "-start_number", "0", pattern], stdin=reference)
        jpegs = [(Path(tmp) / ("%05d.jpg" % i)).read_bytes() for i in range(frames)]
        decoded = run(["ffmpeg", "-v", "error", "-start_number", "0", "-f", "image2",
                       "-i", pattern, "-pix_fmt", "rgb565be", "-f", "rawvideo", "-"])
    if len(decoded) != len(reference):
        raise SystemExit("decoded JPEGs do not match the reference size")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("wb") as out:
        out.write(b"MJP\x01" + struct.pack("<HHBBH", args.width, args.height,
                                           args.fps, 0, frames))
        for jpeg in jpegs:
            out.write(struct.pack("<I", len(jpeg)))
            out.write(jpeg)

    ref = to_rgb888(reference, args.width, args.height)
    dec = to_rgb888(decoded, args.width, args.height)
    per_frame = ((ref - dec) ** 2).reshape(frames, -1).mean(axis=1)
    sizes = [len(j) for j in jpegs]
    report = {
        "format": "mjpeg",
        "ffmpeg_q": args.q,
        "subsampling": ":".join(args.subsampling),
        "source": args.source.name,
        "start_s": args.start,
        "seconds": args.seconds,
        "width": args.width,
        "height": args.height,
        "fps": args.fps,
        "frames": frames,
        "file_bytes": args.output.stat().st_size,
        "frame_bytes_mean": sum(sizes) / frames,
        "frame_bytes_max": max(sizes),
        "psnr_db_mean_mse": psnr(float(per_frame.mean())),
        "psnr_db_worst_frame": psnr(float(per_frame.max())),
        "psnr_reference": "RV565 frames (lossless RGB565), host FFmpeg JPEG decode",
    }
    Path(str(args.output) + ".json").write_text(json.dumps(report, indent=2) + "\n")
    print("Encoded MJPEG q%d %s: %d frames, %s, %.2f MiB, %.0f B/frame, PSNR %.2f dB "
          "(worst frame %.2f dB) -> %s" % (
              args.q, report["subsampling"], frames, size, report["file_bytes"] / 1048576,
              report["frame_bytes_mean"], report["psnr_db_mean_mse"],
              report["psnr_db_worst_frame"], args.output))


if __name__ == "__main__":
    main()
