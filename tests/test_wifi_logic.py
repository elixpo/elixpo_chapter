"""Host tests for the non-blocking WiFi logic in oreoWare/wifi.py.

The driver is loaded with a fake `network` module and a fake clock, so the
scan parser, candidate picker, status classifier and the connect / boot
auto-connect state machines run without a badge.

    python3 -m unittest tests.test_wifi_logic -v
"""

import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class FakeClock:
    def __init__(self):
        self.ms = 1000

    def ticks_ms(self):
        return self.ms

    def ticks_diff(self, a, b):
        return a - b

    def ticks_add(self, a, b):
        return a + b

    def sleep_ms(self, n):
        self.ms += n


class FakeWLAN:
    def __init__(self):
        self._active = False
        self.connected = False
        self.status_code = 1001          # STAT_CONNECTING
        self.connect_calls = []
        self.scan_result = []
        self.scans = 0

    def active(self, on=None):
        if on is None:
            return self._active
        self._active = bool(on)

    def disconnect(self):
        self.connected = False

    def connect(self, ssid, pw):
        self.connect_calls.append(ssid)

    def isconnected(self):
        return self.connected

    def status(self, *a):
        return self.status_code

    def config(self, *a, **k):
        if a == ("essid",):
            return self.connect_calls[-1] if self.connect_calls else ""
        return None

    def scan(self):
        self.scans += 1
        return list(self.scan_result)


