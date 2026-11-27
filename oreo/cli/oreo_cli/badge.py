"""High-level badge operations, driven over the raw REPL.

Every operation sends a short MicroPython 1.28 snippet that reports back
with `@OREO:<json>` lines (events) and, for downloads, `@B:<base64>` lines
(data). Anything else the badge prints (FaleraOS log lines such as
"[wifi] connecting") is passed through as chatter.

Snippets only use what the badge firmware has: os.ilistdir/stat/statvfs,
json, binascii, hashlib, time.sleep_ms, and the FaleraOS modules
(oreoOS.config, oreoOS.storage, oreoOS.store, oreoWare.wifi,
oreoWare.battery).
"""

import base64
import binascii
import contextlib
import hashlib
import json
import posixpath

from .errors import BadgeError, LinkError, NoOreoOS, OreoError, UsageError, redact

EVENT = "@OREO:"
DATA = "@B:"

PRELUDE = (
    "import json as _j\n"
    "def _e(o):\n"
    " print('@OREO:'+_j.dumps(o))\n"
)

B64 = (
    "try:\n"
    " import binascii as _b\n"
    "except ImportError:\n"
    " import ubinascii as _b\n"
)

# Paths `falera rm` refuses without --force: removing them stops FaleraOS booting.
PROTECTED = ("/", "/main.py", "/boot.py", "/oreoOS", "/oreoWare", "/apps",
             "/apps/launcher", "/assets")

# Raw bytes per exec while pushing: about 11 KB of base64 code. The badge
# holds the pasted code, the decoded literal and the chunk at once (~30 KB
# for a moment, on a heap of several MB of PSRAM with FaleraOS stopped).
# Doubling it from 4 KiB halves the execs, but the model in
# tests/test_push_speed.py says that gains only a few percent: raw-paste
# flow control and flash writes dominate. The bigger win is fewer execs per
# file (see write_file). docs/CLI.md "Transfer speed" has the numbers.
PUSH_CHUNK = 8192
PULL_CHUNK = 3072        # raw bytes per @B: line
FREE_RESERVE = 64 * 1024  # keep this much flash free after a push

NO_OREOOS_HINT = ("install FaleraOS: `falera flash --repo <checkout>` (firmware and FaleraOS) "
                  "or `falera update --repo <checkout>`; see `falera doctor`")


# The badge's progress screen while the computer drives it (oreoOS/hostui.py:
# show(title, detail="", progress=None) and clear(), callable over the raw
# REPL while FaleraOS is paused; progress is 0.0-1.0 or None). A FaleraOS
# without it, or any error inside it, is ignored: the screen is a courtesy
# and must never break the operation. The module is imported once per raw
# REPL session (its globals survive between execs until the next soft
# reset) and the calls ride along with execs that are sent anyway, so a
# push costs no extra round trips for it.
HOSTUI_IMPORT = (
    "try:\n"
    " _hu\n"
    "except NameError:\n"
    " try:\n"
    "  from oreoOS import hostui as _hu\n"
    " except Exception:\n"
    "  _hu=None\n"
)
# _hs(title, detail, progress) for snippets that update the screen from a
# loop or callback on the badge.
HOSTUI_DEF = HOSTUI_IMPORT + (
    "def _hs(t,d='',p=None):\n"
    " if _hu:\n"
    "  try:\n"
    "   _hu.show(t,d,p)\n"
    "  except Exception:\n"
    "   pass\n"
)


def _fraction(progress):
    if progress is None:
        return None
    return round(min(1.0, max(0.0, float(progress))), 3)


def screen_code(title, detail="", progress=None):
    """A snippet that shows (title, detail, progress) on the badge's
    screen, or clears it when title is None."""
    if title is None:
        call = "  _hu.clear()\n"
    else:
        call = "  _hu.show(%s,%s,%s)\n" % (lit(str(title)), lit(str(detail or "")),
                                            lit(_fraction(progress)))
    return HOSTUI_IMPORT + "if _hu:\n try:\n" + call + " except Exception:\n  pass\n"


def lit(value):
    """A Python literal for `value`, valid MicroPython source."""
    return repr(value)


