"""`falera` (no command) and `falera ui`: the full-screen Falera app.

Built on Textual (rich's sibling, by the same authors): it gives a real
full-screen app on the alternate screen, keyboard and mouse input, thread
workers and a headless test pilot, on Linux, macOS and Windows terminals.

How it is put together:

- Every badge operation is a job (worker.Job) run in a Textual thread
  worker. Jobs take worker.BadgeSession's lock while they use the serial
  port, so there is only ever one command on the port; the screen keeps
  drawing, and a job asked for while another runs waits its turn.
- The jobs call the same functions as the plain commands (commands.py,
  owner.py, devtools.py, update.py, transfer.py, interactive.py) with a
  worker.SinkUI, so their messages land in the activity log, their
  progress bars in the activity bar and their questions in dialogs.
- FaleraOS is paused (raw REPL) while the view holds the badge and restarts
  (soft reset, or --reset) when the view closes: on q, on Ctrl-C, and when
  something fails (see run() below). The Transfer section is the
  exception, as in the menu: the Transfer app runs inside FaleraOS, so that
  section restarts FaleraOS first and the next job pauses it again.
"""

import argparse
import copy
import os
import posixpath
import threading
from pathlib import Path

from rich.markup import MarkupError
from rich.style import Style
from rich.text import Text
from rich.theme import Theme
from textual import on
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.screen import ModalScreen, Screen
from textual.widgets import (Button, Checkbox, ContentSwitcher, DataTable, Footer, Header,
                             Input, Label, OptionList, ProgressBar, RichLog, Static)
from textual.widgets.option_list import Option

from . import commands, devtools, discovery, interactive, owner, update
from .badge import norm
from .errors import Cancelled, OreoError
from .ui import MARK_ERR, MARK_OK, STYLES, esc, human
from .worker import BadgeSession, Job, RenderUI, Sink, SinkUI, explain

SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"

# Shown under the menu: where the source and the docs live.
REPO_URL = "https://github.com/elixpo/falera"
DOCS_URL = "https://falera.elixpo.com/docs/cli/"

SECTIONS = (
    ("status", "1", "Status"),
    ("files", "2", "Files"),
    ("apps", "3", "Apps"),
    ("wifi", "4", "Wi-Fi"),
    ("transfer", "5", "Transfer"),
    ("profile", "6", "Profile"),
    ("install", "7", "Install app"),
    ("update", "8", "Update FaleraOS"),
)


def _text(markup):
    """Markup from the commands as Text; plain text if it does not parse."""
    if not isinstance(markup, str):
        return markup
    try:
        return Text.from_markup(markup)
    except MarkupError:
        return Text(markup)


# ── dialogs ──────────────────────────────────────────────────────────

class AskScreen(ModalScreen):
    """A question from a job: yes/no, a line of text, or a secret."""

    BINDINGS = [Binding("escape", "dismiss_none", "Cancel")]

    def __init__(self, kind, prompt, default=None):
        super().__init__()
        self.kind = kind
        self.prompt = prompt
        self.default = default

    def compose(self) -> ComposeResult:
        with Vertical(id="ask"):
            yield Static(_text(self.prompt), id="ask-prompt")
            if self.kind == "confirm":
                with Horizontal(id="ask-buttons"):
                    yes = Button("Yes (y)", id="ask-yes", variant="primary")
                    no = Button("No (n)", id="ask-no")
                    yield yes
                    yield no
            else:
                yield Input(value="" if self.default in (None, "") else str(self.default),
                            password=self.kind == "secret", id="ask-input")
                yield Static("Enter: OK   Esc: cancel" + ("   (typing is hidden)"
                                                         if self.kind == "secret" else ""),
                             id="ask-hint")

    def on_mount(self):
        if self.kind == "confirm":
            self.query_one("#ask-yes" if self.default else "#ask-no").focus()
        else:
            self.query_one("#ask-input").focus()

    def on_key(self, event):
        if self.kind == "confirm" and event.key in ("y", "n"):
            event.stop()
            self.dismiss(event.key == "y")

    @on(Button.Pressed)
    def _pressed(self, event):
        self.dismiss(event.button.id == "ask-yes")

    @on(Input.Submitted)
    def _submitted(self, event):
        self.dismiss(event.value)

    def action_dismiss_none(self):
        self.dismiss(None)


class PickScreen(ModalScreen):
    """Several badges are plugged in: choose one."""

    BINDINGS = [Binding("escape", "dismiss_none", "Quit")]

    def __init__(self, badges):
        super().__init__()
        self.badges = badges

    def compose(self) -> ComposeResult:
        with Vertical(id="pick"):
            yield Static("[b]%d badges are connected.[/b] Which one?" % len(self.badges))
            yield OptionList(*[Option("%s  %s" % (esc(p.device), esc(p.serial or "")),
                                      id=p.device) for p in self.badges], id="pick-list")
            yield Static("Enter: open   Esc: quit", id="pick-hint")

    def on_mount(self):
        self.query_one("#pick-list").focus()

    @on(OptionList.OptionSelected)
    def _chosen(self, event):
        self.dismiss(event.option.id)

    def action_dismiss_none(self):
        self.dismiss(None)


