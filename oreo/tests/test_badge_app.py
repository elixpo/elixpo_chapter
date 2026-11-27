"""Host tests for the Badge app (apps/badge): the one-screen conference
badge that merged the old Badge and Identity apps.

Every edge case is drawn through a fake display, with the real Pixelify
fonts and again with the built-in 8x8 fallback, and checked for:

  * nothing drawn outside 320x240;
  * nothing from the app over the header (y < 28) or the hint bar
    (y >= 224), and everything inside the card;
  * the identity block (name, designation, @login) inside the text column
    and between the lanyard row and the divider, never cut mid-word when
    a smaller font would fit.

Set BADGE_PREVIEW_DIR to also save a PNG of each render (needs Pillow):

    BADGE_PREVIEW_DIR=/tmp/previews python -m unittest tests.test_badge_app
"""

import importlib.util
import os
import sys
import threading
import time
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW, SH = 320, 240
HEADER_H, HINT_H = 28, 16
PETME = Path.home() / "esp/micropython-v1.28/extmod/font_petme128_8x8.h"


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _petme():
    """MicroPython's framebuf 8x8 font (columns, LSB at top), or None."""
    try:
        src = PETME.read_text()
    except OSError:
        return None
    body = src[src.index("{") + 1:src.index("};")]
    out = []
    for line in body.splitlines():
        line = line.split("//")[0]
        out += [int(t, 16) for t in line.replace(",", " ").split()]
    return out


class FakeDisplay:
    """Records every primitive with its bounding box; optionally rasters
    them so a PNG preview can be written."""

    def __init__(self, raster=False):
        self.ops = []              # (kind, x, y, w, h, chrome)
        self.texts = []
        self.chrome = False
        self.px = [[(0, 0, 0)] * SW for _ in range(SH)] if raster else None
        self.font = _petme() if raster else None

    def _op(self, kind, x, y, w, h):
        self.ops.append((kind, x, y, w, h, self.chrome))

    def _fill(self, x, y, w, h, color):
        if self.px is None:
            return
        for yy in range(max(0, y), min(SH, y + h)):
            row = self.px[yy]
            for xx in range(max(0, x), min(SW, x + w)):
                row[xx] = color

    def clear(self, color=(0, 0, 0)):
        self._fill(0, 0, SW, SH, color)

    def rect(self, x, y, w, h, color, fill=False):
        self._op("rect", x, y, w, h)
        if fill:
            self._fill(x, y, w, h, color)
        else:
            self._fill(x, y, w, 1, color)
            self._fill(x, y + h - 1, w, 1, color)
            self._fill(x, y, 1, h, color)
            self._fill(x + w - 1, y, 1, h, color)

    def text(self, s, x, y, color=(255, 255, 255), scale=1):
        self.texts.append((s, x, y))
        self._op("text", x, y, len(s) * 8 * scale, 8 * scale)
        if self.px is None:
            return
        for i, ch in enumerate(s):
            c = ord(ch)
            if self.font is None or not 32 <= c < 128:
                continue
            cols = self.font[(c - 32) * 8:(c - 32) * 8 + 8]
            for cx, bits in enumerate(cols):
                for cy in range(8):
                    if bits >> cy & 1:
                        self._fill(x + (i * 8 + cx) * scale, y + cy * scale,
                                   scale, scale, color)

    def blit(self, data, x, y, w, h):
        self._op("blit", x, y, w, h)
        if self.px is None:
            return
        for yy in range(h):
            for xx in range(w):
                i = (yy * w + xx) * 2
                v = data[i] << 8 | data[i + 1]
                if v == 0xF81F:
                    continue
                r, g, b = (v >> 11) << 3, ((v >> 5) & 0x3F) << 2, (v & 31) << 3
                self._fill(x + xx, y + yy, 1, 1, (r, g, b))

    def save_png(self, path):
        from PIL import Image
        img = Image.new("RGB", (SW, SH))
        img.putdata([p for row in self.px for p in row])
        img = img.resize((SW * 2, SH * 2), Image.NEAREST)
        img.save(path)


