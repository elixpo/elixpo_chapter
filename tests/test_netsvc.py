"""Host tests for the boot / background-network work (#118, #119):
oreoOS/netsvc.py (auto-connect gates, link-up jobs, NTP worker and
backoff, keep-alive), oreoOS/perf.py (timing), timeutil's sync guard and
DNS cache, the splash's settle wait and the launcher's safe-boot check.

The modules are loaded from their files behind stub `oreoOS` / `oreoWare`
packages; the Wi-Fi driver, sockets, machine and _thread are fakes.

    python3 -m unittest tests.test_netsvc -v
"""

import importlib.util
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

_STUBBED = ("oreoOS", "oreoOS.api", "oreoOS.theme", "oreoOS.config",
            "oreoOS.perf", "oreoOS.timeutil", "oreoOS.http_server",
            "oreoOS.netsvc", "oreoWare", "oreoWare.wifi", "machine",
            "secrets", "socket_fake")


def _load(rel, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


class FakeClock:
    def __init__(self, t=1000):
        self.t = t

    def ticks_ms(self):
        return self.t

    def ticks_diff(self, a, b):
        return a - b

    def ticks_add(self, a, b):
        return a + b

    def sleep_ms(self, ms):
        self.t += ms

    def time(self):
        return 0


class FakeWifi(types.ModuleType):
    def __init__(self):
        super().__init__("oreoWare.wifi")
        self.connected = False
        self.radio = True
        self.state = "off"
        self.saved = [{"ssid": "Home"}]
        self.begins = 0
        self.up_once = False
        self.target = None          # SSID of a join in flight
        self.polls = 0
        self.poll_result = None     # what connect_poll() does: None = busy

    def connect_target(self):
        return self.target

    def connect_poll(self):
        self.polls += 1
        if self.poll_result is not None:
            ok = self.poll_result == "ok"
            self.target = None
            self.connected = ok
            return self.poll_result
        return "busy"

    def is_connected(self):
        return self.connected

    def is_radio_on(self):
        return self.radio

    def auto_state(self):
        return self.state

    def auto_begin(self):
        self.begins += 1
        self.state = "connecting"

    def auto_tick(self):
        if self.up_once:
            self.up_once = False
            return True
        return False

    def auto_stop(self):
        self.state = "off"

    def list_saved(self):
        return list(self.saved)

    def last_connected(self, saved=None):
        return None


class FakeThread:
    def __init__(self):
        self.started = []
        self.size = 4096

    def start_new_thread(self, fn, args):
        self.started.append((fn, args))

    def stack_size(self, n=None):
        old = self.size
        if n is not None:
            self.size = n
        return old

    def run_all(self):
        jobs, self.started = self.started, []
        for fn, args in jobs:
            fn(*args)


class Env:
    """Stub packages + fakes; restores sys.modules on close()."""

    def __init__(self, settings=None, reset_cause=0):
        self.saved = {k: sys.modules.get(k) for k in _STUBBED}
        oreo = types.ModuleType("oreoOS")
        oreo.__path__ = [str(ROOT / "oreoOS")]
        sys.modules["oreoOS"] = oreo
        ware = types.ModuleType("oreoWare")
        ware.__path__ = []
        sys.modules["oreoWare"] = ware
        self.wifi = FakeWifi()
        sys.modules["oreoWare.wifi"] = self.wifi
        ware.wifi = self.wifi

        machine = types.ModuleType("machine")
        machine.BROWNOUT_RESET = 6
        machine.reset_cause = lambda: reset_cause
        sys.modules["machine"] = machine

        self.http = types.ModuleType("oreoOS.http_server")
        self.http.calls = []
        self.http.start = lambda os_obj=None: self.http.calls.append("start")
        self.http.stop = lambda: self.http.calls.append("stop")
        sys.modules["oreoOS.http_server"] = self.http
        oreo.http_server = self.http

        self.tu = types.ModuleType("oreoOS.timeutil")
        self.tu.results = []
        self.tu.calls = 0

        def sync():
            self.tu.calls += 1
            return self.tu.results.pop(0) if self.tu.results else (True, "synced")
        self.tu.sync_from_ntp = sync
        sys.modules["oreoOS.timeutil"] = self.tu
        oreo.timeutil = self.tu

        self.perf = _load("oreoOS/perf.py", "oreoOS.perf")
        oreo.perf = self.perf
        self.clock = FakeClock()
        self.perf.time = self.clock

        self.net = _load("oreoOS/netsvc.py", "oreoOS.netsvc")
        oreo.netsvc = self.net
        self.net.time = self.clock
        self.thread = FakeThread()
        self.net._thread = self.thread
        self.net._log = lambda msg: None
        self.settings = dict(settings or {})
        self.os = types.SimpleNamespace(
            settings_get=lambda k, d=None: self.settings.get(k, d))

    def tick(self, ms=0, fg=None):
        self.clock.t += ms
        self.net.tick(fg)

    def close(self):
        for k, v in self.saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v


class NetsvcBeginTest(unittest.TestCase):
    def tearDown(self):
        self.env.close()

    def test_starts_auto_connect(self):
        self.env = Env()
        self.assertEqual(self.env.net.begin(self.env.os), "started")
        self.assertEqual(self.env.wifi.begins, 1)

    def test_setting_off(self):
        self.env = Env(settings={"wifi_autoconnect": False})
        self.assertEqual(self.env.net.begin(self.env.os), "auto-connect off")
        self.assertEqual(self.env.wifi.begins, 0)

    def test_safe_mode_and_brownout_hold(self):
        self.env = Env()
        self.assertEqual(self.env.net.begin(self.env.os, safe=True), "safe mode")
        self.assertEqual(self.env.wifi.begins, 0)
        self.env.close()
        self.env = Env(reset_cause=6)
        self.assertEqual(self.env.net.begin(self.env.os), "brownout")
        self.assertEqual(self.env.wifi.begins, 0)

    def test_secrets_flag(self):
        self.env = Env()
        sec = types.ModuleType("secrets")
        sec.WIFI_AUTO_CONNECT = False
        sys.modules["secrets"] = sec
        self.assertEqual(self.env.net.begin(self.env.os), "off in secrets")

    def test_boot_settled_waits_for_scan(self):
        self.env = Env()
        self.env.net.begin(self.env.os)
        self.env.wifi.state = "scanning"
        self.assertFalse(self.env.net.boot_settled())
        self.env.wifi.state = "connecting"
        self.assertTrue(self.env.net.boot_settled())


class NetsvcLinkTest(unittest.TestCase):
    def setUp(self):
        self.env = Env()
        self.net = self.env.net
        self.net.begin(self.env.os)

    def tearDown(self):
        self.env.close()

    def _link_up(self):
        self.env.wifi.connected = True
        self.env.wifi.state = "connected"
        self.env.wifi.up_once = True

    def test_quiet_window_defers_link_jobs(self):
        self._link_up()
        self.env.tick()                       # before Home: always quiet
        self.net.home_shown()
        self.env.tick(100)
        self.assertEqual(self.env.thread.started, [])
        self.env.tick(self.net.QUIET_MS)
        self.assertEqual(len(self.env.thread.started), 1)
        # Wi-Fi carries no files: nothing starts a LAN server on link-up.
        self.assertEqual(self.env.http.calls, [])
        self.assertEqual(self.env.tu.calls, 0)    # not on the UI thread

    def test_ntp_runs_on_worker_and_resyncs(self):
        self.net.home_shown()
        self.env.clock.t += self.net.QUIET_MS
        self._link_up()
        self.env.tick()
        self.assertEqual(self.net.time_status()[0], "syncing")
        self.env.tick(10)
        self.assertEqual(len(self.env.thread.started), 1)   # only one worker
        self.env.thread.run_all()
        self.env.tick(10)
        self.assertEqual(self.net.time_status()[0], "synced")
        self.env.tick(self.net.NTP_RESYNC_S * 1000 - 100)
        self.assertEqual(self.env.thread.started, [])
        self.env.tick(200)
        self.assertEqual(len(self.env.thread.started), 1)
        self.assertEqual(self.env.thread.size, 4096)       # stack restored

    def test_unset_stack_size_restored(self):
        # stack_size() returns 0 when it was never set (no splash thread).
        self.env.thread.size = 0
        self.net.home_shown()
        self.env.clock.t += self.net.QUIET_MS
        self._link_up()
        self.env.tick()
        self.assertEqual(len(self.env.thread.started), 1)
        self.assertEqual(self.env.thread.size, 0)

    def test_ntp_failure_backs_off(self):
        self.env.tu.results = [(False, "ntp timeout"), (False, "ntp timeout")]
        self.net.home_shown()
        self.env.clock.t += self.net.QUIET_MS
        self._link_up()
        self.env.tick()
        self.env.thread.run_all()
        self.env.tick()
        self.assertEqual(self.net.time_status(), ("failed", "ntp timeout"))
        self.env.tick(self.net.NTP_RETRY_S[0] * 1000 - 10)
        self.assertEqual(self.env.thread.started, [])
        self.env.tick(20)
        self.env.thread.run_all()
        self.env.tick()
        # Second failure waits the next step of the backoff.
        self.env.tick(self.net.NTP_RETRY_S[0] * 1000 + 10)
        self.assertEqual(self.env.thread.started, [])
        self.env.tick(self.net.NTP_RETRY_S[1] * 1000)
        self.assertEqual(len(self.env.thread.started), 1)

    def test_drop_rejoins_with_backoff(self):
        self.net.home_shown()
        self.env.clock.t += self.net.QUIET_MS
        self._link_up()
        self.env.tick()
        begins = self.env.wifi.begins
        self.env.wifi.connected = False          # router restart
        self.env.tick(self.net.POLL_MS)
        self.assertEqual(self.net.status(), ("retrying", self.net.REJOIN_S[0]))
        self.assertEqual(self.net.status_text(),
                         "retrying in %d s" % self.net.REJOIN_S[0])
        self.env.tick(self.net.REJOIN_S[0] * 1000)
        self.assertEqual(self.env.wifi.begins, begins + 1)
        self.assertEqual(self.net.status(), ("connecting", 0))
        # The join fails: the next try waits for the second backoff step.
        self.env.wifi.state = "no_network"
        self.env.tick(self.net.POLL_MS)
        self.assertEqual(self.net.status()[0], "retrying")
        self.env.tick(self.net.REJOIN_S[1] * 1000)
        self.assertEqual(self.env.wifi.begins, begins + 2)
        # Back up, still without any LAN server.
        self._link_up()
        self.env.tick(self.net.POLL_MS)
        self.assertEqual(self.env.http.calls, [])
        self.assertEqual(self.net.status(), ("connected", 0))

    def test_rejoin_respects_switch_setting_and_wifi_app(self):
        self._link_up()
        self.env.tick()
        self.env.wifi.connected = False
        self.env.tick(self.net.POLL_MS)
        begins = self.env.wifi.begins
        self.env.tick(self.net.REJOIN_S[0] * 1000, fg="WiFi")
        self.assertEqual(self.env.wifi.begins, begins)     # app owns radio
        self.env.settings["wifi_autoconnect"] = False
        self.env.tick(self.net.POLL_MS)
        self.assertEqual(self.env.wifi.begins, begins)
        self.assertEqual(self.net.status(), ("offline", 0))
        self.env.settings["wifi_autoconnect"] = True
        self.env.wifi.radio = False
        self.env.wifi.state = "no_network"
        self.env.tick(self.net.POLL_MS * 600)
        self.assertEqual(self.env.wifi.begins, begins)
        self.assertEqual(self.net.status_text(), "Wi-Fi off")

    def test_boot_failure_retries_later(self):
        self.env.wifi.state = "no_network"
        self.env.tick()
        self.assertEqual(self.net.status()[0], "retrying")
        self.env.tick(self.net.REJOIN_S[0] * 1000)
        self.assertEqual(self.env.wifi.begins, 2)

    def test_nothing_saved_no_retry(self):
        self.env.wifi.saved = []
        self.env.wifi.state = "no_network"
        self.env.tick(self.net.POLL_MS * 100)
        self.assertEqual(self.env.wifi.begins, 1)
        self.assertEqual(self.net.status(), ("offline", 0))


class NetsvcManualJoinTest(unittest.TestCase):
    """The WiFi app calls auto_stop() before a manual join (state "off")."""

    def setUp(self):
        self.env = Env()
        self.net = self.env.net
        self.net.begin(self.env.os)
        self.wifi = self.env.wifi

    def tearDown(self):
        self.env.close()

    def test_auto_stop_then_failed_join_retries_after_app(self):
        self.wifi.auto_stop()                 # boot join was "connecting"
        self.wifi.target = "Cafe"             # manual join in the app
        self.env.tick(self.net.POLL_MS * 5, fg="WiFi")
        self.assertEqual(self.wifi.polls, 0)  # the app polls its own join
        self.wifi.target = None               # ... and it failed
        for _ in range(30):
            self.env.tick(self.net.POLL_MS, fg="WiFi")
        self.assertEqual(self.wifi.begins, 1)     # never under the app
        self.env.tick(self.net.POLL_MS, fg="Home")
        self.assertEqual(self.wifi.begins, 2)
        self.assertEqual(self.net.status(), ("connecting", 0))

    def test_off_without_saved_networks_stays_offline(self):
        self.wifi.saved = []
        self.wifi.auto_stop()
        self.env.tick(self.net.POLL_MS * 100)
        self.assertEqual(self.wifi.begins, 1)
        self.assertEqual(self.net.status(), ("offline", 0))

    def test_join_left_behind_is_finished_outside_the_app(self):
        self.wifi.auto_stop()
        self.wifi.target = "Cafe"
        self.env.tick(self.net.POLL_MS, fg="Home")
        self.assertEqual(self.wifi.polls, 1)
        self.assertEqual(self.net.status(), ("connecting", 0))
        self.env.tick(self.net.POLL_MS * 20, fg="Home")
        self.assertEqual(self.wifi.begins, 1)     # no auto join over it
        self.wifi.poll_result = "ok"
        self.env.tick(self.net.POLL_MS, fg="Home")
        self.env.tick(self.net.POLL_MS, fg="Home")
        self.assertEqual(self.net.status(), ("connected", 0))
        self.assertTrue(self.net._link)

    def test_join_left_behind_times_out_then_retries(self):
        self.wifi.auto_stop()
        self.wifi.target = "Cafe"
        self.env.tick(self.net.POLL_MS, fg="Home")
        self.wifi.poll_result = "timeout"
        self.env.tick(self.net.POLL_MS, fg="Home")
        self.assertIsNone(self.wifi.target)
        self.env.tick(self.net.POLL_MS, fg="Home")
        self.assertEqual(self.net.status()[0], "retrying")
        self.env.tick(self.net.REJOIN_S[0] * 1000, fg="Home")
        self.assertEqual(self.wifi.begins, 2)


class NetsvcBackgroundOkTest(unittest.TestCase):
    def test_grace_in_ticks_after_home(self):
        env = Env()
        try:
            net = env.net
            self.assertFalse(net.background_ok())    # before Home
            net.home_shown()
            env.clock.t += net.QUIET_MS
            self.assertFalse(net.background_ok())
            env.clock.t += net.BG_GRACE_MS - net.QUIET_MS - 1
            self.assertFalse(net.background_ok())
            env.clock.t += 1
            self.assertTrue(net.background_ok())
        finally:
            env.close()

    def test_launcher_gates_ota_probe(self):
        src = (ROOT / "oreoOS/launcher.py").read_text()
        i = src.index("_ota.background_check(os_obj, foreground=app_name)")
        head = src[:i]
        self.assertIn("_net.background_ok()", head[-600:])
        # Inside the timed network tail, so perf's net_ms covers it.
        self.assertGreater(i, src.index("net_t0 = time.ticks_ms()"))
        self.assertLess(i, src.index(
            "net_ms = time.ticks_diff(time.ticks_ms(), net_t0)"))


class NetsvcHoldTest(unittest.TestCase):
    def tearDown(self):
        self.env.close()

    def test_safe_mode_no_rejoin_until_manual_connect(self):
        self.env = Env()
        net = self.env.net
        net.begin(self.env.os, safe=True)
        self.env.wifi.state = "no_network"
        self.env.tick(net.POLL_MS * 100)
        self.assertEqual(self.env.wifi.begins, 0)
        # The user connects from the WiFi app: hold ends, keep-alive on.
        self.env.wifi.connected = True
        self.env.tick(net.POLL_MS)
        self.env.wifi.connected = False
        self.env.tick(net.POLL_MS)
        self.env.tick(net.REJOIN_S[0] * 1000)
        self.assertEqual(self.env.wifi.begins, 1)


class NetsvcNoThreadTest(unittest.TestCase):
    def test_inline_fallback_after_quiet(self):
        env = Env()
        try:
            net = env.net
            net._thread = None
            net.begin(env.os)
            env.wifi.connected = True
            env.tick()
            self.assertEqual(env.tu.calls, 0)
            net.home_shown()
            env.tick(net.QUIET_MS)
            self.assertEqual(env.tu.calls, 1)
            self.assertEqual(net.time_status()[0], "synced")
        finally:
            env.close()


class PerfTest(unittest.TestCase):
    def setUp(self):
        self.env = Env()
        self.perf = self.env.perf
        self.perf.reset()

    def tearDown(self):
        self.env.close()

    def test_window_press_and_net(self):
        p = self.perf
        p.mark("boot")
        p.frame(400, 0)                 # before Home: not in the window
        p.press(10)                     # nor is a press
        p.home_shown()
        self.env.clock.t += 200
        p.frame(30, 2)
        p.frame(80, 60)
        p.press(80)
        p.press(5)                      # only the first press counts
        self.env.clock.t += p.WINDOW_MS + 1
        p.frame(500, 0)
        s = p.summary()
        self.assertEqual(s["max_frame_ms"], 80)
        self.assertEqual(s["frames"], 2)
        self.assertEqual(s["slow_frames"], 1)
        self.assertEqual(s["first_press_after_home_ms"], 200)
        self.assertEqual(s["first_press_bound_ms"], 80)
        self.assertEqual(s["max_net_ms"], 60)
        self.assertEqual(s["slow_net_frames"], 1)
        self.assertEqual([t for _, t in s["marks"]], ["boot", "home shown"])
        import io
        import contextlib
        with contextlib.redirect_stdout(io.StringIO()) as out:
            p.report()
        self.assertIn("first press read at +200 ms", out.getvalue())
        self.assertIn("at most 80 ms", out.getvalue())

    def test_marks_capped(self):
        for i in range(self.perf.MAX_MARKS + 10):
            self.perf.mark(str(i))
        self.assertEqual(len(self.perf.summary()["marks"]), self.perf.MAX_MARKS)


class FakeSock:
    replies = []
    sent = []

    def __init__(self, *a):
        pass

    def settimeout(self, t):
        pass

    def sendto(self, pkt, addr):
        FakeSock.sent.append(addr)

    def recvfrom(self, n):
        r = FakeSock.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return r, None

    def close(self):
        pass


class TimeutilTest(unittest.TestCase):
    def setUp(self):
        self.env = Env()
        self.saved_socket = sys.modules.get("socket")
        sock = types.ModuleType("socket")
        sock.AF_INET, sock.SOCK_DGRAM = 2, 2
        self.lookups = []

        def gai(host, port):
            self.lookups.append(host)
            return [(0, 0, 0, "", ("1.2.3.4", port))]
        sock.getaddrinfo = gai
        sock.socket = FakeSock
        sys.modules["socket"] = sock
        FakeSock.replies, FakeSock.sent = [], []
        self.tu = _load("oreoOS/timeutil.py", "oreoOS.timeutil")

    def tearDown(self):
        if self.saved_socket is None:
            sys.modules.pop("socket", None)
        else:
            sys.modules["socket"] = self.saved_socket
        self.env.close()

    @staticmethod
    def _reply(secs):
        b = bytearray(48)
        b[40:44] = secs.to_bytes(4, "big")
        return bytes(b)

    def test_dns_cached_after_success_and_dropped_on_failure(self):
        tu = self.tu
        FakeSock.replies = [self._reply(tu._NTP_DELTA + 100),
                            OSError("timeout"),
                            self._reply(tu._NTP_DELTA + 200)]
        self.assertEqual(tu._ntp_raw(), 100)
        self.assertEqual(tu._ntp_raw(), None)
        self.assertEqual(tu._ntp_raw(), 200)
        # Lookup on the first query, none on the cached second, and a
        # fresh one after the failure.
        self.assertEqual(len(self.lookups), 2)

    def test_zero_reply_rejected(self):
        FakeSock.replies = [self._reply(0)]
        self.assertIsNone(self.tu._ntp_raw())

    def test_second_caller_gets_busy(self):
        tu = self.tu
        self.env.wifi.connected = True
        seen = []

        def nested():
            seen.append(tu.sync_from_ntp())
            return None
        tu._ntp_raw = nested
        self.assertEqual(tu.sync_from_ntp(), (False, "ntp timeout"))
        self.assertEqual(seen, [(False, "busy")])
        self.assertFalse(tu.sync_busy())
        # The guard is released: a later call runs again.
        tu._ntp_raw = lambda: None
        self.assertEqual(tu.sync_from_ntp(), (False, "ntp timeout"))

    def test_no_wifi(self):
        self.assertEqual(self.tu.sync_from_ntp(), (False, "no wifi"))
        self.assertEqual(self.tu.last_sync_status(), "no-wifi")


class SplashSettleTest(unittest.TestCase):
    def setUp(self):
        import test_shell_ui as t
        self.t = t
        self.saved = t._stub_oreoos()
        self.sp = t._load("oreoOS/splash.py", "oreoOS.splash")
        self.clock = t.FakeClock()
        self.sp.time = self.clock
        d = t.FakeDisplay(self.sp.SW, self.sp.SH)
        d._buf = d.buf
        self.os_obj = types.SimpleNamespace(display=d, _last_brightness=70)

    def tearDown(self):
        self.t._restore(self.saved)

    def _splash(self):
        s = self.sp.Splash(self.os_obj)
        s._start_thread = lambda: None
        s.intro()
        return s

    def test_settled_early_keeps_minimum(self):
        s = self._splash()
        calls = []
        s.finish(lambda: calls.append(1) or True)
        self.assertEqual(len(calls), 1)
        self.assertGreaterEqual(self.clock.t, self.sp.MIN_TOTAL_MS)
        self.assertLess(self.clock.t, self.sp.MAX_TOTAL_MS)

    def test_waits_until_settled(self):
        s = self._splash()
        target = self.sp.MIN_TOTAL_MS + 500
        s.finish(lambda: self.clock.t >= target)
        self.assertGreaterEqual(self.clock.t, target)
        self.assertLess(self.clock.t, self.sp.MAX_TOTAL_MS + 500)

    def test_cap(self):
        s = self._splash()
        s.finish(lambda: False)
        self.assertGreaterEqual(self.clock.t, self.sp.MAX_TOTAL_MS - self.sp.FILL_MS)
        self.assertLess(self.clock.t, self.sp.MAX_TOTAL_MS + 600)
        self.assertIsNotNone(self.os_obj._splash_frame)   # swipe still set up

    def test_raising_predicate_does_not_break_boot(self):
        s = self._splash()

        def bad():
            raise RuntimeError("x")
        s.finish(bad)
        self.assertIsNotNone(self.os_obj._splash_frame)


class SafeBootTest(unittest.TestCase):
    def setUp(self):
        self.saved = {k: sys.modules.get(k) for k in
                      ("oreoOS", "oreoOS.api", "oreoOS.config",
                       "oreoOS.launcher_t")}
        pkg = types.ModuleType("oreoOS")
        pkg.__path__ = [str(ROOT / "oreoOS")]
        sys.modules["oreoOS"] = pkg
        pkg.api = _load("oreoOS/api.py", "oreoOS.api")
        pkg.config = _load("oreoOS/config.py", "oreoOS.config")
        self.l = _load("oreoOS/launcher.py", "oreoOS.launcher_t")
        self.clock = FakeClock()
        self.l.time = self.clock
        self.api = pkg.api

    def tearDown(self):
        for k, v in self.saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v

    def _buttons(self, release_at=None):
        clock, home = self.clock, self.api.BTN_HOME

        class B:
            def __init__(self):
                self.updates = 0

            def update(self):
                self.updates += 1

            def is_pressed(self, b):
                if b != home or release_at is False:
                    return False
                return release_at is None or clock.t < release_at
        return B()

    def test_not_held(self):
        b = self._buttons(release_at=False)
        self.assertFalse(self.l._safe_boot_requested(b))
        self.assertEqual(self.clock.t, 1000)     # no delay on a normal boot

    def test_held(self):
        self.assertTrue(self.l._safe_boot_requested(self._buttons()))

    def test_tap_is_not_a_hold(self):
        b = self._buttons(release_at=1000 + 100)
        self.assertFalse(self.l._safe_boot_requested(b))

    def test_crash_hint_fits_and_is_true(self):
        import ast
        src = (ROOT / "oreoOS/entry.py").read_text()
        tree = ast.parse(src)
        hint = None
        for node in tree.body:
            if (isinstance(node, ast.Assign) and
                    getattr(node.targets[0], "id", "") == "SAFE_HINT"):
                hint = ast.literal_eval(node.value)
        self.assertIsNotNone(hint)
        for line in hint:
            self.assertLessEqual(16 + len(line) * 8, 320)
        self.assertIn("HOME", " ".join(hint))
        self.assertNotIn("on power", src)


if __name__ == "__main__":
    unittest.main()
