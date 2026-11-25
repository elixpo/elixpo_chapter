"""Host tests for oreoOS.busy (loading animation), oreoOS.hostui (the
screen the CLI draws at the raw REPL) and oreoOS.usbhost (is a computer
on the USB port?), with fake displays, panels, framebuf and registers.
"""

import importlib.util
import sys
import threading
import time
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load(rel, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


class _Saved:
    def __init__(self, names):
        self.saved = {k: sys.modules.get(k) for k in names}

    def restore(self):
        for k, v in self.saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v


def _fake_framebuf():
    fb = types.ModuleType("framebuf")
    fb.RGB565, fb.MONO_HLSB = 1, 2

    class FrameBuffer:
        def __init__(self, buf, w, h, fmt):
            self.buf, self.w, self.h, self.fmt = buf, w, h, fmt
            self.ops = []

        def fill(self, c):
            self.ops.append(("fill", c))

        def fill_rect(self, x, y, w, h, c):
            self.ops.append(("fill_rect", x, y, w, h, c))

        def text(self, s, x, y, c):
            self.ops.append(("text", s, x, y, c))

        def pixel(self, x, y, c=None):
            return 1 if c is None and (x + y) % 5 == 0 else 0

    fb.FrameBuffer = FrameBuffer
    return fb


def _stub_oreoos():
    pkg = types.ModuleType("oreoOS")
    pkg.__path__ = [str(ROOT / "oreoOS")]
    sys.modules["oreoOS"] = pkg
    pkg.api = _load("oreoOS/api.py", "oreoOS.api")
    pkg.theme = _load("oreoOS/theme.py", "oreoOS.theme")
    return pkg


# ── oreoOS.busy ─────────────────────────────────────────────────────────────

class PanelDisplay:
    """Like oreoWare.display.Display: present/present_rect on the class,
    push_buffer straight to the panel. Flags any overlap of two panel
    writes (the animator thread and the UI thread)."""

    def __init__(self, push_delay=0.0):
        self.calls = []
        self.lock = threading.Lock()
        self.in_spi = False
        self.overlap = False
        self.push_delay = push_delay
        self._dirty = False

    def _spi(self, what, *args):
        if self.in_spi:
            self.overlap = True
        self.in_spi = True
        try:
            if what == "push" and self.push_delay:
                time.sleep(self.push_delay)
            with self.lock:
                self.calls.append((what,) + args)
        finally:
            self.in_spi = False

    def rect(self, *a, **k):
        self.calls.append(("rect",) + a)
        self._dirty = True

    def text(self, *a, **k):
        self.calls.append(("text",) + a)
        self._dirty = True

    def present(self):
        if self._dirty:
            self._dirty = False
            self._spi("present")

    def present_rect(self, x, y, w, h):
        if self._dirty:
            self._dirty = False
            self._spi("present_rect", x, y, w, h)

    def push_buffer(self, buf, x, y, w, h, src_x=0, src_y=0, src_w=None):
        self._spi("push", x, y, w, h, src_x, src_y, src_w, len(buf))

    def pushes(self):
        with self.lock:
            return [c for c in self.calls if c[0] == "push"]


class PlainDisplay(PanelDisplay):
    """A display without push_buffer: busy must draw on the caller's thread."""
    push_buffer = None

    def __getattribute__(self, name):
        if name == "push_buffer":
            raise AttributeError(name)
        return object.__getattribute__(self, name)


def _wait(cond, timeout=2.0):
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        if cond():
            return True
        time.sleep(0.005)
    return False


class BusyTest(unittest.TestCase):
    def setUp(self):
        self.saved = _Saved(("oreoOS", "oreoOS.api", "oreoOS.theme",
                             "oreoOS.busy", "framebuf"))
        _stub_oreoos()
        sys.modules["framebuf"] = _fake_framebuf()
        self.busy = _load("oreoOS/busy.py", "oreoOS.busy")
        self.busy.SPIN_MS = 5

    def tearDown(self):
        self.busy.stop(restore=False)
        self.saved.restore()

    def test_card_animates_on_a_thread(self):
        d = PanelDisplay()
        b = self.busy.start("Installing Racer", "Starting", 0.0, display=d)
        self.assertTrue(b.threaded)
        self.assertTrue(self.busy.active())
        self.assertTrue(_wait(lambda: len(d.pushes()) >= 4))
        pushes = d.pushes()
        bz = self.busy
        # First the whole card, then only the 24x24 spinner inside it.
        self.assertEqual(pushes[0][1:5], (bz.CARD_X, bz.CARD_Y, bz.CARD_W,
                                          bz.CARD_H))
        self.assertEqual(pushes[1][1:5], (bz.CARD_X + bz.PAD,
                                          bz.CARD_Y + bz.PAD, bz.SPIN, bz.SPIN))
        self.assertEqual(pushes[1][7], bz.CARD_W)        # source row stride
        # The framebuffer is never drawn into by the animator.
        self.assertFalse([c for c in d.calls if c[0] in ("rect", "text")])
        n = len(pushes)
        b.progress(0.5, "main.py")
        self.assertTrue(_wait(lambda: any(
            p[3] == bz.CARD_W for p in d.pushes()[n:])))
        b.stop()
        self.assertFalse(self.busy.active())
        settled = len(d.pushes())
        time.sleep(0.05)
        self.assertEqual(len(d.pushes()), settled)        # thread gone
        self.assertEqual(d.calls[-1][0], "present")        # screen restored

    def test_ui_present_stops_the_animator_first(self):
        d = PanelDisplay(push_delay=0.004)
        b = self.busy.start("Checking", display=d)
        self.assertTrue(_wait(lambda: len(d.pushes()) >= 2))
        d.rect(0, 0, 10, 10, 0)            # the UI thread draws again...
        d.present()                        # ...and presents: guarded
        self.assertFalse(b.running)
        self.assertNotIn("present", d.__dict__)            # guard removed
        n = len(d.pushes())
        time.sleep(0.04)
        self.assertEqual(len(d.pushes()), n)
        self.assertFalse(d.overlap)

    def test_no_overlap_under_load(self):
        d = PanelDisplay(push_delay=0.002)
        for _ in range(5):
            b = self.busy.start("Busy", display=d)
            _wait(lambda: len(d.pushes()) >= 1)
            d._dirty = True
            d.present_rect(0, 0, 320, 240)
            self.assertFalse(b.running)
        self.assertFalse(d.overlap)

    def test_delay_hides_quick_work(self):
        d = PanelDisplay()
        b = self.busy.start("Opening photo", "a.rz565", display=d,
                            delay_ms=300)
        time.sleep(0.03)
        b.stop()
        self.assertEqual(d.calls, [])          # nothing drawn, no restore

    def test_with_block_stops_on_error(self):
        d = PanelDisplay()
        with self.assertRaises(ValueError):
            with self.busy.show("Installing", display=d) as b:
                _wait(lambda: d.pushes())
                raise ValueError("boom")
        self.assertFalse(b.running)
        self.assertFalse(self.busy.active())

    def test_new_animation_replaces_the_old(self):
        d = PanelDisplay()
        a = self.busy.spinner(d, 148, 168)
        b = self.busy.start("Checking for updates", display=d)
        self.assertFalse(a.running)
        self.assertTrue(b.running)
        b.stop(restore=False)

    def test_spinner_only(self):
        d = PanelDisplay()
        s = self.busy.spinner(d, 148, 168, fg=1, bg=2)
        self.assertTrue(_wait(lambda: len(d.pushes()) >= 2))
        for p in d.pushes():
            self.assertEqual(p[1:5], (148, 168, 24, 24))
        s.stop(restore=False)
        self.assertNotEqual(d.calls[-1][0], "present")

    def test_fallback_draws_on_the_calling_thread(self):
        d = PlainDisplay()
        clock = [0]
        self.busy._ticks = lambda: clock[0]
        self.busy.SPIN_MS = 90
        b = self.busy.start("Installing", "Starting", 0.0, display=d)
        self.assertFalse(b.threaded)
        self.assertIn(("present_rect", self.busy.CARD_X, self.busy.CARD_Y,
                       self.busy.CARD_W, self.busy.CARD_H), d.calls)
        n = len(d.calls)
        b.progress(0.3)                    # too soon: waits
        self.assertEqual(len(d.calls), n)
        clock[0] += 100
        b.pump()                           # the change is drawn now
        self.assertTrue([c for c in d.calls[n:] if c[0] == "present_rect"])
        texts = [c[1] for c in d.calls if c[0] == "text"]
        self.assertIn("30%", texts)
        b.stop()

    def test_no_display_is_a_no_op(self):
        b = self.busy.start("Nothing", display=None)
        b.progress(0.5, "x")
        b.stop()
        self.busy.progress(0.2)
        self.busy.stop()

    def test_card_layout_fits(self):
        bz = self.busy
        rec = PanelDisplay()
        cv = bz._Disp(rec)
        bz.draw_card(cv, bz.CARD_X, bz.CARD_Y, "A" * 60, "B" * 60, 1.0, 3)
        for c in rec.calls:
            if c[0] == "text":
                s, x, y = c[1], c[2], c[3]
                self.assertLessEqual(x + len(s) * 8,
                                     bz.CARD_X + bz.CARD_W - 2, s)
                self.assertLessEqual(y + 8, bz.CARD_Y + bz.CARD_H - 2)
        self.assertEqual(bz.fraction(2), 1.0)
        self.assertEqual(bz.fraction(-1), 0.0)
        self.assertIsNone(bz.fraction(None))
        self.assertIsNone(bz.fraction("x"))


# ── the launcher's spinner on the LOADING slide ─────────────────────────────

class LoadingSpinnerTest(unittest.TestCase):
    def setUp(self):
        import test_c_key_rule as ck
        self.ck = ck
        self.h = ck.GamepadDoubleTapTest("test_first_c_reaches_gamepad_second_opens_panel")
        self.h.setUp()
        self.fb_saved = _Saved(("framebuf",))
        sys.modules["framebuf"] = _fake_framebuf()
        self.busy = _load("oreoOS/busy.py", "oreoOS.busy")
        self.busy.SPIN_MS = 5

    def tearDown(self):
        self.busy.stop(restore=False)
        self.h.tearDown()
        self.fb_saved.restore()

    def test_spinner_runs_during_on_enter_only(self):
        # The fallback for an OS without oreoOS.opening (the LOADING panel
        # of the open itself is tested in test_app_open).
        saved = _Saved(("oreoOS.opening",))
        sys.modules["oreoOS.opening"] = None
        self.addCleanup(saved.restore)
        launcher, busy = self.h.launcher, self.busy
        launcher.LOADING_SPIN_DELAY_MS = 0
        launcher._show_loading = lambda os_obj, label, author=None: False
        d = PanelDisplay()
        seen = {}

        class Slow:
            name = "Slow"
            SHOW_LOADING = True

            def on_enter(self, os_obj):
                seen["active"] = busy.active()
                seen["moved"] = _wait(lambda: len(d.pushes()) >= 2)

            def update(self, dt):
                pass

            def draw(self, dd):
                pass

            def on_exit(self):
                pass

        os_obj = types.SimpleNamespace(
            display=d, _quit_requested=False, _launch_request=None,
            _home_marked=True, _power=None, _just_woke=False)
        os_obj.buttons = self.ck._Buttons([], os_obj, self.h.clock)
        launcher.run_app(os_obj, Slow())
        self.assertTrue(seen["active"])
        self.assertTrue(seen["moved"])
        self.assertFalse(busy.active())
        for p in d.pushes():
            self.assertEqual(p[2], launcher.LOADING_SPIN_Y)
        self.assertFalse(d.overlap)


# ── oreoOS.hostui ───────────────────────────────────────────────────────────

class FakePanel:
    instances = []

    def __init__(self, spi, dc, cs, rst, bl, **kw):
        self.spi = spi
        self.windows = []
        self.resumed = 0
        self.inited = 0
        self.lit = 0
        FakePanel.instances.append(self)

    def resume(self):
        self.resumed += 1

    def init(self):
        self.inited += 1

    def bl(self, v):
        self.lit = v

    def set_window(self, x0, y0, x1, y1):
        self.windows.append((x0, y0, x1, y1))

    def cs(self, v):
        pass

    def dc(self, v):
        pass


class FakeSPI:
    fail = False

    def __init__(self, *a, **k):
        self.bytes = 0

    def write(self, data):
        if FakeSPI.fail:
            raise OSError("spi")
        self.bytes += len(data)


class HostUiTest(unittest.TestCase):
    def setUp(self):
        self.saved = _Saved(("machine", "framebuf", "oreoWare",
                             "oreoWare.pins", "oreoWare._st7789",
                             "oreoOS.hostui"))
        machine = types.ModuleType("machine")

        class Pin:
            OUT = 1

            def __init__(self, *a, **k):
                pass
        machine.Pin = Pin
        machine.SPI = FakeSPI
        sys.modules["machine"] = machine
        sys.modules["framebuf"] = _fake_framebuf()
        ow = types.ModuleType("oreoWare")
        ow.__path__ = []
        sys.modules["oreoWare"] = ow
        pins = types.ModuleType("oreoWare.pins")
        for k, v in dict(DISPLAY_CS=14, DISPLAY_RESET=16, DISPLAY_DC=15,
                         DISPLAY_MOSI=11, DISPLAY_SCK=12, DISPLAY_BL=17,
                         DISPLAY_BAUD=40000000).items():
            setattr(pins, k, v)
        sys.modules["oreoWare.pins"] = pins
        st = types.ModuleType("oreoWare._st7789")
        st.ST7789 = FakePanel
        sys.modules["oreoWare._st7789"] = st
        ow.pins, ow._st7789 = pins, st
        FakePanel.instances = []
        FakeSPI.fail = False
        self.ui = _load("oreoOS/hostui.py", "oreoOS.hostui")

    def tearDown(self):
        self.saved.restore()

    def _rows(self):
        return [w[1] for w in FakePanel.instances[0].windows]

    def test_first_frame_then_only_changes(self):
        ui = self.ui
        ui.show("Receiving files", "photo.jpg", 0.4)
        p = FakePanel.instances[0]
        self.assertEqual((p.resumed, p.inited, p.lit), (1, 0, 1))   # no reset
        self.assertGreater(len(p.windows), 12)                      # whole frame
        self.assertEqual(p.spi.bytes,
                         sum((w[3] - w[1] + 1) * 640 for w in p.windows) + len(p.windows))
        p.windows.clear()
        ui.show("Receiving files", "photo.jpg", 0.4)
        self.assertEqual(p.windows, [])                             # nothing new
        ui.show("Receiving files", "photo.jpg", 0.41)
        self.assertEqual(self._rows(), [ui.BAR_Y, ui.PCT_Y])        # bar + 41%
        p.windows.clear()
        ui.show("Receiving files", "clip.rv565", 0.41)
        self.assertEqual(self._rows(), [ui.DETAIL_Y])
        p.windows.clear()
        ui.show("Installing", "clip.rv565", None)                   # unknown length
        self.assertEqual(sorted(self._rows()),
                         sorted([ui.TITLE_Y, ui.BAR_Y, ui.PCT_Y]))
        self.assertEqual(len(FakePanel.instances), 1)               # set up once
        self.assertEqual(len(ui._st["buf"]), 320 * ui.STRIP_H * 2)

    def test_regions_stay_on_screen_and_apart(self):
        ui = self.ui
        spans = [(0, ui.HEAD_H), (ui.TITLE_Y, ui.TITLE_Y + ui.STRIP_H),
                 (ui.DETAIL_Y, ui.DETAIL_Y + 12),
                 (ui.BAR_Y, ui.BAR_Y + ui.STRIP_H),
                 (ui.PCT_Y, ui.PCT_Y + 12), (ui.FOOT_Y, ui.FOOT_Y + 12)]
        for (a0, a1), (b0, _b1) in zip(spans, spans[1:]):
            self.assertLessEqual(a1, b0)
        self.assertLessEqual(spans[-1][1], ui.SH)

    def test_never_raises(self):
        ui = self.ui
        FakeSPI.fail = True
        ui.show("Receiving files", "x", 0.5)          # swallowed
        ui.show("Receiving files", "x", "bad")        # swallowed
        FakeSPI.fail = False
        ui.show("Receiving files", "x", 0.5)          # redrawn whole
        self.assertTrue(ui._st["drawn"])
        sys.modules["machine"] = None                 # no hardware at all
        ui._st.clear()
        ui.show("Receiving files")
        ui.clear()

    def test_clear_blanks_and_forgets(self):
        ui = self.ui
        ui.show("Receiving files", "a", 0.1)
        p = FakePanel.instances[0]
        p.windows.clear()
        ui.clear()
        self.assertEqual(self._rows()[0], 0)
        self.assertNotIn("buf", ui._st)
        p.windows.clear()
        ui.show("Receiving files", "a", 0.1)
        self.assertGreater(len(p.windows), 12)        # whole frame again


# ── oreoOS.usbhost ──────────────────────────────────────────────────────────

class FakeRegs:
    """mem32 stand-in: DCFG fixed, DSTS from a list (last one repeats)."""

    def __init__(self, usb, addr, dsts):
        self.u, self.addr, self.dsts = usb, addr, list(dsts)

    def __getitem__(self, a):
        if a == self.u.DCFG:
            return (self.addr << 4) | 0x2           # plus a speed bit
        if a == self.u.DSTS:
            return self.dsts.pop(0) if len(self.dsts) > 1 else self.dsts[0]
        raise AssertionError(hex(a))


def _dsts(frame, suspended=False):
    return (frame << 8) | (1 if suspended else 0) | (1 << 1)


class UsbHostTest(unittest.TestCase):
    def setUp(self):
        self.u = _load("oreoOS/usbhost.py", "usbhost_under_test")
        self.u._sleep_us = lambda us: None

    def test_registers(self):
        self.assertEqual(self.u.DCFG, 0x60080800)
        self.assertEqual(self.u.DSTS, 0x60080808)
        self.assertEqual(self.u.decode(0x7F << 4, _dsts(0x3FFF, True)),
                         (0x7F, True, 0x3FFF))

    def test_connected(self):
        u = self.u
        self.assertTrue(u.connected(FakeRegs(u, 5, [_dsts(10), _dsts(10),
                                                    _dsts(11)])))
        self.assertFalse(u.connected(FakeRegs(u, 0, [_dsts(10), _dsts(11)])))
        self.assertFalse(u.connected(FakeRegs(u, 5, [_dsts(10, True)])))
        self.assertFalse(u.connected(FakeRegs(u, 5, [_dsts(10)])))  # no SOF
        self.assertFalse(u.connected(FakeRegs(u, 5, [_dsts(10),
                                                     _dsts(10, True)])))
        self.assertTrue(u.connected(FakeRegs(u, 5, [-0x7FFFFF00 | _dsts(1),
                                                    _dsts(2)])))

    def test_unknown_off_the_badge(self):
        self.assertIsNone(self.u.connected())        # CPython: no ESP32-S3

        class Broken:
            def __getitem__(self, a):
                raise OSError("bus")
        self.assertIsNone(self.u.connected(Broken()))

    def test_probe_reads_once_a_second(self):
        answers = [True, True, False]
        calls = []

        def check():
            calls.append(1)
            return answers[min(len(calls), len(answers)) - 1]
        p = self.u.Probe(1000, check=check, clock=lambda: 0)
        self.assertTrue(p.poll(0))
        self.assertTrue(p.read and p.changed)
        self.assertTrue(p.poll(500))
        self.assertFalse(p.read)
        self.assertEqual(len(calls), 1)
        self.assertTrue(p.poll(1000))
        self.assertTrue(p.read)
        self.assertFalse(p.changed)
        self.assertFalse(p.poll(2000))
        self.assertTrue(p.changed)
        self.assertEqual(len(calls), 3)


if __name__ == "__main__":
    unittest.main()
