"""Host tests for the follow-ups to PR #121 (background network, #118):

  * netsvc: sync_result() / request_sync() for the manual "Sync time" rows,
    link_seq() re-join detection, short_text() for the status surfaces;
  * the C panel's Sync row and WiFi tile (oreoOS/notif_panel.py);
  * Settings' Sync and WiFi rows (apps/settings);
  * Home's status-bar Wi-Fi label;
  * the OTA background probe running off the UI thread (oreoOS/ota.py);
  * Commits, Weather and the App Store waiting for the boot quiet window
    and fetching on a worker.

Every module is loaded from its file behind stub packages; the Wi-Fi
driver, netsvc (where it is not under test) and the network are fakes.

    python3 -m unittest tests.test_badge_followups -v
"""

import importlib.util
import json
import os
import sys
import tempfile
import threading
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_netsvc import Env  # noqa: E402


def _load(rel, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


class Stubs:
    """A stub `oreoOS` package (real api/theme/pixelfont/widgets/cache,
    App = object) plus whatever fakes a test adds. close() restores
    sys.modules."""

    NAMES = ("oreoOS", "oreoOS.api", "oreoOS.theme", "oreoOS.pixelfont",
             "oreoOS.widgets", "oreoOS.cache", "oreoOS.netsvc",
             "oreoOS._http", "oreoOS.notifications", "oreoOS.timeutil",
             "oreoOS.ota", "oreoOS.notif_panel", "oreoWare",
             "oreoWare.wifi", "oreoWare.bt", "under_test")

    def __init__(self):
        self.saved = {k: sys.modules.get(k) for k in self.NAMES}
        pkg = types.ModuleType("oreoOS")
        pkg.__path__ = [str(ROOT / "oreoOS")]
        pkg.App = object
        sys.modules["oreoOS"] = pkg
        self.pkg = pkg
        for mod in ("api", "theme", "pixelfont", "widgets", "cache"):
            setattr(pkg, mod, _load("oreoOS/%s.py" % mod, "oreoOS." + mod))
        pkg.widgets._time = None
        ware = types.ModuleType("oreoWare")
        ware.__path__ = []
        sys.modules["oreoWare"] = ware
        self.ware = ware

    def add(self, name, mod):
        sys.modules[name] = mod
        parent, _, leaf = name.rpartition(".")
        if parent in sys.modules:
            setattr(sys.modules[parent], leaf, mod)
        return mod

    def close(self):
        for k, v in self.saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v


class FakeNet(types.ModuleType):
    """netsvc's public surface, driven by the test."""

    def __init__(self):
        super().__init__("oreoOS.netsvc")
        self.state = ("connected", 0)
        self.link = True
        self.quiet = False
        self.threads = True
        self.busy = False
        self.result = (0, False, "")
        self.tstatus = ("never", "")
        self.requests = 0

    def status(self, now=None):
        return self.state

    def short_text(self, state, secs):
        real = sys.modules.get("_real_netsvc")
        return real.short_text(state, secs)

    def request_sync(self, now=None):
        self.requests += 1
        return self.link

    def sync_result(self):
        return self.result

    def time_status(self):
        return self.tstatus

    def in_quiet(self, now=None):
        return self.quiet

    def has_threads(self):
        return self.threads

    def worker_busy(self):
        return self.busy

    def fetch_busy(self):
        return self.busy


class FakeWifi(types.ModuleType):
    def __init__(self):
        super().__init__("oreoWare.wifi")
        self.connected = True
        self.radio = True
        self.name = "HomeNet"
        self.metered = False
        self.target = None

    def is_connected(self):
        return self.connected

    def is_radio_on(self):
        return self.radio

    def ssid(self):
        return self.name

    def ip(self):
        return "10.0.0.2"

    def is_metered(self):
        return self.metered

    def connect_target(self):
        return self.target


def _real_netsvc():
    """The real netsvc module (for short_text), loaded once."""
    mod = sys.modules.get("_real_netsvc")
    if mod is None:
        spec = importlib.util.spec_from_file_location(
            "_real_netsvc", ROOT / "oreoOS/netsvc.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        sys.modules["_real_netsvc"] = mod
    return mod


_real_netsvc()


# ── netsvc ───────────────────────────────────────────────────────────────

class NetsvcFollowupTest(unittest.TestCase):
    def setUp(self):
        self.env = Env()
        self.net = self.env.net
        self.seq = 0
        self.env.wifi.link_seq = lambda: self.seq
        self.net.begin(self.env.os)
        self.net.home_shown()
        self.env.clock.t += self.net.QUIET_MS

    def tearDown(self):
        self.env.close()

    def _up(self):
        self.seq += 1
        self.env.wifi.connected = True
        self.env.wifi.state = "connected"

    def _sync_once(self):
        self.env.thread.run_all()
        self.env.tick(10)

    def _count_link_ups(self):
        """Count netsvc._link_up() calls (the link-up jobs: time sync)."""
        calls = []
        real = self.net._link_up

        def spy(*a, **k):
            calls.append(a)
            return real(*a, **k)
        self.net._link_up = spy
        self.addCleanup(setattr, self.net, "_link_up", real)
        return calls

    def test_rejoin_between_polls_reruns_link_jobs(self):
        ups = self._count_link_ups()
        self._up()
        self.env.tick()
        self.assertEqual(len(ups), 1)
        self.assertEqual(len(self.env.thread.started), 1)
        self._sync_once()
        # Drop and re-join inside one poll: is_connected() never False,
        # but link_seq() moved, so the link-up jobs run again.
        self.seq += 1
        self.env.tick(self.net.POLL_MS)
        self.assertEqual(len(ups), 2)
        # The clock was synced moments ago: no second NTP query.
        self.assertEqual(self.env.thread.started, [])
        # Same link, later polls: nothing re-runs.
        self.env.tick(self.net.POLL_MS)
        self.assertEqual(len(ups), 2)
        # A quick re-join once the last sync is stale re-syncs too.
        self.env.tick(self.net.NTP_FRESH_S * 1000 + 1000)
        self.seq += 1
        self.env.tick(self.net.POLL_MS)
        self.assertEqual(len(self.env.thread.started), 1)

    def test_new_address_between_polls_rebinds(self):
        # A driver-level reconnect: link_seq() does not move, but the
        # station came back with a different DHCP lease.
        ups = self._count_link_ups()
        self.ip = "10.0.0.2"
        self.env.wifi.ip = lambda: self.ip
        self._up()
        self.env.tick()
        self.ip = "10.0.0.9"
        self.env.tick(self.net.POLL_MS)
        self.assertEqual(len(ups), 2)
        # Same address on later polls: nothing re-runs.
        self.env.tick(self.net.POLL_MS)
        self.assertEqual(len(ups), 2)
        # A driver without ip() never triggers it.
        del self.env.wifi.ip
        self.env.tick(self.net.POLL_MS)
        self.assertEqual(len(ups), 2)

    def test_fetch_busy_covers_ntp_and_ota_probe(self):
        self.assertFalse(self.net.fetch_busy())
        self._up()
        self.env.tick()                       # clock-sync worker started
        self.assertTrue(self.net.fetch_busy())
        self._sync_once()
        self.assertFalse(self.net.fetch_busy())
        ota = types.ModuleType("oreoOS.ota")
        ota.busy = True
        ota.background_busy = lambda: ota.busy
        saved = sys.modules.get("oreoOS.ota")
        sys.modules["oreoOS.ota"] = ota
        try:
            self.assertTrue(self.net.fetch_busy())
            ota.busy = False
            self.assertFalse(self.net.fetch_busy())
        finally:
            if saved is None:
                sys.modules.pop("oreoOS.ota", None)
            else:
                sys.modules["oreoOS.ota"] = saved

    def test_driver_without_link_seq_still_works(self):
        ups = self._count_link_ups()
        del self.env.wifi.link_seq
        self.env.wifi.connected = True
        self.env.tick()
        self.env.tick(self.net.POLL_MS)
        self.assertEqual(len(ups), 1)
        self.assertEqual(len(self.env.thread.started), 1)   # clock sync

    def test_sync_result_counts_attempts(self):
        self.assertEqual(self.net.sync_result(), (0, False, ""))
        self.env.tu.results = [(True, "synced"), (False, "ntp timeout")]
        self._up()
        self.env.tick()
        self.assertTrue(self.net.worker_busy())
        self._sync_once()
        self.assertFalse(self.net.worker_busy())
        self.assertEqual(self.net.sync_result(), (1, True, "synced"))
        self.assertTrue(self.net.request_sync())
        self.env.tick()
        self._sync_once()
        self.assertEqual(self.net.sync_result(), (2, False, "ntp timeout"))

    def test_busy_reply_is_not_an_attempt(self):
        self.env.tu.results = [(False, "busy")]
        self._up()
        self.env.tick()
        self._sync_once()
        self.assertEqual(self.net.sync_result()[0], 0)

    def test_request_sync_offline_and_while_running(self):
        self.assertFalse(self.net.request_sync())
        self._up()
        self.env.tick()                       # worker started
        self.assertTrue(self.net.request_sync())
        self.assertIsNone(self.net._ntp_at)   # the running one counts
        self.env.tick(10)
        self.assertEqual(self.env.thread.started[1:], [])
        self._sync_once()
        self.assertEqual(self.net.sync_result()[0], 1)

    def test_request_runs_on_worker_not_ui(self):
        self._up()
        self.env.tick()
        self._sync_once()
        self.assertTrue(self.net.request_sync())
        self.env.tick()
        self.assertEqual(len(self.env.thread.started), 1)
        self.assertEqual(self.env.tu.calls, 1)   # only the first, on the worker

    def test_short_text(self):
        st = self.net.short_text
        self.assertEqual(st("connected", 0), "")
        self.assertEqual(st("retrying", 12), "retry 12s")
        self.assertEqual(st("connecting", 0), "joining")
        self.assertEqual(st("off", 0), "off")
        self.assertEqual(st("offline", 0), "no link")
        for s in ("retrying", "connecting", "off", "offline"):
            self.assertLessEqual(len(st(s, 300)), 10)
        self.assertTrue(self.net.has_threads())


# ── C panel ──────────────────────────────────────────────────────────────

class FakeClock:
    def __init__(self):
        self.t = 0

    def ticks_ms(self):
        return self.t

    def ticks_diff(self, a, b):
        return a - b


class PanelTest(unittest.TestCase):
    def setUp(self):
        self.s = Stubs()
        self.net = self.s.add("oreoOS.netsvc", FakeNet())
        self.wifi = self.s.add("oreoWare.wifi", FakeWifi())
        self.np = _load("oreoOS/notif_panel.py", "oreoOS.notif_panel")
        self.clock = FakeClock()
        self.np.time = self.clock
        self.os = types.SimpleNamespace(
            display=None, _last_brightness=60,
            settings_get=lambda k, d=None: d)
        self.p = self.np.NotifPanel(self.os)

    def tearDown(self):
        self.s.close()

    def test_sync_is_requested_not_run(self):
        p = self.p
        p._sync_time()
        self.assertEqual(self.net.requests, 1)
        self.assertEqual(p._time_toast[1], "syncing…")
        p._sync_time()                        # already waiting: no second ask
        self.assertEqual(self.net.requests, 1)
        self.clock.t += 500
        self.assertFalse(p._poll_sync())
        self.net.result = (1, True, "synced")
        self.assertTrue(p._poll_sync())
        self.assertEqual(p._time_toast[1:], ("synced", "ok"))
        self.assertIsNone(p._sync_wait)

    def test_sync_failure_and_offline(self):
        p = self.p
        p._sync_time()
        self.net.result = (1, False, "ntp timeout")
        p.tick(0.01)
        self.assertEqual(p._time_toast[1:], ("ntp timeout", "err"))
        self.net.link = False
        p._sync_time()
        self.assertEqual(p._time_toast[1:], ("no wifi", "err"))
        self.assertIsNone(p._sync_wait)

    def test_sync_that_never_reports_gives_up(self):
        p = self.p
        p._sync_time()
        self.clock.t += self.np.SYNC_WAIT_MS + 1
        self.assertTrue(p._poll_sync())
        self.assertEqual(p._time_toast[1:], ("try again", "err"))

    def test_wifi_tile(self):
        f = self.np.wifi_tile_state
        self.assertEqual(f(self.net, self.wifi), (True, "HomeNet"))
        self.wifi.connected = False
        self.net.state = ("retrying", 42)
        self.assertEqual(f(self.net, self.wifi), (True, "retry 42s"))
        self.net.state = ("connecting", 0)
        self.assertEqual(f(self.net, self.wifi), (True, "joining"))
        self.wifi.radio = False
        self.assertEqual(f(self.net, self.wifi), (False, "off"))
        # Default lookups go through the stub modules.
        self.wifi.radio = True
        self.net.state = ("offline", 0)
        self.assertEqual(self.p._quick_states()[0], (True, "no link"))

    def test_panel_no_longer_calls_ntp_inline(self):
        src = (ROOT / "oreoOS/notif_panel.py").read_text()
        self.assertNotIn("sync_from_ntp", src)


# ── Settings ─────────────────────────────────────────────────────────────

class SettingsTest(unittest.TestCase):
    def setUp(self):
        self.s = Stubs()
        self.net = self.s.add("oreoOS.netsvc", FakeNet())
        self.wifi = self.s.add("oreoWare.wifi", FakeWifi())
        self.m = _load("apps/settings/src/app.py", "under_test")

    def tearDown(self):
        self.s.close()

    def test_sync_summary(self):
        f, n = self.m.sync_summary, self.net
        self.assertEqual(f(n, self.wifi), "tap A")
        self.wifi.connected = False
        self.assertEqual(f(n, self.wifi), "no wifi")
        n.tstatus = ("pending", "")
        self.assertEqual(f(n, self.wifi), "queued")
        n.tstatus = ("syncing", "")
        self.assertEqual(f(n, self.wifi), "syncing...")
        n.tstatus = ("synced", "synced")
        n.result = (1, True, "synced")
        self.assertEqual(f(n, self.wifi), "synced")
        n.result = (2, False, "ntp timeout")   # a later attempt failed
        self.assertEqual(f(n, self.wifi), "failed")
        n.tstatus = ("failed", "ntp timeout")
        self.assertEqual(f(n, self.wifi), "failed")

    def test_wifi_summary(self):
        f = self.m.wifi_summary
        self.assertEqual(f(self.wifi, self.net), "HomeNet")
        self.wifi.connected = False
        self.net.state = ("retrying", 5)
        self.assertEqual(f(self.wifi, self.net), "retry 5s")
        self.assertEqual(f(None, self.net), "—")

    def test_sync_row_requests_and_repaints_on_result(self):
        app = self.m.App()
        app._wifi, app._net = self.wifi, self.net
        app._live_ms, app._live_vals, app._sync_note = 0, None, ""
        app._dirty = False
        clock = FakeClock()
        fake_time = types.SimpleNamespace(ticks_ms=lambda: clock.t,
                                          ticks_diff=lambda a, b: a - b)
        saved = sys.modules["time"]
        sys.modules["time"] = fake_time
        try:
            clock.t = 1000
            app.update(0.016)
            self.assertTrue(app._dirty)
            app._dirty = False
            clock.t += 100
            app._sync_time()
            self.assertEqual(self.net.requests, 1)
            app._dirty = False
            self.net.tstatus = ("syncing", "")
            clock.t += 100
            app.update(0.016)                  # rate-limited
            self.assertFalse(app._dirty)
            clock.t += self.m.LIVE_MS
            app.update(0.016)
            self.assertTrue(app._dirty)
            self.assertEqual(app._sync_time_summary(), "syncing...")
            self.net.link = False
            app._sync_time()
            self.assertEqual(app._sync_time_summary(), "no wifi")
        finally:
            sys.modules["time"] = saved

    def test_settings_no_longer_calls_ntp_inline(self):
        src = (ROOT / "apps/settings/src/app.py").read_text()
        self.assertNotIn("sync_from_ntp", src)


# ── Home ─────────────────────────────────────────────────────────────────

class HomeLabelTest(unittest.TestCase):
    def test_link_label(self):
        s = Stubs()
        try:
            s.add("oreoOS.timeutil", _load("oreoOS/timeutil.py", "oreoOS.timeutil"))
            m = _load("oreoOS/home.py", "under_test")
            net = FakeNet()
            self.assertEqual(m.link_label(net), ("", "connected"))
            net.state = ("retrying", 120)
            self.assertEqual(m.link_label(net), ("retry 120s", "retrying"))
            net.state = ("off", 0)
            self.assertEqual(m.link_label(net), ("off", "off"))
            # The label fits between the clock and the icon cluster.
            self.assertLessEqual(m._LINK_X + m._LINK_CHARS * 8, 320 - 110)
        finally:
            s.close()


# ── OTA background probe ─────────────────────────────────────────────────

class OtaBackgroundTest(unittest.TestCase):
    def setUp(self):
        self.s = Stubs()
        self.net = self.s.add("oreoOS.netsvc", FakeNet())
        self.wifi = self.s.add("oreoWare.wifi", FakeWifi())
        self.s.add("oreoOS._http", types.ModuleType("oreoOS._http"))
        notif = types.ModuleType("oreoOS.notifications")
        notif.pushed = []
        notif.items = lambda: []
        notif.push = lambda kind, title, body, target=None: \
            notif.pushed.append((kind, body))
        self.notif = self.s.add("oreoOS.notifications", notif)
        self.ota = _load("oreoOS/ota.py", "oreoOS.ota")
        self.ota._bg_job = None
        self.gate = threading.Event()
        self.calls = []
        self.rel = {"version": "v9.0.0", "major": True,
                    "manifest_url": "https://x/manifest.json"}

        def check():
            self.calls.append(threading.current_thread())
            self.gate.wait(5)
            return self.rel
        self.ota.check = check
        self.settings = {}
        self.writers = set()
        main = self

        class OS:
            _boot_ts_s = None

            def settings_get(self, k, d=None):
                return main.settings.get(k, d)

            def settings_set(self, k, v):
                main.writers.add(threading.current_thread())
                main.settings[k] = v
        self.os = OS()

    def tearDown(self):
        self.gate.set()
        job = self.ota._bg_job
        if job is not None:
            for _ in range(500):
                if not job.busy():
                    break
                threading.Event().wait(0.002)
        self.s.close()

    def _drain(self, fg=None):
        for _ in range(1000):
            if self.ota.background_check(self.os, foreground=fg):
                return True
            if not self.ota.background_busy() and self.ota._bg_job is None:
                return False
            threading.Event().wait(0.002)
        self.fail("probe never finished")

    def test_probe_runs_off_the_ui_thread(self):
        self.assertFalse(self.ota.background_check(self.os))
        self.assertTrue(self.ota.background_busy())
        self.assertIn("ota_last_check_s", self.settings)
        self.assertNotIn("ota_status", self.settings)
        # More frames while the GET hangs: no second probe, no block.
        for _ in range(5):
            self.assertFalse(self.ota.background_check(self.os))
        self.gate.set()
        self.assertTrue(self._drain())
        self.assertEqual(len(self.calls), 1)
        self.assertIsNot(self.calls[0], threading.main_thread())
        self.assertEqual(self.writers, {threading.main_thread()})
        self.assertEqual(self.settings["ota_status"], "needs-confirm")
        self.assertEqual(self.settings["ota_pending_version"], "v9.0.0")
        self.assertEqual(self.notif.pushed, [("ota", "v9.0.0")])
        # Rate-limited afterwards.
        self.assertFalse(self.ota.background_check(self.os))
        self.assertFalse(self.ota.background_busy())

    def test_no_release_is_up_to_date(self):
        self.rel = None
        self.gate.set()
        self.ota.background_check(self.os)
        self.assertFalse(self._drain())
        self.assertEqual(self.settings["ota_status"], "up-to-date")

    def test_gates(self):
        self.gate.set()
        b = self.ota.background_check
        for fg in ("Updates", "App Store", "WiFi"):
            self.assertFalse(b(self.os, foreground=fg))
        self.net.busy = True
        self.assertFalse(b(self.os))
        self.net.busy = False
        self.net.threads = False
        self.assertFalse(b(self.os))
        self.net.threads = True
        self.wifi.connected = False
        self.assertFalse(b(self.os))
        self.wifi.connected = True
        self.wifi.metered = True
        self.assertFalse(b(self.os))
        self.wifi.metered = False
        self.settings["ota_bg_check"] = False
        self.assertFalse(b(self.os))
        self.assertEqual(self.calls, [])
        self.assertNotIn("ota_last_check_s", self.settings)

    def test_result_dropped_while_updates_is_open(self):
        # Probe started on Home; the user opens Updates before it lands.
        self.assertFalse(self.ota.background_check(self.os, foreground=None))
        self.assertTrue(self.ota.background_busy())
        self.settings["ota_status"] = "available"     # Updates' own check
        self.gate.set()
        for _ in range(1000):
            if not self.ota.background_busy():
                break
            threading.Event().wait(0.002)
        self.assertFalse(self.ota.background_check(self.os,
                                                   foreground="Updates"))
        self.assertIsNone(self.ota._bg_job)
        self.assertEqual(self.settings["ota_status"], "available")
        self.assertEqual(self.notif.pushed, [])


# ── Commits / Weather / App Store ────────────────────────────────────────

class AutoFetchTest(unittest.TestCase):
    def test_commits_gate(self):
        s = Stubs()
        try:
            gh = s.add("oreoOS.github", types.ModuleType("oreoOS.github"))
            gh.up = True
            gh.online = lambda: gh.up
            m = _load("apps/commits/src/app.py", "under_test")
            net = FakeNet()
            self.assertTrue(m.auto_fetch_ok(net))
            net.quiet = True
            self.assertFalse(m.auto_fetch_ok(net))
            net.quiet, net.threads = False, False
            self.assertFalse(m.auto_fetch_ok(net))
            net.threads = True
            net.busy = True                    # OTA probe / clock sync
            self.assertFalse(m.auto_fetch_ok(net))
            net.busy = False
            gh.up = False                      # join still running
            self.assertFalse(m.auto_fetch_ok(net))
        finally:
            s.close()

    def test_store_refresh_due(self):
        store = _load("oreoOS/store.py", "oreo_store_followups")
        net = FakeNet()
        store._refreshed_ms = None
        net.quiet = True
        self.assertFalse(store.refresh_due(net=net))
        net.quiet = False
        self.assertTrue(store.refresh_due(net=net))

    def test_store_fetch_then_apply(self):
        store = _load("oreoOS/store.py", "oreo_store_followups2")
        tmp = tempfile.mkdtemp()
        store.CACHE_PATH = os.path.join(tmp, "index.json")
        store._prune_icons = store._migrate_legacy = lambda: None
        store._exists = lambda p: False
        store._apps, store._featured = [], []
        index = json.loads((ROOT / "apps_market/index.json").read_text())
        body = json.dumps(index).encode()
        store.wifi_up = lambda: False
        self.assertEqual(store.fetch_index(), (None, "offline"))
        self.assertFalse(store.apply_index((None, "offline")))
        self.assertEqual(store.last_error(), "offline")
        store.wifi_up = lambda: True
        store._http_get = lambda url, **kw: body
        before = (store._apps, store._refreshed_ms)
        result = store.fetch_index()
        # The network half touched no module state.
        self.assertEqual((store._apps, store._refreshed_ms), before)
        self.assertTrue(store.apply_index(result))
        self.assertEqual(len(store._apps), len(index["apps"]))
        with open(store.CACHE_PATH, "rb") as f:
            self.assertEqual(f.read(), body)
        self.assertTrue(store.refresh())

    def test_store_refresh_waits_for_background_thread(self):
        store = _load("oreoOS/store.py", "oreo_store_followups3")
        net = FakeNet()
        store._refreshed_ms = None
        net.busy = True
        self.assertFalse(store.refresh_due(net=net))
        net.busy = False
        self.assertTrue(store.refresh_due(net=net))


class WeatherTest(unittest.TestCase):
    def setUp(self):
        self.s = Stubs()
        self.net = self.s.add("oreoOS.netsvc", FakeNet())
        self.wifi = self.s.add("oreoWare.wifi", FakeWifi())
        self.s.add("oreoOS._http", types.ModuleType("oreoOS._http"))
        sec = types.ModuleType("secrets")
        sec.WEATHER_LAT, sec.WEATHER_LON, sec.OWM_API_KEY = 1.0, 2.0, "k"
        self.saved_secrets = sys.modules.get("secrets")
        sys.modules["secrets"] = sec
        self.m = _load("apps_market/weather/src/app.py", "under_test")
        self.clock = FakeClock()
        self.clock.t = 10_000_000
        self.m.time = types.SimpleNamespace(
            ticks_ms=lambda: self.clock.t, ticks_diff=lambda a, b: a - b)
        self.m._last_data = self.m._last_ms = None
        self.m._job = None
        self.gate = threading.Event()
        self.fetches = 0

        def fetch(lat, lon, key):
            self.fetches += 1
            self.gate.wait(5)
            return {"temp": 30, "feels": 31, "hum": 50, "wind": 2.0,
                    "code": 800, "city": "Kolkata"}
        self.m._fetch_owm = fetch

    def tearDown(self):
        self.gate.set()
        if self.saved_secrets is None:
            sys.modules.pop("secrets", None)
        else:
            sys.modules["secrets"] = self.saved_secrets
        self.s.close()

    def test_parse(self):
        p = self.m.parse_owm({"main": {"temp": 29.6, "feels_like": 33.2,
                                       "humidity": 70},
                              "wind": {"speed": 3.4},
                              "weather": [{"id": 501}], "name": "Pune"})
        self.assertEqual(p, {"temp": 30, "feels": 33, "hum": 70, "wind": 3.4,
                             "code": 501, "city": "Pune"})

    def test_enter_does_not_fetch_and_quiet_defers(self):
        app = self.m.App()
        self.net.quiet = True
        app.on_enter(object())
        self.assertEqual(self.fetches, 0)
        app.update(0.016)
        self.assertEqual(self.fetches, 0)
        self.wifi.connected = False
        self.net.quiet = False
        app.update(0.016)
        self.assertFalse(app._job.busy())       # offline: waits
        self.wifi.connected = True
        app.update(0.016)                       # starts on the worker...
        self.assertTrue(app._job.busy())        # ...and returns at once
        self.gate.set()
        for _ in range(500):
            app.update(0.016)
            if app._data:
                break
            threading.Event().wait(0.002)
        self.assertEqual(app._data["city"], "Kolkata")
        self.assertEqual(self.fetches, 1)
        # Re-entry draws the last reading at once, no new fetch yet.
        app2 = self.m.App()
        app2.on_enter(object())
        app2.update(0.016)
        self.assertEqual(app2._data["city"], "Kolkata")
        self.assertEqual(self.fetches, 1)

    def _until(self, cond):
        for _ in range(1000):
            if cond():
                return
            threading.Event().wait(0.002)
        self.fail("timed out")

    def _wait(self, app, cond):
        for _ in range(1000):
            app.update(0.016)
            if cond():
                return
            threading.Event().wait(0.002)
        self.fail("fetch never landed")

    def test_reentry_reattaches_to_running_fetch(self):
        app = self.m.App()
        app.on_enter(object())
        app.update(0.016)
        self.assertTrue(app._job.busy())
        self._until(lambda: self.fetches == 1)
        app.on_exit()
        # Re-open at once, fetch still in flight: no second fetch.
        app2 = self.m.App()
        app2.on_enter(object())
        self.assertIs(app2._job, self.m._job)
        for _ in range(5):
            app2.update(0.016)
        self.assertEqual(self.fetches, 1)
        self.gate.set()
        self._wait(app2, lambda: app2._data is not None)
        self.assertEqual(app2._data["city"], "Kolkata")
        self.assertEqual(self.m._last_ms, self.clock.t)
        self.assertEqual(self.fetches, 1)

    def test_result_landing_while_closed_is_kept(self):
        app = self.m.App()
        app.on_enter(object())
        app.update(0.016)
        app.on_exit()
        self.gate.set()
        job = self.m._job
        for _ in range(1000):
            if job.state != self.s.pkg.cache.RUNNING:
                break
            threading.Event().wait(0.002)
        app2 = self.m.App()
        app2.on_enter(object())
        app2.update(0.016)
        self.assertEqual(app2._data["city"], "Kolkata")
        self.assertEqual(self.fetches, 1)

    def test_auto_fetch_waits_for_background_thread(self):
        app = self.m.App()
        self.net.busy = True                  # OTA probe running
        app.on_enter(object())
        app.update(0.016)
        self.assertEqual(self.fetches, 0)
        self.net.busy = False
        app.update(0.016)
        self.assertTrue(app._job.busy())
        self._until(lambda: self.fetches == 1)

    def test_no_urequests(self):
        src = (ROOT / "apps_market/weather/src/app.py").read_text()
        self.assertNotIn("urequests", src)


# ── Updates app: waits for a background probe before its own check ───────

class UpdatesWaitTest(unittest.TestCase):
    def test_wait_background(self):
        s = Stubs()
        try:
            m = _load("apps/updates/src/app.py", "under_test")
            clock = FakeClock()

            def sleep_ms(ms):
                clock.t += ms
                if clock.t >= 300:
                    net.busy = False           # the probe's GET finished
            m.time = types.SimpleNamespace(
                ticks_ms=clock.ticks_ms, ticks_diff=clock.ticks_diff,
                sleep_ms=sleep_ms)
            net = FakeNet()
            phases = []
            self.assertTrue(m.wait_background(phases.append, net=net))
            self.assertEqual(phases, [])       # nothing running: no wait
            net.busy = True
            self.assertTrue(m.wait_background(phases.append, net=net))
            self.assertGreaterEqual(clock.t, 300)
            self.assertEqual(set(phases), {"wait"})
            # A probe that never finishes is waited out, not forever.
            net.busy = True
            clock.t = -10 ** 9
            self.assertFalse(m.wait_background(None, limit_ms=200, net=net))
        finally:
            s.close()


# ── Commits app: the deferred automatic refresh ──────────────────────────

class CommitsAutoTest(unittest.TestCase):
    def setUp(self):
        self.s = Stubs()
        self.net = self.s.add("oreoOS.netsvc", FakeNet())
        gh = self.s.add("oreoOS.github", types.ModuleType("oreoOS.github"))
        gh.up = True
        gh.fetches = 0
        gh.GRAPH_TTL_S = 3600
        gh.online = lambda: gh.up
        # A configured owner: with no GITHUB_USER the app fetches nothing.
        gh.user = lambda name: name or "octocat"
        gh.cached_graph = lambda user: ([], None)
        gh.stale = lambda age, ttl: True
        self.gate = threading.Event()

        def fetch_graph(user, progress=None):
            gh.fetches += 1
            self.gate.wait(5)
            return None
        gh.fetch_graph = fetch_graph
        self.gh = gh
        self.m = _load("apps/commits/src/app.py", "under_test")

    def tearDown(self):
        self.gate.set()
        self.s.close()

    def test_offline_after_quiet_keeps_the_request(self):
        self.net.quiet = True
        app = self.m.App()
        app.on_enter(object())
        self.assertTrue(app._auto)
        # Quiet window over, but the boot join is still running.
        self.net.quiet = False
        self.gh.up = False
        app.update(0.016)
        self.assertTrue(app._auto)
        self.assertEqual(self.gh.fetches, 0)
        self.assertIsNone(app._note)          # an automatic try says nothing
        self.gh.up = True
        app.update(0.016)
        self.assertFalse(app._auto)
        self.assertTrue(app._job.busy())

    def test_press_during_quiet_cancels_the_auto_fetch(self):
        self.net.quiet = True
        app = self.m.App()
        app.on_enter(object())
        app.on_button_press(self.m.api.BTN_A)
        self.assertFalse(app._auto)
        self.gate.set()
        for _ in range(1000):
            app.update(0.016)
            if not app._job.busy():
                break
            threading.Event().wait(0.002)
        self.net.quiet = False
        for _ in range(5):
            app.update(0.016)
        self.assertEqual(self.gh.fetches, 1)


# ── App Store app: the worker refresh ────────────────────────────────────

class FakeStore(types.ModuleType):
    INSTALL, OPEN, UPDATE = "install", "open", "update"

    def __init__(self, net):
        super().__init__("oreoOS.store")
        self.net = net
        self.entry = {"id": "snake", "name": "Snake", "icon": "",
                      "version": "1", "size": 10, "files": []}
        self.apps = [self.entry]
        self.fresh = False
        self.up = True
        self.applied = []
        self.fetch_threads = []
        self.gate = threading.Event()
        self.installs = 0
        self.err = ""

    # catalogue
    def forget_installed(self): pass
    def catalogue(self): return list(self.apps), []
    def find(self, app_id):
        return next((e for e in self.apps if e["id"] == app_id), None)
    def list_installed(self): return []
    def take_pending(self): return None
    def wifi_up(self): return self.up
    def needs_refresh(self): return not self.fresh

    def refresh_due(self):
        if not self.needs_refresh():
            return False
        return not self.net.in_quiet() and not self.net.fetch_busy()

    def fetch_index(self):
        self.fetch_threads.append(threading.current_thread())
        self.gate.wait(5)
        return b"{}", ([dict(self.entry), {"id": "pong", "name": "Pong",
                                           "icon": "", "version": "1",
                                           "size": 5, "files": []}], [])

    def apply_index(self, result):
        self.applied.append(threading.current_thread())
        body, parsed = result
        self.apps = parsed[0]
        self.fresh = True
        return True

    def last_error(self): return self.err
    # detail page
    def is_default(self, app_id): return False
    def is_installed(self, app_id): return False
    def app_state(self, e): return self.INSTALL
    def local_icon(self, k, icon): return None
    def total_size(self, e): return 10

    def install(self, app_id, cb):
        self.installs += 1
        return True, ""


class StoreAppTest(unittest.TestCase):
    def setUp(self):
        self.s = Stubs()
        self.net = self.s.add("oreoOS.netsvc", FakeNet())
        self.store = self.s.add("oreoOS.store", FakeStore(self.net))
        self.s.add("oreoOS._http", types.ModuleType("oreoOS._http"))
        pkg = types.ModuleType("storeapp")
        pkg.__path__ = [str(ROOT / "apps/store/src")]
        self.saved_pkg = {k: sys.modules.get(k)
                          for k in ("storeapp", "storeapp.app",
                                    "storeapp.render")}
        sys.modules["storeapp"] = pkg
        self.s.pkg.App = type("App", (), {"on_enter": lambda self, os: None})
        self.m = _load("apps/store/src/app.py", "storeapp.app")
        self.m._inflight = None
        self.os = types.SimpleNamespace(display=None)

    def tearDown(self):
        self.store.gate.set()
        for k, v in self.saved_pkg.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
        self.s.close()

    def _frames(self, app, n=3):
        for _ in range(n):
            app.update(0.016)

    def _finish(self, app):
        self.store.gate.set()
        for _ in range(1000):
            app.update(0.016)
            if app._job is None:
                return
            threading.Event().wait(0.002)
        self.fail("refresh never landed")

    def test_quiet_window_then_worker_then_apply(self):
        self.net.quiet = True
        app = self.m.App()
        app.on_enter(self.os)
        self.assertTrue(app._auto)
        self._frames(app, 5)
        self.assertIsNone(app._job)           # no fetch in the quiet window
        self.assertEqual(self.store.fetch_threads, [])
        self.net.quiet = False
        self.net.busy = True                  # OTA probe on its thread
        self._frames(app, 3)
        self.assertIsNone(app._job)
        self.net.busy = False
        self._frames(app, 2)
        self.assertIsNotNone(app._job)        # started, update() returned
        self.assertEqual(app._status, "UPDATING")
        # Install is refused while the refresh runs.
        app._open_detail(self.store.entry)
        app.on_button_press(self.m.api.BTN_A)
        self.assertIn("try again", app._note)
        self.assertEqual(self.store.installs, 0)
        app._back()
        self._finish(app)
        self.assertEqual(len(self.store.fetch_threads), 1)
        self.assertIsNot(self.store.fetch_threads[0], threading.main_thread())
        self.assertEqual(self.store.applied, [threading.main_thread()])
        self.assertEqual([e["id"] for e in app._apps], ["snake", "pong"])
        self.assertEqual(app._status, "")
        self.assertIsNone(self.m._inflight)
        # Fresh now: later frames start nothing.
        self._frames(app, 5)
        self.assertEqual(len(self.store.fetch_threads), 1)

    def test_reentry_reattaches_to_running_refresh(self):
        app = self.m.App()
        app.on_enter(self.os)
        self._frames(app, 3)
        job = app._job
        self.assertIsNotNone(job)
        # Leave and come straight back while the fetch is in flight.
        app2 = self.m.App()
        app2.on_enter(self.os)
        self.assertIs(app2._job, job)
        self.assertFalse(app2._want_refresh)
        self.assertFalse(app2._auto)
        self._frames(app2, 5)
        self._finish(app2)
        self.assertEqual(len(self.store.fetch_threads), 1)
        self.assertEqual(len(self.store.applied), 1)
        self.assertEqual(len(app2._apps), 2)


if __name__ == "__main__":
    unittest.main()
