# SPDX-License-Identifier: MIT
"""Host tests for the native boot splash: the clip (oreoOS/splash.rv565)
against what oreoOS/splash.py draws, the choice between the firmware's
player and the Python animation, the hand-off of the final frame, and the
lists that ship the clip.

The clip is decoded here with a small standard-library RV565 version 7
reader (the same steps as the firmware's rv565_decode); when the rv565
package is installed it is also checked against the reference decoder.
"""

import importlib.util
import re
import struct
import sys
import types
import unittest
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_shell_ui import (FakeClock, FakeDisplay, _load, _restore,  # noqa: E402
                           _stub_oreoos)

CLIP = ROOT / "oreoOS" / "splash.rv565"
BIN = ROOT / "oreoOS" / "splash.bin"

try:
    import rv565 as _rv565
    if getattr(_rv565, "VERSION", 6) < 7:      # RV565 1.x reads version 6 only
        _rv565 = None
except ImportError:
    _rv565 = None


def _xor(a, b):
    n = len(a)
    return (int.from_bytes(a, "big") ^ int.from_bytes(b, "big")).to_bytes(n, "big")


def _s8(v):
    return v - 256 if v > 127 else v


def decode_clip(data):
    """(header dict, [frame bytes]) of an RV565 version 7 zlib clip."""
    magic, ver, w, h, fps, _flags, n, hsize, fmt, codec, k = struct.unpack_from(
        "<3sBHHBBHBBBB", data, 0)
    assert magic == b"RV5" and ver == 7 and codec == 1
    R = 2 * w
    pos, prev, frames = hsize, None, []
    for i in range(n):
        length = struct.unpack_from("<I", data, pos)[0]
        kind = data[pos + 4]
        body = data[pos + 5:pos + 4 + length]
        pos += 4 + length
        if i % k == 0:
            assert kind == 0, "frame %d must be a keyframe" % i
        if kind == 0:
            cur = zlib.decompress(body)
        elif kind == 1:
            cur = _xor(zlib.decompress(body), prev)
        elif kind == 2:
            assert not body
            cur = prev
        elif kind == 3:
            band = body[0]
            count = (h + band - 1) // band
            mlen = (count + 7) // 8
            mask = body[1:1 + mlen]
            changed = [b for b in range(count) if mask[b >> 3] >> (b & 7) & 1]
            shifts = body[1 + mlen:1 + mlen + 2 * len(changed)]
            res = zlib.decompress(body[1 + mlen + 2 * len(changed):])
            out = bytearray(prev)
            o = 0
            for j, b in enumerate(changed):
                first, end = b * band, min(h, (b + 1) * band)
                dx, dy = _s8(shifts[2 * j]), _s8(shifts[2 * j + 1])
                pred = bytearray()
                for y in range(first, end):
                    sy = y - dy
                    if first <= sy < end:
                        row = prev[sy * R:(sy + 1) * R]
                        if dx > 0:
                            row = b"\0" * dx + row[:R - dx]
                        elif dx < 0:
                            row = row[-dx:] + b"\0" * -dx
                        pred += row
                    else:
                        pred += b"\0" * R
                size = (end - first) * R
                out[first * R:end * R] = _xor(bytes(pred), res[o:o + size])
                o += size
            assert o == len(res)
            cur = bytes(out)
        else:
            raise AssertionError("frame type %d" % kind)
        assert len(cur) == R * h
        frames.append(cur)
        prev = cur
    assert pos == len(data), "trailing bytes"
    head = {"width": w, "height": h, "fps": fps, "frames": n,
            "pixel_format": fmt, "codec": codec, "keyframe_interval": k}
    return head, frames


class _SplashCase(unittest.TestCase):
    def setUp(self):
        self.saved = _stub_oreoos()
        self.saved_rv = sys.modules.get("_oreo_rv565")
        sys.modules.pop("_oreo_rv565", None)
        self.sp = _load("oreoOS/splash.py", "oreoOS.splash")
        self.sp.BIN_PATH = str(BIN)
        self.sp.CLIP_PATH = str(CLIP)
        self.sp.framebuf = None
        self.clock = FakeClock()
        self.sp.time = self.clock

    def tearDown(self):
        sys.modules.pop("oreoOS.splash", None)
        if self.saved_rv is None:
            sys.modules.pop("_oreo_rv565", None)
        else:
            sys.modules["_oreo_rv565"] = self.saved_rv
        _restore(self.saved)

    def _splash(self):
        d = FakeDisplay(self.sp.SW, self.sp.SH)
        d._buf = d.buf
        os_obj = types.SimpleNamespace(display=d, _last_brightness=100)
        return d, os_obj, self.sp.Splash(os_obj)


