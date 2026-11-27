"""`falera screenshot`: RGB565 -> RGB888, the PNG writer, scaling, the
badge snippet against a fake FaleraOS, and the old-FaleraOS error."""

import hashlib
import os
import re
import struct
import tempfile
import types
import unittest
import zlib
from pathlib import Path
from unittest import mock

from fake import FakeTransport
from helpers import run_cli

from oreo_cli import screenshot
from oreo_cli.badge import Badge
from oreo_cli.errors import OreoError

W, H = 320, 240


def decode_png(data):
    """(width, height, RGB888 bytes) of an 8-bit RGB, unfiltered PNG; checks
    the signature, chunk CRCs and order on the way."""
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "signature"
    pos, kinds, idat, ihdr = 8, [], b"", None
    while pos < len(data):
        n, = struct.unpack(">I", data[pos:pos + 4])
        kind, body = data[pos + 4:pos + 8], data[pos + 8:pos + 8 + n]
        crc, = struct.unpack(">I", data[pos + 8 + n:pos + 12 + n])
        assert zlib.crc32(kind + body) & 0xFFFFFFFF == crc, kind
        kinds.append(kind)
        if kind == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat += body
        pos += 12 + n
    assert kinds[0] == b"IHDR" and kinds[-1] == b"IEND", kinds
    w, h, depth, ctype, comp, filt, interlace = ihdr
    assert (depth, ctype, comp, filt, interlace) == (8, 2, 0, 0, 0), ihdr
    raw = zlib.decompress(idat)
    assert len(raw) == h * (1 + w * 3)
    rows = []
    for y in range(h):
        row = raw[y * (1 + w * 3):(y + 1) * (1 + w * 3)]
        assert row[0] == 0, "filter type"
        rows.append(row[1:])
    return w, h, b"".join(rows)


def be565(*pixels):
    return b"".join(struct.pack(">H", p) for p in pixels)


def pattern():
    """A 320x240 big-endian RGB565 frame: every pixel differs from its
    neighbours, so a shifted or swapped byte shows."""
    out = bytearray(W * H * 2)
    for i in range(W * H):
        v = (i * 2654435761) & 0xFFFF
        out[2 * i], out[2 * i + 1] = v >> 8, v & 0xFF
    return out


def expected_rgb(data):
    out = bytearray()
    for i in range(0, len(data), 2):
        v = (data[i] << 8) | data[i + 1]
        r, g, b = v >> 11, (v >> 5) & 63, v & 31
        out += bytes(((r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)))
    return bytes(out)


class ConvertTest(unittest.TestCase):
    def test_known_colours(self):
        cases = {0x0000: (0, 0, 0), 0xFFFF: (255, 255, 255), 0xF800: (255, 0, 0),
                 0x07E0: (0, 255, 0), 0x001F: (0, 0, 255), 0xFFE0: (255, 255, 0),
                 0x8410: (132, 130, 132), 0x0821: (8, 4, 8)}
        for v, rgb in cases.items():
            self.assertEqual(screenshot.rgb565_to_rgb888(be565(v)), bytes(rgb), hex(v))

    def test_big_endian_order(self):
        # 0xF800 is red only when read big-endian (little-endian is 0x00F8: blue-green)
        self.assertEqual(screenshot.rgb565_to_rgb888(b"\xf8\x00"), b"\xff\x00\x00")

    def test_every_channel_value_expands_exactly(self):
        for r in range(32):
            self.assertEqual(screenshot.rgb565_to_rgb888(be565(r << 11))[0],
                             (r << 3) | (r >> 2))
        for g in range(64):
            self.assertEqual(screenshot.rgb565_to_rgb888(be565(g << 5))[1],
                             (g << 2) | (g >> 4))

    def test_whole_frame(self):
        data = bytes(pattern())
        self.assertEqual(screenshot.rgb565_to_rgb888(data), expected_rgb(data))


class PngTest(unittest.TestCase):
    def test_round_trip(self):
        rgb = bytes(range(2 * 3 * 3)) * 1   # 3x2 pixels
        w, h, pix = decode_png(screenshot.png_bytes(rgb, 3, 2))
        self.assertEqual((w, h, pix), (3, 2, rgb))

    def test_full_frame(self):
        data = bytes(pattern())
        w, h, pix = decode_png(screenshot.to_png(data, W, H))
        self.assertEqual((w, h), (W, H))
        self.assertEqual(pix, expected_rgb(data))

    def test_wrong_size_is_refused(self):
        with self.assertRaises(ValueError):
            screenshot.png_bytes(b"\x00" * 5, 1, 2)


