"""App development from the computer: `falera new` and `falera app`.

`falera new <name>` copies the app template that ships inside this package
(oreo_cli/app_template, a copy of app_templates/ in the FaleraOS repo) into a
new folder and fills in the name, id and author.

`falera app install <folder>` checks the folder with the same rules as
tools/validate_app.py (vendored in appcheck.py), copies the files that
belong on the badge to /apps/<id>/ with the verified push (temp file,
SHA-256, rename), removes files a previous install left that are no
longer in the folder, and lets FaleraOS restart so the drawer lists it.
"""

import json
import posixpath
import re
import shutil
import subprocess
from pathlib import Path

from . import appcheck
from .commands import DEFAULT_APPS, apps_action, command
from .errors import OreoError, UsageError, local_file
from .ui import esc, human

TEMPLATE = Path(__file__).resolve().parent / "app_template"
TEMPLATE_ID = "example"
TEMPLATE_NAME = "Example"
APPS_DIR = "/apps"
# Not in DEFAULT_APPS for the store's purposes, but never replace it either.
SYSTEM_APPS = tuple(DEFAULT_APPS) + ("launcher",)


# ── falera new ─────────────────────────────────────────────────────────

def names_for(name, display=None):
    """(app id, display name) from what the person typed: `my_game`,
    `My Game` and `my-game` all give ("my_game", "My Game")."""
    raw = name.strip()
    if not raw:
        raise UsageError("the app needs a name", hint="falera new my_game")
    aid = re.sub(r"[^a-z0-9]+", "_", raw.lower()).strip("_")
    aid = re.sub(r"^[0-9_]+", "", aid)
    if not appcheck._ID_RE.match(aid or ""):
        raise UsageError("cannot make an app id from %r" % name,
                         hint="start with a letter; letters, digits and _ only, "
                              "at most 32 characters (e.g. falera new my_game)")
    if display is None:
        if re.match(r"^[a-z0-9_-]+$", raw):
            display = " ".join(w.capitalize() for w in re.split(r"[_-]+", raw) if w)
        else:
            display = raw
    display = display.strip()
    if not display or len(display) > 24 or not all(32 <= ord(c) < 127 for c in display):
        raise UsageError("the display name must be 1 to 24 plain ASCII characters "
                         "(the badge font has no others)", hint="pass --name \"My Game\"")
    return aid, display


def _git_author():
    for key in ("github.user", "user.name"):
        try:
            out = subprocess.run(["git", "config", "--get", key], capture_output=True,
                                 text=True, timeout=5).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            return None
        if out and (key == "github.user" or re.match(r"^[A-Za-z0-9-]{1,39}$", out)):
            return out
    return None


def _replace(path, pairs):
    text = path.read_text(encoding="utf-8")
    for old, new in pairs:
        if old not in text:
            raise OreoError("the app template changed: %r is missing from %s" % (old, path.name),
                            hint="this is a bug in falera; please report it")
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")


README = """# {name}

A new FaleraOS app, made with `falera new`. It starts as the counter example:
**A** adds one, **B** takes one away, **HOME** goes back.

## Try it on the badge

```sh
falera app install .      # checks the folder, copies it to /apps/{id}/
```

FaleraOS restarts and **{name}** is in the Apps drawer.

## Files

- `manifest.json`: name, version, description, author, icon
- `main.py`: entry shim, exposes `App`
- `src/app.py`: the app itself
- `assets/optimized/{id}_icon.py`: the drawer icon (from `icon.png`, made
  with `tools/app_icon.py` in the FaleraOS repo)

The app guide: https://github.com/elixpo/falera/blob/main/docs/APPS.md
"""


