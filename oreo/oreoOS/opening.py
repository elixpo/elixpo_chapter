"""Feedback while an app opens: every press answers at once.

Opening an app costs real time on the badge: MicroPython reads and
compiles the app's .py files when it imports them (every open, since an
app's modules are unloaded when it exits), then the app's on_enter runs.
The launcher used to show nothing until all of that was done, so a press
looked ignored for seconds. Now:

  1. ack(): in the same frame as the press, before that frame is
     presented, the OS draws an "Opening <name>" chip over the bottom of
     the screen. It stays there while the old app exits and the new one
     imports, so the press is acknowledged even when nothing else can
     move.
  2. Loader: the LOADING panel (the app's name, its author, a spinner)
     covers the screen once the open has taken REVEAL_MS, drawn by a
     small `_thread` animator straight to the panel with push_buffer()
     (the same mechanism and SPI-bus guard as oreoOS.busy, whose Busy it
     extends). An open that finishes sooner shows no panel at all, so a
     quick open never flashes one.
     An app that took longer than SLOW_MS the last time it opened gets
     the panel at once, drawn by the UI thread before the import starts:
     compiling holds MicroPython's GIL, so the animator could otherwise
     only reveal the panel after the compile had finished.
  3. The app's first present() stops the animator (busy's guard), and
     the first frame repaints the whole screen. A failed import or
     on_enter stops it too, and the crash screen shows the error.

Everything here is best effort: a failure draws nothing and never stops
an app from opening.
"""

import time

from oreoOS import api, busy, theme

SW = api.SCREEN_W
SH = api.SCREEN_H

REVEAL_MS = 120          # opens quicker than this show no LOADING panel
SLOW_MS = 250            # last open slower than this: panel straight away
BAND = 24                # rows the animator draws and pushes at a time
SPIN_Y = 168             # spinner box top, below the byline
SPIN_X = (SW - busy.SPIN) // 2
SPIN_DIM = api.rgb(255, 170, 176)

CHIP_H = 20
CHIP_Y = SH - CHIP_H - 4

# How long each app took to open last time (ms), this boot only.
_last_ms = {}


def note(app_dir, ms):
    """Remember how long app_dir took to open (import + on_enter)."""
    if app_dir:
        _last_ms[app_dir] = ms


def known_slow(app_dir):
    return _last_ms.get(app_dir, 0) > SLOW_MS


def _ticks():
    return busy._ticks()


def since(t0):
    return busy._diff(_ticks(), t0)


# ── 1. the press acknowledgement ─────────────────────────────────────────────

def chip_rect(label):
    text = "Opening " + busy.clip(label or "", 24)
    w = len(text) * 8 + 24
    return (SW - w) // 2, CHIP_Y, w, CHIP_H, text