class ScaleTest(unittest.TestCase):
    def test_nearest_neighbour(self):
        a, b, c, d = b"\x01\x02\x03", b"\x04\x05\x06", b"\x07\x08\x09", b"\x0a\x0b\x0c"
        rgb, w, h = screenshot.scale_rgb(a + b + c + d, 2, 2, 3)
        self.assertEqual((w, h), (6, 6))
        top, bottom = a * 3 + b * 3, c * 3 + d * 3
        self.assertEqual(rgb, top * 3 + bottom * 3)

    def test_scale_one_is_unchanged(self):
        self.assertEqual(screenshot.scale_rgb(b"\x01\x02\x03", 1, 1, 1), (b"\x01\x02\x03", 1, 1))

    def test_png_at_scale_two(self):
        data = be565(0xF800, 0x001F)        # red, blue
        w, h, pix = decode_png(screenshot.to_png(data, 2, 1, 2))
        red, blue = b"\xff\x00\x00", b"\x00\x00\xff"
        self.assertEqual((w, h), (4, 2))
        self.assertEqual(pix, (red * 2 + blue * 2) * 2)


def display_module(buf=None, dirty=False, current=True):
    """A fake oreoWare.display; current=False: an older FaleraOS without it."""
    m = types.ModuleType("oreoWare.display")
    m.Display = object
    if current:
        d = None
        if buf is not None:
            d = types.SimpleNamespace(_buf=buf, _dirty=dirty)
        m.current = lambda: d
    return m


class SnippetTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)

    def test_snippet_is_valid_and_sends_the_buffer(self):
        compile(screenshot.capture_code(), "<snippet>", "exec")
        frame = pattern()
        self.fake.modules["oreoWare.display"] = display_module(frame)
        w, h, data, dirty = screenshot.capture(Badge(self.fake))
        self.assertEqual((w, h, dirty), (W, H, False))
        self.assertEqual(data, bytes(frame))
        self.assertEqual(self.fake.soft_resets, [False])   # a soft reset would clear it

    def test_lines_are_pull_sized(self):
        self.fake.modules["oreoWare.display"] = display_module(pattern())
        screenshot.capture(Badge(self.fake))
        out = b"".join(self.fake.outputs).decode()
        lines = [l for l in out.splitlines() if l.startswith("@B:")]
        self.assertEqual(len(lines), (W * H * 2 + 3071) // 3072)

    def test_not_after_a_soft_reset(self):
        b = Badge(self.fake)
        b.connect()
        with self.assertRaises(OreoError):
            screenshot.capture(b)

    def test_damaged_transfer_is_retried(self):
        # only this computer's check is made to fail (the badge's hashlib is
        # the same module in the fake, so it is not patched)
        self.fake.modules["oreoWare.display"] = display_module(pattern())
        calls = []

        def flaky(data=b""):
            calls.append(1)
            return hashlib.sha256(b"damaged" if len(calls) == 1 else data)
        with mock.patch.object(screenshot, "hashlib", types.SimpleNamespace(sha256=flaky)):
            screenshot.capture(Badge(self.fake))
        self.assertEqual(len(calls), 2)
        self.assertEqual(sum("_dm.current" in s for s in self.fake.sent), 2)

    def test_damaged_twice_fails(self):
        self.fake.modules["oreoWare.display"] = display_module(pattern())
        bad = types.SimpleNamespace(sha256=lambda data=b"": hashlib.sha256(b"damaged"))
        with mock.patch.object(screenshot, "hashlib", bad):
            with self.assertRaises(OreoError) as cm:
                screenshot.capture(Badge(self.fake))
        self.assertIn("intact", cm.exception.message)

    def test_short_transfer_fails(self):
        self.fake.modules["oreoWare.display"] = display_module(pattern())
        real_run = Badge.run

        def lossy(b, code, **kw):
            on_data = kw.pop("on_data")
            seen = []

            def drop_first(piece):
                if seen:
                    on_data(piece)
                seen.append(1)
            return real_run(b, code, on_data=drop_first, **kw)
        with mock.patch.object(Badge, "run", lossy):
            with self.assertRaises(OreoError) as cm:
                screenshot.capture(Badge(self.fake))
        self.assertIn("received", cm.exception.message)


class CommandTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)

    def test_writes_the_png_and_restarts(self):
        frame = pattern()
        self.fake.modules["oreoWare.display"] = display_module(frame)
        target = os.path.join(self.dir.name, "shot.png")
        r = run_cli(["screenshot", target], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        w, h, pix = decode_png(Path(target).read_bytes())
        self.assertEqual((w, h), (W, H))
        self.assertEqual(pix, expected_rgb(frame))
        self.assertEqual(self.fake.soft_resets, [False])
        self.assertEqual(self.fake.restarts, ["soft"])
        self.assertIn("320x240", r.out)

    def test_scale(self):
        self.fake.modules["oreoWare.display"] = display_module(pattern())
        target = os.path.join(self.dir.name, "big.png")
        r = run_cli(["screenshot", target, "--scale", "2"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        w, h, _ = decode_png(Path(target).read_bytes())
        self.assertEqual((w, h), (640, 480))

    def test_default_name_in_a_folder(self):
        self.fake.modules["oreoWare.display"] = display_module(pattern())
        r = run_cli(["screenshot", self.dir.name + os.sep], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        names = os.listdir(self.dir.name)
        self.assertEqual(len(names), 1)
        self.assertRegex(names[0], r"^falera-screenshot-\d{8}-\d{6}\.png$")

    def test_default_name_here(self):
        self.fake.modules["oreoWare.display"] = display_module(pattern())
        cwd = os.getcwd()
        os.chdir(self.dir.name)
        try:
            r = run_cli(["screenshot"], fake=self.fake)
        finally:
            os.chdir(cwd)
        self.assertEqual(r.rc, 0, r.out)
        self.assertTrue(re.match(r"^falera-screenshot-\d{8}-\d{6}\.png$",
                                 os.listdir(self.dir.name)[0]))

    def test_half_drawn_frame_warns(self):
        self.fake.modules["oreoWare.display"] = display_module(pattern(), dirty=True)
        r = run_cli(["screenshot", os.path.join(self.dir.name, "a.png")], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("half drawn", r.out)

    def test_old_faleraos_without_display_current(self):
        self.fake.modules["oreoWare.display"] = display_module(current=False)
        target = os.path.join(self.dir.name, "x.png")
        r = run_cli(["screenshot", target], fake=self.fake)
        self.assertEqual(r.rc, 1, r.out)
        self.assertIn("update FaleraOS", r.out)
        self.assertFalse(os.path.exists(target))
        self.assertEqual(self.fake.restarts, ["soft"])     # FaleraOS runs again

    def test_old_faleraos_without_the_module(self):
        self.fake.modules["oreoWare.display"] = None       # can't import name display
        r = run_cli(["screenshot", os.path.join(self.dir.name, "x.png")], fake=self.fake)
        self.assertEqual(r.rc, 1, r.out)
        self.assertIn("update FaleraOS", r.out)

    def busy_module(self, buf):
        m = types.ModuleType("oreoOS.busy")
        m._display = types.SimpleNamespace(_buf=buf, _dirty=False) if buf is not None else None
        return m

    def test_old_faleraos_is_read_through_busy(self):
        # FaleraOS before display.current(): the launcher's busy.bind() display
        frame = pattern()
        self.fake.modules["oreoWare.display"] = display_module(current=False)
        self.fake.modules["oreoOS.busy"] = self.busy_module(frame)
        target = os.path.join(self.dir.name, "old.png")
        r = run_cli(["screenshot", target], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        w, h, pix = decode_png(Path(target).read_bytes())
        self.assertEqual((w, h), (W, H))
        self.assertEqual(pix, expected_rgb(frame))
        self.assertEqual(self.fake.restarts, ["soft"])

    def test_busy_is_used_when_current_returns_none(self):
        frame = pattern()
        self.fake.modules["oreoWare.display"] = display_module(None)
        self.fake.modules["oreoOS.busy"] = self.busy_module(frame)
        w, h, data, _ = screenshot.capture(Badge(self.fake))
        self.assertEqual(data, bytes(frame))

    def test_display_current_is_preferred(self):
        frame, other = pattern(), bytearray(W * H * 2)
        self.fake.modules["oreoWare.display"] = display_module(frame)
        self.fake.modules["oreoOS.busy"] = self.busy_module(other)
        _, _, data, _ = screenshot.capture(Badge(self.fake))
        self.assertEqual(data, bytes(frame))

    def test_neither_path_asks_for_an_update(self):
        self.fake.modules["oreoWare.display"] = None
        self.fake.modules["oreoOS.busy"] = None
        target = os.path.join(self.dir.name, "x.png")
        r = run_cli(["screenshot", target], fake=self.fake)
        self.assertEqual(r.rc, 1, r.out)
        self.assertIn("update FaleraOS", r.out)
        self.assertFalse(os.path.exists(target))
        self.assertEqual(self.fake.restarts, ["soft"])

    def test_busy_without_a_display_yet(self):
        self.fake.modules["oreoWare.display"] = display_module(current=False)
        self.fake.modules["oreoOS.busy"] = self.busy_module(None)
        r = run_cli(["screenshot", os.path.join(self.dir.name, "x.png")], fake=self.fake)
        self.assertEqual(r.rc, 1, r.out)
        self.assertIn("no display", r.out)

    def test_no_display_yet(self):
        self.fake.modules["oreoWare.display"] = display_module(None)
        r = run_cli(["screenshot", os.path.join(self.dir.name, "x.png")], fake=self.fake)
        self.assertEqual(r.rc, 1, r.out)
        self.assertIn("no display", r.out)

    def test_bad_scale_never_touches_the_badge(self):
        r = run_cli(["screenshot", "--scale", "0"])
        self.assertEqual(r.rc, 2, r.out)
        self.assertEqual(r.links, [])


if __name__ == "__main__":
    unittest.main()
