"""The badge's progress screen (oreoOS/hostui.py) during long commands.

FaleraOS gains `oreoOS/hostui.py` with show(title, detail="", progress=None)
and clear(), callable over the raw REPL while FaleraOS is paused. The CLI
calls it during push, pull, add, app install, App Store installs and
updates, piggybacked on execs it sends anyway, and clears it at the end.
These tests check the calls arrive, that a FaleraOS without hostui (or a
hostui that fails) changes nothing, and that it costs no extra round trips.
"""

import os
import tempfile
import types
import unittest
from pathlib import Path

from fake import FakeTransport
from helpers import run_cli
from test_update import FakeOta

from oreo_cli.badge import Badge, screen_code


class Recorder(types.ModuleType):
    """A stand-in oreoOS.hostui that records what the badge would draw."""

    def __init__(self, fail=False):
        super().__init__("oreoOS.hostui")
        self.calls = []
        self.fail = fail

    def show(self, title, detail="", progress=None):
        self.calls.append(("show", title, detail, progress))
        if self.fail:
            raise OSError(5)      # a display error must not break the copy

    def clear(self):
        self.calls.append(("clear",))
        if self.fail:
            raise OSError(5)

    def shows(self, title=None):
        return [c for c in self.calls if c[0] == "show" and (title is None or c[1] == title)]