class FakeNet:
    def __init__(self):
        self.quiet = False

    def has_threads(self):
        return True

    def in_quiet(self, now=None):
        return self.quiet

    def fetch_busy(self):
        return False


def build_env(real_fonts):
    """A stub `oreoOS` package around the real theme, cache, github,
    profile and (optionally) pixelfont modules. Returns (package, saved
    sys.modules entries); put it in place with install()/restore()."""
    api = types.ModuleType("oreoOS.api")
    api.SCREEN_W, api.SCREEN_H = SW, SH
    api.BTN_A = 1
    api.WHITE = (255, 255, 255)
    api.BLACK = (0, 0, 0)
    api.rgb = lambda r, g, b: (r, g, b)
    pkg = types.ModuleType("oreoOS")
    pkg.__path__ = []
    pkg.App = object
    pkg.api = api
    state = types.ModuleType("oreoOS.state")
    state.files = {}
    state.read_json = lambda path: state.files.get(path)
    pkg.state = state
    net = FakeNet()
    pkg.netsvc = net
    widgets = types.ModuleType("oreoOS.widgets")
    widgets.HEADER_H, widgets.HINT_H = HEADER_H, HINT_H

    def draw_header(d, title, *a):
        d.chrome = True
        d.rect(0, 0, SW, HEADER_H, (255, 93, 104), fill=True)
        d.text(title, (SW - len(title) * 8) // 2, 10, api.WHITE)
        d.chrome = False

    def draw_hint(d, text, *a):
        d.chrome = True
        d.rect(0, SH - HINT_H, SW, HINT_H, (255, 240, 210), fill=True)
        d.text(text, (SW - len(text) * 8) // 2, SH - HINT_H + 4, (38, 38, 48))
        d.chrome = False
    widgets.draw_header, widgets.draw_hint = draw_header, draw_hint
    pkg.widgets = widgets
    modules = {"oreoOS": pkg, "oreoOS.api": api, "oreoOS.state": state,
               "oreoOS.widgets": widgets, "oreoOS.netsvc": net}
    with _Installed(modules):
        pkg.theme = modules["oreoOS.theme"] = _load("oreoOS/theme.py",
                                                    "badge_t_theme")
        pkg.cache = modules["oreoOS.cache"] = _load("oreoOS/cache.py",
                                                    "badge_t_cache")
        pkg.github = modules["oreoOS.github"] = _load("oreoOS/github.py",
                                                      "badge_t_github")
        pkg.profile = modules["oreoOS.profile"] = _load("oreoOS/profile.py",
                                                        "badge_t_profile")
        if real_fonts:
            if str(ROOT) not in sys.path:
                sys.path.insert(0, str(ROOT))
            pf = _load("oreoOS/pixelfont.py", "badge_t_pixelfont")
        else:
            pf = types.ModuleType("oreoOS.pixelfont")

            def no_font(name):
                raise ImportError(name)
            pf.load = no_font
        pkg.pixelfont = modules["oreoOS.pixelfont"] = pf
        app = _load("apps/badge/src/app.py", "badge_t_app_%d" % real_fonts)
    app.time = types.SimpleNamespace(
        ticks_ms=lambda: int(time.monotonic() * 1000),
        ticks_diff=lambda a, b: a - b)
    return app, pkg, modules


class _Installed:
    """Put stub modules in sys.modules for the duration of a block."""

    def __init__(self, modules):
        self.modules = modules

    def __enter__(self):
        self.saved = {k: sys.modules.get(k) for k in self.modules}
        sys.modules.update(self.modules)
        # A real `secrets` module (stdlib on the host) has none of the keys.
        return self

    def __exit__(self, *exc):
        for k, v in self.saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v


FULL = {"name": "Ayushman B.", "login": "Circuit-Overtime",
        "bio": "Building tiny computers and the software that runs on them",
        "location": "Kolkata, India", "followers": 1234, "following": 35,
        "repos": 42}

# name -> (profile.json, github profile or None, avatar?, online?)
CASES = {
    "full": ({"GITHUB_USER": "Circuit-Overtime",
              "DISPLAY_NAME": "Ayushman Bhattacharya",
              "DISPLAY_DESIGNATION": "OSS Maintainer @pollinations"},
             FULL, True, True),
    "no-avatar": ({"GITHUB_USER": "Circuit-Overtime",
                   "DISPLAY_NAME": "Ayushman Bhattacharya",
                   "DESIGNATION": "OSS Maintainer @pollinations"},
                  FULL, False, True),
    "not-synced": ({"GITHUB_USER": "Circuit-Overtime",
                    "DISPLAY_NAME": "Ayushman Bhattacharya",
                    "DISPLAY_DESIGNATION": "OSS Maintainer @pollinations"},
                   None, True, False),
    "no-profile": ({}, None, True, True),
    "name-only": ({"DISPLAY_NAME": "Mona Lisa",
                   "DISPLAY_DESIGNATION": "Firmware @ Example"},
                  None, True, True),
    "github-only": ({"GITHUB_USER": "octocat"},
                    {"name": "The Octocat", "login": "octocat", "bio": "",
                     "location": "San Francisco", "followers": 21000,
                     "following": 9, "repos": 8}, False, True),
    "extreme": ({"GITHUB_USER": "a-very-long-github-login-name-for-tests",
                 "DISPLAY_NAME": "Wolfeschlegelsteinhausenbergerdorff "
                                 "Maximilian Alexander Featherstonehaugh",
                 "DISPLAY_DESIGNATION": "Principal Developer Relations "
                                        "Engineer @ A Very Long Company "
                                        "Name Incorporated"},
                {"name": "x", "login": "a-very-long-github-login-name-for-"
                 "tests", "bio": "W" * 60, "location": "Llanfairpwllgwyngyll"
                 "gogerych", "followers": 987654, "following": 99999,
                 "repos": 1000}, False, True),
}


def avatar_bin(login, w=56, h=56, color=0x07E0):
    """An /avatar.bin as `falera setup` writes it (cli/oreo_cli/avatar.py):
    a solid disc of `color` with magenta corners."""
    px = bytearray()
    r2 = (w / 2.0 - 0.5) ** 2
    for y in range(h):
        for x in range(w):
            inside = (x - w / 2.0 + 0.5) ** 2 + (y - h / 2.0 + 0.5) ** 2 <= r2
            v = color if inside else 0xF81F
            px += bytes((v >> 8, v & 0xFF))
    name = login.encode()
    return b"OAV1" + bytes((w, h, len(name))) + name + bytes(px)


class _AvatarFiles:
    """Temporary /avatar.bin files for a test case."""

    def avatar_file(self, login, data=None):
        import shutil
        import tempfile
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        path = os.path.join(d, "avatar.bin")
        if data is None and login:
            data = avatar_bin(login)
        if data is not None:
            with open(path, "wb") as f:
                f.write(data)
        return path


class BadgeRenderTest(_AvatarFiles, unittest.TestCase):
    PREVIEW = os.environ.get("BADGE_PREVIEW_DIR")

    def render(self, case, real_fonts, busy=False):
        files, gh_profile, avatar, online = CASES[case]
        m, pkg, modules = build_env(real_fonts)
        with _Installed(modules):
            pkg.state.files = {"/profile.json": dict(files)}
            pkg.profile.reload()
            gh = pkg.github
            gh.online = lambda: online or busy
            gh.cached_profile = lambda login: (
                (dict(gh_profile), 7200) if gh_profile else (None, None))
            release = threading.Event()

            def fetch(login):
                release.wait(2)
                return None
            gh.fetch_profile = fetch
            pkg.profile.AVATAR_PATH = self.avatar_file(
                files.get("GITHUB_USER") if avatar else None)
            app = m.App()
            if not busy:
                pkg.netsvc.quiet = True       # no automatic fetch
            app.on_enter(None)
            d = FakeDisplay(raster=bool(self.PREVIEW) and real_fonts)
            app.draw(d)
            release.set()
        self.check(m, app, d, case)
        if self.PREVIEW and real_fonts:
            os.makedirs(self.PREVIEW, exist_ok=True)
            d.save_png(os.path.join(self.PREVIEW,
                                    "badge-preview-%s%s.png"
                                    % (case, "-syncing" if busy else "")))
        return m, app, d

    def check(self, m, app, d, case):
        content = [op for op in d.ops if not op[5]]
        self.assertTrue(content, case)
        for kind, x, y, w, h, chrome in d.ops:
            with self.subTest(case=case, op=(kind, x, y, w, h)):
                self.assertGreaterEqual(x, 0)
                self.assertGreaterEqual(y, 0)
                self.assertLessEqual(x + w, SW)
                self.assertLessEqual(y + h, SH)
        for kind, x, y, w, h, _c in content:
            with self.subTest(case=case, op=(kind, x, y, w, h)):
                self.assertGreaterEqual(y, HEADER_H)
                self.assertLessEqual(y + h, SH - HINT_H)
                # Inside the card (plus its 2 px shadow).
                self.assertGreaterEqual(x, m.CARD_X)
                self.assertLessEqual(x + w, m.CARD_X + m.CARD_W + 2)
                self.assertGreaterEqual(y, m.CARD_Y)
                self.assertLessEqual(y + h, m.CARD_Y + m.CARD_H + 2)
        if app._layout:
            for f, text, y, _col in app._layout:
                with self.subTest(case=case, row=text):
                    self.assertLessEqual(f.measure(text), m.TW)
                    self.assertGreaterEqual(y, m.TOP_Y)
                    self.assertLessEqual(y + f.h, m.TOP_B)
            # The status pill sits above the identity block.
            self.assertLessEqual(m.PILL_Y + 12, m.TOP_Y)

    def test_every_case_fits_with_pixel_fonts(self):
        for case in CASES:
            self.render(case, True)

    def test_every_case_fits_with_builtin_font(self):
        for case in CASES:
            self.render(case, False)

    def test_syncing_pill_fits(self):
        for real in (True, False):
            m, app, d = self.render("not-synced", real, busy=True)
            self.assertTrue(app._job.threaded)

    def test_long_name_wraps_on_words_at_full_size(self):
        m, app, d = self.render("full", True)
        rows = [r[1] for r in app._layout]
        self.assertEqual(rows[:2], ["Ayushman", "Bhattacharya"])
        self.assertEqual(app._layout[0][0].h, 24)      # largest name font
        self.assertIn("@Circuit-Overtime", rows)
        self.assertIn("OSS Maintainer @pollinations", " ".join(rows))
        self.assertFalse(any(r.endswith("~") for r in rows))

    def test_designation_alias_and_github_facts(self):
        m, app, d = self.render("no-avatar", True)
        self.assertIn("OSS Maintainer",
                      " ".join(r[1] for r in app._layout))
        shown = " ".join(t[0] for t in d.texts)
        self.assertIn("Kolkata, India", shown)
        self.assertIn("Building tiny computers", shown)
        # No avatar blit, initials drawn instead (pixel font: no d.text).
        self.assertFalse([op for op in d.ops if op[0] == "blit"])

    def test_owner_avatar_is_drawn_in_the_disc(self):
        m, app, d = self.render("full", False)
        blits = [op for op in d.ops if op[0] == "blit"]
        self.assertEqual(len(blits), 1)
        _k, x, y, w, h, _c = blits[0]
        self.assertEqual((w, h), (56, 56))
        self.assertEqual((x + w // 2, y + h // 2), (m.AV_CX, m.AV_CY))

    def render_with_avatar_of(self, owner_login, file_login, data=None):
        m, pkg, modules = build_env(False)
        with _Installed(modules):
            pkg.state.files = {"/profile.json": {"GITHUB_USER": owner_login,
                                                 "DISPLAY_NAME": "Mona Lisa"}}
            pkg.profile.reload()
            pkg.profile.AVATAR_PATH = self.avatar_file(file_login, data)
            pkg.github.online = lambda: False
            pkg.github.cached_profile = lambda login: (None, None)
            pkg.netsvc.quiet = True
            app = m.App()
            app.on_enter(None)
            d = FakeDisplay()
            app.draw(d)
        return m, app, d

    def test_someone_elses_avatar_is_never_shown(self):
        m, app, d = self.render_with_avatar_of("octocat", "Circuit-Overtime")
        self.assertIsNone(app._avatar)
        self.assertFalse([op for op in d.ops if op[0] == "blit"])
        self.assertIn("ML", [t[0] for t in d.texts])     # initials disc

    def test_avatar_login_matches_case_insensitively(self):
        m, app, d = self.render_with_avatar_of("OctoCat", "octocat")
        self.assertIsNotNone(app._avatar)

    def test_bad_avatar_files_fall_back_to_initials(self):
        good = avatar_bin("octocat")
        for data in (good[:-1],                          # cut short
                     b"XXXX" + good[4:],                 # not an avatar
                     avatar_bin("octocat", 80, 80),      # bigger than the disc
                     b"OAV1",                            # header only
                     b""):
            with self.subTest(size=len(data)):
                m, app, d = self.render_with_avatar_of("octocat", None, data)
                self.assertIsNone(app._avatar)
                self.assertFalse([op for op in d.ops if op[0] == "blit"])

    def test_avatar_released_on_exit(self):
        m, app, d = self.render_with_avatar_of("octocat", "octocat")
        self.assertIsInstance(app._avatar[0], bytearray)
        app.on_exit()
        self.assertIsNone(app._avatar)

    def test_shipped_avatar_module_is_removed(self):
        import tempfile
        d = tempfile.mkdtemp()
        old = os.path.join(d, "avatar.py")
        with open(old, "w") as f:
            f.write("W = H = 56\n")
        m, pkg, modules = build_env(False)
        m.OLD_AVATAR = old
        m._drop_shipped_avatar()
        self.assertFalse(os.path.exists(old))
        m._drop_shipped_avatar()                         # missing: no error

    def test_initials(self):
        m, _pkg, _mods = build_env(False)
        self.assertEqual(m._initials("Ayushman Bhattacharya", "x"), "AB")
        self.assertEqual(m._initials("Mona", "x"), "M")
        self.assertEqual(m._initials("", "octocat"), "O")
        self.assertEqual(m._initials("", ""), "?")

    def test_no_profile_shows_setup(self):
        m, app, d = self.render("no-profile", False)
        shown = " ".join(t[0] for t in d.texts)
        self.assertIn("falera setup --from-file .env.local", shown)
        self.assertIn("docs/PROFILE.md", shown)
        self.assertIn("GITHUB_USER", shown)
        self.assertIsNone(app._job)

    def test_name_without_github_user(self):
        m, app, d = self.render("name-only", False)
        shown = " ".join(t[0] for t in d.texts)
        self.assertIn("Mona Lisa", shown)
        self.assertIn("GITHUB_USER", shown)
        self.assertIsNone(app._job)
        self.assertFalse([op for op in d.ops if op[0] == "blit"])

    def test_not_synced_names_wifi(self):
        m, app, d = self.render("not-synced", False)
        shown = " ".join(t[0] for t in d.texts)
        self.assertIn("not synced", shown)
        self.assertIn("Wi-Fi", shown)

    def test_github_name_used_without_display_name(self):
        m, app, d = self.render("github-only", True)
        self.assertEqual(app._layout[0][1], "The Octocat")


class BadgeRefreshTest(unittest.TestCase):
    """Cached card at once; automatic refresh waits for the quiet window;
    A refreshes (or says no Wi-Fi)."""

    def setUp(self):
        self.m, self.pkg, self.modules = build_env(False)
        self.inst = _Installed(self.modules)
        self.inst.__enter__()
        self.pkg.state.files = {"/profile.json": {"GITHUB_USER": "me"}}
        self.pkg.profile.reload()
        gh = self.pkg.github
        self.up = True
        gh.online = lambda: self.up
        self.calls = []
        fresh = dict(FULL, login="me", repos=99)

        def fetch(login):
            self.calls.append(login)
            return fresh
        gh.fetch_profile = fetch
        gh.cached_profile = lambda login: (dict(FULL, login="me"),
                                           gh.PROFILE_TTL_S + 1)

    def tearDown(self):
        self.inst.__exit__()

    def _settle(self, app):
        for _ in range(200):
            app.update(0.02)
            if app._job is None or not app._job.busy():
                app.update(0.02)
                return
            time.sleep(0.005)

    def test_stale_cache_waits_for_quiet_window(self):
        self.pkg.netsvc.quiet = True
        app = self.m.App()
        app.on_enter(None)
        self.assertEqual(app._profile["repos"], 42)    # cached, at once
        app.update(0.02)
        self.assertEqual(self.calls, [])
        self.pkg.netsvc.quiet = False
        self._settle(app)
        self.assertEqual(self.calls, ["me"])
        self.assertEqual(app._profile["repos"], 99)
        self.assertEqual(app._age0, 0)

    def test_a_offline_says_no_wifi(self):
        self.up = False
        app = self.m.App()
        app.on_enter(None)
        app.on_button_press(self.m.api.BTN_A)
        self.assertEqual(app._note, "no Wi-Fi")
        self.assertEqual(self.calls, [])
        d = FakeDisplay()
        app.draw(d)
        self.assertIn("no Wi-Fi", [t[0] for t in d.texts])

    def test_a_refreshes_when_online(self):
        self.pkg.netsvc.quiet = True
        app = self.m.App()
        app.on_enter(None)
        app.on_button_press(self.m.api.BTN_A)
        self._settle(app)
        self.assertEqual(self.calls, ["me"])


class DeployRetiredAppsTest(unittest.TestCase):
    """A badge that still has /apps/identity (merged into Badge) loses it
    on the next deploy; App Store and owner-pushed apps stay."""

    def setUp(self):
        self.deploy = _load("tools/deploy.py", "deploy_retired_test")

    def test_identity_is_retired(self):
        paths = self.deploy.retired_paths({"badge", "commits"}, {"snake"})
        self.assertIn("apps/identity", paths)
        self.assertIn("assets/icons/optimized/identity_icon.py", paths)
        self.assertFalse(any(p.startswith("apps/") and p != "apps/identity"
                             and p not in self.deploy.NEVER_SHIP for p in paths))

    def test_shipped_avatar_is_retired_and_never_deployed(self):
        # #133: one person's avatar went to every badge.
        old = "apps/badge/assets/optimized/avatar.py"
        self.assertIn(old, self.deploy.NEVER_SHIP)
        self.assertIn(old, self.deploy.retired_paths({"badge"}, set()))
        self.assertNotIn(old, [remote for _local, remote in self.deploy.DEPLOY])

    def test_name_back_in_repo_or_store_is_kept(self):
        for repo, store in (({"identity"}, set()), (set(), {"identity"})):
            paths = self.deploy.retired_paths(repo, store)
            self.assertNotIn("apps/identity", paths)

    def test_script_removes_only_retired_paths(self):
        import tempfile
        tmp = tempfile.mkdtemp()
        for rel in ("apps/identity/src/app.py", "apps/identity/manifest.json",
                    "apps/my_app/manifest.json", "apps/snake/manifest.json",
                    "assets/icons/optimized/identity_icon.py",
                    "assets/icons/optimized/badge_icon.py"):
            path = os.path.join(tmp, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, "w").close()
        paths = self.deploy.retired_paths({"badge"}, {"snake"})
        script = self.deploy.retired_script(paths)
        cwd = os.getcwd()
        os.chdir(tmp)
        try:
            exec(compile(script, "retired", "exec"), {"print": lambda *a: 0})
            exec(compile(script, "retired", "exec"), {"print": lambda *a: 0})
        finally:
            os.chdir(cwd)
        self.assertFalse(os.path.exists(os.path.join(tmp, "apps/identity")))
        self.assertFalse(os.path.exists(os.path.join(
            tmp, "assets/icons/optimized/identity_icon.py")))
        for rel in ("apps/my_app/manifest.json", "apps/snake/manifest.json",
                    "assets/icons/optimized/badge_icon.py"):
            self.assertTrue(os.path.exists(os.path.join(tmp, rel)), rel)


if __name__ == "__main__":
    unittest.main()