class WaitScreen(Screen):
    """No badge yet: wait for one to be plugged in."""

    BINDINGS = [Binding("q", "app.quit_app", "Quit"),
                Binding("ctrl+c", "app.quit_app", "Quit", show=False, priority=True)]

    def compose(self) -> ComposeResult:
        yield Header()
        with Vertical(id="wait"):
            yield Static("", id="wait-spin")
            yield Static("[b]Plug in your Falera Badge[/b]\n\n"
                         "Connect it with a USB cable that carries data. It is found by\n"
                         "its USB ID 303a:83ec and opens here as soon as it appears.\n\n"
                         "[dim]Nothing found for a while? Quit and run `falera doctor`.[/dim]",
                         id="wait-text")
        yield Footer()

    def on_mount(self):
        self._i = 0
        self.set_interval(0.1, self._spin)

    def _spin(self):
        self._i += 1
        self.query_one("#wait-spin", Static).update(SPINNER[self._i % len(SPINNER)]
                                                    + "  looking for a badge on USB")


# ── sections ─────────────────────────────────────────────────────────

class Pane(Vertical):
    """One section. load() fetches what it shows (as a job)."""

    loaded = False

    def load(self):
        self.loaded = True

    def focus_main(self):
        target = self.main_widget()
        if target is not None:
            target.focus()

    def main_widget(self):
        return None


def _selected_key(table):
    if not table.row_count:
        return None
    try:
        return table.coordinate_to_cell_key(table.cursor_coordinate).row_key.value
    except Exception:
        return None


class StatusPane(Pane):
    def compose(self) -> ComposeResult:
        with VerticalScroll():
            yield Static("Reading the badge...", id="status-body")

    def main_widget(self):
        return self.query_one(VerticalScroll)

    def load(self):
        super().load()
        self.app.start_job("reading the badge", lambda ui, b, c, p: b.info(),
                           on_done=self.app.got_info, interrupt=True)

    def show(self, info, port):
        rui = RenderUI()
        commands.show_info(rui, info, port)
        self.query_one("#status-body", Static).update(rui.renderable())


class FilesPane(Pane):
    BINDINGS = [Binding("backspace", "up", "Up"),
                Binding("d", "download", "Download"),
                Binding("u", "upload", "Upload here"),
                Binding("a", "add_media", "Add photo/video/doc"),
                Binding("x", "delete", "Delete")]

    def __init__(self, **kw):
        super().__init__(**kw)
        self.cwd = "/"
        self.entries = []

    def compose(self) -> ComposeResult:
        yield Label("/", id="files-path")
        table = DataTable(id="files-table", cursor_type="row", zebra_stripes=True)
        table.add_columns("Name", "Size")
        yield table

    def main_widget(self):
        return self.query_one(DataTable)

    def load(self):
        super().load()
        path = self.cwd
        self.app.start_job("listing %s" % path, lambda ui, b, c, p: b.ls(path),
                           on_done=lambda entries: self.fill(path, entries), interrupt=True)

    def fill(self, path, entries):
        self.cwd = path
        self.entries = entries
        self.query_one("#files-path", Label).update(
            "%s   [dim]%d item(s), %s in files[/dim]"
            % (esc(path), len(entries), human(sum(e["size"] for e in entries if not e["dir"]))))
        table = self.query_one(DataTable)
        table.clear()
        if path != "/":
            table.add_row(Text("..", style="bold"), "", key="..")
        for i, e in enumerate(entries):
            name = Text(e["name"] + "/", style="bold #e8c9a0") if e["dir"] else Text(e["name"])
            table.add_row(name, "" if e["dir"] else human(e["size"]), key=str(i))

    def selected(self):
        key = _selected_key(self.query_one(DataTable))
        if key is None or key == "..":
            return None
        e = self.entries[int(key)]
        return e, norm(posixpath.join(self.cwd, e["name"]))

    @on(DataTable.RowSelected, "#files-table")
    def _open(self, event):
        key = event.row_key.value
        if key == "..":
            self.action_up()
            return
        e = self.entries[int(key)]
        if e["dir"]:
            self.cwd = norm(posixpath.join(self.cwd, e["name"]))
            self.load()
        else:
            self.app.notify("%s, %s. d downloads it." % (e["name"], human(e["size"])),
                            markup=False)

    def action_up(self):
        if self.cwd != "/":
            self.cwd = posixpath.dirname(self.cwd.rstrip("/")) or "/"
            self.load()

    def action_download(self):
        sel = self.selected()
        if sel is None:
            self.app.notify("choose a file or folder first", severity="warning")
            return
        e, path = sel
        default = str(Path.cwd() / e["name"])

        def prepare(ui, c):
            target = Path(ui.ask("Save %s on this computer as" % esc(path), default=default)
                          ).expanduser()
            if target.exists() and not e["dir"] and not ui.confirm(
                    "%s already exists. Replace it?" % esc(target)):
                raise Cancelled("not downloaded")
            return target

        def run(ui, b, c, target):
            if e["dir"]:
                jobs = [(p, target / posixpath.relpath(p, path)) for p, _ in b.walk(path)]
            else:
                jobs = [(path, target)]
            commands.pull_files(ui, b, jobs)
            ui.ok("saved %d file(s) under %s" % (len(jobs), esc(target)))
        self.app.start_job("downloading %s" % e["name"], run, prepare=prepare)

    def action_upload(self):
        cwd = self.cwd

        def prepare(ui, c):
            raw = ui.ask("Files or folders on this computer to copy into %s "
                         "(separate with spaces, quote names with spaces)" % esc(cwd))
            sources = [str(Path(s).expanduser()) for s in interactive.split_files(raw)]
            if not sources:
                raise Cancelled("nothing to copy")
            return sources, commands._local_files(sources, True)

        def run(ui, b, c, prepared):
            sources, files = prepared
            targets = commands.push_targets(files, sources, cwd, {"dir": True, "size": 0})
            total = sum(f.stat().st_size for f, _ in files)
            free, _ = b.free()
            if total + 64 * 1024 > free:
                raise OreoError("not enough space: %s to copy, %s free on the badge"
                                % (human(total), human(free)))
            commands.push_files(ui, b, files, targets)
            ui.ok("copied %d file(s) to %s" % (len(files), esc(cwd)))
            return b.ls(cwd)
        self.app.start_job("copying to %s" % cwd, run, prepare=prepare,
                           on_done=lambda entries: self.fill(cwd, entries))

    def action_add_media(self):
        def prepare(ui, c):
            raw = ui.ask("Photos, videos or documents (.md/.txt) to add "
                         "(separate with spaces)")
            files = interactive.split_files(raw)
            if not files:
                raise Cancelled("nothing to add")
            return commands.prepare_media(ui, files, commands.MediaOptions())

        def run(ui, b, c, prepared):
            commands.send_media(ui, b, prepared)
        self.app.start_job("adding media", run, prepare=prepare)

    def action_delete(self):
        sel = self.selected()
        if sel is None:
            self.app.notify("choose a file or folder first", severity="warning")
            return
        e, path = sel
        if commands.is_protected(path):
            self.app.notify("%s belongs to FaleraOS; use `falera rm --force` outside the view"
                            % path, severity="error", markup=False)
            return
        cwd = self.cwd

        def prepare(ui, c):
            if not ui.confirm("Delete %s%s from the badge?"
                              % (esc(path), " and everything inside" if e["dir"] else "")):
                raise Cancelled("nothing deleted")

        def run(ui, b, c, _):
            b.rm(path, e["dir"])
            ui.ok("deleted %s" % esc(path))
            return b.ls(cwd)
        self.app.start_job("deleting %s" % path, run, prepare=prepare,
                           on_done=lambda entries: self.fill(cwd, entries))


