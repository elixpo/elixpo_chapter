"""The `falera` commands. Each handler takes a main.Ctx and returns an exit code."""

import os
import posixpath
import sys
from pathlib import Path

from . import discovery, doctor as doctor_mod, media, repo
from .badge import PROTECTED, norm
from .errors import Cancelled, LinkError, OreoError, UsageError, local_file
from . import ui as ui_mod
from .ui import esc, human

HANDLERS = {}


def command(name):
    def wrap(fn):
        HANDLERS[name] = fn
        return fn
    return wrap


# ── devs ─────────────────────────────────────────────────────────────

@command("devs")
def cmd_devs(ctx):
    ui = ctx.ui
    ports = discovery.all_ports(ctx.comports)
    badges = [p for p in ports if p.is_badge]
    ui.header("devices", "badges are found by USB ID 303a:83ec")
    rows = [[esc(p.device), p.usb_id, esc(p.serial or "-"), esc(p.description or "-")]
            for p in badges]
    ui.table(["Port", "USB ID", "Serial", "Description"], rows,
             empty="no badge connected")
    if ctx.args.all:
        rest = [p for p in ports if not p.is_badge]
        ui.table(["Port", "USB ID", "What it is"],
                 [[esc(p.device), p.usb_id, esc(p.known or p.description or "-")] for p in rest],
                 title="other USB serial devices", empty="no other USB serial devices")
    elif not badges:
        ui.note("`falera devs --all` lists other USB serial devices; `falera doctor` explains.")
    return 0 if badges else 3


# ── info ─────────────────────────────────────────────────────────────

def show_info(ui, info, port):
    rows = [("FaleraOS", "%s%s" % (info.get("os") or "[err]not installed[/]",
                                 (" [dim](%s)[/]" % info["date"]) if info.get("date") else "")),
            ("firmware", "MicroPython %s" % (info.get("mpy") or "?")),
            ("board", esc(info.get("machine") or "?")),
            ("port", esc(port))]
    wifi = info.get("wifi")
    if wifi is None:
        rows.append(("Wi-Fi", "[dim]unavailable[/]"))
    elif wifi.get("up"):
        rows.append(("Wi-Fi", "[ok]connected[/] %s, %d saved" % (wifi.get("ip") or "", wifi.get("saved", 0))))
    else:
        rows.append(("Wi-Fi", "not connected, %d saved [dim](`falera wifi`)[/]" % wifi.get("saved", 0)))
    rows.append(("Bluetooth", ("on at boot" if info.get("bt_auto") else "off at boot")
                 + " [dim](file transfer over Bluetooth arrives with #103)[/]"))
    bat = info.get("battery")
    if bat and bat.get("pct") is not None:
        rows.append(("battery", "%s%%%s" % (bat["pct"], (" (%.2f V)" % bat["v"]) if bat.get("v") else "")))
    else:
        rows.append(("battery", "[dim]no reading (USB power)[/]"))
    if info.get("mem_free") is not None:
        rows.append(("RAM free", human(info["mem_free"])))
    ui.kv(rows, title="Falera Badge")

    st = (info.get("storage") or {}).get("stats") or {}
    buckets = (info.get("storage") or {}).get("buckets")
    if st:
        total = st.get("total") or 0
        used = st.get("used") or 0
        pct = (100.0 * used / total) if total else 0
        ui.print("[key]storage[/]  %s used of %s, [ok]%s free[/] (%.0f%% used)"
                 % (human(used), human(total), human(st.get("free")), pct))
    if buckets:
        rows = []
        for name in ("system", "apps", "gallery", "documents", "misc"):
            b = buckets.get(name) or {}
            rows.append([name, human(b.get("bytes", 0)), str(b.get("count", 0))])
        ui.table(["Category", ">Size", ">Files"], rows)


@command("info")
def cmd_info(ctx):
    with ctx.session() as b:
        with ctx.ui.status("reading the badge"):
            info = b.info()
        ctx.ui.header("info")
        show_info(ctx.ui, info, b.port)


# ── shell / dev / run / logs ─────────────────────────────────────────

def _repl(link, ui):
    """Pass the terminal through to the badge until Ctrl-] / Ctrl-X."""
    try:
        from mpremote.console import Console
        from mpremote.repl import do_repl_main_loop
    except ImportError:
        raise OreoError("mpremote is not installed", hint="pip install 'mpremote>=1.28,<1.29'")

    class _State:
        transport = link.t

    console = Console()
    console.enter()
    try:
        do_repl_main_loop(_State, console, console.write, escape_non_printable=False,
                          code_to_inject=None, file_to_inject=None)
    finally:
        console.exit()


