"""Host tests for the FaleraOS 2.0 shell UI helpers: the splash greeting
timeline and word-mask renderer, the eased Scroller, and a full splash
run against a fake display and clock.

The oreoOS package __init__ pulls in the launcher (and config), so the
modules under test are loaded from their files behind a stub package
that only carries api + theme.
"""

import importlib.util
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load(relative_path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _stub_oreoos():
    """Install a minimal `oreoOS` package (api, theme, pixelfont) and
    return the previous sys.modules entries so tearDown can restore."""
    saved = {k: sys.modules.get(k) for k in
             ("oreoOS", "oreoOS.api", "oreoOS.theme", "oreoOS.pixelfont")}
    pkg = types.ModuleType("oreoOS")
    pkg.__path__ = [str(ROOT / "oreoOS")]
    sys.modules["oreoOS"] = pkg
    api = _load("oreoOS/api.py", "oreoOS.api")
    pkg.api = api
    theme = _load("oreoOS/theme.py", "oreoOS.theme")
    pkg.theme = theme
    pf = _load("oreoOS/pixelfont.py", "oreoOS.pixelfont")
    pkg.pixelfont = pf
    return saved


def _restore(saved):
    for k, v in saved.items():
        if v is None:
            sys.modules.pop(k, None)
        else:
            sys.modules[k] = v


class FakeClock:
    def __init__(self):
        self.t = 0

    def ticks_ms(self):
        return self.t

    def ticks_diff(self, a, b):
        return a - b

    def sleep_ms(self, ms):
        self.t += ms


class FakeDisplay:
    """Records calls; keeps a real RGB565 BE row buffer so blit_rows /
    copy_rows behave like the badge backend."""

    def __init__(self, sw, sh):
        self.sw, self.sh = sw, sh
        self.buf = bytearray(sw * sh * 2)
        self.calls = []
        self.presented = []

    def _log(self, *a):
        self.calls.append(a)

    def clear(self, color=0):
        self._log("clear")

    def rect(self, x, y, w, h, color, fill=False):
        self._log("rect", x, y, w, h)

    def text(self, s, x, y, color=0xFFFF, scale=1):
        self._log("text", s, x, y, scale)

    def blit(self, data, x, y, w, h):
        self._log("blit", x, y, w, h)

    def blit_mono(self, mask, x, y, w, h, color):
        self._log("blit_mono", x, y, w, h, color)

    def copy_rows(self, y, h):
        s = self.sw * 2
        return bytearray(self.buf[y * s:(y + h) * s])

    def blit_rows(self, src, y, h, src_y=0):
        s = self.sw * 2
        self.buf[y * s:(y + h) * s] = src[src_y * s:(src_y + h) * s]
        self._log("blit_rows", y, h)

    def present(self):
        self.presented.append(None)

    def present_rect(self, x, y, w, h):
        assert 0 <= y and y + h <= self.sh, (y, h)
        assert 0 <= x and x + w <= self.sw, (x, w)
        self.presented.append((x, y, w, h))

    def set_brightness(self, pct):
        self._log("bright", pct)


class SplashHelpersTest(unittest.TestCase):
    def setUp(self):
        self.saved = _stub_oreoos()
        self.sp = _load("oreoOS/splash.py", "oreoOS.splash")
        self.sp.BIN_PATH = str(ROOT / "oreoOS" / "splash.bin")

    def tearDown(self):
        sys.modules.pop("oreoOS.splash", None)
        _restore(self.saved)

    def test_roll_timeline_three_words_a_second(self):
        sp = self.sp
        self.assertAlmostEqual(1000 / sp.CYCLE_MS, 3.0, delta=0.05)
        self.assertEqual(sp.roll_state(0, 16, 64), (0, 1, 0))
        self.assertEqual(sp.roll_state(sp.HOLD_MS - 1, 16, 64), (0, 1, 0))
        k, n, off = sp.roll_state(sp.HOLD_MS + sp.ROLL_MS // 2, 16, 64)
        self.assertEqual((k, n), (0, 1))
        self.assertTrue(0 < off < 64)
        self.assertEqual(sp.roll_state(sp.CYCLE_MS - 1, 16, 64)[2], 64)
        self.assertEqual(sp.roll_state(sp.CYCLE_MS, 16, 64), (1, 2, 0))
        self.assertEqual(sp.roll_state(sp.CYCLE_MS * 16, 16, 64)[0], 0)

    def test_ease(self):
        sp = self.sp
        vals = [sp.ease(i / 20) for i in range(21)]
        self.assertEqual((vals[0], vals[-1]), (0.0, 1.0))
        self.assertEqual(vals, sorted(vals))

    def test_loader(self):
        sp = self.sp
        self.assertEqual(sp.loader_frac(0, 0.2), 0.0)
        self.assertEqual(sp.loader_frac(sp.MIN_TOTAL_MS, 0.2), 0.2)   # capped by boot
        self.assertAlmostEqual(sp.loader_frac(sp.MIN_TOTAL_MS // 2, 1.0), 0.5)
        f0 = sp.loader_frac(1000, 1.0, done_ms=1000)
        self.assertEqual(sp.loader_frac(1000 + sp.FILL_MS, 1.0, done_ms=1000), 1.0)
        self.assertLess(f0, 1.0)

    def test_blit_gs4_clips_and_keys(self):
        sp = self.sp
        dst_w, dst_h = 6, 3
        dst = bytearray(dst_w * dst_h * 2)
        pal = bytearray(32)
        for v in range(16):
            pal[2 * v], pal[2 * v + 1] = 0x10 + v, 0x20 + v
        key = pal[0] | (pal[1] << 8)
        # 2x2 mask: row 0 = (15, 0), row 1 = (7, 3)
        src = bytes([0xF0, 0x73])
        sp.blit_gs4(dst, dst_w, dst_h, src, 2, 2, 1, 2, pal, key)   # row 1 clipped
        o = (2 * dst_w + 1) * 2
        self.assertEqual(dst[o:o + 2], bytes([0x1F, 0x2F]))
        self.assertEqual(dst[o + 2:o + 4], b"\x00\x00")           # coverage 0: keyed
        self.assertEqual(sum(dst[:2 * dst_w * 2]), 0)              # nothing above y=2

    def test_splash_bin_is_consistent(self):
        sp = self.sp
        art = sp._Art(sp.BIN_PATH)
        try:
            self.assertGreaterEqual(art.count, 8)
            self.assertTrue(all(0 < w <= sp.SW and w % 2 == 0 for w in art.widths))
            self.assertEqual(art.size, (ROOT / "oreoOS" / "splash.bin").stat().st_size)
            self.assertLessEqual(art.band_y + art.band_h, art.bar_y)
            self.assertLessEqual(art.bar_x + art.bar_w, sp.SW)
            self.assertEqual(art.key, art.pal[0] | (art.pal[1] << 8))
            others = {art.pal[2 * v] | (art.pal[2 * v + 1] << 8) for v in range(1, 16)}
            self.assertNotIn(art.key, others)
        finally:
            art.close()

    def test_home_wallpaper_is_a_full_frame(self):
        size = (ROOT / "oreoOS" / "wallpaper.bin").stat().st_size
        self.assertEqual(size, 320 * 240 * 2)

    def test_full_splash_run_without_thread(self):
        sp = self.sp
        clock = FakeClock()
        sp.time = clock
        d = FakeDisplay(sp.SW, sp.SH)
        d._buf = d.buf
        os_obj = types.SimpleNamespace(display=d, _last_brightness=70)
        s = sp.Splash(os_obj)
        s._start_thread = lambda: None       # pump() path, deterministic
        band_y, band_h = s._art.band_y, s._art.band_h
        bar = (s._art.bar_x, s._art.bar_y, s._art.bar_w, s._art.bar_h)
        s.intro()
        s.progress(0.6)
        for _ in range(40):
            self.assertFalse(s.pump())
            clock.t += 30
        s.finish()
        self.assertGreaterEqual(clock.t, sp.MIN_TOTAL_MS)
        self.assertEqual(d.presented[0], None)            # first full frame
        rects = d.presented[1:]
        self.assertTrue(any(p == (0, band_y, sp.SW, band_h) for p in rects))
        self.assertTrue(any(p == bar for p in rects))
        self.assertTrue(all(p in ((0, band_y, sp.SW, band_h), bar) for p in rects))
        self.assertIsNone(s._art)                         # released
        self.assertFalse([c for c in d.calls if c[0] == "bright"])   # no dimming
        self.assertEqual(len(os_obj._splash_frame), sp.SW * sp.SH * 2)
        # The swipe ends on the OS frame and clears the pending flag.
        d.buf[:] = b"\x12\x34" * (sp.SW * sp.SH)
        n = len(d.presented)
        sp.swipe_in(os_obj)
        self.assertIsNone(os_obj._splash_frame)
        self.assertGreater(len(d.presented), n)          # frames were shown
        self.assertEqual(bytes(d.buf[:4]), b"\x12\x34\x12\x34")
        self.assertEqual(bytes(d.buf[-4:]), b"\x12\x34\x12\x34")

    def test_framebuf_swipe_matches_python(self):
        """The C (framebuf) path draws the same chevrons as the Python one,
        up to its 4-row strips: compare at strip-centre rows."""
        sp = self.sp
        import struct as _s

        class FB:
            def __init__(self, buf, w, h, fmt, stride=None):
                self.buf, self.w, self.h = buf, w, h
                self.stride = stride or w

            def _o(self, x, y):
                return (y * self.stride + x) * 2

            def fill_rect(self, x, y, w, h, c):
                px = _s.pack("<H", c)          # framebuf stores native LE
                for r in range(h):
                    o = self._o(x, y + r)
                    self.buf[o:o + w * 2] = px * w

            def blit(self, src, x, y, key=-1):
                for r in range(src.h):
                    so = src._o(0, r)
                    o = self._o(x, y + r)
                    self.buf[o:o + src.w * 2] = src.buf[so:so + src.w * 2]

        fbmod = types.SimpleNamespace(FrameBuffer=FB, RGB565=1)
        splash = bytearray(bytes([1, 1]) * (sp.SW * sp.SH))
        home = bytearray(bytes([2, 2]) * (sp.SW * sp.SH))
        cols = [sp._rgb565(c) for c in sp.SWIPE_COLS]
        swapped = [((c & 0xFF) << 8) | (c >> 8) for c in cols]
        rows = [_s.pack(">H", c) for c in cols]
        for edge in (250, 120, 0, -60):
            a = bytearray(len(home))
            sp.compose_swipe_fb(FB(a, sp.SW, sp.SH, 1), memoryview(splash),
                                memoryview(home), edge, swapped, fbmod)
            b = bytearray(len(home))
            def fill_row(x, y, w, i):
                o = (y * sp.SW + x) * 2
                b[o:o + w * 2] = rows[i] * w
            sp.compose_swipe(b, splash, home, edge, fill_row)
            stride = sp.SW * 2
            for y in range(sp.SWIPE_STRIP // 2, sp.SH, sp.SWIPE_STRIP):
                self.assertEqual(a[y * stride:(y + 1) * stride],
                                 b[y * stride:(y + 1) * stride], (edge, y))

    def test_swipe_geometry(self):
        sp = self.sp
        self.assertGreaterEqual(sp.swipe_edge(0), sp.SW)
        self.assertLessEqual(sp.swipe_edge(sp.SWIPE_MS) + sp.swipe_span()
                             + (sp.SH // 2) * sp.SWIPE_SLOPE // 100, 0)
        stride = sp.SW * 2
        splash = bytes([1, 1]) * (sp.SW * sp.SH)
        home = bytes([2, 2]) * (sp.SW * sp.SH)
        dst = bytearray(len(home))
        fills = []
        def fill_row(x, y, w, i):
            fills.append((x, y, w, i))
            dst[(y * sp.SW + x) * 2:(y * sp.SW + x + w) * 2] = bytes([9, i]) * w
        sp.compose_swipe(dst, splash, home, 100, fill_row)
        mid = (sp.SH // 2) * stride
        self.assertEqual(dst[mid:mid + 2], b"\x01\x01")              # splash on the left
        self.assertEqual(dst[mid + 100 * 2:mid + 100 * 2 + 2], b"\x09\x00")  # first chevron
        self.assertEqual(dst[mid + stride - 2:mid + stride], b"\x02\x02")    # OS on the right
        top_tip = [f for f in fills if f[1] == 0 and f[3] == 0][0]
        self.assertGreater(top_tip[0], 100)                            # chevron: rows away
        # from the centre sit further right, so the tip points left
        sp.compose_swipe(dst, splash, home, sp.SW, fill_row)
        self.assertEqual(bytes(dst), splash)
        sp.compose_swipe(dst, splash, home, -1000, fill_row)
        self.assertEqual(bytes(dst), home)


class ScrollerTest(unittest.TestCase):
    def setUp(self):
        self.saved = _stub_oreoos()
        self.w = _load("oreoOS/widgets.py", "oreoOS.widgets")

    def tearDown(self):
        sys.modules.pop("oreoOS.widgets", None)
        _restore(self.saved)

    def test_glides_and_lands_exactly(self):
        s = self.w.Scroller(0, dur=0.2)
        s.set_target(100)
        seen = []
        while s.step(1 / 30.0):
            seen.append(s.value)
        self.assertEqual(s.value, 100)
        self.assertEqual(seen, sorted(seen))       # monotonic
        self.assertGreater(seen[0], 10)            # ease-out: fast start
        self.assertFalse(s.moving())

    def test_retarget_mid_glide_continues_from_current(self):
        s = self.w.Scroller(0, dur=0.2)
        s.set_target(100)
        s.step(0.05)
        here = s.pos
        s.set_target(200)
        s.step(0.0001)
        self.assertAlmostEqual(s.pos, here, delta=1.0)

    def test_snap(self):
        s = self.w.Scroller(0)
        s.set_target(50, snap=True)
        self.assertEqual(s.value, 50)
        self.assertFalse(s.step(0.1))


class ScrollbarTest(unittest.TestCase):
    def setUp(self):
        self.saved = _stub_oreoos()
        self.w = _load("oreoOS/widgets.py", "oreoOS.widgets")

    def tearDown(self):
        sys.modules.pop("oreoOS.widgets", None)
        _restore(self.saved)

    def test_no_thumb_when_content_fits(self):
        self.assertIsNone(self.w.scrollbar_thumb(100, 5, 5, 0))
        self.assertIsNone(self.w.scrollbar_thumb(100, 3, 5, 0))

    def test_thumb_spans_track_from_top_to_bottom(self):
        # 20 rows, 5 visible, 100 px track: a 25 px thumb.
        self.assertEqual(self.w.scrollbar_thumb(100, 20, 5, 0), (0, 25))
        self.assertEqual(self.w.scrollbar_thumb(100, 20, 5, 15), (75, 25))
        self.assertEqual(self.w.scrollbar_thumb(100, 20, 5, 99), (75, 25))
        self.assertEqual(self.w.scrollbar_thumb(100, 20, 5, -3), (0, 25))

    def test_minimum_thumb_and_units(self):
        self.assertEqual(self.w.scrollbar_thumb(100, 1000, 5, 0)[1], 12)
        self.assertEqual(self.w.scrollbar_thumb(100, 1000, 5, 0, 10)[1], 10)
        # Rows or pixels give the same thumb.
        self.assertEqual(self.w.scrollbar_thumb(150, 7, 3, 2),
                         self.w.scrollbar_thumb(150, 7 * 40, 3 * 40, 80))

    def test_matches_the_inline_code_it_replaced(self):
        # Launcher: thumb from rows, offset from eased pixels.
        track_h, rows_total, vis, cell = 180, 9, 3, 60
        for scroll in range(0, (rows_total - vis) * cell + 1, 7):
            thumb_h = max(12, track_h * vis // rows_total)
            max_scroll = (rows_total - vis) * cell
            want = ((track_h - thumb_h) * scroll // max_scroll, thumb_h)
            self.assertEqual(self.w.scrollbar_thumb(
                track_h, rows_total * cell, vis * cell, scroll), want)

    def test_draw(self):
        d = FakeDisplay(320, 240)
        calls = []
        d.rect = lambda x, y, w, h, c, fill=False: calls.append((x, y, w, h, c))
        self.w.draw_scrollbar(d, 300, 40, 100, 5, 5, 0, track=1)
        self.assertEqual(calls, [])
        self.w.draw_scrollbar(d, 300, 40, 100, 20, 5, 15, track=1, color=2)
        self.assertEqual(calls, [(300, 40, 2, 100, 1), (300, 115, 2, 25, 2)])


class NotifPanelTest(unittest.TestCase):
    def setUp(self):
        self.saved = _stub_oreoos()
        sys.modules["oreoOS"].widgets = _load("oreoOS/widgets.py", "oreoOS.widgets")
        self.np = _load("oreoOS/notif_panel.py", "oreoOS.notif_panel")
        self.clock = FakeClock()
        self.np.time = self.clock
        sys.modules["oreoOS.widgets"]._time = None
        self.d = FakeDisplay(320, 240)
        self.os = types.SimpleNamespace(
            display=self.d, _last_brightness=40, launched=None,
            settings_get=lambda k, default=None: default)
        self.os.launch = lambda name: setattr(self.os, "launched", name)

    def tearDown(self):
        for k in ("oreoOS.notif_panel", "oreoOS.widgets"):
            sys.modules.pop(k, None)
        _restore(self.saved)

    def _open(self, p):
        p.toggle()
        for _ in range(10):
            p.tick(0.05)
        self.assertTrue(p.covers_screen())

    def test_double_tap_always_opens(self):
        np = self.np
        class Captures:
            CAPTURES_C = True
        class OldOptOut:                  # the removed opt-out is ignored
            CAPTURES_C = True
            C_DOUBLE_TAP = False
        self.assertFalse(np.hotkey_allowed(Captures()))
        self.assertTrue(np.double_tap_opens(Captures()))
        self.assertTrue(np.double_tap_opens(OldOptOut()))
        self.assertGreater(np.DOUBLE_TAP_MS, 150)

    def test_hotkey_allowed(self):
        np = self.np

        class Plain:
            pass

        class Captures:
            CAPTURES_C = True

        self.assertTrue(np.hotkey_allowed(Plain()))
        self.assertFalse(np.hotkey_allowed(Captures()))
        inst = Plain()
        inst.CAPTURES_C = True            # runtime opt-in on the instance
        self.assertFalse(np.hotkey_allowed(inst))

    def test_quick_nav_grid(self):
        np, api = self.np, sys.modules["oreoOS.api"]
        self.assertEqual(np.quick_nav(np.Q_WIFI, api.BTN_DOWN), np.Q_UPDATE)
        self.assertEqual(np.quick_nav(np.Q_TORCH, api.BTN_DOWN), np.Q_SETTINGS)
        self.assertIsNone(np.quick_nav(np.Q_UPDATE, api.BTN_DOWN))
        self.assertEqual(np.quick_nav(np.Q_SETTINGS, api.BTN_UP), np.Q_TORCH)
        self.assertEqual(np.quick_nav(np.Q_SETTINGS, api.BTN_RIGHT), np.Q_WIFI)

    def test_full_height_and_torch_round_trip(self):
        np, api = self.np, sys.modules["oreoOS.api"]
        p = np.NotifPanel(self.os)
        self._open(p)
        p.draw(self.d)
        fills = [c for c in self.d.calls if c[0] == "rect"]
        self.assertIn(("rect", 0, 0, 320, 240), fills)   # full-height backdrop
        # Fully open + nothing changed → no repaint.
        self.d.calls.clear()
        p.draw(self.d)
        self.assertEqual(self.d.calls, [])
        # Torch: RIGHT, RIGHT, A.
        for b in (api.BTN_RIGHT, api.BTN_RIGHT, api.BTN_A):
            p.handle_button(b)
        self.assertTrue(p.torch_on())
        self.assertTrue(p.keeps_awake())
        self.assertIn(("bright", 100), self.d.calls)
        self.d.calls.clear()
        p.draw(self.d)
        self.assertEqual(self.d.calls, [("rect", 0, 0, 320, 240)])
        p.handle_button(api.BTN_A)                    # ignored
        self.assertTrue(p.torch_on())
        p.handle_button(api.BTN_HOME)
        self.assertFalse(p.torch_on())
        self.assertFalse(p.is_active())
        self.assertIn(("bright", 40), self.d.calls)
        self.assertEqual(self.os._last_brightness, 40)
        self.assertTrue(p.consume_closed())
        self.assertFalse(p.consume_closed())

    def test_c_toggle_also_leaves_torch(self):
        api = sys.modules["oreoOS.api"]
        p = self.np.NotifPanel(self.os)
        self._open(p)
        p._quick_sel = self.np.Q_TORCH
        p.handle_button(api.BTN_A)
        p.toggle()                                    # run loop's C path
        self.assertFalse(p.torch_on())
        self.assertFalse(p.is_active())

    def test_update_tile_launches_updates(self):
        api = sys.modules["oreoOS.api"]
        p = self.np.NotifPanel(self.os)
        self._open(p)
        p.handle_button(api.BTN_DOWN)                 # WiFi → Update
        p.handle_button(api.BTN_A)
        self.assertEqual(self.os.launched, "updates")
        self.assertFalse(p.is_active())


if __name__ == "__main__":
    unittest.main()