def ack(display, label):
    """Draw the "Opening <label>" chip into the framebuffer and return
    its rectangle (x, y, w, h), or None. The caller presents it."""
    try:
        x, y, w, h, text = chip_rect(label)
        display.rect(x, y, w, h, theme.TEXT_BRIGHT, fill=True)
        display.rect(x + 1, y + 1, w - 2, h - 2, theme.PRIMARY, fill=True)
        display.text(text, x + 12, y + (h - 8) // 2, api.WHITE)
        return (x, y, w, h)
    except Exception:
        return None


# ── 2. the LOADING panel ─────────────────────────────────────────────────────

def panel_lines(label, author):
    """[(text, x, y, scale)] of the panel, in screen coordinates."""
    label = (label or "")[:16].upper()
    cy = SH // 2
    out = [("LOADING", (SW - 7 * 16) // 2, cy - 16, 2),
           (label, (SW - len(label) * 8) // 2, cy + 6, 1)]
    if author:
        by = "By @" + author[:24]
        out.append((by, (SW - len(by) * 8) // 2, cy + 24, 1))
    hint = "HOME to cancel"
    out.append((hint, (SW - len(hint) * 8) // 2, SH - 22, 1))
    return out


def paint_panel(cv, label, author, oy=0, h=SH):
    """Paint the panel rows oy..oy+h onto canvas `cv`, whose row 0 is
    screen row oy. cv has rect(x, y, w, h, c) and text(s, x, y, c, scale)."""
    cv.rect(0, 0, SW, h, theme.PRIMARY)
    for text, x, y, scale in panel_lines(label, author):
        th = 8 * scale
        if y + th <= oy or y >= oy + h:
            continue
        cv.text(text, x, y - oy, api.WHITE, scale)


class _DispCanvas:
    def __init__(self, d):
        self.d = d

    def rect(self, x, y, w, h, c):
        self.d.rect(x, y, w, h, c, fill=True)

    def text(self, s, x, y, c, scale=1):
        if scale == 1:
            self.d.text(s, x, y, c)
        else:
            self.d.text(s, x, y, c, scale=scale)


class _BandCanvas:
    """Canvas over a framebuf band (colours byte-swapped like the
    display's), with scale-2 text for the LOADING title."""

    def __init__(self, fb):
        self.fb = fb
        self._mask = None

    def rect(self, x, y, w, h, c):
        self.fb.fill_rect(x, y, w, h, busy._swap(c))

    def text(self, s, x, y, c, scale=1):
        c = busy._swap(c)
        if scale == 1:
            self.fb.text(s, x, y, c)
            return
        import framebuf
        w = 8 * len(s)
        buf = bytearray(((w + 7) // 8) * 8)
        m = framebuf.FrameBuffer(buf, w, 8, framebuf.MONO_HLSB)
        m.text(s, 0, 0, 1)
        for py in range(8):
            for px in range(w):
                if m.pixel(px, py):
                    self.fb.fill_rect(x + px * scale, y + py * scale,
                                      scale, scale, c)


class Loader(busy.Busy):
    """The LOADING panel and its spinner, on busy's animator thread.

    delay_ms: when the panel appears (it wipes down band by band, like
    the old slide). revealed=True: the UI thread already drew the panel
    (reveal_now), so only the spinner turns."""

    def __init__(self, display, label, author=None, delay_ms=REVEAL_MS,
                 revealed=False):
        busy.Busy.__init__(self, display, title=label, delay_ms=delay_ms,
                           card=False, at=(0, 0))
        self.label = label or ""
        self.author = author
        self.revealed = revealed
        self.w, self.h = SW, BAND
        self._band = 0

    @property
    def shown(self):
        return self.revealed or self.drawn

    def _render_offscreen(self):
        cv = self._cv
        if not self.revealed:
            y = self._band * BAND
            h = min(BAND, SH - y)
            paint_panel(_BandCanvas(cv.fb), self.label, self.author, y, h)
            if y < SPIN_Y + busy.SPIN and SPIN_Y < y + h:
                busy.draw_spinner(cv, SPIN_X, SPIN_Y - y, self.step,
                                  api.WHITE, theme.PRIMARY, SPIN_DIM)
            self.d.push_buffer(self._buf, 0, y, SW, h)
            self.drawn = True
            self._band += 1
            if self._band * BAND >= SH:
                self.revealed = True
            return
        busy.draw_spinner(cv, SPIN_X, 0, self.step, api.WHITE, theme.PRIMARY,
                          SPIN_DIM)
        self.d.push_buffer(self._buf, SPIN_X, SPIN_Y, busy.SPIN, busy.SPIN,
                           SPIN_X, 0, SW)
        self.drawn = True
        self.step += 1

    def _run(self):
        # As busy's, but the wipe pushes its bands back to back.
        lock = self._lock
        try:
            while self.delay_ms and not self._stop and \
                    since(self._t0) < self.delay_ms:
                busy._sleep_ms(10)
            while True:
                lock.acquire()
                try:
                    if self._stop:
                        break
                    wiping = not self.revealed
                    self._render_offscreen()
                finally:
                    lock.release()
                busy._sleep_ms(2 if wiping else busy.SPIN_MS)
        except Exception as e:
            self.error = str(e)

    def _draw_inline(self, force=False):
        # No thread (host, or it could not start): the UI thread paints
        # the whole panel once, through the display.
        if self.revealed:
            return
        try:
            paint_panel(_DispCanvas(self.d), self.label, self.author)
            self.revealed = True
            self.drawn = True
            self._present()
        except Exception as e:
            self.error = str(e)


def reveal_now(display, label, author=None):
    """Draw the panel from the UI thread and present it, then start the
    spinner. Returns the running Loader, or None."""
    try:
        paint_panel(_DispCanvas(display), label, author)
        display.present()
    except Exception:
        return None
    try:
        return Loader(display, label, author, delay_ms=0,
                      revealed=True).start()
    except Exception:
        return None


def begin(display, app_dir, label, author=None):
    """Start the feedback for opening app_dir: the panel at once when the
    app was slow last time, otherwise after REVEAL_MS. Returns the Loader
    (stop it with .stop(restore=False)), or None."""
    if display is None:
        return None
    if known_slow(app_dir):
        return reveal_now(display, label, author)
    try:
        return Loader(display, label, author).start()
    except Exception:
        return None
