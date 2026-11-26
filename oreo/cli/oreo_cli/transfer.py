"""`falera transfer`: send files to the badge's Transfer app over USB.

Unlike `falera add`/`falera push`, this never stops FaleraOS or uses the raw
REPL. The Transfer app on the badge reads the USB serial stream while it
is open; this module speaks its line protocol (apps/transfer/src/proto.py
is the badge side, and cli/tests/test_transfer.py runs the two together):

  computer -> badge   @OTH {json}            hello, auth, put, list, del, bye
                      @OTD <seq> <base64>    a chunk of the file being sent
  badge -> computer   @OTB {json}            replies and events

The person types the six-character code the badge shows, which proves
they can see the badge they are sending to. Every file is converted
first (the same conversion as `falera add`), sent in chunks with a few in
flight, checked on the badge against its SHA-256 and its format header,
and only then renamed into place.

If the Transfer app is not open the command waits for it (the app
announces itself when it opens) and otherwise explains; it never falls
back to the raw REPL.

Nothing is written to the badge until the app has announced itself.
While the app is closed nothing in FaleraOS reads the USB serial stream,
and MicroPython keeps unread bytes in a 260-byte ring buffer (259 usable)
that it checks for Ctrl-C only as each byte enters it. A few unanswered
hellos would fill it, and then the Ctrl-C that `falera add`, `falera shell`
and mpremote send would never arrive until the badge was reset.
"""

import base64
import hashlib
import json
import os
import socket
import time
from pathlib import Path

from . import __version__, media
from .commands import MediaOptions, command, prepare_media
from .errors import Cancelled, OreoError
from .ui import esc, human

PROTOCOL = 1
HOST_PREFIX = b"@OTH "
DATA_PREFIX = b"@OTD "
BADGE_PREFIX = b"@OTB "
CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # same as the badge
CODE_LEN = 6
CHUNK = 3072
WINDOW = 4                   # chunks in flight before waiting for an ack

# Files already in a format FaleraOS reads: sent as they are.
READY_EXTS = {".rz565": "image", ".r565": "image", ".rv565": "video",
              ".mdz": "document", ".txtz": "document"}

ANNOUNCE_WAIT_S = 2.5        # the open app announces every 2 s while it waits
HELLO_RESEND_S = 1.0         # least time between two hellos, each sent only on an announce
READY_S = 10.0
ACK_S = 15.0
DONE_S = 30.0

# Badge errors that end the session; the others only fail one file.
FATAL = ("cancelled", "closed", "timeout", "need_auth", "hello", "proto",
         "version", "locked")

OPEN_HINT = ("on the badge open Transfer (apps drawer -> Tools -> Transfer), "
             "then run this again")


class TransferError(OreoError):
    """The badge answered with an error (or not at all)."""

    def __init__(self, message, code="", hint=None, reply=None):
        super().__init__(message, hint=hint)
        self.badge_code = code
        self.reply = reply or {}

    @property
    def fatal(self):
        return self.badge_code in FATAL or self.badge_code == "no_answer"


def _from_reply(reply, what):
    code = reply.get("code", "")
    msg = reply.get("msg") or code or "error"
    hints = {
        "cancelled": "the session was cancelled on the badge; run the command again",
        "closed": "the Transfer app was closed; open it and run the command again",
        "timeout": "the badge waited too long; run the command again",
        "locked": "wait %ss; the badge shows a new code after that" % reply.get("retry_s", "?"),
        "version": "update falera-cli and FaleraOS so they speak the same protocol",
        "no_space": "free space on the badge first (`falera transfer list`, `falera transfer rm`)",
        "too_big": "shorten the video (--seconds) or shrink it (--width/--height)",
    }
    return TransferError("%s: %s" % (what, msg), code=code, hint=hints.get(code), reply=reply)


def _hostname():
    try:
        name = socket.gethostname().split(".")[0]
    except Exception:
        name = ""
    return name[:24] or "computer"


