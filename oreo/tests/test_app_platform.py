"""Hardware-free tests for the app platform: persistent state, the owner
profile, crash logs, the app validator and the icon converter.

    python3 -m unittest discover -s tests -v
"""

import importlib.util
import json
import os
import shutil
import sys
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(relative_path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _TmpCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.state = load("oreoOS/state.py", "oreo_state_under_test")
        self.state.STATE_DIR = self.tmp + "/state"


class StateTest(_TmpCase):
    def test_defaults_on_first_run_then_saved_values(self):
        st = self.state
        self.assertEqual(st.load("racer", {"hi": 0}), {"hi": 0})
        self.assertTrue(st.save("racer", {"hi": 42, "laps": 3}))
        self.assertEqual(st.load("racer", {"hi": 0, "mode": "tilt"}),
                         {"hi": 42, "laps": 3, "mode": "tilt"})
        self.assertTrue(os.path.isfile(self.tmp + "/state/racer.json"))

    def test_load_returns_a_fresh_dict(self):
        defaults = {"hi": 0}
        got = self.state.load("x", defaults)
        got["hi"] = 9
        self.assertEqual(defaults, {"hi": 0})

    def test_bad_names_are_refused(self):
        for bad in ("../etc", "a/b", "", "x" * 40, "a b"):
            with self.assertRaises(ValueError):
                self.state.path(bad)
            self.assertFalse(self.state.save(bad, {}))
        self.assertTrue(self.state.path("Pet").endswith("/pet.json"))

    def test_corrupt_file_falls_back_to_defaults(self):
        os.makedirs(self.tmp + "/state")
        Path(self.tmp, "state", "snake.json").write_text("{not json")
        self.assertEqual(self.state.load("snake", {"hi": 1}), {"hi": 1})

    def test_interrupted_save_is_recovered_from_tmp(self):
        # Power cut after remove(old) but before rename(tmp, new).
        os.makedirs(self.tmp + "/state")
        Path(self.tmp, "state", "pet.json.tmp").write_text('{"hunger": 7}')
        self.assertEqual(self.state.load("pet", {"hunger": 100})["hunger"], 7)

    def test_unserialisable_value_leaves_the_old_file(self):
        self.state.save("c", {"v": 1})
        self.assertFalse(self.state.save("c", {"v": object()}))
        self.assertEqual(self.state.load("c")["v"], 1)

    def test_delete(self):
        self.state.save("flappy", {"hi": 3})
        self.state.delete("flappy")
        self.assertFalse(self.state.exists("flappy"))

    def test_legacy_save_is_migrated_once(self):
        legacy = Path(self.tmp, "hi.txt")
        legacy.write_text("123\n")
        got = self.state.load_migrating("racer", {"hi": 0}, str(legacy), ("hi",))
        self.assertEqual(got, {"hi": 123})
        self.assertFalse(legacy.exists())
        self.assertEqual(self.state.load("racer"), {"hi": 123})

    def test_legacy_multi_value_and_mismatch(self):
        legacy = Path(self.tmp, "pet.txt")
        legacy.write_text("80,60,100")
        got = self.state.load_migrating(
            "pet", {"hunger": 100, "happy": 100, "health": 100}, str(legacy),
            ("hunger", "happy", "health"))
        self.assertEqual(got, {"hunger": 80, "happy": 60, "health": 100})
        # Wrong shape: defaults, and the odd file is left alone.
        odd = Path(self.tmp, "odd.txt")
        odd.write_text("1,2")
        got = self.state.load_migrating("color_picker", {"r": 1, "g": 2, "b": 3},
                                        str(odd), ("r", "g", "b"))
        self.assertEqual(got, {"r": 1, "g": 2, "b": 3})
        self.assertTrue(odd.exists())

    def test_existing_state_wins_over_legacy(self):
        self.state.save("snake", {"hi": 50})
        legacy = Path(self.tmp, "hi.txt")
        legacy.write_text("7")
        got = self.state.load_migrating("snake", {"hi": 0}, str(legacy), ("hi",))
        self.assertEqual(got["hi"], 50)

    def test_app_id_from_module_name(self):
        self.assertEqual(self.state.app_id("apps.my_app.src.app"), "my_app")
        self.assertEqual(self.state.app_id("app_templates.src.app", "example"),
                         "example")


class _Pkg:
    """Swap a stub `oreoOS` package (and `secrets`) into sys.modules."""

    def __init__(self, case, **modules):
        self.saved = {k: sys.modules.get(k) for k in modules}
        for k, v in modules.items():
            sys.modules[k] = v
        case.addCleanup(self.restore)

    def restore(self):
        for k, v in self.saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v


class ProfileTest(_TmpCase):
    def setUp(self):
        super().setUp()
        pkg = types.ModuleType("oreoOS")
        pkg.state = self.state
        self.secrets = types.ModuleType("secrets")
        _Pkg(self, oreoOS=pkg, **{"oreoOS.state": self.state,
                                  "secrets": self.secrets})
        self.profile = load("oreoOS/profile.py", "oreo_profile_under_test")
        self.profile.PATH = self.tmp + "/profile.json"

    def test_unset_profile_gives_defaults(self):
        self.assertEqual(self.profile.get("GITHUB_USER", "octocat"), "octocat")
        self.assertFalse(self.profile.is_set_up())

    def test_secrets_then_profile_json_wins(self):
        self.secrets.GITHUB_USER = "from-secrets"
        self.secrets.TIMEZONE_OFFSET = 5.5
        self.assertEqual(self.profile.get("GITHUB_USER"), "from-secrets")
        Path(self.profile.PATH).write_text(json.dumps(
            {"GITHUB_USER": "from-json", "TIMEZONE_OFFSET": "-4"}))
        self.profile.reload()
        self.assertEqual(self.profile.get("GITHUB_USER"), "from-json")
        self.assertEqual(self.profile.get("TIMEZONE_OFFSET"), -4.0)
        self.assertTrue(self.profile.is_set_up())

    def test_blank_values_fall_through(self):
        self.secrets.DISPLAY_NAME = ""
        Path(self.profile.PATH).write_text('{"DISPLAY_NAME": "  "}')
        self.assertEqual(self.profile.get("DISPLAY_NAME", "x"), "x")

    def test_bad_number_gives_default(self):
        self.secrets.WEATHER_LAT = None
        Path(self.profile.PATH).write_text('{"WEATHER_LAT": "north"}')
        self.assertIsNone(self.profile.get("WEATHER_LAT"))

    def test_save_merges_and_clears(self):
        self.profile.save({"GITHUB_USER": "me", "WEATHER_LAT": "12.5"})
        self.profile.save({"DISPLAY_NAME": "Me"})
        data = json.loads(Path(self.profile.PATH).read_text())
        self.assertEqual(data, {"GITHUB_USER": "me", "WEATHER_LAT": 12.5,
                                "DISPLAY_NAME": "Me"})
        self.profile.save({"DISPLAY_NAME": ""})
        self.assertIsNone(self.profile.get("DISPLAY_NAME"))
        with self.assertRaises(ValueError):
            self.profile.save({"WIFI_PASSWORD": "x"})
        with self.assertRaises(ValueError):
            self.profile.save({"TIMEZONE_OFFSET": "soon"})
        self.assertEqual(set(self.profile.values()), set(self.profile.KEYS))


class OsSettingsTest(_TmpCase):
    def setUp(self):
        super().setUp()
        api = load("oreoOS/api.py", "oreo_api_for_os_test")
        pkg = types.ModuleType("oreoOS")
        pkg.api, pkg.state = api, self.state
        disp = types.ModuleType("oreoWare.display")
        disp.Display = lambda: object()
        btns = types.ModuleType("oreoWare.buttons")
        btns.Buttons = lambda: object()
        ware = types.ModuleType("oreoWare")
        _Pkg(self, oreoOS=pkg, **{"oreoOS.api": api, "oreoOS.state": self.state,
                                  "oreoWare": ware, "oreoWare.display": disp,
                                  "oreoWare.buttons": btns})
        self.mod = load("oreoWare/os.py", "oreo_os_under_test")

    def test_settings_survive_a_new_os_object(self):
        a = self.mod.OS()
        a.settings_set("app_view", "categories")
        a.settings_set("idle_seconds", 300)
        b = self.mod.OS()   # what the next boot sees
        self.assertEqual(b.settings_get("app_view"), "categories")
        self.assertEqual(b.settings_get("idle_seconds"), 300)
        self.assertEqual(b.settings_get("missing", 1), 1)

    def test_ota_keys_are_per_boot(self):
        a = self.mod.OS()
        a.settings_set("ota_status", "ready")
        self.assertEqual(a.settings_get("ota_status"), "ready")
        self.assertIsNone(self.mod.OS().settings_get("ota_status"))

    def test_unchanged_value_does_not_rewrite(self):
        a = self.mod.OS()
        a.settings_set("k", 1)
        p = self.tmp + "/state/os.json"
        os.utime(p, (0, 0))
        a.settings_set("k", 1)
        self.assertEqual(os.stat(p).st_mtime, 0)


class CrashLogTest(unittest.TestCase):
    def setUp(self):
        self.mod = load("oreoOS/crashlog.py", "oreo_crashlog_under_test")
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def _raise(self):
        def inner():
            return None.x
        try:
            inner()
        except Exception as e:
            return e

    def test_record_logs_traceback_and_where(self):
        p = self.tmp + "/crash.log"
        info = self.mod.record(self._raise(), "app demo", path=p, echo=False)
        self.assertIn("AttributeError", info["message"])
        self.assertIn("test_app_platform.py:", info["where"])
        log = self.mod.read(p)
        self.assertIn("app demo", log)
        self.assertIn("Traceback", log)

    def test_last_frame_shortens_paths(self):
        tb = ('Traceback (most recent call last):\n'
              '  File "/remote/oreoOS/launcher.py", line 40, in run_app\n'
              '  File "apps/racer/src/app.py", line 212, in update\n'
              "AttributeError: 'NoneType' object has no attribute 'x'\n")
        self.assertEqual(self.mod.last_frame(tb), "apps/racer/src/app.py:212")
        self.assertEqual(self.mod.last_frame("no frames"), "")

    def test_log_is_capped(self):
        p = self.tmp + "/crash.log"
        self.mod.MAX_BYTES = 2000
        for _ in range(40):
            self.mod.record(self._raise(), "loop", path=p, echo=False)
        self.assertLessEqual(os.path.getsize(p), 2000)
        self.assertIn("Traceback", self.mod.read(p))


class ValidatorTest(unittest.TestCase):
    def setUp(self):
        self.v = load("tools/validate_app.py", "oreo_validate_under_test")
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def _app(self, name="my_app", manifest=None, main="from .src.app import App\n",
             app_src="class App:\n    pass\n"):
        d = self.tmp / name
        (d / "src").mkdir(parents=True)
        (d / "__init__.py").write_text("")
        (d / "src" / "__init__.py").write_text("")
        (d / "main.py").write_text(main)
        (d / "src" / "app.py").write_text(app_src)
        m = {"name": "My App", "version": "0.1", "type": "app",
             "description": "Does a thing."}
        m.update(manifest or {})
        (d / "manifest.json").write_text(json.dumps(m))
        return d

    def test_every_app_in_the_repo_passes(self):
        for folder in self.v.all_apps() + [ROOT / "app_templates"]:
            errors, _ = self.v.validate(folder)
            self.assertEqual(errors, [], folder.name)

    def test_template_has_no_warnings(self):
        self.assertEqual(self.v.validate(ROOT / "app_templates"), ([], []))

    def test_good_app(self):
        errors, warnings = self.v.validate(self._app())
        self.assertEqual(errors, [])
        self.assertTrue(any("icon" in w for w in warnings))

    def test_missing_app_export_and_bad_syntax(self):
        errors, _ = self.v.validate(self._app(main="X = 1\n",
                                              app_src="def broken(:\n"))
        self.assertTrue(any("does not expose App" in e for e in errors))
        self.assertTrue(any("does not compile" in e for e in errors))

    def test_folder_with_space_needs_a_slug(self):
        errors, _ = self.v.validate(self._app(name="My Pet"))
        self.assertTrue(any("slug" in e for e in errors), errors)
        errors, _ = self.v.validate(self._app(name="Other Pet",
                                              manifest={"slug": "pet2"}))
        self.assertEqual(errors, [])

    def test_manifest_problems(self):
        errors, _ = self.v.validate(self._app(manifest={"version": "",
                                                        "type": "theme"}))
        self.assertTrue(any("'version'" in e for e in errors))
        self.assertTrue(any("type" in e for e in errors))

    def test_secrets_and_hardware_imports(self):
        src = ("import machine\nfrom oreoWare import ir\n"
               "WIFI_PASSWORD = 'hunter22'\nclass App:\n    pass\n")
        errors, warnings = self.v.validate(self._app(app_src=src))
        self.assertTrue(any("credential" in e for e in errors))
        self.assertTrue(any("machine, oreoWare" in w for w in warnings))

    def test_cli_exit_codes(self):
        good = self._app()
        self.assertEqual(self.v.main(["-q", str(good)]), 0)
        self.assertEqual(self.v.main(["-q", "--strict", str(good)]), 1)
        bad = self._app(name="bad", main="")
        self.assertEqual(self.v.main(["-q", str(bad)]), 1)


class AppIconTest(unittest.TestCase):
    def setUp(self):
        try:
            import PIL  # noqa: F401
        except ImportError:
            self.skipTest("Pillow not installed")
        self.mod = load("tools/app_icon.py", "oreo_app_icon_under_test")
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def test_icon_png_becomes_a_32px_module(self):
        from PIL import Image
        app = self.tmp / "robot"
        app.mkdir()
        (app / "manifest.json").write_text('{"name": "Robot", "version": "1"}')
        Image.new("RGBA", (64, 40), (255, 0, 0, 255)).save(app / "icon.png")
        out = self.mod.build(app)
        self.assertEqual(out, app / "assets" / "optimized" / "robot_icon.py")
        self.assertTrue((app / "assets" / "__init__.py").exists())
        ns = {}
        exec(out.read_text(), ns)
        self.assertEqual((ns["W"], ns["H"]), (32, 32))
        self.assertEqual(len(ns["DATA"]), 32 * 32 * 2)
        # Letterboxed: the corner is the theme background, the middle red.
        self.assertEqual(ns["DATA"][0:2], bytes([0xFF, 0xDD]))
        mid = (16 * 32 + 16) * 2
        self.assertEqual(ns["DATA"][mid:mid + 2], b"\xf8\x00")
        manifest = json.loads((app / "manifest.json").read_text())
        self.assertEqual(manifest["icon"], "robot_icon.png")

    def test_template_icon_module_matches_the_manifest(self):
        # Exact bytes vary a little between Pillow versions, so check shape.
        app = ROOT / "app_templates"
        manifest = json.loads((app / "manifest.json").read_text())
        stem = self.mod.icon_stem(manifest, app.name)
        ns = {}
        exec((app / "assets" / "optimized" / (stem + ".py")).read_text(), ns)
        self.assertEqual((ns["W"], ns["H"], len(ns["DATA"])), (32, 32, 2048))
        self.assertTrue((app / "icon.png").is_file())

    def test_missing_png_is_an_error(self):
        app = self.tmp / "noicon"
        app.mkdir()
        (app / "manifest.json").write_text('{"name": "N", "version": "1"}')
        self.assertEqual(self.mod.main([str(app)]), 1)


class StorageBucketTest(unittest.TestCase):
    def test_state_profile_and_crash_log_are_misc(self):
        storage = load("oreoOS/storage.py", "oreo_storage_under_test")
        for p in ("state/racer.json", "profile.json", "crash.log"):
            self.assertEqual(storage._classify(p), "misc", p)


class ConfigDefaultsTest(unittest.TestCase):
    def test_no_maintainer_identity_without_env(self):
        prev = os.getcwd()
        with tempfile.TemporaryDirectory() as tmp:
            os.chdir(tmp)
            try:
                cfg = load("oreoOS/config.py", "oreo_config_blank_under_test")
            finally:
                os.chdir(prev)
        self.assertEqual(cfg.GITHUB_USER, "")
        self.assertEqual(cfg.DISPLAY_NAME, "")
        self.assertIsNone(cfg.WEATHER_LAT)
        self.assertEqual(cfg.TIMEZONE_OFFSET, 0)

    def test_profile_from_env(self):
        prev = os.getcwd()
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, ".env.local").write_text(
                "GITHUB_USER=me\nTIMEZONE_OFFSET=5.5\nWEATHER_LAT=1.5\n")
            os.chdir(tmp)
            try:
                cfg = load("oreoOS/config.py", "oreo_config_env_under_test")
            finally:
                os.chdir(prev)
        self.assertEqual(cfg.GITHUB_USER, "me")
        self.assertEqual(cfg.TIMEZONE_OFFSET, 5.5)
        self.assertEqual(cfg.WEATHER_LAT, 1.5)

    def test_env_example_lists_the_profile_keys(self):
        text = (ROOT / ".env.example").read_text()
        for k in ("GITHUB_USER", "DISPLAY_NAME", "DISPLAY_DESIGNATION",
                  "TIMEZONE_OFFSET", "WEATHER_LAT", "WEATHER_LON",
                  "OWM_API_KEY", "WIFI_SSID", "WIFI_PASSWORD"):
            self.assertIn("\n%s=\n" % k, text)


