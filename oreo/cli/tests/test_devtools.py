"""`falera new`, `falera app` and `falera dev`'s notes, against the FakeTransport.

Inside a FaleraOS checkout this also checks that the vendored validator
(oreo_cli/appcheck.py) and the packaged template (oreo_cli/app_template)
match tools/validate_app.py and app_templates/, so they cannot drift.
"""

import ast
import filecmp
import importlib.util
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from helpers import run_cli

from fake import FakeTransport
from oreo_cli import appcheck, commands, devtools

REPO = Path(__file__).resolve().parents[2]
TOOL = REPO / "tools" / "validate_app.py"
TEMPLATES = REPO / "app_templates"
IN_REPO = TOOL.exists() and TEMPLATES.exists()


def load_tool():
    spec = importlib.util.spec_from_file_location("validate_app_for_cli_test", TOOL)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def top_level(path):
    """name -> ast dump of every top-level function and constant."""
    out = {}
    for node in ast.parse(path.read_text(encoding="utf-8")).body:
        if isinstance(node, ast.FunctionDef):
            out[node.name] = ast.dump(node)
        elif isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            out[node.targets[0].id] = ast.dump(node.value)
    return out


class TmpDir(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)


@unittest.skipUnless(IN_REPO, "not inside a FaleraOS checkout")
class NoDriftTest(TmpDir):
    def test_vendored_rules_match_tools_validate_app(self):
        tool = top_level(TOOL)
        mine = top_level(Path(appcheck.__file__))
        for name in ("main", "all_apps", "REPO"):
            tool.pop(name, None)
            mine.pop(name, None)
        self.assertEqual(sorted(mine), sorted(tool),
                         "appcheck.py and tools/validate_app.py define different names")
        for name in tool:
            self.assertEqual(mine[name], tool[name],
                             "%s differs from tools/validate_app.py; copy it over" % name)

    def test_same_verdicts_on_every_app_in_the_repo(self):
        tool = load_tool()
        folders = tool.all_apps() + [TEMPLATES]
        self.assertGreater(len(folders), 10)
        for folder in folders:
            self.assertEqual(appcheck.validate(folder, repo=REPO), tool.validate(folder),
                             str(folder))

    def test_same_verdicts_on_broken_apps(self):
        tool = load_tool()
        cases = {
            "no_manifest": {},
            "bad_json": {"manifest.json": "{"},
            "Bad-Id": {"manifest.json": '{"name":"x","version":"1"}', "__init__.py": "",
                       "main.py": "class App: pass\n"},
            "leaky": {"manifest.json": '{"name":"x","version":"1"}', "__init__.py": "",
                      "main.py": "from .src.app import App\n",
                      "src/app.py": "OWM_API_KEY = 'abc'\nimport machine\n"},
            "syntax": {"manifest.json": '{"name":"x","version":"1","type":"lib"}',
                       "__init__.py": "", "main.py": "def (:\n"},
        }
        for name, files in cases.items():
            d = self.tmp / name
            d.mkdir()
            for rel, text in files.items():
                (d / rel).parent.mkdir(parents=True, exist_ok=True)
                (d / rel).write_text(text)
            mine = appcheck.validate(d, repo=REPO)
            self.assertEqual(mine, tool.validate(d), name)
            self.assertTrue(mine[0], name)

    def test_packaged_template_matches_app_templates(self):
        cmp = filecmp.dircmp(TEMPLATES, devtools.TEMPLATE, ignore=["__pycache__"])

        def walk(c, where=""):
            self.assertEqual(c.left_only, [], "missing from oreo_cli/app_template%s" % where)
            self.assertEqual(c.right_only, [], "extra in oreo_cli/app_template%s" % where)
            _, mismatch, errors = filecmp.cmpfiles(c.left, c.right, c.common_files,
                                                   shallow=False)
            self.assertEqual(mismatch + errors, [],
                             "differs from app_templates%s; copy it over" % where)
            for sub, cc in c.subdirs.items():
                walk(cc, where + "/" + sub)
        walk(cmp)


