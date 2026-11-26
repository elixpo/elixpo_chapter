"""Host tests for precompiled (.mpy) releases and installs.

MicroPython 1.28 imports x.py before x.mpy (py/builtinimport.c,
stat_file_py_or_mpy), so installing x.mpy must remove x.py, and a later
.py install should remove the stale x.mpy. Covered here:

  * which files are compiled (never entry points, package markers or
    config.py);
  * tools/build_release.py: manifest.json stays plain .py, and
    manifest-mpy.json lists .mpy files plus the .py files they replace
    (needs MicroPython 1.28.0's mpy-cross; skipped without it);
  * oreoOS/ota.py: peek prefers manifest-mpy.json only on firmware that
    loads .mpy, falls back to manifest.json; apply_pending removes the
    replaced .py after every new file is in place, before the ready marker
    goes (a power cut repeats it), and never removes what the release
    ships or anything outside the OS;
  * tools/deploy.py: .mpy by default, plain .py with --py, and the form
    to delete on the badge afterwards.

    python3 -m unittest tests.test_mpy_release -v
"""

import contextlib
import hashlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import mpy_build  # noqa: E402

MPY_CROSS = mpy_build.find_mpy_cross()
try:
    mpy_build.check(MPY_CROSS)
    HAVE_MPY = True
except mpy_build.MpyError:
    HAVE_MPY = False


def sha(b):
    return hashlib.sha256(b).hexdigest()


def load_ota():
    pkg = types.ModuleType("oreoOS")
    pkg.__path__ = []
    sys.modules["oreoOS"] = pkg
    spec = importlib.util.spec_from_file_location("oreo_ota_mpy_test",
                                                  ROOT / "oreoOS/ota.py")
    ota = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ota)
    return ota


class SelectionTest(unittest.TestCase):
    def test_what_is_compiled(self):
        yes = ("oreoOS/launcher.py", "oreoOS/ota.py", "oreoWare/display.py",
               "apps/badge/src/app.py", "apps/store/src/render.py",
               "apps/x/src/sub/mod.py")
        no = ("oreoOS/config.py", "oreoOS/entry.py", "main.py", "boot.py",
              "oreoOS/__init__.py", "apps/badge/main.py",
              "apps/badge/__init__.py", "apps/badge/src/__init__.py",
              "apps/gallery/src/gallery_native.mpy",
              "assets/icons/optimized/home.py",
              "apps/gallery/assets/optimized/elixpo_chapter.py",
              "oreoOS/splash.rv565", "apps/x/manifest.json")
        for p in yes:
            self.assertTrue(mpy_build.should_compile(p), p)
        for p in no:
            self.assertFalse(mpy_build.should_compile(p), p)

    def test_wrong_compiler_is_refused(self):
        with tempfile.TemporaryDirectory() as t:
            fake = Path(t, "mpy-cross")
            fake.write_text("#!/bin/sh\necho 'MicroPython v1.27.0; mpy-cross "
                            "emitting mpy v6.3'\n")
            fake.chmod(0o755)
            with self.assertRaises(mpy_build.MpyError):
                mpy_build.check(str(fake))
        with self.assertRaises(mpy_build.MpyError):
            mpy_build.check(None)


@unittest.skipUnless(HAVE_MPY, "MicroPython 1.28.0 mpy-cross not found")
class BuildReleaseTest(unittest.TestCase):
    def test_release_has_both_manifests(self):
        with tempfile.TemporaryDirectory() as t:
            r = subprocess.run(
                [sys.executable, str(ROOT / "tools/build_release.py"),
                 "--version", "v9.9.9", "--out", t, "--mpy", "require",
                 "--mpy-cross", MPY_CROSS,
                 "--asset-base-url", "https://x/dl/"],
                capture_output=True, text=True, cwd=ROOT)
            self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
            out = Path(t, "v9.9.9")
            plain = json.loads((out / "manifest.json").read_text())
            mpy = json.loads((out / "manifest-mpy.json").read_text())
            plain_paths = {f["path"] for f in plain["files"]}
            mpy_paths = {f["path"] for f in mpy["files"]}
            self.assertFalse(any(p.endswith(".mpy") and p[:-4] + ".py" in plain_paths
                                 for p in plain_paths))
            self.assertIn("oreoOS/launcher.py", plain_paths)
            self.assertIn("oreoOS/launcher.mpy", mpy_paths)
            self.assertNotIn("oreoOS/launcher.py", mpy_paths)
            self.assertIn("oreoOS/launcher.py", mpy["remove"])
            # Never compiled: config, entry points, package markers.
            for p in ("oreoOS/config.py", "oreoOS/entry.py",
                      "apps/badge/main.py", "oreoOS/__init__.py"):
                self.assertIn(p, mpy_paths)
                self.assertNotIn(p, mpy["remove"])
            self.assertEqual(mpy["manifest_format"], 2)
            self.assertEqual(mpy["mpy"], "6.3")
            # Every listed file exists with its size and hash; .mpy headers.
            for f in mpy["files"]:
                data = (out / "files" / f["path"]).read_bytes()
                self.assertEqual(len(data), f["size"], f["path"])
                self.assertEqual(sha(data), f["sha256"], f["path"])
                self.assertEqual(f["url"], "https://x/dl/" + f["path"].replace("/", "_"))
                if f["path"].endswith(".mpy") and f["path"][:-4] + ".py" in mpy["remove"]:
                    self.assertEqual(data[:4], mpy_build.MPY_HEADER)
            self.assertEqual(len(mpy["files"]), len(plain["files"]))

    def test_compiled_output_is_deterministic(self):
        with tempfile.TemporaryDirectory() as t:
            a = mpy_build.compile_file(MPY_CROSS, ROOT / "oreoOS/ota.py",
                                       Path(t, "a.mpy"), "oreoOS/ota.py")
            b = mpy_build.compile_file(MPY_CROSS, ROOT / "oreoOS/ota.py",
                                       Path(t, "b.mpy"), "oreoOS/ota.py")
            self.assertEqual(a.read_bytes(), b.read_bytes())


