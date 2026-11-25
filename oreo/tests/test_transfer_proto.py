"""Host tests for the Transfer app (apps/transfer): the USB protocol
(src/proto.py), the non-blocking line reader (src/link.py) and the app's
screens (src/app.py) against stub FaleraOS modules.

The CLI side of the same protocol is tested end to end in
cli/tests/test_transfer.py.

    python3 -m unittest tests.test_transfer_proto -v
"""

import base64
import hashlib
import importlib
import json
import os
import shutil
import struct
import sys
import tempfile
import types
import unittest
import zlib
from collections import Counter
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "apps" / "transfer" / "src"


def load(name):
    spec = importlib.util.spec_from_file_location("transfer_%s_under_test" % name,
                                                  SRC / ("%s.py" % name))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


proto = load("proto")
link = load("link")


def rz565(w=4, h=3):
    raw = b"\x12\x34" * (w * h)
    return b"R5Z\x01" + struct.pack("<HHI", w, h, len(raw)) + zlib.compress(raw)


class Clock:
    def __init__(self):
        self.ms = 5000

    def __call__(self):
        return self.ms


class Wire:
    """A Receiver plus everything it sent, decoded."""

    def __init__(self, root, free=50 * 1024 * 1024, urandom=None):
        self.out = []
        self.clock = Clock()
        self.notified = []
        self.rx = proto.Receiver(self.out.append, root=root, clock=self.clock,
                                 free=lambda: free, urandom=urandom,
                                 notify=lambda *a: self.notified.append(a))

    def cmd(self, op, **kw):
        kw["op"] = op
        self.rx.feed(b"@OTH " + json.dumps(kw).encode())
        return self.last()

    def data(self, seq, blob):
        self.rx.feed(b"@OTD %d " % seq + base64.b64encode(blob))
        return self.last()

    def last(self):
        if not self.out:
            return None
        line = self.out[-1]
        assert line.startswith(proto.BADGE_PREFIX), line
        return json.loads(line[len(proto.BADGE_PREFIX):])

    def login(self):
        self.cmd("hello", v=proto.VERSION, host="laptop", client="test")
        return self.cmd("auth", code=self.rx.code)

    def put(self, name, blob, sha=None):
        r = self.cmd("put", name=name, size=len(blob),
                     sha256=sha or hashlib.sha256(blob).hexdigest())
        if r["op"] != "ready":
            return r
        for i in range(0, len(blob), proto.CHUNK):
            r = self.data(i // proto.CHUNK, blob[i:i + proto.CHUNK])
            if r["op"] == "error":
                return r
        return r


class CodeTest(unittest.TestCase):
    def test_codes_use_only_the_unambiguous_charset(self):
        for _ in range(200):
            code = proto.random_code()
            self.assertEqual(len(code), proto.CODE_LEN)
            self.assertTrue(set(code) <= set(proto.CODE_CHARSET))
        for ch in "0O1I":
            self.assertNotIn(ch, proto.CODE_CHARSET)

    def test_codes_come_from_os_urandom(self):
        with mock.patch.object(os, "urandom", side_effect=lambda n: bytes(range(n))):
            self.assertEqual(proto.random_code(), proto.CODE_CHARSET[:6])

    def test_no_fallback_without_a_secure_rng(self):
        with mock.patch.object(os, "urandom", side_effect=NotImplementedError):
            with self.assertRaises(NotImplementedError):
                proto.random_code()

    def test_characters_are_roughly_uniform(self):
        counts = Counter("".join(proto.random_code() for _ in range(4000)))
        expected = 4000 * 6 / len(proto.CODE_CHARSET)
        self.assertTrue(all(0.7 * expected < c < 1.3 * expected for c in counts.values()))

    def test_normalize_and_compare(self):
        self.assertEqual(proto.normalize_code(" ab3-k7q "), "AB3K7Q")
        self.assertTrue(proto.same_code("AB3K7Q", "AB3K7Q"))
        self.assertFalse(proto.same_code("AB3K7Q", "AB3K7R"))
        self.assertFalse(proto.same_code("AB3K7", "AB3K7Q"))

    def test_names_and_routes(self):
        self.assertEqual(proto.safe_name("../../boot.py"), "boot.py")
        self.assertEqual(proto.safe_name("C:\\x\\cat.rz565"), "cat.rz565")
        self.assertEqual(proto.safe_name(".hidden.md"), "")
        self.assertEqual(proto.safe_name("a.rz565.part"), "")
        self.assertEqual(len(proto.safe_name("x" * 100 + ".rz565")), 64)
        self.assertTrue(proto.safe_name("x" * 100 + ".rz565").endswith(".rz565"))
        self.assertEqual(proto.route_for("A.RZ565"), (proto.GALLERY_DIR, "image"))
        self.assertEqual(proto.route_for("v.rv565"), (proto.GALLERY_DIR, "video"))
        self.assertEqual(proto.route_for("n.mdz"), (proto.DOCS_DIR, "document"))
        self.assertIsNone(proto.route_for("boot.py")[0])


class ReceiverTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp)
        self.root = self.tmp + "/"
        self.w = Wire(self.root)

    def gallery(self):
        return Path(self.root) / proto.GALLERY_DIR

    def test_announces_while_waiting(self):
        self.w.rx.tick()
        self.assertEqual(self.w.last()["op"], "announce")
        n = len(self.w.out)
        self.w.clock.ms += 100
        self.w.rx.tick()
        self.assertEqual(len(self.w.out), n)
        self.w.clock.ms += proto.ANNOUNCE_MS
        self.w.rx.tick()
        self.assertEqual(len(self.w.out), n + 1)

    def test_announces_while_a_session_is_idle_but_not_mid_file(self):
        # The CLI says hello only after an announce, so a session left by a
        # killed CLI must keep announcing or nobody could take it over.
        w = self.w
        w.cmd("hello", v=proto.VERSION, host="old", id="1")
        n = len(w.out)
        w.clock.ms += proto.ANNOUNCE_MS - 1
        w.rx.tick()
        self.assertEqual(len(w.out), n)                    # still fresh
        w.clock.ms += 1
        w.rx.tick()
        self.assertEqual(w.last()["op"], "announce")
        n = len(w.out)
        w.clock.ms += 100
        w.rx.tick()
        self.assertEqual(len(w.out), n)                    # rate-limited
        r = w.cmd("hello", v=proto.VERSION, host="new", id="2")
        self.assertEqual((r["op"], w.rx.host), ("hello", "new"))
        # No announces while a file is on its way.
        w.cmd("auth", code=w.rx.code)
        blob = rz565()
        self.assertEqual(w.cmd("put", name="a.rz565", size=len(blob),
                               sha256=hashlib.sha256(blob).hexdigest())["op"], "ready")
        n = len(w.out)
        w.clock.ms += proto.ANNOUNCE_MS * 3
        w.rx.tick()
        self.assertEqual(len(w.out), n)

    def test_hello_reports_limits_and_version_mismatch(self):
        r = self.w.cmd("hello", v=proto.VERSION, host="lap/top", id="42")
        self.assertEqual((r["op"], r["id"], r["chunk"]), ("hello", "42", proto.CHUNK))
        self.assertEqual(self.w.rx.host, "top")
        r = self.w.cmd("hello", v=99)
        self.assertEqual((r["op"], r["code"]), ("error", "version"))

    def test_put_needs_hello_and_code(self):
        self.assertEqual(self.w.cmd("auth", code="X")["code"], "hello")
        self.w.cmd("hello", v=proto.VERSION)
        r = self.w.cmd("put", name="a.rz565", size=10, sha256="0" * 64)
        self.assertEqual(r["code"], "need_auth")
        self.assertEqual(self.w.cmd("list")["code"], "need_auth")

    def test_receive_photo(self):
        self.assertEqual(self.w.login()["op"], "ok")
        blob = rz565(50, 40)
        r = self.w.put("../cat.rz565", blob)
        self.assertEqual(r["op"], "done")
        self.assertEqual(r["path"], "/" + proto.GALLERY_DIR + "/cat.rz565")
        self.assertEqual((self.gallery() / "cat.rz565").read_bytes(), blob)
        self.assertEqual(os.listdir(self.gallery()), ["cat.rz565"])
        self.assertEqual(self.w.notified, [("image", "cat.rz565", len(blob))])
        self.assertTrue(self.w.rx.log[-1][0])
        self.assertEqual(self.w.rx.state, proto.AUTHED)
        # Same name again replaces it.
        self.assertTrue(self.w.put("cat.rz565", rz565(10, 10))["replaced"])

    def test_multi_chunk_acks(self):
        self.w.login()
        raw = b"R5" + struct.pack("<HH", 100, 50) + os.urandom(100 * 50 * 2)
        self.w.put("n.r565", raw)
        acks = [json.loads(o[5:]) for o in self.w.out if '"ack"' in o]
        self.assertEqual([a["seq"] for a in acks], list(range(len(acks))))
        self.assertEqual(acks[-1]["got"], len(raw))
        self.assertGreater(len(acks), 3)

    def test_hash_mismatch_drops_the_file(self):
        self.w.login()
        r = self.w.put("a.rz565", rz565(), sha="ab" * 32)
        self.assertEqual(r["code"], "hash")
        self.assertEqual(os.listdir(self.gallery()), [])
        self.assertEqual(self.w.rx.state, proto.AUTHED)

    def test_invalid_header_is_refused(self):
        self.w.login()
        r = self.w.put("a.rz565", b"R5Z\x01" + b"\xff" * 20)
        self.assertEqual(r["code"], "invalid")
        self.assertEqual(os.listdir(self.gallery()), [])

    def test_out_of_order_and_damaged_chunks(self):
        self.w.login()
        blob = b"R5" + struct.pack("<HH", 80, 80) + bytes(80 * 80 * 2)
        self.w.cmd("put", name="a.r565", size=len(blob),
                   sha256=hashlib.sha256(blob).hexdigest())
        self.assertEqual(self.w.data(1, blob[:10])["code"], "seq")
        self.assertEqual(os.listdir(self.gallery()), [])
        # Chunks still in flight after the error are dropped quietly.
        n = len(self.w.out)
        self.w.data(2, blob[:10])
        self.assertEqual(len(self.w.out), n)
        self.w.cmd("put", name="a.r565", size=len(blob),
                   sha256=hashlib.sha256(blob).hexdigest())
        self.w.rx.feed(b"@OTD 0 !!!not base64!!!")
        self.assertIn(self.w.last()["code"], ("data",))
        self.w.cmd("put", name="a.r565", size=len(blob),
                   sha256=hashlib.sha256(blob).hexdigest())
        self.w.rx.feed(b"@OTD 0")
        self.assertEqual(self.w.last()["code"], "data")
        self.w.cmd("put", name="a.r565", size=4, sha256="0" * 64)
        self.assertEqual(self.w.data(0, b"12345")["code"], "data")   # too long

    def test_rejections(self):
        self.w.login()
        c = self.w.cmd
        self.assertEqual(c("put", name="boot.py", size=3, sha256="0" * 64)["code"], "type")
        self.assertEqual(c("put", name="", size=3, sha256="0" * 64)["code"], "name")
        self.assertEqual(c("put", name="a.md", size=-1, sha256="0" * 64)["code"], "size")
        self.assertEqual(c("put", name="a.md", size=3, sha256="x")["code"], "sha")
        self.assertEqual(c("put", name="a.md", size=proto.MAX_FILE + 1,
                           sha256="0" * 64)["code"], "too_big")
        self.assertEqual(c("frobnicate")["code"], "proto")
        self.w.rx.feed(b"@OTH {not json")
        self.assertEqual(self.w.last()["code"], "proto")

    def test_no_space(self):
        w = Wire(self.root, free=proto.RESERVE + 100)
        w.login()
        r = w.cmd("put", name="a.md", size=200, sha256="0" * 64)
        self.assertEqual(r["code"], "no_space")

    def test_wrong_codes_lock_and_rotate(self):
        self.w.cmd("hello", v=proto.VERSION)
        first = self.w.rx.code
        for left in range(proto.MAX_TRIES - 1, 0, -1):
            self.assertEqual(self.w.cmd("auth", code="ZZZZZZ")["left"], left)
        r = self.w.cmd("auth", code="ZZZZZZ")
        self.assertEqual(r["code"], "locked")
        self.assertNotEqual(self.w.rx.code, first)
        # Locked even for the right code, also after a fresh hello.
        self.w.cmd("hello", v=proto.VERSION)
        self.assertEqual(self.w.cmd("auth", code=self.w.rx.code)["code"], "locked")
        self.w.clock.ms += proto.LOCK_MS + 1
        self.assertEqual(self.w.cmd("auth", code=self.w.rx.code)["op"], "ok")

    def test_code_rotates_per_session(self):
        self.w.login()
        old = self.w.rx.code
        self.assertEqual(self.w.cmd("bye")["op"], "bye")
        self.assertEqual(self.w.rx.state, proto.WAITING)
        self.assertNotEqual(self.w.rx.code, old)
        # The old code no longer works.
        self.w.cmd("hello", v=proto.VERSION)
        if old != self.w.rx.code:
            self.assertEqual(self.w.cmd("auth", code=old)["code"], "auth")

    def test_cancel_on_badge_mid_file(self):
        self.w.login()
        blob = b"R5" + struct.pack("<HH", 80, 80) + bytes(80 * 80 * 2)
        self.w.cmd("put", name="a.r565", size=len(blob),
                   sha256=hashlib.sha256(blob).hexdigest())
        self.w.data(0, blob[:proto.CHUNK])
        self.assertTrue(os.path.exists(self.gallery() / "a.r565.part"))
        self.w.rx.cancel()
        self.assertEqual(self.w.last()["code"], "cancelled")
        self.assertEqual(os.listdir(self.gallery()), [])
        self.assertFalse(self.w.rx.active())
        # Late chunks from the computer change nothing.
        self.w.data(1, blob[proto.CHUNK:2 * proto.CHUNK])
        self.assertEqual(os.listdir(self.gallery()), [])

    def test_quiet_computer_times_out(self):
        self.w.login()
        blob = b"R5" + struct.pack("<HH", 80, 80) + bytes(80 * 80 * 2)
        self.w.cmd("put", name="a.r565", size=len(blob),
                   sha256=hashlib.sha256(blob).hexdigest())
        self.w.clock.ms += proto.IDLE_PUT_MS - 1
        self.w.rx.tick()
        self.assertTrue(self.w.rx.active())
        self.w.clock.ms += 2
        self.w.rx.tick()
        self.assertEqual(self.w.last()["code"], "timeout")
        self.assertFalse(self.w.rx.active())
        self.assertEqual(os.listdir(self.gallery()), [])

    def test_close_ends_session(self):
        self.w.login()
        self.w.rx.close()
        self.assertEqual(self.w.last()["code"], "closed")
        n = len(self.w.out)
        self.w.rx.close()                 # nothing to end twice
        self.assertEqual(len(self.w.out), n)

    def test_abort_list_delete(self):
        self.w.login()
        self.w.put("a.rz565", rz565())
        self.w.put("d.mdz", b"ODZ\x01" + struct.pack("<I", 2) + zlib.compress(b"hi"))
        self.w.cmd("put", name="b.rz565", size=100, sha256="0" * 64)
        self.assertEqual(self.w.cmd("abort")["op"], "aborted")
        files = self.w.cmd("list")["files"]
        self.assertEqual(sorted(f["name"] for f in files), ["a.rz565", "d.mdz"])
        self.assertEqual(self.w.cmd("del", name="a.rz565")["op"], "deleted")
        self.assertEqual(self.w.cmd("del", name="a.rz565")["code"], "missing")
        self.assertEqual(self.w.cmd("del", name="../main.py")["code"], "name")
        self.assertEqual(self.w.cmd("del", name="sub/d.mdz")["code"], "name")

    def test_noise_is_ignored(self):
        n = len(self.w.out)
        for junk in (b"", b"[net] link up", b"@OTB {\"op\":\"hello\"}", b"\x00\xff"):
            self.w.rx.feed(junk)
        self.assertEqual(len(self.w.out), n)
        # A log line glued in front of a command still finds the command.
        self.w.rx.feed(b"[net] x@OTH " + json.dumps({"op": "ping"}).encode())
        self.assertEqual(self.w.last()["op"], "pong")