def need_terminal(ui, what):
    if not ui.interactive:
        raise UsageError("`falera %s` needs a terminal (standard input is not one)" % what,
                         hint="run it in a terminal window; to run a script without one, "
                              "use `falera run <file>`")


@command("shell")
def cmd_shell(ctx):
    ui = ctx.ui
    need_terminal(ui, "shell")
    with ctx.session() as b:
        b.connect()
        ui.header("shell", "MicroPython on %s. Ctrl-] or Ctrl-X to leave; FaleraOS restarts after."
                  % esc(b.port))
        b.link.friendly()
        _repl(b.link, ui)
    ui.print("")
    ui.ok("left the shell; FaleraOS is starting" if ctx.args.reset != "none" else "left the shell")


def dev_notes(folder):
    """What `falera dev` can and cannot do, true to how FaleraOS loads apps:
    FaleraOS does not run while the REPL is open, but started from the REPL
    it loads any app found under /remote/apps/<id>/ from the mount instead
    of /apps/<id>, and re-reads its files on every launch (apps are
    unloaded when they exit). See docs/APPS.md, "Live editing"."""
    notes = ["The REPL starts in /remote, so `import mymodule` loads your local copy. "
             "A module is imported once: after an edit, "
             "import sys; del sys.modules['mymodule'] and import it again.",
             "Ctrl-D here soft-resets the badge, which starts FaleraOS (main.py) and ends "
             "live editing; leave with Ctrl-] or Ctrl-X instead.",
             "FaleraOS is stopped while you are here. To reach its modules: "
             "import sys; sys.path.append('/')"]
    root = Path(folder)
    if (root / "apps").is_dir() and any((p / "manifest.json").is_file()
                                         for p in (root / "apps").iterdir() if p.is_dir()):
        notes.append("This folder has apps/<id>/: start FaleraOS with "
                     "import os; os.chdir('/'); exec(open('/main.py').read()) "
                     "and those apps load from the computer (the console prints "
                     "[dev] <id> from /remote/apps). Save, press HOME, reopen the app.")
    elif (root / "manifest.json").is_file():
        notes.append("This is an app folder. For live editing, mount its parent with the "
                     "app under apps/%s/ and start FaleraOS from the REPL "
                     "(see docs/APPS.md, \"Live editing\"); or run `falera app install %s` "
                     "to copy it to the badge." % (esc(root.name), esc(folder)))
    return notes


@command("dev")
def cmd_dev(ctx):
    ui = ctx.ui
    folder = Path(ctx.args.folder).expanduser().resolve()
    if not folder.is_dir():
        raise OreoError("%s is not a folder" % folder)
    if ctx.args.run and not (folder / ctx.args.run).is_file():
        raise OreoError("%s has no %s" % (folder, ctx.args.run))
    need_terminal(ui, "dev")
    with ctx.session() as b:
        b.connect()
        b.link.mount(str(folder))
        ui.header("dev", "%s is mounted at /remote. Ctrl-] or Ctrl-X to leave." % esc(folder))
        for line in dev_notes(folder):
            ui.note(line)
        b.link.friendly()
        if ctx.args.run:
            b.link.t.serial.write(("exec(open(%r).read())\r" % ctx.args.run).encode())
        _repl(b.link, ui)
    ui.print("")
    ui.ok("unmounted; FaleraOS is starting" if ctx.args.reset != "none" else "unmounted")


@command("run")
def cmd_run(ctx):
    ui = ctx.ui
    path = Path(ctx.args.file)
    if not path.is_file():
        raise OreoError("%s: no such file" % path)
    with local_file(path):
        source = path.read_bytes()
    out = getattr(sys.stdout, "buffer", None)

    def stream(chunk):
        chunk = chunk.replace(b"\x04", b"")
        if out is not None:
            out.write(chunk)
            out.flush()
        else:
            ui.console.print(chunk.decode("utf-8", "replace"), end="")
    with ctx.session() as b:
        ui.header("run", "%s on %s (Ctrl-C stops it)" % (esc(path.name), esc(b.port)))
        try:
            b.run_source(source, stream)
        except KeyboardInterrupt:
            b.link.interrupt()
            raise Cancelled("stopped %s" % path.name)
    ui.ok("finished")


class _Console:
    """Writes badge output to the terminal as text, whatever its encoding."""

    def __init__(self, stream=None):
        import codecs
        self.stream = stream or sys.stdout
        self.decoder = codecs.getincrementaldecoder("utf-8")("replace")

    def write(self, data):
        text = self.decoder.decode(data)
        if not text:
            return
        try:
            self.stream.write(text)
        except UnicodeEncodeError:
            enc = getattr(self.stream, "encoding", None) or "ascii"
            self.stream.write(text.encode(enc, "replace").decode(enc, "replace"))
        self.stream.flush()