class ClipTest(_SplashCase):
    @classmethod
    def setUpClass(cls):
        cls.head, cls.frames = decode_clip(CLIP.read_bytes())

    def test_header(self):
        sp = self.sp
        art = sp._Art(str(BIN))
        try:
            count, band_h = art.count, art.band_h
        finally:
            art.close()
        h = self.head
        self.assertEqual((h["width"], h["height"]), (sp.SW, band_h))
        self.assertEqual(h["fps"], sp.CLIP_FPS)
        self.assertLessEqual(h["fps"], 60)
        self.assertEqual(h["frames"], sp.CLIP_WORD_FRAMES * count)
        self.assertEqual((h["pixel_format"], h["codec"]), (0, 1))   # rgb565be, zlib
        # One word per CYCLE_MS: the clip runs at the Python splash's pace.
        self.assertAlmostEqual(sp.CLIP_WORD_FRAMES * 1000 / sp.CLIP_FPS, sp.CYCLE_MS, delta=1)

    def test_every_frame_is_what_the_python_splash_draws(self):
        """Frame i is the band the Python animation draws at clip_time(i):
        Splash._frame() itself, on a fake clock, with framebuf's Python twin."""
        sp = self.sp
        d, _os, s = self._splash()
        s._first_frame()
        b0, b1 = s._band0, s._band1
        self.assertEqual(bytes(d.buf[b0:b1]), self.frames[0])
        for i, frame in enumerate(self.frames):
            s._last = None                  # redraw even when nothing moved
            self.clock.t = s._start + sp.clip_time(i)
            s._frame()
            self.assertEqual(bytes(d.buf[b0:b1]), frame, "frame %d" % i)
        s.release()

    def test_loops_back_to_the_first_word_at_rest(self):
        sp = self.sp
        art = sp._Art(str(BIN))
        try:
            count, band_h = art.count, art.band_h
        finally:
            art.close()
        last = sp.roll_state(sp.clip_time(len(self.frames) - 1), count, band_h)
        self.assertEqual(last[1], 0)                # rolling into word 0
        self.assertGreater(last[2], band_h * 3 // 4)

    def test_rest_frames(self):
        """The player stops on frames with (i % period) < hold: the word at
        rest, which is the same image for every one of them."""
        sp = self.sp
        art = sp._Art(str(BIN))
        try:
            count, band_h = art.count, art.band_h
        finally:
            art.close()
        hold = sp.clip_rest_frames(count, band_h)
        self.assertTrue(0 < hold < sp.CLIP_WORD_FRAMES)
        for word in range(count):
            base = word * sp.CLIP_WORD_FRAMES
            for j in range(hold):
                self.assertEqual(self.frames[base + j], self.frames[base])
            self.assertNotEqual(self.frames[base + hold], self.frames[base])

    def test_tool_renders_the_same_frames(self):
        tool = _load("tools/build_splash_clip.py", "build_splash_clip_under_test")
        frames = list(tool.band_frames(tool.load_splash(), BIN))
        self.assertEqual(frames, self.frames)

    @unittest.skipIf(_rv565 is None, "rv565 2.x package not installed")
    def test_reference_decoder_round_trip(self):
        clip = _rv565.Clip(CLIP.read_bytes())
        clip.verify()
        self.assertEqual(len(clip), len(self.frames))
        for i, f in enumerate(self.frames):
            self.assertEqual(clip.frame(i), f, "frame %d" % i)
        types_ = [clip.frame_type(i) for i in range(len(clip))]
        self.assertEqual(types_.count("key"), 1)          # frame 0 only
        self.assertEqual(set(types_), {"key", "partial", "repeat"})

    @unittest.skipIf(_rv565 is None, "rv565 2.x package not installed")
    def test_generation_is_deterministic(self):
        tool = _load("tools/build_splash_clip.py", "build_splash_clip_det")
        a, frames = tool.encode(tool.load_splash(), BIN)
        b, _ = tool.encode(tool.load_splash(), BIN)
        self.assertEqual(a, b)
        self.assertEqual(decode_clip(a)[1], self.frames)


class FakePlayer:
    """Stands in for the firmware's _oreo_rv565 splash player."""

    def __init__(self, fail_start=False):
        self.loaded = bytearray()
        self.total = None
        self.started = None
        self.progress = []
        self.stops = []
        self.fail_start = fail_start
        self.band = None

    def inflate_frame(self, src, dst):
        raise AssertionError("not used by the splash")

    def splash_load(self, data, offset, total):
        if offset == 0:
            self.loaded = bytearray()
            self.total = total
        assert offset == len(self.loaded) and total == self.total
        self.loaded += bytes(data)

    def splash_start(self, y, **kw):
        if self.fail_start:
            raise OSError("splash SPI device (259)")
        self.started = dict(kw, y=y)

    def splash_progress(self, target, done_ms=None):
        self.progress.append((target, done_ms))

    def splash_stop(self, buf=None, at_rest=False, timeout_ms=1000):
        self.stops.append((None if buf is None else len(buf), at_rest))
        if self.started is None:
            return None
        if buf is not None:
            self.band = bytes(range(256)) * (len(buf) // 256) + bytes(len(buf) % 256)
            buf[:] = self.band
        return (self.started["bar"][2], 200, 0, 9000, 0)


class NativeChoiceTest(_SplashCase):
    def _run(self, player):
        if player is not None:
            sys.modules["_oreo_rv565"] = player
        d, os_obj, s = self._splash()
        threads = []
        s._start_thread = lambda: threads.append(1)
        s.intro()
        s.progress(0.6)
        for _ in range(20):
            self.assertFalse(s.pump())
            self.clock.t += 30
        s.finish()
        return d, os_obj, s, threads

    def test_native_player_takes_the_band_and_the_loader(self):
        sp = self.sp
        p = FakePlayer()
        d, os_obj, s, threads = self._run(p)
        art = sp._Art(str(BIN))
        try:
            band_y, band_h, count = art.band_y, art.band_h, art.count
            bar = (art.bar_x, art.bar_y, art.bar_w, art.bar_h)
            track, fill = art.bar_track, art.bar_fill
        finally:
            art.close()
        self.assertEqual(threads, [])                       # no Python animation
        self.assertEqual(bytes(p.loaded), CLIP.read_bytes())
        st = p.started
        self.assertEqual(st["y"], band_y)
        self.assertEqual(st["period"], sp.CLIP_WORD_FRAMES)
        self.assertEqual(st["hold"], sp.clip_rest_frames(count, band_h))
        self.assertEqual(st["bar"], bar)
        self.assertEqual((st["track"], st["fill"]), (track, fill))
        self.assertEqual((st["min_total"], st["fill_ms"]), (sp.MIN_TOTAL_MS, sp.FILL_MS))
        self.assertGreater(st["life"], sp.MAX_TOTAL_MS)
        self.assertEqual(st["spi"], 1)
        # Only the first frame came from Python; the player drew the rest.
        self.assertEqual(d.presented, [None])
        self.assertIn((0.6, None), p.progress)
        done = [pr for pr in p.progress if pr[1] is not None]
        self.assertEqual(len(done), 1)
        self.assertEqual(done[0][0], 1.0)
        self.assertGreaterEqual(self.clock.t, sp.MIN_TOTAL_MS)
        # Stopped once, on a word at rest, into the framebuffer's band.
        self.assertEqual(p.stops, [(sp.SW * band_h * 2, True)])
        snap = os_obj._splash_frame
        b0 = band_y * sp.SW * 2
        self.assertEqual(bytes(snap[b0:b0 + len(p.band)]), p.band)
        # The loader the player left (full) is in the snapshot too.
        o = (bar[1] * sp.SW + bar[0]) * 2
        self.assertEqual(bytes(snap[o:o + bar[2] * 2]), struct.pack(">H", fill) * bar[2])
        self.assertIsNone(s._native)
        self.assertIsNone(s._art)

    def test_old_firmware_falls_back_to_python(self):
        """OTA never updates the firmware: an _oreo_rv565 with only
        inflate_frame means the Python animation, as before."""
        old = types.ModuleType("_oreo_rv565")
        old.inflate_frame = lambda src, dst: 0
        d, os_obj, s, threads = self._run(old)
        self.assertEqual(threads, [1])
        art = self.sp._Art(str(BIN))
        try:
            band = (0, art.band_y, self.sp.SW, art.band_h)
        finally:
            art.close()
        self.assertIn(band, d.presented)
        self.assertIsNotNone(os_obj._splash_frame)

    def test_no_module_falls_back_to_python(self):
        d, os_obj, s, threads = self._run(None)
        self.assertEqual(threads, [1])
        self.assertIsNotNone(os_obj._splash_frame)

    def test_failed_start_falls_back_and_frees(self):
        p = FakePlayer(fail_start=True)
        d, os_obj, s, threads = self._run(p)
        self.assertEqual(threads, [1])
        self.assertEqual(p.stops[0], (None, False))          # clip freed
        self.assertIsNotNone(os_obj._splash_frame)

    def test_missing_clip_falls_back(self):
        self.sp.CLIP_PATH = str(ROOT / "oreoOS" / "no-such-clip.rv565")
        p = FakePlayer()
        d, os_obj, s, threads = self._run(p)
        self.assertEqual(threads, [1])
        self.assertIsNone(p.started)

    def test_release_stops_a_running_player(self):
        p = FakePlayer()
        sys.modules["_oreo_rv565"] = p
        d, os_obj, s = self._splash()
        s.intro()
        self.assertIsNotNone(p.started)
        s.release()
        self.assertEqual(len(p.stops), 1)
        self.assertIsNone(s._native)

    def test_native_disabled_by_flag(self):
        self.sp.NATIVE = False
        p = FakePlayer()
        d, os_obj, s, threads = self._run(p)
        self.assertEqual(threads, [1])
        self.assertIsNone(p.started)


class FirmwareContractTest(unittest.TestCase):
    """splash.py and the C player must agree on names and arguments."""

    C = ROOT / "firmware" / "usermods" / "oreo_rv565"

    def test_module_exports_the_player(self):
        text = (self.C / "modoreo_rv565.c").read_text()
        for name in ("inflate_frame", "splash_load", "splash_start",
                     "splash_progress", "splash_stop", "splash_state"):
            self.assertIn("MP_QSTR_%s)" % name, text)

    def test_start_keywords_exist_in_c(self):
        src = (ROOT / "oreoOS" / "splash.py").read_text()
        call = src[src.index("m.splash_start("):]
        call = call[:call.index("**kw)")]
        kws = set(re.findall(r"(\w+)=", call))
        kws |= {"cs", "dc", "baud"}                 # from oreoWare.pins
        c = (self.C / "oreo_splash.c").read_text()
        allowed = set(re.findall(r"MP_QSTR_(\w+),\s+MP_ARG_KW_ONLY", c))
        self.assertTrue(kws, call)
        self.assertLessEqual(kws, allowed)

    def test_c_defaults_are_the_badge_pins(self):
        pins = (ROOT / "oreoWare" / "pins.py").read_text()
        c = (self.C / "oreo_splash.c").read_text()
        for key, name in (("cs", "DISPLAY_CS"), ("dc", "DISPLAY_DC")):
            v = re.search(r"^%s\s*=\s*(\d+)" % name, pins, re.M).group(1)
            self.assertRegex(c, r"MP_QSTR_%s,.*\{\.u_int = %s\}" % (key, v))

    def test_vendored_core_is_pinned(self):
        note = (self.C / "rv565" / "VENDORED.md").read_text()
        self.assertIn("2.0.0", note)
        header = (self.C / "rv565" / "rv565.h").read_text()
        self.assertIn("#define RV565_VERSION_MAJOR 2", header)
        cmake = (self.C / "micropython.cmake").read_text()
        self.assertIn("oreo_splash.c", cmake)
        self.assertIn("rv565_core.c", cmake)

    def test_display_and_hostui_stop_a_leftover_player(self):
        disp = (ROOT / "oreoWare" / "display.py").read_text()
        init = disp[disp.index("    def __init__(self):"):]
        self.assertTrue(init.split("\n")[1].strip() == "_stop_native_splash()")
        hostui = (ROOT / "oreoOS" / "hostui.py").read_text()
        panel = hostui[hostui.index("def _panel():"):hostui.index("def _strip():")]
        self.assertLess(panel.index("splash_stop()"), panel.index("SPI("))


class ShippedClipTest(unittest.TestCase):
    def test_deploy_and_release_ship_the_clip(self):
        text = (ROOT / "tools" / "deploy.py").read_text()
        self.assertIn('("oreoOS/splash.rv565",', text)
        spec = importlib.util.spec_from_file_location(
            "oreo_release_clip", ROOT / "tools" / "build_release.py")
        release = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(release)
        shipped = {rel for _, rel in release._collect_paths()}
        self.assertIn("oreoOS/splash.rv565", shipped)

    def test_clip_is_tracked_not_ignored(self):
        import subprocess
        r = subprocess.run(["git", "-C", str(ROOT), "check-ignore", "-q",
                            "oreoOS/splash.rv565"])
        self.assertNotEqual(r.returncode, 0)


if __name__ == "__main__":
    unittest.main()
