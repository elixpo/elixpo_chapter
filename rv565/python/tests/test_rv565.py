"""Tests for the rv565 package. Run from the repository root:

    python3 -m unittest discover -s python/tests
"""

import io
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python" / "src"))

import rv565  # noqa: E402
from rv565.cli import testpattern_frames  # noqa: E402

VECTOR = ROOT / "tests" / "data" / "testpattern.rv565"

try:
    from PIL import Image, ImageSequence
    import rv565.pillow  # noqa: F401
except ImportError:  # Pillow is optional
    Image = None


class CoreTests(unittest.TestCase):
    def test_vector(self):
        clip = rv565.open(VECTOR)
        self.assertEqual((clip.width, clip.height, clip.fps, len(clip)), (180, 135, 24, 24))
        self.assertEqual(clip.verify(), 24)
        self.assertEqual(len(clip.frame(5)), 180 * 135 * 2)

    def test_round_trip(self):
        frames = list(testpattern_frames(6, 32, 16))
        buf = io.BytesIO()
        self.assertEqual(rv565.write(buf, 32, 16, 12, frames), 6)
        clip = rv565.open(buf.getvalue())
        self.assertEqual(list(clip), frames)
        self.assertEqual(clip.header.duration, 0.5)

    def test_matches_committed_vector_frames(self):
        # zlib output can differ between versions, so compare decoded frames.
        clip = rv565.open(VECTOR)
        self.assertEqual(list(clip), list(testpattern_frames(24, 180, 135)))

    def test_rejects_malformed(self):
        data = VECTOR.read_bytes()
        cases = {
            "not an RV565 file": b"XYZ" + data[3:],
            "unsupported RV565 version": data[:3] + b"\x05" + data[4:],
            "trailing bytes": data + b"\x00",
            "invalid length": data[:-1],
            "file too short": data[:5],
        }
        for message, bad in cases.items():
            with self.subTest(message):
                with self.assertRaisesRegex(rv565.RV565Error, message):
                    rv565.open(bad)

    def test_write_validates(self):
        with self.assertRaises(rv565.RV565Error):
            rv565.write(io.BytesIO(), 4, 4, 61, [bytes(32)])
        with self.assertRaises(rv565.RV565Error):
            rv565.write(io.BytesIO(), 4, 4, 31, [bytes(32)], version=6)
        with self.assertRaises(rv565.RV565Error):
            rv565.write(io.BytesIO(), 4, 4, 24, [bytes(16)], pixel_format="gray8", version=6)
        with self.assertRaises(rv565.RV565Error):
            rv565.write(io.BytesIO(), 4, 4, 24, [bytes(32)], keyframe_interval=0)
        with self.assertRaises(rv565.RV565Error):
            rv565.write(io.BytesIO(), 4, 4, 24, [bytes(32)], pixel_format="rgb555")
        with self.assertRaises(rv565.RV565Error):
            rv565.write(io.BytesIO(), 4, 4, 24, [bytes(31)])
        with self.assertRaises(rv565.RV565Error):
            rv565.write(io.BytesIO(), 4, 4, 24, [])

    def test_schedule_matches_paper_model(self):
        report = rv565.open(VECTOR).check_schedule(overlap=True)
        self.assertEqual(report.late_frames, 0)
        self.assertAlmostEqual(report.worst_frame_us, 31312.0)

    def test_rp2350_model(self):
        model = rv565.COST_RP2350_180x135
        self.assertLess(model.predict(256) + 33419.0, 41667.0)      # test pattern fits
        self.assertGreater(model.predict(30000) + 33419.0, 41667.0)  # a film frame does not

    def test_pixel_conversion(self):
        rgb = bytes([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0])
        be = rv565.rgb888_to_rgb565be(rgb)
        self.assertEqual(be.hex(), "f80007e0001fffff0000")
        self.assertEqual(rv565.rgb565be_to_rgb888(be), rgb)


V7 = ROOT / "tests" / "data" / "v7"


