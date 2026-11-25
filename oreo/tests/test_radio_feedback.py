"""Host tests: radio controls answer the press before they block.

Turning Wi-Fi or Bluetooth on or off is a C call (wlan.active(),
ble.active()) that holds MicroPython's interpreter lock, so nothing can
animate while it runs. The notification panel's WiFi/BT tiles and the
WiFi app's Status, Power and connect controls must therefore present a
pending frame *before* the call. The fakes below record what was last
presented at the moment active() is called.

Also: failures are shown in words, a press latched during the call does
not toggle again, the App Store keeps slow file-system reads out of
presses and draw(), and Settings does not write flash on every Sleep
After step.

    python3 -m unittest tests.test_radio_feedback -v
"""

import sys
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tests"))

import test_badge_followups as bf  # noqa: E402
import test_wifi_app as wa  # noqa: E402
import test_wifi_driver as drv  # noqa: E402


class RecDisplay:
    """Collects text drawn since the last present; present() keeps it as
    one frame."""

    def __init__(self):
        self.texts = []
        self.frames = []

    def clear(self, color=0):
        self.texts = []

    def rect(self, *a, **k):
        pass

    def blit(self, *a, **k):
        pass

    def text(self, s, x, y, color=0, scale=1):
        self.texts.append(s)

    def present(self):
        self.frames.append(self.texts)
        self.texts = []

    def last(self):
        return " | ".join(self.frames[-1]) if self.frames else ""

    def screen(self):
        return " | ".join(self.texts)


# ── notification panel ───────────────────────────────────────────────────────

class Radio:
    """A radio whose active(on) records the last presented frame."""

    def __init__(self, display, on=False):
        self.d = display
        self.on = on
        self.calls = []          # (on, frames presented, last frame text)
        self.refuse = False      # active(on) leaves the state unchanged
        self.raises = False

    def active(self, on=None):
        if on is None:
            return self.on
        self.calls.append((on, len(self.d.frames), self.d.last()))
        if self.raises:
            raise OSError("radio error")
        if not self.refuse:
            self.on = bool(on)


class PanelWifi(types.ModuleType):
    def __init__(self, radio):
        super().__init__("oreoWare.wifi")
        self.radio = radio
        self.auto = 0

    def is_connected(self):
        return False

    def is_radio_on(self):
        return self.radio.on

    def radio_on(self):
        try:
            self.radio.active(True)
            return True
        except Exception:
            return False

    def radio_off(self):
        try:
            self.radio.active(False)
        except Exception:
            pass
        return True

    def auto_begin(self):
        self.auto += 1

    def ssid(self):
        return ""


class PanelBT(types.ModuleType):
    def __init__(self, radio):
        super().__init__("oreoWare.bt")
        self.radio = radio

    def is_active(self):
        return self.radio.on

    def is_busy(self):
        return False

    def set_active(self, on):
        try:
            self.radio.active(on)
            return True
        except Exception:
            return False


