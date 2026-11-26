"""`falera wifi`: scan, connect, saved, forget — and password handling."""

import io
import unittest
from unittest import mock

from fake import FakeTransport
from helpers import run_cli

PASSWORD = "hunter2!"


class WifiTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)

    def assertNoLeak(self, r, password=PASSWORD):
        self.assertNotIn(password, r.out)
        for out in self.fake.outputs:
            self.assertNotIn(password.encode(), out)

    def test_scan(self):
        self.fake.wifi.saved = [{"ssid": "Home", "password": PASSWORD, "priority": 1}]
        r = run_cli(["wifi", "scan"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("Home", r.out)
        self.assertIn("Cafe", r.out)
        self.assertIn("saved", r.out)
        self.assertIn("open", r.out)
        self.assertLess(r.out.index("Home"), r.out.index("Cafe"))   # strongest first
        self.assertNoLeak(r)

    def test_scan_failure(self):
        self.fake.wifi.scan_fails = "poll"
        r = run_cli(["wifi", "scan"], fake=self.fake)
        self.assertEqual(r.rc, 1)
        self.assertIn("scan timed out", r.out)

    def test_connect_saves_and_never_echoes_the_password(self):
        prompts = []

        def secret(prompt):
            prompts.append(prompt)
            return PASSWORD
        r = run_cli(["wifi", "connect", "Home"], fake=self.fake, secret=secret,
                    interactive=True)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(len(prompts), 1)
        self.assertIn("Home", prompts[0])
        self.assertIn("connected to Home", r.out)
        self.assertIn("192.168.1.42", r.out)
        self.assertEqual(self.fake.wifi.saved[0]["ssid"], "Home")
        self.assertEqual(sum(PASSWORD in c for c in self.fake.sent), 1)
        self.assertNoLeak(r)
        self.assertEqual(self.fake.restarts, ["soft"])

    def test_wrong_password(self):
        r = run_cli(["wifi", "connect", "Home"], fake=self.fake,
                    secret=lambda p: "wrong-pass", interactive=True)
        self.assertEqual(r.rc, 1)
        self.assertIn("wrong password for Home", r.out)
        self.assertEqual(self.fake.wifi.saved, [])
        self.assertNoLeak(r, "wrong-pass")

    def test_not_in_range(self):
        r = run_cli(["wifi", "connect", "Far Away"], fake=self.fake,
                    secret=lambda p: "whatever1", interactive=True)
        self.assertEqual(r.rc, 1)
        self.assertIn("not in range", r.out)
        self.assertIn("2.4 GHz", r.out)

    def test_no_save(self):
        r = run_cli(["wifi", "connect", "Home", "--no-save"], fake=self.fake,
                    secret=lambda p: PASSWORD, interactive=True)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.fake.wifi.saved, [])

    def test_save_only_and_open(self):
        r = run_cli(["wifi", "connect", "Cafe", "--open", "--save-only"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.fake.wifi.saved[0]["ssid"], "Cafe")
        self.assertIsNone(self.fake.wifi.connected)

    def test_password_from_stdin(self):
        with mock.patch("sys.stdin", io.StringIO(PASSWORD + "\n")):
            r = run_cli(["wifi", "connect", "Home", "--password-stdin"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.fake.wifi.saved[0]["password"], PASSWORD)
        self.assertNoLeak(r)

    def test_cancelled_prompt_changes_nothing(self):
        def secret(prompt):
            raise KeyboardInterrupt
        r = run_cli(["wifi", "connect", "Home"], fake=self.fake, secret=secret,
                    interactive=True)
        self.assertEqual(r.rc, 130)
        self.assertEqual(self.fake.sent, [])
        self.assertEqual(r.links, [])

    def test_badge_error_is_redacted(self):
        self.fake.fail_on = "connect_begin"
        r = run_cli(["-v", "wifi", "connect", "Home"], fake=self.fake,
                    secret=lambda p: PASSWORD, interactive=True)
        self.assertEqual(r.rc, 1)
        self.assertNoLeak(r)

    def test_saved_lists_without_passwords(self):
        self.fake.wifi.saved = [{"ssid": "Home", "password": PASSWORD, "priority": 1,
                                 "last": True},
                                {"ssid": "Cafe", "password": "", "priority": 5}]
        r = run_cli(["wifi", "saved"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("last used", r.out)
        self.assertNoLeak(r)

    def test_forget(self):
        self.fake.wifi.saved = [{"ssid": "Home", "password": PASSWORD, "priority": 1}]
        self.fake.wifi.deploy = ["Home"]
        r = run_cli(["wifi", "forget", "Home"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.fake.wifi.saved, [])
        self.assertIn(".env", r.out)
        r = run_cli(["wifi", "forget", "Home"], fake=self.fake)
        self.assertEqual(r.rc, 1)
        self.assertIn("not saved", r.out)


if __name__ == "__main__":
    unittest.main()
