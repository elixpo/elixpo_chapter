"""Transfer protocol, badge side: files from a computer over USB.

The Transfer app reads the USB serial stream (MicroPython's sys.stdin)
while it is open and hands every complete line to a Receiver. Nothing
here touches the screen or the serial port, so the whole protocol runs
under CPython in the host tests (tests/test_transfer_proto.py and
cli/tests/test_transfer.py drive it against the real CLI client).

Wire format: one message per line, ASCII only, so a terminal, a log line
or a stray Ctrl-C can never be mistaken for data.

  computer -> badge   @OTH {json}\\n            a command
                      @OTD <seq> <base64>\\n    one chunk of the file being sent
  badge -> computer   @OTB {json}\\n            a reply or an event

Lines without one of these prefixes are ignored (FaleraOS log lines go to
the same stream, and a REPL would echo the computer's own lines back).

Session:
  badge   announce        (when the app opens, every few seconds while it
                           waits, and while a session is idle with no file
                           on its way; the CLI says hello only after one)
  hello   {v, host, client, id}    -> hello {v, chunk, max, free, ...}
  auth    {code}                   -> ok | error auth (tries left) | locked
  put     {name, size, sha256}     -> ready, then per chunk: ack {seq, got},
                                      then done {name, path, kind} | error
  abort                            -> aborted (drops the half-sent file)
  list                             -> list {files, free}
  del     {name}                   -> deleted
  ping                             -> pong
  bye                              -> bye (the session ends, the code rotates)

The six-character code is shown only on the badge screen. A new code is
drawn for every session (and after a lockout); MAX_TRIES wrong codes lock
the badge for LOCK_MS. Each file is written to <name>.part, checked
against its SHA-256 and its format header, then renamed into place, so a
cut cable never leaves a half file where the Gallery or Reader looks.
"""

import json
import os

try:
    import binascii
except ImportError:                  # pragma: no cover - very old ports
    import ubinascii as binascii

try:
    import hashlib
except ImportError:                  # pragma: no cover
    import uhashlib as hashlib

import time

VERSION = 1

HOST_PREFIX  = b"@OTH "
DATA_PREFIX  = b"@OTD "
BADGE_PREFIX = "@OTB "

CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # no 0/O, 1/I/L
CODE_LEN     = 6

CHUNK     = 3072                  # file bytes per data line (4096 base64 chars)
MAX_LINE  = 4400                  # longest line accepted (a data line plus slack)
MAX_FILE  = 8 * 1024 * 1024       # largest single file
RESERVE   = 256 * 1024            # flash kept free for FaleraOS (matches falera add)
MAX_TRIES = 5                     # wrong codes before a lockout
LOCK_MS   = 60 * 1000
ANNOUNCE_MS = 2000                # re-announce while nobody is connected

# A computer that goes quiet is dropped: generous while someone types the
# code, short in the middle of a file.
IDLE_HELLO_MS = 5 * 60 * 1000
IDLE_AUTHED_MS = 2 * 60 * 1000
IDLE_PUT_MS = 20 * 1000

GALLERY_DIR = "apps/gallery/assets/optimized"
DOCS_DIR    = "documents"

# extension -> (folder, kind). The converted formats `falera add` and
# `falera transfer send` produce, plus plain text the Reader opens as is.
ROUTES = (
    (".rz565", GALLERY_DIR, "image"),
    (".r565",  GALLERY_DIR, "image"),
    (".rv565", GALLERY_DIR, "video"),
    (".mdz",   DOCS_DIR,    "document"),
    (".txtz",  DOCS_DIR,    "document"),
    (".md",    DOCS_DIR,    "document"),
    (".txt",   DOCS_DIR,    "document"),
)

LOG_KEEP = 4                      # results kept for the screen

# Session states
WAITING   = "waiting"             # app open, no computer yet
HELLO     = "hello"               # a computer said hello, no code yet
AUTHED    = "authed"              # code accepted
RECEIVING = "receiving"           # a file is on its way


def _ticks():
    try:
        return time.ticks_ms()
    except AttributeError:
        return int(time.monotonic() * 1000)


def _diff(a, b):
    try:
        return time.ticks_diff(a, b)
    except AttributeError:
        return a - b