APP_STATE = {"install": "", "open": "installed", "update": "update"}


class AppsPane(Pane):
    BINDINGS = [Binding("i", "install", "Install"),
                Binding("u", "update_all", "Update all"),
                Binding("x", "remove", "Remove"),
                Binding("f", "fetch", "Fetch App Store")]

    def compose(self) -> ComposeResult:
        yield Label("Installed apps and the App Store catalogue", id="apps-title")
        table = DataTable(id="apps-table", cursor_type="row", zebra_stripes=True)
        table.add_columns("App", "Name", "Version", "State", "Size", "About")
        yield table

    def main_widget(self):
        return self.query_one(DataTable)

    def load(self):
        super().load()
        self.app.start_job("reading the apps", lambda ui, b, c, p: b.apps(), on_done=self.fill)

    def fill(self, data):
        table = self.query_one(DataTable)
        table.clear()
        cat = {e["id"]: e for e in data.get("catalogue") or []}
        seen = set()
        for a in data.get("installed") or []:
            e = cat.get(a["id"]) or {}
            state = "built in" if a.get("default") else "installed"
            if e.get("state") == "update":
                state = Text("update %s" % e.get("version"), style="bold yellow")
            table.add_row(a["id"], a["name"], a.get("version") or "-", state,
                          human(e["size"]) if e.get("size") else "",
                          (e.get("tagline") or "")[:40], key=a["id"])
            seen.add(a["id"])
        for i, e in cat.items():
            if i in seen:
                continue
            table.add_row(i, e["name"], e["version"], APP_STATE.get(e.get("state"), ""),
                          human(e.get("size") or 0), (e.get("tagline") or "")[:40], key=i)
        if not cat:
            self.query_one("#apps-title", Label).update(
                "Installed apps. [dim]f fetches the App Store catalogue (the badge "
                "goes online with its saved Wi-Fi).[/dim]")
        else:
            self.query_one("#apps-title", Label).update(
                "Installed apps and the App Store. [dim]i installs, u updates all, "
                "x removes.[/dim]")

    def _action(self, action, app_id=None):
        def run(ui, b, c, _):
            commands.apps_action(ui, b, action, app_id)
            return b.apps()
        label = {"install": "installing %s" % app_id, "update": "updating apps",
                 "remove": "removing %s" % app_id, "refresh": "fetching the App Store"}[action]
        self.app.start_job(label, run, on_done=self.fill, interrupt=action == "refresh")

    def action_install(self):
        app_id = _selected_key(self.query_one(DataTable))
        if app_id is None:
            self.app.notify("choose an app first (f fetches the App Store)", severity="warning")
            return
        self._action("install", app_id)

    def action_update_all(self):
        self._action("update")

    def action_remove(self):
        app_id = _selected_key(self.query_one(DataTable))
        if app_id is None:
            self.app.notify("choose an app first", severity="warning")
            return
        self._action("remove", app_id)

    def action_fetch(self):
        self._action("refresh")