def scaffold(dest, aid, display, author):
    """Copy the template to `dest` and personalise it."""
    if not TEMPLATE.is_dir():
        raise OreoError("the app template is missing from this falera install",
                        hint="reinstall falera-cli")
    shutil.copytree(TEMPLATE, dest,
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "README.md"))
    stem = "%s_icon" % aid
    icon_dir = dest / "assets" / "optimized"
    (icon_dir / ("%s_icon.py" % TEMPLATE_ID)).rename(icon_dir / ("%s.py" % stem))
    manifest = json.loads((dest / "manifest.json").read_text(encoding="utf-8"))
    manifest.update(name=display, version="0.1.0", icon=stem + ".png",
                    description="%s: A adds one, B takes one away (from the template)."
                    % display, author=author or "your-github-handle")
    (dest / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    _replace(dest / "src" / "app.py", [
        ('state.app_id(__name__, "%s")' % TEMPLATE_ID, 'state.app_id(__name__, "%s")' % aid),
        ('name         = "%s"' % TEMPLATE_NAME, "name         = %s" % json.dumps(display)),
        ('draw_header(d, "%s")' % TEMPLATE_NAME.upper(),
         "draw_header(d, %s)" % json.dumps(display.upper())),
    ])
    (dest / "README.md").write_text(README.format(name=display, id=aid), encoding="utf-8")


@command("new")
def cmd_new(ctx):
    ui = ctx.ui
    args = ctx.args
    aid, display = names_for(args.name, args.display_name)
    parent = Path(args.dir).expanduser() if args.dir else Path.cwd()
    dest = parent / aid
    if dest.exists():
        raise OreoError("%s already exists" % dest, hint="pick another name or remove it first")
    author = args.author or _git_author()
    ui.header("new", "app %s (%s)" % (esc(display), aid))
    with local_file(dest):
        parent.mkdir(parents=True, exist_ok=True)
        try:
            scaffold(dest, aid, display, author)
        except BaseException:
            # do not leave a half-made folder that blocks the next try
            shutil.rmtree(dest, ignore_errors=True)
            raise
    errors, warnings = appcheck.validate(dest)
    if errors:   # the template itself is broken
        raise OreoError("the new app does not pass the checks: %s" % "; ".join(errors),
                        hint="this is a bug in falera; please report it")
    ui.ok("created %s" % esc(dest))
    for w in warnings:
        ui.warn(esc(w))
    if not args.author and not author:
        ui.note('set "author" in manifest.json to your GitHub handle')
    ui.note("next:")
    ui.step("edit %s" % esc(dest / "src" / "app.py"))
    ui.step("falera app install %s" % esc(dest))
    return 0


# ── falera app install ─────────────────────────────────────────────────

def check_folder(ui, folder):
    """(app id, manifest, [(local Path, rel)]) for a folder that passes the
    checks; raises with every error listed otherwise."""
    folder = Path(folder).expanduser().resolve()
    if not folder.is_dir():
        raise OreoError("%s is not a folder" % folder)
    errors, warnings = appcheck.validate(folder)
    if errors:
        for e in errors:
            ui.error(esc(e))
        raise OreoError("%s cannot be installed: fix the error(s) above" % folder.name,
                        hint="the same checks as tools/validate_app.py in the FaleraOS repo")
    for w in warnings:
        ui.warn(esc(w))
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    aid = appcheck.app_id(folder, manifest)
    files = []
    for p in sorted(folder.rglob("*")):
        if p.is_file():
            rel = p.relative_to(folder).as_posix()
            if appcheck.device_file(rel):
                files.append((p, rel))
    return aid, manifest, files


def refuse_builtin(aid):
    raise OreoError("%s is a built-in app; installing over it replaces FaleraOS's own copy"
                    % aid, hint="rename your app (\"slug\" in manifest.json), or add "
                                "--force if you are working on the built-in app")


def install_folder(ui, b, checked, force=False, verify=True):
    """Copy a checked app folder (see check_folder) to /apps/<id>/.
    Returns (id, manifest)."""
    aid, manifest, files = checked
    if aid in SYSTEM_APPS and not force:
        refuse_builtin(aid)
    blobs = []
    for local, rel in files:
        with local_file(local):
            blobs.append((rel, local.read_bytes()))
    total = sum(len(d) for _, d in blobs)
    target = posixpath.join(APPS_DIR, aid)
    existing = b.stat(target)
    old = set()
    if existing is not None:
        if not existing["dir"]:
            raise OreoError("%s on the badge is a file, not an app folder" % target)
        old = {p for p, _ in b.walk(target)}
    free, _ = b.free()
    if total + 64 * 1024 > free:
        raise OreoError("not enough space: %s to copy, %s free on the badge"
                        % (human(total), human(free)),
                        hint="free some space (`falera info`, `falera rm`)")
    ui.header("app install", "%s %s, %d file(s), %s -> %s"
              % (esc(manifest.get("name") or aid), esc(manifest.get("version") or ""),
                 len(blobs), human(total), target))
    if existing is not None:
        ui.note("%s is already on the badge; replacing it (saved data in /state stays)" % aid)
    name = manifest.get("name") or aid
    with b.showing():
        for i, (rel, data) in enumerate(blobs):
            with ui.progress(esc(rel), total=len(data)) as update:
                b.write_file(data, posixpath.join(target, rel), progress=update, verify=verify,
                             check_space=False, screen=("Installing %s" % name,
                                                        "%s (%d of %d)" % (rel, i + 1, len(blobs))))
        new = {posixpath.join(target, rel) for rel, _ in blobs}
        stale = sorted(p for p in old - new if not p.endswith(".part"))
        for p in stale:
            b.rm(p)
    if stale:
        ui.note("removed %d file(s) left from the previous install" % len(stale))
    ui.ok("installed %s to %s" % (esc(manifest.get("name") or aid), target))
    return aid, manifest


def after_install(ui, name, reset):
    if reset == "none":
        ui.note("the badge is at the MicroPython prompt (--reset none); restart FaleraOS "
                "(Ctrl-D there, or unplug and replug) to see %s in the Apps drawer" % esc(name))
    else:
        ui.ok("FaleraOS is restarting; open %s from the Apps drawer" % esc(name))
        ui.note("to try a change, run `falera app install` again (or `falera push` the changed "
                "files); FaleraOS restarts afterwards, so the new code is what loads")


def _app_target_required(action, target):
    if not target:
        hint = {"install": "falera app install ./my_app",
                "remove": "falera app remove my_app"}[action]
        raise UsageError("which app?", hint=hint)


@command("app")
def cmd_app(ctx):
    args = ctx.args
    ui = ctx.ui
    if args.action == "list":
        with ctx.session() as b:
            return apps_action(ui, b, "list")
    _app_target_required(args.action, args.target)
    if args.action == "remove":
        if posixpath.basename(args.target.rstrip("/")) != args.target:
            raise UsageError("give the app id, not a path", hint="falera app remove my_app")
        with ctx.session() as b:
            return apps_action(ui, b, "remove", args.target)
    # install: check the folder before the badge is touched
    checked = check_folder(ui, args.target)
    if checked[0] in SYSTEM_APPS and not args.force:
        refuse_builtin(checked[0])
    with ctx.session() as b:
        aid, manifest = install_folder(ui, b, checked, force=args.force,
                                       verify=not args.no_verify)
    after_install(ui, manifest.get("name") or aid, ctx.args.reset)
    return 0


def install_prompt(ui, b):
    """The interactive view's "install an app from a folder"."""
    path = ui.ask("app folder on this computer", default="").strip().strip("'\"")
    if not path:
        return
    _, manifest = install_folder(ui, b, check_folder(ui, path))
    ui.note("%s appears in the Apps drawer when FaleraOS restarts (when you quit this view)"
            % esc(manifest.get("name") or ""))

