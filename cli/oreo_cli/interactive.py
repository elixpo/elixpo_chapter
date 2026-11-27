"""`falera` with no command: find the badge, show its status, then a menu.

A simple menu-driven view (status, file browser, apps, Wi-Fi, media,
Transfer, owner profile, app install, updates). The badge stays in the raw
REPL while the view is open, so FaleraOS is paused; it restarts when you
quit. The Transfer entry is the exception: the Transfer app runs inside
FaleraOS, so that entry restarts FaleraOS first, and the next entry that needs
the raw REPL pauses it again. Ctrl-C inside a menu action stops that action
and returns to the menu; Ctrl-C at the menu leaves the view.
"""

import argparse
import copy
import os
import posixpath
import shlex
from pathlib import Path

from . import commands, devtools, owner, transfer
from .badge import norm
from .errors import Cancelled, OreoError, local_file
from .ui import esc, human

MENU = [("1", "status"), ("2", "files"), ("3", "apps"), ("4", "Wi-Fi"),
        ("5", "add a photo, video or document"), ("t", "send files to Transfer"),
        ("p", "owner profile"), ("i", "install an app from a folder"),
        ("u", "update FaleraOS"), ("s", "shell"), ("q", "quit")]


def _menu(ui, items):
    ui.print("  ".join("[accent]%s[/] %s" % (k, esc(label)) for k, label in items))


def _guard(ui, fn, *a):
    """Run one menu action; report errors and stay in the view."""
    try:
        return fn(*a)
    except Cancelled as e:
        ui.warn(e.message)
    except KeyboardInterrupt:
        ui.print("")
        ui.warn("stopped; back to the menu")
    except OreoError as e:
        ui.error(e.message, hint=e.hint)
    return None


def files_view(ui, b):
    cwd = "/"
    while True:
        entries = b.ls(cwd)
        ui.header("files", cwd)
        ui.table(["#", "Name", ">Size"],
                 [[str(i + 1), ("[accent]%s/[/]" % esc(e["name"])) if e["dir"] else esc(e["name"]),
                   "" if e["dir"] else human(e["size"])] for i, e in enumerate(entries)],
                 empty="empty folder")
        ui.note("number: open folder · ..: up · p <n>: download · d <n>: delete · "
                "u <file on this computer>: upload here · q: back")
        cmd = ui.ask("files", default="q").strip()
        if cmd in ("q", ""):
            return
        if cmd == "..":
            cwd = posixpath.dirname(cwd.rstrip("/")) or "/"
            continue
        verb, _, num = cmd.partition(" ")
        if verb == "u":
            _guard(ui, upload, ui, b, num.strip().strip("'\""), cwd)
            continue
        if verb.isdigit():
            verb, num = "o", verb
        if not num.strip().isdigit() or not 1 <= int(num) <= len(entries):
            ui.warn("pick a number from the list")
            continue
        e = entries[int(num) - 1]
        path = norm(posixpath.join(cwd, e["name"]))
        if verb == "o":
            if e["dir"]:
                cwd = path
            else:
                ui.note("%s: %s (p %s to download)" % (esc(path), human(e["size"]), num))
        elif verb == "p" and not e["dir"]:
            def _pull():
                target = Path(e["name"])
                if target.exists() and not ui.confirm(
                        "%s already exists here. Replace it?" % esc(target.resolve())):
                    raise Cancelled("not downloaded")
                with ui.progress(esc(e["name"]), total=e["size"]) as update:
                    data = b.read_file(path, progress=update)
                with local_file(target):
                    target.write_bytes(data)
                ui.ok("saved %s" % esc(target.resolve()))
            _guard(ui, _pull)
        elif verb == "d":
            if commands.is_protected(path):
                ui.error("%s belongs to FaleraOS" % esc(path), hint="use `falera rm --force` outside the view")
            elif ui.confirm("Delete %s%s?" % (esc(path), " and everything inside" if e["dir"] else "")):
                _guard(ui, b.rm, path, e["dir"])
        else:
            ui.warn("unknown action")


def upload(ui, b, local, cwd):
    """Copy one file from this computer into the folder being viewed."""
    if not local:
        ui.warn("which file? u <path on this computer>")
        return
    src = Path(local).expanduser()
    if not src.is_file():
        raise OreoError("%s: no such file on this computer" % src)
    with local_file(src):
        data = src.read_bytes()
    target = norm(posixpath.join(cwd, src.name))
    if b.stat(target) is not None and not ui.confirm(
            "%s exists on the badge. Replace it?" % esc(target)):
        raise Cancelled("not uploaded")
    with ui.progress(esc(src.name), total=len(data)) as update:
        b.write_file(data, target, progress=update)
    ui.ok("uploaded %s" % esc(target))


def apps_view(ui, b):
    commands.apps_action(ui, b, "list")
    while True:
        ui.note("i <id>: install · u: update all · r <id>: remove · f: refresh catalogue · q: back")
        cmd = ui.ask("apps", default="q").strip()
        verb, _, app = cmd.partition(" ")
        app = app.strip() or None
        if verb in ("q", ""):
            return
        action = {"i": "install", "u": "update", "r": "remove", "f": "refresh",
                  "l": "list"}.get(verb)
        if not action:
            ui.warn("unknown action")
            continue
        _guard(ui, commands.apps_action, ui, b, action, app)