class HostUITest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, True))

    def screen(self, fail=False):
        rec = Recorder(fail)
        self.fake.modules["oreoOS.hostui"] = rec
        return rec

    def local(self, name, data):
        p = self.tmp / name
        p.write_bytes(data)
        return str(p)

    # ── the snippet ──────────────────────────────────────────────────
    def test_snippet_follows_the_contract(self):
        code = screen_code("Receiving files", "photo.jpg", 0.4)
        self.assertIn("from oreoOS import hostui", code)
        self.assertIn("show('Receiving files','photo.jpg',0.4)", code)
        self.assertIn("except Exception", code)
        self.assertIn("clear()", screen_code(None))
        self.assertIn(",None)", screen_code("Installing", "x"))
        self.assertIn(",1.0)", screen_code("t", "d", 7))     # clamped to 0..1

    # ── push / pull ──────────────────────────────────────────────────
    def test_push_shows_progress_and_clears(self):
        rec = self.screen()
        data = os.urandom(30000)
        r = run_cli(["push", self.local("big.bin", data), "/documents/"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.fake.get("/documents/big.bin"), data)
        shows = rec.shows("Receiving files")
        self.assertEqual(len(shows), 4)                   # once per exec: 4 chunks of 8 KiB
        self.assertEqual([s[2] for s in shows], ["big.bin"] * 4)
        progress = [s[3] for s in shows]
        self.assertEqual(progress, sorted(progress))
        self.assertEqual(progress[0], 0.0)
        self.assertEqual(rec.calls[-1], ("clear",))

    def test_push_costs_no_extra_round_trips(self):
        self.screen()
        data = os.urandom(30000)
        b = Badge(self.fake)
        b.write_file(data, "/a.bin", check_space=False, screen=("Receiving files", "a.bin"))
        with_screen = len(self.fake.sent)
        self.fake.sent.clear()
        b.write_file(data, "/b.bin", check_space=False)
        self.assertEqual(with_screen, len(self.fake.sent))

    def test_push_without_hostui_still_works(self):
        data = os.urandom(20000)
        r = run_cli(["push", self.local("a.bin", data), "/documents/"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.fake.get("/documents/a.bin"), data)
        self.assertTrue(any("from oreoOS import hostui" in c for c in self.fake.sent))

    def test_failing_hostui_never_breaks_a_push(self):
        rec = self.screen(fail=True)
        data = os.urandom(20000)
        r = run_cli(["push", self.local("a.bin", data), "/documents/"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.fake.get("/documents/a.bin"), data)
        self.assertTrue(rec.shows())

    def test_multi_file_push_counts_files(self):
        rec = self.screen()
        a, b = self.local("a.txt", b"one"), self.local("b.txt", b"two")
        r = run_cli(["push", a, b, "/documents/"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        details = {s[2] for s in rec.shows()}
        self.assertIn("a.txt (1 of 2)", details)
        self.assertIn("b.txt (2 of 2)", details)

    def test_pull_shows_progress(self):
        rec = self.screen()
        data = os.urandom(100000)
        self.fake.put("/documents/big.bin", data)
        r = run_cli(["pull", "/documents/big.bin", str(self.tmp) + "/"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual((self.tmp / "big.bin").read_bytes(), data)
        shows = rec.shows("Sending files")
        self.assertEqual(shows[0][3], 0.0)
        self.assertGreater(len(shows), 1)               # every 8 chunks as it sends
        self.assertEqual(rec.calls[-1], ("clear",))

    def test_pull_without_hostui_still_works(self):
        data = os.urandom(50000)
        self.fake.put("/documents/x.bin", data)
        r = run_cli(["pull", "/documents/x.bin", str(self.tmp) + "/"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual((self.tmp / "x.bin").read_bytes(), data)

    def test_failed_command_still_clears(self):
        rec = self.screen()
        self.fake.fail_on = "os.rename("          # the final check-and-rename fails
        r = run_cli(["push", self.local("a.bin", b"x" * 20000), "/documents/"],
                    fake=self.fake)
        self.assertNotEqual(r.rc, 0)
        self.assertEqual(rec.calls[-1], ("clear",))

    # ── add / app install / App Store / update ───────────────────────
    def test_add_document(self):
        rec = self.screen()
        r = run_cli(["add", self.local("notes.md", b"# Hello\n\nworld\n")], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertTrue(rec.shows("Adding to the Reader"))
        self.assertEqual(rec.calls[-1], ("clear",))

    def test_app_install_from_folder(self):
        rec = self.screen()
        r = run_cli(["new", "pet", "--author", "me", "--dir", str(self.tmp)])
        self.assertEqual(r.rc, 0, r.out)
        r = run_cli(["app", "install", str(self.tmp / "pet")], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        shows = rec.shows("Installing Pet")
        self.assertTrue(shows)
        self.assertTrue(any("of" in s[2] for s in shows))
        self.assertEqual(rec.calls[-1], ("clear",))

    def test_app_store_install(self):
        rec = self.screen()
        self.fake.wifi.saved = [{"ssid": "Home", "password": "pw", "priority": 1}]
        r = run_cli(["apps", "install", "snake"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        shows = rec.shows("Installing app")
        self.assertEqual(shows[0][2], "Snake")
        self.assertEqual(shows[-1][3], 1.0)
        self.assertEqual(rec.calls[-1], ("clear",))

    def test_app_store_install_without_hostui(self):
        self.fake.wifi.saved = [{"ssid": "Home", "password": "pw", "priority": 1}]
        r = run_cli(["apps", "install", "snake"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertTrue(self.fake.exists("/apps/snake/main.py"))

    def _ota(self):
        ota = FakeOta(self.fake)
        self.fake.modules["oreoOS.ota"] = ota
        self.fake.wifi.add_saved("Home", "hunter2!")
        return ota

    def test_update_shows_each_step(self):
        rec = self.screen()
        self._ota()
        r = run_cli(["update"], fake=self.fake, interactive=True, inputs=["y"])
        self.assertEqual(r.rc, 0, r.out)
        titles = [s[1] for s in rec.shows()]
        self.assertIn("Updating FaleraOS", titles)
        self.assertIn("Downloading FaleraOS v2.1.0", titles)
        self.assertIn("Installing FaleraOS v2.1.0", titles)
        files = [s for s in rec.shows("Downloading FaleraOS v2.1.0")]
        self.assertEqual(len(files), 3)
        self.assertEqual(files[-1][3], 1.0)

    def test_update_check_clears(self):
        rec = self.screen()
        self._ota()
        r = run_cli(["update", "--check"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("Checking for updates", [s[1] for s in rec.shows()])
        self.assertEqual(rec.calls[-1], ("clear",))

    def test_update_without_hostui(self):
        self._ota()
        r = run_cli(["update"], fake=self.fake, interactive=True, inputs=["y"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("is installed and running", r.out)

    def test_nothing_shown_means_nothing_to_clear(self):
        self.screen()
        r = run_cli(["ls", "/"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertFalse(any("hostui" in c for c in self.fake.sent))


if __name__ == "__main__":
    unittest.main()
