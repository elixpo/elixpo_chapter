"""1.0 bug hunt: error paths, lost connections, busy badges, port names,
non-terminal use, non-UTF-8 output and exit codes."""

import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import test_transport as tt
from fake import FakePort, FakeTransport, badge_port
from helpers import FakeClock, run_cli

from oreo_cli import commands, discovery, errors, ui as ui_mod
from oreo_cli.errors import LinkError
from oreo_cli.transport import SerialLink


from serial import SerialException


class Unplugged(SerialException):
    """What pyserial raises when the port vanishes (an OSError)."""


class LinkFailureTest(unittest.TestCase):
    def test_unplugged_mid_exec_is_a_link_error_and_drops_the_port(self):
        ser = tt.ScriptedSerial([b"R\x01"])
        link = tt.link_with(ser)

        def gone(code):
            raise Unplugged("device reports readiness to read but returned no data")
        link.t.raw_paste_write = gone
        with self.assertRaises(LinkError) as cm:
            link.exec("pass")
        self.assertEqual(cm.exception.code, errors.EXIT_LINK)
        self.assertIn("lost the connection", cm.exception.message)
        self.assertIsNone(link.t)
        link.restart("soft")         # nothing left to restart: no crash

    def test_busy_badge_is_retried_then_explained(self):
        class Transport(tt.FakeMpTransport):
            tries = 0

            def enter_raw_repl(self, soft_reset=True):
                Transport.tries += 1
                print(b"junk the badge printed")      # mpremote does this
                from mpremote.transport import TransportError
                raise TransportError("could not enter raw repl")
        link = SerialLink("/dev/fake")
        link.t = Transport(tt.ScriptedSerial([]))
        out = io.StringIO()
        with mock.patch("time.sleep"), mock.patch("sys.stdout", out):
            with self.assertRaises(LinkError) as cm:
                link.enter()
        self.assertEqual(Transport.tries, 2)
        self.assertIn("busy", cm.exception.hint)
        self.assertEqual(out.getvalue(), "")              # mpremote's print is hidden

    def test_second_attempt_succeeds(self):
        class Transport(tt.FakeMpTransport):
            tries = 0

            def enter_raw_repl(self, soft_reset=True):
                Transport.tries += 1
                if Transport.tries == 1:
                    from mpremote.transport import TransportError
                    raise TransportError("could not enter raw repl")
                self.in_raw_repl = True
        link = SerialLink("/dev/fake")
        link.t = Transport(tt.ScriptedSerial([]))
        with mock.patch("time.sleep"):
            link.enter()
        self.assertEqual(Transport.tries, 2)
        self.assertIn(b"\r\x03\x03", link.t.serial.written)

    def test_send_bounds_blocking_reads_and_restores(self):
        ser = tt.ScriptedSerial([b"R\x01", b"\x04\x04>"])
        ser.timeout = None
        seen = []
        link = tt.link_with(ser)
        real = link.t.raw_paste_write

        def spy(code):
            seen.append(ser.timeout)
            real(code)
        link.t.raw_paste_write = spy
        link.exec("pass")
        self.assertEqual(seen, [10])
        self.assertIsNone(ser.timeout)

    def test_open_failure_is_a_link_error(self):
        link = SerialLink("/dev/oreo-does-not-exist")
        with self.assertRaises(LinkError) as cm:
            link.open()
        self.assertEqual(cm.exception.code, 4)


