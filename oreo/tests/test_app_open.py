"""Host tests for opening an app: the press is acknowledged on its own
frame ("Opening <name>" chip), the LOADING panel (oreoOS.opening) covers
a slow import and on_enter but never flashes on a quick open, HOME on the
panel cancels, and a failing import shows the crash screen.

Uses the launcher harness from test_c_key_rule (stub oreoOS package, fake
clock and buttons) and busy's real animator thread on a fake panel.
"""

import sys
import threading
import time
import types
import unittest

import test_c_key_rule as ck
from test_busy_hostui_usb import PanelDisplay, _Saved, _fake_framebuf, _load


def _wait(pred, timeout=2.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if pred():
            return True
        time.sleep(0.005)
    return pred()


class RecDisplay(PanelDisplay):
    """PanelDisplay that also records the order of draws and flushes."""

    def __init__(self):
        PanelDisplay.__init__(self)
        self.log = []

    def rect(self, *a, **k):
        self.log.append(("rect",) + a[:4])
        PanelDisplay.rect(self, *a, **k)

    def text(self, *a, **k):
        self.log.append(("text", a[0]))
        PanelDisplay.text(self, *a, **k)

    def clear(self, *a):
        self.log.append(("clear",))
        self._dirty = True

    def present(self):
        self.log.append(("present",))
        PanelDisplay.present(self)

    def present_rect(self, x, y, w, h):
        self.log.append(("present_rect", x, y, w, h))
        PanelDisplay.present_rect(self, x, y, w, h)

    def texts(self):
        return [e[1] for e in self.log if e[0] == "text"]


class _Base(unittest.TestCase):
    def setUp(self):
        self.h = ck.GamepadDoubleTapTest(
            "test_first_c_reaches_gamepad_second_opens_panel")
        self.h.setUp()
        self.launcher = self.h.launcher
        self.saved = _Saved(("framebuf", "oreoOS.busy", "oreoOS.opening"))
        sys.modules["framebuf"] = _fake_framebuf()
        self.busy = _load("oreoOS/busy.py", "oreoOS.busy")
        self.busy.SPIN_MS = 5
        self.op = _load("oreoOS/opening.py", "oreoOS.opening")
        self.api = sys.modules["oreoOS.api"]

    def tearDown(self):
        self.busy.stop(restore=False)
        self.h.tearDown()
        self.saved.restore()

    def os_obj(self, display, script=()):
        o = types.SimpleNamespace(
            display=display, _quit_requested=False, _launch_request=None,
            _home_marked=True, _power=None, _just_woke=False)
        o.quit = lambda: setattr(o, "_quit_requested", True)

        def launch(n):
            o._launch_request = n
            o._quit_requested = True
        o.launch = launch
        o.buttons = ck._Buttons(list(script), o, self.h.clock)
        return o


class PressAckTest(_Base):
    def test_press_draws_chip_on_the_same_frame(self):
        A = self.api.BTN_A
        self.launcher._INFO["store"] = ("Store", None)
        d = RecDisplay()

        class Drawer:
            name = "Apps"

            def on_enter(self, os_obj):
                self.os = os_obj

            def on_button_press(self, b):
                if b == A:
                    self.os.launch("store")

            def on_button_release(self, b):
                pass

            def update(self, dt):
                pass

            def draw(self, dd):
                dd.text("grid", 0, 0)

            def on_exit(self):
                pass

        o = self.os_obj(d, [[A]])
        self.launcher.run_app(o, Drawer())
        self.assertEqual(o._launch_request, "store")
        texts = d.texts()
        self.assertEqual(texts, ["grid", "Opening Store"])   # one frame
        chip = d.log.index(("text", "Opening Store"))
        # ...and that frame, chip included, is flushed in full.
        self.assertIn(("present",), d.log[chip:])
        self.assertTrue(any(e[0] == "present" for e in d.calls))

    def test_quit_draws_no_chip(self):
        d = RecDisplay()

        class Quitter:
            name = "x"

            def on_enter(self, os_obj):
                self.os = os_obj

            def update(self, dt):
                self.os.quit()

            def draw(self, dd):
                pass

            def on_exit(self):
                pass

        self.launcher.run_app(self.os_obj(d, [[]]), Quitter())
        self.assertNotIn("Opening", " ".join(d.texts()))


class _FakeApp:
    name = "Slow"

    def __init__(self, enter_s=0.0, log=None):
        self.enter_s = enter_s
        self.log = log if log is not None else []

    def on_enter(self, os_obj):
        self.log.append("enter")
        if self.enter_s:
            time.sleep(self.enter_s)

    def update(self, dt):
        pass

    def draw(self, d):
        self.log.append("draw")
        d.clear()

    def on_exit(self):
        pass


class OpenAppTest(_Base):
    def setUp(self):
        _Base.setUp(self)
        self.launcher._INFO["slow"] = ("Slow", "someone")
        self.crashes = []
        self.launcher.show_crash = \
            lambda o, name, e, info=None: self.crashes.append((name, e))
        self.launcher.release_app = lambda target, app=None: 0

    def _open(self, d, load, script=([],)):
        self.launcher.load_app = load
        o = self.os_obj(d, script)
        ok = self.launcher.open_app(o, "slow")
        return o, ok

    def test_slow_import_shows_panel_before_import_returns(self):
        d = RecDisplay()
        seen = {}

        def load(target):
            # The panel is pushed by the animator while "compiling".
            seen["panel"] = _wait(lambda: any(
                p[1:3] == (0, 0) and p[3] == self.api.SCREEN_W
                for p in d.pushes()))
            return _FakeApp()

        o, ok = self._open(d, load)
        self.assertTrue(ok)
        self.assertTrue(seen["panel"])
        self.assertFalse(self.busy.active())          # stopped by frame 1
        self.assertFalse(d.overlap)

    def test_quick_open_never_flashes_the_panel(self):
        d = RecDisplay()
        o, ok = self._open(d, lambda t: _FakeApp())
        self.assertTrue(ok)
        self.assertEqual(d.pushes(), [])
        self.assertNotIn("LOADING", d.texts())
        self.assertFalse(self.busy.active())

    def test_slow_on_enter_is_covered_too(self):
        d = RecDisplay()
        log = []
        o, ok = self._open(d, lambda t: _FakeApp(enter_s=0.4, log=log))
        self.assertTrue(ok)
        self.assertTrue(len(d.pushes()) >= 10)        # wipe + spinner
        self.assertEqual(log[:2], ["enter", "draw"])
        self.assertFalse(self.busy.active())

    def test_failed_import_shows_crash_and_stops_loader(self):
        d = RecDisplay()

        def load(target):
            time.sleep(0.25)
            raise ImportError("no module named 'apps.slow.src.bits'")

        o, ok = self._open(d, load)
        self.assertFalse(ok)
        self.assertEqual(len(self.crashes), 1)
        self.assertIsInstance(self.crashes[0][1], ImportError)
        self.assertFalse(self.busy.active())

    def test_failed_on_enter_shows_crash(self):
        d = RecDisplay()

        class Bad(_FakeApp):
            def on_enter(self, os_obj):
                raise ValueError("boom")

        o, ok = self._open(d, lambda t: Bad())
        self.assertFalse(ok)
        self.assertEqual(str(self.crashes[0][1]), "boom")
        self.assertFalse(self.busy.active())

    def test_known_slow_app_gets_the_panel_before_import(self):
        self.op.note("slow", 900)
        d = RecDisplay()
        seen = {}

        def load(target):
            seen["log"] = list(d.log)
            return _FakeApp()

        self._open(d, load)
        self.assertIn(("text", "LOADING"), seen["log"])
        self.assertIn(("present",), seen["log"])
        self.assertIn(("text", "By @someone"), seen["log"])

    def test_open_time_is_remembered(self):
        d = RecDisplay()

        def load(target):
            self.h.clock.t += 700           # the launcher's clock
            return _FakeApp()

        self._open(d, load)
        self.assertTrue(self.op.known_slow("slow"))

    def test_home_on_the_panel_cancels_before_on_enter(self):
        self.op.note("slow", 900)           # panel shown at once
        d = RecDisplay()
        log = []
        HOME = self.api.BTN_HOME
        o, ok = self._open(d, lambda t: _FakeApp(log=log), script=([HOME],))
        self.assertTrue(ok)
        self.assertEqual(log, [])
        self.assertEqual(o._launch_request, "__appmenu__")
        self.assertFalse(self.busy.active())


class PanelPaintTest(_Base):
    def test_bands_cover_the_screen_and_fit(self):
        op, api = self.op, self.api
        for text, x, y, scale in op.panel_lines("A Long App Name Here",
                                                 "x" * 40):
            self.assertGreaterEqual(x, 0, text)
            self.assertLessEqual(x + len(text) * 8 * scale, api.SCREEN_W, text)
        self.assertLessEqual(op.SPIN_Y + self.busy.SPIN, api.SCREEN_H - 24)
        x, y, w, h, text = op.chip_rect("Q" * 80)
        self.assertGreaterEqual(x, 0)
        self.assertLessEqual(x + w, api.SCREEN_W)
        self.assertLessEqual(y + h, api.SCREEN_H)

    def test_wipe_pushes_every_band_then_spins(self):
        d = PanelDisplay()
        ld = self.op.Loader(d, "Store", delay_ms=0).start()
        try:
            self.assertTrue(_wait(lambda: len(d.pushes()) >= 13))
        finally:
            ld.stop(restore=False)
        pushes = d.pushes()
        bands = [p for p in pushes if p[3] == self.api.SCREEN_W]
        self.assertEqual(sorted(p[2] for p in bands),
                         list(range(0, self.api.SCREEN_H, self.op.BAND)))
        spins = [p for p in pushes if p[3] == self.busy.SPIN]
        self.assertTrue(spins)
        self.assertTrue(all(p[2] == self.op.SPIN_Y for p in spins))

    def test_without_threads_panel_is_drawn_inline(self):
        d = RecDisplay()
        ld = self.op.Loader(d, "Store", delay_ms=0)
        ld._use_thread = False
        ld.start()
        self.assertIn("LOADING", d.texts())
        self.assertIn(("present",), d.log)
        ld.stop(restore=False)


if __name__ == "__main__":
    unittest.main()