class WifiPane(Pane):
    BINDINGS = [Binding("n", "scan", "Scan nearby"),
                Binding("c", "connect", "Connect"),
                Binding("x", "forget", "Forget"),
                Binding("v", "saved", "Saved networks")]

    def compose(self) -> ComposeResult:
        yield Label("Saved networks", id="wifi-title")
        table = DataTable(id="wifi-table", cursor_type="row", zebra_stripes=True)
        yield table

    def main_widget(self):
        return self.query_one(DataTable)

    def load(self):
        super().load()
        self.app.start_job("reading saved networks", lambda ui, b, c, p: b.wifi_saved(),
                           on_done=self.fill_saved, interrupt=True)

    def action_saved(self):
        self.load()

    def fill_saved(self, nets):
        self.query_one("#wifi-title", Label).update(
            "Saved networks [dim](passwords stay on the badge) · n: scan nearby[/dim]")
        table = self.query_one(DataTable)
        table.clear(columns=True)
        table.add_columns("Network", "Priority", "")
        for n in nets:
            flags = " ".join(x for x in ("last used" if n.get("last") else "",
                                         "open" if n.get("open") else "",
                                         "metered" if n.get("metered") else "") if x)
            table.add_row(n["ssid"], str(n.get("priority", "")), flags, key=n["ssid"])

    def fill_scan(self, nets):
        self.query_one("#wifi-title", Label).update(
            "Networks near the badge [dim](2.4 GHz) · c: connect · v: saved[/dim]")
        table = self.query_one(DataTable)
        table.clear(columns=True)
        table.add_columns("Network", "Signal", "dBm", "Ch", "Security", "")
        for n in nets:
            table.add_row(n["ssid"], commands.bars(n["rssi"]), str(n["rssi"]),
                          str(n.get("ch", "")), "secured" if n.get("secure") else "open",
                          "saved" if n.get("saved") else "", key=n["ssid"])

    def action_scan(self):
        self.app.start_job("scanning for networks",
                           lambda ui, b, c, p: commands.wifi_scan(ui, b),
                           on_done=self.fill_scan, interrupt=True)

    def action_connect(self):
        chosen = _selected_key(self.query_one(DataTable))

        def prepare(ui, c):
            ssid = chosen or ui.ask("Network name")
            commands.check_ssid(ssid)
            return ssid, commands.read_password(ui, ssid)

        def run(ui, b, c, prepared):
            ssid, password = prepared
            commands.wifi_connect(ui, b, ssid, password)
            return b.wifi_saved()
        self.app.start_job("joining %s" % (chosen or "a network"), run, prepare=prepare,
                           on_done=self.fill_saved, interrupt=True)

    def action_forget(self):
        ssid = _selected_key(self.query_one(DataTable))
        if ssid is None:
            self.app.notify("choose a network first", severity="warning")
            return

        def prepare(ui, c):
            if not ui.confirm("Forget %s?" % esc(ssid)):
                raise Cancelled("nothing changed")

        def run(ui, b, c, _):
            commands.wifi_forget(ui, b, ssid)
            return b.wifi_saved()
        self.app.start_job("forgetting %s" % ssid, run, prepare=prepare,
                           on_done=self.fill_saved)


class TransferPane(Pane):
    def compose(self) -> ComposeResult:
        yield Static(
            "[b]Send photos, videos and documents to the Transfer app[/b]\n\n"
            "FaleraOS restarts so the Transfer app can run. Open it on the badge\n"
            "(apps drawer > Tools > Transfer) and type the code it shows when asked.\n"
            "Photos and videos are converted first, as with `falera add`.\n", id="transfer-text")
        yield Input(placeholder="files to send, e.g. ~/Pictures/cat.jpg notes.md "
                                "(quote names with spaces)", id="transfer-files")
        yield Button("Send (Enter)", id="transfer-send", variant="primary")

    def main_widget(self):
        return self.query_one("#transfer-files")

    def load(self):
        self.loaded = True      # nothing to fetch: Transfer runs inside FaleraOS

    @on(Input.Submitted, "#transfer-files")
    @on(Button.Pressed, "#transfer-send")
    def _send(self, event):
        raw = self.query_one("#transfer-files", Input).value
        try:
            files = [str(Path(f).expanduser()) for f in interactive.split_files(raw)]
        except OreoError as e:
            self.app.notify(e.message, severity="error", markup=False)
            return
        if not files:
            self.app.notify("type the files to send first", severity="warning")
            return

        def run(ui, b, c, _):
            rc = interactive.send_to_transfer(c, b, files)
            ui.note("FaleraOS keeps running; the next section that needs the badge pauses "
                    "it again")
            return rc
        self.app.start_job("sending %d file(s) to Transfer" % len(files), run)


class ProfilePane(Pane):
    BINDINGS = [Binding("e", "edit", "Edit"),
                Binding("f", "from_file", "Load from file")]

    def compose(self) -> ComposeResult:
        with VerticalScroll():
            yield Static("Reading the profile...", id="profile-body")

    def main_widget(self):
        return self.query_one(VerticalScroll)

    def load(self):
        super().load()
        self.app.start_job("reading the profile", lambda ui, b, c, p: owner.read(b),
                           on_done=self.show)

    def show(self, data):
        rui = RenderUI()
        owner.show(rui, data, title="owner profile in %s" % owner.PATH)
        rui.note("e edits it field by field (Enter keeps a value, - removes it); f loads "
                 "the profile keys from an .env-style file such as .env.local.")
        self.query_one("#profile-body", Static).update(rui.renderable())

    def _saved(self, data):
        self.show(data)
        if data is not None:
            self.app.log_line("[dim]apps read the new profile when FaleraOS restarts "
                              "(when you quit this view)[/dim]")

    def action_edit(self):
        def run(ui, b, c, _):
            owner.setup(ui, b)
            return owner.read(b)
        self.app.start_job("editing the profile", run, on_done=self._saved)

    def action_from_file(self):
        def prepare(ui, c):
            path = ui.ask("An .env-style file with the profile keys", default=".env.local")
            updates, ignored = owner.updates_from_file(path)
            ui.note("from %s: %s" % (esc(path), ", ".join(sorted(updates)) or
                                     "no profile values"))
            if ignored:
                ui.note("left alone (not profile keys): %s" % ", ".join(sorted(set(ignored))))
            if not updates:
                raise Cancelled("nothing to save")
            return updates

        def run(ui, b, c, updates):
            owner.setup(ui, b, updates=updates)
            return owner.read(b)
        self.app.start_job("saving the profile", run, prepare=prepare, on_done=self._saved)