class PanelRadioTest(unittest.TestCase):
    def setUp(self):
        self.s = bf.Stubs()
        self.net = self.s.add("oreoOS.netsvc", bf.FakeNet())
        self.net.state = ("off", 0)
        self.d = RecDisplay()
        self.wlan = Radio(self.d)
        self.ble = Radio(self.d)
        self.wifi = self.s.add("oreoWare.wifi", PanelWifi(self.wlan))
        self.bt = self.s.add("oreoWare.bt", PanelBT(self.ble))
        self.np = bf._load("oreoOS/notif_panel.py", "oreoOS.notif_panel")
        self.clock = bf.FakeClock()
        self.np.time = self.clock
        self.os = types.SimpleNamespace(display=self.d, _last_brightness=50,
                                        settings_get=lambda k, d=None: d)
        self.p = self.np.NotifPanel(self.os)
        self.p.toggle()
        for _ in range(10):
            self.p.tick(0.05)
        self.api = sys.modules["oreoOS.api"]

    def tearDown(self):
        self.s.close()

    def press_a(self, tile):
        self.p._focus, self.p._quick_sel = "quick", tile
        self.p.handle_button(self.api.BTN_A)

    def frame(self, ms=30):
        """One run-loop frame after the input: tick, draw, present."""
        self.clock.t += ms
        self.p.tick(ms / 1000.0)
        self.p.draw(self.d)
        self.d.present()

    def test_wifi_on_presents_pending_tile_before_the_call(self):
        self.press_a(self.np.Q_WIFI)
        self.assertEqual(len(self.wlan.calls), 1)
        on, n_frames, shown = self.wlan.calls[0]
        self.assertTrue(on)
        self.assertGreaterEqual(n_frames, 1)        # presented before
        self.assertIn("starting", shown)
        self.assertIn("Turning WiFi on...", shown)
        self.assertEqual(self.wifi.auto, 1)         # join still started
        self.frame()
        self.assertNotIn("starting", self.d.last())
        self.assertNotIn("failed", self.d.last())

    def test_bt_off_says_stopping_first(self):
        self.ble.on = True
        self.press_a(self.np.Q_BT)
        on, n_frames, shown = self.ble.calls[0]
        self.assertFalse(on)
        self.assertGreaterEqual(n_frames, 1)
        self.assertIn("stopping", shown)
        self.assertFalse(self.ble.on)

    def test_bt_failure_is_shown_then_clears(self):
        self.ble.raises = True
        self.press_a(self.np.Q_BT)
        self.frame()
        self.assertIn("failed", self.d.last())
        self.assertIn("Bluetooth didn't turn on. A = retry", self.d.last())
        self.clock.t += self.np.NOTE_MS + 1
        self.p._dirty = True
        self.frame()
        self.assertNotIn("failed", self.d.last())
        self.frame(600)                              # repaint after expiry
        self.assertNotIn("didn't", self.d.last())

    def test_radio_that_does_not_change_counts_as_failure(self):
        self.wlan.refuse = True                      # active(True) no-op
        self.press_a(self.np.Q_WIFI)
        self.frame()
        self.assertIn("WiFi didn't turn on", self.d.last())
        self.assertEqual(self.wifi.auto, 0)          # no join on a dead radio

    def test_press_latched_during_the_call_does_not_toggle_again(self):
        self.press_a(self.np.Q_BT)                   # frame N: on
        self.frame()
        self.press_a(self.np.Q_BT)                   # frame N+1: latched
        self.assertEqual(len(self.ble.calls), 1)
        self.assertTrue(self.ble.on)
        self.frame()
        self.press_a(self.np.Q_BT)                   # a real second tap
        self.assertEqual(len(self.ble.calls), 2)
        self.assertFalse(self.ble.on)

    def test_fast_call_presents_once_extra(self):
        # The acknowledged press is the only extra frame: pending, then
        # the run loop's own frame with the real state.
        for tile in (self.np.Q_BT, self.np.Q_WIFI):
            n = len(self.d.frames)
            self.press_a(tile)
            self.assertEqual(len(self.d.frames), n + 1)
            self.frame()
            self.frame()


# ── WiFi app ─────────────────────────────────────────────────────────────────

class RecWifiDisplay(wa.FakeDisplay):
    def __init__(self):
        super().__init__()
        self.frames = []

    def present(self):
        self.frames.append(" | ".join(self.texts))


class WifiAppRadioTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.w, self.drv, self.clock = drv.load_wifi(self.tmp.name, self)
        self.mod, self.api, self._saved = wa.load_app(self.w, self.clock)
        self.os = wa.FakeOS()
        self.os.display = RecWifiDisplay()
        self.app = self.mod.App()
        self.app.on_enter(self.os)
        self.calls = []
        real_active = self.drv.active
        real_connect = self.drv.connect

        def active(on=None):
            if on is not None:
                frames = self.os.display.frames
                self.calls.append(("active", on, frames[-1] if frames else ""))
                if getattr(self, "refuse", False):
                    return None
            return real_active(on)

        def connect(ssid, pw):
            frames = self.os.display.frames
            self.calls.append(("connect", ssid, frames[-1] if frames else ""))
            return real_connect(ssid, pw)

        self.drv.active = active
        self.drv.connect = connect

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

    def press_row(self, row):
        self.app._mode, self.app._sel = "main", row
        self.app.on_button_press(self.api.BTN_A)

    def test_status_on_presents_turning_on_before_the_radio_call(self):
        self.w.add_saved("Home", "pw", priority=1)
        self.drv.plans["Home"] = ["ok"]
        self.press_row(self.app.ROW_STATUS)
        first = [c for c in self.calls if c[0] == "active" and c[1]][0]
        self.assertIn("turning on...", first[2])
        self.frame()
        self.assertIn("ON", self.screen())
        self.assertNotIn("failed", self.screen())

    def test_status_off_presents_turning_off(self):
        self.w.radio_on()
        self.app._snap = self.app._read()
        self.calls.clear()
        self.press_row(self.app.ROW_STATUS)
        off = [c for c in self.calls if c[0] == "active" and not c[1]][0]
        self.assertIn("turning off...", off[2])
        self.assertFalse(self.w.is_radio_on())

    def test_status_failure_is_shown_in_words(self):
        self.refuse = True                     # active(True) does nothing
        self.press_row(self.app.ROW_STATUS)
        self.frame()
        self.assertIn("failed (OFF)", self.screen())
        self.clock.ms += self.mod.NOTE_MS + 1
        self.frame()
        self.assertNotIn("failed", self.screen())

    def test_power_row_presents_then_reports_failure(self):
        self.w.radio_on()
        self.app._snap = self.app._read()
        self.w.set_power_mode = lambda mode: False
        self.press_row(self.app.ROW_POWER)
        self.assertTrue(any("setting " in f for f in self.os.display.frames))
        self.frame()
        self.assertIn("failed (", self.screen())
        self.assertNotIn("wifi_power_mode", self.os.settings)

    def test_status_press_latched_during_the_call_is_dropped(self):
        self.press_row(self.app.ROW_STATUS)          # on
        self.frame()
        on = self.w.is_radio_on()
        self.press_row(self.app.ROW_STATUS)          # latched during call
        self.assertEqual(self.w.is_radio_on(), on)
        self.frame()
        self.press_row(self.app.ROW_STATUS)          # a real tap: off
        self.assertFalse(self.w.is_radio_on())

    def test_connect_overlay_is_up_before_the_join_and_runs_off_frame(self):
        self.drv.plans["Home"] = [None]              # never resolves
        self.app._start_connect("Home", "pw", "main")
        joins = [c for c in self.calls if c[0] == "connect"]
        self.assertEqual(len(joins), 1)
        self.assertIn("Connecting to", joins[0][2])
        self.assertIn("Starting the radio...", joins[0][2])
        # _start_connect returned at once; the join is polled per frame
        # with a status line.
        self.frame(25)
        self.assertEqual(self.app._c_state, "busy")
        self.assertIn("Joining: 2 of", self.screen())
        self.app.on_button_press(self.api.BTN_B)     # B cancels
        self.assertEqual(self.app._c_state, "cancelled")
        self.assertIsNone(self.w.connect_target())

    def test_nearby_says_starting_radio_before_scan_powers_it(self):
        self.assertFalse(self.w.is_radio_on())
        self.press_row(self.app.ROW_NEARBY)
        first = [c for c in self.calls if c[0] == "active" and c[1]][0]
        self.assertIn("starting the radio...", first[2])


# ── App Store: no file-system walks on a press or in draw() ──────────────────

class CountingStore(bf.FakeStore):
    def __init__(self, net):
        super().__init__(net)
        self.listed = 0
        self.sized = []
        self.in_draw = False
        self.sized_in_draw = 0
        self.installed = [{"dir": "snake", "name": "Snake"}]

    def list_installed(self):
        self.listed += 1
        return list(self.installed)

    def installed_size(self, app_id):
        self.sized.append(app_id)
        if self.in_draw:
            self.sized_in_draw += 1
        return 2048

    def is_installed(self, app_id):
        return True

    def installed_manifest(self, app_id):
        return {}

    def installed_version(self, app_id):
        return "1"

    def is_newer(self, a, b):
        return False

    def uninstall(self, app_id):
        self.installed = []
        return True, ""


