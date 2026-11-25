"""Host tests for oreoWare/wifi.py against a model of the real driver.

`DriverWLAN` reproduces the parts of MicroPython 1.28's
ports/esp32/network_wlan.c that the scan / join state machines depend on:

  * status() precedence: GOT_IP, then NO_AP_FOUND* and AUTH_FAIL (reported
    even while the driver is still retrying, and kept until GOT_IP or the
    next disconnect event), ASSOC_LEAVE -> STAT_IDLE, then STAT_CONNECTING
    while retries remain, then the raw disconnect reason;
  * config(reconnects=n): n retries after the first attempt, -1 = forever
    (the default);
  * scan() returns [] (it does not raise) when IDF refuses to scan because
    the STA is connecting.

    python3 -m unittest tests.test_wifi_driver -v
"""

import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

STAT_IDLE, STAT_CONNECTING, STAT_GOT_IP = 1000, 1001, 1010
NO_AP_CODES = (201, 210, 211, 212)


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


class DriverWLAN:
    """Event-accurate model of the 1.28 ESP32 STA driver."""

    def __init__(self, clock):
        self.clock = clock
        self._active = False
        self.requested = False
        self.connected = False
        self.reason = 0
        self.conf = 0                 # 0 = retry forever
        self.retries = 0
        self.attempt_end = None       # ms when the attempt in flight ends
        self.attempt_ms = 2000
        self.plans = {}               # ssid -> list of outcomes per attempt
        self.plan = []
        self.ssid = None
        self.connect_log = []         # (ssid, password) pairs
        self.scan_result = []
        self.scans = 0
        self.connect_raises = 0
        self.reconnects_supported = True

    # -- event engine ------------------------------------------------------
    def _start_attempt(self):
        self.attempt_end = self.clock.ms + self.attempt_ms

    def _run(self):
        while self.attempt_end is not None and self.clock.ms >= self.attempt_end:
            outcome = self.plan.pop(0) if self.plan else None
            if outcome is None:              # this attempt never resolves
                self.attempt_end = None
                return
            if outcome == "ok":
                self.attempt_end = None
                self.connected = True
                self.reason = 0
                return
            # STA_DISCONNECTED event handler
            self.reason = outcome
            self.connected = False
            self.attempt_end = None
            if self.requested:
                if self.conf:
                    self.retries += 1
                    if self.retries >= self.conf:
                        return
                self._start_attempt()

    # -- network.WLAN API --------------------------------------------------
    def active(self, on=None):
        if on is None:
            return self._active
        self._active = bool(on)
        if not on:
            self.connected = False
            self.attempt_end = None
        else:
            self.retries = 0

    def connect(self, ssid, pw):
        self._run()
        if self.connect_raises:
            self.connect_raises -= 1
            raise OSError("Wifi Internal State Error")
        self.connect_log.append((ssid, pw))
        self.ssid = ssid
        self.plan = list(self.plans.get(ssid, [None]))
        self.retries = 0
        self.requested = True
        self._start_attempt()

    def disconnect(self):
        self._run()
        self.requested = False
        if self.attempt_end is not None or self.connected:
            self.reason = 8               # ASSOC_LEAVE event
        self.attempt_end = None
        self.connected = False

    def isconnected(self):
        self._run()
        return self.connected

    def status(self, *a):
        self._run()
        if a:
            return -55
        r = self.reason
        if self.connected:
            return STAT_GOT_IP
        if r in NO_AP_CODES:
            return r
        if r in (202, 205):
            return 202
        if r == 8:
            return STAT_IDLE
        if self.requested and (self.conf == 0 or self.retries < self.conf):
            return STAT_CONNECTING
        if r == 0:
            return STAT_IDLE
        return r

    def config(self, *a, **k):
        if "reconnects" in k:
            if not self.reconnects_supported:
                raise ValueError("unknown config param")
            n = k["reconnects"]
            self.conf = 0 if n == -1 else n + 1
            return None
        if a == ("reconnects",):
            return self.conf - 1
        if a == ("essid",):
            return self.ssid or ""
        return None

    def ifconfig(self):
        return ("192.168.1.50", "255.255.255.0", "192.168.1.1", "1.1.1.1")

    def scan(self):
        self._run()
        self.scans += 1
        if self.attempt_end is not None:
            return []          # ESP_ERR_WIFI_STATE swallowed by 1.28
        return list(self.scan_result)