class Client:
    """The computer's end of a Transfer session on an open serial port.

    `ser` needs write(), read(n) and in_waiting (pyserial, or the test
    fake). `clock`/`sleep` are injectable so timeouts can be tested.
    `check`, when given, is called while waiting for the badge and may
    raise (the full-screen UI's Cancel button raises Cancelled there)."""

    def __init__(self, ser, clock=time.monotonic, sleep=time.sleep, host=None,
                 window=WINDOW, check=None):
        self.ser = ser
        self.check = check
        self.clock = clock
        self.sleep = sleep
        self.host = host or _hostname()
        self.window = max(1, window)
        self._rx = bytearray()
        self.badge = {}              # the badge's hello reply
        self.noise = 0               # non-protocol lines seen (log output)
        self._queue = []             # parsed messages not handed out yet

    # ── wire ────────────────────────────────────────────────────────
    def _write(self, data):
        try:
            self.ser.write(data)
            flush = getattr(self.ser, "flush", None)
            if flush is not None:
                flush()
        except Exception as e:
            # pyserial's SerialTimeoutException: the badge stopped reading
            # (the Transfer app closed, or FaleraOS is stuck).
            if "Timeout" not in e.__class__.__name__:
                raise
            raise TransferError("the badge stopped reading the USB port", code="no_answer",
                                hint=OPEN_HINT)

    def send(self, op, **fields):
        fields["op"] = op
        self._write(HOST_PREFIX + json.dumps(fields, separators=(",", ":")).encode() + b"\n")

    def send_chunk(self, seq, piece):
        self._write(DATA_PREFIX + str(seq).encode() + b" " + base64.b64encode(piece) + b"\n")

    def _waiting(self):
        n = getattr(self.ser, "in_waiting", None)
        if n is None:
            n = self.ser.inWaiting()
        return n

    def _messages(self):
        """Badge messages already received, in order."""
        out = []
        while True:
            i = self._rx.find(b"\n")
            if i < 0:
                break
            line = bytes(self._rx[:i]).rstrip(b"\r")
            del self._rx[:i + 1]
            j = line.find(BADGE_PREFIX)
            if j < 0:
                if line.strip():
                    self.noise += 1
                continue
            try:
                msg = json.loads(line[j + len(BADGE_PREFIX):].decode("utf-8"))
            except ValueError:
                self.noise += 1      # a log line spliced into ours
                continue
            if isinstance(msg, dict) and isinstance(msg.get("op"), str):
                out.append(msg)
        return out

    def recv(self, timeout, ops=None):
        """Next badge message whose op is in `ops` (all when None), or None
        after `timeout` seconds. Errors are always returned."""
        queue = self._queue
        deadline = self.clock() + timeout
        while True:
            while queue:
                msg = queue.pop(0)
                if ops is None or msg["op"] in ops or msg["op"] == "error":
                    return msg
            if self.check is not None:
                self.check()
            n = self._waiting()
            if n:
                self._rx += self.ser.read(n)
                queue.extend(self._messages())
                continue
            if self.clock() >= deadline:
                return None
            data = self.ser.read(1)          # waits up to the port timeout
            if data:
                self._rx += data
                queue.extend(self._messages())
            else:
                self.sleep(0.005)

    # ── session ─────────────────────────────────────────────────────
    def connect(self, wait=60.0, on_wait=None):
        """Wait for the Transfer app to announce itself, then say hello.
        Returns its hello reply.

        A hello is sent only in answer to an announce, which proves the app
        is reading the port; while the app is closed nothing is written, so
        the badge's stdin buffer never fills and a later Ctrl-C (`falera add`,
        `falera shell`, mpremote) still gets through."""
        hello_id = os.urandom(4).hex()
        start = self.clock()
        deadline = start + max(wait, ANNOUNCE_WAIT_S)
        last = None
        told = False

        def hello():
            nonlocal last
            try:
                self.send("hello", v=PROTOCOL, host=self.host,
                          client="falera-cli " + __version__, id=hello_id)
            except TransferError:       # write timeout: the app stopped reading
                pass
            last = self.clock()

        while self.clock() < deadline:
            msg = self.recv(0.25, ops=("hello", "announce"))
            now = self.clock()
            if msg is not None:
                op = msg["op"]
                if op == "hello" and msg.get("id") in (hello_id, None):
                    self.badge = msg
                    return msg
                if op == "error" and msg.get("code") == "version":
                    raise TransferError(
                        "the badge speaks Transfer protocol v%s, this falera-cli v%d"
                        % (msg.get("v"), PROTOCOL), code="version",
                        hint="update falera-cli and FaleraOS to matching versions")
                if op == "announce" and (last is None or now - last >= HELLO_RESEND_S):
                    hello()          # the app is open and reading now
                continue
            if not told and last is None and now - start >= ANNOUNCE_WAIT_S:
                told = True
                if on_wait is not None:
                    on_wait()
        raise TransferError("the Transfer app is not open on the badge",
                            code="no_answer", hint=OPEN_HINT)

    def auth(self, code):
        """Returns the badge's reply: op 'ok' or an error (auth, locked)."""
        self.send("auth", code=code)
        msg = self.recv(READY_S, ops=("ok",))
        if msg is None:
            raise TransferError("the badge did not answer the code", code="no_answer",
                                hint=OPEN_HINT)
        return msg

    def put(self, name, blob, progress=None):
        """Send one file; returns the badge's 'done' reply."""
        size = len(blob)
        self.send("put", name=name, size=size, sha256=hashlib.sha256(blob).hexdigest())
        msg = self.recv(READY_S, ops=("ready",))
        if msg is None:
            raise TransferError("%s: the badge did not answer" % name, code="no_answer")
        if msg["op"] == "error":
            raise _from_reply(msg, name)
        chunk = min(int(msg.get("chunk") or CHUNK), CHUNK)
        count = (size + chunk - 1) // chunk
        sent = 0
        acked = -1
        try:
            while acked < count - 1:
                while sent < count and sent - acked - 1 < self.window:
                    self.send_chunk(sent, blob[sent * chunk:(sent + 1) * chunk])
                    sent += 1
                msg = self.recv(ACK_S, ops=("ack",))
                if msg is None:
                    raise TransferError("%s: the badge stopped answering" % name,
                                        code="no_answer", hint=OPEN_HINT)
                if msg["op"] == "error":
                    raise _from_reply(msg, name)
                acked = int(msg.get("seq", acked))
                if progress is not None:
                    progress(int(msg.get("got", 0)))
            msg = self.recv(DONE_S, ops=("done",))
        except (KeyboardInterrupt, Cancelled):
            self.abort()
            raise
        if msg is None:
            raise TransferError("%s: no confirmation from the badge" % name, code="no_answer")
        if msg["op"] == "error":
            raise _from_reply(msg, name)
        return msg

    def abort(self):
        try:
            self.send("abort")
        except Exception:
            pass

    def list(self):
        self.send("list")
        msg = self.recv(READY_S, ops=("list",))
        if msg is None:
            raise TransferError("the badge did not answer", code="no_answer", hint=OPEN_HINT)
        if msg["op"] == "error":
            raise _from_reply(msg, "list")
        return msg

    def delete(self, name):
        self.send("del", name=name)
        msg = self.recv(READY_S, ops=("deleted",))
        if msg is None:
            raise TransferError("the badge did not answer", code="no_answer", hint=OPEN_HINT)
        if msg["op"] == "error":
            raise _from_reply(msg, name)
        return msg

    def bye(self):
        try:
            self.send("bye")
            self.recv(1.0, ops=("bye",))
        except Exception:
            pass