def norm(path):
    """Badge path -> absolute, normalised ('/a/b'). Accepts ':a/b' too.

    A path that looks like a Windows path (`C:/Program Files/Git/documents`)
    is refused: Git Bash rewrites `/documents` into that before falera sees
    it, and copying there would be a surprise."""
    p = (path or "/").strip()
    if len(p) > 2 and p[1] == ":" and p[0].isalpha() and p[2] in "/\\":
        raise UsageError("%s looks like a path on this computer, not on the badge" % p,
                         hint="Git Bash rewrites paths that start with /; write badge paths "
                              "as :documents/ (or set MSYS_NO_PATHCONV=1)")
    p = p.replace("\\", "/")
    if p.startswith(":"):
        p = p[1:]
    if not p.startswith("/"):
        p = "/" + p
    p = posixpath.normpath(p)
    if p.startswith("//"):
        p = p[1:]
    return p


class OutputParser:
    """Splits streamed badge output into events, data chunks and chatter."""

    def __init__(self, on_event=None, on_data=None, on_text=None):
        self._buf = b""
        self.events = []
        self.text = []
        self.on_event = on_event
        self.on_data = on_data
        self.on_text = on_text

    def feed(self, chunk):
        self._buf += chunk.replace(b"\x04", b"")
        while b"\n" in self._buf:
            line, self._buf = self._buf.split(b"\n", 1)
            self._line(line.rstrip(b"\r"))

    def finish(self):
        if self._buf.strip():
            self._line(self._buf.rstrip(b"\r"))
        self._buf = b""

    def _line(self, raw):
        s = raw.decode("utf-8", "replace")
        if s.startswith(EVENT):
            try:
                ev = json.loads(s[len(EVENT):])
            except ValueError:
                self._text(s)
                return
            self.events.append(ev)
            if self.on_event:
                self.on_event(ev)
        elif s.startswith(DATA):
            data = binascii.a2b_base64(s[len(DATA):])
            if self.on_data:
                self.on_data(data)
        else:
            self._text(s)

    def _text(self, s):
        self.text.append(s)
        if self.on_text:
            self.on_text(s)


def _missing_oreoos(text):
    """A badge traceback that means FaleraOS (or part of it) is not there."""
    if "ImportError" not in text and "AttributeError" not in text:
        return False
    low = text.lower()
    return ("oreoos" in low or "oreoware" in low) and (
        "no module named" in low or "can't import name" in low
        or "cannot import name" in low or "has no attribute" in low)