class ShippedFilesTest(unittest.TestCase):
    """Every OS module must reach the badge, by USB deploy and by OTA.
    netsvc.py and perf.py (#121) were missing from both lists, so the
    launcher's optional import silently ran without them."""

    def _modules(self):
        return sorted(p.relative_to(ROOT).as_posix()
                      for d in ("oreoOS", "oreoWare")
                      for p in (ROOT / d).glob("*.py"))

    def test_deploy_lists_every_module(self):
        text = (ROOT / "tools" / "deploy.py").read_text()
        for rel in self._modules():
            self.assertIn('("%s",' % rel, text, rel)

    def test_release_ships_every_module(self):
        release = load("tools/build_release.py", "oreo_release_under_test")
        shipped = {rel for _, rel in release._collect_paths()}
        for rel in self._modules():
            self.assertIn(rel, shipped, rel)

    def test_release_never_ships_an_avatar(self):
        """#133: a checkout that still has the old avatar module (one
        person's face) must not put it in a release."""
        import shutil
        import tempfile
        release = load("tools/build_release.py", "oreo_release_never_ship")
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, True)
        for rel in ("apps/badge/assets/optimized/avatar.py",
                    "apps/badge/assets/optimized/__init__.py",
                    "oreoOS/profile.py"):
            (tmp / rel).parent.mkdir(parents=True, exist_ok=True)
            (tmp / rel).write_text("")
        release.REPO_ROOT = tmp
        shipped = {rel for _, rel in release._collect_paths()}
        self.assertIn("oreoOS/profile.py", shipped)
        self.assertIn("apps/badge/assets/optimized/__init__.py", shipped)
        self.assertNotIn("apps/badge/assets/optimized/avatar.py", shipped)


if __name__ == "__main__":
    unittest.main()