# After the badge comes back, how long a port that is listed but will not
# open (udev still applying permissions, the badge still enumerating) is
# retried before the real reason is reported.
REOPEN_TRIES = 20          # x 0.5 s


def follow_console(ctx, port, restart=False, out=None, idle=None):
    """Print the badge's console until Ctrl-C. Survives the badge rebooting
    or being unplugged: it waits for the port to come back and carries on.

    A port that cannot be opened at the start (busy in another program, no
    permission) is an error with its reason, not a reboot to wait out; the
    same goes for a port that comes back but stays unopenable.
    `idle` (tests): stop after this many empty reads in a row."""
    ui = ctx.ui
    out = out or _Console()
    serial = next((p.serial for p in discovery.find_badges(ctx.comports)
                   if p.device == port), None)
    quiet = 0
    first = True
    open_failures = 0
    while True:
        link = ctx.link(port)
        try:
            try:
                link.open()
            except LinkError:
                open_failures += 1
                if first or open_failures > REOPEN_TRIES:
                    raise
                link = None
            if link is not None:
                first = False
                open_failures = 0
                ser = link.t.serial
                try:
                    ser.timeout = 0.2      # so Ctrl-C is seen promptly on Windows too
                except Exception:
                    pass
                if restart:
                    ser.write(b"\r\x03\x03")   # stop FaleraOS (friendly REPL)
                    ser.write(b"\x04")         # soft reboot: main.py starts FaleraOS again
                    restart = False
                while True:
                    data = ser.read(max(1, ser.inWaiting()))
                    if data:
                        quiet = 0
                        out.write(data)
                    else:
                        quiet += 1
                        if idle is not None and quiet >= idle:
                            return
        except OSError:
            ui.print("")
            ui.warn("the badge went away (restart or unplugged); waiting for it to come back")
        finally:
            if link is not None:
                link.close()
        announced = open_failures > 0     # "back on" was already said for this port
        while True:
            ctx.sleep(0.5)
            again = discovery.find_again(port, serial, ctx.comports)
            if again:
                if not announced or again != port:
                    ui.note("back on %s" % esc(again))
                port = again
                break


@command("logs")
def cmd_logs(ctx):
    ui = ctx.ui
    port = ctx.port()
    ui.header("logs", "following %s; Ctrl-C to stop (FaleraOS keeps running)" % esc(port))
    try:
        follow_console(ctx, port, restart=ctx.args.restart)
    except KeyboardInterrupt:
        pass
    ui.print("")
    return 0


# ── files ────────────────────────────────────────────────────────────

@command("ls")
def cmd_ls(ctx):
    with ctx.session() as b:
        entries = b.ls(ctx.args.path)
    path = norm(ctx.args.path)
    ctx.ui.header("ls", path)
    rows = []
    for e in entries:
        if e["dir"]:
            rows.append(["[accent]%s/[/]" % esc(e["name"]), "", "folder"])
        else:
            rows.append([esc(e["name"]), human(e["size"]), "file"])
    ctx.ui.table(["Name", ">Size", "Type"], rows, empty="empty folder")
    total = sum(e["size"] for e in entries if not e["dir"])
    ctx.ui.note("%d item(s), %s in files" % (len(entries), human(total)))


def _unnamed(src):
    """True for `.`, `./`, `..` and the like: a folder given without a name
    of its own stands for its contents, as with `cp -r`."""
    return Path(src).expanduser().name in ("", "..")


def _local_files(sources, recursive):
    """[(local Path, relative posix path)] for the given sources."""
    out = []
    for src in sources:
        p = Path(src).expanduser()
        if p.is_dir():
            if not recursive:
                raise OreoError("%s is a folder" % p, hint="use `falera push -r`")
            name = "" if _unnamed(src) else p.name
            for f in sorted(p.rglob("*")):
                if f.is_file() and "__pycache__" not in f.parts:
                    out.append((f, posixpath.join(name, f.relative_to(p).as_posix())))
        elif p.is_file():
            out.append((p, p.name))
        else:
            raise OreoError("%s: no such file" % p)
    for f, _ in out:   # before the badge is touched
        if not os.access(f, os.R_OK):
            raise OreoError("%s: permission denied" % f)
    return out