class FakeStream:
    def __init__(self, data=b""):
        self.data = bytearray(data)

    def readinto(self, buf):
        if not self.data:
            raise AssertionError("readinto would block")
        buf[0] = self.data.pop(0)
        return 1


class FakePoller:
    def __init__(self, stream):
        self.stream = stream

    def ipoll(self, timeout):
        if self.stream.data:
            yield (self.stream, 1)


class LinkTest(unittest.TestCase):
    def make(self, data=b"", max_line=50):
        s = FakeStream(data)
        out = []
        return link.UsbLink(max_line, stream=s, poller=FakePoller(s),
                            writer=out.append), s, out

    def test_lines_and_partial_lines(self):
        l, s, out = self.make(b"one\r\ntwo\nthr")
        self.assertEqual(l.read_lines(), [b"one", b"two"])
        s.data += b"ee\n"
        self.assertEqual(l.read_lines(), [b"three"])
        self.assertEqual(l.read_lines(), [])           # never blocks
        l.write_line("@OTB {}")
        self.assertEqual(out, ["@OTB {}\n"])

    def test_long_line_dropped(self):
        l, s, _ = self.make(b"x" * 200 + b"\nok\n", max_line=50)
        self.assertEqual(l.read_lines(), [None, b"ok"])

    def test_drain_and_max_lines(self):
        l, s, _ = self.make(b"stale\nstale\n")
        self.assertEqual(l.drain(), 12)
        s.data += b"a\nb\nc\n"
        self.assertEqual(l.read_lines(max_lines=2), [b"a", b"b"])
        self.assertEqual(l.read_lines(), [b"c"])

    def test_kbd_intr_off_while_open(self):
        calls = []
        fake_mp = types.SimpleNamespace(kbd_intr=calls.append)
        with mock.patch.object(link, "micropython", fake_mp):
            l, _, _ = self.make()
            l.open()
            l.close()
        self.assertEqual(calls, [-1, 3])


