"""The full-screen view (`falera`, `falera ui`), driven headless with Textual's
pilot against the fake badge. Skipped when Textual is not installed (the
release workflow installs it with falera-cli, so CI runs these)."""

import io
import logging
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path

from fake import FakeTransport, badge_port

from oreo_cli import main as main_mod
from oreo_cli.ui import STYLES, UI

try:
    import textual  # noqa: F401
    HAVE_TEXTUAL = True
except ImportError:
    HAVE_TEXTUAL = False

if HAVE_TEXTUAL:
    from rich.console import Console
    from rich.theme import Theme
    from textual.widgets import DataTable, RichLog, Static

    from oreo_cli import tui

# IsolatedAsyncioTestCase runs the loop in debug mode, which logs every
# slow step of a headless app; the tests check behaviour, not timing.
logging.getLogger("asyncio").setLevel(logging.ERROR)


def plain(renderable):
    """What a Static shows, as text."""
    c = Console(width=120, file=io.StringIO(), record=True, theme=Theme(STYLES),
                color_system=None)
    c.print(renderable)
    return c.export_text()


def make_ctx(fake, ports=None, argv=()):
    args = main_mod.build_parser().parse_args(list(argv))
    out = io.StringIO()
    ui = UI(file=out, color=False, width=200, interactive=False)
    ports = [badge_port()] if ports is None else ports
    comports = ports if callable(ports) else (lambda: list(ports))
    ctx = main_mod.Ctx(args, ui, comports=comports, link_factory=lambda port: fake,
                       sleep=lambda s: None)
    return ctx, out


class SlowFake(FakeTransport):
    """A fake badge that takes a little time per exec, and records how
    many execs ever ran at the same time."""

    def __init__(self, delay=0.01, **kw):
        super().__init__(**kw)
        self.delay = delay
        self.active = 0
        self.most = 0
        self._count = threading.Lock()

    def exec(self, code, timeout=15, consumer=None):
        with self._count:
            self.active += 1
            self.most = max(self.most, self.active)
        try:
            time.sleep(self.delay)
            return super().exec(code, timeout, consumer)
        finally:
            with self._count:
                self.active -= 1