def random_code(n=CODE_LEN, urandom=None):
    """`n` characters from CODE_CHARSET, drawn from the hardware RNG with
    rejection sampling. No fallback: without os.urandom this raises rather
    than hand out a guessable code."""
    rnd = urandom or os.urandom
    cs = CODE_CHARSET
    limit = 256 - (256 % len(cs))
    out = []
    while len(out) < n:
        for b in rnd(n):
            if b < limit and len(out) < n:
                out.append(cs[b % len(cs)])
    return "".join(out)


def normalize_code(text):
    """What the person typed -> comparable code: upper case, without the
    spaces or dashes people add while reading it off the screen."""
    out = []
    for ch in str(text or "").upper():
        if ch not in " -_\t":
            out.append(ch)
    return "".join(out)


def same_code(a, b):
    """Compare without stopping at the first difference."""
    if len(a) != len(b):
        return False
    r = 0
    for i in range(len(a)):
        r |= ord(a[i]) ^ ord(b[i])
    return r == 0


def route_for(name):
    """(folder, kind) for a file name, or (None, reason)."""
    low = (name or "").lower()
    for ext, folder, kind in ROUTES:
        if low.endswith(ext):
            return folder, kind
    return None, "unsupported type"


def safe_name(raw):
    """A plain file name: no folders, printable ASCII only, at most 64
    characters, never hidden and never a .part staging name. '' when
    nothing usable is left."""
    if not raw or not isinstance(raw, str):
        return ""
    name = raw.replace("\\", "/").split("/")[-1]
    out = []
    for ch in name:
        c = ord(ch)
        if 32 <= c < 127 and ch not in "/\\?*:|\"<>":
            out.append(ch)
    name = "".join(out).strip()
    if len(name) > 64:
        dot = name.rfind(".")
        ext = name[dot:] if 0 < dot and len(name) - dot <= 8 else ""
        name = name[:64 - len(ext)] + ext
    if not name or name[0] == "." or name.lower().endswith(".part"):
        return ""
    return name


def hexdigest(h):
    return binascii.hexlify(h.digest()).decode()


def _u16(b, i):
    return b[i] | (b[i + 1] << 8)


def _u32(b, i):
    return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)


def valid_asset(path, kind, name):
    """Header check of a staged file before it is renamed into place:
    the same rules the Gallery and Reader apply when they open a file."""
    low = name.lower()
    try:
        size = os.stat(path)[6]
        with open(path, "rb") as f:
            head = f.read(12)
            if kind == "image":
                if head[:4] == b"R5Z\x01" and len(head) == 12:
                    w, h = _u16(head, 4), _u16(head, 6)
                    return 0 < w <= 320 and 0 < h <= 240 and _u32(head, 8) == w * h * 2
                if head[:2] == b"R5" and len(head) >= 6:
                    w, h = _u16(head, 2), _u16(head, 4)
                    return 0 < w <= 320 and 0 < h <= 240 and size == 6 + w * h * 2
                return False
            if kind == "document":
                if low.endswith(".mdz") or low.endswith(".txtz"):
                    return len(head) >= 8 and head[:4] == b"ODZ\x01"
                return True
            # video
            if len(head) != 12 or head[:3] != b"RV5" or head[3] not in (1, 2, 3, 4, 5, 6):
                return False
            w, h, fps, frames = _u16(head, 4), _u16(head, 6), head[8], _u16(head, 10)
            if not (0 < w <= 320 and 0 < h <= 240 and 0 < fps <= 30 and frames > 0):
                return False
            if head[3] == 5:
                return size == 12 + w * h * 2 * frames
            if head[3] == 6:
                cursor = 12
                for _ in range(frames):
                    f.seek(cursor)
                    nbuf = f.read(4)
                    if len(nbuf) != 4:
                        return False
                    packed = _u32(nbuf, 0)
                    if packed <= 0:
                        return False
                    cursor += 4 + packed
                    if cursor > size:
                        return False
                return cursor == size
            return True
    except Exception:
        return False


def _free_bytes(root):
    try:
        s = os.statvfs(root or "/")
        return int(s[0]) * int(s[3])
    except Exception:
        return 0


def _mkdirs(path):
    """mkdir -p."""
    cur = "/" if path.startswith("/") else ""
    for part in path.split("/"):
        if not part:
            continue
        cur = cur + part if (not cur or cur.endswith("/")) else cur + "/" + part
        try:
            os.mkdir(cur)
        except OSError:
            pass


def _is_file(path):
    try:
        return not (os.stat(path)[0] & 0x4000)
    except OSError:
        return False


def _remove(path):
    try:
        os.remove(path)
    except OSError:
        pass


