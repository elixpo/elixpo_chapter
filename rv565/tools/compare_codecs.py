#!/usr/bin/env python3
"""Tabulate RV565 against the MJPEG baseline from aggregated benchmark runs.

Pass the aggregate JSON files written by summarize_video_benchmarks.py (one
per configuration, run with tools/run_rv565_matrix.sh). For MJPEG runs the
size and PSNR come from the matching video-benchmark-<label>-media.json that
the matrix script stores; RV565 is lossless against the same frames.

Prints a Markdown table, and with --json writes the rows as well.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


def clip_name(label: str) -> str:
    """The clip window in a label: bbb090-overlap and rp2350-bbb090-overlap
    both give bbb090."""
    return next((part for part in label.split("-") if part.startswith("bbb")),
                label.split("-")[0])


def row(path: Path) -> dict[str, object]:
    agg = json.loads(path.read_text(encoding="utf-8"))
    if "aggregate_schema_version" not in agg:
        raise SystemExit(f"{path}: not an aggregate file")
    meta = agg["metadata"]
    label = agg["label"]
    frames = int(meta["source_frames"])
    container = int(meta["container_bytes"])
    codec = meta.get("codec") or "rv565"
    out = {
        "label": label,
        "codec": codec,
        "decoder": meta.get("decoder"),
        "overlap": int(meta["overlap"]),
        "file_mib": container / 1048576,
        "frame_bytes_mean": (container - 12) / frames - 4,
        "psnr_db": math.inf,
        "psnr_db_worst_frame": math.inf,
        "quality": "lossless",
    }
    if codec == "mjpeg":
        media = path.with_name(f"video-benchmark-{label}-media.json")
        if not media.is_file():
            raise SystemExit(f"{path}: missing {media.name}")
        report = json.loads(media.read_text(encoding="utf-8"))
        out["psnr_db"] = report["psnr_db_mean_mse"]
        out["psnr_db_worst_frame"] = report["psnr_db_worst_frame"]
        out["quality"] = f"q{report['ffmpeg_q']} {report['subsampling']}"
    timing = agg["timing_us"]
    out.update({
        "runs": agg["methodology"]["independent_runs"],
        "frames_timed": agg["methodology"]["total_frames"],
        "fps": agg["fps"]["mean"],
        "deadline_misses": agg["deadline_misses"],
        "drops": agg["drops"],
        "decode_ms_p50": timing["inflate_us"]["p50"] / 1000,
        "decode_ms_p99": timing["inflate_us"]["p99"] / 1000,
        "work_ms_p50": timing["work_us"]["p50"] / 1000,
        "work_ms_p99": timing["work_us"]["p99"] / 1000,
        "work_ms_max": timing["work_us"]["maximum"] / 1000,
    })
    return out


def db(value: float) -> str:
    return "exact" if math.isinf(value) else f"{value:.1f} dB"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("aggregates", nargs="+", type=Path)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    rows = sorted((row(p) for p in args.aggregates),
                  key=lambda r: (clip_name(r["label"]), r["overlap"],
                                 r["codec"] != "rv565", -r["frame_bytes_mean"]))
    print("| Clip | Mode | Format | Size | Bytes/frame | PSNR (worst frame) | FPS "
          "| Misses | Drops | Decode p50 / p99 | Frame p50 / p99 / max |")
    print("|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for r in rows:
        fmt = "RV565" if r["codec"] == "rv565" else f"MJPEG {r['quality']}"
        print(f"| {clip_name(r['label'])} | {'dual' if r['overlap'] else 'serial'} "
              f"| {fmt} | {r['file_mib']:.2f} MiB | {r['frame_bytes_mean']:,.0f} "
              f"| {db(r['psnr_db'])} ({db(r['psnr_db_worst_frame'])}) "
              f"| {r['fps']:.3f} | {r['deadline_misses']}/{r['frames_timed']} "
              f"| {r['drops']} | {r['decode_ms_p50']:.2f} / {r['decode_ms_p99']:.2f} ms "
              f"| {r['work_ms_p50']:.2f} / {r['work_ms_p99']:.2f} / "
              f"{r['work_ms_max']:.2f} ms |")
    if args.json:
        args.json.write_text(json.dumps(rows, indent=2, default=str) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