class ConformanceTests(unittest.TestCase):
    """The reference must match the committed vectors (tests/data/v7)."""

    @classmethod
    def setUpClass(cls):
        import json
        cls.manifest = json.loads((V7 / "manifest.json").read_text())

    def test_valid_sequential_and_seek(self):
        import hashlib
        import random
        for entry in self.manifest["valid"]:
            with self.subTest(entry["file"]):
                clip = rv565.open(V7 / entry["file"])
                h = clip.header
                self.assertEqual((h.version, h.width, h.height, h.fps, len(clip), h.pixel_format,
                                  h.codec, h.keyframe_interval, h.frame_bytes),
                                 (entry["version"], entry["width"], entry["height"], entry["fps"],
                                  entry["frames"], entry["pixel_format"], entry["codec"],
                                  entry["keyframe_interval"], entry["frame_bytes"]))
                self.assertEqual([clip.frame_type(i) for i in range(len(clip))],
                                 entry["frame_types"])
                got = [hashlib.sha256(f).hexdigest() for f in clip]
                self.assertEqual(got, entry["frame_sha256"])
                self.assertEqual([[list(r) for r in clip.changed_lines(i)]
                                  for i in range(len(clip))], entry["changed_lines"])
                order = list(range(len(clip)))
                random.Random(entry["file"]).shuffle(order)
                for i in order:
                    fresh = rv565.open(V7 / entry["file"])
                    self.assertEqual(hashlib.sha256(fresh.frame(i)).hexdigest(),
                                     entry["frame_sha256"][i])

    def test_invalid(self):
        for entry in self.manifest["invalid"]:
            with self.subTest(entry["file"]):
                data = (V7 / entry["file"]).read_bytes()
                if entry["stage"] == "open":
                    with self.assertRaises(rv565.RV565Error):
                        rv565.open(data)
                else:
                    clip = rv565.open(data)
                    with self.assertRaises(rv565.RV565Error):
                        clip.verify()

    def test_round_trip_every_format(self):
        rgb = bytes((x * 37 + y * 11) % 256 for y in range(7) for x in range(3 * 9))
        rgb2 = bytes((v + 64) % 256 for v in rgb)
        for fmt in rv565.PIXEL_FORMATS:
            for codec in rv565.CODECS:
                with self.subTest(fmt=fmt, codec=codec):
                    a, b = (rv565.convert(x, 9, 7, fmt) for x in (rgb, rgb2))
                    frames = [a, a, b, a, b, b]
                    buf = io.BytesIO()
                    rv565.write(buf, 9, 7, 60, frames, pixel_format=fmt, codec=codec,
                                keyframe_interval=3)
                    clip = rv565.open(buf.getvalue())
                    self.assertEqual(list(clip), frames)
                    self.assertEqual(clip.frame_type(1), "repeat")
                    self.assertEqual(clip.frame(4), b)
                    self.assertEqual(rv565.convert(rv565.to_rgb888(a, 9, 7, fmt), 9, 7, fmt), a)

    def test_tolerance_bounds_error(self):
        import random
        rnd = random.Random(7)
        base = bytes(rnd.randrange(256) for _ in range(3 * 12 * 9))
        noisy = [bytes(min(255, max(0, b + rnd.randint(-6, 6))) for b in base) for _ in range(8)]
        for fmt in ("rgb565be", "rgb888", "gray8", "gray4", "rgb444"):
            frames = [rv565.convert(f, 12, 9, fmt) for f in noisy]
            for tol in (0, 4, 12):
                with self.subTest(fmt=fmt, tol=tol):
                    buf = io.BytesIO()
                    rv565.write(buf, 12, 9, 24, frames, pixel_format=fmt, keyframe_interval=8,
                                tolerance=tol)
                    for got, want in zip(rv565.open(buf.getvalue()), frames):
                        a = rv565.to_rgb888(got, 12, 9, fmt)
                        b = rv565.to_rgb888(want, 12, 9, fmt)
                        self.assertLessEqual(max(abs(x - y) for x, y in zip(a, b)), tol)

    def test_partial_frames_written(self):
        buf = io.BytesIO()
        top = bytes(2 * 16 * 8)
        frames = [top + bytes(2 * 16 * 8), top + bytes([1]) * (2 * 16 * 8)]
        rv565.write(buf, 16, 16, 24, frames, keyframe_interval=4)
        clip = rv565.open(buf.getvalue())
        self.assertEqual(clip.frame_type(1), "partial")
        self.assertEqual(clip.changed_lines(1), [(8, 8)])
        self.assertEqual(list(clip), frames)
        buf = io.BytesIO()
        rv565.write(buf, 16, 16, 24, frames, keyframe_interval=4, band_lines=0)
        self.assertEqual(rv565.open(buf.getvalue()).frame_type(1), "delta")

    def test_write_v6_matches_vector(self):
        buf = io.BytesIO()
        rv565.write(buf, 180, 135, 24, testpattern_frames(24, 180, 135), 9, version=6)
        self.assertEqual(list(rv565.open(buf.getvalue())), list(rv565.open(VECTOR)))
        self.assertEqual(buf.getvalue()[3], 6)