def load_wifi(tmp, case):
    # The stubs below go into sys.modules for the test only: a leftover
    # `_thread = None` breaks later tests that start threads.
    saved = {k: sys.modules.get(k) for k in ("network", "_thread")}

    def restore():
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v

    case.addCleanup(restore)
    net = types.ModuleType("network")
    net.STA_IF = 0
    wlan = FakeWLAN()
    net.WLAN = lambda _if: wlan
    net.hostname = lambda *_: None
    sys.modules["network"] = net
    spec = importlib.util.spec_from_file_location(
        "oreo_wifi_under_test", ROOT / "oreoWare/wifi.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    clock = FakeClock()
    mod.time = clock
    mod._SAVED_PATH = str(Path(tmp, "wifi.json"))
    mod._SEEN_PATH = str(Path(tmp, "wifi_seen.json"))
    # The real build scans in a thread; force the synchronous fallback so
    # the test is deterministic.
    sys.modules["_thread"] = None
    mod._secrets_networks = lambda: []
    return mod, wlan, clock


def ap(ssid, rssi, auth=3, ch=6):
    return (ssid.encode(), b"\x00" * 6, ch, rssi, auth, False)


class ParseScanTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.w, _, _ = load_wifi(self.tmp.name, self)

    def tearDown(self):
        self.tmp.cleanup()

    def test_dedupes_sorts_and_drops_hidden(self):
        raw = [ap("Home", -70), ap("Cafe", -40, auth=0), ap("Home", -55),
               (b"", b"", 1, -30, 3, True), (b"\xff\xfeX", b"", 1, -90, 3, False)]
        out = self.w.parse_scan(raw)
        self.assertEqual([n["ssid"] for n in out], ["Cafe", "Home", "??X"])
        self.assertEqual(out[1]["rssi"], -55)
        self.assertFalse(out[0]["secure"])
        self.assertTrue(out[1]["secure"])

    def test_limit(self):
        raw = [ap("n%d" % i, -40 - i) for i in range(30)]
        self.assertEqual(len(self.w.parse_scan(raw, limit=5)), 5)

    def test_signal_level(self):
        lv = self.w.signal_level
        self.assertEqual([lv(-45), lv(-60), lv(-70), lv(-80), lv(-95), lv(None)],
                         [4, 3, 2, 1, 0, 0])

    def test_classify_status(self):
        c = self.w.classify_status
        self.assertEqual(c(202), self.w.CONN_BAD_PW)
        self.assertEqual(c(201), self.w.CONN_NO_AP)
        self.assertIsNone(c(1001))
        self.assertIsNone(c("x"))

    def test_pick_candidates(self):
        saved = [{"ssid": "A", "priority": 2}, {"ssid": "B", "priority": 1},
                 {"ssid": "C", "priority": 2}, {"ssid": "Gone", "priority": 0}]
        vis = [{"ssid": "A", "rssi": -80}, {"ssid": "B", "rssi": -60},
               {"ssid": "C", "rssi": -50}]
        got = [n["ssid"] for n in self.w.pick_candidates(saved, vis)]
        self.assertEqual(got, ["B", "C", "A"])
        got = [n["ssid"] for n in self.w.pick_candidates(saved, vis, ["B"])]
        self.assertEqual(got, ["C", "A"])
        got = [n["ssid"] for n in self.w.pick_candidates(saved, None)]
        self.assertEqual(got, ["Gone", "B", "A", "C"])


class ConnectStateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.w, self.wlan, self.clock = load_wifi(self.tmp.name, self)

    def tearDown(self):
        self.tmp.cleanup()

    def test_success_marks_last(self):
        w = self.w
        w.add_saved("Home", "pw", priority=1)
        w.add_saved("Work", "pw2", priority=2)
        self.assertTrue(w.connect_begin("Work", "pw2"))
        self.assertEqual(w.connect_poll(), w.CONN_BUSY)
        self.wlan.connected = True
        self.assertEqual(w.connect_poll(), w.CONN_OK)
        self.assertEqual(w.last_connected()["ssid"], "Work")
        # Updating the entry keeps the marker.
        w.add_saved("Work", "newpw", priority=1)
        self.assertEqual(w.last_connected()["ssid"], "Work")

    def test_wrong_password_needs_to_persist(self):
        w = self.w
        w.connect_begin("Home", "bad")
        self.wlan.status_code = 202
        self.assertEqual(w.connect_poll(), w.CONN_BUSY)
        self.clock.ms += 1000
        self.assertEqual(w.connect_poll(), w.CONN_BUSY)
        self.clock.ms += 2000
        self.assertEqual(w.connect_poll(), w.CONN_BAD_PW)
        self.assertIsNone(w.connect_target())

    def test_stale_failure_from_previous_attempt_is_ignored(self):
        # The ESP32 port keeps the last disconnect reason until the next
        # disconnect event or GOT_IP, so a healthy retry still reads 202.
        w = self.w
        self.wlan.status_code = 202
        w.connect_begin("Home", "right")
        for _ in range(5):
            self.clock.ms += 1000
            self.assertEqual(w.connect_poll(), w.CONN_BUSY)
        self.wlan.connected = True
        self.assertEqual(w.connect_poll(), w.CONN_OK)

    def test_stale_failure_reported_at_timeout(self):
        w = self.w
        self.wlan.status_code = 202
        w.connect_begin("Home", "still-wrong", timeout_ms=5000)
        self.clock.ms += 5001
        self.assertEqual(w.connect_poll(), w.CONN_BAD_PW)

    def test_new_failure_after_stale_code_changes(self):
        w = self.w
        self.wlan.status_code = 201
        w.connect_begin("Home", "bad")
        self.assertEqual(w.connect_poll(), w.CONN_BUSY)
        self.wlan.status_code = 202
        self.assertEqual(w.connect_poll(), w.CONN_BUSY)
        self.clock.ms += 3000
        self.assertEqual(w.connect_poll(), w.CONN_BAD_PW)

    def test_timeout(self):
        w = self.w
        w.connect_begin("Home", "pw", timeout_ms=5000)
        self.clock.ms += 5001
        self.assertEqual(w.connect_poll(), w.CONN_TIMEOUT)


class AutoConnectTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.w, self.wlan, self.clock = load_wifi(self.tmp.name, self)

    def tearDown(self):
        self.tmp.cleanup()

    def tick(self, n=1):
        res = False
        for _ in range(n):
            self.clock.ms += 200
            res = self.w.auto_tick() or res
        return res

    def test_fast_path_skips_scan(self):
        w = self.w
        w.add_saved("Home", "pw", priority=1)
        w._mark_last("Home")
        w.auto_begin()
        self.assertEqual(w.auto_state(), w.AUTO_TRY)
        self.assertEqual(self.wlan.scans, 0)
        self.wlan.connected = True
        self.assertTrue(self.tick())
        self.assertEqual(w.auto_state(), w.AUTO_DONE)
        self.assertFalse(self.tick(3))      # True only once

    def test_scan_then_connect_best_visible(self):
        w = self.w
        w.add_saved("Far", "a", priority=1)
        w.add_saved("Near", "b", priority=2)
        self.wlan.scan_result = [ap("Near", -50), ap("Stranger", -40, auth=0)]
        w.auto_begin()
        self.tick()
        self.assertEqual(self.wlan.connect_calls, ["Near"])
        self.wlan.connected = True
        self.assertTrue(self.tick())
        # Unknown nearby network remembered for Settings, on flash too.
        seen = json.loads(Path(w._SEEN_PATH).read_text())
        self.assertIn("Stranger", [s["ssid"] for s in seen])

    def test_failed_last_falls_back_to_scan(self):
        w = self.w
        w.add_saved("Old", "a", priority=1)
        w.add_saved("Here", "b", priority=5)
        w._mark_last("Old")
        self.wlan.scan_result = [ap("Here", -60), ap("Old", -90)]
        w.auto_begin()
        self.wlan.status_code = 201          # NO_AP_FOUND
        self.tick(20)
        self.assertEqual(self.wlan.connect_calls, ["Old", "Here"])
        self.wlan.status_code = 1001
        self.wlan.connected = True
        self.assertTrue(self.tick())

    def test_radio_off_stops_auto_connect(self):
        w = self.w
        w.add_saved("Home", "pw", priority=1)
        w._mark_last("Home")
        w.auto_begin()
        self.assertEqual(w.auto_state(), w.AUTO_TRY)
        w.radio_off()
        self.assertIsNone(w.connect_target())
        self.tick(100)
        self.assertFalse(self.wlan.active())
        self.assertEqual(self.wlan.connect_calls, ["Home"])
        self.assertEqual(self.wlan.scans, 0)

    def test_no_saved_networks_scans_and_powers_down(self):
        w = self.w
        self.wlan.scan_result = [ap("Cafe", -50, auth=0)]
        w.auto_begin()
        self.tick()
        self.assertEqual(w.auto_state(), w.AUTO_FAIL)
        self.assertEqual([n["ssid"] for n in w.nearby()], ["Cafe"])
        self.assertFalse(self.wlan.active())


if __name__ == "__main__":
    unittest.main()
