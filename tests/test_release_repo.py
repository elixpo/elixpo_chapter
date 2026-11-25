"""tools/release.py publishes to the repository badges update from (#134).

The repository comes from OTA_REPO in oreoOS/ota.py, or --repo, and every
GitHub URL and gh command in the release flow uses it. Nothing here runs
git, gh or the network: --dry-run only prints, and the checks that would
call git are replaced.
"""

import contextlib
import importlib.util
import io
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent


def load():
    spec = importlib.util.spec_from_file_location("oreo_release_repo_test",
                                                  ROOT / "tools" / "release.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class RepoTest(unittest.TestCase):
    def setUp(self):
        self.r = load()

    def test_reads_ota_repo_from_ota_py(self):
        text = (ROOT / "oreoOS" / "ota.py").read_text()
        self.assertEqual(self.r.ota_repo(text), "elixpo/falera")
        self.assertEqual(self.r.resolve_repo(),
                         ("elixpo/falera", "OTA_REPO in oreoOS/ota.py"))

    def test_a_fork_needs_only_ota_repo(self):
        text = 'X = 1\nOTA_REPO       = "you/falera"      # owner/repo on GitHub\n'
        self.assertEqual(self.r.resolve_repo(ota_text=text)[0], "you/falera")

    def test_override_wins(self):
        self.assertEqual(self.r.resolve_repo("me/badge-os", ota_text='OTA_REPO = "a/b"\n'),
                         ("me/badge-os", "--repo"))

    def test_missing_or_bad_values_stop_the_release(self):
        for text in ("STAGE_DIR = '/_ota'\n", "OTA_REPO = some_name\n",
                     "OTA_REPO = 'no-slash'\n", "OTA_REPO = 'a/b/c'\n", "OTA_REPO = 3\n"):
            with self.subTest(text=text), self.assertRaises(SystemExit):
                self.r.resolve_repo(ota_text=text)
        for bad in ("bad repo", "owner/", "/name", "-x/y", "a/b.git", "https://github.com/a/b"):
            with self.subTest(repo=bad), self.assertRaises(SystemExit):
                self.r.resolve_repo(bad)

    def test_asset_base_url(self):
        self.assertEqual(self.r.asset_base_url("you/falera", "beta/v9.1.0"),
                         "https://github.com/you/falera/releases/download/beta/v9.1.0/")

    def test_origin_url_forms(self):
        for url in ("https://github.com/you/falera.git", "https://github.com/you/falera",
                    "git@github.com:you/falera.git", "ssh://git@github.com/you/falera.git\n",
                    "https://github.com/you/falera/"):
            with self.subTest(url=url):
                self.assertEqual(self.r.repo_from_url(url), "you/falera")
        self.assertIsNone(self.r.repo_from_url("https://gitlab.com/you/falera.git"))
        self.assertIsNone(self.r.repo_from_url(""))


class DryRunTest(unittest.TestCase):
    """--dry-run shows the derived repository and uses it everywhere."""

    def dry_run(self, *argv, origin="you/falera", ota='OTA_REPO = "you/falera"\n'):
        r = load()
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        r.OTA = Path(d) / "ota.py"
        r.OTA.write_text(ota)
        out = io.StringIO()
        with mock.patch.object(r, "_origin_repo", lambda: origin), \
                mock.patch.object(r.shutil, "which", lambda tool: "/usr/bin/" + tool), \
                mock.patch.object(r.subprocess, "run",
                                  side_effect=AssertionError("ran a command")), \
                contextlib.redirect_stdout(out):
            try:
                r.main(["v9.0.0", "--dry-run"] + list(argv))
            except SystemExit as e:
                return out.getvalue(), e.code
        return out.getvalue(), None

    def test_fork_release_never_mentions_upstream(self):
        out, code = self.dry_run()
        self.assertIsNone(code, out)
        self.assertIn("Repo: you/falera (OTA_REPO in oreoOS/ota.py)", out)
        self.assertIn("--asset-base-url https://github.com/you/falera/releases/download/"
                      "stable/v9.0.0/", out)
        self.assertIn("gh release create stable/v9.0.0 --repo you/falera", out)
        self.assertNotIn("elixpo/falera", out)

    def test_repo_flag(self):
        out, code = self.dry_run("--repo", "me/staging", "--channel", "beta",
                                 origin="me/staging")
        self.assertIsNone(code, out)
        self.assertIn("Repo: me/staging (--repo)", out)
        self.assertIn("https://github.com/me/staging/releases/download/beta/v9.0.0/", out)
        self.assertIn("--repo me/staging", out)
        # badges from this checkout would not see it: say so
        self.assertIn("update from you/falera", out)

    def test_origin_elsewhere_is_flagged(self):
        out, code = self.dry_run(origin="elixpo/falera")
        self.assertIsNone(code, out)          # a dry run only warns
        self.assertIn("`origin` is elixpo/falera", out)

    def test_origin_elsewhere_stops_a_real_release(self):
        r = load()
        with mock.patch.object(r, "_origin_repo", lambda: "elixpo/falera"), \
                contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit):
                r._check_origin("you/falera", dry=False)
            r._check_origin("Elixpo/Falera", dry=False)  # same repo, other case
            r._check_origin("elixpo/falera", dry=False)


class NoHardcodedRepoTest(unittest.TestCase):
    def test_release_py_names_no_repository(self):
        text = (ROOT / "tools" / "release.py").read_text()
        self.assertNotIn("elixpo/falera", text)


if __name__ == "__main__":
    unittest.main()
