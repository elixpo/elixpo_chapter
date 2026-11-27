"""Host-driven screen: what the badge shows while a computer drives it.

The falera CLI stops FaleraOS and works through the raw REPL (copying files,
installing apps). Nothing on the badge runs between its commands, so the
screen would freeze on the last FaleraOS frame. The CLI calls this module
instead, guarded for older FaleraOS:

    try:
        from oreoOS import hostui
        hostui.show("Receiving files", "photo.jpg", 0.4)
    except ImportError:
        pass

show(title, detail="", progress=None)
    A "Connected to computer" frame with the title, a detail line and a
    progress bar. progress is 0.0-1.0, or None when the length is unknown;
    then a static busy glyph is drawn (nothing could animate it between
    REPL commands).
clear()
    Blank the screen and forget the frame; the next show() draws it whole.

Rules this module keeps:
- It works without FaleraOS running: it sets up the SPI bus and the panel
  itself (oreoWare._st7789's resume(): no reset, so no blank flash, and a
  panel that lost its setup is configured again), turns the backlight on,
  and draws straight to the panel, without the 153 KB framebuffer.
- It is cheap enough to call for every chunk: after the first frame only
  the parts whose content changed are sent (the bar, when its filled width
  moves; the percentage, when it changes; the title or detail line, when
  their text changes). Unchanged calls send nothing.
- It never raises; every error is swallowed.
- It keeps one 12.8 KB strip buffer while in use (released by clear()).

Do not call it while FaleraOS is running: FaleraOS owns the display then.
"""

SW = 320
SH = 240
STRIP_H = 20


def _c(r, g, b):
    """RGB565, byte-swapped the way the panel expects from a framebuf."""
    v = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)
    return ((v & 0xFF) << 8) | (v >> 8)


# The FaleraOS theme (oreoOS/theme.py), kept here so drawing needs no other
# FaleraOS module.
BG = _c(255, 248, 235)
HEAD = _c(255, 93, 104)
WHITE = _c(255, 255, 255)
TEXT = _c(38, 38, 48)
DIM = _c(100, 80, 70)
TRACK = _c(200, 160, 140)
BAR = _c(255, 93, 104)
GOLD = _c(255, 190, 30)

HEAD_H = 36
TITLE_Y = 64            # strip rows (each STRIP_H tall at most)
DETAIL_Y = 92
BAR_Y = 120
PCT_Y = 146
FOOT_Y = 212
BAR_X = 30
BAR_W = SW - 2 * BAR_X
BAR_H = 12

HEADING = "CONNECTED TO COMPUTER"
FOOTER = "Keep the USB cable connected"

_st = {}                # panel, buf, fb and what is on screen


def _panel():
    p = _st.get("panel")
    if p is not None:
        return p
    try:                        # a native boot splash still playing
        import _oreo_rv565      # (oreoOS/splash.py) owns the panel
        _oreo_rv565.splash_stop()
    except Exception:
        pass
    from machine import Pin, SPI
    from oreoWare import pins
    from oreoWare._st7789 import ST7789
    spi = SPI(1, baudrate=pins.DISPLAY_BAUD, polarity=0, phase=0,
              sck=Pin(pins.DISPLAY_SCK), mosi=Pin(pins.DISPLAY_MOSI))
    p = ST7789(spi,
               dc=Pin(pins.DISPLAY_DC, Pin.OUT),
               cs=Pin(pins.DISPLAY_CS, Pin.OUT, value=1),
               rst=Pin(pins.DISPLAY_RESET, Pin.OUT, value=1),
               bl=Pin(pins.DISPLAY_BL, Pin.OUT, value=1))
    resume = getattr(p, "resume", None)
    if resume is not None:
        resume()
    else:                       # an older driver: full init (one flash)
        p.init()
    try:
        p.bl(1)
    except Exception:
        pass
    _st["panel"] = p
    return p


def _strip():
    fb = _st.get("fb")
    if fb is None:
        import framebuf
        buf = bytearray(SW * STRIP_H * 2)
        fb = framebuf.FrameBuffer(buf, SW, STRIP_H, framebuf.RGB565)
        _st["buf"] = buf
        _st["fb"] = fb
    return fb


def _push(y, h):
    """Send the first h rows of the strip to screen rows y..y+h-1."""
    p = _panel()
    p.set_window(0, y, SW - 1, y + h - 1)
    p.cs(0)
    p.dc(0)
    p.spi.write(b"\x2C")
    p.dc(1)
    p.spi.write(memoryview(_st["buf"])[:SW * h * 2])
    p.cs(1)


def _fill(y, h, color):
    fb = _strip()
    fb.fill(color)
    while h > 0:
        n = min(h, STRIP_H)
        _push(y, n)
        y += n
        h -= n