class InstallPane(Pane):
    def compose(self) -> ComposeResult:
        yield Static(
            "[b]Install an app from a folder on this computer[/b]\n\n"
            "The folder is checked with the same rules as tools/validate_app.py, then\n"
            "copied to /apps/<id>/ (each file checked with SHA-256). It appears in the\n"
            "Apps drawer when FaleraOS restarts (when you quit this view). New app:\n"
            "`falera new my_game`.\n", id="install-text")
        yield Input(placeholder="app folder, e.g. ~/oreo-apps/my_game", id="install-folder")
        yield Checkbox("replace a built-in app (--force)", id="install-force")
        yield Button("Install (Enter)", id="install-go", variant="primary")

    def main_widget(self):
        return self.query_one("#install-folder")

    def load(self):
        self.loaded = True

    @on(Input.Submitted, "#install-folder")
    @on(Button.Pressed, "#install-go")
    def _install(self, event):
        folder = self.query_one("#install-folder", Input).value.strip().strip("'\"")
        force = self.query_one("#install-force", Checkbox).value
        if not folder:
            self.app.notify("type the app folder first", severity="warning")
            return

        def prepare(ui, c):
            return devtools.check_folder(ui, folder)

        def run(ui, b, c, checked):
            aid, manifest = devtools.install_folder(ui, b, checked, force=force)
            ui.note("%s appears in the Apps drawer when FaleraOS restarts (when you quit "
                    "this view)" % esc(manifest.get("name") or aid))
        self.app.start_job("installing %s" % Path(folder).name, run, prepare=prepare)


class UpdatePane(Pane):
    BINDINGS = [Binding("c", "check", "Check"),
                Binding("u", "update", "Update FaleraOS")]

    def compose(self) -> ComposeResult:
        yield Static("", id="update-text")
        yield Checkbox("beta channel", id="update-beta")
        with Horizontal(id="update-buttons"):
            yield Button("Check for updates (c)", id="update-check")
            yield Button("Update FaleraOS (u)", id="update-go", variant="primary")

    def main_widget(self):
        return self.query_one("#update-check")

    def load(self):
        self.loaded = True
        self.refresh_text()

    def refresh_text(self):
        info = self.app.info or {}
        self.query_one("#update-text", Static).update(
            "[b]Update FaleraOS[/b]\n\n"
            "FaleraOS on the badge: [b]%s[/b]\n\n"
            "The badge downloads the newest release from GitHub over its own Wi-Fi\n"
            "(a saved network, see Wi-Fi), checks every file, installs it and restarts.\n"
            "Your apps, photos, documents and Wi-Fi stay. Once the files start moving\n"
            "into place the update cannot be cancelled.\n"
            % esc(info.get("os") or "?"))

    def _channel(self):
        return "beta" if self.query_one("#update-beta", Checkbox).value else "stable"

    def _run(self, check_only):
        channel = self._channel()

        def run(ui, b, c, _):
            return update.run_update(c, b, channel=channel, check_only=check_only)
        self.app.start_job("checking for updates" if check_only else "updating FaleraOS", run,
                           cancellable=check_only, on_done=lambda rc: self.app.after_update())

    @on(Button.Pressed, "#update-check")
    def action_check(self, event=None):
        self._run(True)

    @on(Button.Pressed, "#update-go")
    def action_update(self, event=None):
        self._run(False)


PANES = {"status": StatusPane, "files": FilesPane, "apps": AppsPane, "wifi": WifiPane,
         "transfer": TransferPane, "profile": ProfilePane, "install": InstallPane,
         "update": UpdatePane}


# ── the app ──────────────────────────────────────────────────────────