class PackageDataTest(unittest.TestCase):
    def test_every_template_file_ships_in_the_wheel(self):
        try:
            import tomllib
        except ImportError:
            self.skipTest("tomllib needs Python 3.11")
        cfg = tomllib.loads((Path(devtools.__file__).parents[1] / "pyproject.toml").read_text())
        st = cfg["tool"]["setuptools"]
        packages = set(st["packages"])
        data = st.get("package-data", {})
        for p in devtools.TEMPLATE.rglob("*"):
            if p.is_dir() or "__pycache__" in p.parts:
                continue
            rel = p.relative_to(devtools.TEMPLATE.parent.parent)   # oreo_cli/...
            pkg = ".".join(rel.parent.parts)
            if p.suffix == ".py":
                self.assertIn(pkg, packages, str(rel))
            else:
                self.assertIn(p.name, data.get(pkg, []), str(rel))


class NamesTest(unittest.TestCase):
    def test_ids_and_display_names(self):
        self.assertEqual(devtools.names_for("my_game"), ("my_game", "My Game"))
        self.assertEqual(devtools.names_for("My Game"), ("my_game", "My Game"))
        self.assertEqual(devtools.names_for("pixel-pet"), ("pixel_pet", "Pixel Pet"))
        self.assertEqual(devtools.names_for("2048 Clone"), ("clone", "2048 Clone"))
        self.assertEqual(devtools.names_for("x", "Shown"), ("x", "Shown"))

    def test_bad_names(self):
        from oreo_cli.errors import UsageError
        for name, display in (("!!!", None), ("a" * 40, None), ("ok", "x" * 30),
                              ("ok", "café")):
            with self.assertRaises(UsageError, msg=name):
                devtools.names_for(name, display)


class NewTest(TmpDir):
    def test_scaffold_passes_the_checks_cleanly(self):
        r = run_cli(["new", "My Game", "--author", "octocat", "--dir", str(self.tmp)])
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(r.links, [])
        app = self.tmp / "my_game"
        self.assertEqual(appcheck.validate(app), ([], []))
        m = json.loads((app / "manifest.json").read_text())
        self.assertEqual((m["name"], m["author"], m["icon"], m["version"], m["type"]),
                         ("My Game", "octocat", "my_game_icon.png", "0.1.0", "app"))
        self.assertTrue((app / "assets/optimized/my_game_icon.py").is_file())
        self.assertFalse((app / "assets/optimized/example_icon.py").exists())
        src = (app / "src/app.py").read_text()
        self.assertIn('name         = "My Game"', src)
        self.assertIn('draw_header(d, "MY GAME")', src)
        self.assertIn('state.app_id(__name__, "my_game")', src)
        ast.parse(src)
        self.assertIn("falera app install", (app / "README.md").read_text())
        self.assertIn("created", r.out)

    def test_refuses_an_existing_folder(self):
        (self.tmp / "taken").mkdir()
        r = run_cli(["new", "taken", "--dir", str(self.tmp)])
        self.assertEqual(r.rc, 1)
        self.assertIn("already exists", r.out)

    def test_author_from_git_or_placeholder(self):
        with mock.patch.object(devtools, "_git_author", return_value=None):
            r = run_cli(["new", "solo", "--dir", str(self.tmp)])
        self.assertEqual(r.rc, 0, r.out)
        m = json.loads((self.tmp / "solo/manifest.json").read_text())
        self.assertEqual(m["author"], "your-github-handle")
        self.assertIn('set "author"', r.out)

    def test_template_change_is_caught(self):
        broken = self.tmp / "tpl"
        shutil.copytree(devtools.TEMPLATE, broken)
        (broken / "src/app.py").write_text("class App: pass\n")
        with mock.patch.object(devtools, "TEMPLATE", broken):
            r = run_cli(["new", "x", "--dir", str(self.tmp / "out")])
        self.assertEqual(r.rc, 1)
        self.assertIn("template changed", r.out)
        # no half-made folder left to block the next try
        self.assertFalse((self.tmp / "out" / "x").exists())
        r = run_cli(["new", "x", "--dir", str(self.tmp / "out")])
        self.assertEqual(r.rc, 0, r.out)
        self.assertTrue((self.tmp / "out" / "x" / "manifest.json").exists())


