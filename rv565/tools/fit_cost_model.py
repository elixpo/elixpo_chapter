#!/usr/bin/env python3
"""Fit the RV565 decode-cost model from benchmark runs on any chip.

Each --window names the clip that was played and the collector records
(tools/collect_video_benchmark.py JSON) measured with it:

  python3 tools/fit_cost_model.py \\
      --window w90.rv565  benchmarks/measurements/video-benchmark-rp2350-bbb090-serial-r*.json \\
      --window w360.rv565 benchmarks/measurements/video-benchmark-rp2350-bbb360-serial-r*.json

It prints, per window and pooled, the same quantities the paper reports for
the ESP32-S3: FPS, drops, deadline misses, display transfer against the SPI
wire time, the linear inflate model T(L) = a + b*L with its r^2 and even/odd
hold-out error, the serial admission threshold, and a C initialiser for
rv565_cost_model_t. The clip's SHA-256 must match the one each record saw.
Fit the model on serial runs: with overlap, inflate time is still measured
per frame, but it competes with the other core for flash and memory.
"""

import argparse
import csv
import hashlib
import json
import statistics
import struct
import sys
from pathlib import Path


def payload_sizes(path):
    data = path.read_bytes()
    if data[:3] != b"RV5" or data[3] != 6:
        raise SystemExit("%s is not an RV565 v6 file" % path)
    width, height, fps, _, count = struct.unpack_from("<HHBBH", data, 4)
    sizes, offset = [], 12
    for _ in range(count):
        (size,) = struct.unpack_from("<I", data, offset)
        sizes.append(size)
        offset += 4 + size
    if offset != len(data):
        raise SystemExit("%s: trailing bytes after the last frame" % path)
    return hashlib.sha256(data).hexdigest(), (width, height, fps), sizes


def load_runs(media, records):
    digest, (width, height, fps), sizes = payload_sizes(media)
    runs = []
    for record_path in records:
        record = json.loads(record_path.read_text())
        seen = record.get("artifacts", {}).get("media", {}).get("sha256")
        if seen and seen != digest:
            raise SystemExit("%s was measured with a different clip than %s" % (record_path, media))
        with (record_path.parent / record["frame_csv"]).open(newline="") as source:
            frames = [{k: int(v) for k, v in row.items()} for row in csv.DictReader(source)]
        runs.append({"record": record, "frames": frames})
    if not runs:
        raise SystemExit("no records for %s" % media)
    return {"media": media, "size": (width, height), "fps": fps, "sizes": sizes, "runs": runs}


def fit(xs, ys):
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    syy = sum((y - my) ** 2 for y in ys)
    slope = sxy / sxx
    r = sxy / (sxx * syy) ** 0.5 if syy else 1.0
    return my - slope * mx, slope, r


def points(window):
    xs, ys = [], []
    for run in window["runs"]:
        for frame in run["frames"]:
            xs.append(window["sizes"][frame["source_frame"]])
            ys.append(frame["inflate_us"])
    return xs, ys