def push_targets(files, sources, dest, dest_stat):
    """Badge path for each (local, rel) file, with `cp -r` semantics:
    an existing folder (or a trailing /) receives the sources by name;
    a new path names the copy of a single file or folder. A folder given
    as `.` or `..` stands for its contents."""
    dest = norm(dest)
    if dest_stat is not None and not dest_stat["dir"]:
        if len(files) != 1 or Path(sources[0]).is_dir():
            raise OreoError("%s is a file, not a folder" % dest)
        return [dest]
    into = dest_stat is not None or len(sources) > 1
    if into:
        return [posixpath.join(dest, rel) for _, rel in files]
    if Path(sources[0]).is_dir():
        if _unnamed(sources[0]):
            return [posixpath.join(dest, rel) for _, rel in files]
        return [posixpath.join(dest, rel.split("/", 1)[1]) for _, rel in files]
    return [dest]


def push_files(ui, b, files, targets, verify=True):
    """Copy [(local Path, rel)] to the badge paths in `targets`, with a
    progress bar here and on the badge's screen."""
    with b.showing():
        for i, ((local, rel), target) in enumerate(zip(files, targets)):
            with local_file(local):
                data = local.read_bytes()
            detail = rel if len(files) == 1 else "%s (%d of %d)" % (rel, i + 1, len(files))
            with ui.progress(esc(rel), total=len(data)) as update:
                b.write_file(data, target, progress=update, verify=verify,
                             check_space=False, screen=("Receiving files", detail))


@command("push")
def cmd_push(ctx):
    ui = ctx.ui
    args = ctx.args
    files = _local_files(args.sources, args.recursive)
    total = sum(f.stat().st_size for f, _ in files)
    with ctx.session() as b:
        st = b.stat(args.dest)
        if st is None and args.dest.endswith("/"):
            st = {"dir": True, "size": 0}
        targets = push_targets(files, args.sources, args.dest, st)
        free, _ = b.free()
        if total + 64 * 1024 > free:
            raise OreoError("not enough space: %s to copy, %s free on the badge"
                            % (human(total), human(free)))
        ui.header("push", "%d file(s), %s -> %s" % (len(files), human(total), esc(norm(args.dest))))
        push_files(ui, b, files, targets, verify=not args.no_verify)
        ui.ok("copied %d file(s) to %s" % (len(files), esc(norm(args.dest))))


def pull_files(ui, b, jobs):
    """Copy [(badge path, local Path)] to this computer, with a progress
    bar here and on the badge's screen."""
    with b.showing():
        for i, (remote, target) in enumerate(jobs):
            name = posixpath.basename(remote)
            detail = name if len(jobs) == 1 else "%s (%d of %d)" % (name, i + 1, len(jobs))
            with ui.progress(esc(name), total=None) as update:
                data = b.read_file(remote, progress=update, screen=("Sending files", detail))
            with local_file(target):
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)


@command("pull")
def cmd_pull(ctx):
    ui = ctx.ui
    args = ctx.args
    src = norm(args.source)
    local = Path(args.dest).expanduser()
    if args.dest.endswith(("/", os.sep)) and not local.exists():
        with local_file(local):
            local.mkdir(parents=True)
    with ctx.session() as b:
        st = b.stat(src)
        if st is None:
            raise OreoError("%s: not found on the badge" % src)
        if st["dir"]:
            if not args.recursive:
                raise OreoError("%s is a folder" % src, hint="use `falera pull -r`")
            items = list(b.walk(src))
            base = local if not local.exists() else local / posixpath.basename(src.rstrip("/") or "badge")
            jobs = [(p, base / posixpath.relpath(p, src)) for p, _ in items]
        else:
            target = local / posixpath.basename(src) if local.is_dir() else local
            jobs = [(src, target)]
        ui.header("pull", "%d file(s) from %s" % (len(jobs), esc(src)))
        pull_files(ui, b, jobs)
        ui.ok("saved %d file(s) under %s" % (len(jobs), esc(local)))


# ── screenshot ───────────────────────────────────────────────────────

def screenshot_path(dest, now=None):
    """Where `falera screenshot [FILE]` writes: FILE, or a timestamped name
    in FILE when it is a folder, or in the current folder."""
    import time
    name = time.strftime("falera-screenshot-%Y%m%d-%H%M%S.png", time.localtime(now))
    if not dest:
        return Path(name)
    p = Path(dest).expanduser()
    if p.is_dir() or dest.endswith(("/", os.sep)):
        return p / name
    return p