class MainErrorTest(unittest.TestCase):
    def _run_with(self, exc):
        fake = FakeTransport()
        self.addCleanup(fake.cleanup)

        def boom(*a, **k):
            raise exc
        fake.exec = boom
        return run_cli(["info"], fake=fake)

    def test_serial_exception_outside_the_link(self):
        r = self._run_with(Unplugged("gone"))
        self.assertEqual(r.rc, 4)
        self.assertIn("lost the connection", r.out)
        self.assertNotIn("Traceback", r.out)

    def test_unexpected_error_is_a_message_not_a_traceback(self):
        r = self._run_with(ZeroDivisionError("oops"))
        self.assertEqual(r.rc, 1)
        self.assertIn("unexpected error: ZeroDivisionError", r.out)
        self.assertIn("issues", r.out)
        self.assertNotIn("Traceback", r.out)

    def test_restart_survives_a_second_ctrl_c(self):
        fake = FakeTransport()
        self.addCleanup(fake.cleanup)
        real = fake.restart
        calls = []

        def restart(mode="soft"):
            calls.append(mode)
            if len(calls) == 1:
                raise KeyboardInterrupt
            real(mode)
        fake.restart = restart
        r = run_cli(["info"], fake=fake)
        self.assertEqual(r.rc, 0, r.out)       # the command itself had finished
        self.assertEqual(calls, ["soft", "soft"])


    def test_local_os_error_is_not_a_lost_badge(self):
        r = self._run_with(PermissionError(13, "Permission denied", "/some/file"))
        self.assertEqual(r.rc, 1, r.out)
        self.assertIn("/some/file: Permission denied", r.out)
        self.assertNotIn("lost the connection", r.out)

    def test_broken_pipe_is_quiet(self):
        r = self._run_with(BrokenPipeError(32, "Broken pipe"))
        self.assertEqual(r.rc, 1)
        self.assertNotIn("lost the connection", r.out)
        self.assertNotIn("unexpected", r.out)


class ShieldedRestartTest(unittest.TestCase):
    """The real SerialLink.restart, against a scripted port, cut short by a
    second Ctrl-C at each step."""

    def _link(self):
        ser = tt.ScriptedSerial([b"R\x01", b"\x04\x04>"])
        link = tt.link_with(ser)
        link.exec("pass")
        ser.written.clear()
        return ser, link

    def _interrupt_once(self, obj, name):
        real = getattr(obj, name)
        calls = []

        def once(*a, **k):
            calls.append(a)
            if len(calls) == 1:
                raise KeyboardInterrupt
            return real(*a, **k)
        setattr(obj, name, once)
        return calls

    def test_interrupted_exit_raw_repl_still_soft_resets(self):
        ser, link = self._link()
        calls = self._interrupt_once(link.t, "exit_raw_repl")
        with self.assertRaises(KeyboardInterrupt):   # handed on once restarted
            link.restart("soft")
        self.assertEqual(len(calls), 2)
        self.assertEqual(b"".join(ser.written), b"\r\x02\x04")
        self.assertIsNone(link.t)

    def test_finish_shielded_on_the_real_link(self):
        from oreo_cli.badge import Badge
        from oreo_cli.main import finish_shielded
        ser, link = self._link()
        self._interrupt_once(link.t, "exit_raw_repl")
        b = Badge(link)
        b.entered = True
        finish_shielded(b, "soft")
        self.assertIn(b"\x04", b"".join(ser.written))    # ctrl-D: FaleraOS starts again
        self.assertIsNone(link.t)

    def test_interrupt_in_the_pause_after_ctrl_d_does_not_reboot_twice(self):
        ser, link = self._link()
        with mock.patch("oreo_cli.transport.time.sleep") as sleep:
            sleep.side_effect = [None, KeyboardInterrupt]   # ctrl-B pause, then ctrl-D pause
            with self.assertRaises(KeyboardInterrupt):
                link.restart("soft")
        self.assertEqual(b"".join(ser.written).count(b"\x04"), 1)
        self.assertIsNone(link.t)

    def test_interrupted_hard_reset_ends_the_paste_and_resends(self):
        ser, link = self._link()
        real = link.t.raw_paste_write
        calls = []

        def paste(code):
            calls.append(code)
            if len(calls) == 1:
                ser.write(code[:5])
                raise KeyboardInterrupt
            real(code)
        link.t.raw_paste_write = paste
        ser.replies = [b"R\x01", b"", b"", b">", b"R\x01"]
        with self.assertRaises(KeyboardInterrupt):
            link.restart("hard")
        self.assertEqual(len(calls), 2)
        self.assertIn(b"machine.reset()", calls[1])
        sent = b"".join(ser.written)
        self.assertIn(b"\x03\x03", sent)       # the half-sent paste was ended first
        self.assertIsNone(link.t)


