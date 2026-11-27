"""Host tests for the WiFi app (apps/wifi) on top of the real oreoWare/wifi.py.

The app runs against stub oreoOS modules and a fake display; the WiFi
module underneath is the real one, driven by the 1.28 driver model from
tests/test_wifi_driver.py. Covers: Nearby scan -> join a saved network,
the wrong-password screen with the driver's reason code, the scan error
note, and drawing every page without a crash.

    python3 -m unittest tests.test_wifi_app -v
"""

import importlib.util
import sys
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tests"))

import test_wifi_driver as drv  # noqa: E402


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeDisplay:
    def __init__(self):
        self.texts = []

    def clear(self, color):
        self.texts = []

    def rect(self, *a, **k):
        pass

    def text(self, s, x, y, color, scale=1):
        self.texts.append(s)

    def present(self):
        pass


class FakeOS:
    def __init__(self):
        self.display = FakeDisplay()
        self.settings = {}
        self.quit_called = False

    def settings_get(self, k, default=None):
        return self.settings.get(k, default)

    def settings_set(self, k, v):
        self.settings[k] = v

    def quit(self):
        self.quit_called = True


def load_app(wifi_mod, clock):
    api = types.ModuleType("oreoOS.api")
    api.SCREEN_W, api.SCREEN_H = 320, 240
    names = ("BTN_A", "BTN_B", "BTN_C", "BTN_UP", "BTN_DOWN", "BTN_LEFT",
             "BTN_RIGHT", "BTN_HOME")
    for i, n in enumerate(names):
        setattr(api, n, i + 1)
    api.BUTTONS = tuple(range(1, len(names) + 1))
    api.rgb = lambda r, g, b: (r, g, b)
    theme = types.ModuleType("oreoOS.theme")
    theme.__getattr__ = lambda name: name
    widgets = types.ModuleType("oreoOS.widgets")
    widgets.HEADER_H, widgets.HINT_H = 28, 16
    widgets.draw_header = widgets.draw_hint = lambda *a: None

    class App:
        def on_enter(self, os_):
            pass

    package = types.ModuleType("oreoOS")
    package.App = App
    package.api, package.theme, package.widgets = api, theme, widgets
    ware = types.ModuleType("oreoWare")
    ware.wifi = wifi_mod
    keys = ("oreoOS", "oreoWare", "oreoWare.wifi")
    saved = {k: sys.modules.get(k) for k in keys}
    sys.modules["oreoOS"] = package
    sys.modules["oreoWare"] = ware
    sys.modules["oreoWare.wifi"] = wifi_mod
    # Restored in tearDown: the app imports oreoWare.wifi lazily.
    app_mod = _load("apps/wifi/src/app.py", "wifi_app_under_test")
    app_mod.time = clock
    return app_mod, api, saved


class WifiAppTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.w, self.d, self.clock = drv.load_wifi(self.tmp.name, self)
        self.mod, self.api, self._saved = load_app(self.w, self.clock)
        self.os = FakeOS()
        self.app = self.mod.App()
        self.app.on_enter(self.os)

    def tearDown(self):
        for k, v in self._saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
        self.tmp.cleanup()

    def frame(self, n=1):
        for _ in range(n):
            self.clock.ms += 100
            self.app.update(0.1)
            self.app._dirty = True
            self.app.draw(self.os.display)

    def screen(self):
        return " | ".join(self.os.display.texts)

    def open_nearby(self):
        self.app._sel = self.app.ROW_NEARBY
        self.app.on_button_press(self.api.BTN_A)
        self.frame()

    def test_scan_then_join_saved_network(self):
        self.w.add_saved("Home", "pw", priority=1)
        self.d.scan_result = [drv.ap("Home", -50), drv.ap("Cafe", -40, auth=0)]
        self.d.plans["Home"] = ["ok"]
        self.open_nearby()
        self.assertIn("Cafe", self.screen())
        self.assertIn("Home", self.screen())
        self.app._near_sel = [n["ssid"] for n in self.app._near].index("Home")
        self.app.on_button_press(self.api.BTN_A)
        self.assertEqual(self.app._mode, "connect")
        self.frame(40)
        self.assertEqual(self.app._c_state, "ok")
        self.assertTrue(self.w.is_connected())

    def test_wrong_password_shows_reason_code(self):
        self.w.add_saved("Home", "wrong", priority=1)
        self.d.scan_result = [drv.ap("Home", -50)]
        self.d.plans["Home"] = [15, 15, 15]
        self.open_nearby()
        self.app._near_sel = 0
        self.app.on_button_press(self.api.BTN_A)
        for _ in range(100):
            self.frame()
            if self.app._c_state != "busy":
                break
        self.assertEqual(self.app._c_state, "bad_password")
        self.assertIn("Wrong password", self.screen())
        self.assertIn("code 15:4WAY_HANDSHAKE_TIMEOUT", self.screen())

    def test_timeout_does_not_show_neutral_code(self):
        self.w.add_saved("Slow", "pw", priority=1)
        self.d.scan_result = [drv.ap("Slow", -50)]
        self.d.plans["Slow"] = [None]           # attempt never resolves
        self.open_nearby()
        self.app._near_sel = 0
        self.app.on_button_press(self.api.BTN_A)
        for _ in range(400):
            self.frame()
            if self.app._c_state != "busy":
                break
        self.assertEqual(self.app._c_state, "timeout")
        self.assertEqual(self.app._c_code, "")
        self.assertNotIn("code ", self.screen())

    def test_failed_begin_does_not_show_previous_code(self):
        self.w._conn_last_code = 15             # left by an earlier join
        self.d.connect_raises = 2               # this join is refused
        self.app._start_connect("Home", "pw", "main")
        self.assertEqual(self.app._c_state, "failed")
        self.assertEqual(self.app._c_code, "")

    def test_home_mid_join_is_finished_by_auto_tick(self):
        self.d.plans["Home"] = ["ok"]
        seq = self.w.link_seq()
        self.app._start_connect("Home", "pw", "main")
        self.assertEqual(self.w.connect_target(), "Home")
        # HOME: the launcher leaves the app; only the run loop ticks now.
        for _ in range(40):
            self.clock.ms += 100
            self.w.auto_tick()
        self.assertIsNone(self.w.connect_target())
        self.assertEqual(self.w.link_seq(), seq + 1)
        self.assertEqual(self.d.conf, 0)        # retry forever again

    def test_scan_error_note_names_the_cause(self):
        self.d.plans["Home"] = [None]
        self.w.connect_begin("Home", "pw")      # join holds the radio
        self.app._mode = "nearby"
        self.w.scan_start()
        self.frame()
        self.assertIn("radio busy joining - C to retry", self.screen())

    def test_every_page_draws(self):
        self.d.scan_result = [drv.ap("Cafe", -40, auth=0)]
        for mode in ("main", "nearby", "saved", "connect", "pwhelp"):
            self.app._mode = mode
            self.app._c_state = "busy" if mode == "connect" else ""
            self.app._dirty = True
            self.app.draw(self.os.display)
            self.assertTrue(self.os.display.texts, mode)


if __name__ == "__main__":
    unittest.main()