class OreoApp(App, Sink):
    TITLE = "Falera Badge"
    ENABLE_COMMAND_PALETTE = False
    POLL_S = 1.0              # seconds between looks for a badge while waiting

    CSS = """
    Screen { background: $surface; }
    #body { height: 1fr; }
    #side { width: 28; border: round #7a5236; background: $surface; }
    #side:focus-within { border: round #c58b5b; }
    #nav { height: auto; border: none; background: $surface; }
    #links { height: auto; padding: 0 1; color: $text-muted; border-top: solid #5a3d29; }
    #main { width: 1fr; }
    #panes { height: 1fr; border: round #7a5236; padding: 0 1; }
    #panes > Pane { height: 1fr; }
    DataTable { height: 1fr; }
    #activity { height: 1; padding: 0 1; }
    #activity-spin { width: 3; color: #c58b5b; }
    #activity-text { width: 1fr; }
    #activity-bar { width: 50; }
    #activity-hint { width: auto; color: $text-muted; }
    /* Scrollbars in the view's colours (no black or blue blocks). */
    * { scrollbar-background: $surface; scrollbar-background-hover: $surface;
        scrollbar-background-active: $surface; scrollbar-color: #7a5236;
        scrollbar-color-hover: #c58b5b; scrollbar-color-active: #c58b5b;
        scrollbar-corner-color: $surface; }
    /* Three lines by default; l (or an error) makes it about half the
       height. Its scrollbar appears only when the lines overflow. */
    #log { height: 5; border: round #7a5236; padding: 0 1; overflow-y: auto;
           overflow-x: hidden; background: $surface; scrollbar-size-vertical: 1; }
    #log.expanded { height: 50%; }
    Input { margin: 1 0 0 0; }
    Button { margin: 1 1 0 0; }
    #update-buttons, #ask-buttons { height: auto; }
    #ask, #pick { width: 72; height: auto; padding: 1 2; border: thick #c58b5b;
                  background: $panel; }
    AskScreen, PickScreen { align: center middle; }
    #ask-hint, #pick-hint { color: $text-muted; margin: 1 0 0 0; }
    WaitScreen #wait { align: center middle; height: 1fr; }
    #wait-spin { color: #c58b5b; width: auto; margin: 0 0 1 0; }
    #wait-text { width: auto; }
    """

    BINDINGS = [Binding(key, "section('%s')" % sid, label, show=False)
                for sid, key, label in SECTIONS] + [
        Binding("s", "shell", "Shell"),
        Binding("r", "reload", "Refresh"),
        Binding("escape", "cancel_job", "Cancel"),
        Binding("l", "toggle_log", "Log"),
        Binding("q", "quit_app", "Quit"),
        Binding("ctrl+c", "quit_app", "Quit", show=False, priority=True),
        Binding("ctrl+q", "quit_app", "Quit", show=False, priority=True),
    ]

    def __init__(self, ctx, session=None):
        super().__init__()
        self.ctx = ctx
        # the badge's own log lines only with -v, as for the plain commands
        verbose = getattr(ctx.args, "verbose", False)
        self.session = session or BadgeSession(
            ctx, on_text=self._badge_text if verbose else None)
        self.info = None
        self.jobs = []                 # started, not finished (the first holds the badge)
        self.exiting = False
        self._spin_i = 0
        self._waiting = None
        self._ui_thread = None
        self._bar_label = None
        self._log_auto = False         # the log grew by itself for an error

    # ── layout ───────────────────────────────────────────────────────
    def compose(self) -> ComposeResult:
        yield Header()
        with Horizontal(id="body"):
            with Vertical(id="side"):
                yield OptionList(*[Option("%s  %s" % (key, label), id=sid)
                                   for sid, key, label in SECTIONS], None,
                                 Option("s  Shell (REPL)", id="shell"),
                                 Option("q  Quit", id="quit"), id="nav")
                yield Static(links_text(), id="links")
            with Vertical(id="main"):
                with ContentSwitcher(initial="status", id="panes"):
                    for sid, cls in PANES.items():
                        yield cls(id=sid)
                with Horizontal(id="activity"):
                    yield Label("", id="activity-spin")
                    yield Label("", id="activity-text")
                    yield ProgressBar(id="activity-bar", show_eta=True)
                    yield Label("", id="activity-hint")
                yield RichLog(id="log", wrap=True, markup=False, highlight=False,
                              max_lines=1000)
        yield Footer()

    def on_mount(self):
        self._ui_thread = threading.get_ident()
        self.console.push_theme(Theme(STYLES))
        self.sub_title = "looking for a badge"
        self.query_one("#activity-bar").display = False
        self.set_interval(0.1, self._tick)
        self._idle()
        port = self.ctx.args.port or os.environ.get("OREO_PORT")
        if port:
            self.connect(discovery.normalize_port(port))
        else:
            self.discover()

    # ── badge discovery ──────────────────────────────────────────────
    def discover(self):
        if self.exiting:
            return
        self.run_worker(self._discover_thread, thread=True, group="discover",
                        exclusive=True, exit_on_error=False)

    def _discover_thread(self):
        try:
            badges = discovery.find_badges(self.ctx.comports)
        except OreoError as e:
            badges = []
            self._call(self.log_line, "[err]%s %s[/]" % (MARK_ERR, esc(e.message)))
        self._call(self._found, badges)

    def _found(self, badges):
        if self.session.badge is not None or self.exiting:
            return
        if not badges:
            if self._waiting is None:
                self._waiting = WaitScreen()
                self.push_screen(self._waiting)
            self.set_timer(self.POLL_S, self.discover)
            return
        self._close_wait()
        if len(badges) == 1:
            self.connect(badges[0].device)
            return

        def chosen(device):
            if device is None:
                self.action_quit_app()
            else:
                self.connect(device)
        self.push_screen(PickScreen(badges), chosen)

    def _close_wait(self):
        if self._waiting is not None:
            if self.screen is self._waiting:
                self.pop_screen()
            self._waiting = None

    def connect(self, port):
        self.session.attach(port)
        self.sub_title = "%s · connecting" % port
        self.log_line("[dim]badge on %s; pausing FaleraOS while this view is open[/dim]"
                      % esc(port))

        def run(ui, b, c, _):
            b.connect()
            return b.info()
        self.start_job("connecting to the badge", run, on_done=self.got_info)

    def got_info(self, info):
        self.info = info
        self.query_one(StatusPane).show(info, self.session.port)
        self.query_one(StatusPane).loaded = True
        update_pane = self.query_one(UpdatePane)
        if update_pane.loaded:
            update_pane.refresh_text()
        self._header()

    def _header(self):
        s = self.session
        if s.badge is None:
            self.sub_title = "no badge"
            return
        info = self.info or {}
        name = "Falera Badge" + ((" " + s.serial) if s.serial else "")
        self.title = name
        state = "FaleraOS paused" if s.paused else "FaleraOS running"
        self.sub_title = "FaleraOS %s · %s · %s" % (info.get("os") or "?", s.port, state)

    def after_update(self):
        """After `update`: if the badge restarted, find it again."""
        b = self.session.badge
        if b is None or b.entered:
            return
        old, serial = self.session.port, self.session.serial
        port = discovery.find_again(old, serial, self.ctx.comports) or old
        self.connect(port)

    # ── jobs ─────────────────────────────────────────────────────────
    def start_job(self, title, fn, prepare=None, on_done=None, cancellable=True,
                  interrupt=False):
        """Run fn(ui, badge, ctx, prepared) as a job. prepare(ui, ctx), when
        given, runs first without the badge (questions, file checks, media
        conversion) and its result is passed on as `prepared`."""
        if self.exiting:
            return None
        if self.session.badge is None:
            self.notify("no badge connected yet", severity="warning")
            return None
        if self._log_auto:             # back to compact on the next action
            self._set_log(False)
        job = Job(title, cancellable=cancellable, interrupt=interrupt)
        self.jobs.append(job)
        self._activity()
        self.run_worker(lambda: self._job_thread(job, fn, prepare, on_done), thread=True,
                        group="badge", exit_on_error=False, name=title)
        return job

    def job_ctx(self, ui, job):
        """The command context for a job: its UI, its cancel check, and the
        badge this view holds (so nothing asks discovery again)."""
        c = copy.copy(self.ctx)
        c.args = argparse.Namespace(**vars(self.ctx.args))
        c.args.port = self.session.port
        c.ui = ui
        c.check_cancel = job.check
        return c

    def _job_thread(self, job, fn, prepare, on_done):
        ui = SinkUI(self, job, assume_yes=bool(getattr(self.ctx.args, "yes", False)))
        jctx = self.job_ctx(ui, job)
        try:
            prepared = prepare(ui, jctx) if prepare is not None else None
            result = self.session.run(job, lambda b: fn(ui, b, jctx, prepared),
                                      on_start=lambda: self._call(self._activity))
        except BaseException as e:      # every failure is reported in the view
            if job.cancelled and not isinstance(e, Cancelled):
                e = Cancelled("stopped: %s" % job.title)
            report = explain(e)
            self._call(self._job_failed, job, report)
        else:
            if on_done is not None:
                self._call(on_done, result)
        finally:
            self._call(self._job_finished, job)

    def _job_failed(self, job, report):
        level, message, hint, detail, link_lost = report
        if level == "warn":
            self.log_line("[warn]![/] %s" % message)
            return
        if not self.log_expanded:
            self._set_log(True, auto=True)
        self.log_line("[err]%s %s[/]" % (MARK_ERR, message))
        if detail and getattr(self.ctx.args, "verbose", False):
            for line in str(detail).strip().splitlines()[-6:]:
                self.log_line("  [dim]%s[/]" % esc(line))
        if hint:
            self.log_line("  [key]hint:[/] %s" % hint)
        self.notify(_text(message).plain, title=job.title, severity="error", timeout=6,
                    markup=False)
        if link_lost and not self.session.still_plugged():
            self.session.drop()
            self.info = None
            self.log_line("[warn]![/] the badge went away; plug it back in")
            self._header()
            self.discover()

    def _job_finished(self, job):
        if job in self.jobs:
            self.jobs.remove(job)
        self._header()
        self._activity()
        if self.exiting and not self.jobs:
            self.exit()

    # ── Sink (called from job threads) ───────────────────────────────
    def _call(self, fn, *args):
        """Run fn on the UI thread (directly when already on it)."""
        if threading.get_ident() == self._ui_thread:
            return fn(*args)
        try:
            return self.call_from_thread(fn, *args)
        except RuntimeError:          # the app has stopped
            raise Cancelled("the view was closed")

    def sink_log(self, renderable):
        self._call(self.log_line, renderable)

    def sink_progress(self, label, done, total, unit):
        self._call(self._progress, label, done, total, unit)

    def sink_status(self, message):
        self._call(self._status, message)

    def sink_ask(self, kind, prompt, default, job):
        box = {}
        done = threading.Event()

        def show():
            def answered(value):
                box["value"] = value
                done.set()
            box["screen"] = AskScreen(kind, prompt, default)
            self.push_screen(box["screen"], answered)
        self._call(show)
        while not done.wait(0.1):
            if (job is not None and job.cancelled) or self.exiting:
                try:
                    self._call(box["screen"].dismiss, None)
                except Exception:
                    pass
                raise Cancelled("cancelled")
        return box.get("value")

    def _badge_text(self, line):
        self._call(self.log_line, "[dim]badge: %s[/]" % esc(line))

    # ── activity bar and log (UI thread) ─────────────────────────────
    def log_line(self, renderable):
        self.query_one("#log", RichLog).write(_text(renderable))

    @property
    def log_expanded(self):
        return self.query_one("#log", RichLog).has_class("expanded")

    def _set_log(self, expanded, auto=False):
        log = self.query_one("#log", RichLog)
        log.set_class(expanded, "expanded")
        self._log_auto = expanded and auto
        log.scroll_end(animate=False)

    def action_toggle_log(self):
        self._set_log(not self.log_expanded)

    def _progress(self, label, done, total, unit):
        bar = self.query_one("#activity-bar", ProgressBar)
        if label is None:
            bar.display = False
            self._status_text = None
            self._activity()
            if self._bar_label is not None:
                self.log_line(Text.assemble((MARK_OK + " ", "green"), self._bar_label,
                                            ("  %s" % (human(done) if unit == "bytes"
                                                       else done), "dim")))
            self._bar_label = None
            return
        self._bar_label = _text(label).plain if isinstance(label, str) else str(label)
        bar.display = True
        bar.update(total=total, progress=done)
        self._status_text = "%s  %s" % (_text(label).plain if isinstance(label, str) else label,
                                        ("%s / %s" % (human(done), human(total)) if total
                                         else human(done)) if unit == "bytes"
                                        else ("%d/%s" % (done, total or "?")))
        self._activity()

    def _status(self, message):
        self._status_text = None if message is None else _text(message).plain
        self._activity()

    _status_text = None

    def _activity(self):
        text = self.query_one("#activity-text", Label)
        hint = self.query_one("#activity-hint", Label)
        if not self.jobs:
            self._idle()
            return
        job = self.jobs[0]
        waiting = len(self.jobs) - 1
        line = job.title
        if self._status_text:
            line += ": " + self._status_text
        if waiting:
            line += "  [+%d waiting]" % waiting
        text.update(Text(line))
        hint.update("Esc cancel" if job.cancellable else "cannot be cancelled")

    def _idle(self):
        self.query_one("#activity-spin", Label).update("")
        s = self.session
        if s.badge is None:
            msg = "no badge"
        else:
            msg = "ready · %s" % ("FaleraOS paused while this view is open"
                                  if s.paused else "FaleraOS running")
        self.query_one("#activity-text", Label).update(Text(msg, style="dim"))
        self.query_one("#activity-hint", Label).update("")

    def _tick(self):
        if self.jobs:
            self._spin_i += 1
            self.query_one("#activity-spin", Label).update(SPINNER[self._spin_i % len(SPINNER)])

    # ── actions ──────────────────────────────────────────────────────
    def current_pane(self):
        sid = self.query_one(ContentSwitcher).current
        return self.query_one("#" + sid, Pane)

    def action_section(self, sid):
        if self._log_auto:
            self._set_log(False)
        self.query_one(ContentSwitcher).current = sid
        nav = self.query_one("#nav", OptionList)
        for i, (s, _, _) in enumerate(SECTIONS):
            if s == sid:
                nav.highlighted = i
        pane = self.current_pane()
        if not pane.loaded and self.session.badge is not None:
            pane.load()
        pane.focus_main()

    @on(OptionList.OptionSelected, "#nav")
    def _nav(self, event):
        oid = event.option.id
        if oid == "shell":
            self.action_shell()
        elif oid == "quit":
            self.action_quit_app()
        else:
            self.action_section(oid)

    def action_reload(self):
        if self.session.badge is None:
            self.discover()
            return
        self.current_pane().load()

    def action_cancel_job(self):
        if not self.jobs:
            if isinstance(self.focused, Input):     # leave a text field: keys work again
                self.query_one("#nav", OptionList).focus()
            return
        job = self.session.job or self.jobs[0]
        if job is self.session.job:
            self.session.cancel()       # also Ctrl-C to the badge for `interrupt` jobs
        else:
            job.cancel()                # still waiting for the badge
        if job.cancellable:
            self.log_line("[warn]![/] stopping: %s" % esc(job.title))
        else:
            self.notify("%s cannot be cancelled; wait for it to finish" % job.title,
                        severity="warning", markup=False)

    def action_quit_app(self):
        if not self.jobs:
            self.exiting = True
            self.exit()
            return
        if any(not j.cancellable for j in self.jobs):
            self.notify("%s is running and cannot be stopped; quit when it is done"
                        % next(j.title for j in self.jobs if not j.cancellable),
                        severity="warning", markup=False)
            return
        self.exiting = True
        self.log_line("[warn]![/] stopping %s, then quitting" % esc(self.jobs[0].title))
        for job in list(self.jobs):
            job.cancel()
        self.session.cancel()

    def action_shell(self):
        """The badge's MicroPython REPL in this terminal; back with Ctrl-]."""
        s = self.session
        if s.badge is None:
            self.notify("no badge connected yet", severity="warning")
            return
        if not s.lock.acquire(blocking=False):
            self.notify("busy with %s; wait or press Esc to cancel it"
                        % (self.jobs[0].title if self.jobs else "the badge"),
                        severity="warning", markup=False)
            return
        try:
            with self.suspend():
                run_shell(s.badge)
        except Exception as e:
            level, message, hint, _, _ = explain(e)
            self.log_line("[err]%s %s[/]" % (MARK_ERR, message))
            if hint:
                self.log_line("  [key]hint:[/] %s" % hint)
        finally:
            s.lock.release()
            self._header()
            self._activity()
        self.log_line("[dim]back from the shell[/dim]")


