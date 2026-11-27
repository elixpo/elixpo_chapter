"""`falera transfer`: the CLI client against the badge's real Transfer protocol.

The badge side (apps/transfer/src/proto.py) is loaded from the checkout and
wired to the client through FakeSerial, an in-memory USB serial line that
can echo, inject FaleraOS log lines, deliver bytes in small pieces, damage a
chunk, or play a badge whose Transfer app is closed. Skipped when the CLI
is tested outside a FaleraOS checkout.
"""

import contextlib
import importlib.util
import io
import os
import shutil
import struct
import tempfile
import unittest
import zlib
from pathlib import Path

from helpers import run_cli

from oreo_cli import transfer
from oreo_cli.transfer import Client, TransferError

REPO = Path(__file__).resolve().parents[2]
PROTO = REPO / "apps" / "transfer" / "src" / "proto.py"


def load_proto():
    spec = importlib.util.spec_from_file_location("oreo_transfer_proto_cli", PROTO)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def rz565(w=4, h=3, fill=b"\x12\x34"):
    raw = fill * (w * h)
    return b"R5Z\x01" + struct.pack("<HHI", w, h, len(raw)) + zlib.compress(raw)


def odz(text=b"# hello\n"):
    return b"ODZ\x01" + struct.pack("<I", len(text)) + zlib.compress(text)


def rv565(frames=2, w=8, h=6):
    out = b"RV5\x06" + struct.pack("<HHBBH", w, h, 10, 0, frames)
    for i in range(frames):
        packed = zlib.compress(bytes([i]) * (w * h * 2))
        out += struct.pack("<I", len(packed)) + packed
    return out


STDIN_RING = 259                 # usable bytes in MicroPython's stdin ring


class Clock:
    def __init__(self):
        self.t = 100.0

    def __call__(self):
        return self.t

    def sleep(self, s):
        self.t += s


class FakeSerial:
    """The USB line plus a badge running the Transfer app."""

    def __init__(self, proto, root, app_open=True, echo=False, noise_every=0,
                 piece=None, damage_seq=None, free=64 * 1024 * 1024, clock=None):
        self.proto = proto
        self.clock = clock
        self.app_open = app_open
        self.echo = echo
        self.noise_every = noise_every
        self.piece = piece
        self.damage_seq = damage_seq
        self.to_host = bytearray()
        self.inbox = bytearray()
        self.written = bytearray()
        self.lines_in = 0
        # While the app is closed nothing reads stdin: bytes go into
        # MicroPython's stdin ring (ports/esp32/mphalport.c, 260 bytes, 259
        # usable). tud_cdc_rx_cb spots Ctrl-C only as a byte enters the ring;
        # once it is full later bytes wait in TinyUSB and Ctrl-C is never seen.
        self.ring = bytearray()
        self.blocked = 0             # bytes that found the ring full
        self.interrupted = False     # a Ctrl-C reached MicroPython
        self.timeout = 0.05
        self.on_line = None          # hook(line) after each badge-side line
        ms = (lambda: int(clock.t * 1000)) if clock else None
        self.rx = proto.Receiver(self._out, root=root, free=lambda: free, clock=ms,
                                 os_version="v2.0.5")
        if app_open:
            self.rx.announce()

    def _out(self, text):
        self.to_host += (text + "\r\n").encode()
        if self.noise_every and len(self.to_host) % self.noise_every < 40:
            self.to_host += b"[net] link up\r\n"

    def open_app(self):
        self.app_open = True
        self.inbox = bytearray()     # the app drains what queued up
        self.ring = bytearray()
        self.blocked = 0
        self.rx.announce()

    # pyserial surface
    def write(self, data):
        self.written += data
        if self.echo:
            self.to_host += data
        if not self.app_open:
            for b in data:
                if self.blocked or len(self.ring) >= STDIN_RING:
                    self.blocked += 1
                    continue
                if b == 0x03:
                    self.interrupted = True
                else:
                    self.ring.append(b)
            return len(data)
        self.inbox += data
        while b"\n" in self.inbox:
            i = self.inbox.index(b"\n")
            line = bytes(self.inbox[:i])
            del self.inbox[:i + 1]
            if self.damage_seq is not None and line.startswith(b"@OTD %d " % self.damage_seq):
                line = line[:-8] + (b"AAAAAAAA" if line[-8:] != b"AAAAAAAA" else b"BBBBBBBB")
                self.damage_seq = None
            self.lines_in += 1
            self.rx.feed(line)
            if self.on_line:
                self.on_line(line)
        return len(data)

    @property
    def in_waiting(self):
        n = len(self.to_host)
        return min(n, self.piece) if self.piece else n

    def read(self, n=1):
        if not self.to_host:
            if self.clock is not None:
                self.clock.t += self.timeout
                if self.app_open:
                    self.rx.tick()
            return b""
        out = bytes(self.to_host[:n])
        del self.to_host[:n]
        return out

    def flush(self):
        pass


