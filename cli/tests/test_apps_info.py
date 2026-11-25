"""`falera apps`, `falera info` and the interactive view."""

import json
import unittest

from fake import FakeTransport
from helpers import run_cli


class AppsTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)

    def online(self):
        self.fake.wifi.saved = [{"ssid": "Home", "password": "pw", "priority": 1}]

    def test_list_offline(self):
        r = run_cli(["apps"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("Settings", r.out)
        self.assertIn("built in", r.out)
        self.assertNotIn("launcher", r.out)
        self.assertIn("falera apps refresh", r.out)

    def test_install_needs_wifi(self):
        r = run_cli(["apps", "install", "snake"], fake=self.fake)
        self.assertEqual(r.rc, 1)
        self.assertIn("could not get online", r.out)
        self.assertIn("falera wifi", r.out)

    def test_install_update_remove(self):
        self.online()
        r = run_cli(["apps", "install", "snake"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("snake installed", r.out)
        self.assertTrue(self.fake.exists("/apps/snake/main.py"))

        r = run_cli(["apps", "install", "doom"], fake=self.fake)
        self.assertEqual(r.rc, 1)
        self.assertIn("not in the App Store", r.out)

        r = run_cli(["apps", "update"], fake=self.fake)
        self.assertIn("up to date", r.out)
        self.fake.store.remote[0]["version"] = "1.2"
        r = run_cli(["apps", "update"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("snake updated", r.out)
        m = json.loads(self.fake.get("/apps/snake/manifest.json"))
        self.assertEqual(m["version"], "1.2")

        r = run_cli(["apps", "remove", "snake"], fake=self.fake)   # no terminal: refused
        self.assertEqual(r.rc, 130)
        r = run_cli(["-y", "apps", "remove", "snake"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertFalse(self.fake.exists("/apps/snake"))

    def test_refresh_shows_catalogue(self):
        self.online()
        r = run_cli(["apps", "refresh"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("Snake", r.out)
        self.assertIn("Pet", r.out)


class InfoTest(unittest.TestCase):
    def test_info(self):
        fake = FakeTransport()
        self.addCleanup(fake.cleanup)
        r = run_cli(["info"], fake=fake)
        self.assertEqual(r.rc, 0, r.out)
        for text in ("v2.0.0", "MicroPython 1.28.0", "Elixpo Falera Badge", "87%",
                     "not connected", "gallery", "documents", "free"):
            self.assertIn(text, r.out)
        self.assertEqual(fake.restarts, ["soft"])

    def test_info_without_oreoos_modules(self):
        fake = FakeTransport()
        self.addCleanup(fake.cleanup)
        fake.modules = {"oreoOS.config": None}
        r = run_cli(["info"], fake=fake)
        self.assertEqual(r.rc, 0, r.out)


class InteractiveTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)

    def test_status_only_without_terminal(self):
        r = run_cli([], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("v2.0.0", r.out)
        self.assertIn("status only", r.out)
        self.assertEqual(self.fake.restarts, ["soft"])

    def test_menu_browses_files_and_apps(self):
        self.fake.put("/documents/talk.mdz", b"x" * 10)
        r = run_cli([], fake=self.fake, interactive=True,
                    inputs=["2", "2", "..", "q", "3", "q", "4", "q", "9", "q"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("talk.mdz", r.out)
        self.assertIn("catalogue not downloaded yet", r.out)
        self.assertIn("networks saved", r.out)
        self.assertIn("choose one of", r.out)
        self.assertEqual(self.fake.enters, 1)
        self.assertEqual(self.fake.restarts, ["soft"])

    def test_no_badge(self):
        r = run_cli([], ports=[])
        self.assertEqual(r.rc, 3)
        self.assertIn("no Falera Badge found", r.out)
        self.assertEqual(r.links, [])


if __name__ == "__main__":
    unittest.main()