def links_text():
    """The source and docs links under the menu: terminal hyperlinks where
    the terminal supports them (OSC 8), plain dim text elsewhere."""
    text = Text()
    for i, (label, url) in enumerate((("source", REPO_URL), ("docs", DOCS_URL))):
        if i:
            text.append("\n")
        text.append(label + "\n", style="dim")
        text.append(url.split("://", 1)[1].rstrip("/"), style=Style(dim=True, link=url))
    return text


def run_shell(b):
    """The REPL, as `falera shell` and the menu run it (the app is suspended)."""
    from .ui import UI
    ui = UI()
    print("\nMicroPython on %s. Ctrl-] or Ctrl-X goes back to the Falera view.\n" % b.port)
    b.connect()
    b.link.friendly()
    try:
        commands._repl(b.link, ui)
    finally:
        print("")
        b.link.enter(soft_reset=False)


def run(ctx, _headless=None):
    """Open the full-screen view. FaleraOS restarts when it closes, also on
    Ctrl-C and on errors. `_headless` (tests): an auto-pilot coroutine
    function that drives the view without a terminal."""
    app = OreoApp(ctx)
    session = app.session
    try:
        if _headless is not None:
            app.run(headless=True, size=(130, 42), auto_pilot=_headless)
            if app.return_code and app._exception is not None:
                raise app._exception
        else:
            app.run()
    finally:
        held = session.badge is not None
        session.close(ctx.args.reset)
    if held:
        ctx.ui.ok("FaleraOS is starting again" if ctx.args.reset != "none" else "done")
    return 0