class Badge:
    """One session with one badge. Opens on first use."""

    def __init__(self, link, on_text=None):
        self.link = link
        self.on_text = on_text
        self.entered = False
        self._dirs = set()      # folders known to exist on the badge
        self._screen = False    # something is shown on the badge's screen

    # ── session ──────────────────────────────────────────────────────
    def connect(self):
        if not self.entered:
            self.link.enter()
            self.entered = True
        return self

    def finish(self, mode="soft"):
        """Leave FaleraOS running again (unless mode == 'none')."""
        if self.entered or getattr(self.link, "t", None) is not None:
            self.link.restart(mode)
        self.entered = False

    # ── the badge's screen (oreoOS/hostui.py) ────────────────────────
    def screen_code(self, title, detail="", progress=None):
        """screen_code(), remembering that the screen needs clearing."""
        self._screen = True
        return screen_code(title, detail, progress)

    def screen(self, title, detail="", progress=None):
        """Show what the computer is doing on the badge's screen. Best
        effort: nothing happens unless FaleraOS is already paused, and an
        FaleraOS without hostui, or any failure, is ignored."""
        if not self.entered:
            return
        try:
            self.link.exec(self.screen_code(title, detail, progress), timeout=5)
        except OreoError:
            pass

    def screen_clear(self):
        """Clear the badge's screen if anything was shown on it."""
        if not (self.entered and self._screen):
            return
        self._screen = False
        try:
            self.link.exec(screen_code(None), timeout=5)
        except OreoError:
            pass

    @contextlib.contextmanager
    def showing(self):
        """Clear the badge's screen when the block ends, also after an
        error (but not when the link is gone, or on Ctrl-C: the restart
        that follows brings FaleraOS's own screen back anyway)."""
        try:
            yield self
        except LinkError:
            raise
        except Exception:
            self.screen_clear()
            raise
        self.screen_clear()

    # ── exec helpers ─────────────────────────────────────────────────
    def run(self, code, timeout=15, on_event=None, on_data=None, secrets=()):
        self.connect()
        parser = OutputParser(on_event, on_data, self.on_text)
        try:
            self.link.exec(PRELUDE + code, timeout=timeout, consumer=parser.feed)
        except BadgeError as e:
            message, detail = redact(e.message, secrets), redact(e.detail, secrets)
            if _missing_oreoos(message + "\n" + (detail or "")):
                raise NoOreoOS("this needs FaleraOS, and the badge does not have it "
                               "(or has a version too old for this command)",
                               detail=detail, hint=NO_OREOOS_HINT)
            raise BadgeError(message, detail, hint=e.hint)
        except OreoError as e:
            raise type(e)(redact(e.message, secrets), hint=e.hint)
        parser.finish()
        return parser

    def result(self, code, timeout=15, on_event=None, secrets=()):
        """Run code and return the last event it emitted."""
        parser = self.run(code, timeout=timeout, on_event=on_event, secrets=secrets)
        if not parser.events:
            raise BadgeError("the badge sent no result", detail="\n".join(parser.text))
        return parser.events[-1]

    # ── device info ──────────────────────────────────────────────────
    def info(self):
        code = (
            "import os, sys, gc\n"
            "r={}\n"
            "try:\n"
            " u=os.uname()\n"
            " r['machine']=u.machine\n"
            " r['fw']=u.version\n"
            " r['release']=u.release\n"
            "except Exception:\n"
            " pass\n"
            "try:\n"
            " v=sys.implementation.version\n"
            " r['mpy']='%d.%d.%d'%(v[0],v[1],v[2])\n"
            "except Exception:\n"
            " r['mpy']=None\n"
            "try:\n"
            " from oreoOS import config as c\n"
            " r['os']=c.VERSION\n"
            " r['date']=getattr(c,'RELEASE_DATE','')\n"
            " r['bt_auto']=bool(getattr(c,'BT_AUTO_ENABLE',False))\n"
            "except Exception:\n"
            " r['os']=None\n"
            "try:\n"
            " from oreoOS import storage as s\n"
            " r['storage']=s.usage()\n"
            "except Exception:\n"
            " s=os.statvfs('/')\n"
            " r['storage']={'stats':{'total':s[1]*s[2],'free':s[1]*s[4],"
            "'used':s[1]*(s[2]-s[4])},'buckets':None}\n"
            "try:\n"
            " from oreoWare import wifi as w\n"
            " up=bool(w.is_connected())\n"
            " r['wifi']={'up':up,'ip':w.ip() if up else None,'saved':len(w.list_saved())}\n"
            "except Exception:\n"
            " r['wifi']=None\n"
            "try:\n"
            " from oreoWare import battery as b\n"
            " r['battery']={'pct':b.read_percent(),'v':b.read_voltage()}\n"
            "except Exception:\n"
            " r['battery']=None\n"
            "gc.collect()\n"
            "try:\n"
            " r['mem_free']=gc.mem_free()\n"
            "except Exception:\n"
            " pass\n"
            "_e(r)\n"
        )
        return self.result(code, timeout=60)

    def banner(self):
        """Firmware identity only (cheap; used by doctor)."""
        code = (
            "import os, sys\n"
            "r={'impl':sys.implementation.name}\n"
            "try:\n"
            " v=sys.implementation.version\n"
            " r['mpy']='%d.%d.%d'%(v[0],v[1],v[2])\n"
            " u=os.uname()\n"
            " r['machine']=u.machine\n"
            " r['fw']=u.version\n"
            "except Exception:\n"
            " pass\n"
            "try:\n"
            " os.stat('/oreoOS/config.py')\n"
            " from oreoOS import config as c\n"
            " r['os']=c.VERSION\n"
            "except Exception:\n"
            " r['os']=None\n"
            "_e(r)\n"
        )
        return self.result(code)

    # ── files ────────────────────────────────────────────────────────
    def stat(self, path):
        """{'dir': bool, 'size': int} or None when missing."""
        code = (
            "import os\n"
            "try:\n"
            " s=os.stat(%s)\n"
            " _e({'dir':bool(s[0]&0x4000),'size':s[6]})\n"
            "except OSError:\n"
            " _e({'missing':1})\n" % lit(norm(path))
        )
        r = self.result(code)
        return None if r.get("missing") else r

    def ls(self, path="/"):
        """[{'name', 'dir', 'size'}], directories first."""
        p = norm(path)
        code = (
            "import os\n"
            "try:\n"
            " s=os.stat(%(p)s)\n"
            "except OSError:\n"
            " s=None\n"
            "if s is None:\n"
            " _e({'missing':1})\n"
            "elif not s[0]&0x4000:\n"
            " _e({'file':[%(n)s,0,s[6]]})\n"
            "else:\n"
            " r=[]\n"
            " for x in os.ilistdir(%(p)s):\n"
            "  r.append([x[0],1 if x[1]&0x4000 else 0,x[3] if len(x)>3 else 0])\n"
            " _e({'ls':r})\n" % {"p": lit(p), "n": lit(posixpath.basename(p))}
        )
        r = self.result(code)
        if r.get("missing"):
            raise OreoError("%s: not found on the badge" % p)
        rows = [r["file"]] if "file" in r else r["ls"]
        out = [{"name": n, "dir": bool(d), "size": s} for n, d, s in rows]
        out.sort(key=lambda e: (not e["dir"], e["name"].lower()))
        return out

    def walk(self, path):
        """Yield (badge_path, size) for every file under a directory."""
        p = norm(path)
        for e in self.ls(p):
            child = posixpath.join(p, e["name"])
            if e["dir"]:
                for item in self.walk(child):
                    yield item
            else:
                yield child, e["size"]

    def free(self):
        r = self.result(
            "import os\n"
            "s=os.statvfs('/')\n"
            "_e({'free':s[1]*s[4],'total':s[1]*s[2]})\n")
        return r["free"], r["total"]

    def mkdirs(self, path):
        p = norm(path)
        if p == "/" or p in self._dirs:
            return
        self.result(
            "import os\n"
            "c=''\n"
            "for x in %s.split('/'):\n"
            " if not x:\n"
            "  continue\n"
            " c=c+'/'+x\n"
            " try:\n"
            "  os.mkdir(c)\n"
            " except OSError:\n"
            "  pass\n"
            "_e({'ok':1})\n" % lit(p))
        while p != "/":
            self._dirs.add(p)
            p = posixpath.dirname(p)

    def write_file(self, data, remote, progress=None, verify=True,
                   chunk=PUSH_CHUNK, reserve=FREE_RESERVE, check_space=True, screen=None):
        """Copy bytes to `remote` atomically and verified.

        The bytes go to `<remote>.part`; the badge then checks its size (and
        SHA-256 unless verify=False) against what was sent and only renames
        it over `remote` when they match, so a bad copy never replaces a
        good file. The first chunk rides along with the open and the last
        with the check-and-rename, so a small file costs two execs (plus a
        space check unless the caller already made one, and a mkdir the
        first time a folder is used).

        screen=(title, detail) also shows the progress on the badge's
        screen, riding along with the execs above (no extra round trips).
        """
        dest = norm(remote)
        if check_space:
            free, _ = self.free()
            if len(data) + reserve > free:
                from .ui import human
                raise OreoError("not enough space on the badge: %s needed, %s free"
                                % (human(len(data)), human(max(0, free - reserve))),
                                hint="free some space (`falera info`, `falera rm`)")
        parent = posixpath.dirname(dest)
        if parent and parent != "/":
            self.mkdirs(parent)
        tmp = dest + ".part"
        pieces = [data[i:i + chunk] for i in range(0, len(data), chunk)] or [b""]
        want = hashlib.sha256(data).hexdigest() if verify else None
        state = {"done": 0}

        def put(piece):
            return "_w(_d(%s))\n" % lit(base64.b64encode(piece)) if piece else ""

        def shown():
            if not screen:
                return ""
            return self.screen_code(screen[0], screen[1],
                                    state["done"] / float(len(data)) if data else None)

        def advance(piece):
            state["done"] += len(piece)
            if progress:
                progress(state["done"], len(data))
        try:
            self.run(shown() + "import os\n" + B64 +
                     "_f=open(%s,'wb')\n_w=_f.write\n_d=_b.a2b_base64\n" % lit(tmp)
                     + (put(pieces[0]) if len(pieces) > 1 else ""))
            if len(pieces) > 1:
                advance(pieces[0])
            for piece in pieces[1:-1]:
                self.link.exec(shown() + put(piece), timeout=15)
                advance(piece)
            r = self.result(
                shown() + put(pieces[-1]) +
                "_f.close()\n"
                "_r={'size':os.stat(%(t)s)[6],'sha':None}\n"
                "if %(v)s:\n"
                " try:\n"
                "  import hashlib\n"
                "  _h=hashlib.sha256()\n"
                "  _g=open(%(t)s,'rb')\n"
                "  while 1:\n"
                "   _c=_g.read(4096)\n"
                "   if not _c:\n"
                "    break\n"
                "   _h.update(_c)\n"
                "  _g.close()\n"
                "  _r['sha']=_b.hexlify(_h.digest()).decode()\n"
                " except ImportError:\n"
                "  pass\n"
                "_r['ok']=_r['size']==%(n)d and (_r['sha'] is None or _r['sha']==%(w)s)\n"
                "if _r['ok']:\n"
                " try:\n"
                "  os.rename(%(t)s,%(d)s)\n"
                " except OSError:\n"
                "  os.remove(%(d)s)\n"
                "  os.rename(%(t)s,%(d)s)\n"
                "else:\n"
                " os.remove(%(t)s)\n"
                "_e(_r)\n" % {"t": lit(tmp), "d": lit(dest), "n": len(data),
                              "w": lit(want), "v": "True" if verify else "False"},
                timeout=60)
            advance(pieces[-1])
        except LinkError:
            raise           # the badge is gone; nothing to clean up with
        except BaseException:   # Ctrl-C too: do not leave a .part file behind
            try:
                self.link.exec("try:\n _f.close()\nexcept Exception:\n pass\n"
                               "try:\n import os\n os.remove(%s)\nexcept Exception:\n pass\n"
                               % lit(tmp))
            except BaseException:
                pass
            raise
        if r["size"] != len(data):
            raise OreoError("%s: the badge received %d bytes, expected %d; nothing was replaced"
                            % (dest, r["size"], len(data)),
                            hint="try again; if it repeats, try another cable or USB port")
        if not r.get("ok"):
            raise OreoError("%s: checksum mismatch after copy; nothing was replaced" % dest,
                            hint="try again; if it repeats, try another cable or USB port")
        return dest

    def sha256(self, remote):
        r = self.result(
            B64 +
            "try:\n"
            " import hashlib\n"
            " h=hashlib.sha256()\n"
            " f=open(%s,'rb')\n"
            " while 1:\n"
            "  c=f.read(2048)\n"
            "  if not c:\n"
            "   break\n"
            "  h.update(c)\n"
            " f.close()\n"
            " _e({'sha':_b.hexlify(h.digest()).decode()})\n"
            "except ImportError:\n"
            " _e({'sha':None})\n" % lit(norm(remote)), timeout=60)
        return r["sha"]

    def read_file(self, remote, progress=None, chunk=PULL_CHUNK, screen=None):
        """The file's bytes. screen=(title, detail): the badge shows its
        progress on its screen every few chunks while it sends."""
        src = norm(remote)
        st = self.stat(src)
        if st is None:
            raise OreoError("%s: not found on the badge" % src)
        if st["dir"]:
            raise OreoError("%s is a directory" % src, hint="use `falera pull -r`")
        total = st["size"]
        buf = bytearray()

        def on_data(piece):
            buf.extend(piece)
            if progress:
                progress(len(buf), total)
        show, step = "", ""
        if screen:
            self._screen = True
            args = "%s,%s" % (lit(str(screen[0])), lit(str(screen[1] or "")))
            show = HOSTUI_DEF + "_hs(%s,0.0)\n_k=0\n" % args
            # every 8 chunks (24 KiB): drawing is slower than sending a line
            step = (" _k+=1\n"
                    " if _k%%8==0:\n"
                    "  _hs(%s,min(1.0,_k*%d/%d))\n" % (args, chunk, max(1, total)))
        self.run(
            B64 + show +
            "_f=open(%s,'rb')\n"
            "while 1:\n"
            " c=_f.read(%d)\n"
            " if not c:\n"
            "  break\n"
            " print('@B:'+_b.b2a_base64(c).decode().strip())\n" % (lit(src), chunk)
            + step +
            "_f.close()\n", on_data=on_data)
        if len(buf) != total:
            raise OreoError("%s: received %d of %d bytes" % (src, len(buf), total))
        return bytes(buf)

    def rm(self, path, recursive=False):
        p = norm(path)
        code = (
            "import os\n"
            "def _rm(p):\n"
            " if os.stat(p)[0]&0x4000:\n"
            "  if not %(r)s:\n"
            "   raise OSError(21)\n"
            "  for x in list(os.ilistdir(p)):\n"
            "   _rm((p.rstrip('/'))+'/'+x[0])\n"
            "  if p!='/':\n"
            "   os.rmdir(p)\n"
            " else:\n"
            "  os.remove(p)\n"
            "try:\n"
            " os.stat(%(p)s)\n"
            "except OSError:\n"
            " _e({'missing':1})\n"
            "else:\n"
            " try:\n"
            "  _rm(%(p)s)\n"
            "  _e({'ok':1})\n"
            " except OSError as x:\n"
            "  _e({'err':x.args[0] if x.args else 0})\n"
            % {"p": lit(p), "r": "True" if recursive else "False"})
        r = self.result(code, timeout=60)
        if r.get("missing"):
            raise OreoError("%s: not found on the badge" % p)
        if "err" in r:
            if r["err"] == 21:
                raise OreoError("%s is a directory" % p, hint="use `falera rm -r`")
            raise OreoError("could not remove %s (errno %s)" % (p, r["err"]))
        return p

    # ── wifi (oreoWare.wifi) ─────────────────────────────────────────
    def wifi_scan(self, timeout_s=15):
        code = (
            "import time\n"
            "from oreoWare import wifi as w\n"
            "try:\n"
            " w.auto_stop()\n"
            "except Exception:\n"
            " pass\n"
            "if not w.scan_start():\n"
            " _e({'error':w.scan_error() or 'radio error'})\n"
            "else:\n"
            " r=w.scan_poll()\n"
            " while r=='busy':\n"
            "  time.sleep_ms(100)\n"
            "  r=w.scan_poll()\n"
            " if r=='done':\n"
            "  _e({'nets':w.nearby(),'saved':list(w.saved_ssids())})\n"
            " else:\n"
            "  _e({'error':w.scan_error() or r})\n"
        )
        r = self.result(code, timeout=timeout_s)
        if "error" in r:
            raise OreoError("Wi-Fi scan failed on the badge: %s" % r["error"],
                            hint="try again; see issue #120 if it keeps failing")
        saved = set(r.get("saved") or ())
        for n in r["nets"]:
            n["saved"] = n["ssid"] in saved
        return r["nets"]

    def wifi_connect(self, ssid, password, save=True, timeout_ms=15000):
        """Join `ssid`. Returns {'result', 'ip', 'saved'}. The password is
        sent to the badge once and never printed, logged or returned."""
        code = (
            "import time\n"
            "from oreoWare import wifi as w\n"
            "_s=%(s)s\n"
            "_p=%(p)s\n"
            "try:\n"
            " w.auto_stop()\n"
            "except Exception:\n"
            " pass\n"
            "r=w.CONN_BUSY if w.connect_begin(_s,_p,%(t)d) else w.connect_poll()\n"
            "while r==w.CONN_BUSY:\n"
            " time.sleep_ms(200)\n"
            " r=w.connect_poll()\n"
            "ok=r==w.CONN_OK\n"
            "sv=False\n"
            "if ok and %(save)s:\n"
            " sv=bool(w.add_saved(_s,_p))\n"
            # connect_poll() marked it "last" before it was saved; mark it
            # again so the next boot joins it without scanning first.
            " try:\n"
            "  w._mark_last(_s)\n"
            " except Exception:\n"
            "  pass\n"
            "_p=None\n"
            "_e({'result':r,'ip':w.ip() if ok else None,'saved':sv})\n"
            % {"s": lit(ssid), "p": lit(password or ""), "t": int(timeout_ms),
               "save": "True" if save else "False"})
        return self.result(code, timeout=timeout_ms / 1000.0 + 15,
                           secrets=(password,) if password else ())

    def wifi_save(self, ssid, password, priority=10):
        r = self.result(
            "from oreoWare import wifi as w\n"
            "_e({'saved':bool(w.add_saved(%s,%s,%d))})\n"
            % (lit(ssid), lit(password or ""), int(priority)),
            secrets=(password,) if password else ())
        return r["saved"]

    def wifi_saved(self):
        """Saved networks, without passwords (they never leave the badge)."""
        r = self.result(
            "from oreoWare import wifi as w\n"
            "r=[]\n"
            "for n in w.list_saved():\n"
            " r.append({'ssid':n.get('ssid'),'priority':n.get('priority'),"
            "'metered':bool(n.get('metered')),'last':bool(n.get('last')),"
            "'open':not n.get('password')})\n"
            "_e({'saved':r})\n")
        return r["saved"]

    def wifi_forget(self, ssid):
        """Returns (removed, from_deploy) — from_deploy: the network is also
        in the deploy-time secrets and will be re-added at the next boot."""
        r = self.result(
            "from oreoWare import wifi as w\n"
            "d=False\n"
            "try:\n"
            " d=%(s)s in [n.get('ssid') for n in w._secrets_networks()]\n"
            "except Exception:\n"
            " pass\n"
            "_e({'removed':bool(w.remove_saved(%(s)s)),'deploy':d})\n" % {"s": lit(ssid)})
        return r["removed"], r["deploy"]

    def wifi_online(self, timeout_s=90):
        """Bring Wi-Fi up from the saved list (for App Store calls)."""
        return self.result(
            "from oreoWare import wifi as w\n"
            "ok=bool(w.is_connected())\n"
            "if not ok:\n"
            " try:\n"
            "  ok=bool(w.connect_from_config())\n"
            " except Exception as x:\n"
            "  print('[wifi]',x)\n"
            "_e({'online':ok,'ip':w.ip() if ok else None})\n", timeout=timeout_s)

    # ── apps (oreoOS.store) ──────────────────────────────────────────
    def apps(self):
        """{'installed': [...], 'catalogue': [...]} from flash (no network)."""
        return self.result(
            "import os\n"
            "from oreoOS import store as S\n"
            "inst=[]\n"
            "try:\n"
            " names=os.listdir('/apps')\n"
            "except OSError:\n"
            " names=[]\n"
            "for n in sorted(names):\n"
            " if n in S.HIDDEN_INSTALLED:\n"
            "  continue\n"
            " m=S.installed_manifest(n)\n"
            " if not m:\n"
            "  continue\n"
            " inst.append({'id':n,'name':m.get('name',n),'version':S.installed_version(n),"
            "'default':S.is_default(n)})\n"
            "cat=[]\n"
            "for e in S.catalogue()[0]:\n"
            " cat.append({'id':e['id'],'name':e['name'],'version':e['version'],"
            "'size':e['size'],'tagline':e['tagline'],'category':e['category'],"
            "'state':S.app_state(e)})\n"
            "_e({'installed':inst,'catalogue':cat})\n", timeout=30)

    def apps_refresh(self):
        r = self.result(
            "from oreoOS import store as S\n"
            "ok=S.refresh()\n"
            "_e({'ok':bool(ok),'error':S.last_error()})\n", timeout=60)
        return r["ok"], r.get("error") or ""

    def app_install(self, app_id, progress=None, screen=None):
        def on_event(ev):
            if progress and "p" in ev:
                progress(ev["p"], ev.get("t") or 0)
        show, step = "", ""
        if screen:
            self._screen = True
            args = "%s,%s" % (lit(str(screen[0])), lit(str(screen[1] or "")))
            show = HOSTUI_DEF + "_hq=[-1]\n_hs(%s,None)\n" % args
            # redraw in 5 % steps, not for every block downloaded
            step = (" q=int(a*20/t) if t else 0\n"
                    " if q!=_hq[0]:\n"
                    "  _hq[0]=q\n"
                    "  _hs(%s,a/t if t else None)\n" % args)
        r = self.result(
            show +
            "from oreoOS import store as S\n"
            "def _cb(a,t,l):\n"
            " _e({'p':a,'t':t})\n" + step +
            "ok,msg=S.install(%s,_cb)\n"
            "_e({'ok':bool(ok),'msg':msg})\n" % lit(app_id),
            timeout=90, on_event=on_event)
        return r["ok"], r["msg"]

    def app_remove(self, app_id):
        r = self.result(
            "from oreoOS import store as S\n"
            "ok,msg=S.uninstall(%s)\n"
            "_e({'ok':bool(ok),'msg':msg})\n" % lit(app_id), timeout=60)
        return r["ok"], r["msg"]

    # ── FaleraOS updates (oreoOS.ota) ──────────────────────────────────
    # These drive the badge's own OTA client, the same functions its
    # Updates page calls: latest_version/check -> peek -> download into
    # /_ota -> apply_pending. The badge downloads from GitHub over its own
    # Wi-Fi; the computer only steers. State between steps (_rel, _pk)
    # lives in the raw REPL's globals for the session.

    def ota_status(self):
        """{'current', 'pending', 'pending_version'} without the network."""
        return self.result(
            "from oreoOS import ota as O\n"
            "from oreoOS import config as _c\n"
            "r={'current':_c.VERSION,'pending':bool(O.is_pending()),'pending_version':None}\n"
            "if r['pending']:\n"
            " try:\n"
            "  _g=open(O.STAGE_DIR+'/'+O.MANIFEST_NAME)\n"
            "  r['pending_version']=_j.load(_g).get('version')\n"
            "  _g.close()\n"
            " except Exception:\n"
            "  pass\n"
            "_e(r)\n")

    def ota_check(self, channel="stable"):
        """Latest release on `channel` vs the badge's version.

        {'current', 'latest', 'newer', 'major', 'tag'}, or {'error'} when
        GitHub could not be reached."""
        return self.result(
            "from oreoOS import ota as O\n"
            "from oreoOS import config as _c\n"
            "_cur=_c.VERSION\n"
            "_lv=getattr(O,'latest_version',None)\n"
            "if _lv:\n"
            " _v,_rel=_lv(%(ch)s)\n"
            "else:\n"
            " _rel=O.check(%(ch)s)\n"
            " _v=_rel.get('version') if _rel else None\n"
            "if not _v or not _rel:\n"
            " _et=getattr(O,'error_text',None)\n"
            " _e({'error':(_et() if _et else '') or 'no answer from GitHub','current':_cur})\n"
            "else:\n"
            " _cmp=getattr(O,'compare_version',None)\n"
            " _n=(_cmp(_v,_cur)>0) if _cmp else O._newer(_v,_cur)\n"
            " _e({'current':_cur,'latest':_v,'newer':bool(_n),'major':bool(_rel.get('major')),"
            "'tag':_rel.get('tag')})\n" % {"ch": lit(channel)}, timeout=60)

    def ota_peek(self):
        """Which files the release changes. Needs ota_check() first.

        Hashes every FaleraOS file on the badge, so it can take a while."""
        r = self.result(
            "_pk=O.peek(_rel)\n"
            "if not _pk:\n"
            " _et=getattr(O,'error_text',None)\n"
            " _e({'error':(_et() if _et else '') or 'could not read the release manifest'})\n"
            "else:\n"
            " _e({'files':len(_pk['changed']),'bytes':_pk['bytes'],'unchanged':_pk['unchanged'],"
            "'major':bool(_pk['major']),'version':_pk['manifest'].get('version')})\n",
            timeout=300)
        return r

    def ota_download(self, progress=None, screen=None, size=0, files=0):
        """Download the changed files into /_ota. progress(i, total, path).
        Returns True when the update is staged and sealed; on failure
        self.ota_error says why (file, host, reason) when the OS can tell.
        screen=title: the badge shows each file on its screen. size and
        files (from ota_peek) scale the time allowed: the badge streams
        a few tens of KB/s over TLS."""
        self.ota_error = ""
        def on_event(ev):
            if progress and "i" in ev:
                progress(ev["i"], ev.get("t") or 0, ev.get("p") or "")
        show, step = "", ""
        if screen:
            self._screen = True
            show = HOSTUI_DEF
            step = " _hs(%s,p,i/t if t else None)\n" % lit(str(screen))
        r = self.result(
            show +
            "def _cb(i,t,p):\n"
            " _e({'i':i,'t':t,'p':p})\n" + step +
            "_ok=O.download(_pk,_cb)\n"
            "_er=''\n"
            "if not _ok:\n"
            " _et=getattr(O,'error_text',None)\n"
            " _er=_et() if _et else ''\n"
            " try:\n"
            "  O.discard_pending()\n"
            " except Exception:\n"
            "  pass\n"
            "_e({'ok':bool(_ok),'err':_er})\n",
            timeout=max(120, 60 + int(size) // 4096 + 3 * int(files)),
            on_event=on_event)
        self.ota_error = r.get("err") or ""
        return bool(r.get("ok"))

    def ota_apply(self, progress=None, screen=None):
        """Move the staged files into place (what the badge does at boot).
        Returns the applied version, or None (the staged update stays and
        the next boot retries it). screen=title: the badge shows each file
        on its screen (hostui is imported before any file moves)."""
        def on_event(ev):
            if progress and "a" in ev:
                progress(ev["a"], ev.get("p") or "")
        show, step = "", ""
        if screen:
            self._screen = True
            show = HOSTUI_DEF + "_hs(%s,'',None)\n" % lit(str(screen))
            step = " _hs(%s,p,None)\n" % lit(str(screen))
        r = self.result(
            show +
            "from oreoOS import ota as O\n"
            "def _cb(i,p):\n"
            " _e({'a':i,'p':p})\n" + step +
            "_e({'applied':O.apply_pending(_cb)})\n", timeout=120, on_event=on_event)
        return r.get("applied")

    def ota_discard(self):
        self.result("from oreoOS import ota as O\nO.discard_pending()\n_e({'ok':1})\n")

    # ── running code ─────────────────────────────────────────────────
    def run_source(self, source, on_output):
        """Run a script, streaming its output; no timeout."""
        self.connect()
        if isinstance(source, str):
            source = source.encode("utf-8")
        return self.link.exec(source, timeout=None, consumer=on_output)
