"""Host tests for review fixes on the app platform branch:

* App Store apps must keep working on a badge whose OS predates
  oreoOS.state / oreoOS.profile (stable/v2.0.5 and older), because the
  Store serves the newest app version to every badge;
* Badge and Commits must not fetch or show anyone's profile while no
  GITHUB_USER is set;
* tools/deploy.py names every blank profile key in one note.

    python3 -m unittest discover -s tests -v
"""

import ast
import importlib
import importlib.util
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

import test_commits_grid  # noqa: E402  (stub loader for the Commits app)

# OS modules added after stable/v2.0.5. An App Store app may only import
# them inside try/except ImportError.
NEW_OS_MODULES = ("state", "profile", "crashlog")


def _guarded(tree):
    """Line numbers of `from oreoOS import <new module>` that sit inside a
    try whose handlers catch ImportError (or Exception)."""
    ok = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Try):
            continue
        names = set()
        for h in node.handlers:
            t = h.type
            for e in (t.elts if isinstance(t, ast.Tuple) else [t]):
                if isinstance(e, ast.Name):
                    names.add(e.id)
                elif e is None:
                    names.add("Exception")
        if not names & {"ImportError", "ModuleNotFoundError", "Exception"}:
            continue
        for stmt in node.body:
            for sub in ast.walk(stmt):
                if isinstance(sub, ast.ImportFrom):
                    ok.add(sub.lineno)
    return ok


class NewOsImportsAreGuardedTest(unittest.TestCase):
    def test_market_apps_guard_new_os_imports(self):
        bad = []
        for path in sorted((ROOT / "apps_market").rglob("*.py")):
            if "assets" in path.parts:
                continue
            tree = ast.parse(path.read_text(), str(path))
            guarded = _guarded(tree)
            for node in ast.walk(tree):
                if not isinstance(node, ast.ImportFrom):
                    continue
                mods = []
                if node.module == "oreoOS":
                    mods = [a.name for a in node.names]
                elif node.module and node.module.startswith("oreoOS."):
                    mods = [node.module.split(".", 1)[1]]
                if any(m in NEW_OS_MODULES for m in mods) \
                        and node.lineno not in guarded:
                    bad.append("%s:%d" % (path.relative_to(ROOT), node.lineno))
        self.assertEqual(bad, [], "unguarded new-OS imports: %s" % bad)