def wifi_view(ui, b):
    _guard(ui, commands.wifi_saved, ui, b)
    while True:
        ui.note("s: scan · c <name>: connect · f <name>: forget · l: saved · q: back")
        cmd = ui.ask("wifi", default="q").strip()
        verb, _, ssid = cmd.partition(" ")
        ssid = ssid.strip()
        if verb in ("q", ""):
            return
        if verb == "s":
            _guard(ui, commands.wifi_scan, ui, b)
        elif verb == "l":
            _guard(ui, commands.wifi_saved, ui, b)
        elif verb == "c" and ssid:
            password = ui.secret("Password for %s (empty for an open network)" % ssid)
            _guard(ui, commands.wifi_connect, ui, b, ssid, password)
            password = None
        elif verb == "f" and ssid:
            if ui.confirm("Forget %s?" % esc(ssid)):
                _guard(ui, commands.wifi_forget, ui, b, ssid)
        else:
            ui.warn("unknown action (names with spaces are fine: c Home Net)")


def media_view(ui, b):
    path = ui.ask("file to add (photo, video, .md/.txt)", default="").strip().strip("'\"")
    if not path:
        return
    prepared = commands.prepare_media(ui, [path], commands.MediaOptions())
    commands.send_media(ui, b, prepared)


def transfer_view(ctx, b):
    """`falera transfer send` from the menu: pick files, restart FaleraOS so the
    Transfer app can run, then send them with the code the badge shows."""
    ui = ctx.ui
    raw = ui.ask("files to send (photos, videos, .md/.txt; separate with spaces)",
                 default="").strip()
    if not raw:
        return
    files = split_files(raw)
    restarted = []
    try:
        send_to_transfer(ctx, b, files, on_restart=lambda: restarted.append(1))
    finally:
        if restarted:
            ui.note("FaleraOS keeps running; the next menu entry that needs the badge "
                    "pauses it again")


def split_files(raw):
    """File names typed on one line; quotes group names with spaces."""
    try:
        # Windows paths keep their backslashes; quotes still group names with spaces
        return [f.strip("'\"") for f in shlex.split(raw, posix=os.name != "nt")]
    except ValueError as e:
        raise OreoError("could not read the file list: %s" % e,
                        hint="put names with spaces in quotes")


def send_to_transfer(ctx, b, files, code=None, on_restart=None):
    """Convert `files`, restart FaleraOS so the Transfer app can run, then
    send them with the code the badge shows (asked through ctx.ui unless
    given). Used by the menu and the full-screen UI. FaleraOS keeps
    running afterwards; the next raw-REPL command pauses it again."""
    ui = ctx.ui
    args = argparse.Namespace(**vars(ctx.args))
    args.action, args.files, args.code, args.wait = "send", files, code, 60.0
    args.kind, args.seconds, args.photo_max = None, 10.0, 240
    tctx = copy.copy(ctx)
    tctx.args = args
    ui.header("transfer", "%d file(s) over USB to the Transfer app" % len(files))
    prepared = transfer.prepare(ui, files, args)   # before FaleraOS is restarted
    from .main import finish_shielded          # main imports this module lazily
    finish_shielded(b, "soft")                 # Transfer runs inside FaleraOS
    if on_restart is not None:
        on_restart()
    ui.note("FaleraOS is starting; open Transfer on the badge (apps drawer -> Tools -> "
            "Transfer) and type the code it shows")
    return transfer._session(tctx, lambda c, h: transfer.send_files(tctx, c, h, prepared))


def setup_view(ui, b):
    if owner.setup(ui, b):
        ui.note("apps read the new profile when FaleraOS restarts (when you quit this view)")


def run(ctx):
    ui = ctx.ui
    ui.header("Falera Badge", "looking for a badge on USB")
    with ctx.session() as b:
        with ui.status("reading the badge"):
            info = b.info()
        commands.show_info(ui, info, b.port)
        if not ui.interactive:
            ui.note("no terminal: showing status only. `falera help` lists the commands.")
            return 0
        ui.note("FaleraOS is paused while this view is open and restarts when you quit.")
        while True:
            ui.print("")
            _menu(ui, MENU)
            choice = ui.ask("choose", default="q").strip().lower()
            if choice in ("q", "quit", "exit", ""):
                break
            if choice == "1":
                _guard(ui, lambda: commands.show_info(ui, b.info(), b.port))
            elif choice == "2":
                _guard(ui, files_view, ui, b)
            elif choice == "3":
                _guard(ui, apps_view, ui, b)
            elif choice == "4":
                _guard(ui, wifi_view, ui, b)
            elif choice == "5":
                _guard(ui, media_view, ui, b)
            elif choice == "t":
                _guard(ui, transfer_view, ctx, b)
            elif choice == "p":
                ui.header("setup", "owner profile in %s" % owner.PATH)
                _guard(ui, setup_view, ui, b)
            elif choice == "i":
                ui.header("app install", "an app folder from this computer")
                _guard(ui, devtools.install_prompt, ui, b)
            elif choice == "u":
                from . import update
                ui.header("update", "FaleraOS from GitHub releases, through the badge's Wi-Fi")
                _guard(ui, update.run_update, ctx, b)
                if getattr(b.link, "t", None) is None and not b.entered:
                    # the badge restarted into the new FaleraOS: nothing to go back to
                    ui.note("the badge restarted; run `falera` again to reopen this view")
                    return 0
            elif choice == "s":
                b.connect()
                b.link.friendly()
                ui.header("shell", "Ctrl-] or Ctrl-X to go back to the menu")
                commands._repl(b.link, ui)
                ui.print("")
                b.link.enter(soft_reset=False)
            else:
                ui.warn("choose one of: " + ", ".join(k for k, _ in MENU))
    ui.ok("FaleraOS is starting again" if ctx.args.reset != "none" else "done")
    return 0