# ── the command ──────────────────────────────────────────────────────

def _common_arguments(p):
    p.add_argument("--code", help="the code shown on the badge (otherwise asked)")
    p.add_argument("--wait", type=float, default=60.0,
                   help="seconds to wait for the Transfer app (default 60)")
    p.add_argument("--kind", choices=("image", "video", "document"), help="override detection")
    p.add_argument("--seconds", type=float, default=10.0, help="video length (default 10)")
    p.add_argument("--photo-max", type=int, default=240, help="longest photo side (default 240)")


def add_arguments(p):
    """Arguments for `falera transfer`."""
    p.add_argument("action", nargs="?", default="send", choices=("send", "list", "rm"),
                   help="send files (default), list what is on the badge, or remove one")
    p.add_argument("files", nargs="*", metavar="file",
                   help="files to send (send) or names to remove (rm)")
    _common_arguments(p)


def add_send_arguments(p):
    """Arguments for `falera send` (the same as `falera transfer send`)."""
    p.add_argument("files", nargs="+", metavar="file")
    _common_arguments(p)


def prepare(ui, files, args):
    """[(kind, name, blob)] in the formats FaleraOS reads, before the badge
    is touched. Files already converted are sent as they are."""
    ready, convert = [], []
    for f in files:
        ext = Path(f).suffix.lower()
        if ext in READY_EXTS:
            p = Path(f)
            if not p.is_file():
                raise OreoError("%s: no such file" % f)
            blob = p.read_bytes()
            kind = READY_EXTS[ext]
            if ext != ".r565":
                media.validate(blob, kind)
            ready.append((kind, p.name, blob))
        else:
            convert.append(f)
    opts = MediaOptions(kind=getattr(args, "kind", None),
                        seconds=getattr(args, "seconds", 10.0),
                        photo_max=getattr(args, "photo_max", 240))
    return ready + (prepare_media(ui, convert, opts) if convert else [])


def _open(ctx):
    port = ctx.port()
    link = ctx.link(port)
    link.open()
    ser = link.t.serial
    for attr, value in (("timeout", 0.05), ("write_timeout", 10)):
        try:
            setattr(ser, attr, value)
        except Exception:
            pass
    return port, link, ser


