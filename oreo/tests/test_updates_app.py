"""Host tests for the Updates app (apps/updates): every state, its buttons,
and that each screen fits the 320x240 panel.

The app runs against stub oreoOS modules: a fake ota (check / peek /
download results chosen per test), a cache.Refresh that runs its job on the
next poll() (as without threads), and a display that records text and fails
on anything drawn off screen.

    python3 -m unittest tests.test_updates_app -v
"""

import importlib.util
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW, SH = 320, 240


class Display:
    def __init__(self, test):
        self.test = test
        self.texts = []
        self.boxes = []

    def clear(self, color):
        self.texts = []
        self.boxes = []

    def rect(self, x, y, w, h, color, fill=False):
        self.test.assertGreaterEqual(x, 0)
        self.test.assertGreaterEqual(y, 0)
        self.test.assertLessEqual(x + w, SW)
        self.test.assertLessEqual(y + h, SH)

    def text(self, s, x, y, color, scale=1):
        self.test.assertGreaterEqual(x, 0, s)
        self.test.assertLessEqual(x + len(s) * 8 * scale, SW, s)
        self.test.assertGreaterEqual(y, 28, s)            # below the header
        self.test.assertLessEqual(y + 8 * scale, SH - 16, s)   # above the hint
        box = (x, y, x + len(s) * 8 * scale, y + 8 * scale)
        for other, ob in self.boxes:           # no text drawn over text
            overlap = (box[0] < ob[2] and ob[0] < box[2]
                       and box[1] < ob[3] and ob[1] < box[3])
            self.test.assertFalse(overlap, "%r overlaps %r" % (s, other))
        self.boxes.append((s, box))
        self.texts.append(s)

    def joined(self):
        return " | ".join(self.texts)


class FakeOS:
    def __init__(self, display):
        self.display = display
        self.settings = {}
        self.quit_called = False

    def settings_get(self, k, default=None):
        return self.settings.get(k, default)

    def settings_set(self, k, v):
        self.settings[k] = v

    def quit(self):
        self.quit_called = True


class Refresh:
    """cache.Refresh without threads: the job runs on the next poll()."""

    def __init__(self, fn):
        self.fn = fn
        self.result = None
        self.pending = False

    def start(self, use_thread=True):
        self.pending = True
        return True

    def busy(self):
        return self.pending

    def poll(self):
        if not self.pending:
            return False
        self.pending = False
        self.result = self.fn()
        return True


class FakeOta:
    def __init__(self):
        self.latest = "v2.0.14"
        self.check_error = None
        self.peek_error = None
        self.download_ok = True
        self.download_error = ""
        self.pending = False
        self.err = ""
        self.downloads = 0
        self.notified = []
        self.peeked = {
            "changed": [{"path": "oreoOS/a.py", "size": 300_000},
                        {"path": "oreoOS/splash.rv565", "size": 120_000}],
            "bytes": 420_000,
            "notes": "## What changed\n- **Faster** installs\n- `ota` errors "
                     "in plain words\n\n\n" + "\n".join(
                         "- line %d" % i for i in range(40)),
        }

    def is_pending(self):
        return self.pending

    def latest_version(self, channel="stable"):
        if self.check_error:
            self.err = self.check_error
            return None, None
        return self.latest, {"version": self.latest, "manifest_url": "u"}

    def compare_version(self, a, b):
        pa = tuple(int(x) for x in a.lstrip("v").split("."))
        pb = tuple(int(x) for x in b.lstrip("v").split("."))
        return (pa > pb) - (pa < pb)

    def peek(self, rel):
        if self.peek_error:
            self.err = self.peek_error
            return None
        return self.peeked

    def download(self, peeked, on_progress=None, on_bytes=None, cancel=None):
        self.downloads += 1
        on_bytes(150_000, 420_000, "oreoOS/a.py")
        on_progress(1, 2, "oreoOS/a.py")
        on_bytes(300_000, 420_000, "oreoOS/splash.rv565")
        self.progress_seen = (self.app._p_files, self.app._p_bytes,
                              self.app._p_path)
        if not self.download_ok:
            self.err = self.download_error
            return False
        on_progress(2, 2, "oreoOS/splash.rv565")
        return True

    def error_text(self):
        return self.err

    def push_update_notification(self, v):
        self.notified.append(v)


