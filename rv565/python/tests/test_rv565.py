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
            rv565.write(io.BytesIO(), 4, 4, 31, [bytes(32)])
        with self.assertRaises(rv565.RV565Error):
            rv565.write(io.BytesIO(), 4, 4, 24, [bytes(31)])
        with self.assertRaises(rv565.RV565Error):
            rv565.write(io.BytesIO(), 4, 4, 24, [])

    def test_schedule_matches_paper_model(self):
        report = rv565.open(VECTOR).check_schedule(overlap=True)
        self.assertEqual(report.late_frames, 0)
        self.assertAlmostEqual(report.worst_frame_us, 31312.0)

    def test_pixel_conversion(self):
        rgb = bytes([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0])
        be = rv565.rgb888_to_rgb565be(rgb)
        self.assertEqual(be.hex(), "f80007e0001fffff0000")
        self.assertEqual(rv565.rgb565be_to_rgb888(be), rgb)


class CliTests(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run([sys.executable, "-I", str(ROOT / "tools" / "rv565.py"), *args],
                              capture_output=True, text=True, check=True).stdout

    def test_info_and_verify(self):
        self.assertIn("180x135, 24 FPS, 24 frames", self.run_cli("info", str(VECTOR)))
        self.assertIn("24 frames verified", self.run_cli("verify", str(VECTOR)))

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

    def test_save_from_duration(self):
        frames = [Image.new("RGB", (8, 8), c) for c in ("red", "blue")]
        buf = io.BytesIO()
        frames[0].save(buf, format="RV565", save_all=True, append_images=frames[1:], duration=100)
        self.assertEqual(rv565.open(buf.getvalue()).fps, 10)


if __name__ == "__main__":
    unittest.main()