@command("screenshot")
def cmd_screenshot(ctx):
    from . import screenshot
    ui = ctx.ui
    args = ctx.args
    scale = args.scale
    if not 1 <= scale <= screenshot.MAX_SCALE:
        raise UsageError("--scale must be 1 to %d" % screenshot.MAX_SCALE)
    target = screenshot_path(args.file)
    with ctx.session() as b:
        with ui.status("reading the badge's screen"):
            w, h, data, dirty = screenshot.capture(b)
    png = screenshot.to_png(data, w, h, scale)
    with local_file(target):
        if target.parent != Path(""):
            target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(png)
    if dirty:
        ui.warn("FaleraOS was stopped while drawing a frame, so the picture may be "
                "half drawn; run the command again if it looks wrong")
    ui.ok("saved %dx%d screenshot to %s" % (w * scale, h * scale, esc(target)))


# Folders whose whole contents belong to FaleraOS: removing anything inside
# them can stop the badge booting. "/" and "/apps" themselves are protected
# (see badge.PROTECTED) but not everything under them, so `falera rm -r
# /apps/myapp` or `falera rm /documents/x` still works without --force.
SYSTEM_TREES = ("/oreoOS", "/oreoWare", "/assets")
# Single files FaleraOS needs or keeps the owner's settings in.
SYSTEM_FILES = ("/secrets.py", "/wifi.json")

# Built-in apps: must equal DEFAULT_APPS in oreoOS/store.py (a contract
# test in cli/tests/test_contract.py checks this inside the repo).
DEFAULT_APPS = ("about", "badge", "commits", "gallery", "gamepad", "reader",
                "settings", "store", "storage", "transfer", "launcher", "updates", "wifi")


def _inside(p, root):
    return p == root or p.startswith(root + "/")


def is_protected(path):
    p = norm(path)
    if p in PROTECTED or p in SYSTEM_FILES:
        return True
    if any(_inside(p, x) for x in SYSTEM_TREES):
        return True
    parts = p.split("/")
    return len(parts) >= 3 and parts[1] == "apps" and parts[2] in DEFAULT_APPS


@command("rm")
def cmd_rm(ctx):
    ui = ctx.ui
    args = ctx.args
    for p in args.paths:
        if is_protected(p) and not args.force:
            raise OreoError("%s belongs to FaleraOS; removing it can stop the badge booting" % norm(p),
                            hint="add --force if you really mean it")
    if args.recursive or any(is_protected(p) for p in args.paths):
        what = ", ".join(norm(p) for p in args.paths)
        if not ui.confirm("Remove %s%s from the badge?" % (esc(what), " and everything inside"
                                                          if args.recursive else "")):
            raise Cancelled("nothing removed")
    with ctx.session() as b:
        for p in args.paths:
            b.rm(p, recursive=args.recursive)
            ui.ok("removed %s" % esc(norm(p)))


# ── add (media) ──────────────────────────────────────────────────────

class MediaOptions:
    """Conversion settings for `falera add` (defaults match media_ingest)."""

    def __init__(self, kind=None, seconds=10.0, fps=24, width=180, height=135,
                 photo_max=240, save=None):
        self.kind = kind
        self.seconds = seconds
        self.fps = fps
        self.width = width
        self.height = height
        self.photo_max = photo_max
        self.save = save


def prepare_media(ui, files, opts):
    """Convert and validate every file before the badge is touched."""
    kinds = [media.detect(f, opts.kind) for f in files]
    if "video" in kinds and not media.have_ffmpeg():
        raise OreoError("ffmpeg was not found, so videos cannot be converted",
                        hint=media.FFMPEG_HINT)
    prepared = []
    for f, kind in zip(files, kinds):
        if kind == "video":
            with ui.progress("converting %s" % esc(Path(f).name),
                             total=int(opts.seconds * opts.fps), unit="frames") as update:
                item = media.convert(f, kind, opts.seconds, opts.fps, opts.width,
                                     opts.height, opts.photo_max, progress=update)
        else:
            with ui.status("converting %s" % esc(Path(f).name)):
                item = media.convert(f, kind, photo_max=opts.photo_max)
        media.check_budget(len(item[2]))
        prepared.append(item)
        src_size = Path(f).stat().st_size
        ui.step("%s -> %s  %s (%.0f%% of the original)"
                % (esc(Path(f).name), esc(item[1]), human(len(item[2])),
                   100.0 * len(item[2]) / src_size if src_size else 0))
        if opts.save:
            out = Path(opts.save).expanduser()
            with local_file(out / item[1]):
                out.mkdir(parents=True, exist_ok=True)
                (out / item[1]).write_bytes(item[2])
    return prepared


def send_media(ui, b, prepared):
    free, _ = b.free()
    media.check_space(sum(len(x[2]) for x in prepared), free)
    with b.showing():
        for kind, name, blob in prepared:
            dest = posixpath.join(media.destination(kind), name)
            app = "Gallery" if kind in ("image", "video") else "Reader"
            with ui.progress(esc(name), total=len(blob)) as update:
                b.write_file(blob, dest, progress=update, check_space=False,
                             screen=("Adding to the %s" % app, name))
            ui.ok("%s is in the %s (%s)" % (esc(name), app, esc(dest)))