class ApplyRemovalsTest(unittest.TestCase):
    def setUp(self):
        self.ota = load_ota()
        self.tmp = tempfile.TemporaryDirectory()
        self.cwd = os.getcwd()
        os.chdir(self.tmp.name)
        self.ota.STAGE_DIR = "_ota"

    def tearDown(self):
        os.chdir(self.cwd)
        self.tmp.cleanup()

    def put(self, path, data="x"):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(data)

    def stage(self, manifest, staged):
        for p in staged:
            self.put("_ota/" + p, "new " + p)
        Path("_ota/manifest.json").write_text(json.dumps(manifest))

    def test_mpy_install_removes_the_py_it_replaces(self):
        self.put("oreoOS/launcher.py", "old")
        self.put("oreoOS/config.py", "old")
        self.put("apps/badge/src/app.py", "old")
        self.put("apps/gallery/src/gallery_native.mpy", "native")
        self.put("apps/badge/main.py", "shim")
        m = {"version": "v3.0.0", "manifest_format": 2,
             "files": [{"path": "oreoOS/launcher.mpy"},
                       {"path": "oreoOS/config.py"},
                       {"path": "apps/badge/src/app.mpy"},
                       {"path": "apps/badge/main.py"},
                       {"path": "apps/gallery/src/gallery_native.mpy"}],
             "remove": ["oreoOS/launcher.py", "apps/badge/src/app.py",
                        "/boot.py", "../x.py", "main.py", "oreoOS/config.py"]}
        self.stage(m, ["oreoOS/launcher.mpy", "oreoOS/config.py",
                       "apps/badge/src/app.mpy"])
        self.assertEqual(self.ota.apply_pending(), "v3.0.0")
        self.assertFalse(Path("oreoOS/launcher.py").exists())
        self.assertFalse(Path("apps/badge/src/app.py").exists())
        self.assertEqual(Path("oreoOS/launcher.mpy").read_text(),
                         "new oreoOS/launcher.mpy")
        # Shipped files and anything outside the OS stay.
        self.assertTrue(Path("oreoOS/config.py").exists())
        self.assertTrue(Path("apps/badge/main.py").exists())
        self.assertTrue(Path("apps/gallery/src/gallery_native.mpy").exists())
        self.assertFalse(Path("_ota").exists())

    def test_power_cut_before_removal_finishes_at_next_boot(self):
        self.put("oreoOS/launcher.py", "old")
        m = {"version": "v3.0.0", "files": [{"path": "oreoOS/launcher.mpy"}],
             "remove": ["oreoOS/launcher.py"]}
        self.stage(m, ["oreoOS/launcher.mpy"])
        real = self.ota._apply_removals
        self.ota._apply_removals = lambda man: (_ for _ in ()).throw(
            OSError("power cut"))
        with self.assertRaises(OSError):
            self.ota.apply_pending()
        # The new file is in place, the old .py still shadows it, and the
        # ready marker is still there: the next boot resumes.
        self.assertTrue(Path("oreoOS/launcher.mpy").exists())
        self.assertTrue(Path("oreoOS/launcher.py").exists())
        self.assertTrue(self.ota.is_pending())
        self.ota._apply_removals = real
        self.assertEqual(self.ota.apply_pending(), "v3.0.0")
        self.assertFalse(Path("oreoOS/launcher.py").exists())
        self.assertFalse(self.ota.is_pending())

    def test_py_release_after_mpy_removes_the_stale_mpy(self):
        self.put("oreoOS/launcher.mpy", "old bytecode")
        m = {"version": "v3.0.1", "files": [{"path": "oreoOS/launcher.py"},
                                             {"path": "apps/gallery/src/gallery_native.mpy"}]}
        self.put("apps/gallery/src/gallery_native.mpy", "native")
        self.stage(m, ["oreoOS/launcher.py"])
        self.assertEqual(self.ota.apply_pending(), "v3.0.1")
        self.assertTrue(Path("oreoOS/launcher.py").exists())
        self.assertFalse(Path("oreoOS/launcher.mpy").exists())
        self.assertTrue(Path("apps/gallery/src/gallery_native.mpy").exists())

    def test_derived_removal_without_a_list(self):
        # An unchanged .mpy (not staged) still retires a leftover .py.
        self.put("oreoOS/ota.py", "old")
        self.put("oreoOS/ota.mpy", "same")
        m = {"version": "v3.0.2", "files": [{"path": "oreoOS/ota.mpy"},
                                             {"path": "oreoOS/a.py"}]}
        self.stage(m, ["oreoOS/a.py"])
        self.assertEqual(self.ota.apply_pending(), "v3.0.2")
        self.assertFalse(Path("oreoOS/ota.py").exists())
        self.assertTrue(Path("oreoOS/ota.mpy").exists())