class Receiver:
    """One open Transfer app: a code, at most one computer, one file at a
    time. Feed it lines with feed(); call tick() every frame.

    `out(text)` writes one line (without the newline) to the computer.
    `root` prefixes every path (the host tests point it at a temp folder;
    on the badge it is "" and paths are relative to /, like the rest of
    FaleraOS). `notify(kind, name, size)` is called after a file lands.
    """

    def __init__(self, out, root="", urandom=None, clock=None, free=None,
                 notify=None, os_version=""):
        self._out = out
        self.root = root
        self._urandom = urandom
        self._clock = clock or _ticks
        self._free = free or (lambda: _free_bytes(root))
        self._notify = notify
        self.os_version = os_version
        self.tries = 0
        self.locked_until = None
        self.log = []                # [(ok, text)], newest last
        self.received = 0            # files received while the app is open
        self.state = WAITING
        self.host = ""
        self.client = ""
        self._last_rx = self._clock()
        self._announce_at = None
        self._file = None
        self._reset_put()
        self.code = random_code(CODE_LEN, self._urandom)
        self.changed = True

    # ── output ──────────────────────────────────────────────────────────
    def send(self, op, **fields):
        fields["op"] = op
        try:
            self._out(BADGE_PREFIX + json.dumps(fields))
        except Exception:
            pass

    def error(self, code, msg, **extra):
        self.send("error", code=code, msg=msg, **extra)

    def announce(self, now=None):
        self._announce_at = self._clock() if now is None else now
        self.send("announce", v=VERSION, app="transfer")

    def _note(self, ok, text):
        self.log.append((ok, text))
        if len(self.log) > LOG_KEEP:
            del self.log[0]
        self.changed = True

    # ── state helpers ───────────────────────────────────────────────────
    def active(self):
        """A computer is connected (said hello and has not left)."""
        return self.state != WAITING

    def locked_ms(self, now=None):
        if self.locked_until is None:
            return 0
        now = self._clock() if now is None else now
        left = _diff(self.locked_until, now)
        if left <= 0:
            self.locked_until = None
            self.changed = True
            return 0
        return left

    def tries_left(self):
        return MAX_TRIES - self.tries

    def new_code(self):
        self.code = random_code(CODE_LEN, self._urandom)
        self.changed = True

    def _reset_put(self):
        if self._file is not None:
            try:
                self._file.close()
            except Exception:
                pass
        self._file = None
        part = getattr(self, "_part", None)
        if part:
            _remove(part)
        self._part = None
        self._dest = None
        self._name = ""
        self._kind = ""
        self._size = 0
        self.got = 0
        self._seq = 0
        self._sha = None
        self._want = ""

    def progress(self):
        """(name, got, size) of the file on its way, or None."""
        if self.state != RECEIVING:
            return None
        return (self._name, self.got, self._size)

    def end(self, reason, tell=None):
        """Close the session: drop any half file, forget the computer and
        draw a new code. `tell` = (code, msg) sends an error first."""
        if self.state == WAITING:
            return
        if tell:
            self.error(tell[0], tell[1])
        who = self.host or "computer"
        if self.state == RECEIVING:
            self._note(False, "%s: stopped" % self._name)
        self._reset_put()
        self.state = WAITING
        self.host = ""
        self.client = ""
        self.new_code()
        self._note(reason == "done", "%s %s" % (
            who, "disconnected" if reason == "done" else reason))
        self._announce_at = None

    def cancel(self):
        """B on the badge."""
        self.end("cancelled", ("cancelled", "cancelled on the badge"))

    def close(self):
        """The app is closing."""
        self.end("left", ("closed", "the Transfer app was closed"))

    # ── per frame ───────────────────────────────────────────────────────
    def tick(self, now=None):
        now = self._clock() if now is None else now
        if self.locked_until is not None:
            self.locked_ms(now)
        if self.state == WAITING:
            if self._announce_at is None or _diff(now, self._announce_at) >= ANNOUNCE_MS:
                self.announce(now)
            return
        idle = _diff(now, self._last_rx)
        limit = (IDLE_PUT_MS if self.state == RECEIVING else
                 IDLE_AUTHED_MS if self.state == AUTHED else IDLE_HELLO_MS)
        if idle >= limit:
            self.end("timed out", ("timeout", "nothing heard from the computer"))
            return
        # A computer that went quiet (the CLI was killed) holds the session
        # until it times out. The CLI says hello only after an announce, so
        # keep announcing while the session is idle and no file is on its
        # way: a new `falera transfer` can then take over.
        if self.state != RECEIVING and idle >= ANNOUNCE_MS:
            if self._announce_at is None or _diff(now, self._announce_at) >= ANNOUNCE_MS:
                self.announce(now)

    # ── input ───────────────────────────────────────────────────────────
    def feed(self, line, now=None):
        """One line from the computer, without the newline. None means a
        line was too long and was dropped."""
        if line is None:
            if self.state == RECEIVING:
                self._fail("line", "line too long")
            return
        if line[-1:] == b"\r":
            line = line[:-1]
        if line.startswith(DATA_PREFIX):
            self._last_rx = self._clock() if now is None else now
            self._data(line)
            return
        i = line.find(HOST_PREFIX)
        if i < 0:
            return                   # log noise, an echo, a stray byte
        self._last_rx = self._clock() if now is None else now
        try:
            msg = json.loads(line[i + len(HOST_PREFIX):].decode())
            op = msg.get("op")
        except Exception:
            self.error("proto", "unreadable command")
            return
        fn = getattr(self, "_op_" + str(op), None) if isinstance(op, str) and op.isalpha() else None
        if fn is None:
            self.error("proto", "unknown command %s" % op)
            return
        fn(msg)

    # ── commands ────────────────────────────────────────────────────────
    def _op_hello(self, msg):
        if msg.get("v") != VERSION:
            self.error("version", "this badge speaks Transfer protocol v%d" % VERSION,
                       v=VERSION, id=msg.get("id"))
            return
        if self.state == RECEIVING:
            self._note(False, "%s: stopped" % self._name)
        self._reset_put()
        self.state = HELLO
        self.host = safe_name(str(msg.get("host") or ""))[:24] or "a computer"
        self.client = str(msg.get("client") or "")[:32]
        self.changed = True
        self.send("hello", v=VERSION, app="transfer", id=msg.get("id"),
                  os=self.os_version, chunk=CHUNK, max=MAX_FILE,
                  free=self._free(), reserve=RESERVE,
                  locked_s=(self.locked_ms() + 999) // 1000,
                  tries=self.tries_left())

    def _op_auth(self, msg):
        if self.state == WAITING:
            self.error("hello", "say hello first")
            return
        if self.state in (AUTHED, RECEIVING):
            self.send("ok", what="auth")
            return
        left = self.locked_ms()
        if left:
            self.error("locked", "too many wrong codes", retry_s=(left + 999) // 1000)
            return
        if same_code(normalize_code(msg.get("code")), self.code):
            self.tries = 0
            self.state = AUTHED
            self.changed = True
            self.send("ok", what="auth")
            return
        self.tries += 1
        self.changed = True
        if self.tries >= MAX_TRIES:
            self.tries = 0
            self.locked_until = self._clock() + LOCK_MS
            self.new_code()
            self._note(False, "%s: too many wrong codes" % self.host)
            self.error("locked", "too many wrong codes; a new code is on the badge",
                       retry_s=LOCK_MS // 1000)
            return
        self.error("auth", "wrong code", left=self.tries_left())

    def _need_auth(self):
        if self.state in (AUTHED, RECEIVING):
            return True
        self.error("need_auth", "enter the code first")
        return False

    def _op_put(self, msg):
        if not self._need_auth():
            return
        if self.state == RECEIVING:
            self.error("busy", "a file is already on its way")
            return
        raw = msg.get("name")
        name = safe_name(raw if isinstance(raw, str) else "")
        if not name:
            self.error("name", "bad file name")
            return
        folder, kind = route_for(name)
        if folder is None:
            self.error("type", "%s: the badge only takes .rz565/.r565 photos, "
                       ".rv565 videos and .md/.txt(.z) documents" % name)
            return
        size, sha = msg.get("size"), msg.get("sha256")
        if not isinstance(size, int) or size <= 0:
            self.error("size", "bad size")
            return
        if size > MAX_FILE:
            self.error("too_big", "%s is larger than %d KB" % (name, MAX_FILE // 1024),
                       max=MAX_FILE)
            return
        if not (isinstance(sha, str) and len(sha) == 64):
            self.error("sha", "bad sha256")
            return
        free = self._free()
        if size + RESERVE > free:
            self.error("no_space", "not enough free space", free=free, reserve=RESERVE)
            return
        base = self.root + folder
        _mkdirs(base)
        self._dest = base + "/" + name
        self._part = self._dest + ".part"
        try:
            self._file = open(self._part, "wb")
        except OSError as e:
            self._part = None
            self.error("io", "cannot write: %s" % e)
            return
        self._name, self._kind, self._size = name, kind, size
        self._want = sha.lower()
        self._sha = hashlib.sha256()
        self.got = 0
        self._seq = 0
        self.state = RECEIVING
        self.changed = True
        self.send("ready", name=name, kind=kind, chunk=CHUNK)

    def _fail(self, code, msg):
        name = self._name
        self._reset_put()
        self.state = AUTHED
        self._note(False, "%s: %s" % (name, msg))
        self.error(code, msg, name=name)

    def _data(self, line):
        if self.state != RECEIVING:
            return                   # chunks still in flight after an error
        sp = line.find(b" ", len(DATA_PREFIX))
        try:
            if sp < 0:
                raise ValueError("no payload")
            seq = int(line[len(DATA_PREFIX):sp].decode())
            blob = binascii.a2b_base64(line[sp + 1:])
        except Exception:
            self._fail("data", "damaged chunk")
            return
        if seq != self._seq:
            self._fail("seq", "chunk %d arrived, %d expected" % (seq, self._seq))
            return
        n = len(blob)
        if n == 0 or n > CHUNK or self.got + n > self._size:
            self._fail("data", "chunk of the wrong size")
            return
        try:
            self._file.write(blob)
        except Exception as e:
            self._fail("io", "write failed: %s" % e)
            return
        self._sha.update(blob)
        self.got += n
        self._seq += 1
        self.changed = True
        self.send("ack", seq=seq, got=self.got)
        if self.got == self._size:
            self._finish()

    def _finish(self):
        try:
            self._file.close()
        except Exception:
            pass
        self._file = None
        if hexdigest(self._sha) != self._want:
            self._fail("hash", "SHA-256 mismatch, file dropped")
            return
        if not valid_asset(self._part, self._kind, self._name):
            self._fail("invalid", "not a valid %s file" % self._kind)
            return
        replaced = _is_file(self._dest)
        try:
            try:
                os.rename(self._part, self._dest)
            except OSError:
                _remove(self._dest)
                os.rename(self._part, self._dest)
        except OSError as e:
            self._fail("io", "could not save: %s" % e)
            return
        self._part = None            # renamed: nothing to clean up
        name, kind, size = self._name, self._kind, self._size
        path = self._dest[len(self.root):]
        self._reset_put()
        self.state = AUTHED
        self.received += 1
        app = "Gallery" if kind in ("image", "video") else "Reader"
        self._note(True, "%s -> %s" % (name, app))
        self.send("done", name=name, kind=kind, path="/" + path, size=size,
                  replaced=replaced, free=self._free())
        if self._notify is not None:
            try:
                self._notify(kind, name, size)
            except Exception:
                pass

    def _op_abort(self, msg):
        if self.state == RECEIVING:
            name = self._name
            self._reset_put()
            self.state = AUTHED
            self._note(False, "%s: stopped by the computer" % name)
        self.send("aborted")

    def _op_list(self, msg):
        if not self._need_auth():
            return
        files = []
        for folder in (GALLERY_DIR, DOCS_DIR):
            base = self.root + folder
            try:
                names = sorted(os.listdir(base))
            except OSError:
                continue
            for n in names:
                f, kind = route_for(n)
                if f != folder:
                    continue
                try:
                    st = os.stat(base + "/" + n)
                except OSError:
                    continue
                if st[0] & 0x4000:
                    continue
                files.append({"name": n, "kind": kind, "size": st[6]})
                if len(files) >= 200:
                    break
        self.send("list", files=files, free=self._free())

    def _op_del(self, msg):
        if not self._need_auth():
            return
        raw = msg.get("name")
        name = safe_name(raw if isinstance(raw, str) else "")
        folder, kind = route_for(name)
        if not name or folder is None or name != raw:
            self.error("name", "bad file name")
            return
        path = self.root + folder + "/" + name
        if not _is_file(path):
            self.error("missing", "%s is not on the badge" % name)
            return
        try:
            os.remove(path)
        except OSError as e:
            self.error("io", "could not delete: %s" % e)
            return
        self._note(True, "deleted %s" % name)
        self.send("deleted", name=name, free=self._free())

    def _op_ping(self, msg):
        self.send("pong")

    def _op_bye(self, msg):
        self.send("bye")
        self.end("done")
