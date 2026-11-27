"""`falera add`: conversion, validation, space checks, and ffmpeg handling."""

import struct
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest import mock

from fake import FakeTransport
from helpers import run_cli

from oreo_cli import media
from oreo_cli.errors import OreoError

try:
    import PIL  # noqa: F401
    HAVE_PIL = True
except ImportError:
    HAVE_PIL = False


def fake_video(frames=3, w=8, h=6, fps=10):
    out = b"RV5\x06" + struct.pack("<HHBBH", w, h, fps, 0, frames)
    for _ in range(frames):
        packed = zlib.compress(b"\x00" * (w * h * 2))
        out += struct.pack("<I", len(packed)) + packed
    return out


class FormatTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)

    def test_detect_and_names(self):
        self.assertEqual(media.detect("a.JPG"), "image")
        self.assertEqual(media.detect("a.mov"), "video")
        self.assertEqual(media.detect("a.md"), "document")
        with self.assertRaises(OreoError):
            media.detect("a.pdf")
        self.assertEqual(media.output_name("My Trip!.jpg", "image"), "My-Trip.rz565")
        self.assertEqual(media.output_name("notes.md", "document"), "notes.mdz")
        self.assertEqual(media.output_name("clip.mp4", "video"), "clip.rv565")
        self.assertEqual(media.destination("video"), "/apps/gallery/assets/optimized")
        self.assertEqual(media.destination("document"), "/documents")

    def test_document_roundtrip(self):
        f = self.dir / "notes.md"
        f.write_text("# Hello\n" * 50)
        blob = media.encode_document(f)
        self.assertEqual(media.validate(blob, "document"), len(blob))
        self.assertEqual(zlib.decompress(blob[8:]), f.read_bytes())

    def test_document_must_be_utf8(self):
        f = self.dir / "bad.txt"
        f.write_bytes(b"\xff\xfe\x00")
        with self.assertRaises(OreoError):
            media.encode_document(f)

    @unittest.skipUnless(HAVE_PIL, "Pillow not installed")
    def test_image(self):
        from PIL import Image
        f = self.dir / "p.png"
        Image.new("RGB", (480, 240), (255, 0, 0)).save(f)
        blob = media.encode_image(f, 240)
        media.validate(blob, "image")
        w, h, _ = struct.unpack("<HHI", blob[4:12])
        self.assertEqual((w, h), (240, 120))
        raw = zlib.decompress(blob[12:])
        self.assertEqual(raw[:2], b"\xf8\x00")      # pure red in RGB565 big-endian

    @unittest.skipUnless(HAVE_PIL, "Pillow not installed")
    def test_image_follows_exif_orientation(self):
        # Phones store a portrait photo as landscape pixels plus an EXIF
        # Orientation tag; 6 means "rotate 90 degrees clockwise to show".
        from PIL import Image
        f = self.dir / "portrait.jpg"
        exif = Image.Exif()
        exif[0x0112] = 6
        Image.new("RGB", (40, 20), (255, 0, 0)).save(f, exif=exif)
        blob = media.encode_image(f, 240)
        w, h, _ = struct.unpack("<HHI", blob[4:12])
        self.assertEqual((w, h), (20, 40))

    def test_video_validation(self):
        good = fake_video()
        self.assertEqual(media.validate(good, "video"), len(good))
        with self.assertRaises(OreoError):
            media.validate(good[:-3], "video")
        with self.assertRaises(OreoError):
            media.validate(good + b"x", "video")

    def test_budget_and_space(self):
        media.check_budget(1024)
        with self.assertRaises(OreoError):
            media.check_budget(6 * 1024 * 1024)
        with self.assertRaises(OreoError) as cm:
            media.check_space(200 * 1024, 300 * 1024)
        self.assertIn("will not fit", cm.exception.message)


class AddCommandTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)

    def test_add_document_to_reader(self):
        f = self.dir / "talk notes.md"
        f.write_text("hello falera")
        save = self.dir / "out"
        r = run_cli(["add", str(f), "--save", str(save)], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("Reader", r.out)
        blob = self.fake.get("/documents/talk-notes.mdz")
        media.validate(blob, "document")
        self.assertEqual((save / "talk-notes.mdz").read_bytes(), blob)

    @unittest.skipUnless(HAVE_PIL, "Pillow not installed")
    def test_add_photo_to_gallery(self):
        from PIL import Image
        f = self.dir / "cat.jpg"
        Image.new("RGB", (64, 48), (0, 128, 255)).save(f)
        r = run_cli(["add", str(f)], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("Gallery", r.out)
        media.validate(self.fake.get("/apps/gallery/assets/optimized/cat.rz565"), "image")

    def test_video_without_ffmpeg_fails_before_touching(self):
        f = self.dir / "clip.mp4"
        f.write_bytes(b"not really a video")
        with mock.patch("shutil.which", return_value=None):
            r = run_cli(["add", str(f)], fake=self.fake)
        self.assertEqual(r.rc, 1)
        self.assertIn("ffmpeg", r.out)
        self.assertIn("brew install ffmpeg", r.out)
        self.assertEqual(self.fake.sent, [])

    def test_video_with_ffmpeg(self):
        f = self.dir / "clip.mp4"
        f.write_bytes(b"x")
        with mock.patch.object(media, "have_ffmpeg", return_value=True), \
                mock.patch.object(media, "encode_video", return_value=fake_video()):
            r = run_cli(["add", str(f)], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertTrue(self.fake.exists("/apps/gallery/assets/optimized/clip.rv565"))

    def test_add_checks_badge_space(self):
        small = FakeTransport(total=256 * 1024)
        self.addCleanup(small.cleanup)
        f = self.dir / "notes.txt"
        # Scattered CJK characters: valid UTF-8 that compresses poorly.
        f.write_text("".join(chr(0x4e00 + (i * 7919) % 20000) for i in range(30000)))
        r = run_cli(["add", str(f)], fake=small)
        self.assertEqual(r.rc, 1, r.out)
        self.assertIn("will not fit", r.out)
        self.assertFalse(small.exists("/documents/notes.txtz"))


# Stands in for ffmpeg: floods stderr well past a pipe's buffer before it
# writes a single frame, as ffmpeg does with a damaged file.
NOISY_FFMPEG = r"""
import sys
for i in range(4000):
    sys.stderr.write("[h264 @ 0x55] error while decoding MB %d 7, bytestream -5\n" % i)
sys.stderr.flush()
frame = bytes(8 * 6 * 2)
sys.stdout.buffer.write(frame * 3)
"""


class FfmpegPipeTest(unittest.TestCase):
    def test_lots_of_ffmpeg_errors_do_not_hang(self):
        import subprocess
        import sys
        import threading
        real_popen = subprocess.Popen
        seen = {}

        def popen(cmd, **kw):
            seen["cmd"] = cmd
            return real_popen([sys.executable, "-c", NOISY_FFMPEG], **kw)
        result = {}

        def work():
            try:
                result["blob"] = media.encode_video("bad.mp4", seconds=0.3, fps=10,
                                                    width=8, height=6)
            except BaseException as e:   # pragma: no cover - reported below
                result["error"] = e
        with mock.patch.object(media, "have_ffmpeg", return_value=True), \
                mock.patch.object(media.subprocess, "Popen", side_effect=popen):
            t = threading.Thread(target=work, daemon=True)
            t.start()
            t.join(20)
        self.assertFalse(t.is_alive(), "encode_video hung on a full stderr pipe")
        self.assertNotIn("error", result, result.get("error"))
        blob = result["blob"]
        self.assertEqual(struct.unpack_from("<H", blob, 10)[0], 3)
        self.assertIn("-nostdin", seen["cmd"])

    def test_ffmpeg_failure_shows_its_last_error(self):
        import subprocess
        import sys
        real_popen = subprocess.Popen
        script = "import sys; sys.stderr.write('a\\nInvalid data found\\n'); sys.exit(1)"

        def popen(cmd, **kw):
            return real_popen([sys.executable, "-c", script], **kw)
        with mock.patch.object(media, "have_ffmpeg", return_value=True), \
                mock.patch.object(media.subprocess, "Popen", side_effect=popen):
            with self.assertRaises(OreoError) as cm:
                media.encode_video("bad.mp4", seconds=0.3, fps=10, width=8, height=6)
        self.assertIn("rc=1", cm.exception.message)
        self.assertEqual(cm.exception.hint, "Invalid data found")


if __name__ == "__main__":
    unittest.main()