@command("add")
def cmd_add(ctx):
    args = ctx.args
    ctx.ui.header("add", "%d file(s)" % len(args.files))
    prepared = prepare_media(ctx.ui, args.files, MediaOptions(
        args.kind, args.seconds, args.fps, args.width, args.height, args.photo_max, args.save))
    with ctx.session() as b:
        send_media(ctx.ui, b, prepared)


# ── apps ─────────────────────────────────────────────────────────────

def show_apps(ui, data):
    inst = data.get("installed") or []
    ui.table(["App", "Name", "Version", ""],
             [[esc(a["id"]), esc(a["name"]), esc(a.get("version") or "-"),
               "[dim]built in[/]" if a.get("default") else ""] for a in inst],
             title="installed", empty="no apps installed")
    cat = data.get("catalogue") or []
    label = {"install": "", "open": "[ok]installed[/]", "update": "[warn]update[/]"}
    ui.table(["App", "Name", "Version", ">Size", "", "About"],
             [[esc(e["id"]), esc(e["name"]), esc(e["version"]), human(e.get("size") or 0),
               label.get(e.get("state"), ""), esc((e.get("tagline") or "")[:48])] for e in cat],
             title="App Store", empty="catalogue not downloaded yet: `falera apps refresh`")


def _online(ui, b):
    with ui.status("bringing up Wi-Fi on the badge"):
        r = b.wifi_online()
    if not r.get("online"):
        raise OreoError("the badge could not get online",
                        hint="add a network: `falera wifi scan`, then `falera wifi connect <name>`")
    ui.ok("badge online (%s)" % (r.get("ip") or "?"))


def check_app_args(action, app):
    if action in ("install", "remove") and not app:
        raise UsageError("which app?", hint="falera apps %s <app id>  (ids: `falera apps`)" % action)


def apps_action(ui, b, action, app=None):
    """list / refresh / install / update / remove. Returns an exit code."""
    check_app_args(action, app)
    if action == "list":
        data = b.apps()
        ui.header("apps")
        show_apps(ui, data)
        return 0
    if action == "remove":
        if not ui.confirm("Remove %s from the badge? Its saved data goes too." % esc(app)):
            raise Cancelled("nothing removed")
        ok, msg = b.app_remove(app)
        if not ok:
            raise OreoError("could not remove %s: %s" % (app, msg))
        ui.ok("removed %s" % esc(app))
        return 0
    _online(ui, b)
    with ui.status("fetching the App Store catalogue"):
        ok, err = b.apps_refresh()
    if not ok:
        raise OreoError("could not fetch the catalogue: %s" % (err or "unknown error"))
    data = b.apps()
    if action == "refresh":
        ui.header("apps", "catalogue updated")
        show_apps(ui, data)
        return 0
    cat = {e["id"]: e for e in data.get("catalogue") or []}
    if action == "install":
        if app not in cat:
            raise OreoError("%s is not in the App Store" % app, hint="see `falera apps`")
        targets = [app]
    else:
        targets = [app] if app else [i for i, e in cat.items() if e["state"] == "update"]
        if not targets:
            ui.ok("every app is up to date")
            return 0
    ui.header("apps", "%s %s" % (action, ", ".join(targets)))
    failed = 0
    title = "Installing app" if action == "install" else "Updating apps"
    with b.showing():
        for target in targets:
            name = (cat.get(target) or {}).get("name") or target
            with ui.progress(esc(target),
                             total=(cat.get(target) or {}).get("size") or None) as update:
                ok, msg = b.app_install(target, progress=update, screen=(title, name))
            if ok:
                ui.ok("%s %s" % (esc(target), "installed" if action == "install" else "updated"))
            else:
                failed += 1
                ui.error("%s: %s" % (esc(target), esc(msg)))
    return 1 if failed else 0


@command("apps")
def cmd_apps(ctx):
    check_app_args(ctx.args.action, ctx.args.app)   # before touching the badge
    with ctx.session() as b:
        return apps_action(ctx.ui, b, ctx.args.action, ctx.args.app)


# ── wifi ─────────────────────────────────────────────────────────────

def bars(rssi):
    level = 4 if rssi >= -55 else 3 if rssi >= -67 else 2 if rssi >= -75 else 1
    full, empty = ui_mod.BARS
    return full[:level].ljust(4, empty)