@unittest.skipUnless(HAVE_TEXTUAL, "textual is not installed")
class TuiTest(unittest.IsolatedAsyncioTestCase):
    SIZE = (130, 42)

    def setUp(self):
        self.fake = SlowFake(delay=0.002)
        self.addCleanup(self.fake.cleanup)
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, True))

    def app(self, ports=None, argv=()):
        ctx, self.out = make_ctx(self.fake, ports, argv)
        app = tui.OreoApp(ctx)
        app.POLL_S = 0.05
        return app

    async def until(self, pilot, cond, timeout=8.0):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            await pilot.pause(0.02)
            if cond():
                return
        self.fail("timed out waiting; log:\n" + self.log_text(pilot.app))

    def log_text(self, app):
        try:
            log = app.query_one("#log", RichLog)
        except Exception:
            return ""
        return "\n".join("".join(seg.text for seg in line) for line in log.lines)

    async def connected(self, pilot):
        await self.until(pilot, lambda: pilot.app.info is not None and not pilot.app.jobs)

    # ── opening ──────────────────────────────────────────────────────
    async def test_opens_with_the_badge_in_the_header(self):
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            self.assertIn("v2.0.0", app.sub_title)
            self.assertIn("/dev/ttyACM0", app.sub_title)
            self.assertIn("paused", app.sub_title)
            self.assertIn("OREO01", app.title)
            status = plain(app.query_one("#status-body", Static).content)
            self.assertIn("MicroPython 1.28.0", status)
            self.assertIn("battery", status)
            self.assertEqual(self.fake.enters, 1)      # FaleraOS paused once
            self.assertEqual(self.fake.restarts, [])   # and not restarted while open

    async def test_waits_for_a_badge_to_be_plugged_in(self):
        ports = []
        app = self.app(ports=lambda: list(ports))
        async with app.run_test(size=self.SIZE) as pilot:
            await self.until(pilot, lambda: isinstance(app.screen, tui.WaitScreen))
            self.assertIsNone(app.session.badge)
            self.assertEqual(self.fake.sent, [])       # nothing opened meanwhile
            ports.append(badge_port())
            await self.connected(pilot)
            self.assertNotIsInstance(app.screen, tui.WaitScreen)
            self.assertIn("v2.0.0", app.sub_title)

    async def test_several_badges_ask_which(self):
        two = [badge_port(), badge_port("/dev/ttyACM1", "OREO02")]
        app = self.app(ports=two)
        async with app.run_test(size=self.SIZE) as pilot:
            await self.until(pilot, lambda: isinstance(app.screen, tui.PickScreen))
            await pilot.press("down", "enter")
            await self.connected(pilot)
            self.assertEqual(app.session.port, "/dev/ttyACM1")
            self.assertIn("OREO02", app.title)

    async def test_port_option_skips_discovery(self):
        app = self.app(ports=[], argv=["--port", "/dev/ttyACM7"])
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            self.assertEqual(app.session.port, "/dev/ttyACM7")

    # ── sections ─────────────────────────────────────────────────────
    async def test_files_browse_and_open_a_folder(self):
        self.fake.put("/documents/notes.mdz", b"x" * 10)
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            await pilot.press("2")
            pane = app.query_one(tui.FilesPane)
            await self.until(pilot, lambda: pane.entries and not app.jobs)
            names = [e["name"] for e in pane.entries]
            self.assertIn("documents", names)
            table = app.query_one("#files-table", DataTable)
            table.move_cursor(row=names.index("documents"))
            await pilot.press("enter")
            await self.until(pilot, lambda: pane.cwd == "/documents" and not app.jobs)
            self.assertEqual([e["name"] for e in pane.entries], ["notes.mdz"])
            await pilot.press("backspace")
            await self.until(pilot, lambda: pane.cwd == "/" and not app.jobs)

    async def test_delete_asks_first(self):
        self.fake.put("/documents/old.txt", b"bye")
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            pane = app.query_one(tui.FilesPane)
            pane.cwd = "/documents"
            await pilot.press("2")
            await self.until(pilot, lambda: pane.entries and not app.jobs)
            await pilot.press("down")              # past the ".." row
            await pilot.press("x")
            await self.until(pilot, lambda: isinstance(app.screen, tui.AskScreen))
            await pilot.press("n")
            await self.until(pilot, lambda: not app.jobs)
            self.assertTrue(self.fake.exists("/documents/old.txt"))
            self.assertIn("nothing deleted", self.log_text(app))
            await pilot.press("x")
            await self.until(pilot, lambda: isinstance(app.screen, tui.AskScreen))
            await pilot.press("y")
            await self.until(pilot, lambda: not app.jobs and not pane.entries)
            self.assertFalse(self.fake.exists("/documents/old.txt"))

    async def test_protected_files_are_not_deleted(self):
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            await pilot.press("2")
            pane = app.query_one(tui.FilesPane)
            await self.until(pilot, lambda: pane.entries and not app.jobs)
            names = [e["name"] for e in pane.entries]
            app.query_one("#files-table", DataTable).move_cursor(row=names.index("main.py"))
            await pilot.press("x")
            await pilot.pause(0.1)
            self.assertNotIsInstance(app.screen, tui.AskScreen)
            self.assertTrue(self.fake.exists("/main.py"))

    async def test_upload_with_progress_on_the_badge_screen(self):
        from test_hostui import Recorder
        rec = Recorder()
        self.fake.modules["oreoOS.hostui"] = rec
        src = self.tmp / "song.bin"
        src.write_bytes(os.urandom(40000))
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            pane = app.query_one(tui.FilesPane)
            pane.cwd = "/documents"
            await pilot.press("2")
            await self.until(pilot, lambda: not app.jobs and pane.loaded)
            await pilot.press("u")
            await self.until(pilot, lambda: isinstance(app.screen, tui.AskScreen))
            app.screen.query_one("#ask-input").value = str(src)
            await pilot.press("enter")
            await self.until(pilot, lambda: not app.jobs
                             and any(e["name"] == "song.bin" for e in pane.entries))
            self.assertEqual(self.fake.get("/documents/song.bin"), src.read_bytes())
            self.assertTrue(rec.shows("Receiving files"))
            self.assertEqual(rec.calls[-1], ("clear",))

    async def test_cancel_stops_a_copy_between_chunks(self):
        self.fake.delay = 0.05
        src = self.tmp / "big.bin"
        src.write_bytes(os.urandom(8192 * 30))
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            pane = app.query_one(tui.FilesPane)
            pane.cwd = "/documents"
            await pilot.press("2")
            await self.until(pilot, lambda: not app.jobs and pane.loaded)
            await pilot.press("u")
            await self.until(pilot, lambda: isinstance(app.screen, tui.AskScreen))
            app.screen.query_one("#ask-input").value = str(src)
            await pilot.press("enter")
            await self.until(pilot, lambda: app.query_one("#activity-bar").display)
            await pilot.press("escape")
            await self.until(pilot, lambda: not app.jobs)
            self.assertIn("stopped", self.log_text(app))
            self.assertFalse(self.fake.exists("/documents/big.bin"))
            self.assertFalse(self.fake.exists("/documents/big.bin.part"))
            # the view is still usable afterwards
            await pilot.press("r")
            await self.until(pilot, lambda: not app.jobs)

    async def test_one_command_on_the_port_at_a_time(self):
        self.fake.delay = 0.01
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            # ask for everything at once: each section starts a job
            await pilot.press("2", "3", "4", "6", "1", "r")
            await self.until(pilot, lambda: not app.jobs, timeout=15)
            self.assertEqual(self.fake.most, 1)
            self.assertTrue(app.query_one(tui.AppsPane).loaded)
            self.assertTrue(app.query_one(tui.WifiPane).loaded)

    async def test_apps_section_lists_installed_apps(self):
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            await pilot.press("3")
            await self.until(pilot, lambda: not app.jobs
                             and app.query_one("#apps-table", DataTable).row_count)
            table = app.query_one("#apps-table", DataTable)
            self.assertEqual(table.get_row_at(0)[0], "settings")

    async def test_wifi_scan(self):
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            await pilot.press("4")
            await self.until(pilot, lambda: not app.jobs and app.query_one(tui.WifiPane).loaded)
            await pilot.press("n")
            table = app.query_one("#wifi-table", DataTable)
            await self.until(pilot, lambda: not app.jobs and table.row_count == 2)
            self.assertEqual(table.get_row_at(0)[0], "Home")

    async def test_wifi_connect_asks_for_the_password(self):
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            await pilot.press("4")
            await self.until(pilot, lambda: not app.jobs and app.query_one(tui.WifiPane).loaded)
            await pilot.press("n")
            table = app.query_one("#wifi-table", DataTable)
            await self.until(pilot, lambda: not app.jobs and table.row_count == 2)
            await pilot.press("c")
            await self.until(pilot, lambda: isinstance(app.screen, tui.AskScreen))
            self.assertTrue(app.screen.query_one("#ask-input").password)
            app.screen.query_one("#ask-input").value = "hunter2!"
            await pilot.press("enter")
            await self.until(pilot, lambda: not app.jobs and self.fake.wifi.connected)
            self.assertEqual(self.fake.wifi.connected, "Home")
            self.assertNotIn("hunter2!", self.log_text(app))

    async def test_profile_section_shows_the_profile(self):
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            await pilot.press("6")
            await self.until(pilot, lambda: not app.jobs and app.query_one(tui.ProfilePane).loaded)
            text = plain(app.query_one("#profile-body", Static).content)
            self.assertIn("GitHub user", text)

    async def test_install_app_from_a_folder(self):
        from helpers import run_cli
        r = run_cli(["new", "pet", "--author", "me", "--dir", str(self.tmp)])
        self.assertEqual(r.rc, 0, r.out)
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            await pilot.press("7")
            app.query_one("#install-folder").value = str(self.tmp / "pet")
            await pilot.press("enter")
            await self.until(pilot, lambda: not app.jobs and self.fake.exists("/apps/pet/main.py"))
            self.assertIn("installed Pet", self.log_text(app))

    async def test_transfer_with_the_code_from_the_badge(self):
        import types
        from test_transfer import PROTO, FakeSerial, load_proto, odz
        if not PROTO.exists():
            self.skipTest("not inside a FaleraOS checkout")
        root = self.tmp / "badge"
        root.mkdir()
        ser = FakeSerial(load_proto(), str(root) + "/")
        self.fake.t = types.SimpleNamespace(serial=ser)
        doc = self.tmp / "notes.mdz"
        doc.write_bytes(odz())
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            await pilot.press("5")
            app.query_one("#transfer-files").value = str(doc)
            await pilot.press("enter")
            await self.until(pilot, lambda: isinstance(app.screen, tui.AskScreen))
            self.assertIn("Code shown on the badge", str(app.screen.prompt))
            app.screen.query_one("#ask-input").value = ser.rx.code
            await pilot.press("enter")
            await self.until(pilot, lambda: not app.jobs)
            self.assertIn("1 file(s) sent", self.log_text(app))
            self.assertTrue((root / "documents" / "notes.mdz").exists())
            self.assertEqual(self.fake.restarts, ["soft"])     # FaleraOS runs Transfer
            self.assertIn("FaleraOS running", app.sub_title)
            # the next section that needs the badge pauses FaleraOS again
            await pilot.press("escape", "2")   # out of the text field, then Files
            await self.until(pilot, lambda: not app.jobs and app.query_one(tui.FilesPane).entries)
            self.assertEqual(self.fake.enters, 2)
            self.assertIn("paused", app.sub_title)

    async def test_errors_are_reported_and_the_view_stays(self):
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            self.fake.fail_on = "os.ilistdir"
            await pilot.press("2")
            await self.until(pilot, lambda: not app.jobs and app.query_one(tui.FilesPane).loaded)
            self.assertIn("the badge raised", self.log_text(app))
            self.fake.fail_on = None
            await pilot.press("r")
            pane = app.query_one(tui.FilesPane)
            await self.until(pilot, lambda: not app.jobs and pane.entries)

    async def test_errors_expand_the_log_until_the_next_action(self):
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            self.assertFalse(app.log_expanded)
            self.fake.fail_on = "os.ilistdir"
            await pilot.press("2")
            await self.until(pilot, lambda: not app.jobs and app.log_expanded)
            self.fake.fail_on = None
            await pilot.press("r")                  # the next action
            self.assertFalse(app.log_expanded)
            await self.until(pilot, lambda: not app.jobs)
            self.assertFalse(app.log_expanded)

    # ── layout ───────────────────────────────────────────────────────
    async def test_log_is_three_lines_and_l_expands_it(self):
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            log = app.query_one("#log", RichLog)
            self.assertEqual(log.content_region.height, 3)
            # one line in it: no scrollbar
            self.assertFalse(log.show_vertical_scrollbar)
            self.assertIn("pausing FaleraOS", self.log_text(app))
            self.assertIn("ready", str(app.query_one("#activity-text").content))
            self.assertIn("l", app.active_bindings)              # shown in the footer
            self.assertEqual(app.active_bindings["l"].binding.description, "Log")
            await pilot.press("l")
            await pilot.pause(0.05)
            self.assertTrue(app.log_expanded)
            main = app.query_one("#main").content_region.height
            self.assertGreaterEqual(log.region.height, main // 2 - 1)
            await pilot.press("l")
            await pilot.pause(0.05)
            self.assertFalse(app.log_expanded)
            self.assertEqual(log.content_region.height, 3)
            # an expanded log stays open on the next action when asked for
            await pilot.press("l", "1")
            await self.until(pilot, lambda: not app.jobs)
            self.assertTrue(app.log_expanded)

    async def test_log_scrollbar_only_when_it_overflows(self):
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            log = app.query_one("#log", RichLog)
            for i in range(10):
                app.log_line("line %d" % i)
            await pilot.pause(0.05)
            self.assertTrue(log.show_vertical_scrollbar)

    async def test_sidebar_links_to_the_source_and_the_docs(self):
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            links = app.query_one("#links", Static)
            text = plain(links.content)
            self.assertIn("github.com/elixpo/falera", text)
            self.assertIn("falera.elixpo.com/docs/cli", text)
            urls = {span.style.link for span in tui.links_text().spans
                    if getattr(span.style, "link", None)}
            self.assertEqual(urls, {tui.REPO_URL, tui.DOCS_URL})
            # under the menu, after Quit
            nav = app.query_one("#nav")
            self.assertGreaterEqual(links.region.y, nav.region.bottom)
            self.assertEqual(nav.get_option_at_index(nav.option_count - 1).id, "quit")

    async def test_unplugged_badge_goes_back_to_waiting(self):
        ports = [badge_port()]
        app = self.app(ports=lambda: list(ports))
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            ports.clear()
            from oreo_cli.errors import LinkError

            def gone(*a, **kw):
                raise LinkError("lost the connection to the badge on /dev/ttyACM0")
            self.fake.exec = gone
            await pilot.press("2")
            await self.until(pilot, lambda: isinstance(app.screen, tui.WaitScreen))
            self.assertIsNone(app.session.badge)

    # ── leaving ──────────────────────────────────────────────────────
    async def test_quit_while_a_job_runs_stops_it_first(self):
        self.fake.delay = 0.05
        src = self.tmp / "big.bin"
        src.write_bytes(os.urandom(8192 * 30))
        app = self.app()
        async with app.run_test(size=self.SIZE) as pilot:
            await self.connected(pilot)
            pane = app.query_one(tui.FilesPane)
            pane.cwd = "/documents"
            await pilot.press("2")
            await self.until(pilot, lambda: not app.jobs and pane.loaded)
            await pilot.press("u")
            await self.until(pilot, lambda: isinstance(app.screen, tui.AskScreen))
            app.screen.query_one("#ask-input").value = str(src)
            await pilot.press("enter")
            await self.until(pilot, lambda: app.query_one("#activity-bar").display)
            await pilot.press("ctrl+c")
            await self.until(pilot, lambda: not app.is_running)
        self.assertFalse(self.fake.exists("/documents/big.bin.part"))
        self.assertTrue(app.exiting)


@unittest.skipUnless(HAVE_TEXTUAL, "textual is not installed")
class LifecycleTest(unittest.TestCase):
    """tui.run(): FaleraOS restarts when the view closes, however it closes."""

    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)

    def run_view(self, pilot_fn, argv=()):
        ctx, out = make_ctx(self.fake, argv=argv)
        rc = tui.run(ctx, _headless=pilot_fn)
        return rc, out.getvalue()

    @staticmethod
    async def wait_connected(pilot):
        for _ in range(400):
            await pilot.pause(0.02)
            if pilot.app.info is not None and not pilot.app.jobs:
                return
        raise AssertionError("never connected")

    def test_quit_restarts_oreoos(self):
        async def drive(pilot):
            await self.wait_connected(pilot)
            await pilot.press("q")
        rc, out = self.run_view(drive)
        self.assertEqual(rc, 0)
        self.assertEqual(self.fake.restarts, ["soft"])
        self.assertIn("FaleraOS is starting again", out)

    def test_ctrl_c_restarts_oreoos(self):
        async def drive(pilot):
            await self.wait_connected(pilot)
            await pilot.press("ctrl+c")
        self.run_view(drive)
        self.assertEqual(self.fake.restarts, ["soft"])

    def test_reset_none_is_honoured(self):
        async def drive(pilot):
            await self.wait_connected(pilot)
            await pilot.press("q")
        self.run_view(drive, argv=["--reset", "none"])
        self.assertEqual(self.fake.restarts, ["none"])

    def test_a_crash_still_restarts_oreoos(self):
        async def drive(pilot):
            await self.wait_connected(pilot)
            raise RuntimeError("boom")
        with self.assertRaises(RuntimeError):
            self.run_view(drive)
        self.assertEqual(self.fake.restarts, ["soft"])

    def test_no_badge_touched_without_one(self):
        ctx, out = make_ctx(self.fake, ports=[])

        async def drive(pilot):
            await pilot.pause(0.2)
            await pilot.press("q")
        tui.run(ctx, _headless=drive)
        self.assertEqual(self.fake.sent, [])
        self.assertEqual(self.fake.restarts, [])


