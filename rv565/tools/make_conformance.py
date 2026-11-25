#!/usr/bin/env python3
"""Write the RV565 conformance vectors in tests/data/v7/ and tests/data/v8/
and their manifests.

    python3 -I tools/make_conformance.py            # regenerate
    python3 -I tools/make_conformance.py --check    # verify the committed set

Every valid vector is listed in manifest.json with its header fields and the
SHA-256 of each decoded frame. zlib output can differ between zlib versions,
so implementations compare decoded frames, never re-encoded files. Every
invalid vector is listed with the stage that must reject it ("open" or
"decode") and a short reason.
"""

import argparse
import hashlib
import io
import json
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python" / "src"))

import rv565  # noqa: E402

OUT = ROOT / "tests" / "data" / "v7"
OUT8 = ROOT / "tests" / "data" / "v8"

# Odd sizes on purpose: rgb444, gray4 and mono pad their rows, and
# mono_vpage pads its last page.
WIDTH, HEIGHT, FPS, FRAMES = 21, 13, 12, 10


def rgb_frames():
    """A gradient with a moving square: frames 0-4 move, 5 repeats 4, 6-9 move again."""
    frames = []
    for f in range(FRAMES):
        t = min(f, 4) if f <= 5 else f - 1
        out = bytearray()
        for y in range(HEIGHT):
            for x in range(WIDTH):
                if t * 2 <= x < t * 2 + 6 and 3 <= y < 9:
                    out += bytes((255, 255, 255)) if (x + y) % 2 else bytes((255, 32, 0))
                else:
                    out += bytes(((x * 255) // (WIDTH - 1), (y * 255) // (HEIGHT - 1), 96))
        frames.append(bytes(out))
    return frames


def sha(data):
    return hashlib.sha256(data).hexdigest()


def valid_vectors():
    rgb = rgb_frames()
    vectors = []
    for fmt in rv565.PIXEL_FORMATS:
        frames = [rv565.convert(f, WIDTH, HEIGHT, fmt) for f in rgb]
        vectors.append(("%s_zlib_k4" % fmt, fmt, "zlib", 4, frames))
        vectors.append(("%s_stored_k3" % fmt, fmt, "stored", 3, frames))
    frames = [rv565.convert(f, WIDTH, HEIGHT, "rgb565be") for f in rgb]
    vectors.append(("rgb565be_zlib_k1", "rgb565be", "zlib", 1, frames))
    vectors.append(("rgb565be_zlib_k255", "rgb565be", "zlib", 255, frames))
    return vectors


def scroll_frames():
    """A random texture scrolling right by 2 pixels a frame in the top rows and
    down by 1 row a frame in the bottom rows, so partial deltas use shifts."""
    import random
    rnd = random.Random(565)
    tex = [[(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256))
            for _ in range(2 * WIDTH)] for _ in range(2 * HEIGHT)]
    frames = []
    for f in range(FRAMES):
        out = bytearray()
        for y in range(HEIGHT):
            for x in range(WIDTH):
                if y < 6:
                    out += bytes(tex[y][(x - 2 * f) % (2 * WIDTH)])
                else:
                    out += bytes(tex[(y - f) % (2 * HEIGHT)][x])
        frames.append(bytes(out))
    return frames


def shift_vectors():
    rgb = scroll_frames()
    vectors = []
    for fmt in ("rgb565be", "rgb888", "rgb444", "gray8", "gray4", "mono", "mono_vpage"):
        frames = [rv565.convert(f, WIDTH, HEIGHT, fmt) for f in rgb]
        band = 1 if fmt == "mono_vpage" else 6
        vectors.append(("%s_zlib_shift_k10" % fmt, fmt, "zlib", 10, frames, band))
    frames = [rv565.convert(f, WIDTH, HEIGHT, "rgb565le") for f in rgb]
    vectors.append(("rgb565le_stored_shift_k10", "rgb565le", "stored", 10, frames, 6))
    return vectors


def partial_vectors():
    """Clips whose deltas are partial: bands of 4 lines (13 rows, so 4 bands,
    the last one short; mono_vpage has 2 pages, so bands of 1 page)."""
    rgb = rgb_frames()
    vectors = []
    for fmt in rv565.PIXEL_FORMATS:
        frames = [rv565.convert(f, WIDTH, HEIGHT, fmt) for f in rgb]
        band = 1 if fmt == "mono_vpage" else 4
        vectors.append(("%s_zlib_partial_k5" % fmt, fmt, "zlib", 5, frames, band))
        vectors.append(("%s_stored_partial_k5" % fmt, fmt, "stored", 5, frames, band))
    return vectors


def build_valid(name, fmt, codec, interval, frames, band_lines=0, version=7):
    buf = io.BytesIO()
    rv565.write(buf, WIDTH, HEIGHT, FPS, frames, 9, pixel_format=fmt, codec=codec,
                keyframe_interval=interval, band_lines=band_lines, version=version)
    return buf.getvalue()


# ── version 8: region deltas ────────────────────────────────────────────────

def window_scroll_frames():
    """A random texture scrolling left by 2 pixels a frame inside columns
    13-20 of rows 1-6 (the right end of the line, so a shifted prediction
    runs off the line and must read as zero), and down by 1 row a frame
    inside columns 3-10 of rows 7-12, on a still gradient: region deltas
    whose ranges are narrower than the line, with shifts."""
    import random
    rnd = random.Random(8)
    tex = [[(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256))
            for _ in range(2 * WIDTH)] for _ in range(2 * HEIGHT)]
    frames = []
    for f in range(FRAMES):
        out = bytearray()
        for y in range(HEIGHT):
            for x in range(WIDTH):
                if 1 <= y < 7 and 13 <= x < WIDTH:
                    out += bytes(tex[y][(x + 2 * f) % (2 * WIDTH)])
                elif 7 <= y < 13 and 3 <= x < 11:
                    out += bytes(tex[(y - f) % (2 * HEIGHT)][x])
                else:
                    out += bytes(((x * 255) // (WIDTH - 1), (y * 255) // (HEIGHT - 1), 96))
        frames.append(bytes(out))
    return frames


def region_vectors():
    """Clips whose deltas are region deltas, in every pixel format and both
    codecs (the moving square), and with shifts (the window scroll)."""
    vectors = []
    for fmt in rv565.PIXEL_FORMATS:
        band = 1 if fmt == "mono_vpage" else 4
        frames = [rv565.convert(f, WIDTH, HEIGHT, fmt) for f in rgb_frames()]
        vectors.append(("%s_zlib_region_k5" % fmt, fmt, "zlib", 5, frames, band))
        vectors.append(("%s_stored_region_k5" % fmt, fmt, "stored", 5, frames, band))
    for fmt in ("rgb565be", "rgb565le", "rgb444", "rgb888", "gray4", "mono"):
        frames = [rv565.convert(f, WIDTH, HEIGHT, fmt) for f in window_scroll_frames()]
        vectors.append(("%s_zlib_region_shift_k10" % fmt, fmt, "zlib", 10, frames, 6))
    return vectors


def invalid_vectors_v8():
    """(name, stage, reason, bytes). 4x2 rgb565be, version 8: 2 lines of 8
    bytes, bands of 1 line, so N = 2 and a 1-byte mask. A region entry is
    dx, dy (signed bytes), then x0 and xw (16-bit little-endian)."""
    f0, f1 = bytes(range(16)), bytes(range(16, 32))
    key0 = record(0, zlib.compress(f0))
    h8 = header(version=8)

    def region(entries, data, mask=b"\x01", band=b"\x01"):
        body = band + mask
        for dx, dy, x0, xw in entries:
            body += struct.pack("<bbHH", dx, dy, x0, xw)
        return record(4, body + data)
    return [
        ("region_in_v7", "open", "frame_type",
         header() + key0 + region([(0, 0, 2, 4)], zlib.compress(f1[2:6]))),
        ("region_band_0", "open", "region",
         h8 + key0 + region([(0, 0, 2, 4)], zlib.compress(f1[2:6]), band=b"\x00")),
        ("region_short_entries", "open", "region",
         h8 + key0 + record(4, b"\x01\x01\x00\x00\x02\x00")),
        ("region_no_band", "open", "region",
         h8 + key0 + region([], zlib.compress(b""), mask=b"\x00")),
        ("region_misaligned_start", "open", "region",
         h8 + key0 + region([(0, 0, 1, 4)], zlib.compress(f1[1:5]))),
        ("region_misaligned_end", "open", "region",
         h8 + key0 + region([(0, 0, 2, 3)], zlib.compress(f1[2:5]))),
        ("region_zero_width", "open", "region",
         h8 + key0 + region([(0, 0, 2, 0)], zlib.compress(b""))),
        ("region_past_line", "open", "region",
         h8 + key0 + region([(0, 0, 6, 4)], zlib.compress(f1[6:10]))),
        ("region_shift_dy_too_far", "open", "region",
         h8 + key0 + region([(0, 1, 2, 4)], zlib.compress(f1[2:6]))),
        ("region_stored_wrong_size", "open", "stored_size",
         header(codec=0, version=8) + record(0, f0) + region([(0, 0, 2, 4)], f1[2:5])),
        ("region_at_keyframe", "open", "keyframe",
         h8 + region([(0, 0, 2, 4)], zlib.compress(f0[2:6])) + key0),
        ("region_inflate_short", "decode", "inflate",
         h8 + key0 + region([(0, 0, 2, 4)], zlib.compress(f1[2:5]))),
    ]


def build_v8():
    manifest = {"width": WIDTH, "height": HEIGHT, "fps": FPS,
                "note": "Version 8 (region deltas). Compare decoded frames by SHA-256, "
                        "and changed_rects (first line, line count, first byte, byte "
                        "count) per frame; see tools/make_conformance.py.",
                "valid": [], "invalid": []}
    files = {}
    for name, fmt, codec, interval, frames, band in region_vectors():
        data = build_valid(name, fmt, codec, interval, frames, band, version=None)
        assert data[3] == 8, name
        clip = rv565.open(data)
        assert list(clip) == frames, name
        types = [clip.frame_type(i) for i in range(len(clip))]
        assert "region" in types, (name, types)
        if "_shift_" in name:
            lines, line_bytes = rv565.frame_lines(fmt, WIDTH, HEIGHT)
            shifts = [sh for i in range(len(clip)) if types[i] == "region"
                      for sh in rv565._region_layout(clip.payload(i), lines, line_bytes,
                                                     rv565._ALIGN[fmt])[2]]
            assert any(dx or dy for dx, dy in shifts), (name, shifts)
        files[name + ".rv565"] = data
        manifest["valid"].append({
            "file": name + ".rv565", "version": 8, "width": WIDTH, "height": HEIGHT,
            "fps": FPS, "frames": FRAMES, "pixel_format": fmt,
            "pixel_format_id": rv565.PIXEL_FORMATS.index(fmt), "codec": codec,
            "keyframe_interval": interval, "frame_bytes": len(frames[0]),
            "frame_types": types, "frame_sha256": [sha(f) for f in frames],
            "changed_lines": [clip.changed_lines(i) for i in range(len(clip))],
            "changed_rects": [clip.changed_rects(i) for i in range(len(clip))],
        })
    for name, stage, reason, data in invalid_vectors_v8():
        files["invalid_" + name + ".rv565"] = data
        manifest["invalid"].append({"file": "invalid_" + name + ".rv565",
                                    "stage": stage, "reason": reason})
    return manifest, files


def build_forced(fmt, codec, interval, frames):
    """Every non-keyframe as a delta (or repeat), whatever its size: encoders
    never choose a stored delta, but decoders must still handle one."""
    size = len(frames[0])
    out = bytearray(struct.pack("<3sBHHBBHBBBB", b"RV5", 7, WIDTH, HEIGHT, FPS, 0,
                                len(frames), 16, rv565.PIXEL_FORMATS.index(fmt),
                                rv565.CODECS.index(codec), interval))
    for i, frame in enumerate(frames):
        if i % interval == 0:
            kind, raw = 0, frame
        elif frame == frames[i - 1]:
            out += record(2, b"")
            continue
        else:
            kind, raw = 1, bytes(a ^ b for a, b in zip(frame, frames[i - 1]))
        assert len(raw) == size
        out += record(kind, raw if codec == "stored" else zlib.compress(raw, 9))
    return bytes(out)


def record(kind, body):
    return struct.pack("<IB", len(body) + 1, kind) + body


def header(fmt=0, codec=1, interval=4, frames=2, version=7, size=16, fps=FPS, w=4, h=2):
    return struct.pack("<3sBHHBBHBBBB", b"RV5", version, w, h, fps, 0, frames,
                       size, fmt, codec, interval)


def invalid_vectors():
    """(name, stage, reason, bytes). Frames are 4x2 rgb565be (16 bytes)."""
    f0, f1 = bytes(range(16)), bytes(range(16, 32))
    key0 = record(0, zlib.compress(f0))
    delta1 = record(1, zlib.compress(bytes(a ^ b for a, b in zip(f0, f1))))
    good = header() + key0 + delta1
    v = [
        ("bad_magic", "open", "magic", b"RV6" + good[3:]),
        ("bad_version", "open", "version", good[:3] + b"\x09" + good[4:]),
        ("zero_width", "open", "header", header(w=0) + key0 + delta1),
        ("zero_frames", "open", "header", header(frames=0)),
        ("fps_61", "open", "header", header(fps=61) + key0 + delta1),
        ("header_size_15", "open", "header", header(size=15) + key0 + delta1),
        ("pixel_format_9", "open", "pixel_format", header(fmt=9) + key0 + delta1),
        ("codec_2", "open", "codec", header(codec=2) + key0 + delta1),
        ("keyframe_interval_0", "open", "keyframe_interval", header(interval=0) + key0 + delta1),
        ("frame_type_4", "open", "frame_type", header() + key0 + record(4, b"x")),
        ("first_frame_delta", "open", "keyframe", header() + delta1 + delta1),
        ("missing_keyframe", "open", "keyframe", header(interval=1) + key0 + delta1),
        ("repeat_with_body", "open", "repeat", header() + key0 + record(2, b"x")),
        # Partial deltas: 4x2 rgb565be is 2 lines of 8 bytes, so bands of 1
        # line give N = 2 and a 1-byte mask.
        # Body: band height, mask, then a (dx, dy) pair per changed band.
        ("partial_band_0", "open", "partial",
         header() + key0 + record(3, b"\x00\x01\x00\x00" + zlib.compress(f1[:8]))),
        ("partial_short_mask", "open", "partial", header() + key0 + record(3, b"\x01")),
        ("partial_short_shifts", "open", "partial", header() + key0 + record(3, b"\x01\x03\x00")),
        ("partial_no_band", "open", "partial",
         header() + key0 + record(3, b"\x01\x00" + zlib.compress(b""))),
        ("partial_band_past_end", "open", "partial",
         header() + key0 + record(3, b"\x01\x05\x00\x00\x00\x00" + zlib.compress(f1))),
        ("partial_shift_dy_too_far", "open", "partial",
         header() + key0 + record(3, b"\x02\x01\x00\x02" + zlib.compress(f1))),
        ("partial_stored_wrong_size", "open", "stored_size",
         header(codec=0) + record(0, f0) + record(3, b"\x01\x01\x00\x00" + f1[:7])),
        ("partial_at_keyframe", "open", "keyframe",
         header() + record(3, b"\x01\x01\x00\x00" + zlib.compress(f0[:8])) + delta1),
        ("partial_inflate_short", "decode", "inflate",
         header() + key0 + record(3, b"\x01\x01\x00\x00" + zlib.compress(f1[:7]))),
        ("stored_wrong_size", "open", "stored_size",
         header(codec=0) + record(0, f0) + record(0, f1[:15])),
        ("zero_length", "open", "truncated", header() + key0 + struct.pack("<I", 0)),
        ("truncated", "open", "truncated", good[:-1]),
        ("trailing_bytes", "open", "trailing", good + b"\x00"),
        ("inflate_short", "decode", "inflate",
         header() + record(0, zlib.compress(f0[:15])) + delta1),
        ("inflate_corrupt", "decode", "inflate",
         header() + record(0, b"\x78\x9c\xff\xff\xff") + delta1),
        ("v6_fps_31", "open", "header",
         struct.pack("<3sBHHBBH", b"RV5", 6, 4, 2, 31, 0, 1)
         + struct.pack("<I", len(zlib.compress(f0))) + zlib.compress(f0)),
    ]
    return v


def build():
    manifest = {"width": WIDTH, "height": HEIGHT, "fps": FPS,
                "note": "Compare decoded frames by SHA-256; see tools/make_conformance.py.",
                "valid": [], "invalid": []}
    files = {}
    for name, fmt, codec, interval, frames in valid_vectors():
        data = build_valid(name, fmt, codec, interval, frames)
        clip = rv565.open(data)
        assert list(clip) == frames, name
        files[name + ".rv565"] = data
        manifest["valid"].append({
            "file": name + ".rv565", "version": 7, "width": WIDTH, "height": HEIGHT,
            "fps": FPS, "frames": FRAMES, "pixel_format": fmt,
            "pixel_format_id": rv565.PIXEL_FORMATS.index(fmt), "codec": codec,
            "keyframe_interval": interval, "frame_bytes": len(frames[0]),
            "frame_types": [clip.frame_type(i) for i in range(len(clip))],
            "frame_sha256": [sha(f) for f in frames],
        })
    for name, fmt, codec, interval, frames, band in partial_vectors() + shift_vectors():
        data = build_valid(name, fmt, codec, interval, frames, band)
        clip = rv565.open(data)
        assert list(clip) == frames, name
        types = [clip.frame_type(i) for i in range(len(clip))]
        assert "partial" in types, (name, types)
        if "_shift_" in name and fmt not in ("mono_vpage",):
            lines, line_bytes = rv565.frame_lines(fmt, WIDTH, HEIGHT)
            shifts = [sh for i in range(len(clip)) if types[i] == "partial"
                      for sh in rv565._partial_layout(clip.payload(i), lines, line_bytes)[2]]
            assert any(dx for dx, _ in shifts) and any(dy for _, dy in shifts), (name, shifts)
        files[name + ".rv565"] = data
        manifest["valid"].append({
            "file": name + ".rv565", "version": 7, "width": WIDTH, "height": HEIGHT,
            "fps": FPS, "frames": FRAMES, "pixel_format": fmt,
            "pixel_format_id": rv565.PIXEL_FORMATS.index(fmt), "codec": codec,
            "keyframe_interval": interval, "frame_bytes": len(frames[0]),
            "frame_types": types, "frame_sha256": [sha(f) for f in frames],
        })
    for fmt in ("rgb565be", "mono", "rgb444"):
        frames = [rv565.convert(f, WIDTH, HEIGHT, fmt) for f in rgb_frames()]
        for codec in ("stored", "zlib"):
            name = "%s_%s_forced_delta_k8" % (fmt, codec)
            data = build_forced(fmt, codec, 8, frames)
            clip = rv565.open(data)
            assert list(clip) == frames, name
            files[name + ".rv565"] = data
            manifest["valid"].append({
                "file": name + ".rv565", "version": 7, "width": WIDTH, "height": HEIGHT,
                "fps": FPS, "frames": FRAMES, "pixel_format": fmt,
                "pixel_format_id": rv565.PIXEL_FORMATS.index(fmt), "codec": codec,
                "keyframe_interval": 8, "frame_bytes": len(frames[0]),
                "frame_types": [clip.frame_type(i) for i in range(len(clip))],
                "frame_sha256": [sha(f) for f in frames],
            })
    v6 = (ROOT / "tests" / "data" / "testpattern.rv565").read_bytes()
    clip = rv565.open(v6)
    manifest["valid"].append({
        "file": "../testpattern.rv565", "version": 6, "width": clip.width,
        "height": clip.height, "fps": clip.fps, "frames": len(clip),
        "pixel_format": "rgb565be", "pixel_format_id": 0, "codec": "zlib",
        "keyframe_interval": 1, "frame_bytes": clip.header.frame_bytes,
        "frame_types": ["key"] * len(clip), "frame_sha256": [sha(f) for f in clip],
    })
    for entry in manifest["valid"]:
        data = files.get(entry["file"]) or (OUT / entry["file"]).read_bytes()
        clip = rv565.open(data)
        entry["changed_lines"] = [clip.changed_lines(i) for i in range(len(clip))]
    for name, stage, reason, data in invalid_vectors():
        files["invalid_" + name + ".rv565"] = data
        manifest["invalid"].append({"file": "invalid_" + name + ".rv565",
                                    "stage": stage, "reason": reason})
    return manifest, files


def check_invalid(manifest, out=OUT):
    """The reference implementation must reject each invalid vector at its stage."""
    for entry in manifest["invalid"]:
        data = (out / entry["file"]).read_bytes()
        try:
            clip = rv565.open(data)
        except rv565.RV565Error:
            if entry["stage"] != "open":
                sys.exit("%s rejected on open, expected on decode" % entry["file"])
            continue
        if entry["stage"] == "open":
            sys.exit("%s was accepted on open" % entry["file"])
        try:
            clip.verify()
        except rv565.RV565Error:
            continue
        sys.exit("%s decoded without error" % entry["file"])


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true",
                        help="verify the committed vectors instead of writing them")
    args = parser.parse_args()
    for out, (manifest, files) in ((OUT, build()), (OUT8, build_v8())):
        if args.check:
            committed = json.loads((out / "manifest.json").read_text())
            for entry in committed["valid"]:
                clip = rv565.open((out / entry["file"]).read_bytes())
                got = [sha(f) for f in clip]
                if got != entry["frame_sha256"]:
                    sys.exit("%s: decoded frames differ from the manifest" % entry["file"])
                if "changed_rects" in entry and [
                        [list(r) for r in clip.changed_rects(i)] for i in range(len(clip))
                ] != entry["changed_rects"]:
                    sys.exit("%s: changed_rects differ from the manifest" % entry["file"])
                fresh = next(e for e in manifest["valid"] if e["file"] == entry["file"])
                if fresh["frame_sha256"] != entry["frame_sha256"]:
                    sys.exit("%s: the generator now produces different frames" % entry["file"])
            check_invalid(committed, out)
            print("ok %s: %d valid and %d invalid vectors" % (
                out.relative_to(ROOT), len(committed["valid"]), len(committed["invalid"])))
            continue
        out.mkdir(parents=True, exist_ok=True)
        for name, data in files.items():
            (out / name).write_bytes(data)
        (out / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
        check_invalid(manifest, out)
        print("wrote %d valid and %d invalid vectors to %s" % (
            len(manifest["valid"]), len(manifest["invalid"]), out.relative_to(ROOT)))


if __name__ == "__main__":
    main()