class AppInstallTest(TmpDir):
    def setUp(self):
        super().setUp()
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)
        r = run_cli(["new", "my_game", "--author", "octocat", "--dir", str(self.tmp)])
        self.assertEqual(r.rc, 0, r.out)
        self.app = self.tmp / "my_game"

    def install(self, *extra, **kw):
        return run_cli(["app", "install", str(self.app)] + list(extra), fake=self.fake, **kw)

    def test_installs_device_files_only(self):
        (self.app / "tests").mkdir()
        (self.app / "tests/test_x.py").write_text("pass\n")
        r = self.install()
        self.assertEqual(r.rc, 0, r.out)
        on_badge = sorted(p.relative_to(self.fake.root + "/apps/my_game").as_posix()
                          for p in Path(self.fake.root, "apps/my_game").rglob("*")
                          if p.is_file())
        self.assertEqual(on_badge, ["__init__.py", "assets/__init__.py",
                                    "assets/optimized/__init__.py",
                                    "assets/optimized/my_game_icon.py", "main.py",
                                    "manifest.json", "src/__init__.py", "src/app.py"])
        self.assertEqual(self.fake.get("/apps/my_game/src/app.py"),
                         (self.app / "src/app.py").read_bytes())
        self.assertIn("installed My Game to /apps/my_game", r.out)
        self.assertIn("FaleraOS is restarting; open My Game", r.out)
        self.assertEqual(self.fake.restarts, ["soft"])
        # the verified push: temp file, SHA-256 compared, renamed into place
        self.assertTrue(any("hashlib.sha256" in c and "os.rename" in c for c in self.fake.sent))

    def test_reinstall_removes_stale_files(self):
        (self.app / "src/old.py").write_text("x = 1\n")
        self.assertEqual(self.install().rc, 0)
        self.assertTrue(self.fake.exists("/apps/my_game/src/old.py"))
        (self.app / "src/old.py").unlink()
        r = self.install()
        self.assertEqual(r.rc, 0, r.out)
        self.assertFalse(self.fake.exists("/apps/my_game/src/old.py"))
        self.assertIn("already on the badge", r.out)
        self.assertIn("removed 1 file(s)", r.out)

    def test_invalid_folder_never_touches_the_badge(self):
        (self.app / "main.py").write_text("print('no App here')\n")
        r = run_cli(["app", "install", str(self.app)])
        self.assertEqual(r.rc, 1, r.out)
        self.assertIn("does not expose App", r.out)
        self.assertIn("cannot be installed", r.out)
        self.assertEqual(r.links, [])

    def test_builtin_needs_force(self):
        m = json.loads((self.app / "manifest.json").read_text())
        m["slug"] = "settings"
        (self.app / "manifest.json").write_text(json.dumps(m))
        r = run_cli(["app", "install", str(self.app)])
        self.assertEqual(r.rc, 1, r.out)
        self.assertIn("built-in app", r.out)
        self.assertEqual(r.links, [])
        r = self.install("--force")
        self.assertEqual(r.rc, 0, r.out)
        self.assertTrue(self.fake.exists("/apps/settings/src/app.py"))

    def test_not_enough_space(self):
        fake = FakeTransport(total=72 * 1024)
        self.addCleanup(fake.cleanup)
        r = run_cli(["app", "install", str(self.app)], fake=fake)
        self.assertEqual(r.rc, 1, r.out)
        self.assertIn("not enough space", r.out)
        self.assertFalse(fake.exists("/apps/my_game/main.py"))

    def test_missing_folder(self):
        r = run_cli(["app", "install", str(self.tmp / "nope")])
        self.assertEqual(r.rc, 1)
        self.assertIn("not a folder", r.out)
        self.assertEqual(r.links, [])

    def test_reset_none_message(self):
        r = run_cli(["--reset", "none", "app", "install", str(self.app)], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("MicroPython prompt", r.out)

    def test_list_and_remove(self):
        self.assertEqual(self.install().rc, 0)
        r = run_cli(["app", "list"], fake=self.fake)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("my_game", r.out)
        r = run_cli(["app", "remove", "my_game"], fake=self.fake, interactive=True,
                    inputs=["y"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertFalse(self.fake.exists("/apps/my_game"))

    def test_usage_errors(self):
        for argv in (["app", "install"], ["app", "remove"], ["app", "remove", "/apps/x"]):
            r = run_cli(argv)
            self.assertEqual(r.rc, 2, (argv, r.out))
            self.assertEqual(r.links, [])

    @unittest.skipUnless((REPO / "oreoOS" / "store.py").exists(), "not in a checkout")
    def test_system_apps_cover_the_store_defaults(self):
        # against the badge's own list, not commands.DEFAULT_APPS (which
        # SYSTEM_APPS is built from, so comparing those proves nothing)
        found = None
        for node in ast.parse((REPO / "oreoOS" / "store.py").read_text(encoding="utf-8")).body:
            if isinstance(node, ast.Assign) and any(
                    isinstance(t, ast.Name) and t.id == "DEFAULT_APPS" for t in node.targets):
                found = ast.literal_eval(node.value)
        self.assertIsNotNone(found, "DEFAULT_APPS not found in oreoOS/store.py")
        self.assertLessEqual(set(found), set(devtools.SYSTEM_APPS))
        self.assertIn("launcher", devtools.SYSTEM_APPS)


class DevNotesTest(TmpDir):
    def test_notes_match_how_the_launcher_loads_apps(self):
        (self.tmp / "manifest.json").write_text("{}")
        text = " ".join(commands.dev_notes(self.tmp))
        self.assertIn("/remote", text)
        self.assertIn("falera app install", text)
        self.assertIn("sys.modules", text)
        plain = " ".join(commands.dev_notes(self.tmp / "nothing"))
        self.assertNotIn("falera app install", plain)

    @unittest.skipUnless((REPO / "oreoOS" / "launcher.py").exists(), "not in a checkout")
    def test_launcher_loads_remote_apps(self):
        # dev_notes() says FaleraOS started from the REPL loads apps from
        # /remote/apps. If the launcher drops that, update the notes.
        src = (REPO / "oreoOS" / "launcher.py").read_text(encoding="utf-8")
        self.assertIn('REMOTE_APPS = "/remote/apps"', src)
        self.assertIn("def unload_app(", src)

    def test_dev_notes_for_a_mount_with_apps(self):
        d = Path(self.tmp) / "work" / "apps" / "my_app"
        d.mkdir(parents=True)
        (d / "manifest.json").write_text("{}")
        text = " ".join(commands.dev_notes(Path(self.tmp) / "work"))
        self.assertIn("exec(open('/main.py').read())", text)
        self.assertIn("/remote/apps", text)


class HelpAndDocsTest(unittest.TestCase):
    NEW = ("setup", "new", "app", "dev")

    def test_help_has_examples(self):
        from oreo_cli.main import HELP
        for name in self.NEW:
            # `falera help <name>` itself is covered in test_safety
            self.assertIn("  falera %s" % name, HELP[name][1], name)

    @unittest.skipUnless((REPO / "docs" / "CLI.md").exists(), "not in a checkout")
    def test_cli_md_documents_the_new_commands(self):
        text = (REPO / "docs" / "CLI.md").read_text(encoding="utf-8")
        for heading in ("### `falera setup`", "### `falera new`", "### `falera app`",
                        "### `falera dev`"):
            self.assertIn(heading, text)
        for key in ("| **t** |", "| **p** |", "| **i** |"):
            self.assertIn(key, text)

    def test_new_never_opens_a_port(self):
        with tempfile.TemporaryDirectory() as d:
            r = run_cli(["new", "x_app", "--author", "octocat", "--dir", d])
            self.assertEqual(r.rc, 0, r.out)
            self.assertEqual(r.links, [])


if __name__ == "__main__":
    unittest.main()
