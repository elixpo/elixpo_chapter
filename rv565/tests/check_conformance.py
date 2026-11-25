#!/usr/bin/env python3
"""Check the C library against the conformance vectors in tests/data/v7 or v8.

Runs tests/build/test_conformance on every file in manifest.json: valid files
must open with the listed header and frame types, and every frame must hash
to the listed SHA-256 when decoded in order (in place, and ping-ponging two
buffers) and when seeked to on its own, and rv565_changed_lines must report
the listed runs for every frame (and rv565_changed_rects the listed
rectangles, where the manifest has them). Invalid files must be rejected at the
listed stage ("open" or "decode") with the matching status code.

Usage: check_conformance.py <test_conformance binary> [data/v7 | data/v8]
"""
import json
import subprocess
import sys
from pathlib import Path

PIXEL_FORMATS = ("rgb565be", "rgb565le", "rgb444", "rgb666", "rgb888",
                 "gray8", "gray4", "mono", "mono_vpage")
CODECS = ("stored", "zlib")
TYPES = ("key", "delta", "repeat", "partial", "region")

# rv565_status_t for each rejection reason in the manifest.
STATUS = {
    "magic": -2, "version": -3, "header": -4, "truncated": -5, "trailing": -6,
    "inflate": -7, "pixel_format": -9, "codec": -9, "frame_type": -9,
    "keyframe_interval": -4, "keyframe": -10, "repeat": -11, "stored_size": -11,
    "partial": -13, "region": -13,
}


def run(binary, path):
    out = subprocess.run([binary, str(path)], capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(f"{path.name}: test_conformance exited {out.returncode}: {out.stderr}")
    result = {"seq": {}, "pp": {}, "seek": {}, "errors": {}, "lines": {}, "rects": {}}
    for line in out.stdout.splitlines():
        word, *rest = line.split()
        if word == "open":
            result["open"] = int(rest[0])
        elif word == "header":
            result["header"] = [int(x) for x in rest]
        elif word == "lines":
            result["lines"][int(rest[0])] = [[int(a), int(b)] for a, b in
                                             (x.split(":") for x in rest[1:])]
        elif word == "rects":
            result["rects"][int(rest[0])] = [[int(v) for v in x.split(":")] if ":" in x else x
                                             for x in rest[1:]]
        elif word == "noscratch":
            result["noscratch"] = int(rest[0])
        elif word == "types":
            result["types"] = [TYPES[int(x)] for x in rest]
        elif word.endswith("-error"):
            result["errors"].setdefault(word[:-6], []).append((int(rest[0]), int(rest[1])))
        else:
            result[word][int(rest[0])] = rest[1]
    return result


def check_valid(binary, root, entry):
    problems = []
    r = run(binary, root / entry["file"])
    if r["open"] != 0:
        return [f"open failed with status {r['open']}"]
    w, h, fps, frames, version, _, fmt, codec, k, size = r["header"]
    want = (entry["width"], entry["height"], entry["fps"], entry["frames"], entry["version"],
            entry["pixel_format"], entry["codec"], entry["keyframe_interval"], entry["frame_bytes"])
    got = (w, h, fps, frames, version, PIXEL_FORMATS[fmt], CODECS[codec], k, size)
    if got != want:
        problems.append(f"header {got} != {want}")
    if r["types"] != entry["frame_types"]:
        problems.append(f"frame types {r['types']} != {entry['frame_types']}")
    for i, runs in enumerate(entry["changed_lines"]):
        if r["lines"].get(i) != runs:
            problems.append(f"changed lines of frame {i}: {r['lines'].get(i)} != {runs}")
    if "lines" in r["errors"]:
        problems.append(f"changed lines with a small array: {r['errors']['lines']}")
    for i, rects in enumerate(entry.get("changed_rects", [])):
        if r["rects"].get(i) != rects:
            problems.append(f"changed rects of frame {i}: {r['rects'].get(i)} != {rects}")
    if "rects" in r["errors"]:
        problems.append(f"changed rects with a small array: {r['errors']['rects']}")
    zlib_delta = entry["codec"] == "zlib" and any(
        t in entry["frame_types"] for t in ("delta", "partial", "region"))
    if zlib_delta and r.get("noscratch") != -1:
        problems.append(f"in-place zlib delta without scratch returned {r.get('noscratch')}, expected -1")
    for mode in ("seq", "pp", "seek"):
        if mode in r["errors"]:
            problems.append(f"{mode}: decode errors {r['errors'][mode]}")
        for i, sha in enumerate(entry["frame_sha256"]):
            if r[mode].get(i) != sha:
                problems.append(f"{mode}: frame {i} hash mismatch")
    return problems


def check_invalid(binary, root, entry):
    r = run(binary, root / entry["file"])
    expected = STATUS[entry["reason"]]
    if entry["stage"] == "open":
        if r["open"] != expected:
            return [f"open returned {r['open']}, expected {expected} ({entry['reason']})"]
        return []
    if r["open"] != 0:
        return [f"rejected at open ({r['open']}), expected at decode"]
    problems = []
    for mode in ("seq", "pp", "seek"):
        codes = {code for _, code in r["errors"].get(mode, [])}
        if codes != {expected}:
            problems.append(f"{mode}: decode errors {sorted(codes)}, expected {expected}")
    return problems


def main():
    binary = sys.argv[1]
    root = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent / "data" / "v7"
    manifest = json.loads((root / "manifest.json").read_text())
    failed = 0
    for kind, check in (("valid", check_valid), ("invalid", check_invalid)):
        for entry in manifest[kind]:
            problems = check(binary, root, entry)
            if problems:
                failed += 1
                print(f"FAIL {entry['file']}:")
                for p in problems[:10]:
                    print(f"  {p}")
    valid, invalid = len(manifest["valid"]), len(manifest["invalid"])
    if failed:
        sys.exit(f"conformance: {failed} of {valid + invalid} files failed")
    print(f"conformance ({root.name}): {valid} valid files decode exactly (in order, ping-pong "
          f"and seek), {invalid} invalid files rejected at the right stage")


if __name__ == "__main__":
    main()