def _clip(s, n):
    s = str(s or "")
    return s if len(s) <= n else s[:n - 1] + "~"


def _text2(fb, s, x, y, color):
    """8x8 text at twice the size: drawn once into a 1-bit mask, then
    every set bit becomes a 2x2 block."""
    import framebuf
    w = len(s) * 8
    mask = bytearray((w + 7) // 8 * 8)
    m = framebuf.FrameBuffer(mask, w, 8, framebuf.MONO_HLSB)
    m.text(s, 0, 0, 1)
    for py in range(8):
        for px in range(w):
            if m.pixel(px, py):
                fb.fill_rect(x + px * 2, y + py * 2, 2, 2, color)


def _line(y, h, s, color, big=False):
    fb = _strip()
    fb.fill(BG)
    if s:
        if big:
            _text2(fb, s, (SW - len(s) * 16) // 2, (h - 16) // 2, color)
        else:
            fb.text(s, (SW - len(s) * 8) // 2, (h - 8) // 2, color)
    _push(y, h)


def _glyph(fb, cx, y):
    """Static hourglass, 14 x 18, centred on cx."""
    x = cx - 7
    fb.fill_rect(x, y, 14, 2, TEXT)
    fb.fill_rect(x, y + 16, 14, 2, TEXT)
    for i in range(7):                    # the two glass halves
        fb.fill_rect(x + 1 + i, y + 2 + i, 12 - 2 * i, 1, DIM)
        fb.fill_rect(x + 1 + i, y + 15 - i, 12 - 2 * i, 1, DIM)
    fb.fill_rect(x + 4, y + 2, 6, 3, GOLD)     # sand, top
    fb.fill_rect(x + 3, y + 12, 8, 3, GOLD)    # sand, bottom
    fb.fill_rect(cx - 1, y + 8, 2, 4, GOLD)    # falling grain


def _bar(fill):
    fb = _strip()
    fb.fill(BG)
    top = (STRIP_H - BAR_H) // 2
    if fill is None:
        _glyph(fb, SW // 2, 1)
    else:
        fb.fill_rect(BAR_X, top, BAR_W, BAR_H, TRACK)
        if fill:
            fb.fill_rect(BAR_X, top, fill, BAR_H, BAR)
    _push(BAR_Y, STRIP_H)


def _frame():
    """The parts that never change: background, heading and footer."""
    _fill(0, SH, BG)
    fb = _strip()
    fb.fill(HEAD)
    _usb_mark(fb, 14, 10)
    fb.text(HEADING, (SW - len(HEADING) * 8) // 2, 12, WHITE)
    _push(0, STRIP_H)
    fb.fill(HEAD)
    _push(STRIP_H, HEAD_H - STRIP_H)
    _line(FOOT_Y, 12, FOOTER, DIM)


def _usb_mark(fb, x, y):
    """A small USB plug, 16 x 9, in white."""
    fb.fill_rect(x, y + 3, 10, 3, WHITE)       # cable
    fb.fill_rect(x + 10, y, 6, 9, WHITE)       # plug
    fb.fill_rect(x + 12, y + 2, 2, 2, HEAD)
    fb.fill_rect(x + 12, y + 5, 2, 2, HEAD)


def _show(title, detail, progress):
    title = _clip(title, SW // 16)
    detail = _clip(detail, SW // 8 - 2)
    if progress is None:
        fill, pct = None, ""
    else:
        frac = float(progress)
        frac = 0.0 if frac < 0 else 1.0 if frac > 1 else frac
        fill, pct = int(BAR_W * frac), "%d%%" % int(frac * 100)
    if not _st.get("drawn"):
        _frame()
        _st["drawn"] = True
        _st["title"] = _st["detail"] = _st["fill"] = _st["pct"] = -1
    if title != _st["title"]:
        _line(TITLE_Y, STRIP_H, title, TEXT, big=True)
        _st["title"] = title
    if detail != _st["detail"]:
        _line(DETAIL_Y, 12, detail, DIM)
        _st["detail"] = detail
    if fill != _st["fill"]:
        _bar(fill)
        _st["fill"] = fill
    if pct != _st["pct"]:
        _line(PCT_Y, 12, pct or "Working", DIM)
        _st["pct"] = pct


def show(title, detail="", progress=None):
    """Draw or update the "Connected to computer" frame. Never raises."""
    try:
        _show(title, detail, progress)
    except Exception:
        _st["drawn"] = False        # redraw it whole next time


def clear():
    """Blank the screen and drop the frame and the strip buffer. Never
    raises."""
    try:
        if _st.get("panel") is not None:
            _fill(0, SH, 0)
    except Exception:
        pass
    _st["drawn"] = False
    _st.pop("fb", None)
    _st.pop("buf", None)
