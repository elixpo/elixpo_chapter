"""ls / push / pull / rm and the badge-side file transfer protocol."""

import os
import tempfile
import unittest
from unittest import mock
from pathlib import Path

from fake import FakeTransport
from helpers import run_cli

from oreo_cli.badge import Badge, OutputParser, norm
from oreo_cli.errors import OreoError


class PathTest(unittest.TestCase):
    def test_norm(self):
        self.assertEqual(norm(":apps/x"), "/apps/x")
        self.assertEqual(norm("/apps//x/"), "/apps/x")
        self.assertEqual(norm("a/../b"), "/b")
        self.assertEqual(norm("../../etc"), "/etc")
        self.assertEqual(norm(""), "/")


class ParserTest(unittest.TestCase):
    def test_split_across_chunks(self):
        events, text = [], []
        p = OutputParser(events.append, None, text.append)
        for chunk in (b'[wifi] conn', b'ecting\r\n@OREO:{"a"', b': 1}\n@B:aGk=\n', b"tail"):
            p.feed(chunk)
        p.finish()
        self.assertEqual(events, [{"a": 1}])
        self.assertEqual(text, ["[wifi] connecting", "tail"])

    def test_data_lines(self):
        got = []
        p = OutputParser(on_data=got.append)
        p.feed(b"@B:aGVsbG8=\n@B:IQ==\n\x04")
        self.assertEqual(b"".join(got), b"hello!")


class TransferTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)
        self.badge = Badge(self.fake)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_write_is_chunked_atomic_and_verified(self):
        data = os.urandom(10000)
        seen = []
        self.badge.write_file(data, "/documents/blob.bin", progress=lambda d, t: seen.append(d),
                              chunk=4096)
        self.assertEqual(self.fake.get("/documents/blob.bin"), data)
        self.assertFalse(self.fake.exists("/documents/blob.bin.part"))
        self.assertEqual(seen, [4096, 8192, 10000])
        self.assertEqual(sum(c.count("_w(_d(") for c in self.fake.sent), 3)
        # first chunk rides with the open, the last with the check-and-rename
        self.assertEqual(sum(1 for c in self.fake.sent if c.startswith("_w(_d(")), 1)
        self.assertTrue(any("hashlib.sha256" in c for c in self.fake.sent))

    def test_small_file_costs_two_execs_after_the_space_check(self):
        self.badge.write_file(b"hello", "/hello.txt", check_space=False)
        self.assertEqual(len(self.fake.sent), 2)
        self.assertEqual(self.fake.get("/hello.txt"), b"hello")

    def test_folder_is_created_once_per_session(self):
        self.badge.write_file(b"a", "/d/e/a.txt", check_space=False)
        before = len(self.fake.sent)
        self.badge.write_file(b"b", "/d/e/b.txt", check_space=False)
        self.assertEqual(len(self.fake.sent) - before, 2)

    def test_bad_copy_never_replaces_the_old_file(self):
        self.fake.put("/documents/keep.txt", b"old")
        real = self.badge.result

        def corrupt(code, **kw):   # the badge hashes something else than was sent
            return real(code.replace("_r['sha']==", "_r['sha']+'x'=="), **kw)
        self.badge.result = corrupt
        with self.assertRaises(OreoError) as cm:
            self.badge.write_file(b"new!", "/documents/keep.txt")
        self.assertIn("checksum", cm.exception.message)
        self.assertEqual(self.fake.get("/documents/keep.txt"), b"old")
        self.assertFalse(self.fake.exists("/documents/keep.txt.part"))

    def test_windows_rewritten_paths_are_refused(self):
        from oreo_cli.errors import UsageError
        with self.assertRaises(UsageError) as cm:
            norm("C:/Program Files/Git/documents/")
        self.assertIn(":documents", cm.exception.hint)
        self.assertEqual(norm("\\documents\\a.txt"), "/documents/a.txt")

    def test_write_creates_folders_and_overwrites(self):
        self.badge.write_file(b"one", "/a/b/c.txt")
        self.badge.write_file(b"two!", "/a/b/c.txt")
        self.assertEqual(self.fake.get("/a/b/c.txt"), b"two!")

    def test_empty_file(self):
        self.badge.write_file(b"", "/empty.txt")
        self.assertEqual(self.fake.get("/empty.txt"), b"")

    def test_failed_write_leaves_no_temp_file(self):
        self.fake.fail_on = "_w(_d("
        with self.assertRaises(OreoError):
            self.badge.write_file(b"x" * 100, "/documents/x.txt")
        self.assertFalse(self.fake.exists("/documents/x.txt.part"))
        self.assertFalse(self.fake.exists("/documents/x.txt"))

    def test_space_is_checked_before_writing(self):
        small = FakeTransport(total=64 * 1024)
        self.addCleanup(small.cleanup)
        with self.assertRaises(OreoError) as cm:
            Badge(small).write_file(b"x" * 50000, "/big.bin")
        self.assertIn("not enough space", cm.exception.message)
        self.assertFalse(any(c.startswith("_w(") for c in small.sent))

    def test_read_roundtrip(self):
        data = os.urandom(7000)
        self.fake.put("/apps/pet/state.txt", data)
        seen = []
        self.assertEqual(self.badge.read_file("/apps/pet/state.txt",
                                              progress=lambda d, t: seen.append((d, t))), data)
        self.assertEqual(seen[-1], (7000, 7000))

    def test_ls_and_stat(self):
        self.fake.put("/documents/a.mdz", b"12345")
        names = [e["name"] for e in self.badge.ls("/")]
        self.assertEqual(names[:3], ["apps", "documents", "oreoOS"])   # folders first
        self.assertIn("main.py", names)
        self.assertEqual(self.badge.ls("/documents/a.mdz"),
                         [{"name": "a.mdz", "dir": False, "size": 5}])
        self.assertIsNone(self.badge.stat("/nope"))
        self.assertEqual(self.badge.stat("/documents"), {"dir": True, "size": 0})

    def test_rm(self):
        self.fake.put("/x/y/z.txt", b"z")
        with self.assertRaises(OreoError) as cm:
            self.badge.rm("/x")
        self.assertIn("-r", cm.exception.hint)
        self.badge.rm("/x", recursive=True)
        self.assertFalse(self.fake.exists("/x"))
        with self.assertRaises(OreoError):
            self.badge.rm("/x")


class FileCommandsTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)

    def test_ls(self):
        r = run_cli(["ls", "/apps"], fake=self.fake)
        self.assertEqual(r.rc, 0)
        self.assertIn("settings/", r.out)

    def test_push_file_into_folder(self):
        f = self.dir / "notes.txt"
        f.write_text("hello")
        r = run_cli(["push", str(f), "/documents"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.fake.get("/documents/notes.txt"), b"hello")

    def test_push_file_to_new_name(self):
        f = self.dir / "notes.txt"
        f.write_text("hello")
        run_cli(["push", str(f), "/documents/renamed.txt"], fake=self.fake)
        self.assertEqual(self.fake.get("/documents/renamed.txt"), b"hello")

    def test_push_folder(self):
        app = self.dir / "myapp"
        (app / "src").mkdir(parents=True)
        (app / "main.py").write_text("print(1)")
        (app / "src" / "app.py").write_text("x = 1")
        (app / "__pycache__").mkdir()
        (app / "__pycache__" / "junk.pyc").write_bytes(b"junk")
        r = run_cli(["push", str(app), "/apps/myapp"], fake=self.fake)
        self.assertNotEqual(r.rc, 0)       # folders need -r
        r = run_cli(["push", "-r", str(app), "/apps/myapp"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.fake.get("/apps/myapp/main.py"), b"print(1)")
        self.assertEqual(self.fake.get("/apps/myapp/src/app.py"), b"x = 1")
        self.assertFalse(self.fake.exists("/apps/myapp/__pycache__"))
        # into an existing folder: keeps the folder name
        r = run_cli(["push", "-r", str(app), "/apps"], fake=self.fake)
        self.assertEqual(self.fake.get("/apps/myapp/main.py"), b"print(1)")

    def _push_from(self, cwd, *args):
        old = os.getcwd()
        os.chdir(cwd)
        try:
            return run_cli(["push", "-r"] + list(args), fake=self.fake)
        finally:
            os.chdir(old)

    def _make_app(self):
        app = self.dir / "myapp"
        (app / "src").mkdir(parents=True)
        (app / "main.py").write_text("print(1)")
        (app / "src" / "app.py").write_text("x = 1")
        return app

    def test_push_current_folder_to_a_new_path(self):
        app = self._make_app()
        for src, dest in ((".", "/apps/a"), ("./", "/apps/b")):
            r = self._push_from(app, src, dest)
            self.assertEqual(r.rc, 0, r.out)
            self.assertEqual(self.fake.get(dest + "/main.py"), b"print(1)")
            self.assertEqual(self.fake.get(dest + "/src/app.py"), b"x = 1")

    def test_push_current_folder_into_an_existing_folder_updates_it(self):
        app = self._make_app()
        r = self._push_from(app, ".", "/apps/settings")
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.fake.get("/apps/settings/main.py"), b"print(1)")
        self.assertEqual(self.fake.get("/apps/settings/src/app.py"), b"x = 1")
        self.assertFalse(self.fake.exists("/apps/settings/myapp"))

    def test_push_parent_folder_stays_inside_the_destination(self):
        app = self._make_app()
        sub = app / "src"
        r = self._push_from(sub, "..", "/apps/settings")
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.fake.get("/apps/settings/main.py"), b"print(1)")
        self.assertEqual(self.fake.get("/apps/settings/src/app.py"), b"x = 1")
        # Nothing lands above the destination (it used to: /apps/main.py).
        self.assertFalse(self.fake.exists("/apps/main.py"))
        self.assertEqual(self.fake.get("/main.py"), b"from oreoOS import entry\n")
        r = self._push_from(sub, "..", "/apps/copy")
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.fake.get("/apps/copy/main.py"), b"print(1)")

    def test_pull(self):
        self.fake.put("/documents/a.txt", b"AAA")
        self.fake.put("/documents/sub/b.txt", b"BBB")
        r = run_cli(["pull", "/documents/a.txt", str(self.dir)], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual((self.dir / "a.txt").read_bytes(), b"AAA")
        r = run_cli(["pull", "-r", "/documents", str(self.dir / "backup")], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual((self.dir / "backup" / "sub" / "b.txt").read_bytes(), b"BBB")

    @unittest.skipIf(hasattr(os, "geteuid") and os.geteuid() == 0, "root reads anything")
    def test_push_unreadable_source_is_a_local_error(self):
        f = self.dir / "secret.txt"
        f.write_text("x")
        f.chmod(0)
        self.addCleanup(f.chmod, 0o600)
        r = run_cli(["push", str(f), "/documents/"], fake=self.fake)
        self.assertEqual(r.rc, 1, r.out)
        self.assertIn("permission denied", r.out)
        self.assertNotIn("lost the connection", r.out)
        self.assertEqual(r.links, [])            # refused before the badge was touched

    def test_push_read_failure_is_a_local_error(self):
        f = self.dir / "notes.txt"
        f.write_text("x")
        with mock.patch.object(Path, "read_bytes", side_effect=OSError(5, "Input/output error", str(f))):
            r = run_cli(["push", str(f), "/documents/"], fake=self.fake)
        self.assertEqual(r.rc, 1, r.out)
        self.assertIn("notes.txt: Input/output error", r.out)
        self.assertNotIn("lost the connection", r.out)

    def test_pull_unwritable_destination_is_a_local_error(self):
        self.fake.put("/documents/a.txt", b"AAA")
        blocker = self.dir / "file"
        blocker.write_text("x")             # a file where a folder is needed
        r = run_cli(["pull", "/documents/a.txt", str(blocker / "sub" / "a.txt")], fake=self.fake)
        self.assertEqual(r.rc, 1, r.out)
        self.assertIn(str(blocker), r.out)
        self.assertNotIn("lost the connection", r.out)
        r = run_cli(["pull", "/documents/a.txt", str(blocker / "dir") + "/"], fake=self.fake)
        self.assertEqual(r.rc, 1, r.out)
        self.assertNotIn("lost the connection", r.out)

    def test_rm_guards(self):
        r = run_cli(["rm", "/oreoOS/config.py"], fake=self.fake)
        self.assertEqual(r.rc, 1)
        self.assertIn("belongs to FaleraOS", r.out)
        self.assertTrue(self.fake.exists("/oreoOS/config.py"))
        self.assertEqual(self.fake.sent, [])
        self.fake.put("/documents/old/a.txt", b"a")
        r = run_cli(["rm", "-r", "/documents/old"], fake=self.fake)     # no terminal: default no
        self.assertEqual(r.rc, 130)
        self.assertTrue(self.fake.exists("/documents/old/a.txt"))
        r = run_cli(["rm", "-r", "/documents/old"], fake=self.fake, interactive=True,
                    inputs=["y"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertFalse(self.fake.exists("/documents/old"))

    def test_rm_protects_inside_system_folders(self):
        from oreo_cli.commands import is_protected
        for p in ("/apps/launcher/main.py", "/apps/settings", "/apps/wifi/ui/x.py",
                  "/assets", "/assets/fonts", "/assets/fonts/a.bin", "/oreoOS",
                  "/oreoWare/wifi.py", "/secrets.py", "/wifi.json", "/main.py",
                  ":apps/store/main.py", "/", "/apps"):
            self.assertTrue(is_protected(p), p)
        for p in ("/apps/myapp", "/apps/myapp/main.py", "/apps/launcherx",
                  "/assetsx", "/documents/a.txt", "/oreoOS.bak", "/wifi_seen.json"):
            self.assertFalse(is_protected(p), p)

    def test_rm_child_of_builtin_app_needs_force(self):
        self.fake.put("/apps/launcher/main.py", b"x")
        self.fake.put("/assets/fonts/a.bin", b"f")
        for argv in (["rm", "/apps/launcher/main.py"], ["rm", "-r", "/assets/fonts"]):
            r = run_cli(argv, fake=self.fake)
            self.assertEqual(r.rc, 1, argv)
            self.assertIn("belongs to FaleraOS", r.out)
        self.assertTrue(self.fake.exists("/apps/launcher/main.py"))
        self.assertTrue(self.fake.exists("/assets/fonts/a.bin"))
        self.assertEqual(self.fake.sent, [])
        r = run_cli(["--yes", "rm", "--force", "/apps/launcher/main.py"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertFalse(self.fake.exists("/apps/launcher/main.py"))

    def test_rm_user_app_needs_no_force(self):
        self.fake.put("/apps/myapp/main.py", b"x")
        r = run_cli(["rm", "-r", "/apps/myapp"], fake=self.fake, interactive=True,
                    inputs=["y"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertFalse(self.fake.exists("/apps/myapp"))

    def test_rm_file(self):
        self.fake.put("/documents/a.txt", b"a")
        r = run_cli(["rm", "/documents/a.txt"], fake=self.fake)
        self.assertEqual(r.rc, 0)
        self.assertFalse(self.fake.exists("/documents/a.txt"))


if __name__ == "__main__":
    unittest.main()