class CapturedThreads:
    """A fake _thread that records workers instead of running them."""

    def __init__(self):
        self.pending = []
        self.mod = types.ModuleType("_thread")
        self.mod.start_new_thread = lambda fn, args: self.pending.append(
            (fn, args))

    def run_all(self):
        while self.pending:
            fn, args = self.pending.pop(0)
            fn(*args)


def load_wifi(tmp, case, threads=None):
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
    clock = FakeClock()
    wlan = DriverWLAN(clock)
    net = types.ModuleType("network")
    net.STA_IF = 0
    net.WLAN = lambda _if: wlan
    net.hostname = lambda *_: None
    sys.modules["network"] = net
    sys.modules["_thread"] = threads.mod if threads else None
    spec = importlib.util.spec_from_file_location(
        "oreo_wifi_driver_under_test", ROOT / "oreoWare/wifi.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.time = clock
    mod._SAVED_PATH = str(Path(tmp, "wifi.json"))
    mod._SEEN_PATH = str(Path(tmp, "wifi_seen.json"))
    mod._secrets_networks = lambda: []
    mod.print = lambda *a, **k: None
    return mod, wlan, clock


def ap(ssid, rssi, auth=3, ch=6):
    return (ssid.encode(), b"\x00" * 6, ch, rssi, auth, False)


class Base(unittest.TestCase):
    threads = None

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.w, self.wlan, self.clock = load_wifi(
            self.tmp.name, self, self.threads)

    def tearDown(self):
        self.tmp.cleanup()

    def poll_until_done(self, step=100, limit=60000):
        w = self.w
        end = self.clock.ms + limit
        while self.clock.ms < end:
            r = w.connect_poll()
            if r != w.CONN_BUSY:
                return r
            self.clock.ms += step
        return None


class JoinTest(Base):
    def test_success_restores_forever_retries_and_bumps_link_seq(self):
        w, d = self.w, self.wlan
        d.plans["Home"] = ["ok"]
        seq = w.link_seq()
        self.assertTrue(w.connect_begin("Home", "pw"))
        self.assertEqual(d.conf, 2)          # bounded while joining
        self.assertEqual(self.poll_until_done(), w.CONN_OK)
        self.assertEqual(d.conf, 0)          # forever again once up
        self.assertEqual(w.link_seq(), seq + 1)
        self.assertEqual(w.connect_last_code(), STAT_GOT_IP)

    def test_wrong_password_handshake_timeout_is_reported(self):
        # IDF 5 usually reports a wrong WPA2 key as reason 15. With the
        # driver's default (retry forever) status() would say CONNECTING
        # until our timeout; with bounded retries it surfaces.
        w, d = self.w, self.wlan
        d.plans["Home"] = [15, 15, 15, 15]
        w.connect_begin("Home", "wrong")
        r = self.poll_until_done()
        self.assertEqual(r, w.CONN_BAD_PW)
        self.assertLess(self.clock.ms - 1000, w.connect_timeout_ms())
        self.assertEqual(w.connect_last_code(), 15)
        self.assertFalse(d.requested)       # retry loop stopped

    def test_auth_fail_reported_after_hold_not_timeout(self):
        w, d = self.w, self.wlan
        d.plans["Home"] = [202, 202, 202]
        w.connect_begin("Home", "wrong")
        r = self.poll_until_done()
        self.assertEqual(r, w.CONN_BAD_PW)
        self.assertLess(self.clock.ms - 1000, 8000)

    def test_ap_not_found(self):
        w, d = self.w, self.wlan
        d.plans["Gone"] = [201, 201, 201]
        w.connect_begin("Gone", "pw")
        self.assertEqual(self.poll_until_done(), w.CONN_NO_AP)

    def test_transient_no_ap_then_success_on_driver_retry(self):
        w, d = self.w, self.wlan
        d.plans["Home"] = [201, "ok"]
        w.connect_begin("Home", "pw")
        self.assertEqual(self.poll_until_done(), w.CONN_OK)

    def test_other_reason_reported_as_failed(self):
        w, d = self.w, self.wlan
        d.plans["Home"] = [203, 203]
        w.connect_begin("Home", "pw")
        self.assertEqual(self.poll_until_done(), w.CONN_FAIL)

    def test_timeout_stops_driver(self):
        w, d = self.w, self.wlan
        d.plans["Slow"] = [None]             # attempt never resolves
        w.connect_begin("Slow", "pw", timeout_ms=5000)
        self.assertEqual(self.poll_until_done(), w.CONN_TIMEOUT)
        self.assertFalse(d.requested)
        self.assertIsNone(d.attempt_end)

    def test_stale_auth_fail_does_not_fail_healthy_retry(self):
        w, d = self.w, self.wlan
        d.plans["Home"] = [202, 202]
        w.connect_begin("Home", "wrong")
        self.assertEqual(self.poll_until_done(), w.CONN_BAD_PW)
        # Driver idle, reason 202 kept: the next (correct) join still
        # reads 202 until GOT_IP.
        d.reason = 202
        d.attempt_ms = 4000
        d.plans["Home"] = ["ok"]
        w.connect_begin("Home", "right")
        self.assertEqual(w.connect_poll(), w.CONN_BUSY)
        self.assertEqual(self.poll_until_done(), w.CONN_OK)

    def test_connect_refused_once_is_retried(self):
        w, d = self.w, self.wlan
        d.connect_raises = 1
        d.plans["Home"] = ["ok"]
        self.assertTrue(w.connect_begin("Home", "pw"))
        self.assertEqual(self.poll_until_done(), w.CONN_OK)

    def test_connect_refused_twice_fails_cleanly(self):
        w, d = self.w, self.wlan
        d.connect_raises = 2
        self.assertFalse(w.connect_begin("Home", "pw"))
        self.assertIsNone(w.connect_target())
        self.assertEqual(w.connect_poll(), w.CONN_FAIL)

    def test_build_without_reconnects_still_times_out(self):
        w, d = self.w, self.wlan
        d.reconnects_supported = False
        d.plans["Home"] = [15] * 50
        w.connect_begin("Home", "wrong", timeout_ms=6000)
        self.assertEqual(self.poll_until_done(), w.CONN_TIMEOUT)
        self.assertFalse(d.requested)

    def test_legacy_connect_timeout_stops_retry_loop(self):
        w, d = self.w, self.wlan
        d.plans["Home"] = [201] * 50
        self.assertFalse(w.connect("Home", "pw", timeout_ms=3000))
        self.assertFalse(d.requested)


class ClassifyTest(Base):
    def test_codes(self):
        c, w = self.w.classify_status, self.w
        for code in (202, 15, 204):
            self.assertEqual(c(code), w.CONN_BAD_PW)
        for code in NO_AP_CODES:
            self.assertEqual(c(code), w.CONN_NO_AP)
        for code in (2, 200, 203, 205):
            self.assertEqual(c(code), w.CONN_FAIL)
        for code in (0, 8, 1000, 1001, 1010, None, "x"):
            self.assertIsNone(c(code))
        self.assertEqual(w.status_name(202), "202:AUTH_FAIL")


class ScanTest(Base):
    def test_retry_loop_blocking_scan_is_stopped(self):
        # A join that failed with the default "retry forever" (old legacy
        # path) leaves IDF connecting; 1.28 scan() then returns [].
        w, d = self.w, self.wlan
        d.active(True)
        d.scan_result = [ap("Cafe", -50), ap("Home", -60)]
        d.connect("Gone", "pw")
        d.plan = [201] * 100
        self.assertTrue(w.scan_start())
        self.assertEqual(w.scan_poll(), "done")
        self.assertEqual([n["ssid"] for n in w.nearby()], ["Cafe", "Home"])
        self.assertFalse(d.requested)
        self.assertEqual(d.scans, 2)

    def _drop_link(self):
        """The AP goes away under an established link: the driver's
        STA_DISCONNECTED handler keeps retrying (reconnects=-1)."""
        d = self.wlan
        d.connected = False
        d.reason = 200                           # BEACON_TIMEOUT
        d.plan = [200] * 100
        d._start_attempt()

    def test_scan_during_link_recovery_keeps_driver_retrying(self):
        w, d = self.w, self.wlan
        d.plans["Home"] = ["ok"]
        w.connect_begin("Home", "pw")
        self.assertEqual(self.poll_until_done(), w.CONN_OK)
        d.scan_result = [ap("Cafe", -50)]
        w.scan_start()
        self.assertEqual(w.scan_poll(), "done")
        before = list(w.nearby())
        self._drop_link()
        self.assertTrue(w.scan_start())
        self.assertEqual(w.scan_poll(), "error")
        self.assertEqual(w.scan_error(), "radio busy reconnecting")
        self.assertTrue(d.requested)             # recovery not stopped
        self.assertEqual(d.conf, 0)              # still retrying forever
        self.assertEqual(w.nearby(), before)

    def test_scan_after_link_recovery_from_legacy_connect(self):
        w, d = self.w, self.wlan
        d.plans["Home"] = ["ok"]
        self.assertTrue(w.connect("Home", "pw"))
        self.assertEqual(d.conf, 0)
        self._drop_link()
        w.scan_start()
        self.assertEqual(w.scan_poll(), "error")
        self.assertTrue(d.requested)

    def test_deliberate_disconnect_lets_scan_stop_leftover_loop(self):
        # After the link is replaced on purpose (here: radio toggled off
        # and on, then an outside connect), a stray loop is ours to stop.
        w, d = self.w, self.wlan
        d.plans["Home"] = ["ok"]
        w.connect_begin("Home", "pw")
        self.assertEqual(self.poll_until_done(), w.CONN_OK)
        w.radio_off()
        d.active(True)
        d.scan_result = [ap("Cafe", -50)]
        d.connect("Gone", "pw")
        d.plan = [201] * 100
        w.scan_start()
        self.assertEqual(w.scan_poll(), "done")
        self.assertFalse(d.requested)

    def test_scan_during_join_reports_busy_and_keeps_join(self):
        w, d = self.w, self.wlan
        d.scan_result = [ap("Cafe", -50)]
        d.plans["Home"] = [None]
        w.connect_begin("Home", "pw")
        before = list(w.nearby())
        self.assertTrue(w.scan_start())
        self.assertEqual(w.scan_poll(), "error")
        self.assertEqual(w.scan_error(), "radio busy joining")
        self.assertTrue(d.requested)                 # join untouched
        self.assertEqual(w.connect_target(), "Home")
        self.assertEqual(w.nearby(), before)

    def test_genuinely_empty_scan_keeps_remembered_file(self):
        w, d = self.w, self.wlan
        d.active(True)
        d.scan_result = [ap("Cafe", -50)]
        w.scan_start()
        self.assertEqual(w.scan_poll(), "done")
        d.scan_result = []
        w.scan_start()
        self.assertEqual(w.scan_poll(), "done")
        self.assertEqual(w.nearby(), [])
        seen = json.loads(Path(w._SEEN_PATH).read_text())
        self.assertEqual([s["ssid"] for s in seen], ["Cafe"])


class ThreadedScanTest(Base):
    def setUp(self):
        self.threads = CapturedThreads()
        super().setUp()

    def test_abandoned_worker_cannot_publish_into_next_scan(self):
        w, d = self.w, self.wlan
        d.active(True)
        d.scan_result = [ap("Old", -50)]
        w.scan_start()
        self.assertEqual(w.scan_poll(), "busy")
        self.clock.ms += 9000
        self.assertEqual(w.scan_poll(), "error")     # abandoned
        w.scan_start()                               # second scan
        stale_fn, stale_args = self.threads.pending.pop(0)
        stale_fn(*stale_args)                        # first worker, late
        self.assertTrue(w.scan_busy())
        self.assertEqual(w.scan_poll(), "busy")
        d.scan_result = [ap("New", -40)]
        self.threads.run_all()
        self.assertEqual(w.scan_poll(), "done")
        self.assertEqual([n["ssid"] for n in w.nearby()], ["New"])

    def test_auto_begin_waits_for_running_scan(self):
        w, d = self.w, self.wlan
        w.add_saved("Home", "pw", priority=1)
        w._mark_last("Home")
        d.scan_result = [ap("Home", -50)]
        d.plans["Home"] = ["ok"]
        w.scan_start()
        w.auto_begin()
        self.assertEqual(w.auto_state(), w.AUTO_SCAN)
        self.assertEqual(d.connect_log, [])
        self.threads.run_all()
        for _ in range(40):
            self.clock.ms += 200
            if w.auto_tick():
                break
        self.assertEqual(w.auto_state(), w.AUTO_DONE)
        self.assertEqual([s for s, _ in d.connect_log], ["Home"])

    def test_post_connect_refresh_scan_is_delayed(self):
        w, d = self.w, self.wlan
        w.add_saved("Home", "pw", priority=1)
        w._mark_last("Home")
        d.plans["Home"] = ["ok"]
        w.auto_begin()
        up = False
        for _ in range(40):
            self.clock.ms += 200
            up = w.auto_tick() or up
            if up:
                break
        self.assertTrue(up)
        t_up = self.clock.ms
        while self.clock.ms - t_up < w._REFRESH_DELAY_MS - 300:
            self.clock.ms += 200
            w.auto_tick()
            self.assertFalse(w.scan_busy())
        for _ in range(5):
            self.clock.ms += 200
            w.auto_tick()
        self.assertTrue(w.scan_busy())


class AutoDriverTest(Base):
    def tick_until(self, pred, limit=200):
        for _ in range(limit):
            self.clock.ms += 200
            self.w.auto_tick()
            if pred():
                return True
        return False

    def test_empty_scan_tries_saved_networks_blind(self):
        w, d = self.w, self.wlan
        w.add_saved("Home", "pw", priority=1)
        d.scan_result = []
        d.plans["Home"] = ["ok"]
        w.auto_begin()
        self.assertTrue(self.tick_until(lambda: w.auto_state() == w.AUTO_DONE))
        self.assertEqual([s for s, _ in d.connect_log], ["Home"])

    def test_fast_path_not_found_retried_after_others(self):
        w, d = self.w, self.wlan
        w.add_saved("Last", "a", priority=1)
        w.add_saved("Other", "b", priority=5)
        w._mark_last("Last")
        d.scan_result = [ap("Last", -70), ap("Other", -60)]
        d.plans["Last"] = [201, 201, 201]
        d.plans["Other"] = [202, 202, 202]
        w.auto_begin()
        self.tick_until(lambda: len(d.connect_log) >= 3)
        self.assertEqual([s for s, _ in d.connect_log],
                         ["Last", "Other", "Last"])

    def test_wrong_password_moves_on_to_next_network(self):
        w, d = self.w, self.wlan
        w.add_saved("A", "bad", priority=1)
        w.add_saved("B", "good", priority=2)
        d.scan_result = [ap("A", -50), ap("B", -60)]
        d.plans["A"] = [15, 15, 15]
        d.plans["B"] = ["ok"]
        w.auto_begin()
        self.assertTrue(self.tick_until(lambda: w.auto_state() == w.AUTO_DONE))
        self.assertEqual([s for s, _ in d.connect_log], ["A", "B"])

    def test_unpolled_manual_join_finished_by_auto_tick(self):
        w, d = self.w, self.wlan
        d.plans["Home"] = ["ok"]
        seq = w.link_seq()
        w.connect_begin("Home", "pw")
        w.auto_stop()
        self.assertEqual(w.auto_state(), w.AUTO_OFF)
        for _ in range(40):
            self.clock.ms += 100
            self.assertFalse(w.auto_tick())
        self.assertIsNone(w.connect_target())
        self.assertEqual(d.conf, 0)              # reconnects == -1
        self.assertEqual(w.link_seq(), seq + 1)
        self.assertEqual(w.connect_poll(), w.CONN_OK)

    def test_unpolled_manual_join_failure_stops_driver(self):
        w, d = self.w, self.wlan
        d.plans["Home"] = [15] * 10
        w.connect_begin("Home", "wrong")
        for _ in range(300):
            self.clock.ms += 100
            w.auto_tick()
        self.assertIsNone(w.connect_target())
        self.assertEqual(w.connect_poll(), w.CONN_BAD_PW)
        self.assertFalse(d.requested)

    def test_new_join_clears_previous_last_code(self):
        w, d = self.w, self.wlan
        d.plans["Home"] = [15, 15, 15]
        w.connect_begin("Home", "wrong")
        self.poll_until_done()
        self.assertEqual(w.connect_last_code(), 15)
        d.plans["Home"] = [None]
        w.connect_begin("Home", "right")
        self.assertIsNone(w.connect_last_code())

    def test_adopts_join_already_in_flight(self):
        w, d = self.w, self.wlan
        w.add_saved("Home", "pw", priority=1)
        d.plans["Manual"] = ["ok"]
        w.connect_begin("Manual", "pw")
        w.auto_begin()
        self.assertEqual(w.auto_state(), w.AUTO_TRY)
        self.assertTrue(self.tick_until(lambda: w.auto_state() == w.AUTO_DONE))
        self.assertEqual([s for s, _ in d.connect_log], ["Manual"])


class DebugLogTest(Base):
    def test_log_records_transitions_without_passwords(self):
        w, d = self.w, self.wlan
        d.plans["Home"] = [202, 202, 202]
        w.connect_begin("Home", "hunter2-secret")
        self.poll_until_done()
        log = w.debug_log()
        text = "\n".join(log)
        self.assertNotIn("hunter2", text)
        self.assertIn("pw=yes", text)
        self.assertIn("202:AUTH_FAIL", text)
        self.assertIn("bad_password", text)
        # Status changes only, not one line per poll.
        self.assertLess(len(log), 10)

    def test_ring_is_bounded_and_ordered(self):
        w = self.w
        for i in range(w._DBG_N + 10):
            w._dbg("e%d" % i)
        log = w.debug_log()
        self.assertEqual(len(log), w._DBG_N)
        self.assertTrue(log[0].endswith(" e10"))
        self.assertTrue(log[-1].endswith(" e%d" % (w._DBG_N + 9)))
        w.debug_clear()
        self.assertEqual(w.debug_log(), [])

    def test_diag_snapshot(self):
        w, d = self.w, self.wlan
        d.plans["Home"] = [None]
        w.connect_begin("Home", "s3cret-key")
        snap = w.diag()
        self.assertEqual(snap["joining"], "Home")
        self.assertEqual(snap["status"], "1001:CONNECTING")
        self.assertEqual(snap["reconnects"], 1)
        self.assertNotIn("s3cret", json.dumps(snap))


if __name__ == "__main__":
    unittest.main()