class PeekManifestChoiceTest(unittest.TestCase):
    def setUp(self):
        self.ota = load_ota()
        self.asked = []
        self.served = {}
        ota = self.ota

        h = types.ModuleType("oreoOS._http")
        h._seq = [0]
        h.error_mark = lambda: h._seq[0]
        h.error_since = lambda m: h._err if h._seq[0] != m else None

        def get_url(url, timeout_s=4, on_progress=None, **k):
            self.asked.append(url.rsplit("/", 1)[1])
            body = self.served.get(url.rsplit("/", 1)[1])
            if body is None:
                h._seq[0] += 1
                h._err = "github.com: HTTP 404"
                return None
            return json.dumps(body).encode()
        h.get_url = get_url
        sys.modules["oreoOS._http"] = h
        sys.modules["oreoOS"]._http = h
        ota._sha256_file = lambda p: None
        self.rel = {"manifest_url": "https://github.com/o/r/releases/download/"
                                    "stable/v3.0.0/manifest.json", "version": "v3.0.0"}
        self.plain = {"version": "v3.0.0", "files": [{"path": "oreoOS/a.py", "size": 9,
                                                       "sha256": "1", "url": "u"}]}
        self.mpy = {"version": "v3.0.0", "mpy": "6.3", "manifest_format": 2,
                    "remove": ["oreoOS/a.py"],
                    "files": [{"path": "oreoOS/a.mpy", "size": 3, "sha256": "2",
                               "url": "u"}]}

    def test_cpython_or_old_firmware_uses_the_plain_manifest(self):
        self.served = {"manifest.json": self.plain, "manifest-mpy.json": self.mpy}
        pk = self.ota.peek(self.rel)           # no sys.implementation._mpy
        self.assertEqual(self.asked, ["manifest.json"])
        self.assertEqual(pk["changed"][0]["path"], "oreoOS/a.py")

    def test_mpy_firmware_prefers_the_mpy_manifest(self):
        self.ota._mpy_ok = lambda abi: str(abi).split(".")[0] == "6"
        self.served = {"manifest.json": self.plain, "manifest-mpy.json": self.mpy}
        pk = self.ota.peek(self.rel)
        self.assertEqual(self.asked, ["manifest-mpy.json"])
        self.assertEqual(pk["changed"][0]["path"], "oreoOS/a.mpy")
        self.assertEqual(pk["manifest"]["remove"], ["oreoOS/a.py"])

    def test_release_without_mpy_manifest_falls_back_once(self):
        self.ota._mpy_ok = lambda abi: True
        self.served = {"manifest.json": self.plain}
        pk = self.ota.peek(self.rel)
        self.assertEqual(self.asked, ["manifest-mpy.json", "manifest.json"])
        self.assertEqual(pk["changed"][0]["path"], "oreoOS/a.py")

    def test_other_mpy_version_is_not_installed(self):
        self.ota._mpy_ok = lambda abi: str(abi).split(".")[0] == "6"
        self.served = {"manifest.json": self.plain,
                       "manifest-mpy.json": dict(self.mpy, mpy="7.0")}
        pk = self.ota.peek(self.rel)
        self.assertEqual(pk["changed"][0]["path"], "oreoOS/a.py")

    def test_mpy_ok_reads_the_firmware_abi(self):
        ota = load_ota()
        impl = sys.implementation
        try:
            sys.implementation = types.SimpleNamespace(_mpy=6 | (3 << 8))
            self.assertTrue(ota._mpy_ok("6.3"))
            self.assertTrue(ota._mpy_ok("6"))
            self.assertFalse(ota._mpy_ok("7"))
            self.assertFalse(ota._mpy_ok(""))
        finally:
            sys.implementation = impl
        self.assertFalse(ota._mpy_ok("6"))      # CPython: no .mpy