class FallbackTest(unittest.TestCase):
    """Where the full-screen view cannot run, `falera` keeps the menu."""

    class Stream:
        def __init__(self, tty):
            self.tty = tty

        def isatty(self):
            return self.tty

    def problem(self, tty=True, env=None, spec=True, embedded=False):
        return main_mod.tui_problem(embedded=embedded, stdin=self.Stream(tty),
                                    stdout=self.Stream(tty), env=env or {"TERM": "xterm"},
                                    find_spec=lambda name: object() if spec else None)

    def test_reasons(self):
        self.assertIsNone(self.problem())
        self.assertIn("terminal", self.problem(tty=False))
        self.assertIn("dumb", self.problem(env={"TERM": "dumb"}))
        self.assertIn("Textual", self.problem(spec=False))
        self.assertIn("OREO_UI", self.problem(env={"TERM": "xterm", "OREO_UI": "menu"}))
        self.assertIn("embedded", self.problem(embedded=True))

    def test_oreo_alone_falls_back_to_the_menu(self):
        from helpers import run_cli
        fake = FakeTransport()
        self.addCleanup(fake.cleanup)
        r = run_cli([], fake=fake, interactive=True, inputs=["q"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("send files to Transfer", r.out)       # the numbered menu

    def test_oreo_menu(self):
        from helpers import run_cli
        fake = FakeTransport()
        self.addCleanup(fake.cleanup)
        r = run_cli(["menu"], fake=fake, interactive=True, inputs=["q"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("send files to Transfer", r.out)

    def test_oreo_ui_says_why_it_cannot_run(self):
        from helpers import run_cli
        r = run_cli(["ui"])
        self.assertEqual(r.rc, 2)
        self.assertIn("cannot run here", r.out)
        self.assertIn("falera menu", r.out)
        self.assertEqual(r.links, [])


if __name__ == "__main__":
    unittest.main()