def load_app(test, ota, version="v2.0.13"):
    api = types.ModuleType("oreoOS.api")
    api.SCREEN_W, api.SCREEN_H = SW, SH
    names = ("BTN_A", "BTN_B", "BTN_C", "BTN_UP", "BTN_DOWN", "BTN_LEFT",
             "BTN_RIGHT", "BTN_HOME")
    for i, n in enumerate(names):
        setattr(api, n, i + 1)
    api.WHITE = "WHITE"
    theme = types.ModuleType("oreoOS.theme")
    theme.__getattr__ = lambda name: name
    widgets = types.ModuleType("oreoOS.widgets")
    widgets.HEADER_H, widgets.HINT_H = 28, 16
    widgets.draw_header = lambda d, t: None
    widgets.draw_hint = lambda d, t: test.hints.append(t)
    cache = types.ModuleType("oreoOS.cache")
    cache.Refresh = Refresh
    busy = types.ModuleType("oreoOS.busy")
    busy.draw_spinner = lambda d, x, y, step, bg=None: d.rect(x, y, 24, 24, 0)
    config = types.ModuleType("oreoOS.config")
    config.VERSION = version
    netsvc = types.ModuleType("oreoOS.netsvc")
    netsvc.fetch_busy = lambda: False

    class App:
        def on_enter(self, os_):
            pass

        def on_exit(self):
            pass

    pkg = types.ModuleType("oreoOS")
    pkg.App = App
    mods = {"oreoOS": pkg, "oreoOS.api": api, "oreoOS.theme": theme,
            "oreoOS.widgets": widgets, "oreoOS.cache": cache,
            "oreoOS.busy": busy, "oreoOS.config": config,
            "oreoOS.ota": ota, "oreoOS.netsvc": netsvc}
    for k, v in mods.items():
        if "." in k:
            setattr(pkg, k.split(".", 1)[1], v)
    saved = {k: sys.modules.get(k) for k in mods}
    sys.modules.update(mods)

    def restore():
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
    test.addCleanup(restore)
    spec = importlib.util.spec_from_file_location(
        "updates_app_under_test", ROOT / "apps/updates/src/app.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod._now_s = lambda: 2_000_000_000
    clock = [0]
    mod.time = types.SimpleNamespace(
        ticks_ms=lambda: clock[0], ticks_diff=lambda a, b: a - b,
        ticks_add=lambda a, b: a + b,
        sleep_ms=lambda ms: clock.__setitem__(0, clock[0] + ms))
    return mod, api


class UpdatesAppTest(unittest.TestCase):
    def setUp(self):
        self.hints = []
        self.ota = FakeOta()

    def start(self, version="v2.0.13", settings=None):
        self.mod, self.api = load_app(self, self.ota, version)
        self.d = Display(self)
        self.os = FakeOS(self.d)
        self.os.settings.update(settings or {})
        self.app = self.mod.App()
        self.ota.app = self.app
        self.app.on_enter(self.os)
        return self.app

    def frame(self):
        self.app.update(0.016)
        self.app._dirty = True
        self.app.draw(self.d)
        return self.d.joined()

    def press(self, name):
        self.app.on_button_press(getattr(self.api, name))

    def test_checking_shows_a_spinner_and_never_blocks(self):
        app = self.start()
        self.assertEqual(app._state, "checking")
        app.draw(self.d)                        # before the job has run
        self.assertIn("Checking for updates", self.d.joined())
        self.assertIn("v2.0.13", self.d.joined())
        self.assertIn("stable", self.d.joined())
        self.assertEqual(self.hints[-1], "B back")

    def test_up_to_date(self):
        self.ota.latest = "v2.0.13"
        self.start(settings={"ota_last_check_s": 2_000_000_000 - 300})
        text = self.frame()
        self.assertEqual(self.app._state, "up_to_date")
        self.assertIn("You're up to date", text)
        self.assertIn("Newest stable release: v2.0.13", text)
        self.assertIn("Checked just now", text)    # this check stamped it
        self.assertEqual(self.os.settings["ota_status"], "up-to-date")
        self.press("BTN_A")
        self.assertEqual(self.app._state, "checking")

    def test_last_check_time(self):
        self.assertEqual(load_app(self, self.ota)[0].ago(0, 1000), "Not checked yet")
        m = load_app(self, self.ota)[0]
        self.assertEqual(m.ago(1000, 1000 + 5 * 60), "Checked 5 min ago")
        self.assertEqual(m.ago(1000, 1000 + 3 * 3600), "Checked 3 h ago")
        self.assertEqual(m.ago(1000, 0), "")      # clock not set

    def test_ahead_of_stable(self):
        self.start(version="v2.1.0")
        text = self.frame()
        self.assertEqual(self.app._state, "ahead")
        self.assertIn("Ahead of stable", text)

    def test_available_with_size_and_notes(self):
        self.start()
        text = self.frame()
        self.assertEqual(self.app._state, "available")
        self.assertIn("UPDATE AVAILABLE", text)
        self.assertIn("v2.0.14", text)
        self.assertIn("2 files, 411 KB to download", text)
        self.assertIn("What changed", text)          # Markdown marks dropped
        self.assertIn("INSTALL", text)
        self.assertEqual(self.os.settings["ota_status"], "available")
        self.assertEqual(self.ota.notified, ["v2.0.14"])
        # NOTES: scrollable, B comes back.
        self.press("BTN_RIGHT")
        self.press("BTN_A")
        self.assertEqual(self.app._state, "notes")
        text = self.frame()
        self.assertIn("What's new in v2.0.14", text)
        self.assertIn("- Faster installs", text)
        for _ in range(100):
            self.press("BTN_DOWN")
        self.assertEqual(self.app._scroll, self.app._max_scroll())
        self.assertIn("- line 39", self.frame())
        self.press("BTN_B")
        self.assertEqual(self.app._state, "available")

    def test_confirm_then_install_with_progress_then_restart(self):
        self.start()
        self.frame()
        self.press("BTN_A")                           # INSTALL selected
        self.assertEqual(self.app._state, "confirm")
        text = self.frame()
        self.assertIn("Install v2.0.14?", text)
        self.assertIn("Downloads 411 KB (2 files)", text)
        self.assertIn("Wi-Fi stay.", text)
        self.press("BTN_B")
        self.assertEqual(self.app._state, "available")
        self.press("BTN_A")
        self.press("BTN_A")                           # confirm
        self.assertEqual(self.app._state, "installing")
        self.app.draw(self.d)
        self.assertIn("Downloading v2.0.14", self.d.joined())
        # Mid-download frame, from the worker's progress numbers.
        self.app._on_file(1, 2, "oreoOS/a.py")
        self.app._on_bytes(210_000, 420_000, "oreoOS/splash.rv565")
        self.app._dirty = True
        self.app.draw(self.d)
        text = self.d.joined()
        self.assertIn("50%", text)
        self.assertIn("1 of 2 files", text)
        self.assertIn("206 KB of 411 KB", text)
        self.assertIn("Now: splash.rv565", text)
        self.press("BTN_A")                           # ignored while installing
        self.assertEqual(self.ota.downloads, 0)
        text = self.frame()                           # the job runs
        self.assertEqual(self.ota.downloads, 1)
        self.assertEqual(self.ota.progress_seen,
                         (1, 300_000, "oreoOS/splash.rv565"))
        self.assertEqual(self.app._state, "ready")
        self.assertIn("v2.0.14 downloaded", text)
        self.assertIn("Restarting to install...", text)
        self.assertEqual(self.os.settings["ota_status"], "ready")
        self.app._restart_at = 0                      # time is up
        self.app.update(0.016)
        self.assertTrue(self.os.quit_called)          # no machine on host

    def test_error_names_what_failed_and_retries(self):
        self.ota.download_ok = False
        self.ota.download_error = ("Downloading oreoOS/splash.rv565: "
                                   "release-assets.githubusercontent.com: "
                                   "timed out")
        self.start()
        self.frame()
        self.press("BTN_A")
        self.press("BTN_A")
        text = self.frame()
        self.assertEqual(self.app._state, "failed")
        self.assertIn("Update not installed", text)
        self.assertIn("Downloading oreoOS/splash.rv565 | "
                      "release-assets.githubusercontent.com | timed out", text)
        self.assertIn("Nothing was changed on the badge.", text)
        self.assertEqual(self.hints[-1], "A try again   B back")
        self.assertEqual(self.os.settings["ota_status"], "download-failed")
        # Retry repeats the install, not just the check.
        self.ota.download_ok = True
        self.press("BTN_A")
        self.assertEqual(self.app._state, "installing")
        self.frame()
        self.assertEqual(self.app._state, "ready")
        self.assertEqual(self.ota.downloads, 2)

    def test_check_error_and_retry(self):
        self.ota.check_error = "Checking for updates: api.github.com: TLS: clock not set"
        self.start()
        text = self.frame()
        self.assertEqual(self.app._state, "failed")
        self.assertIn("Couldn't check for updates", text)
        self.assertIn("TLS: clock not set", text)
        self.ota.check_error = None
        self.press("BTN_A")
        self.assertEqual(self.app._state, "checking")
        self.frame()
        self.assertEqual(self.app._state, "available")

    def test_staged_update_offers_restart(self):
        self.ota.pending = True
        self.start(settings={"ota_pending_version": "v2.0.14"})
        text = self.frame()
        self.assertEqual(self.app._state, "ready")
        self.assertIn("Restart the badge to install it.", text)
        self.press("BTN_B")
        self.assertTrue(self.os.quit_called)

    def test_b_goes_back(self):
        self.ota.latest = "v2.0.13"
        self.start()
        self.frame()
        self.press("BTN_B")
        self.assertTrue(self.os.quit_called)

    def test_leaving_stops_the_download(self):
        self.start()
        self.frame()
        self.app.on_exit()
        self.assertTrue(self.app._cancelled())

    def test_long_error_wraps_on_screen(self):
        self.ota.check_error = "x" * 200
        self.start()
        self.frame()                  # the display asserts every line fits


if __name__ == "__main__":
    unittest.main()
