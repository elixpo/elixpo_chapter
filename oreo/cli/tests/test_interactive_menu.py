"""The interactive view's Transfer, owner profile and app install entries."""

import json
import shutil
import tempfile
import types
import unittest
from pathlib import Path

from helpers import run_cli

from fake import FakeTransport
from test_transfer import PROTO, FakeSerial, load_proto, odz, rz565

KEY = "0123456789abcdef0123456789abcdef"


class MenuTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def test_menu_lists_the_new_entries(self):
        r = run_cli([], fake=self.fake, interactive=True, inputs=["q"])
        self.assertEqual(r.rc, 0, r.out)
        for label in ("send files to Transfer", "owner profile", "install an app from a folder"):
            self.assertIn(label, r.out)

    def test_profile_entry(self):
        answers = ["p", "octocat", "", "", "5.5", "", "", "", "y", "q"]
        r = run_cli([], fake=self.fake, interactive=True, inputs=answers,
                    secret=lambda prompt: KEY)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(json.loads(self.fake.get("/profile.json")),
                         {"GITHUB_USER": "octocat", "TIMEZONE_OFFSET": 5.5, "OWM_API_KEY": KEY})
        self.assertNotIn(KEY, r.out)
        self.assertIn("when FaleraOS restarts", r.out)
        self.assertEqual(self.fake.enters, 1)
        self.assertEqual(self.fake.restarts, ["soft"])

    def test_bad_profile_value_stays_in_the_view(self):
        answers = ["p", "bad name", "ok-name", "", "", "", "", "", "", "n", "q"]
        r = run_cli([], fake=self.fake, interactive=True, inputs=answers,
                    secret=lambda prompt: "")
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("not a GitHub user name", r.out)
        self.assertIn("nothing saved", r.out)
        self.assertFalse(self.fake.exists("/profile.json"))

    def test_install_entry(self):
        r = run_cli(["new", "pet", "--author", "me", "--dir", str(self.tmp)])
        self.assertEqual(r.rc, 0, r.out)
        r = run_cli([], fake=self.fake, interactive=True,
                    inputs=["i", str(self.tmp / "pet"), "q"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertTrue(self.fake.exists("/apps/pet/src/app.py"))
        self.assertIn("appears in the Apps drawer", r.out)

    def test_install_entry_with_a_broken_folder(self):
        (self.tmp / "junk").mkdir()
        r = run_cli([], fake=self.fake, interactive=True,
                    inputs=["i", str(self.tmp / "junk"), "q"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("no manifest.json", r.out)
        self.assertFalse(self.fake.exists("/apps/junk"))


@unittest.skipUnless(PROTO.exists(), "not inside a FaleraOS checkout")
class TransferEntryTest(unittest.TestCase):
    def setUp(self):
        self.proto = load_proto()
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.badge_root = self.tmp + "/badge/"
        Path(self.badge_root).mkdir()
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)

    def write(self, name, data):
        p = Path(self.tmp) / name
        p.write_bytes(data)
        return str(p)

    def test_transfer_entry_restarts_oreoos_then_sends(self):
        ser = FakeSerial(self.proto, self.badge_root)
        self.fake.t = types.SimpleNamespace(serial=ser)
        f1 = self.write("cat one.rz565", rz565(10, 8))
        f2 = self.write("notes.mdz", odz())
        files = '"%s" %s' % (f1, f2)
        r = run_cli([], fake=self.fake, interactive=True,
                    inputs=["t", files, ser.rx.code, "q"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("2 file(s) sent", r.out)
        self.assertTrue(Path(self.badge_root, "documents/notes.mdz").exists())
        # FaleraOS was restarted (soft) before the Transfer session, not after
        self.assertEqual(self.fake.restarts[0], "soft")
        self.assertIn("next menu entry", r.out)
        self.assertEqual(ser.rx.state, self.proto.WAITING)

    def test_files_are_checked_before_oreoos_restarts(self):
        ser = FakeSerial(self.proto, self.badge_root)
        self.fake.t = types.SimpleNamespace(serial=ser)
        r = run_cli([], fake=self.fake, interactive=True,
                    inputs=["t", str(Path(self.tmp) / "missing.rz565"), "q"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("no such file", r.out)
        self.assertEqual(self.fake.restarts, ["soft"])     # only the one on quitting
        self.assertEqual(ser.written, b"")


if __name__ == "__main__":
    unittest.main()