class StoreFsTest(unittest.TestCase):
    def setUp(self):
        self.s = bf.Stubs()
        self.net = self.s.add("oreoOS.netsvc", bf.FakeNet())
        self.store = self.s.add("oreoOS.store", CountingStore(self.net))
        self.store.fresh = True                  # no refresh in these tests
        self.s.add("oreoOS._http", types.ModuleType("oreoOS._http"))
        pkg = types.ModuleType("storeapp")
        pkg.__path__ = [str(ROOT / "apps/store/src")]
        self.saved_pkg = {k: sys.modules.get(k)
                          for k in ("storeapp", "storeapp.app",
                                    "storeapp.render")}
        sys.modules["storeapp"] = pkg
        self.s.pkg.App = type("App", (), {"on_enter": lambda self, os: None})
        self.m = bf._load("apps/store/src/app.py", "storeapp.app")
        self.m._inflight = None
        self.m._icon_job = None
        self.d = RecDisplay()
        self.os = types.SimpleNamespace(display=None)
        self.app = self.m.App()
        self.app.on_enter(self.os)

    def tearDown(self):
        self.store.gate.set()
        for k, v in self.saved_pkg.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
        self.s.close()

    def draw(self):
        self.store.in_draw = True
        try:
            self.app.draw(self.d)
        finally:
            self.store.in_draw = False

    def test_installed_list_loads_once_in_an_idle_frame(self):
        self.assertEqual(self.store.listed, 0)   # not in on_enter
        for _ in range(4):
            self.app.update(0.016)
        self.assertEqual(self.store.listed, 1)
        B = self.m.api.BTN_B
        for _ in range(4):                       # Discover <-> Installed
            self.app.on_button_press(B)
        self.assertEqual(self.store.listed, 1)   # cached across presses

    def test_b_before_the_idle_load_still_lists(self):
        self.app.on_button_press(self.m.api.BTN_B)
        self.assertEqual(self.store.listed, 1)
        self.assertEqual(len(self.app._installed), 1)

    def test_sizes_are_measured_in_update_not_draw(self):
        self.app.on_button_press(self.m.api.BTN_B)     # Installed page
        self.draw()
        self.assertEqual(self.store.sized_in_draw, 0)
        self.assertIn("...", self.d.screen())          # placeholder
        self.app._frames = 2
        self.app.update(0.016)
        self.assertEqual(self.store.sized, ["snake"])
        self.assertEqual(self.app._paint, "rows")      # only that row
        self.d.texts = []
        self.draw()
        self.assertEqual(self.store.sized_in_draw, 0)
        self.assertIn(self.m.R.fmt_size(2048), self.d.screen())
        self.assertNotIn("...", self.d.screen())
        self.app.update(0.016)
        self.assertEqual(self.store.sized, ["snake"])  # measured once

    def test_uninstall_reloads_the_list_on_back(self):
        self.app.on_button_press(self.m.api.BTN_B)
        self.assertEqual(self.store.listed, 1)
        self.app._open_detail(self.app._installed_entry(0))
        self.app._back()
        self.assertEqual(self.store.listed, 1)          # nothing changed
        self.app._open_detail(self.app._installed_entry(0))
        self.app._view, self.app._confirm_sel = "confirm", 1
        self.app.on_button_press(self.m.api.BTN_A)      # uninstall
        self.app._back()
        self.assertEqual(self.store.listed, 2)
        self.assertEqual(self.app._installed, [])


# ── Settings: Sleep After writes flash once it rests ─────────────────────────

class FakePower(types.ModuleType):
    def __init__(self):
        super().__init__("oreoOS.power")
        self.SETTINGS = {"idle_enable": True, "idle_seconds": 120}
        self.saves = 0

    def load_settings(self, os_obj):
        pass

    def save_settings(self, os_obj):
        self.saves += 1


class SettingsSaveTest(unittest.TestCase):
    def setUp(self):
        self.s = bf.Stubs()
        self.s.add("oreoOS.netsvc", bf.FakeNet())
        self.s.add("oreoWare.wifi", bf.FakeWifi())
        self.pm = self.s.add("oreoOS.power", FakePower())
        self.m = bf._load("apps/settings/src/app.py", "under_test")
        self.clock = bf.FakeClock()
        self.saved_time = sys.modules["time"]
        sys.modules["time"] = types.SimpleNamespace(
            ticks_ms=lambda: self.clock.t,
            ticks_diff=lambda a, b: a - b)
        self.os = types.SimpleNamespace(
            display=None, _last_brightness=100,
            settings_get=lambda k, d=None: d, settings_set=lambda k, v: None)
        self.app = self.m.App()
        self.app.on_enter(self.os)
        self.app._sel = [r.label for r in self.app._rows].index("Sleep After")

    def tearDown(self):
        sys.modules["time"] = self.saved_time
        sys.modules.pop("oreoOS.power", None)
        self.s.close()

    def test_steps_change_the_timer_at_once_and_save_once(self):
        R = self.m.api.BTN_RIGHT
        for _ in range(5):
            self.clock.t += 120
            self.app.on_button_press(R)
            self.app.update(0.016)
        self.assertEqual(self.pm.SETTINGS["idle_seconds"], 7 * 60)
        self.assertEqual(self.pm.saves, 0)
        self.clock.t += self.m.SAVE_MS
        self.app.update(0.016)
        self.assertEqual(self.pm.saves, 1)
        self.app.update(0.016)
        self.assertEqual(self.pm.saves, 1)

    def test_exit_flushes_an_unsaved_change(self):
        self.app.on_button_press(self.m.api.BTN_LEFT)
        self.assertEqual(self.pm.saves, 0)
        self.app.on_exit()
        self.assertEqual(self.pm.saves, 1)
        self.app.on_exit()
        self.assertEqual(self.pm.saves, 1)


if __name__ == "__main__":
    unittest.main()