def report_window(window, panel):
    name = window["media"].name
    runs = window["runs"]
    meta = runs[0]["record"].get("metadata", {})
    period = 1e6 / window["fps"]
    frames = [f for run in runs for f in run["frames"]]
    print("== %s: %d run(s), %d frames, %dx%d @ %d FPS, overlap=%s" % (
        name, len(runs), len(frames), *window["size"], window["fps"], meta.get("overlap", "?")))
    if meta.get("platform") or meta.get("cpu_mhz"):
        print("platform %s, CPU %s MHz, SPI %s kHz" % (
            meta.get("platform", "esp32s3"), meta.get("cpu_mhz", "?"), meta.get("spi_khz", "?")))
    fps = [run["record"]["summary"]["fps"] for run in runs]
    print("FPS mean %.3f (min %.3f), drops %d, deadline misses %d" % (
        statistics.fmean(fps), min(fps),
        sum(run["record"]["summary"]["drops"] for run in runs),
        sum(run["record"]["summary"]["deadline_misses"] for run in runs)))
    work = [f["work_us"] for f in frames]
    print("work mean %.3f ms, max %.3f ms, slack %.3f ms (period %.3f ms)" % (
        statistics.fmean(work) / 1e3, max(work) / 1e3, (period - max(work)) / 1e3, period / 1e3))
    lcd = statistics.fmean(f["lcd_us"] for f in frames)
    spi_khz = meta.get("spi_khz")
    if spi_khz:
        wire = panel[0] * panel[1] * 16 / (spi_khz * 1e3) * 1e6
        print("display transfer %.3f ms vs wire %.3f ms at %s kHz: %.1f%% of the bound" % (
            lcd / 1e3, wire / 1e3, spi_khz, 100 * wire / lcd))
    xs, ys = points(window)
    a, b, r = fit(xs, ys)
    print("inflate model %.3f ms + %.4f us/byte, r2 %.4f" % (a / 1e3, b, r * r))
    return lcd


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--window", nargs="+", action="append", required=True,
                        metavar=("MEDIA", "RECORD"),
                        help="clip followed by the collector JSON records measured with it")
    parser.add_argument("--panel", default="320x240", help="panel size for the wire-time bound")
    parser.add_argument("--name", default="RV565_COST_RP2350_180x135",
                        help="name for the printed C initialiser")
    args = parser.parse_args()
    panel = tuple(int(v) for v in args.panel.lower().split("x"))

    windows = []
    for group in args.window:
        if len(group) < 2:
            raise SystemExit("--window needs a clip and at least one record")
        windows.append(load_runs(Path(group[0]), [Path(p) for p in group[1:]]))

    lcds = [report_window(w, panel) for w in windows]
    print()

    xs, ys, parity = [], [], []
    for window in windows:
        wx, wy = points(window)
        xs += wx
        ys += wy
        parity += [f["source_frame"] % 2 for run in window["runs"] for f in run["frames"]]
    a, b, r = fit(xs, ys)
    residual = [y - (a + b * x) for x, y in zip(xs, ys)]
    print("== Pooled inflate model (%d frames, %d window(s))" % (len(xs), len(windows)))
    print("T(L) = %.3f ms + %.4f us/byte, r2 %.4f, MAE %.3f ms, max error %.3f ms" % (
        a / 1e3, b, r * r, statistics.fmean(map(abs, residual)) / 1e3,
        max(map(abs, residual)) / 1e3))
    train = [(x, y) for x, y, p in zip(xs, ys, parity) if p == 0]
    test = [(x, y) for x, y, p in zip(xs, ys, parity) if p == 1]
    if train and test:
        ta, tb, _ = fit(*zip(*train))
        errors = [abs(y - (ta + tb * x)) for x, y in test]
        print("even->odd hold-out MAE %.3f ms, max %.3f ms" % (
            statistics.fmean(errors) / 1e3, max(errors) / 1e3))
    if len(windows) > 1:
        for i, target in enumerate(windows):
            others = [w for j, w in enumerate(windows) if j != i]
            ox = [x for w in others for x in points(w)[0]]
            oy = [y for w in others for y in points(w)[1]]
            oa, ob, _ = fit(ox, oy)
            tx, ty = points(target)
            errors = [y - (oa + ob * x) for x, y in zip(tx, ty)]
            print("predict %s from the others: mean error %.3f ms, MAE %.3f ms" % (
                target["media"].name, statistics.fmean(errors) / 1e3,
                statistics.fmean(map(abs, errors)) / 1e3))

    period = 1e6 / windows[0]["fps"]
    lcd = statistics.fmean(lcds)
    print("serial admission threshold: L <= %.0f bytes (period %.3f ms, transfer %.3f ms)" % (
        (period - lcd - a) / b, period / 1e3, lcd / 1e3))
    for window in windows:
        late = sum(a + b * s + lcd > period for s in window["sizes"])
        print("  %s: %d/%d frames predicted late on the serial path" % (
            window["media"].name, late, len(window["sizes"])))
    print("\nconst rv565_cost_model_t %s = { %.1ff, %.4ff };" % (args.name, a, b))
    return 0


if __name__ == "__main__":
    sys.exit(main())
