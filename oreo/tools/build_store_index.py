#!/usr/bin/env python3
"""Regenerate apps_market/index.json, the App Store catalogue.

The badge's App Store downloads this one file to list every installable
app. Each entry has two kinds of fields:

  curated   name, tagline, description, category, author and featured
            order -- edited by hand in index.json and kept as they are by
            this tool;
  computed  id (manifest "slug" or the folder name), version and icon
            (from the app's manifest.json), files and size (the files
            that go on the badge, same rule as tools/deploy.py).

New folders under apps_market/ get an entry seeded from their manifest.
Entries whose folder does not exist yet are kept unchanged, so the
catalogue can announce an app another branch is still building (the
badge then lists its files through the GitHub API at install time).

    python3 tools/build_store_index.py              # rewrite index.json
    python3 tools/build_store_index.py --check      # exit 1 if stale

Run it after changing anything under apps_market/ and commit the result.
"""

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MARKET = REPO / "apps_market"
INDEX = MARKET / "index.json"
CATEGORIES = ("Games", "Tools", "Utilities", "Social", "System")


def device_file(rel):
    """Mirror of oreoOS.store.device_file (tests keep them in step)."""
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


def app_files(folder):
    out = []
    for p in sorted(folder.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(folder).as_posix()
        if device_file(rel):
            out.append([rel, p.stat().st_size])
    return out


def build(current):
    entries = {e["path"]: dict(e) for e in current.get("apps", [])}
    folders = sorted(p for p in MARKET.iterdir()
                     if p.is_dir() and (p / "manifest.json").exists())
    for folder in folders:
        path = "apps_market/" + folder.name
        manifest = json.loads((folder / "manifest.json").read_text())
        e = entries.get(path) or {
            "name": manifest.get("name", folder.name),
            "tagline": manifest.get("description", "")[:28],
            "description": manifest.get("description", ""),
            "category": "Tools",
            "author": manifest.get("author", ""),
        }
        e["id"] = manifest.get("slug") or folder.name
        e["path"] = path
        e["version"] = str(manifest.get("version", "0"))
        if manifest.get("icon"):
            e["icon"] = manifest["icon"]
        e["files"] = app_files(folder)
        e["size"] = sum(size for _, size in e["files"])
        entries[path] = e

    order = [e["path"] for e in current.get("apps", [])]
    apps = sorted(entries.values(),
                  key=lambda e: (order.index(e["path"]) if e["path"] in order
                                 else len(order), e["path"]))
    keys = ("id", "path", "name", "tagline", "description", "category",
            "author", "version", "icon", "size", "files")
    apps = [{k: e[k] for k in keys if k in e} for e in apps]
    return {
        "format": 1,
        "featured": current.get("featured", []),
        "apps": apps,
    }


def render(index):
    """Stable, diff-friendly JSON: one file per line."""
    lines = ["{", '  "format": %d,' % index["format"],
             '  "featured": %s,' % json.dumps(index["featured"]),
             '  "apps": [']
    for i, e in enumerate(index["apps"]):
        lines.append("    {")
        fields = [k for k in e if k != "files"]
        for k in fields:
            lines.append('      %s: %s,' % (json.dumps(k), json.dumps(e[k], ensure_ascii=False)))
        files = e.get("files", [])
        if files:
            lines.append('      "files": [')
            lines += ['        %s%s' % (json.dumps(f), "," if j < len(files) - 1 else "")
                      for j, f in enumerate(files)]
            lines.append("      ]")
        else:
            lines[-1] = lines[-1].rstrip(",")
        lines.append("    }" + ("," if i < len(index["apps"]) - 1 else ""))
    lines += ["  ]", "}", ""]
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true",
                    help="exit 1 if index.json is out of date")
    args = ap.parse_args(argv)
    current = json.loads(INDEX.read_text()) if INDEX.exists() else {}
    text = render(build(current))
    if args.check:
        if not INDEX.exists() or INDEX.read_text() != text:
            print("apps_market/index.json is stale: run python3 tools/build_store_index.py")
            return 1
        return 0
    INDEX.write_text(text)
    print("wrote %s (%d apps)" % (INDEX.relative_to(REPO), len(json.loads(text)["apps"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