# ── the app's screens ───────────────────────────────────────────────────

class FakeDisplay:
    def __init__(self):
        self.texts = []

    def clear(self, c):
        self.texts = []

    def rect(self, *a, **k):
        pass

    def text(self, s, x, y, color, scale=1):
        assert -8 <= x and x + len(s) * 8 * scale <= 320 + 8, (s, x, scale)
        self.texts.append(s)


class FakeProbe:
    """Stands in for oreoOS.usbhost.Probe. Reads the hardware on every
    poll while reads_left is None; otherwise only reads_left more times."""

    def __init__(self, state):
        self.state = state
        self.read = False
        self.changed = False
        self.reads_left = None

    def poll(self):
        self.read = self.reads_left is None or self.reads_left > 0
        if self.reads_left:
            self.reads_left -= 1
        elif self.reads_left == 0:
            self.read = False
        return self.state


class FakeOS:
    def __init__(self):
        self.display = FakeDisplay()
        self.quit_called = 0
        self._power = types.SimpleNamespace(note_event=lambda: None)

    def quit(self):
        self.quit_called += 1


class AppTest(unittest.TestCase):
    def setUp(self):
        api = types.ModuleType("oreoOS.api")
        api.SCREEN_W, api.SCREEN_H = 320, 240
        for i, n in enumerate(("BTN_HOME", "BTN_A", "BTN_B", "BTN_C", "BTN_UP",
                               "BTN_DOWN", "BTN_LEFT", "BTN_RIGHT")):
            setattr(api, n, i)
        api.rgb = lambda r, g, b: (r, g, b)
        theme = types.ModuleType("oreoOS.theme")
        theme.__getattr__ = lambda name: name
        widgets = types.ModuleType("oreoOS.widgets")
        widgets.HEADER_H, widgets.HINT_H = 28, 16
        widgets.draw_header = widgets.draw_hint = lambda *a: None
        notifications = types.ModuleType("oreoOS.notifications")
        self.pushed = []
        notifications.push = lambda *a, **k: self.pushed.append(a)

        class App:
            def on_enter(self, os_):
                self.os = os_
        pkg = types.ModuleType("oreoOS")
        pkg.App = App
        pkg.api, pkg.theme, pkg.widgets = api, theme, widgets
        pkg.notifications = notifications
        tpkg = types.ModuleType("transfer_app_pkg")
        tpkg.__path__ = [str(SRC)]
        mods = {"oreoOS": pkg, "oreoOS.api": api, "oreoOS.theme": theme,
                "oreoOS.widgets": widgets, "oreoOS.notifications": notifications,
                "transfer_app_pkg": tpkg}
        patcher = mock.patch.dict(sys.modules, mods)
        patcher.start()
        self.addCleanup(patcher.stop)
        for k in [k for k in sys.modules if k.startswith("transfer_app_pkg.")]:
            del sys.modules[k]
        self.mod = importlib.import_module("transfer_app_pkg.app")
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp)
        self.stream = FakeStream(b"stale bytes\n")
        self.sent = []
        mod_proto = sys.modules["transfer_app_pkg.proto"]
        stream, sent, tmp = self.stream, self.sent, self.tmp

        def make_link(max_line):
            return link.UsbLink(max_line, stream=stream, poller=FakePoller(stream),
                                writer=sent.append)
        self.mod.UsbLink = make_link
        self.mod.time = types.SimpleNamespace(
            ticks_ms=lambda: 1000, ticks_diff=lambda a, b: a - b,
            ticks_add=lambda a, b: a + b)
        real = mod_proto.Receiver

        def receiver(out, **kw):
            return real(out, root=tmp + "/", free=lambda: 10 ** 8, **kw)
        self.mod.proto = types.SimpleNamespace(**{k: getattr(mod_proto, k)
                                                  for k in dir(mod_proto)
                                                  if not k.startswith("__")})
        self.mod.proto.Receiver = receiver
        self.os = FakeOS()
        self.app = self.mod.App()
        self.app.on_enter(self.os)
        self.proto = mod_proto

    def frame(self):
        self.app.update(0.03)
        self.app._dirty = True
        self.app.draw(self.os.display)
        return " | ".join(self.os.display.texts)

    def say(self, op, **kw):
        kw["op"] = op
        self.stream.data += b"@OTH " + json.dumps(kw).encode() + b"\n"

    def test_full_session_on_screen(self):
        self.assertEqual(self.stream.data, b"")          # stale input drained
        screen = self.frame()
        self.assertIn(self.app._rx.code, screen)
        self.assertIn("falera send <files>", screen)
        self.assertIn("Waiting for a computer", screen)   # no usbhost here
        self.assertFalse(self.app.realtime_mode())
        self.say("hello", v=self.proto.VERSION, host="studio-mac")
        screen = self.frame()
        self.assertIn("Connected: studio-mac", screen)
        self.assertTrue(self.app.realtime_mode())
        self.assertTrue(self.app.BLOCK_IDLE)
        self.say("auth", code="ZZZZZZ")
        self.assertIn("4 tries left", self.frame())
        self.say("auth", code=self.app._rx.code)
        self.assertIn("Ready", self.frame())
        blob = b"R5" + struct.pack("<HH", 80, 80) + bytes(80 * 80 * 2)
        self.say("put", name="pic.r565", size=len(blob),
                 sha256=hashlib.sha256(blob).hexdigest())
        self.stream.data += b"@OTD 0 " + base64.b64encode(blob[:proto.CHUNK]) + b"\n"
        screen = self.frame()
        self.assertIn("Receiving pic.r565", screen)
        for seq in range(1, (len(blob) + proto.CHUNK - 1) // proto.CHUNK):
            piece = blob[seq * proto.CHUNK:(seq + 1) * proto.CHUNK]
            self.stream.data += b"@OTD %d " % seq + base64.b64encode(piece) + b"\n"
        for _ in range(10):
            screen = self.frame()
        self.assertIn("pic.r565 -> Gallery", screen)
        self.assertEqual(self.pushed[0][0], "file")
        # B cancels the session, a second B leaves.
        self.app.on_button_press(2)
        self.assertFalse(self.app._rx.active())
        self.assertEqual(self.os.quit_called, 0)
        self.app.on_button_press(2)
        self.assertEqual(self.os.quit_called, 1)

    def test_locked_screen_and_new_code(self):
        old = self.app._rx.code
        self.app.on_button_press(7)                   # RIGHT: new code
        self.assertNotEqual(self.app._rx.code, old)
        self.say("hello", v=self.proto.VERSION)
        for _ in range(self.proto.MAX_TRIES):
            self.say("auth", code="ZZZZZZ")
        self.assertIn("TOO MANY WRONG CODES", self.frame())

    def _probe(self, state):
        probe = FakeProbe(state)
        self.app._usb = probe
        return probe

    def test_usb_host_connected_screen(self):
        probe = self._probe(True)
        screen = self.frame()
        self.assertIn("Computer connected over USB", screen)
        self.assertNotIn("Waiting for a computer", screen)
        self.assertIn("falera send <files>", screen)
        self.assertIn(self.app._rx.code, screen)         # still the code
        probe.state = False                               # cable pulled
        screen = self.frame()
        self.assertIn("Waiting for a computer", screen)
        self.assertNotIn("Computer connected over USB", screen)

    def test_unplug_ends_a_session(self):
        probe = self._probe(True)
        self.say("hello", v=self.proto.VERSION, host="studio-mac")
        self.frame()
        self.assertTrue(self.app._rx.active())
        probe.state = False
        probe.reads_left = 1
        self.frame()                                      # one reading: kept
        self.assertTrue(self.app._rx.active())
        self.frame()                                      # cached, no reading
        self.assertTrue(self.app._rx.active())
        probe.reads_left = 1
        self.frame()                                      # second reading
        self.assertFalse(self.app._rx.active())
        self.assertIn("unplugged", self.app._rx.log[-1][1])
        self.assertIn("Waiting for a computer", self.frame())

    def test_unknown_usb_keeps_session(self):
        self._probe(None)
        self.say("hello", v=self.proto.VERSION)
        for _ in range(5):
            self.frame()
        self.assertTrue(self.app._rx.active())

    def test_exit_ends_session(self):
        self.say("hello", v=self.proto.VERSION)
        self.frame()
        self.app.on_exit()
        self.assertIn('"closed"', self.sent[-1])


if __name__ == "__main__":
    unittest.main()
