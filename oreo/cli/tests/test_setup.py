"""`falera setup`: the owner profile in /profile.json, against the FakeTransport.

Inside a FaleraOS checkout the file the CLI writes is read back with the
real oreoOS/profile.py, so the CLI and the badge agree on its format.
"""

import importlib.util
import io
import json
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

from helpers import run_cli

from fake import FakeTransport
from oreo_cli import owner
from oreo_cli.errors import UsageError

REPO = Path(__file__).resolve().parents[2]
PROFILE = REPO / "oreoOS" / "profile.py"
STATE = REPO / "oreoOS" / "state.py"
KEY = "0123456789abcdef0123456789abcdef"


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class ValidateTest(unittest.TestCase):
    def test_timezone_forms(self):
        for text, want in (("5.5", 5.5), ("-4", -4.0), ("+05:30", 5.5), ("UTC+5:45", 5.75),
                           ("14", 14.0), ("-12", -12.0), ("0", 0.0), ("-3:30", -3.5)):
            self.assertEqual(owner.parse_offset(text), want, text)

    def test_timezone_out_of_range_or_odd(self):
        for text in ("15", "-13", "5.3", "abc", "5:75", "nan", "inf"):
            with self.assertRaises(UsageError, msg=text):
                owner.parse_offset(text)

    def test_lat_lon_ranges(self):
        self.assertEqual(owner.validate("WEATHER_LAT", "12.97"), 12.97)
        self.assertEqual(owner.validate("WEATHER_LON", "-180"), -180.0)
        for key, bad in (("WEATHER_LAT", "90.1"), ("WEATHER_LAT", "-91"),
                         ("WEATHER_LON", "181"), ("WEATHER_LON", "east")):
            with self.assertRaises(UsageError, msg=(key, bad)):
                owner.validate(key, bad)

    def test_github_user(self):
        self.assertEqual(owner.validate("GITHUB_USER", "@octo-cat"), "octo-cat")
        for bad in ("-octo", "octo-", "oc--to", "a" * 40, "has space"):
            with self.assertRaises(UsageError, msg=bad):
                owner.validate("GITHUB_USER", bad)

    def test_empty_means_remove(self):
        self.assertEqual(owner.validate("DISPLAY_DESIGNATION", "  "), "")

    def test_text_fields_are_plain_ascii(self):
        self.assertEqual(owner.validate("DISPLAY_NAME", "Mona O'Hara-Lisa"),
                         "Mona O'Hara-Lisa")
        for key, bad in (("DISPLAY_NAME", "Jos\u00e9"), ("DISPLAY_DESIGNATION", "Lead \u2014 Firmware"),
                         ("WEATHER_NAME", "M\u00fcnchen"), ("DISPLAY_NAME", "x\x7f")):
            with self.assertRaises(UsageError, msg=(key, bad)) as cm:
                owner.validate(key, bad)
            self.assertIn("ASCII", cm.exception.message)

    def test_bad_key_is_never_quoted(self):
        with self.assertRaises(UsageError) as cm:
            owner.validate("OWM_API_KEY", "short-secret!")
        self.assertNotIn("short-secret", cm.exception.message + (cm.exception.hint or ""))

    def test_keys_match_the_badge(self):
        if not PROFILE.exists():
            self.skipTest("not inside a FaleraOS checkout")
        src = PROFILE.read_text()
        import ast
        tree = ast.parse(src)
        found = {}
        for node in tree.body:
            if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
                if node.targets[0].id in ("KEYS", "_NUMERIC", "PATH"):
                    found[node.targets[0].id] = ast.literal_eval(node.value)
        self.assertEqual(found["KEYS"], owner.KEYS)
        self.assertEqual(found["_NUMERIC"], owner.NUMERIC)
        self.assertEqual(found["PATH"], owner.PATH)


class SetupCommandTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)

    def profile(self):
        return json.loads(self.fake.get("/profile.json"))

    def run_setup(self, *argv, **kw):
        return run_cli(["setup"] + list(argv), fake=self.fake, **kw)

    def test_flags_write_profile_json(self):
        r = self.run_setup("--github-user", "octocat", "--name", "Mona Lisa",
                           "--timezone", "+05:30", "--lat", "12.97", "--lon", "77.59",
                           "--weather-name", "Bengaluru")
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.profile(), {
            "GITHUB_USER": "octocat", "DISPLAY_NAME": "Mona Lisa", "TIMEZONE_OFFSET": 5.5,
            "WEATHER_LAT": 12.97, "WEATHER_LON": 77.59, "WEATHER_NAME": "Bengaluru"})
        self.assertIn("saved /profile.json", r.out)
        self.assertIn("FaleraOS is restarting", r.out)
        self.assertIn("UTC+5:30", r.out)
        self.assertEqual(self.fake.restarts, ["soft"])
        self.assertFalse(self.fake.exists("/profile.json.tmp"))
        # staged as the .tmp that state.read_json falls back to, then renamed
        write = [c for c in self.fake.sent if "os.rename(" in c]
        self.assertEqual(len(write), 1)
        self.assertIn("w=%r+'.tmp'" % "/profile.json", write[0])
        self.assertNotIn(".part", write[0])

    def test_merges_and_removes(self):
        self.fake.put("/profile.json", json.dumps(
            {"GITHUB_USER": "old", "DISPLAY_DESIGNATION": "Intern", "OWM_API_KEY": KEY,
             "EXTRA": "kept"}).encode())
        r = self.run_setup("--github-user", "new", "--designation", "")
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.profile(), {"GITHUB_USER": "new", "OWM_API_KEY": KEY,
                                          "EXTRA": "kept"})
        self.assertIn("remove Title", r.out)

    def test_key_never_leaves_the_badge_or_shows(self):
        self.fake.put("/profile.json", json.dumps({"OWM_API_KEY": KEY}).encode())
        r = self.run_setup("--show")
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("set (hidden)", r.out)
        self.assertNotIn(KEY, r.out)
        for out in self.fake.outputs:
            self.assertNotIn(KEY.encode(), out)
        self.assertFalse(any("os.rename(" in c for c in self.fake.sent))   # --show writes nothing

    def test_key_from_stdin_is_sent_once_and_not_printed(self):
        with mock.patch.object(sys, "stdin", io.StringIO(KEY + "\n")):
            r = self.run_setup("--owm-key-stdin")
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.profile(), {"OWM_API_KEY": KEY})
        self.assertNotIn(KEY, r.out)
        self.assertEqual(sum(KEY in c for c in self.fake.sent), 1)
        for out in self.fake.outputs:
            self.assertNotIn(KEY.encode(), out)

    def test_key_flag_warns_about_history(self):
        r = self.run_setup("--owm-key", KEY)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("shell history", r.out)
        self.assertNotIn(KEY, r.out)

    def test_secrets_py_values_are_shown_with_their_source(self):
        sec = types.ModuleType("secrets")
        sec.GITHUB_USER = "deployed"
        sec.OWM_API_KEY = KEY
        sec.WIFI_PASSWORD = "never-sent-back"
        self.fake.modules = {"secrets": sec}
        r = self.run_setup("--show")
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("deployed", r.out)
        self.assertIn("secrets.py", r.out)
        self.assertNotIn(KEY, r.out)
        self.assertNotIn("never-sent-back", "".join(o.decode() for o in self.fake.outputs))

    def test_bad_values_fail_before_the_badge(self):
        for argv in (["--timezone", "20"], ["--lat", "100"], ["--lon", "x"],
                     ["--github-user", "bad name"]):
            r = run_cli(["setup"] + argv)       # no fake: touching the badge fails the test
            self.assertEqual(r.rc, 2, (argv, r.out))
            self.assertEqual(r.links, [])

    def test_no_terminal_and_no_flags(self):
        r = run_cli(["setup"])
        self.assertEqual(r.rc, 2)
        self.assertIn("no terminal", r.out)
        self.assertEqual(r.links, [])

    def test_show_with_values_is_a_usage_error(self):
        r = run_cli(["setup", "--show", "--name", "x"])
        self.assertEqual(r.rc, 2)

    def test_interactive_prompts(self):
        self.fake.put("/profile.json", json.dumps(
            {"GITHUB_USER": "octocat", "DISPLAY_DESIGNATION": "Intern"}).encode())
        secrets_asked = []

        def secret(prompt):
            secrets_asked.append(prompt)
            return KEY
        # GitHub user kept, name set, title removed, bad then good timezone,
        # lat/lon set, place name left empty, key typed; then confirm.
        answers = ["", "Mona", "-", "99", "-4", "40.7", "-74", "", "y"]
        r = self.run_setup(interactive=True, inputs=answers, secret=secret)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.profile(), {
            "GITHUB_USER": "octocat", "DISPLAY_NAME": "Mona", "TIMEZONE_OFFSET": -4.0,
            "WEATHER_LAT": 40.7, "WEATHER_LON": -74.0, "OWM_API_KEY": KEY})
        self.assertIn("out of range", r.out)
        self.assertEqual(len(secrets_asked), 1)
        self.assertIn("not set", secrets_asked[0])
        self.assertNotIn(KEY, r.out)

    def test_interactive_bad_key_asks_again(self):
        asked = []
        typed = iter(["short-secret!", KEY])

        def secret(prompt):
            asked.append(prompt)
            return next(typed)
        answers = ["octocat", "Mona", "", "", "", "", "", "y"]
        r = self.run_setup(interactive=True, inputs=answers, secret=secret)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(len(asked), 2)
        self.assertIn("does not look like an OpenWeatherMap API key", r.out)
        self.assertNotIn("short-secret", r.out)
        self.assertNotIn(KEY, r.out)
        # the answers typed before the bad key are kept
        self.assertEqual(self.profile(), {"GITHUB_USER": "octocat", "DISPLAY_NAME": "Mona",
                                          "OWM_API_KEY": KEY})

    def test_bad_ascii_name_fails_before_the_badge(self):
        r = run_cli(["setup", "--name", "Jos\u00e9"])
        self.assertEqual(r.rc, 2, r.out)
        self.assertIn("ASCII", r.out)
        self.assertEqual(r.links, [])

    def test_interactive_nothing_changed(self):
        r = self.run_setup(interactive=True, inputs=[""] * 7, secret=lambda p: "")
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("nothing changed", r.out)
        self.assertFalse(self.fake.exists("/profile.json"))

    def test_interactive_decline(self):
        r = self.run_setup(interactive=True, inputs=["octocat", "", "", "", "", "", "", "n"],
                           secret=lambda p: "")
        self.assertEqual(r.rc, 130, r.out)
        self.assertFalse(self.fake.exists("/profile.json"))

    def test_repairs_a_cut_short_save(self):
        self.fake.put("/profile.json.tmp", json.dumps({"GITHUB_USER": "saved"}).encode())
        r = self.run_setup("--name", "Me")
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("cut short", r.out)
        self.assertEqual(self.profile(), {"GITHUB_USER": "saved", "DISPLAY_NAME": "Me"})
        self.assertFalse(self.fake.exists("/profile.json.tmp"))

    def test_corrupt_file_is_replaced(self):
        self.fake.put("/profile.json", b"{not json")
        r = self.run_setup("--name", "Me")
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("not valid JSON", r.out)
        self.assertEqual(self.profile(), {"DISPLAY_NAME": "Me"})

    def test_reset_none_says_how_to_restart(self):
        r = run_cli(["--reset", "none", "setup", "--name", "Me"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("--reset none", r.out)

    def badge_profile(self):
        """The real oreoOS/profile.py, reading the fake badge's /profile.json."""
        state = load(STATE, "oreo_state_for_cli_test")
        pkg = types.ModuleType("oreoOS")
        pkg.state = state
        saved = {k: sys.modules.get(k) for k in ("oreoOS", "oreoOS.state", "secrets")}
        sys.modules.update({"oreoOS": pkg, "oreoOS.state": state,
                            "secrets": types.ModuleType("secrets")})
        try:
            profile = load(PROFILE, "oreo_profile_for_cli_test")
        finally:
            for k, v in saved.items():
                if v is None:
                    sys.modules.pop(k, None)
                else:
                    sys.modules[k] = v
        profile.PATH = self.fake.os._real("/profile.json")
        return profile

    def fat_rename(self, cut=False):
        """FAT's rename: refuses an existing target. With cut=True the power
        goes before the rename that follows the remove."""
        real_rename = self.fake.os.rename

        def rename(a, b):
            if self.fake.exists(b):
                raise OSError(17)
            if cut:
                raise RuntimeError("power cut")
            return real_rename(a, b)
        self.fake.os.rename = rename
        return real_rename

    def test_fat_rename_fallback(self):
        self.fake.put("/profile.json", json.dumps({"GITHUB_USER": "old"}).encode())
        self.fat_rename()
        r = self.run_setup("--name", "Me")
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.profile(), {"GITHUB_USER": "old", "DISPLAY_NAME": "Me"})
        self.assertFalse(self.fake.exists("/profile.json.tmp"))

    @unittest.skipUnless(PROFILE.exists(), "not inside a FaleraOS checkout")
    def test_power_cut_between_remove_and_rename_keeps_the_profile(self):
        self.fake.put("/profile.json", json.dumps({"GITHUB_USER": "old"}).encode())
        real_rename = self.fat_rename(cut=True)
        r = self.run_setup("--github-user", "octocat", "--name", "Me")
        self.assertNotEqual(r.rc, 0, r.out)
        self.assertFalse(self.fake.exists("/profile.json"))
        self.assertTrue(self.fake.exists("/profile.json.tmp"))
        profile = self.badge_profile()
        self.assertEqual(profile.get("GITHUB_USER"), "octocat")
        self.assertEqual(profile.get("DISPLAY_NAME"), "Me")
        # and the next `falera setup` sees the backup and repairs it
        self.fake.os.rename = real_rename
        r = self.run_setup("--designation", "Firmware")
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("cut short", r.out)
        self.assertEqual(self.profile(), {"GITHUB_USER": "octocat", "DISPLAY_NAME": "Me",
                                          "DISPLAY_DESIGNATION": "Firmware"})
        self.assertFalse(self.fake.exists("/profile.json.tmp"))

    @unittest.skipUnless(PROFILE.exists(), "not inside a FaleraOS checkout")
    def test_badge_profile_module_reads_what_was_written(self):
        r = self.run_setup("--github-user", "octocat", "--timezone", "5.75", "--lat", "-33.9",
                           "--lon", "151.2", "--owm-key", KEY)
        self.assertEqual(r.rc, 0, r.out)
        profile = self.badge_profile()
        self.assertTrue(profile.is_set_up())
        self.assertEqual(profile.get("GITHUB_USER"), "octocat")
        self.assertEqual(profile.get("TIMEZONE_OFFSET"), 5.75)
        self.assertEqual(profile.get("WEATHER_LAT"), -33.9)
        self.assertEqual(profile.get("OWM_API_KEY"), KEY)
        # and the badge's own save() accepts the file and merges into it
        profile.save({"DISPLAY_DESIGNATION": "Firmware"})
        self.assertEqual(self.profile()["DISPLAY_DESIGNATION"], "Firmware")


if __name__ == "__main__":
    unittest.main()


class FromFileAndSetTest(unittest.TestCase):
    """--from-file (.env-style, e.g. .env.local) and --set KEY=VALUE."""

    ENV = (
        "# my .env.local\n"
        "POLLINATIONS_KEY=pk_should_never_be_read_or_shown\n"
        "WIFI_SSID=Home\n"
        "WIFI_PASSWORD=hunter2hunter2\n"
        "GH_TOKEN=ghp_tokentokentokentokentokentokentoken\n"
        "export DISPLAY_NAME=\"Ayushman B\"\n"
        "DISPLAY_DESIGNATION='OSS Maintainer'\n"
        "TIMEZONE_OFFSET=5.5  # IST\n"
        "OWM_API_KEY=" + KEY + "\n"
        "WEATHER_LAT=\n"
    )

    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)
        import tempfile
        d = tempfile.mkdtemp()
        self.path = Path(d) / ".env.local"
        self.path.write_text(self.ENV)

    def profile(self):
        return json.loads(self.fake.get("/profile.json"))

    def test_file_takes_only_profile_keys_and_shows_no_values(self):
        r = run_cli(["setup", "--from-file", str(self.path)], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.profile(), {
            "DISPLAY_NAME": "Ayushman B", "DISPLAY_DESIGNATION": "OSS Maintainer",
            "TIMEZONE_OFFSET": 5.5, "OWM_API_KEY": KEY})
        for secret in ("pk_should_never", "hunter2", "ghp_token", KEY):
            self.assertNotIn(secret, r.out)
            self.assertFalse(any(secret in c for c in self.fake.sent if secret != KEY),
                             secret)
        self.assertIn("left alone (not profile keys)", r.out)
        self.assertIn("WIFI_PASSWORD", r.out)       # named, never valued
        self.assertIn("finds the badge's location", r.out)

    def test_older_designation_name_in_a_file(self):
        self.path.write_text("DESIGNATION=Old name\n")
        got, ignored = owner.updates_from_file(self.path)
        self.assertEqual(got, {"DISPLAY_DESIGNATION": "Old name"})
        self.assertEqual(ignored, [])

    def test_set_one_by_one_and_precedence(self):
        r = run_cli(["setup", "--from-file", str(self.path),
                     "--set", "display_name=From Set", "--set", "GITHUB_USER=octocat",
                     "--name", "From Flag"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        p = self.profile()
        self.assertEqual(p["DISPLAY_NAME"], "From Flag")   # file < --set < flags
        self.assertEqual(p["GITHUB_USER"], "octocat")

    def test_set_removes_and_rejects(self):
        self.fake.put("/profile.json", json.dumps({"WEATHER_NAME": "X"}).encode())
        r = run_cli(["setup", "--set", "WEATHER_NAME="], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertNotIn("WEATHER_NAME", self.profile())
        for bad in ("WIFI_PASSWORD=x", "nonsense", "TIMEZONE_OFFSET=99"):
            r = run_cli(["setup", "--set", bad])    # no fake: must fail before the badge
            self.assertEqual(r.rc, 2, (bad, r.out))
