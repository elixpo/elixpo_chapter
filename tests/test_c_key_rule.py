"""The C key rule.

C opens the notification panel from any app. An app that uses C as one of
its own controls sets `CAPTURES_C = True`: a single C then goes to the app
and a double-tap of C opens the panel. That double-tap works in every such
app (Gamepad included); nothing may turn it off.

1. Every app under apps/, apps_market/ and app_templates/ that refers to
   BTN_C / BTN_PANEL in its code (comments and strings do not count) must
   set CAPTURES_C, and no app may set C_DOUBLE_TAP.
2. The launcher's run loop, driven with fake buttons, delivers the first C
   of a double-tap to Gamepad and opens the panel on the second.
"""

import importlib.util
import io
import re
import sys
import tokenize
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_ROOTS = ("apps", "apps_market")
C_NAMES = {"BTN_C", "BTN_PANEL"}


def _code_names(text):
    """NAME tokens of `text`, without comments and string literals."""
    out = set()
    for tok in tokenize.generate_tokens(io.StringIO(text).readline):
        if tok.type == tokenize.NAME:
            out.add(tok.string)
    return out


_CAPTURES = re.compile(r"^\s*(self\.)?CAPTURES_C\s*=\s*True\b", re.M)
_DOUBLE = re.compile(r"^\s*(self\.)?C_DOUBLE_TAP\s*=", re.M)


def _app_dirs():
    dirs = []
    for root in APP_ROOTS:
        for d in sorted((ROOT / root).iterdir()):
            if d.is_dir() and (d / "manifest.json").is_file():
                dirs.append(d)
    dirs.append(ROOT / "app_templates")
    return dirs


def _sources(app_dir):
    return [p for p in sorted(app_dir.rglob("*.py"))
            if "assets" not in p.relative_to(app_dir).parts]


class CKeyRuleTest(unittest.TestCase):
    def test_folders_found(self):
        names = [d.name for d in _app_dirs()]
        self.assertIn("gamepad", names)
        self.assertIn("Lumi", names)          # folder names with spaces

    def test_apps_that_use_c_capture_it(self):
        offenders = []
        for app_dir in _app_dirs():
            uses_c, captures = [], False
            for src in _sources(app_dir):
                text = src.read_text(encoding="utf-8")
                if _code_names(text) & C_NAMES:
                    uses_c.append(src.relative_to(ROOT).as_posix())
                if _CAPTURES.search(text):
                    captures = True
            if uses_c and not captures:
                offenders.append("%s (C in %s)" % (
                    app_dir.relative_to(ROOT).as_posix(), ", ".join(uses_c)))
        self.assertEqual(offenders, [],
                         "apps that handle C must set CAPTURES_C = True")

    def test_no_app_turns_off_the_double_tap(self):
        offenders = [src.relative_to(ROOT).as_posix()
                     for app_dir in _app_dirs() for src in _sources(app_dir)
                     if _DOUBLE.search(src.read_text(encoding="utf-8"))]
        self.assertEqual(offenders, [],
                         "C_DOUBLE_TAP is gone: a double-tap of C must "
                         "open the panel in every app")

    def test_detector_ignores_comments_and_strings(self):
        self.assertFalse(_code_names("# BTN_C here\nx = 'BTN_C'\n") & C_NAMES)
        self.assertTrue(_code_names("if b == api.BTN_C:\n    pass\n") & C_NAMES)
        self.assertTrue(_CAPTURES.search("class A:\n    CAPTURES_C = True\n"))
        self.assertTrue(_CAPTURES.search("        self.CAPTURES_C = True\n"))
        self.assertFalse(_CAPTURES.search("    CAPTURES_C = False\n"))


# ── the run loop with Gamepad in front ──────────────────────────────────────

