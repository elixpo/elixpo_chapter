"""`falera doctor`, `falera update`, `falera flash`."""

import os
import tempfile
import unittest
from pathlib import Path

from fake import FakePort, FakeTransport, badge_port
from helpers import run_cli

from oreo_cli import doctor


class PermissionTest(unittest.TestCase):
    def test_windows(self):
        self.assertEqual(doctor.check_permissions("COM3", platform="win32")[0], doctor.OK)

    def test_accessible(self):
        st = doctor.check_permissions("/dev/ttyACM0", platform="linux",
                                      access=lambda p, m: True)
        self.assertEqual(st[0], doctor.OK)

    def test_linux_needs_dialout(self):
        st, msg, hint = doctor.check_permissions("/dev/ttyACM0", platform="linux",
                                                 access=lambda p, m: False, groups=set())
        self.assertEqual(st, doctor.FAIL)
        self.assertIn("usermod -aG", hint)

    def test_linux_group_not_applied_yet(self):
        group = "uucp" if os.path.exists("/etc/arch-release") else "dialout"
        st, msg, hint = doctor.check_permissions("/dev/ttyACM0", platform="linux",
                                                 access=lambda p, m: False, groups={group})
        self.assertIn("log out", hint)


class DoctorCommandTest(unittest.TestCase):
    def test_no_device(self):
        r = run_cli(["doctor"], ports=[])
        self.assertEqual(r.rc, 1)
        self.assertIn("cable", r.out)
        self.assertEqual(r.links, [])

    def test_wrong_firmware_port(self):
        r = run_cli(["doctor"], ports=[FakePort("/dev/ttyACM0", 0x303A, 0x1001)])
        self.assertIn("303a:1001", r.out)
        self.assertIn("falera flash", r.out)
        self.assertEqual(r.links, [])

    def test_healthy_badge(self):
        fake = FakeTransport()
        self.addCleanup(fake.cleanup)
        orig = doctor.check_permissions
        doctor.check_permissions = lambda dev: (doctor.OK, "can read and write " + dev, None)
        self.addCleanup(setattr, doctor, "check_permissions", orig)
        r = run_cli(["doctor"], fake=fake, ports=[badge_port()])
        self.assertIn("MicroPython 1.28.0", r.out)
        self.assertIn("v2.0.0", r.out)
        self.assertEqual(fake.restarts, ["soft"])


class RepoTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        for name in ("deploy", "deploy.sh", "build-firmware", "oreoOS/config.py"):
            (root / name).parent.mkdir(parents=True, exist_ok=True)
            (root / name).write_text("")
        self.root = root
        self.calls = []

    def runner(self, cmd, cwd=None):
        self.calls.append(cmd)
        return 0

    def test_update_repo_must_be_a_checkout(self):
        r = run_cli(["update", "--clean"], runner=self.runner)
        self.assertEqual(r.rc, 2)                 # dev flags need --repo
        self.assertIn("--repo", r.out)
        r = run_cli(["update", "--repo", str(self.root / "oreoOS")], runner=self.runner)
        self.assertIn("does not look like a FaleraOS checkout", r.out)
        self.assertEqual(self.calls, [])

    def test_update_runs_deploy(self):
        r = run_cli(["update", "--repo", str(self.root), "--no-bump"], runner=self.runner)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.calls[0][-4:], ["--board", "--port", "/dev/ttyACM0", "--no-bump"])
        self.assertEqual(r.links, [])   # the CLI itself never opened the port

    def test_clean_update_asks_first(self):
        r = run_cli(["update", "--repo", str(self.root), "--clean"], runner=self.runner)
        self.assertEqual(r.rc, 130)
        self.assertEqual(self.calls, [])
        r = run_cli(["update", "--repo", str(self.root), "--clean"], runner=self.runner,
                    interactive=True, inputs=["y"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("--clean", self.calls[0])

    def test_flash_asks_before_erasing(self):
        r = run_cli(["flash", "--repo", str(self.root), "--build"], runner=self.runner)
        self.assertEqual(r.rc, 130)
        self.assertEqual(len(self.calls), 1)                 # only the build ran
        self.assertTrue(self.calls[0][-1].endswith("build-firmware"))
        r = run_cli(["-y", "flash", "--repo", str(self.root)], runner=self.runner)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("--full", self.calls[-1])

    def test_failing_script(self):
        r = run_cli(["update", "--repo", str(self.root)], runner=lambda c, cwd=None: 2)
        self.assertEqual(r.rc, 1)
        self.assertIn("deploy exited with status 2", r.out)


if __name__ == "__main__":
    unittest.main()