class PortNameTest(unittest.TestCase):
    def test_normalize(self):
        n = discovery.normalize_port
        self.assertEqual(n("com7", "win32"), "COM7")
        self.assertEqual(n("\\\\.\\com12", "win32"), "COM12")
        self.assertEqual(n("/dev/tty.usbmodem101", "darwin", lambda p: True),
                         "/dev/cu.usbmodem101")
        self.assertEqual(n("/dev/tty.usbmodem101", "darwin", lambda p: False),
                         "/dev/tty.usbmodem101")
        self.assertEqual(n("ttyACM0", "linux", lambda p: p == "/dev/ttyACM0"), "/dev/ttyACM0")
        self.assertEqual(n("/dev/ttyACM0", "linux", lambda p: False), "/dev/ttyACM0")

    def test_pick_normalizes_port_and_env(self):
        with mock.patch("sys.platform", "win32"):
            self.assertEqual(discovery.pick("com3", env={}), "COM3")
            self.assertEqual(discovery.pick(env={"OREO_PORT": "com4"}), "COM4")


class TerminalTest(unittest.TestCase):
    def test_shell_and_dev_need_a_terminal_and_do_not_touch(self):
        r = run_cli(["shell"])
        self.assertEqual(r.rc, 2)
        self.assertIn("needs a terminal", r.out)
        with tempfile.TemporaryDirectory() as d:
            r = run_cli(["dev", d])
        self.assertEqual(r.rc, 2)
        self.assertEqual(r.links, [])


class PasswordTest(unittest.TestCase):
    def test_lengths(self):
        self.assertEqual(commands.check_password(""), "")
        self.assertEqual(commands.check_password("12345678"), "12345678")
        self.assertEqual(commands.check_password("a" * 64 if False else "ab" * 32), "ab" * 32)
        for bad in ("short", "x" * 64, "y" * 70):
            with self.assertRaises(errors.UsageError):
                commands.check_password(bad)

    def test_empty_stdin_is_refused(self):
        with mock.patch("sys.stdin", io.StringIO("")):
            r = run_cli(["wifi", "connect", "Home", "--password-stdin"])
        self.assertEqual(r.rc, 2)
        self.assertIn("no password", r.out)
        self.assertEqual(r.links, [])

    def test_ssid_too_long(self):
        r = run_cli(["wifi", "forget", "x" * 33])
        self.assertEqual(r.rc, 2)
        self.assertEqual(r.links, [])


class AsciiTest(unittest.TestCase):
    def test_ascii_mode_has_no_unicode_bars_or_separators(self):
        saved = {k: getattr(ui_mod, k) for k in ui_mod._ASCII_MARKS}
        self.addCleanup(lambda: [setattr(ui_mod, k, v) for k, v in saved.items()])
        ui_mod.use_ascii_marks()
        self.assertEqual(commands.bars(-50), "||||")
        self.assertEqual(commands.bars(-80), "|...")
        buf = io.StringIO()
        u = ui_mod.UI(file=buf, color=False)
        u.header("x")
        u.ok("done")
        self.assertNotIn("\u00b7", buf.getvalue())     # middle dot
        self.assertNotIn("\u25c6", buf.getvalue())     # diamond
        self.assertNotIn("\u2713", buf.getvalue())     # check mark