class FakeLink:
    def __init__(self, ser):
        self.t = type("T", (), {"serial": ser})()
        self.opened = self.closed = 0
        self.sent_raw_repl = False

    def open(self):
        self.opened += 1
        return self

    def close(self):
        self.closed += 1

    def exec(self, *a, **k):
        raise AssertionError("transfer must never use the raw REPL")

    enter = restart = exec


@unittest.skipUnless(PROTO.exists(), "not inside a FaleraOS checkout")
class TransferTestBase(unittest.TestCase):
    def setUp(self):
        self.proto = load_proto()
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp)
        self.root = self.tmp + "/"

    def badge_file(self, rel):
        return Path(self.root) / rel

    def client(self, ser, clock=None):
        c = Client(ser, host="laptop", clock=clock or Clock(),
                   sleep=(clock.sleep if clock else (lambda s: None)))
        return c

    def session(self, **kw):
        ser = FakeSerial(self.proto, self.root, **kw)
        c = self.client(ser)
        c.connect(wait=5)
        r = c.auth(ser.rx.code)
        self.assertEqual(r["op"], "ok")
        return ser, c


class ContractTest(TransferTestBase):
    def test_constants_match_the_badge(self):
        p = self.proto
        self.assertEqual(transfer.PROTOCOL, p.VERSION)
        self.assertEqual(transfer.HOST_PREFIX, p.HOST_PREFIX)
        self.assertEqual(transfer.DATA_PREFIX, p.DATA_PREFIX)
        self.assertEqual(transfer.BADGE_PREFIX, p.BADGE_PREFIX.encode())
        self.assertEqual(transfer.CODE_CHARSET, p.CODE_CHARSET)
        self.assertEqual(transfer.CODE_LEN, p.CODE_LEN)
        self.assertEqual(transfer.CHUNK, p.CHUNK)
        exts = {e for e, _f, _k in p.ROUTES}
        for ext, kind in transfer.READY_EXTS.items():
            self.assertIn(ext, exts)
            self.assertEqual(p.route_for("x" + ext)[1], kind)
        # A full data line fits the badge's line limit.
        line = len(transfer.DATA_PREFIX) + 8 + 4 * ((transfer.CHUNK + 2) // 3)
        self.assertLess(line, p.MAX_LINE)


class ClientProtocolTest(TransferTestBase):
    def test_send_photo_document_video(self):
        ser, c = self.session()
        seen = []
        files = [("cat.rz565", rz565(80, 60)), ("notes.mdz", odz()),
                 ("clip.rv565", rv565(frames=3, w=40, h=30))]
        for name, blob in files:
            r = c.put(name, blob, progress=seen.append)
            self.assertEqual(r["op"], "done")
        g = self.badge_file("apps/gallery/assets/optimized")
        self.assertEqual((g / "cat.rz565").read_bytes(), files[0][1])
        self.assertEqual((g / "clip.rv565").read_bytes(), files[2][1])
        self.assertEqual(self.badge_file("documents/notes.mdz").read_bytes(), files[1][1])
        self.assertFalse(any(p.name.endswith(".part") for p in g.iterdir()))
        self.assertEqual(seen[-1], len(files[2][1]))
        c.bye()
        self.assertEqual(ser.rx.state, self.proto.WAITING)

    def test_large_file_is_chunked_with_a_window(self):
        ser, c = self.session()
        acks = []
        ser.on_line = lambda line: acks.append(line[:12]) if line.startswith(b"@OTD") else None
        # Make the payload span many chunks: an uncompressed .r565.
        raw = b"R5" + struct.pack("<HH", 120, 90) + os.urandom(120 * 90 * 2)
        r = c.put("noise.r565", raw)
        self.assertEqual(r["size"], len(raw))
        self.assertGreater(len(acks), 5)
        self.assertEqual(self.badge_file("apps/gallery/assets/optimized/noise.r565").read_bytes(),
                         raw)

    def test_damaged_chunk_fails_that_file_only(self):
        ser, c = self.session(damage_seq=0)
        raw = b"R5" + struct.pack("<HH", 60, 40) + os.urandom(60 * 40 * 2)
        with self.assertRaises(TransferError) as cm:
            c.put("bad.r565", raw)
        self.assertIn(cm.exception.badge_code, ("hash", "data"))
        self.assertFalse(cm.exception.fatal)
        g = self.badge_file("apps/gallery/assets/optimized")
        self.assertEqual([p.name for p in g.iterdir()], [])
        # The session survives: the next file goes through.
        self.assertEqual(c.put("good.rz565", rz565())["op"], "done")

    def test_badge_rejects_a_fake_image(self):
        ser, c = self.session()
        with self.assertRaises(TransferError) as cm:
            c.put("fake.rz565", b"not an image at all")
        self.assertEqual(cm.exception.badge_code, "invalid")

    def test_noise_echo_and_small_reads(self):
        ser, c = self.session(echo=True, noise_every=97, piece=7)
        self.assertEqual(c.put("a.rz565", rz565(30, 20))["op"], "done")
        self.assertGreater(c.noise, 0)

    def test_no_space_and_too_big(self):
        ser, c = self.session(free=300 * 1024)
        with self.assertRaises(TransferError) as cm:
            c.put("big.r565", b"R5" + struct.pack("<HH", 200, 200) + bytes(200 * 200 * 2))
        self.assertEqual(cm.exception.badge_code, "no_space")
        self.assertIsNotNone(cm.exception.hint)

    def test_cancel_on_the_badge_is_fatal(self):
        ser, c = self.session()

        def cancel(line):
            if line.startswith(b"@OTD 1 "):
                ser.rx.cancel()
        ser.on_line = cancel
        raw = b"R5" + struct.pack("<HH", 100, 100) + bytes(100 * 100 * 2)
        with self.assertRaises(TransferError) as cm:
            c.put("x.r565", raw)
        self.assertEqual(cm.exception.badge_code, "cancelled")
        self.assertTrue(cm.exception.fatal)
        self.assertEqual(list(self.badge_file("apps/gallery/assets/optimized").iterdir()), [])

    def test_write_timeout_is_a_clear_error(self):
        ser, c = self.session()

        class SerialTimeoutException(Exception):
            pass

        def stuck(data):
            raise SerialTimeoutException("Write timeout")
        ser.write = stuck
        with self.assertRaises(TransferError) as cm:
            c.put("a.rz565", rz565())
        self.assertEqual(cm.exception.badge_code, "no_answer")
        self.assertTrue(cm.exception.fatal)

    def test_wrong_code_and_lockout(self):
        ser = FakeSerial(self.proto, self.root)
        c = self.client(ser)
        c.connect(wait=5)
        for left in (4, 3, 2, 1):
            r = c.auth("ZZZZZZ")
            self.assertEqual((r["code"], r["left"]), ("auth", left))
        old = ser.rx.code
        r = c.auth("ZZZZZZ")
        self.assertEqual(r["code"], "locked")
        self.assertNotEqual(ser.rx.code, old)
        self.assertEqual(c.auth(ser.rx.code)["code"], "locked")   # even the right one

    def test_list_and_delete(self):
        ser, c = self.session()
        c.put("a.rz565", rz565())
        c.put("n.mdz", odz())
        names = sorted(f["name"] for f in c.list()["files"])
        self.assertEqual(names, ["a.rz565", "n.mdz"])
        c.delete("a.rz565")
        self.assertEqual([f["name"] for f in c.list()["files"]], ["n.mdz"])
        with self.assertRaises(TransferError) as cm:
            c.delete("../../main.py")
        self.assertEqual(cm.exception.badge_code, "name")

    def test_app_not_open_waits_then_explains(self):
        clock = Clock()
        ser = FakeSerial(self.proto, self.root, app_open=False, clock=clock)
        c = self.client(ser, clock)
        waited = []
        with self.assertRaises(TransferError) as cm:
            c.connect(wait=20, on_wait=lambda: waited.append(clock.t))
        self.assertEqual(cm.exception.badge_code, "no_answer")
        self.assertIn("Transfer", cm.exception.hint)
        self.assertEqual(len(waited), 1)
        # Nothing is written while the app is closed: nobody would read it.
        self.assertEqual(bytes(ser.written), b"")

    def test_app_not_open_leaves_ctrl_c_working(self):
        # Failed runs with the longest host name the CLI sends, then what
        # `falera add` / mpremote do next: Ctrl-C must still reach MicroPython.
        clock = Clock()
        ser = FakeSerial(self.proto, self.root, app_open=False, clock=clock)
        for _ in range(5):
            c = Client(ser, clock=clock, sleep=clock.sleep, host="h" * 24)
            with self.assertRaises(TransferError):
                c.connect(wait=20)
        self.assertEqual(len(ser.ring), 0)
        ser.write(b"\r\x03\x03")
        self.assertTrue(ser.interrupted)
        self.assertEqual(ser.blocked, 0)

    def test_ring_model_blocks_ctrl_c_when_full(self):
        # The model itself: three of the old unprompted hellos (102 bytes
        # each with a 22-character host) fill the ring and Ctrl-C is lost.
        ser = FakeSerial(self.proto, self.root, app_open=False)
        hello = (b'@OTH {"v":1,"host":"' + b"h" * 22 + b'","client":"falera-cli 0.1.0",'
                 b'"id":"01234567","op":"hello"}\n')
        self.assertEqual(len(hello), 102)
        for _ in range(3):
            ser.write(hello)
        ser.write(b"\x03")
        self.assertFalse(ser.interrupted)

    def test_stale_announce_sends_one_short_hello(self):
        # An announce left in the computer's buffer from an app that has
        # since closed: one hello goes out, well inside the ring.
        clock = Clock()
        ser = FakeSerial(self.proto, self.root, app_open=False, clock=clock)
        ser.to_host += b'@OTB {"op": "announce", "v": 1, "app": "transfer"}\r\n'
        c = Client(ser, clock=clock, sleep=clock.sleep, host="h" * 24)
        with self.assertRaises(TransferError):
            c.connect(wait=20)
        self.assertEqual(ser.written.count(b"@OTH "), 1)
        self.assertLess(len(ser.ring), 110)
        ser.write(b"\x03")
        self.assertTrue(ser.interrupted)

    def test_stale_session_is_taken_over(self):
        # A CLI was killed after hello: the badge stays in that session but
        # keeps announcing while idle, so the next run gets in.
        clock = Clock()
        ser = FakeSerial(self.proto, self.root, clock=clock)
        self.client(ser, clock).connect(wait=5)
        self.assertEqual(ser.rx.state, "hello")
        clock.t += 30
        c2 = Client(ser, clock=clock, sleep=clock.sleep, host="desk")
        hello = c2.connect(wait=10)
        self.assertEqual(hello["op"], "hello")
        self.assertEqual(ser.rx.host, "desk")

    def test_app_opened_while_waiting(self):
        clock = Clock()
        ser = FakeSerial(self.proto, self.root, app_open=False, clock=clock)
        c = self.client(ser, clock)
        orig = ser.read

        def read(n=1):
            if clock.t > 108 and not ser.app_open:
                ser.open_app()
            return orig(n)
        ser.read = read
        hello = c.connect(wait=30)
        self.assertEqual(hello["op"], "hello")
        self.assertEqual(ser.rx.host, "laptop")


@unittest.skipUnless(PROTO.exists(), "not inside a FaleraOS checkout")
class TransferCommandTest(TransferTestBase):
    def write(self, name, data):
        p = Path(self.tmp) / "src"
        p.mkdir(exist_ok=True)
        (p / name).write_bytes(data)
        return str(p / name)

    def _run(self, argv, ser, inputs=(), interactive=False):
        link = FakeLink(ser)
        answers = [ser.rx.code if v == "CODE" else v for v in inputs]
        r = run_cli(argv, fake=link, inputs=answers, interactive=interactive)
        return r, link

    def test_send_end_to_end(self):
        ser = FakeSerial(self.proto, self.root)
        f1 = self.write("cat.rz565", rz565(40, 30))
        f2 = self.write("readme.mdz", odz(b"hi there\n"))
        r, link = self._run(["transfer", "send", f1, f2], ser, inputs=["CODE"])
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("2 file(s) sent", r.out)
        self.assertIn("cat.rz565 is in the Gallery", r.out)
        self.assertTrue(self.badge_file("documents/readme.mdz").exists())
        self.assertEqual(link.closed, 1)
        self.assertEqual(ser.rx.state, self.proto.WAITING)      # said bye

    def test_send_alias_with_code_flag(self):
        ser = FakeSerial(self.proto, self.root)
        f1 = self.write("a.rz565", rz565())
        r, _ = self._run(["send", "--code", ser.rx.code.lower(), f1], ser)
        self.assertEqual(r.rc, 0, r.out)

    def test_wrong_code_reprompts_when_interactive(self):
        ser = FakeSerial(self.proto, self.root)
        f1 = self.write("a.rz565", rz565())
        r, _ = self._run(["transfer", "send", f1], ser, inputs=["WRONG1", "CODE"],
                         interactive=True)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("wrong code, 4 tries left", r.out)

    def test_wrong_code_without_terminal_fails(self):
        ser = FakeSerial(self.proto, self.root)
        f1 = self.write("a.rz565", rz565())
        r, _ = self._run(["transfer", "send", f1], ser, inputs=["WRONG1"])
        self.assertEqual(r.rc, 1)
        self.assertIn("wrong code", r.out)
        self.assertFalse(self.badge_file("apps/gallery/assets/optimized/a.rz565").exists())

    def test_list_command(self):
        ser = FakeSerial(self.proto, self.root)
        d = self.badge_file("documents")
        d.mkdir(parents=True)
        (d / "x.mdz").write_bytes(odz())
        r, _ = self._run(["transfer", "list", "--code", ser.rx.code], ser)
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("x.mdz", r.out)

    def test_unsupported_file_never_touches_the_badge(self):
        f1 = self.write("a.exe", b"MZ")
        r = run_cli(["transfer", "send", f1], fake=None)
        self.assertNotEqual(r.rc, 0)
        self.assertEqual(r.links, [])
        self.assertIn("unsupported file type", r.out)

    def test_help_never_touches_the_badge(self):
        with self.assertRaises(SystemExit) as cm, \
                contextlib.redirect_stdout(io.StringIO()):
            run_cli(["transfer", "--help"], fake=None)
        self.assertEqual(cm.exception.code, 0)


if __name__ == "__main__":
    unittest.main()