def _ask_code(ui, given):
    if given:
        return given
    code = ui.ask("Code shown on the badge")
    if not code:
        raise Cancelled("no code given (pass --code ABC123 when there is no terminal)")
    return code


def _login(ctx, client):
    ui = ctx.ui
    code = _ask_code(ui, ctx.args.code)
    while True:
        r = client.auth(code)
        if r["op"] == "ok":
            ui.ok("code accepted")
            return
        if r.get("code") == "auth":
            left = r.get("left", 0)
            if ctx.args.code or not ui.interactive or left <= 0:
                raise TransferError("wrong code", code="auth",
                                    hint="type the code exactly as the badge shows it")
            ui.warn("wrong code, %d %s left" % (left, "try" if left == 1 else "tries"))
            code = _ask_code(ui, None)
            continue
        raise _from_reply(r, "code")


def _session(ctx, body):
    """Open the port, wait for the Transfer app, check the code, run body."""
    ui = ctx.ui
    port, link, ser = _open(ctx)
    client = Client(ser, check=getattr(ctx, "check_cancel", None))
    try:
        with ui.status("looking for the Transfer app on %s" % esc(port)):
            hello = client.connect(
                ctx.args.wait,
                on_wait=lambda: ui.step("open [accent]Transfer[/] on the badge "
                                        "(apps drawer -> Tools -> Transfer); waiting up "
                                        "to %ds" % ctx.args.wait))
        ui.ok("Transfer is open on the badge%s, %s free"
              % ((" (FaleraOS %s)" % esc(hello["os"])) if hello.get("os") else "",
                 human(hello.get("free"))))
        _login(ctx, client)
        try:
            return body(client, hello)
        finally:
            client.bye()
    except (KeyboardInterrupt, Cancelled):
        client.abort()
        client.bye()
        raise
    finally:
        link.close()       # FaleraOS keeps running: no reset, no raw REPL


def send_files(ctx, client, hello, prepared):
    ui = ctx.ui
    total = sum(len(b) for _, _, b in prepared)
    free = int(hello.get("free") or 0)
    reserve = int(hello.get("reserve") or media.DEFAULT_RESERVE)
    if free and total + reserve > free:
        ui.warn("%s to send, %s free on the badge; some files may not fit"
                % (human(total), human(free)))
    failed = []
    for kind, name, blob in prepared:
        try:
            with ui.progress(esc(name), total=len(blob)) as update:
                r = client.put(name, blob, progress=update)
        except TransferError as e:
            if e.fatal:
                raise
            failed.append(name)
            ui.error(e.message, hint=e.hint)
            continue
        app = "Gallery" if kind in ("image", "video") else "Reader"
        ui.ok("%s is in the %s (%s, SHA-256 checked%s)"
              % (esc(name), app, esc(r.get("path") or ""),
                 ", replaced the old one" if r.get("replaced") else ""))
    if failed:
        ui.warn("%d of %d file(s) not sent: %s" % (len(failed), len(prepared),
                                                    esc(", ".join(failed))))
        return 1
    ui.ok("%d file(s) sent" % len(prepared))
    return 0


def show_list(ui, reply):
    files = reply.get("files") or []
    ui.table(["Name", "Kind", ">Size"],
             [[esc(f.get("name", "")), esc(f.get("kind", "")), human(f.get("size"))]
              for f in files], title="on the badge", empty="no photos, videos or documents")
    ui.note("%s free" % human(reply.get("free")))


@command("transfer")
def cmd_transfer(ctx):
    args = ctx.args
    ui = ctx.ui
    action = getattr(args, "action", "send")
    if action == "send":
        if not args.files:
            raise OreoError("which files?", hint="falera transfer send photo.jpg notes.md")
        ui.header("transfer", "%d file(s) over USB to the Transfer app" % len(args.files))
        prepared = prepare(ui, args.files, args)
        return _session(ctx, lambda c, h: send_files(ctx, c, h, prepared))
    if action == "list":
        ui.header("transfer", "files on the badge")
        return _session(ctx, lambda c, h: show_list(ui, c.list()) or 0)
    # rm
    if not args.files:
        raise OreoError("which file?", hint="falera transfer rm photo.rz565 (names: "
                        "`falera transfer list`)")
    if not ui.confirm("Remove %s from the badge?" % esc(", ".join(args.files))):
        raise Cancelled("nothing removed")

    def remove(client, _hello):
        for name in args.files:
            r = client.delete(name)
            ui.ok("removed %s (%s free)" % (esc(name), human(r.get("free"))))
        return 0
    ui.header("transfer", "remove")
    return _session(ctx, remove)


@command("send")
def cmd_send(ctx):
    ctx.args.action = "send"
    return cmd_transfer(ctx)