class LogsTest(unittest.TestCase):
    def test_logs_follow_and_survive_a_reboot(self):
        class Ser:
            def __init__(self, chunks):
                self.chunks = list(chunks)
                self.timeout = None
                self.written = []

            def inWaiting(self):
                if self.chunks and isinstance(self.chunks[0], Exception):
                    raise self.chunks.pop(0)
                return len(self.chunks[0]) if self.chunks else 0

            def read(self, n):
                if not self.chunks:
                    return b""
                c = self.chunks.pop(0)
                if isinstance(c, Exception):
                    raise c
                return c

            def write(self, b):
                self.written.append(b)

        sers = [Ser([b"[boot] hello\r\n", "caf\xc3".encode("latin-1"), Unplugged("gone")]),
                Ser([b"\xa9 back\r\n"])]
        opened = []

        class Link:
            def __init__(self, port):
                self.port = port
                self.t = None

            def open(self):
                s = sers.pop(0)
                opened.append((self.port, s))

                class T:
                    serial = s
                self.t = T()

            def close(self):
                pass

        from oreo_cli.main import Ctx, build_parser
        out_ui = io.StringIO()
        ctx = Ctx(build_parser().parse_args(["logs"]), ui_mod.UI(file=out_ui, color=False),
                  comports=lambda: [badge_port("/dev/ttyACM1")], link_factory=Link,
                  sleep=lambda s: None)
        text = io.StringIO()
        commands.follow_console(ctx, "/dev/ttyACM0", out=commands._Console(text), idle=3)
        self.assertEqual(text.getvalue(), "[boot] hello\r\ncafé back\r\n")
        self.assertEqual([p for p, _ in opened], ["/dev/ttyACM0", "/dev/ttyACM1"])
        self.assertEqual(opened[0][1].timeout, 0.2)
        self.assertIn("went away", out_ui.getvalue())


    def test_logs_port_that_will_not_open_is_an_error(self):
        fake = FakeTransport()
        self.addCleanup(fake.cleanup)
        opens = []

        def refuse():
            opens.append(1)
            raise LinkError("could not open /dev/ttyACM0", hint="another program has it open")
        fake.open = refuse
        r = run_cli(["logs"], fake=fake)
        self.assertEqual(r.rc, 4, r.out)
        self.assertIn("could not open /dev/ttyACM0", r.out)
        self.assertIn("another program", r.out)
        self.assertNotIn("went away", r.out)
        self.assertEqual(len(opens), 1)

    def test_logs_gives_up_when_the_port_comes_back_unopenable(self):
        class Ser:
            timeout = None

            def inWaiting(self):
                raise Unplugged("gone")

            def read(self, n):
                return b""

            def write(self, b):
                pass

        state = {"opens": 0}

        class Link:
            def __init__(self, port):
                self.t = None

            def open(self):
                state["opens"] += 1
                if state["opens"] > 1:
                    raise LinkError("no permission to open /dev/ttyACM0", hint="dialout")

                class T:
                    serial = Ser()
                self.t = T()

            def close(self):
                pass

        from oreo_cli.main import Ctx, build_parser
        out_ui = io.StringIO()
        ctx = Ctx(build_parser().parse_args(["logs"]), ui_mod.UI(file=out_ui, color=False),
                  comports=lambda: [badge_port("/dev/ttyACM0")], link_factory=Link,
                  sleep=lambda s: None)
        with self.assertRaises(LinkError) as cm:
            commands.follow_console(ctx, "/dev/ttyACM0", out=commands._Console(io.StringIO()))
        self.assertIn("no permission", cm.exception.message)
        self.assertEqual(state["opens"], 2 + commands.REOPEN_TRIES)
        self.assertEqual(out_ui.getvalue().count("back on"), 1)


class DoctorStepsTest(unittest.TestCase):
    def test_next_steps_are_numbered_failures_first(self):
        r = run_cli(["doctor"], ports=[FakePort("/dev/ttyACM0", 0x303A, 0x1001)])
        self.assertIn("Next steps", r.out)
        self.assertIn("  1. ", r.out)
        self.assertEqual(r.links, [])

    def test_badge_without_oreoos(self):
        fake = FakeTransport()
        self.addCleanup(fake.cleanup)
        os.remove(fake.os._real("/oreoOS/config.py"))
        from oreo_cli import doctor
        with mock.patch.object(doctor, "check_permissions",
                               lambda dev: (doctor.OK, "ok " + dev, None)):
            r = run_cli(["doctor"], fake=fake, ports=[badge_port()])
        self.assertEqual(r.rc, 1)
        self.assertIn("falera flash", r.out)


class InteractiveTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_upload_from_the_file_view(self):
        src = Path(self.tmp.name) / "note.txt"
        src.write_bytes(b"hi there")
        r = run_cli([], fake=self.fake, interactive=True,
                    inputs=["2", "u %s" % src, "q", "q"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.fake.get("/note.txt"), b"hi there")
        self.assertIn("uploaded /note.txt", r.out)

    def test_ctrl_c_in_an_action_returns_to_the_menu(self):
        from oreo_cli import interactive
        calls = []

        def slow(ui, b):
            calls.append(1)
            raise KeyboardInterrupt
        with mock.patch.object(interactive, "wifi_view", slow):
            r = run_cli([], fake=self.fake, interactive=True, inputs=["4", "1", "q"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("back to the menu", r.out)
        self.assertEqual(self.fake.restarts, ["soft"])


if __name__ == "__main__":
    unittest.main()