class DeployPlanTest(unittest.TestCase):
    def load_deploy(self):
        argv = sys.argv
        sys.argv = ["deploy.py"]
        try:
            spec = importlib.util.spec_from_file_location(
                "oreo_deploy_mpy_test", ROOT / "tools/deploy.py")
            mod = importlib.util.module_from_spec(spec)
            cwd = os.getcwd()
            os.chdir(ROOT)
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    spec.loader.exec_module(mod)
            finally:
                os.chdir(cwd)
        finally:
            sys.argv = argv
        return mod

    def test_plain_py_for_development(self):
        d = self.load_deploy()
        cwd = os.getcwd()
        os.chdir(ROOT)
        try:
            out, remove, note = d.mpy_plan(d.DEPLOY, plain=True)
        finally:
            os.chdir(cwd)
        self.assertIn("--py", note)
        self.assertEqual(out, list(d.DEPLOY))             # every file as .py
        self.assertIn("oreoOS/launcher.mpy", remove)       # stale ones go
        self.assertNotIn("main.py", [r for r in remove])
        self.assertFalse(any(r.endswith(".py") for r in remove))

    def test_no_compiler_means_plain_py_with_a_warning(self):
        d = self.load_deploy()
        cwd = os.getcwd()
        os.chdir(ROOT)
        try:
            out, remove, note = d.mpy_plan(d.DEPLOY, tool="/nonexistent/mpy-cross")
        finally:
            os.chdir(cwd)
        self.assertTrue(note.startswith("plain .py"))
        self.assertFalse(any(r.endswith(".mpy") for _, r in out
                             if r.startswith("oreoOS/")))

    @unittest.skipUnless(HAVE_MPY, "MicroPython 1.28.0 mpy-cross not found")
    def test_modules_go_as_mpy_and_their_py_is_removed(self):
        d = self.load_deploy()
        cwd = os.getcwd()
        os.chdir(ROOT)
        try:
            with tempfile.TemporaryDirectory() as t:
                out, remove, note = d.mpy_plan(d.DEPLOY, tool=MPY_CROSS, out_dir=t)
                remotes = [r for _, r in out]
                self.assertIn("oreoOS/launcher.mpy", remotes)
                self.assertNotIn("oreoOS/launcher.py", remotes)
                self.assertIn("main.py", remotes)            # entry stays .py
                self.assertIn("oreoOS/config.py", remotes)
                self.assertIn("apps/badge/main.py", remotes)
                self.assertIn("oreoOS/launcher.py", remove)
                local = dict((r, l) for l, r in out)
                self.assertEqual(Path(local["oreoOS/launcher.mpy"]).read_bytes()[:4],
                                 mpy_build.MPY_HEADER)
        finally:
            os.chdir(cwd)


if __name__ == "__main__":
    unittest.main()


class MpyCrossVersionCheckTest(unittest.TestCase):
    """mpy_build.check accepts MicroPython 1.28.0's mpy-cross whether it was
    built from the tag ("v1.28.0") or, as CI builds it, from the pinned
    commit without tags (the commit's short hash), and nothing else."""

    def fake(self, line):
        d = tempfile.mkdtemp()
        p = os.path.join(d, "mpy-cross")
        with open(p, "w") as f:
            f.write("#!/bin/sh\necho '%s'\n" % line)
        os.chmod(p, 0o755)
        return p

    def test_tagged_build(self):
        mpy_build.check(self.fake(
            "MicroPython v1.28.0 on 2026-04-06; mpy-cross emitting mpy v6.3"))

    def test_pinned_commit_build_without_tags(self):
        mpy_build.check(self.fake(
            "MicroPython e0e9fbb17e on 2026-11-12; mpy-cross emitting mpy v6.3"))

    def test_other_versions_are_refused(self):
        for line in ("MicroPython v1.27.0 on 2025-12-01; mpy-cross emitting mpy v6.3",
                     "MicroPython 0123456789 on 2026-11-12; mpy-cross emitting mpy v6.3",
                     "MicroPython v1.28.0 on 2026-04-06; mpy-cross emitting mpy v6.2"):
            with self.subTest(line=line), self.assertRaises(mpy_build.MpyError):
                mpy_build.check(self.fake(line))
