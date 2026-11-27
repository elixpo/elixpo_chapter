"""Host tests for the badge dev loop: crash tracebacks on the crash
screen and in /crash.log, unloading an app's modules when it exits, apps
loaded from an `falera dev` mount (/remote/apps), the App Store's icon
worker and the header Wi-Fi bars.

Modules load from their files behind a stub `oreoOS` package, so no
hardware imports are needed.

    python3 -m unittest tests.test_dev_loop -v
"""

import contextlib
import importlib.util
import io
import os
import shutil
import sys
import tempfile
import threading
import types
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent


def _load(rel, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def _quiet():
    """Capture stdout (not mock print: CPython's traceback uses it)."""
    return contextlib.redirect_stdout(io.StringIO())


class _Stubbed(unittest.TestCase):
    """A stub oreoOS package with the real api/config/crashlog."""

    KEYS = ("oreoOS", "oreoOS.api", "oreoOS.config", "oreoOS.crashlog",
            "oreoOS.pixelfont", "oreoOS.theme", "oreoOS.netsvc",
            "oreoOS.launcher_dev", "oreoOS.widgets_dev", "oreoWare",
            "oreoWare.wifi")

    def setUp(self):
        self.saved = {k: sys.modules.get(k) for k in self.KEYS}
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        pkg = types.ModuleType("oreoOS")
        pkg.__path__ = [str(ROOT / "oreoOS")]
        sys.modules["oreoOS"] = pkg
        self.pkg = pkg
        pkg.api = _load("oreoOS/api.py", "oreoOS.api")
        pkg.config = _load("oreoOS/config.py", "oreoOS.config")
        pkg.crashlog = _load("oreoOS/crashlog.py", "oreoOS.crashlog")
        pkg.crashlog.PATH = self.tmp + "/crash.log"
        pf = types.ModuleType("oreoOS.pixelfont")
        pf.load = lambda name: None
        pkg.pixelfont = sys.modules["oreoOS.pixelfont"] = pf

    def tearDown(self):
        for k, v in self.saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v


# ── crashlog ───────────────────────────────────────────────────────────

class CrashlogTest(_Stubbed):
    def _err(self):
        try:
            {}["k"]
        except KeyError as e:
            return e

    def test_record_saves_and_finds_the_frame(self):
        cl = self.pkg.crashlog
        with _quiet():
            info = cl.record(self._err(), "app demo")
        self.assertIn("test_dev_loop.py:", info["where"])
        self.assertEqual(info["message"], "KeyError: 'k'")
        log = cl.read()
        self.assertIn("app demo", log)
        self.assertIn("KeyError", log)

    def test_save_false_prints_only(self):
        cl = self.pkg.crashlog
        with _quiet() as out:
            info = cl.record(self._err(), "frame demo", save=False)
        self.assertIn("KeyError", out.getvalue())
        self.assertIn("KeyError", info["traceback"])
        self.assertFalse(os.path.exists(cl.PATH))

    def test_formatting_failure_never_raises(self):
        cl = self.pkg.crashlog
        with mock.patch.object(cl, "format_exception",
                               side_effect=MemoryError()), \
                _quiet():
            info = cl.record(ValueError("x"), "app demo")
        self.assertEqual(info["message"], "ValueError: x")
        self.assertEqual(info["where"], "")

    def test_summary_without_message(self):
        self.assertEqual(self.pkg.crashlog.summary(MemoryError()),
                         "MemoryError")


# ── launcher ───────────────────────────────────────────────────────────

class FakeDisplay:
    def __init__(self):
        self.texts = []

    def clear(self, c=0): pass
    def rect(self, *a, **k): pass
    def present(self): pass

    def text(self, s, x, y, c=0, scale=1):
        self.texts.append(s)


class FakeButtons:
    def update(self): pass
    def just_pressed(self, b): return True


def _app_tree(root, name, body="X = 1\n", app_name=None):
    d = Path(root) / name
    (d / "src").mkdir(parents=True)
    (d / "__init__.py").write_text("")
    (d / "src" / "__init__.py").write_text("")
    (d / "src" / "app.py").write_text(
        "class App:\n    name = %r\n%s" % (app_name or name,
                                         "".join("    " + l + "\n"
                                                 for l in body.splitlines())))
    (d / "main.py").write_text("from .src.app import App\n")
    (d / "manifest.json").write_text(
        '{"name": "%s", "type": "app", "author": "me"}' % (app_name or name))
    return d


class LauncherTest(_Stubbed):
    def setUp(self):
        super().setUp()
        self.l = _load("oreoOS/launcher.py", "oreoOS.launcher_dev")
        self.apps = self.tmp + "/apps"
        self.remote = self.tmp + "/remote/apps"
        os.makedirs(self.apps)
        Path(self.apps, "__init__.py").write_text("")
        self.l.APPS_DIR = self.apps
        self.l.REMOTE_APPS = self.remote
        # A private `apps` package pointing at the temp folder; the patch
        # restores sys.modules (and drops anything imported) afterwards.
        self.mods = mock.patch.dict(sys.modules)
        self.mods.start()
        self.addCleanup(self.mods.stop)
        for k in [k for k in sys.modules if k == "apps" or
                  k.startswith("apps.")]:
            del sys.modules[k]
        apps_pkg = types.ModuleType("apps")
        apps_pkg.__path__ = [self.apps]
        sys.modules["apps"] = apps_pkg
        self.apps_pkg = apps_pkg

    # unloading

    def test_unload_drops_the_app_and_its_submodules_only(self):
        fake = types.ModuleType("x")
        for k in ("apps.demo", "apps.demo.main", "apps.demo.src.app",
                  "apps.demo2.main", "apps.launcher.main", "oreoOS.store_x"):
            sys.modules[k] = fake
        self.apps_pkg.demo = fake
        self.assertEqual(self.l.unload_app("demo"), 3)
        self.assertNotIn("apps.demo.main", sys.modules)
        self.assertNotIn("apps.demo.src.app", sys.modules)
        self.assertIn("apps.demo2.main", sys.modules)
        self.assertIn("apps.launcher.main", sys.modules)
        self.assertIn("oreoOS.store_x", sys.modules)
        self.assertFalse(hasattr(self.apps_pkg, "demo"))
        for bad in ("", "..", "a.b", "a/b", None):
            self.assertEqual(self.l.unload_app(bad), 0)

    def test_release_respects_resident_and_keep_loaded(self):
        fake = types.ModuleType("x")
        for k in ("apps.launcher.main", "apps.keep.main", "apps.dyn.main",
                  "apps.plain.main", "apps.broken.main"):
            sys.modules[k] = fake

        class Keep:
            KEEP_LOADED = True

        class Dyn:
            busy = True

            def keep_loaded(self):
                return self.busy

        class Broken:
            def keep_loaded(self):
                raise RuntimeError("x")

        self.assertEqual(self.l.release_app("launcher", object()), 0)
        self.assertEqual(self.l.release_app("keep", Keep()), 0)
        dyn = Dyn()
        self.assertEqual(self.l.release_app("dyn", dyn), 0)
        dyn.busy = False
        self.assertEqual(self.l.release_app("dyn", dyn), 1)
        self.assertEqual(self.l.release_app("broken", Broken()), 0)
        self.assertEqual(self.l.release_app("plain", object()), 1)
        self.assertEqual(self.l.release_app("plain", None), 0)  # gone already

    def test_store_update_runs_on_the_next_launch(self):
        d = _app_tree(self.apps, "demo", "def v(self):\n    return 1")
        app = self.l.load_app("demo")
        self.assertEqual(app.v(), 1)
        self.assertEqual(app.author, "me")
        # A Store update (or a dev-mount edit) replaces the file while
        # FaleraOS runs. (`falera push` restarts FaleraOS, so it never needs
        # this.)
        (d / "src" / "app.py").write_text(
            "class App:\n    name = 'demo'\n\n    def v(self):\n"
            "        return 2   # pushed\n")
        # Still loaded: the old code (what the badge did before).
        self.assertEqual(self.l.load_app("demo").v(), 1)
        self.l.release_app("demo", app)
        self.assertEqual(self.l.load_app("demo").v(), 2)

    def test_stale_submodules_are_dropped_before_a_fresh_load(self):
        _app_tree(self.apps, "demo")
        sys.modules["apps.demo.src.app"] = types.ModuleType("stale")
        app = self.l.load_app("demo")
        self.assertEqual(app.name, "demo")

    # dev mount

    def test_no_mount_lists_and_loads_from_apps(self):
        _app_tree(self.apps, "demo")
        self.assertEqual([a["dir"] for a in self.l.list_apps()], ["demo"])
        self.assertNotIn("dev", self.l.list_apps()[0])
        self.assertEqual(self.l.app_root("demo"), self.apps)
        self.assertIsNone(self.l._remote_root())

    def test_mounted_app_wins_and_new_ones_are_listed(self):
        _app_tree(self.apps, "demo", app_name="Flash Demo")
        _app_tree(self.apps, "other")
        os.makedirs(self.remote)
        _app_tree(self.remote, "demo", app_name="Dev Demo")
        _app_tree(self.remote, "fresh")
        half = Path(self.remote, "half")          # no main.py: ignored
        half.mkdir()
        (half / "manifest.json").write_text('{"name": "Half"}')
        apps = {a["dir"]: a for a in self.l.list_apps()}
        self.assertEqual(sorted(apps), ["demo", "fresh", "other"])
        self.assertEqual(apps["demo"]["name"], "Dev Demo")
        self.assertTrue(apps["demo"]["dev"])
        self.assertNotIn("dev", apps["other"])
        with _quiet():
            app = self.l.load_app("demo")
        self.assertEqual(app.name, "Dev Demo")
        mod = sys.modules["apps.demo.src.app"]
        self.assertTrue(mod.__file__.startswith(self.remote))
        # The apps package got its own path back: others load from flash.
        self.assertEqual(self.apps_pkg.__path__, [self.apps])
        self.assertEqual(self.l.load_app("other").name, "other")
        self.assertTrue(sys.modules["apps.other.src.app"].__file__
                        .startswith(self.apps))

    def test_failed_remote_import_restores_the_package_path(self):
        os.makedirs(self.remote)
        d = _app_tree(self.remote, "bad")
        (d / "src" / "app.py").write_text("def broken(:\n")
        with self.assertRaises(SyntaxError):
            self.l.load_app("bad")
        self.assertEqual(self.apps_pkg.__path__, [self.apps])
        self.assertEqual(self.l.release_app("bad", None) >= 0, True)
        self.assertFalse([k for k in sys.modules
                          if k.startswith("apps.bad.")])

    def test_str_package_path_is_used_and_restored(self):
        # MicroPython keeps a package's __path__ as one str; the remote
        # import must set a str and put the old str back, even on failure.
        os.makedirs(self.remote)
        _app_tree(self.remote, "demo", app_name="Dev Demo")
        bad = _app_tree(self.remote, "bad")
        (bad / "src" / "app.py").write_text("def broken(:\n")
        seen = []
        real = __import__

        def spy(name, *a, **k):
            if name.startswith("apps."):
                seen.append(sys.modules["apps"].__path__)
                # CPython needs a list to search; hand it one for the
                # import itself, then put the str back as MicroPython has.
                pkg = sys.modules["apps"]
                p = pkg.__path__
                pkg.__path__ = [p] if isinstance(p, str) else p
                try:
                    return real(name, *a, **k)
                finally:
                    pkg.__path__ = p
            return real(name, *a, **k)

        self.apps_pkg.__path__ = self.apps            # a str, as on the badge
        with mock.patch("builtins.__import__", spy), _quiet():
            app = self.l.load_app("demo")
            self.assertEqual(app.name, "Dev Demo")
            self.assertEqual(seen[-1], self.remote)
            self.assertIsInstance(seen[-1], str)
            self.assertEqual(self.apps_pkg.__path__, self.apps)
            with self.assertRaises(SyntaxError):
                self.l.load_app("bad")
        self.assertEqual(self.apps_pkg.__path__, self.apps)

    def test_package_without_path_gets_none_back(self):
        os.makedirs(self.remote)
        _app_tree(self.remote, "demo")
        del self.apps_pkg.__path__
        with mock.patch("builtins.__import__",
                        side_effect=ImportError("x")):
            with self.assertRaises(ImportError):
                self.l._import_app("apps.demo.main", self.remote)
        self.assertFalse(hasattr(self.apps_pkg, "__path__"))

    # frame errors

    def test_full_traceback_once_per_run(self):
        calls = []
        with mock.patch.object(self.l, "_log_crash",
                               side_effect=lambda *a, **k: calls.append(k)), \
                _quiet() as out:
            printed = False
            # Fails every other frame: frame_errs resets, the flag does not.
            for _ in range(4):
                printed = self.l._frame_error(types.SimpleNamespace(
                    name="flaky"), ValueError("v"), printed)
        self.assertEqual(calls, [{"save": False}])
        self.assertTrue(printed)
        self.assertEqual(out.getvalue().count("frame error in flaky"), 3)

    # crash screen

    def test_crash_lines_keep_the_file_line(self):
        lines = self.l.crash_lines(
            {"message": "ZeroDivisionError: divide by zero",
             "where": "apps/racer/src/a_really_long_module_name_here.py:212"},
            36)
        self.assertEqual(lines[0], "ZeroDivisionError: divide by zero")
        self.assertTrue(lines[-1].endswith(".py:212"))
        self.assertLessEqual(len(lines[-1]), 36)
        self.assertEqual(self.l.crash_lines({"message": "", "where": ""}, 36),
                         ["(no message)"])

    def test_show_crash_logs_and_draws_the_frame(self):
        os_obj = types.SimpleNamespace(display=FakeDisplay(),
                                       buttons=FakeButtons())
        try:
            1 / 0
        except ZeroDivisionError as e:
            err = e
        with _quiet():
            self.l.show_crash(os_obj, "racer", err)
        drawn = os_obj.display.texts
        self.assertTrue(any("ZeroDivisionError" in t for t in drawn))
        self.assertTrue(any("test_dev_loop.py:" in t for t in drawn))
        self.assertIn("app racer", self.pkg.crashlog.read())

    def test_logging_failure_cannot_crash_the_launcher(self):
        self.pkg.crashlog.record = mock.Mock(side_effect=RuntimeError("io"))
        with _quiet():
            info = self.l._log_crash(ValueError("v"), "app x")
        self.assertEqual(info["message"], "v")
        os_obj = types.SimpleNamespace(display=FakeDisplay(),
                                       buttons=FakeButtons())
        with _quiet():
            self.l.show_crash(os_obj, "x", ValueError("v"))
        self.assertIn("v", os_obj.display.texts)


# ── header Wi-Fi bars ──────────────────────────────────────────────────

class WifiBarsTest(_Stubbed):
    def setUp(self):
        super().setUp()
        theme = types.ModuleType("oreoOS.theme")
        for k in ("STATUS_BG", "PRIMARY", "MUTED", "GOLD", "DOCK_BG",
                  "TEXT_BRIGHT", "CARD"):
            setattr(theme, k, 7)
        self.pkg.theme = sys.modules["oreoOS.theme"] = theme
        self.w = _load("oreoOS/widgets.py", "oreoOS.widgets_dev")

    def test_states(self):
        bars = self.w.wifi_bars
        self.assertEqual(bars({"state": "connected", "rssi": -50}), (4, "on"))
        self.assertEqual(bars({"state": "connected", "rssi": -80}), (1, "on"))
        self.assertEqual(bars({"state": "connected", "rssi": None}), (2, "on"))
        self.assertEqual(bars({"state": "retrying"}), (1, "dim"))
        self.assertEqual(bars({"state": "off"}), (0, "off"))
        self.assertEqual(bars({"state": "offline"}), (0, "off"))
        step = self.w.CONNECTING_STEP_MS
        seen = [bars({"state": "connecting"}, i * step)[0] for i in range(5)]
        self.assertEqual(seen, [1, 2, 3, 4, 1])
        self.assertEqual(bars({"state": "connecting"})[1], "dim")
        # Old snapshots without a state still work.
        self.assertEqual(bars({"connected": True, "rssi": -60}), (3, "on"))
        self.assertEqual(bars({"connected": False}), (0, "off"))

    def test_poll_reads_netsvc_state(self):
        wifi = types.ModuleType("oreoWare.wifi")
        wifi.is_connected = lambda: False
        wifi.rssi = lambda: -40
        wifi.is_metered = lambda: False
        ow = types.ModuleType("oreoWare")
        ow.__path__ = []
        ow.wifi = wifi
        sys.modules["oreoWare"] = ow
        sys.modules["oreoWare.wifi"] = wifi
        net = types.ModuleType("oreoOS.netsvc")
        net.status = lambda: ("retrying", 12)
        self.pkg.netsvc = sys.modules["oreoOS.netsvc"] = net
        self.w._time = None
        snap = self.w._poll_wifi()
        self.assertEqual(snap["state"], "retrying")
        self.assertFalse(snap["connected"])
        net.status = lambda: ("connected", 0)
        snap = self.w._poll_wifi()
        self.assertTrue(snap["connected"])
        self.assertEqual(snap["rssi"], -40)
        # No netsvc: falls back to the driver.
        del self.pkg.netsvc
        sys.modules["oreoOS.netsvc"] = None
        wifi.is_connected = lambda: True
        self.assertEqual(self.w._poll_wifi()["state"], "connected")

    def test_missing_netsvc_is_not_imported_again(self):
        # netsvc failed to import at boot: the header reads the driver and
        # never tries a fresh import of oreoOS.netsvc on its polls.
        wifi = types.ModuleType("oreoWare.wifi")
        wifi.is_connected = lambda: True
        wifi.rssi = lambda: -40
        wifi.is_metered = lambda: False
        ow = types.ModuleType("oreoWare")
        ow.__path__ = []
        ow.wifi = wifi
        sys.modules["oreoWare"] = ow
        sys.modules["oreoWare.wifi"] = wifi
        sys.modules.pop("oreoOS.netsvc", None)
        if hasattr(self.pkg, "netsvc"):
            del self.pkg.netsvc
        real = __import__
        tried = []

        def spy(name, globals=None, locals=None, fromlist=(), level=0):
            if name == "oreoOS.netsvc" or (
                    name == "oreoOS" and "netsvc" in (fromlist or ())):
                tried.append(name)
            return real(name, globals, locals, fromlist, level)

        self.w._time = None
        with mock.patch("builtins.__import__", spy):
            self.assertEqual(self.w._link_state(wifi), "connected")
            self.assertEqual(self.w._poll_wifi()["state"], "connected")
        self.assertEqual(tried, [])


# ── store: icon halves ─────────────────────────────────────────────────

class StoreIconTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.store = _load("oreoOS/store.py", "oreo_store_dev_loop")
        self.store.ICONS_DIR = self.tmp + "/icons"

    def test_body_then_save(self):
        st = self.store
        good = b"W = 2\nH = 1\nDATA = (1, 2)\n"
        entry = {"id": "snake", "path": "apps_market/snake", "icon": "i.png"}
        with mock.patch.object(st, "wifi_up", return_value=True), \
                mock.patch.object(st, "_http_get", return_value=good) as g:
            body = st.fetch_icon_body(entry)
        self.assertEqual(body, good)
        self.assertIn("assets/optimized/i.py", g.call_args[0][0])
        self.assertFalse(os.path.exists(st.ICONS_DIR))   # no file yet
        self.assertTrue(st.save_icon("snake", body))
        self.assertTrue(os.path.isfile(st.ICONS_DIR + "/snake.py"))
        self.assertFalse(st.save_icon("../x", body))
        self.assertFalse(st.save_icon("snake", b"junk"))
        with mock.patch.object(st, "wifi_up", return_value=False):
            self.assertIsNone(st.fetch_icon_body(entry))

    def test_icon_gate(self):
        net = types.SimpleNamespace(in_quiet=lambda: False,
                                    fetch_busy=lambda: False)
        self.assertTrue(self.store.icon_fetch_ok(net))
        net.fetch_busy = lambda: True
        self.assertFalse(self.store.icon_fetch_ok(net))
        net.in_quiet = lambda: True
        net.fetch_busy = lambda: False
        self.assertFalse(self.store.icon_fetch_ok(net))


# ── App Store app: icon worker ─────────────────────────────────────────

class _FakeStore(types.ModuleType):
    INSTALL, OPEN, UPDATE = "install", "open", "update"

    def __init__(self):
        super().__init__("oreoOS.store")
        self.apps = [{"id": "snake", "name": "Snake", "icon": "s.png",
                      "tagline": "", "category": "Games", "version": "1",
                      "size": 10, "files": []},
                     {"id": "pong", "name": "Pong", "icon": "p.png",
                      "tagline": "", "category": "Games", "version": "1",
                      "size": 10, "files": []}]
        self.cached = set()
        self.ok = True
        self.gate = threading.Event()
        self.fetch_threads = []
        self.saved = []
        self.installs = 0

    def forget_installed(self): pass
    def catalogue(self): return list(self.apps), []
    def find(self, app_id):
        return next((e for e in self.apps if e["id"] == app_id), None)
    def list_installed(self): return []
    def take_pending(self): return None
    def wifi_up(self): return True
    def needs_refresh(self): return False
    def refresh_due(self): return False
    def last_error(self): return ""
    def is_default(self, app_id): return False
    def is_installed(self, app_id): return False
    def app_state(self, e): return self.INSTALL
    def total_size(self, e): return 10
    def icon_fetch_ok(self): return self.ok

    def local_icon(self, k, icon):
        return (b"\0\0", 1, 1) if k in self.cached else None

    def fetch_icon_body(self, e):
        self.fetch_threads.append(threading.current_thread())
        self.gate.wait(5)
        return b"icon:" + e["id"].encode()

    def save_icon(self, app_id, body):
        self.saved.append((app_id, body, threading.current_thread()))
        self.cached.add(app_id)
        return True

    def install(self, app_id, cb):
        self.installs += 1
        return True, ""


class StoreIconWorkerTest(unittest.TestCase):
    def setUp(self):
        self.saved_mods = {k: sys.modules.get(k) for k in
                           ("oreoOS", "oreoOS.api", "oreoOS.store",
                            "oreoOS.cache", "oreoOS._http", "oreoOS.theme",
                            "storeapp", "storeapp.app", "storeapp.render")}
        pkg = types.ModuleType("oreoOS")
        pkg.__path__ = [str(ROOT / "oreoOS")]
        sys.modules["oreoOS"] = pkg
        pkg.api = _load("oreoOS/api.py", "oreoOS.api")
        pkg.cache = _load("oreoOS/cache.py", "oreoOS.cache")
        pkg._http = sys.modules["oreoOS._http"] = types.ModuleType("h")
        pkg.App = type("App", (), {"on_enter": lambda self, os: None})
        self.store = pkg.store = sys.modules["oreoOS.store"] = _FakeStore()
        render = types.ModuleType("storeapp.render")
        render.TOP, render.BOTTOM, render.GAP = 30, 220, 2
        render.FEAT_H, render.ROW_H = 80, 44
        sp = types.ModuleType("storeapp")
        sp.__path__ = [str(ROOT / "apps/store/src")]
        sp.render = render
        sys.modules["storeapp"] = sp
        sys.modules["storeapp.render"] = render
        self.m = _load("apps/store/src/app.py", "storeapp.app")
        self.m._inflight = None
        self.m._icon_job = None
        self.os = types.SimpleNamespace(display=None)

    def tearDown(self):
        self.store.gate.set()
        job = self.m._icon_job
        if job is not None:
            for _ in range(1000):
                if not job[0].busy():
                    break
                threading.Event().wait(0.002)
        for k, v in self.saved_mods.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v

    def _app(self):
        app = self.m.App()
        app.on_enter(self.os)
        for i, _y, _h in app._layout():
            app._icon(app._discover_entry(i)[1])     # what draw() does
        app._paint = None
        return app

    def _until(self, app, cond):
        for _ in range(2000):
            app.update(0.016)
            if cond():
                return
            threading.Event().wait(0.002)
        self.fail("condition never met")

    def test_icons_download_on_a_worker_one_at_a_time(self):
        app = self._app()
        self.assertEqual([e["id"] for e in app._queue], ["snake", "pong"])
        self.assertIsNone(app._icon(self.store.apps[0]))   # letter tile
        for _ in range(3):
            app.update(0.016)                 # two warm-up frames, then start
        self.assertIsNotNone(self.m._icon_job)
        self.assertTrue(app.keep_loaded())
        self._until(app, lambda: self.store.fetch_threads)
        for _ in range(5):
            app.update(0.016)                 # UI keeps running meanwhile
        self.assertEqual(len(self.store.fetch_threads), 1)
        self.assertIsNot(self.store.fetch_threads[0], threading.main_thread())
        self.store.gate.set()
        self._until(app, lambda: len(self.store.saved) == 2)
        self.assertEqual([s[0] for s in self.store.saved], ["snake", "pong"])
        for _app_id, _body, th in self.store.saved:
            self.assertIs(th, threading.main_thread())  # file write on UI
        self.assertEqual(app._paint, "rows")             # only those rows
        self.assertIsNotNone(app._icon(self.store.apps[0]))
        self._until(app, lambda: self.m._icon_job is None)
        self.assertFalse(app.keep_loaded())

    def test_waits_while_another_fetch_runs(self):
        self.store.ok = False                 # netsvc.fetch_busy()
        app = self._app()
        for _ in range(6):
            app.update(0.016)
        self.assertIsNone(self.m._icon_job)
        self.store.ok = True
        app.update(0.016)
        self.assertIsNotNone(self.m._icon_job)

    def test_install_waits_for_the_icon_download(self):
        app = self._app()
        for _ in range(3):
            app.update(0.016)
        self.assertIsNotNone(self.m._icon_job)
        app._install = mock.Mock()
        app._open_detail(self.store.apps[1])
        app.on_button_press(self.m.api.BTN_A)
        self.assertTrue(app._want_install)
        app.update(0.016)
        app._install.assert_not_called()      # icon still downloading
        self.store.gate.set()
        self._until(app, lambda: app._install.called)
        self.assertEqual(app._install.call_count, 1)

    def test_reentry_collects_the_running_download(self):
        app = self._app()
        for _ in range(3):
            app.update(0.016)
        job = self.m._icon_job
        app2 = self._app()
        self.store.gate.set()
        self._until(app2, lambda: self.store.saved)
        self.assertEqual(len(self.store.fetch_threads), 1)
        self.assertIsNot(self.m._icon_job, job)


if __name__ == "__main__":
    unittest.main()