def _load(rel, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


class _Clock:
    def __init__(self):
        self.t = 1000

    def ticks_ms(self):
        return self.t

    def ticks_us(self):
        return self.t * 1000

    def ticks_diff(self, a, b):
        return a - b

    def ticks_add(self, a, b):
        return a + b

    def sleep_ms(self, ms):
        self.t += ms


class _Buttons:
    """Plays a script: one set of held buttons per update()."""

    def __init__(self, script, os_obj, clock, step_ms=60):
        self.script = list(script)
        self.os = os_obj
        self.clock = clock
        self.step = step_ms
        self.held = set()
        self.prev = set()

    def update(self):
        self.clock.t += self.step
        self.prev = self.held
        if self.script:
            self.held = set(self.script.pop(0))
        else:
            self.held = set()
            self.os._quit_requested = True

    def just_pressed(self, b):
        return b in self.held and b not in self.prev

    def just_released(self, b):
        return b in self.prev and b not in self.held

    def is_pressed(self, b):
        return b in self.held

    def pressed_for_ms(self, b):
        return 0


class _Display:
    def __getattr__(self, name):
        return lambda *a, **k: None


class _Panel:
    def __init__(self):
        self.active = False
        self.toggles = 0

    def toggle(self):
        self.toggles += 1
        self.active = not self.active

    def is_active(self):
        return self.active

    def handle_button(self, b):
        pass

    def tick(self, dt):
        pass

    def consume_closed(self):
        return False

    def is_closing(self):
        return False

    def covers_screen(self):
        return False

    def draw(self, d):
        pass

    def keeps_awake(self):
        return False

    def invalidate(self):
        pass


class GamepadDoubleTapTest(unittest.TestCase):
    MODS = ("oreoOS", "oreoOS.api", "oreoOS.theme", "oreoOS.pixelfont",
            "oreoOS.widgets", "oreoOS.config", "oreoOS.notif_panel",
            "oreoOS.pair_prompt", "oreoOS.launcher", "oreoOS.app",
            "oreoOS.perf", "oreoOS.netsvc", "oreoOS.power", "oreoOS.ota",
            "oreoOS.busy", "gamepad_under_test")

    def setUp(self):
        self.saved = {k: sys.modules.get(k) for k in self.MODS}
        pkg = types.ModuleType("oreoOS")
        pkg.__path__ = [str(ROOT / "oreoOS")]
        sys.modules["oreoOS"] = pkg
        pkg.api = _load("oreoOS/api.py", "oreoOS.api")
        pkg.theme = _load("oreoOS/theme.py", "oreoOS.theme")
        pkg.pixelfont = _load("oreoOS/pixelfont.py", "oreoOS.pixelfont")
        pkg.widgets = _load("oreoOS/widgets.py", "oreoOS.widgets")
        pkg.widgets._time = None             # no MicroPython ticks here
        cfg = types.ModuleType("oreoOS.config")
        cfg.VERSION = "v0.0.0"               # the real one reads .env files
        sys.modules["oreoOS.config"] = cfg
        pkg.App = _load("oreoOS/app.py", "oreoOS.app").App
        self.panel = _Panel()
        real_np = _load("oreoOS/notif_panel.py", "oreoOS.notif_panel")
        real_np.get = lambda os_obj: self.panel
        pp = types.ModuleType("oreoOS.pair_prompt")
        prompt = types.SimpleNamespace(is_active=lambda: False,
                                       tick=lambda: None)
        pp.get = lambda os_obj: prompt
        sys.modules["oreoOS.pair_prompt"] = pp
        for name in ("perf", "netsvc", "power", "ota"):
            sys.modules["oreoOS." + name] = None    # import fails: skipped
        self.launcher = _load("oreoOS/launcher.py", "oreoOS.launcher")
        self.clock = _Clock()
        self.launcher.time = self.clock
        self.gp_mod = _load("apps/gamepad/src/app.py", "gamepad_under_test")
        self.gp_mod.time = self.clock

    def tearDown(self):
        for k, v in self.saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v

    def _run(self, script, step_ms=60):
        api = sys.modules["oreoOS.api"]
        os_obj = types.SimpleNamespace(
            display=_Display(), _quit_requested=False, _launch_request=None,
            _home_marked=True, _power=None, _just_woke=False)
        os_obj.quit = lambda: setattr(os_obj, "_quit_requested", True)
        os_obj.launch = lambda n: setattr(os_obj, "_launch_request", n)
        os_obj.buttons = _Buttons(script, os_obj, self.clock, step_ms)
        app = self.gp_mod.App()
        self.launcher.run_app(os_obj, app)
        return app, api

    def test_first_c_reaches_gamepad_second_opens_panel(self):
        C = sys.modules["oreoOS.api"].BTN_C
        app, api = self._run([[C], [], [C], []])
        self.assertEqual(app._counts[api.BTN_C], 1)      # the first tap shows
        self.assertEqual(self.panel.toggles, 1)          # the second opens
        self.assertTrue(self.panel.active)

    def test_slow_c_presses_all_reach_gamepad(self):
        C = sys.modules["oreoOS.api"].BTN_C
        app, api = self._run([[C], [], [], [], [], [], [], [C], []],
                             step_ms=100)
        self.assertEqual(app._counts[api.BTN_C], 2)
        self.assertEqual(self.panel.toggles, 0)


if __name__ == "__main__":
    unittest.main()