CONNECT_RESULTS = {
    "bad_password": ("wrong password for %s", "check it and try again"),
    "not_found": ("%s is not in range", "the badge only sees 2.4 GHz networks; "
                                        "run `falera wifi scan`"),
    "timeout": ("%s did not answer in time", "move closer, or try --timeout 30"),
    "failed": ("could not join %s", "try again; run with -v to see the badge's log"),
}


def check_ssid(ssid):
    n = len(ssid.encode("utf-8"))
    if not 1 <= n <= 32:
        raise UsageError("a Wi-Fi network name is 1 to 32 bytes; this one is %d" % n,
                         hint="copy the name from `falera wifi scan`")


def check_password(password):
    """WPA/WPA2 passphrases are 8-63 characters (or 64 hex digits)."""
    if not password:
        return password
    if len(password) == 64 and all(c in "0123456789abcdefABCDEF" for c in password):
        return password
    if not 8 <= len(password) <= 63:
        raise UsageError("Wi-Fi passwords are 8 to 63 characters; this one has %d"
                         % len(password),
                         hint="check it and try again (use --open for a network without one)")
    return password


def read_password(ui, ssid, open_net=False, from_stdin=False):
    if open_net:
        return ""
    if from_stdin:
        line = sys.stdin.readline()
        if not line.strip("\r\n"):
            raise UsageError("no password on standard input",
                             hint="pipe it in, or use --open for a network without one")
        return check_password(line.rstrip("\r\n"))
    if not ui.interactive:
        raise UsageError("no terminal to ask for the password",
                         hint="use --password-stdin, or --open for a network without one")
    try:
        return check_password(ui.secret("Password for %s (empty for an open network)" % ssid))
    except EOFError:
        raise Cancelled("no password entered; nothing changed")


def wifi_scan(ui, b, timeout_s=15):
    with ui.status("scanning for networks"):
        nets = b.wifi_scan(timeout_s=max(15, timeout_s))
    ui.header("wifi", "networks near the badge (2.4 GHz)")
    ui.table(["Network", "Signal", ">dBm", ">Ch", "Security", ""],
             [[esc(n["ssid"]), bars(n["rssi"]), str(n["rssi"]), str(n.get("ch", "")),
               "secured" if n.get("secure") else "[warn]open[/]",
               "[ok]saved[/]" if n.get("saved") else ""] for n in nets],
             empty="no networks found")
    ui.note("join one with `falera wifi connect <name>`")
    return nets


def wifi_saved(ui, b):
    nets = b.wifi_saved()
    ui.header("wifi", "networks saved on the badge (passwords stay on the badge)")
    ui.table(["Network", ">Priority", ""],
             [[esc(n["ssid"]), str(n.get("priority", "")),
               " ".join(x for x in ("[ok]last used[/]" if n.get("last") else "",
                                    "open" if n.get("open") else "",
                                    "metered" if n.get("metered") else "") if x)]
              for n in nets], empty="no saved networks: `falera wifi scan`")
    return nets


def wifi_forget(ui, b, ssid):
    removed, deploy = b.wifi_forget(ssid)
    if not removed:
        raise OreoError("%s is not saved on the badge" % ssid, hint="see `falera wifi saved`")
    ui.ok("forgot %s" % esc(ssid))
    if deploy:
        ui.warn("it is also in the badge's deploy-time settings (.env), so it comes back "
                "at the next boot until it is removed there and FaleraOS is redeployed")


def wifi_connect(ui, b, ssid, password, save=True, save_only=False, timeout_s=15.0):
    if save_only:
        if not b.wifi_save(ssid, password):
            raise OreoError("could not save %s on the badge" % ssid)
        ui.ok("saved %s; the badge joins it automatically when it is in range" % esc(ssid))
        return
    with ui.status("joining %s" % esc(ssid)):
        r = b.wifi_connect(ssid, password, save=save, timeout_ms=int(timeout_s * 1000))
    if r.get("result") != "ok":
        msg, hint = CONNECT_RESULTS.get(r.get("result"), CONNECT_RESULTS["failed"])
        raise OreoError(msg % ssid, hint=hint)
    ui.ok("connected to %s (%s)" % (esc(ssid), r.get("ip") or "?"))
    if r.get("saved"):
        ui.ok("saved: FaleraOS joins it automatically for the App Store, updates and time")
    elif save:
        ui.warn("connected, but the network could not be saved on the badge")