class CliTests(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run([sys.executable, "-I", str(ROOT / "tools" / "rv565.py"), *args],
                              capture_output=True, text=True, check=True).stdout

    def test_info_and_verify(self):
        self.assertIn("v6, 180x135, 24 FPS, 24 frames", self.run_cli("info", str(VECTOR)))
        self.assertIn("24 frames verified", self.run_cli("verify", str(VECTOR)))
        info = self.run_cli("info", str(V7 / "mono_vpage_zlib_k4.rv565"))
        self.assertIn("mono_vpage, 42 bytes per frame", info)
        self.assertIn("3 key, 6 delta, 0 partial, 0 region, 1 repeat", info)
        self.assertIn("of pixels sent per frame", info)
        self.assertIn("keyframe interval 4", info)

    def test_testpattern_formats(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "tp.rv565")
            self.run_cli("testpattern", out, "--v6")
            self.assertEqual(Path(out).read_bytes()[3], 6)
            self.run_cli("testpattern", out, "--format", "gray4", "--size", "33x20", "--fps", "60")
            clip = rv565.open(out)
            self.assertEqual((clip.pixel_format, clip.fps, clip.header.keyframe_interval),
                             ("gray4", 60, 60))
            self.assertEqual(clip.verify(), 24)

    def test_c_array(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "clip.h")
            self.run_cli("c-array", str(VECTOR), out)
            self.assertIn("rv565_clip_size", Path(out).read_text())


@unittest.skipIf(Image is None, "Pillow not installed")
class PillowTests(unittest.TestCase):
    def test_open(self):
        with Image.open(VECTOR) as im:
            self.assertEqual(im.format, "RV565")
            self.assertEqual((im.size, im.mode, im.n_frames), ((180, 135), "RGB", 24))
            self.assertEqual(im.info["fps"], 24)
            first = im.getpixel((0, 0))
            im.seek(23)
            self.assertEqual(im.tell(), 23)
        self.assertEqual(first, (255, 255, 255))

    def test_save_all_round_trip(self):
        with Image.open(VECTOR) as im:
            frames = [f.copy() for f in ImageSequence.Iterator(im)]
        buf = io.BytesIO()
        frames[0].save(buf, format="RV565", save_all=True, append_images=frames[1:], fps=24)
        clip = rv565.open(buf.getvalue())
        self.assertEqual(list(clip), list(rv565.open(VECTOR)))

    def test_open_v7_formats(self):
        for name in ("rgb888_zlib_k4.rv565", "mono_vpage_stored_k3.rv565", "gray4_zlib_k4.rv565"):
            with self.subTest(name), Image.open(V7 / name) as im:
                clip = rv565.open(V7 / name)
                self.assertEqual((im.size, im.mode, im.n_frames), ((21, 13), "RGB", 10))
                im.seek(7)
                self.assertEqual(im.tobytes(), rv565.to_rgb888(clip.frame(7), 21, 13,
                                                               clip.pixel_format))

    def test_save_v7_options(self):
        frames = [Image.new("RGB", (16, 8), c) for c in ("white", "white", "black")]
        buf = io.BytesIO()
        frames[0].save(buf, format="RV565", save_all=True, append_images=frames[1:], fps=50,
                       pixel_format="mono", keyframe_interval=3)
        clip = rv565.open(buf.getvalue())
        self.assertEqual((clip.pixel_format, clip.fps, clip.frame_type(1)), ("mono", 50, "repeat"))
        self.assertEqual(clip.frame(2), bytes(16))

    def test_save_from_duration(self):
        frames = [Image.new("RGB", (8, 8), c) for c in ("red", "blue")]
        buf = io.BytesIO()
        frames[0].save(buf, format="RV565", save_all=True, append_images=frames[1:], duration=100)
        self.assertEqual(rv565.open(buf.getvalue()).fps, 10)


if __name__ == "__main__":
    unittest.main()


class RegionDeltaTests(unittest.TestCase):
    """Version 8: region deltas (frame type 4)."""

    W, H = 32, 16

    def _clip(self, frames, fmt="rgb565be", **kw):
        buf = io.BytesIO()
        rv565.write(buf, self.W, self.H, 24, frames, pixel_format=fmt, keyframe_interval=8, **kw)
        return buf.getvalue(), rv565.open(buf.getvalue())

    def _frames(self, fmt="rgb565be"):
        size = rv565.frame_size(fmt, self.W, self.H)
        base = bytes(size)
        lines, line_bytes = rv565.frame_lines(fmt, self.W, self.H)
        second = bytearray(base)
        # a small change in the middle of one line of the last band
        mid = line_bytes // 2
        second[(lines - 1) * line_bytes + mid] = 0xFF
        return [base, bytes(second)]

    def test_small_change_is_a_region_and_round_trips(self):
        frames = self._frames()
        data, clip = self._clip(frames)
        self.assertEqual(data[3], 8)
        self.assertEqual(clip.frame_type(1), "region")
        self.assertEqual(list(clip), frames)
        (first, count, x0, xw), = clip.changed_rects(1)
        self.assertEqual((first, count), (8, 8))
        self.assertLess(xw, 2 * self.W)
        self.assertEqual(x0 % 2, 0)
        self.assertEqual(xw % 2, 0)
        self.assertEqual(clip.changed_lines(1), [(8, 8)])

    def test_every_pixel_format_aligns_and_round_trips(self):
        for fmt in rv565.PIXEL_FORMATS:
            with self.subTest(fmt=fmt):
                frames = self._frames(fmt)
                _, clip = self._clip(frames, fmt=fmt)
                self.assertEqual(list(clip), frames)
                _, line_bytes = rv565.frame_lines(fmt, self.W, self.H)
                align = rv565._ALIGN[fmt]
                for _, _, x0, xw in clip.changed_rects(1):
                    self.assertEqual(x0 % align, 0)
                    self.assertTrue((x0 + xw) % align == 0 or x0 + xw == line_bytes)

    def test_version_7_writes_no_regions(self):
        frames = self._frames()
        data, clip = self._clip(frames, version=7)
        self.assertEqual(data[3], 7)
        self.assertEqual(clip.frame_type(1), "partial")
        self.assertEqual(list(clip), frames)

    def test_full_width_change_stays_version_7(self):
        size = rv565.frame_size("rgb565be", self.W, self.H)
        frames = [bytes(size), bytes(size // 2) + bytes([3]) * (size // 2)]
        data, clip = self._clip(frames)
        self.assertEqual(data[3], 7)
        self.assertEqual(clip.frame_type(1), "partial")

    def test_scrolling_band_uses_a_shift(self):
        lines, line_bytes = rv565.frame_lines("rgb565be", self.W, self.H)
        a = bytearray(rv565.frame_size("rgb565be", self.W, self.H))
        for y in range(8, 16):
            for x in range(4, 20):
                a[y * line_bytes + 2 * x] = (x * 7 + y) & 0xFF
        b = bytearray(len(a))
        for y in range(8, 16):
            b[y * line_bytes + 2:(y + 1) * line_bytes] = a[y * line_bytes:(y + 1) * line_bytes - 2]
        _, clip = self._clip([bytes(a), bytes(b)])
        self.assertEqual(list(clip), [bytes(a), bytes(b)])
        self.assertEqual(clip.frame_type(1), "region")

    def _region_file(self, entries, data, version=8):
        """A 32x16 rgb565be stored clip: a black keyframe, then one region
        delta with the given (dx, dy, x0, xw) entries for band 1 (lines 8-15)."""
        import struct
        size = rv565.frame_size("rgb565be", self.W, self.H)
        head = struct.pack("<3sBHHBBHBBBB", b"RV5", version, self.W, self.H, 24, 0, 2, 16, 0, 0, 8)
        key = struct.pack("<IB", size + 1, 0) + bytes(size)
        body = bytes((8, 0b10))
        for dx, dy, x0, xw in entries:
            body += struct.pack("<bbHH", dx, dy, x0, xw)
        body += data
        return head + key + struct.pack("<IB", len(body) + 1, 4) + body

    def test_valid_hand_made_region(self):
        data = self._region_file([(0, 0, 4, 6)], bytes([0xAB]) * (8 * 6))
        clip = rv565.open(data)
        f = clip.frame(1)
        self.assertEqual(f[8 * 64 + 4:8 * 64 + 10], bytes([0xAB]) * 6)
        self.assertEqual(f[8 * 64:8 * 64 + 4], bytes(4))
        self.assertEqual(clip.changed_rects(1), [(8, 8, 4, 6)])

    def test_wide_lines_fall_back_from_region(self):
        # 32769 px of rgb565be is 65538 bytes a line: a change in the last
        # pixel has x0 = 65536, which a region delta can't store. The encoder
        # must fall back and still round-trip losslessly.
        w = 32769
        f0 = bytes(2 * w)
        f1 = f0[:-2] + b"\xf8\x00"
        buf = io.BytesIO()
        rv565.write(buf, w, 1, 24, [f0, f1], keyframe_interval=10)
        clip = rv565.open(buf.getvalue())
        self.assertEqual(clip.frame(1), f1)
        self.assertNotEqual(clip.frame_type(1), 4)

    def test_invalid_regions_are_rejected(self):
        cases = {
            "misaligned start": [(0, 0, 3, 6)],
            "misaligned end": [(0, 0, 4, 5)],
            "zero width": [(0, 0, 4, 0)],
            "past the line": [(0, 0, 60, 6)],
            "shift too far": [(0, 8, 4, 6)],
        }
        for name, entries in cases.items():
            with self.subTest(name):
                xw = max(entries[0][3], 1)
                with self.assertRaises(rv565.RV565Error):
                    rv565.open(self._region_file(entries, bytes(8 * xw)))
        with self.assertRaises(rv565.RV565Error):           # type 4 in a version 7 file
            rv565.open(self._region_file([(0, 0, 4, 6)], bytes(48), version=7))
        with self.assertRaises(rv565.RV565Error):           # wrong stored size
            rv565.open(self._region_file([(0, 0, 4, 6)], bytes(47)))


class CliOptionTests(unittest.TestCase):
    def _args(self, **kw):
        import argparse
        base = dict(v6=False, v7=False, fps=24, format="rgb565be", codec="zlib",
                    keyframe_interval=None, band_lines=8, tolerance=0, motion_range=8)
        base.update(kw)
        return argparse.Namespace(**base)

    def test_default_lets_the_writer_choose_7_or_8(self):
        from rv565 import cli
        self.assertIsNone(cli.container_options(self._args())["version"])

    def test_v7_writes_version_7(self):
        from rv565 import cli
        self.assertEqual(cli.container_options(self._args(v7=True))["version"], 7)
        self.assertIn("version 7", cli.describe(self._args(v7=True, keyframe_interval=24)))

    def test_v6_and_v7_together_is_an_error(self):
        from rv565 import cli
        with self.assertRaises(SystemExit):
            cli.container_options(self._args(v6=True, v7=True, keyframe_interval=1))
