"""`falera screenshot`: the badge's screen as a PNG, pixel for pixel.

FaleraOS draws every frame into one framebuffer (oreoWare/display.py
Display._buf, 320x240) and sends it to the panel as it is: big-endian
RGB565, pixel i = buf[2i] << 8 | buf[2i+1]. display.current() returns the
Display that owns it.

The CLI stops FaleraOS with Ctrl-C but without the usual soft reset (a
soft reset clears the heap, framebuffer included), reads the buffer as
`@B:` lines, checks it with SHA-256 and writes a PNG here with the
standard library only. FaleraOS is restarted afterwards like after any
other command. oreoOS/hostui.py (the "Connected to computer" screen)
draws to the panel without touching this buffer, and this command does
not draw it anyway.

A FaleraOS older than display.current() (v2.0.18 and earlier) is read
through oreoOS.busy._display instead: the launcher binds the same Display
there at boot (busy.bind). Only a FaleraOS with neither is asked to update.
"""

import hashlib
import struct
import zlib

from .badge import B64, PULL_CHUNK
from .errors import BadgeError, OreoError

UPDATE_HINT = "update FaleraOS (`falera update`); screenshots need display.current()"
MAX_SCALE = 8

# 5- and 6-bit channels widened to 8 bits by repeating their top bits, so
# 0 -> 0 and full -> 255 exactly (31 -> 255, 63 -> 255).
_R5 = bytes((v << 3) | (v >> 2) for v in range(32))
_G6 = bytes((v << 2) | (v >> 4) for v in range(64))


def capture_code(chunk=PULL_CHUNK):
    """The snippet that sends the framebuffer. The Display comes from
    oreoWare.display.current() or, on a FaleraOS without it (v2.0.18 and
    earlier), from oreoOS.busy._display, which the launcher binds at boot.
    Events: {'old': 1} (neither exists), {'none': 1} (no display yet),
    else a header {'w', 'h', 'n', 'dirty', 'sha', 'src'} before the @B:
    lines and {'done': n} after them."""
    return B64 + (
        "_d=None\n"
        "_src=None\n"
        "try:\n"
        " from oreoWare import display as _dm\n"
        " _d=_dm.current()\n"
        " _src='display'\n"
        "except (ImportError, AttributeError):\n"
        " pass\n"
        "if _d is None:\n"
        " try:\n"
        "  from oreoOS import busy as _bz\n"
        "  _d=_bz._display\n"
        "  _src=_src or 'busy'\n"
        " except (ImportError, AttributeError):\n"
        "  pass\n"
        "_fb=getattr(_d,'_buf',None) if _d is not None else None\n"
        "if _src is None:\n"
        " _e({'old':1})\n"
        "elif _fb is None:\n"
        " _e({'none':1})\n"
        "else:\n"
        " try:\n"
        "  from oreoOS import api as _a\n"
        "  _w,_h=_a.SCREEN_W,_a.SCREEN_H\n"
        " except Exception:\n"
        "  _w,_h=320,240\n"
        " try:\n"
        "  import hashlib as _hl\n"
        "  _s=_b.hexlify(_hl.sha256(_fb).digest()).decode()\n"
        " except Exception:\n"
        "  _s=None\n"
        " _n=len(_fb)\n"
        " _e({'w':_w,'h':_h,'n':_n,'dirty':bool(getattr(_d,'_dirty',False)),'sha':_s,'src':_src})\n"
        " _mv=memoryview(_fb)\n"
        " _i=0\n"
        " while _i<_n:\n"
        "  print('@B:'+_b.b2a_base64(_mv[_i:_i+%d]).decode().strip())\n"
        "  _i+=%d\n"
        " _e({'done':_n})\n" % (chunk, chunk))


def capture(b, attempts=2):
    """(width, height, RGB565 bytes, dirty) from the badge. Must be the
    first thing the session does: entering with a soft reset would have
    cleared the framebuffer."""
    if b.entered:
        raise OreoError("the screen can only be read before anything else runs on the badge",
                        hint="run `falera screenshot` on its own")
    b.link.enter(soft_reset=False)
    b.entered = True
    last = None
    for _ in range(max(1, attempts)):
        buf = bytearray()
        parser = b.run(capture_code(), timeout=60, on_data=buf.extend)
        events = parser.events
        if any(e.get("old") for e in events):
            raise OreoError("this FaleraOS cannot send its screen (it is older than "
                            "`falera screenshot`)", hint=UPDATE_HINT)
        if any(e.get("none") for e in events):
            raise OreoError("FaleraOS has not drawn anything yet (no display)",
                            hint="wait until the home screen shows, then try again")
        head = next((e for e in events if "n" in e and "w" in e), None)
        if head is None:
            raise BadgeError("the badge sent no screen", detail="\n".join(parser.text))
        w, h, n = int(head["w"]), int(head["h"]), int(head["n"])
        if n != w * h * 2:
            raise OreoError("the badge's framebuffer is %d bytes, not %dx%d RGB565" % (n, w, h))
        ok = len(buf) == n and (head.get("sha") is None or
                                hashlib.sha256(bytes(buf)).hexdigest() == head["sha"])
        if ok:
            return w, h, bytes(buf), bool(head.get("dirty"))
        last = "received %d of %d bytes" % (len(buf), n) if len(buf) != n \
            else "the SHA-256 check failed"
    raise OreoError("the screen did not arrive intact (%s)" % last,
                    hint="try again; `falera -v screenshot` shows what the badge printed")


def rgb565_to_rgb888(data):
    """Big-endian RGB565 bytes -> RGB888 bytes, with exact bit expansion."""
    n = len(data) // 2
    out = bytearray(n * 3)
    r5, g6 = _R5, _G6
    o = 0
    for i in range(0, n * 2, 2):
        v = (data[i] << 8) | data[i + 1]
        out[o] = r5[v >> 11]
        out[o + 1] = g6[(v >> 5) & 0x3F]
        out[o + 2] = r5[v & 0x1F]
        o += 3
    return bytes(out)


def scale_rgb(rgb, w, h, scale):
    """Nearest-neighbour integer scale of RGB888 rows: (bytes, w, h)."""
    if scale == 1:
        return rgb, w, h
    stride = w * 3
    rows = []
    for y in range(h):
        row = rgb[y * stride:(y + 1) * stride]
        wide = b"".join(row[x:x + 3] * scale for x in range(0, stride, 3))
        rows.extend([wide] * scale)
    return b"".join(rows), w * scale, h * scale


def _chunk(kind, data):
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def png_bytes(rgb, w, h):
    """An 8-bit RGB PNG (no filter, zlib level 9) of RGB888 rows."""
    if len(rgb) != w * h * 3:
        raise ValueError("expected %d bytes for %dx%d RGB, got %d" % (w * h * 3, w, h, len(rgb)))
    stride = w * 3
    raw = b"".join(b"\x00" + rgb[y * stride:(y + 1) * stride] for y in range(h))
    return (b"\x89PNG\r\n\x1a\n"
            + _chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + _chunk(b"IDAT", zlib.compress(raw, 9))
            + _chunk(b"IEND", b""))


def to_png(data, w, h, scale=1):
    """Big-endian RGB565 framebuffer -> PNG bytes, scaled `scale` times."""
    rgb, w, h = scale_rgb(rgb565_to_rgb888(data), w, h, scale)
    return png_bytes(rgb, w, h)