@command("wifi")
def cmd_wifi(ctx):
    args = ctx.args
    action = args.action
    if action in ("connect", "forget") and not args.ssid:
        raise UsageError("which network?",
                         hint="falera wifi %s <name>  (see `falera wifi scan`)" % action)
    if args.ssid is not None and action in ("connect", "forget"):
        check_ssid(args.ssid)
    password = None
    if action == "connect":
        # Ask before touching the badge, so a cancelled prompt changes nothing.
        password = read_password(ctx.ui, args.ssid, args.open, args.password_stdin)
    with ctx.session() as b:
        if action == "scan":
            wifi_scan(ctx.ui, b, args.timeout)
        elif action == "saved":
            wifi_saved(ctx.ui, b)
        elif action == "forget":
            wifi_forget(ctx.ui, b, args.ssid)
        else:
            wifi_connect(ctx.ui, b, args.ssid, password, save=not args.no_save,
                         save_only=args.save_only, timeout_s=args.timeout)
    return 0


# ── update / flash / doctor ──────────────────────────────────────────

@command("update")
def cmd_update(ctx):
    ui = ctx.ui
    args = ctx.args
    if args.repo:
        return update_from_repo(ctx)
    dev_flags = [f for f, on in (("--clean", args.clean), ("--force", args.force),
                                 ("--no-bump", args.no_bump), ("--override", args.override))
                 if on]
    if dev_flags:
        raise UsageError("%s only work with --repo <checkout>" % ", ".join(dev_flags),
                         hint="`falera update` alone installs the newest release from GitHub")
    from . import update
    ui.header("update", "FaleraOS from GitHub releases (%s channel), through the badge's Wi-Fi"
              % args.channel)
    with ctx.session() as b:
        return update.run_update(ctx, b, channel=args.channel, check_only=args.check)


def update_from_repo(ctx):
    ui = ctx.ui
    args = ctx.args
    if args.check or args.channel != "stable":
        raise UsageError("--check and --channel are for release updates, not --repo",
                         hint="drop --repo to update from GitHub releases")
    root = repo.check_repo(args.repo)
    port = ctx.port()
    ui.header("update", "deploying FaleraOS from %s to %s" % (esc(root), esc(port)))
    if args.clean and not ui.confirm(
            "--clean erases every file on the badge (apps, photos, documents, saved Wi-Fi) "
            "before installing FaleraOS. Continue?"):
        raise Cancelled("nothing changed")
    repo.run(repo.deploy_cmd(root, port, clean=args.clean, force=args.force,
                             no_bump=args.no_bump, override=args.override), root, ctx.runner)
    ui.ok("FaleraOS deployed")


@command("flash")
def cmd_flash(ctx):
    ui = ctx.ui
    args = ctx.args
    root = repo.check_repo(args.repo)
    port = ctx.port()
    ui.header("flash", "firmware and FaleraOS from %s to %s" % (esc(root), esc(port)))
    if args.build:
        ui.step("building the firmware (does not touch the badge)")
        repo.run(repo.build_cmd(root), root, ctx.runner)
    if not ui.confirm("This ERASES the whole badge (firmware, FaleraOS, apps, photos, saved "
                      "Wi-Fi) and reinstalls it. Continue?"):
        raise Cancelled("nothing changed")
    repo.run(repo.flash_cmd(root, port), root, ctx.runner)
    ui.ok("firmware flashed and FaleraOS installed")


@command("doctor")
def cmd_doctor(ctx):
    ui = ctx.ui
    ui.header("doctor", "checks the computer first, then the badge")
    marks = {doctor_mod.OK: "[ok]%s[/]" % ui_mod.MARK_OK, doctor_mod.WARN: "[warn]![/]",
             doctor_mod.FAIL: "[err]%s[/]" % ui_mod.MARK_ERR}
    worst = doctor_mod.OK
    steps = []
    for status, title, msg, hint in doctor_mod.run_checks(
            ctx.args.port or os.environ.get("OREO_PORT"), ctx.comports,
            badge_factory=lambda port: ctx.badge(port), reset=ctx.args.reset):
        ui.print("%s [key]%-12s[/] %s" % (marks[status], title, esc(msg)))
        if hint and status != doctor_mod.OK:
            steps.append((status, title, hint))
        if status == doctor_mod.FAIL or (status == doctor_mod.WARN and worst == doctor_mod.OK):
            worst = status
    if steps:
        ui.print("")
        ui.print("[title]Next steps[/]")
        # failures first: they block everything after them
        steps.sort(key=lambda x: 0 if x[0] == doctor_mod.FAIL else 1)
        for i, (status, title, hint) in enumerate(steps, 1):
            ui.print("  %d. [key]%s:[/] %s" % (i, title, esc(hint)))
    if worst == doctor_mod.OK:
        ui.ok("all good: try `falera info`, or just `falera`")
    elif worst == doctor_mod.WARN:
        ui.ok("the badge works; the warnings above are optional")
    return 1 if worst == doctor_mod.FAIL else 0
