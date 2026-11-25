"""`falera update` without a checkout: the badge's own OTA, steered over USB.

A FakeOta stands in for oreoOS.ota with the functions the CLI calls; a
contract test at the end runs the same flow against the real oreoOS/ota.py
(with a fake oreoOS._http serving a release) when inside a checkout.
"""

import contextlib
import hashlib
import io
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

from fake import FakePort, FakeTransport, badge_port
from helpers import FakeClock, run_cli

from oreo_cli import discovery
from oreo_cli.badge import Badge

REPO = Path(__file__).resolve().parents[2]
OTA = REPO / "oreoOS" / "ota.py"


class FakeOta(types.ModuleType):
    STAGE_DIR = "/_ota"
    MANIFEST_NAME = "manifest.json"

    def __init__(self, fake, latest="v2.1.0", files=3, size=40000):
        super().__init__("oreoOS.ota")
        self.fake = fake
        self.latest = latest
        self.files = files
        self.size = size
        self.online = True
        self.download_ok = True
        self.apply_result = "same"     # "same" -> latest, or a value
        self.calls = []

    def _cur(self):
        return self.fake.config.VERSION

    def is_pending(self):
        return self.fake.exists("/_ota/manifest.json")

    def compare_version(self, a, b):
        pa = tuple(int(x) for x in a.lstrip("v").split("."))
        pb = tuple(int(x) for x in b.lstrip("v").split("."))
        return (pa > pb) - (pa < pb)

    def latest_version(self, channel="stable", on_progress=None):
        self.calls.append(("latest", channel))
        if not self.online:
            return None, None
        return self.latest, {"version": self.latest, "tag": channel + "/" + self.latest,
                             "manifest_url": "https://x/manifest.json",
                             "major": self.latest[:2] != self._cur()[:2]}

    def peek(self, rel, on_progress=None):
        self.calls.append(("peek", rel["tag"]))
        changed = [{"path": "oreoOS/f%d.py" % i, "size": self.size // max(1, self.files)}
                   for i in range(self.files)]
        return {"manifest": {"version": rel["version"], "files": changed}, "changed": changed,
                "unchanged": 100, "bytes": self.size, "small": False, "major": rel["major"]}

    def download(self, peeked, on_progress=None):
        self.calls.append(("download",))
        if not self.download_ok:
            return False
        for i, e in enumerate(peeked["changed"]):
            self.fake.put("/_ota/" + e["path"], b"x")
            on_progress(i + 1, len(peeked["changed"]), e["path"])
        self.fake.put("/_ota/manifest.json",
                      json.dumps(peeked["manifest"]).encode())
        return True

    def discard_pending(self):
        self.calls.append(("discard",))

    def apply_pending(self, on_progress=None):
        self.calls.append(("apply",))
        m = json.loads(self.fake.get("/_ota/manifest.json"))
        for i, e in enumerate(m["files"]):
            if on_progress:
                on_progress(i + 1, e["path"])
        if self.apply_result != "same":
            return self.apply_result
        self.fake.config.VERSION = m["version"]
        import shutil
        shutil.rmtree(self.fake.os._real("/_ota"))
        return m["version"]


class UpdateTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)
        self.ota = FakeOta(self.fake)
        self.fake.modules["oreoOS.ota"] = self.ota
        self.fake.wifi.add_saved("Home", "hunter2!")
        self.fake.wifi.air["Home"] = ("hunter2!", -50)

    def run_update(self, *args, **kw):
        kw.setdefault("interactive", True)
        return run_cli(["update"] + list(args), fake=self.fake, **kw)

    def test_full_update(self):
        r = self.run_update(inputs=["y"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("v2.0.0", r.out)
        self.assertIn("v2.1.0", r.out)
        self.assertIn("3 file(s) change", r.out)
        self.assertIn("FaleraOS v2.1.0 is installed and running", r.out)
        self.assertEqual([c[0] for c in self.ota.calls],
                         ["latest", "peek", "download", "apply"])
        self.assertIn("hard", self.fake.restarts)      # reset into the new FaleraOS
        self.assertEqual(self.fake.restarts[-1], "soft")  # after reading the new version
        self.assertGreaterEqual(self.fake.enters, 2)    # reconnected after the reset

    def test_up_to_date(self):
        self.ota.latest = "v2.0.0"
        r = self.run_update()
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("up to date", r.out)
        self.assertNotIn(("download",), self.ota.calls)

    def test_check_only_never_downloads(self):
        r = self.run_update("--check")
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("v2.1.0", r.out)
        self.assertEqual([c[0] for c in self.ota.calls], ["latest", "peek"])

    def test_beta_channel(self):
        self.run_update("--check", "--channel", "beta")
        self.assertEqual(self.ota.calls[0], ("latest", "beta"))

    def test_declined_changes_nothing(self):
        r = self.run_update(inputs=["n"])
        self.assertEqual(r.rc, 130)
        self.assertNotIn(("download",), self.ota.calls)
        self.assertNotIn("hard", self.fake.restarts)

    def test_no_terminal_needs_yes(self):
        r = self.run_update(interactive=False)
        self.assertEqual(r.rc, 130)
        self.assertIn("--yes", r.out)
        r = run_cli(["--yes", "update"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)

    def test_offline_badge(self):
        self.fake.wifi.saved = []
        r = self.run_update()
        self.assertEqual(r.rc, 1)
        self.assertIn("falera wifi connect", r.out)
        self.assertEqual(self.ota.calls, [])

    def test_github_unreachable(self):
        self.ota.online = False
        r = self.run_update()
        self.assertEqual(r.rc, 1)
        self.assertIn("could not reach GitHub", r.out)

    def test_failed_download_is_discarded(self):
        self.ota.download_ok = False
        r = self.run_update(inputs=["y"])
        self.assertEqual(r.rc, 1)
        self.assertIn("nothing was changed", r.out)
        self.assertIn(("discard",), self.ota.calls)
        self.assertNotIn(("apply",), self.ota.calls)

    def test_not_enough_space(self):
        self.ota.size = 50 * 1024 * 1024
        r = self.run_update(inputs=["y"])
        self.assertEqual(r.rc, 1)
        self.assertIn("not enough space", r.out)
        self.assertNotIn(("download",), self.ota.calls)

    def test_already_downloaded_update_is_offered(self):
        self.fake.put("/_ota/manifest.json",
                      json.dumps({"version": "v2.0.9", "files": []}).encode())
        r = self.run_update(inputs=["y"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("already downloaded", r.out)
        self.assertEqual([c[0] for c in self.ota.calls], ["apply"])
        self.assertEqual(self.fake.config.VERSION, "v2.0.9")

    def test_badge_never_comes_back(self):
        clock = FakeClock()
        calls = {"n": 0}

        def ports():
            calls["n"] += 1
            # present while the update starts, gone after the reset
            return [badge_port()] if not self.fake.restarts else []
        r = self.run_update(inputs=["y"], ports=ports, clock=clock)
        self.assertEqual(r.rc, 4)
        self.assertIn("did not come back", r.out)
        self.assertGreaterEqual(clock.now, 90)

    def test_comes_back_under_a_new_name(self):
        def ports():
            if self.fake.restarts:
                return [badge_port("/dev/ttyACM1")]
            return [badge_port("/dev/ttyACM0")]
        r = self.run_update(inputs=["y"], ports=ports)
        self.assertEqual(r.rc, 0, r.out)

    def test_old_oreoos_without_peek(self):
        del FakeOta.peek
        self.addCleanup(setattr, FakeOta, "peek", UpdateTest._peek)
        r = self.run_update(inputs=["y"])
        self.assertEqual(r.rc, 5, r.out)
        self.assertIn("Settings > Updates", r.out)

    _peek = FakeOta.peek

    def test_badge_without_oreoos(self):
        self.fake.modules["oreoOS.ota"] = None
        self.fake.modules["oreoOS.config"] = None
        r = self.run_update()
        self.assertIn(r.rc, (5,), r.out)

    def test_dev_flags_need_repo(self):
        r = run_cli(["update", "--force"])
        self.assertEqual(r.rc, 2)
        self.assertEqual(r.links, [])


class FindAgainTest(unittest.TestCase):
    def test_serial_number_wins(self):
        ports = [FakePort("/dev/ttyACM3", 0x303A, 0x83EC, "OTHER"),
                 FakePort("/dev/ttyACM4", 0x303A, 0x83EC, "MINE")]
        self.assertEqual(discovery.find_again("/dev/ttyACM0", "MINE", ports), "/dev/ttyACM4")
        self.assertIsNone(discovery.find_again("/dev/ttyACM0", "GONE", ports))
        self.assertEqual(discovery.find_again("/dev/ttyACM3", None, ports), "/dev/ttyACM3")
        self.assertIsNone(discovery.find_again("/dev/ttyACM9", None, ports))


class DeferredInterruptTest(unittest.TestCase):
    def test_ctrl_c_waits_for_the_block(self):
        import os
        import signal
        from oreo_cli import update
        from oreo_cli.ui import UI
        import io
        ui = UI(file=io.StringIO(), color=False)
        done = []
        with self.assertRaises(KeyboardInterrupt):
            with update.deferred_interrupt(ui):
                os.kill(os.getpid(), signal.SIGINT)
                done.append(1)        # still runs: the interrupt was held
        self.assertEqual(done, [1])
        self.assertIn("finishing the update", ui.console.file.getvalue())


def load_module(path, name, **patch):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for k, v in patch.items():
        setattr(mod, k, v)
    return mod


@unittest.skipUnless(OTA.exists(), "not inside a FaleraOS checkout")
class RealOtaContractTest(unittest.TestCase):
    """The CLI's OTA snippets against the real oreoOS/ota.py."""

    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)
        fake = self.fake
        new = b"VERSION = 'v2.1.0'\n"
        fake.put("/oreoOS/same.py", b"same\n")
        files = {"oreoOS/config.py": new, "oreoOS/same.py": b"same\n",
                 "oreoOS/added.py": b"print('new')\n"}
        manifest = {"version": "v2.1.0", "files": [
            {"path": p, "size": len(d), "sha256": hashlib.sha256(d).hexdigest(),
             "url": "https://dl/" + p} for p, d in files.items()]}
        tags = [{"name": "cli-v1.0.0"}, {"name": "beta/v2.2.0"}, {"name": "stable/v2.1.0"}]

        http = types.ModuleType("oreoOS._http")

        def get_url(url, accept=None, timeout_s=4, auth=None, on_progress=None):
            if "/tags" in url:
                return json.dumps(tags).encode()
            if url.endswith("manifest.json"):
                self.assertIn("stable/v2.1.0", url)
                return json.dumps(manifest).encode()
            return None

        def download_to_file(url, dest, expected_sha=None, timeout_s=25, max_bytes=0,
                             keep_alive=True):
            data = files[url[len("https://dl/"):]]
            if expected_sha and hashlib.sha256(data).hexdigest() != expected_sha:
                return False
            fake.put(dest, data)
            return True
        http.get_url = get_url
        http.download_to_file = download_to_file
        http.close_pool = lambda: None

        def fopen(path, mode="r", *a, **k):
            return open(fake.os._real(path), mode, *a, **k)
        pkg = types.ModuleType("oreoOS")
        pkg._http = http
        pkg.config = fake.config
        patcher = mock.patch.dict(sys.modules, {"oreoOS": pkg, "oreoOS._http": http,
                                                "oreoOS.config": fake.config})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.ota = load_module(OTA, "oreo_ota_contract", _os=fake.os, open=fopen)
        fake.modules["oreoOS.ota"] = self.ota
        self.badge = Badge(fake)

    def test_check_peek_download_apply(self):
        st = self.badge.ota_status()
        self.assertEqual(st, {"current": "v2.0.0", "pending": False, "pending_version": None})
        rel = self.badge.ota_check("stable")
        self.assertEqual(rel["latest"], "v2.1.0")
        self.assertTrue(rel["newer"])
        self.assertEqual(rel["tag"], "stable/v2.1.0")
        pk = self.badge.ota_peek()
        self.assertEqual(pk["files"], 2)          # config.py and added.py
        self.assertEqual(pk["unchanged"], 1)
        seen = []
        self.assertTrue(self.badge.ota_download(progress=lambda i, t, p: seen.append((i, t))))
        self.assertEqual(seen, [(1, 2), (2, 2)])
        self.assertTrue(self.badge.ota_status()["pending"])
        self.assertEqual(self.badge.ota_status()["pending_version"], "v2.1.0")
        self.assertEqual(self.badge.ota_apply(), "v2.1.0")
        self.assertEqual(self.fake.get("/oreoOS/config.py"), b"VERSION = 'v2.1.0'\n")
        self.assertEqual(self.fake.get("/oreoOS/added.py"), b"print('new')\n")
        self.assertFalse(self.fake.exists("/_ota/manifest.json"))

    def test_download_failure_says_which_file_and_why(self):
        self.badge.ota_check("stable")
        self.badge.ota_peek()
        http = sys.modules["oreoOS._http"]
        http.download_to_file = lambda *a, **k: False
        http.error_mark = lambda: 0
        http.error_since = lambda mark: "release-assets.example: timed out"
        self.ota.time = types.SimpleNamespace(sleep_ms=lambda ms: None)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertFalse(self.badge.ota_download())
        self.assertIn("Downloading oreoOS/", self.badge.ota_error)
        self.assertIn("release-assets.example: timed out", self.badge.ota_error)
        self.assertFalse(self.badge.ota_status()["pending"])

    def test_precompiled_release_replaces_py_with_mpy(self):
        # A FaleraOS with .mpy support installs manifest-mpy.json: the .mpy
        # lands and the .py it replaces is removed (MicroPython would
        # import the old .py first). The CLI only steers; this is the
        # contract it relies on.
        fake = self.fake
        fake.put("/oreoOS/old.py", b"old\n")
        data = b"M\x06\x00\x1fbytecode"
        mpy_manifest = {"version": "v2.1.0", "mpy": "6.3", "manifest_format": 2,
                        "remove": ["oreoOS/old.py"],
                        "files": [{"path": "oreoOS/old.mpy", "size": len(data),
                                   "sha256": hashlib.sha256(data).hexdigest(),
                                   "url": "https://dl/oreoOS/old.mpy"}]}
        http = sys.modules["oreoOS._http"]
        plain_get = http.get_url

        def get_url(url, **k):
            if url.endswith("/manifest-mpy.json"):
                return json.dumps(mpy_manifest).encode()
            return plain_get(url, **k)
        http.get_url = get_url

        def download_to_file(url, dest, expected_sha=None, **k):
            fake.put(dest, data)
            return True
        http.download_to_file = download_to_file
        self.ota._mpy_ok = lambda abi: True
        self.assertTrue(self.badge.ota_check("stable")["newer"])
        self.assertEqual(self.badge.ota_peek()["files"], 1)
        self.assertTrue(self.badge.ota_download())
        self.assertEqual(self.badge.ota_apply(), "v2.1.0")
        self.assertEqual(self.fake.get("/oreoOS/old.mpy"), data)
        self.assertFalse(self.fake.exists("/oreoOS/old.py"))

    def test_beta_channel_and_up_to_date(self):
        self.assertEqual(self.badge.ota_check("beta")["latest"], "v2.2.0")
        self.fake.config.VERSION = "v2.1.0"
        self.assertFalse(self.badge.ota_check("stable")["newer"])


if __name__ == "__main__":
    unittest.main()
