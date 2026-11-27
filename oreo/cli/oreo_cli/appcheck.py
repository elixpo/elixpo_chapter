"""App folder checks, vendored from tools/validate_app.py.

`falera app install` and `falera new` run the same checks as the repo's
validator, without needing a FaleraOS checkout. Everything below the
imports is a copy of tools/validate_app.py (main() and all_apps() left
out); cli/tests/test_devtools.py compares the two inside a checkout, so
change both together.

validate(folder) returns (errors, warnings): errors mean the launcher or
the App Store cannot use the app, warnings point at things that work but
make the app harder to use or maintain.
"""

import ast
import json
import re
from pathlib import Path

# The icon check also looks in <repo>/assets/icons; inside the package
# there is no such folder, so only the app's own icon module counts.
REPO = Path(__file__).resolve().parent
_ID_RE = re.compile(r"^[a-z][a-z0-9_]{0,31}$")

_LEAK_PATTERNS = (
    (re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"), "GitHub token"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{40,}"), "GitHub token"),
    (re.compile(r"""(WIFI_PASSWORD|OWM_API_KEY|GH_TOKEN|GITHUB_TOKEN)\s*=\s*["'][^"']+["']"""),
     "hard-coded credential"),
    (re.compile(r"sk-[A-Za-z0-9]{32,}"), "API key"),
)

# Direct hardware modules: apps should go through the os object they get
# in on_enter (os.display, os.buttons, ...) so a simulator can stand in.
_HW_MODULES = ("oreoWare", "machine")


def device_file(rel):
    """Mirror of oreoOS.store.device_file: what goes on the badge."""
    if rel in ("__init__.py", "main.py", "manifest.json", "assets/__init__.py"):
        return True
    parts = rel.split("/")
    if "__pycache__" in parts or "tests" in parts:
        return False
    if parts[0] == "src" and (rel.endswith(".py") or rel.endswith(".mpy")):
        return True
    if rel.startswith("assets/optimized/") and len(parts) == 3:
        return rel.endswith(".py")
    return False


def app_id(folder, manifest):
    return manifest.get("slug") or folder.name


def icon_stem(manifest, folder_name):
    icon = manifest.get("icon") or "%s_icon.png" % folder_name
    return icon.rsplit(".", 1)[0].replace("-", "_")


def _exports_app(tree):
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == "App":
            return True
        if isinstance(node, (ast.ImportFrom, ast.Import)):
            for a in node.names:
                if (a.asname or a.name.split(".")[-1]) == "App":
                    return True
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == "App":
                    return True
    return False


def _hw_imports(tree):
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names = [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom) and node.level == 0:
            names = [node.module or ""]
        else:
            continue
        for n in names:
            root = n.split(".")[0]
            if root in _HW_MODULES:
                found.add(root)
    return found


def _calls_present(tree):
    for node in ast.walk(tree):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == "present"
                and isinstance(node.func.value, ast.Name)
                and node.func.value.id in ("d", "display")):
            return True
    return False


def validate(folder, repo=REPO):
    """Return (errors, warnings) for one app folder, as lists of str."""
    folder = Path(folder)
    errors, warnings = [], []

    mpath = folder / "manifest.json"
    if not mpath.is_file():
        return ["no manifest.json"], warnings
    try:
        manifest = json.loads(mpath.read_text(encoding="utf-8"))
    except (ValueError, UnicodeDecodeError) as e:
        return ["manifest.json is not valid JSON: %s" % e], warnings
    if not isinstance(manifest, dict):
        return ["manifest.json must be a JSON object"], warnings

    for field in ("name", "version"):
        if not str(manifest.get(field, "")).strip():
            errors.append("manifest.json has no %r" % field)
    if manifest.get("type", "app") != "app":
        errors.append("manifest.json type must be \"app\"")
    if not str(manifest.get("description", "")).strip():
        warnings.append("manifest.json has no description (the App Store "
                        "and the README use it)")
    elif len(manifest["description"]) > 120:
        warnings.append("description is %d characters; keep it under 120"
                        % len(manifest["description"]))

    aid = app_id(folder, manifest)
    if not _ID_RE.match(aid):
        hint = ' (add "slug": "%s" to manifest.json)' % re.sub(
            r"[^a-z0-9_]", "_", aid.lower()).lstrip("_0123456789") \
            if not manifest.get("slug") else ""
        errors.append("app id %r is not an importable name%s" % (aid, hint))

    if not (folder / "__init__.py").is_file():
        errors.append("no __init__.py (the folder must be a package)")
    main = folder / "main.py"
    if not main.is_file():
        errors.append("no main.py (the launcher imports apps.<id>.main)")

    trees = {}
    for p in sorted(folder.rglob("*.py")):
        rel = p.relative_to(folder).as_posix()
        if not device_file(rel):
            continue
        try:
            src = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            errors.append("%s is not UTF-8" % rel)
            continue
        try:
            trees[rel] = ast.parse(src, filename=str(p))
        except SyntaxError as e:
            errors.append("%s:%s does not compile: %s" % (rel, e.lineno, e.msg))
            continue
        if rel.startswith("assets/optimized/"):
            continue   # generated bitmaps: big, never contain secrets
        for rx, what in _LEAK_PATTERNS:
            m = rx.search(src)
            if m:
                line = src.count("\n", 0, m.start()) + 1
                errors.append("%s:%d looks like a %s; keep secrets out of the "
                              "repo (/profile.json or .env.local)"
                              % (rel, line, what))

    if "main.py" in trees and not _exports_app(trees["main.py"]):
        errors.append("main.py does not expose App (e.g. "
                      "`from .src.app import App`)")

    hw = set()
    present = []
    for rel, tree in trees.items():
        if rel.startswith("assets/"):
            continue
        hw |= _hw_imports(tree)
        if _calls_present(tree):
            present.append(rel)
    if hw:
        warnings.append("imports %s directly; prefer the os object passed to "
                        "on_enter so the app runs in a simulator (#67)"
                        % ", ".join(sorted(hw)))
    if present:
        warnings.append("%s calls display.present(); the OS presents once per "
                        "frame" % ", ".join(present))

    stem = icon_stem(manifest, folder.name)
    if not ((folder / "assets" / "optimized" / (stem + ".py")).is_file()
            or (repo / "assets" / "icons" / "optimized" / (stem + ".py")).is_file()):
        warnings.append("no icon module %s.py: the tile shows a letter. Add "
                        "icon.png and run: python3 tools/app_icon.py %s"
                        % (stem, folder))
    if not (folder / "README.md").is_file():
        warnings.append("no README.md (what it does, controls, a screenshot)")

    return errors, warnings