class _OldOsCase(unittest.TestCase):
    """Import market apps against the real oreoOS package with state and
    profile missing, the way a stable/v2.0.5 badge would."""

    def setUp(self):
        saved = {k: v for k, v in sys.modules.items()
                 if k == "oreoOS" or k.startswith("oreoOS.")
                 or k == "apps_market" or k.startswith("apps_market.")}
        for k in saved:
            del sys.modules[k]

        def restore():
            for k in [k for k in sys.modules
                      if k == "oreoOS" or k.startswith("oreoOS.")
                      or k == "apps_market" or k.startswith("apps_market.")]:
                del sys.modules[k]
            sys.modules.update(saved)
        self.addCleanup(restore)
        # A None entry makes `from oreoOS import state` raise ImportError.
        sys.modules["oreoOS.state"] = None
        sys.modules["oreoOS.profile"] = None
        sys.path.insert(0, str(ROOT))
        self.addCleanup(sys.path.remove, str(ROOT))
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        prev = os.getcwd()
        os.chdir(self.tmp.name)
        self.addCleanup(os.chdir, prev)

    def mod(self, dotted):
        return importlib.import_module(dotted)

    def mod_file(self, rel, name):
        spec = importlib.util.spec_from_file_location(name, ROOT / rel)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        return m

    def legacy(self, rel, text=None):
        p = Path(self.tmp.name, rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        if text is not None:
            p.write_text(text)
        return p


class OldOsFallbackTest(_OldOsCase):
    def check_hi(self, mod, load, save, rel):
        self.assertIsNone(mod.state)
        p = self.legacy(rel, "17")
        self.assertEqual(load(), 17)
        save(42)
        self.assertEqual(p.read_text(), "42")
        self.assertEqual(load(), 42)
        self.assertFalse(Path(self.tmp.name, "state").exists())

    def test_racer(self):
        m = self.mod("apps_market.racer.src.app")
        self.check_hi(m, m._load_hi, m._save_hi, "apps/racer/hi.txt")

    def test_patakha(self):
        m = self.mod("apps_market.patakha.src.app")
        self.check_hi(m, m._load_hi, m._save_hi, "apps/patakha/hi.txt")

    def test_flappy(self):
        m = self.mod("apps_market.flappy.src.app")
        self.check_hi(m, m._load_hiscore, m._save_hiscore,
                      "apps/flappy/hiscore.txt")

    def test_snake(self):
        m = self.mod("apps_market.snake.src.highscore")
        self.check_hi(m, m.load, m.save, "apps/snake/hiscore.txt")

    def test_snake_first_run_is_zero(self):
        m = self.mod("apps_market.snake.src.highscore")
        self.assertEqual(m.load(), 0)

    def test_colors(self):
        m = self.mod("apps_market.Colors.src.app")   # a package: it imports .palette
        self.assertIsNone(m.state)
        p = self.legacy("apps/color_picker/state.txt", "1,2,3")
        self.assertEqual(m._load_rgb(), (1, 2, 3))
        m._save_rgb((9, 8, 7))
        self.assertEqual(p.read_text(), "9,8,7")

    def test_pet(self):
        m = self.mod_file("apps_market/Lumi/src/app.py", "pet_old_os")
        self.assertIsNone(m.state)
        self.assertEqual(m._load_state(), (100, 100, 100))
        p = self.legacy("apps/pet/state.txt", "80,60,40")
        self.assertEqual(m._load_state(), (80, 60, 40))
        m._save_state(1, 2, 3)
        self.assertEqual(p.read_text(), "1,2,3")

    def test_weather_reads_secrets_without_profile(self):
        m = self.mod("apps_market.weather.src.app")
        fake = types.ModuleType("secrets")
        fake.WEATHER_LAT, fake.WEATHER_LON = 22.57, 88.36
        fake.OWM_API_KEY = "k"
        saved = sys.modules.get("secrets")
        sys.modules["secrets"] = fake
        try:
            self.assertEqual(m._owner_location(), (22.57, 88.36, "k"))
            fake.WEATHER_LAT = None
            # No pinned place: lat/lon stay None (the fetch locates the
            # badge), and the key is kept.
            self.assertEqual(m._owner_location(), (None, None, "k"))
        finally:
            if saved is None:
                sys.modules.pop("secrets", None)
            else:
                sys.modules["secrets"] = saved


class FakeDisplay(test_commits_grid.FakeDisplay):
    def blit(self, *a, **k):
        pass

    def pixel(self, *a, **k):
        pass

    def line(self, *a, **k):
        pass


class NoProfileTest(unittest.TestCase):
    """No GITHUB_USER: show how to set it, fetch nothing."""

    def test_commits_shows_setup_and_fetches_nothing(self):
        m, github = test_commits_grid.load_commits()
        github.user = lambda default="": default
        github.online = lambda: True
        calls = []
        github.cached_graph = lambda login: calls.append(login) or (None, None)
        github.fetch_graph = lambda *a, **k: calls.append("fetch")
        app = m.App()
        app.on_enter(test_commits_grid.FakeOS())
        self.assertEqual(app._user, "")
        self.assertIsNone(app._job)
        app.on_button_press(m.api.BTN_A)
        app.update(0.1)
        d = FakeDisplay()
        app.draw(d)
        self.assertEqual(calls, [])
        shown = " ".join(t[0] for t in d.texts)
        self.assertIn("GITHUB_USER", shown)
        self.assertNotIn("octocat", shown)

    def test_badge_shows_setup_and_fetches_nothing(self):
        m, github = _load_badge()
        github.user = lambda default="": default
        github.online = lambda: True
        calls = []
        github.cached_profile = lambda login: calls.append(login) or (None, None)
        github.fetch_profile = lambda *a, **k: calls.append("fetch")
        app = m.App()
        app.on_enter(None)
        self.assertEqual(app._user, "")
        self.assertIsNone(app._job)
        app.on_button_press(m.api.BTN_A)
        app.update(0.1)
        d = FakeDisplay()
        app.draw(d)
        self.assertEqual(calls, [])
        shown = " ".join(t[0] for t in d.texts)
        self.assertIn("GITHUB_USER", shown)
        self.assertNotIn("octocat", shown)


class _Clock:
    now = 0

    def ticks_ms(self):
        return self.now

    def ticks_diff(self, a, b):
        return a - b


def _load_badge():
    cache = test_commits_grid._load("oreoOS/cache.py", "oreo_cache_badge_test")
    api = types.ModuleType("oreoOS.api")
    api.SCREEN_W, api.SCREEN_H = 320, 240
    api.BTN_A = 1
    api.WHITE = (255, 255, 255)
    api.rgb = lambda r, g, b: (r, g, b)
    theme = types.ModuleType("oreoOS.theme")
    for name in ("BG", "CARD", "PRIMARY", "GOLD", "MUTED", "MUTED2",
                 "TEXT_BRIGHT", "TEXT_DIM", "DOCK_SEL", "DOCK_BG", "GREEN",
                 "ORANGE", "TEAL"):
        setattr(theme, name, name)
    widgets = types.ModuleType("oreoOS.widgets")
    widgets.HEADER_H, widgets.HINT_H = 28, 16
    widgets.draw_header = widgets.draw_hint = lambda *a: None
    pixelfont = types.ModuleType("oreoOS.pixelfont")

    def no_font(name):
        raise ImportError(name)
    pixelfont.load = no_font
    package = types.ModuleType("oreoOS")
    package.App = object
    package.cache, package.api, package.theme = cache, api, theme
    package.widgets, package.pixelfont = widgets, pixelfont
    keys = ("oreoOS", "oreoOS.cache")
    saved = {k: sys.modules.get(k) for k in keys}
    sys.modules["oreoOS"] = package
    sys.modules["oreoOS.cache"] = cache
    try:
        package.github = test_commits_grid._load("oreoOS/github.py",
                                                 "oreo_github_badge_test")
        app = test_commits_grid._load("apps/badge/src/app.py",
                                      "badge_app_under_test")
    finally:
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
    app.time = _Clock()
    return app, package.github


class DeployProfileNoteTest(unittest.TestCase):
    def setUp(self):
        self.deploy = test_commits_grid._load("tools/deploy.py",
                                              "deploy_under_test")

    def test_lists_every_blank_key(self):
        env = {"GITHUB_USER": "me", "DISPLAY_NAME": " ", "WEATHER_LAT": "1"}
        blank = self.deploy.blank_profile_keys(env)
        # Weather's location is optional now (the badge finds its own).
        self.assertEqual(blank, ["DISPLAY_NAME", "DISPLAY_DESIGNATION",
                                 "TIMEZONE_OFFSET"])
        note = self.deploy.profile_note(blank)
        for k in blank:
            self.assertIn(k, note)
        self.assertIn("UTC", note)
        self.assertNotIn("Weather has no location", note)
        self.assertIn("/profile.json", note)

    def test_older_designation_name_counts(self):
        env = {"GITHUB_USER": "me", "DISPLAY_NAME": "Me", "DESIGNATION": "OSS",
               "TIMEZONE_OFFSET": "5.5"}
        self.assertEqual(self.deploy.blank_profile_keys(env), [])

    def test_nothing_blank(self):
        env = {k: "1" for k in self.deploy.PROFILE_KEYS}
        self.assertEqual(self.deploy.blank_profile_keys(env), [])

    def test_note_for_fresh_env(self):
        blank = self.deploy.blank_profile_keys({})
        self.assertEqual(blank, list(self.deploy.PROFILE_KEYS))
        note = self.deploy.profile_note(blank)
        self.assertIn("setup hint", note)


if __name__ == "__main__":
    unittest.main()
