"""Loading animation for slow work that has to run on the UI thread.

    from oreoOS import busy

    with busy.show("Installing Racer", "Downloading") as b:
        for i, path in enumerate(files):
            fetch(path)
            b.progress((i + 1) / len(files), path)
    self._dirty = True            # repaint the app afterwards

or, without `with`: busy.start(title, detail) / busy.progress(frac,
detail) / busy.detail(text) / busy.stop(). A card in the middle of the
screen shows a spinner, the title, a detail line and, when a fraction
(0.0-1.0) is given, a progress bar. progress=None means "no idea how
long": spinner only.

How it animates while the UI thread is blocked (and why it is safe):

  The UI thread is busy inside the slow call, so the animation runs on a
  small `_thread` task (the animator). The animator never touches the
  display's framebuffer: it draws the card into its own off-screen buffer
  (about 41 KB) and writes that straight to the panel with
  Display.push_buffer(), re-sending only the 24x24 spinner on each tick.
  So nothing the UI thread draws can be torn by it, and it cannot leave
  pixels in the app's frame.

  The SPI bus is the one thing both could use. While the animator runs,
  display.present() and present_rect() are wrapped: the first time the UI
  thread presents (it has started drawing again), the animator is stopped
  before the flush, and stop() waits on a lock the animator holds for
  each draw, so the two never write to the panel at once. No other code
  uses that SPI bus.

  stop() then flushes the framebuffer once (restore=True), which puts back
  exactly what was on the screen before the card. Pass restore=False when
  a full frame follows anyway (inside draw(), or right before a reset).

  Network waits release the GIL, so the spinner turns smoothly during
  DNS, connects and reads. Long pure-C work that holds the GIL (the TLS
  key exchange, a large flash erase) can pause it for a moment.

  Without `_thread`, if the thread cannot start, or on a display without
  push_buffer() (host tests), the card is drawn into the framebuffer by
  the calling thread instead, and moves on progress(), detail() and
  pump() calls (at most every SPIN_MS). The app must repaint afterwards
  in that case too.

delay_ms=N shows nothing for the first N ms, so work that turns out to be
quick does not flash a card.

busy.spinner(display, x, y, fg, bg) is the same animator without the card:
just the spinner at (x, y). The launcher uses it on the LOADING slide while
an app's on_enter() runs (SHOW_LOADING apps).

Only one animation runs at a time; starting one stops the previous one.
Every call is safe with display=None (it then does nothing).
"""

import time

from oreoOS import api, theme

SW = api.SCREEN_W
SH = api.SCREEN_H

SPIN_MS = 90                 # one spinner step
SPIN = 24                    # spinner box (px)
CARD_W = 248
CARD_H = 84
CARD_X = (SW - CARD_W) // 2
CARD_Y = (SH - CARD_H) // 2
PAD = 12
TEXT_X = PAD + SPIN + 8      # title and detail, right of the spinner
TEXT_CHARS = (CARD_W - TEXT_X - PAD) // 8
BAR_Y = 54
BAR_H = 8
STACK = 8 * 1024             # framebuf drawing only; no TLS on this thread

_display = None              # bound by the launcher (bind())
_current = None              # the animation on screen, if any

# Eight dots on a circle of radius 8 around the box centre (12, 12),
# clockwise from the top; each dot is 4x4.
_DOTS = ((10, 2), (16, 4), (18, 10), (16, 16),
         (10, 18), (4, 16), (2, 10), (4, 4))


def bind(display):
    """Set the display used when a call passes none (the launcher does
    this at boot)."""
    global _display
    _display = display


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


def _sleep_ms(ms):
    try:
        time.sleep_ms(ms)
    except AttributeError:
        time.sleep(ms / 1000.0)


def _swap(c):
    return ((c & 0xFF) << 8) | ((c >> 8) & 0xFF)


def clip(s, n):
    s = s or ""
    return s if len(s) <= n else s[:n - 1] + "~"


def fraction(frac):
    """frac clamped to 0.0-1.0, or None for an unknown length."""
    if frac is None:
        return None
    try:
        frac = float(frac)
    except (TypeError, ValueError):
        return None
    return 0.0 if frac < 0 else 1.0 if frac > 1 else frac


def dot_colors(step, fg=None, dim=None):
    """Colour of each of the 8 dots at animation step `step`: the head in
    `fg`, a two-dot tail, the rest dim."""
    fg = theme.PRIMARY if fg is None else fg
    dim = theme.MUTED2 if dim is None else dim
    head = step % 8
    out = [dim] * 8
    out[head] = fg
    out[(head - 1) % 8] = theme.GOLD
    out[(head - 2) % 8] = theme.TEAL
    return out


def draw_spinner(cv, x, y, step, fg=None, bg=None, dim=None):
    """Spinner in the SPIN x SPIN box at (x, y) on canvas `cv`."""
    cv.rect(x, y, SPIN, SPIN, theme.CARD if bg is None else bg, True)
    cols = dot_colors(step, fg, dim)
    for i in range(8):
        dx, dy = _DOTS[i]
        cv.rect(x + dx, y + dy, 4, 4, cols[i], True)


def draw_card(cv, ox, oy, title, detail, frac, step):
    """The whole card with its top-left corner at (ox, oy)."""
    cv.rect(ox, oy, CARD_W, CARD_H, theme.PRIMARY, True)
    cv.rect(ox + 2, oy + 2, CARD_W - 4, CARD_H - 4, theme.CARD, True)
    draw_spinner(cv, ox + PAD, oy + PAD, step)
    cv.text(clip(title, TEXT_CHARS), ox + TEXT_X, oy + 14, theme.TEXT_BRIGHT)
    cv.text(clip(detail, TEXT_CHARS), ox + TEXT_X, oy + 30, theme.TEXT_DIM)
    bw = CARD_W - 2 * PAD
    if frac is None:
        msg = "Please wait"
        cv.text(msg, ox + (CARD_W - len(msg) * 8) // 2, oy + BAR_Y + 4,
                theme.MUTED)
        return
    cv.rect(ox + PAD, oy + BAR_Y, bw, BAR_H, theme.MUTED2, True)
    fill = int(bw * frac)
    if fill:
        cv.rect(ox + PAD, oy + BAR_Y, fill, BAR_H, theme.PRIMARY, True)
    pct = "%d%%" % int(frac * 100)
    cv.text(pct, ox + CARD_W - PAD - len(pct) * 8, oy + BAR_Y + 13,
            theme.TEXT_DIM)


class _FB:
    """Canvas over a framebuf.FrameBuffer: the display's rect/text calls,
    with colours byte-swapped like oreoWare.display does."""

    def __init__(self, fb):
        self.fb = fb

    def rect(self, x, y, w, h, c, fill=True):
        self.fb.fill_rect(x, y, w, h, _swap(c))

    def text(self, s, x, y, c):
        self.fb.text(s, x, y, _swap(c))


class _Disp:
    """Canvas over the display itself (the fallback path)."""

    def __init__(self, d):
        self.d = d

    def rect(self, x, y, w, h, c, fill=True):
        self.d.rect(x, y, w, h, c, fill=True)

    def text(self, s, x, y, c):
        self.d.text(s, x, y, c)


class Busy:
    """One loading animation. Use the module functions to make one."""

    def __init__(self, display, title="", detail="", progress=None,
                 delay_ms=0, card=True, at=None, fg=None, bg=None,
                 dim=None, use_thread=True):
        self.d = display
        self.title = title or ""
        self.text = detail or ""
        self.frac = fraction(progress)
        self.delay_ms = max(0, int(delay_ms or 0))
        self.card = card
        if card:
            self.x, self.y, self.w, self.h = CARD_X, CARD_Y, CARD_W, CARD_H
        else:
            ax, ay = at if at else ((SW - SPIN) // 2, (SH - SPIN) // 2)
            self.x, self.y, self.w, self.h = ax, ay, SPIN, SPIN
        self.fg = fg
        self.bg = bg
        self.dim = dim
        self.step = 0
        self.threaded = False
        self.drawn = False           # something reached the panel
        self.running = False
        self.error = None
        self._use_thread = use_thread
        self._stop = False
        self._lock = None
        self._buf = None
        self._cv = None
        self._full = True            # the next draw repaints everything
        self._t0 = 0
        self._last = None            # fallback: last draw (ticks)
        self._guarded = False

    # ── public ─────────────────────────────────────────────────────────
    def start(self):
        global _current
        if self.running or self.d is None:
            return self
        if _current is not None and _current is not self:
            _current.stop(restore=False)
        _current = self
        self.running = True
        self._stop = False
        self._t0 = _ticks()
        if self._use_thread and self._start_thread():
            return self
        self.threaded = False
        if not self.delay_ms:
            self._draw_inline(force=True)
        return self

    def progress(self, frac, detail=None):
        """Set the bar (0.0-1.0, None for spinner only) and, optionally,
        the detail line."""
        frac = fraction(frac)
        changed = frac != self.frac
        self.frac = frac
        if detail is not None and detail != self.text:
            self.text = detail
            changed = True
        if changed:
            self._full = True
        self._poke(changed)

    def detail(self, text):
        self.progress(self.frac, text or "")

    def pump(self):
        """Fallback path only: advance the spinner from a loop on the
        calling thread. Does nothing while the animator thread runs."""
        self._poke(False)

    def stop(self, restore=True):
        """End the animation. With restore=True and something drawn, the
        framebuffer is flushed once to put the screen back (animator
        path). Never raises."""
        global _current
        if _current is self:
            _current = None
        if not self.running:
            return
        self.running = False
        self._stop = True
        try:
            if self.threaded and self._lock is not None:
                # Waits for a draw in progress; the animator sees _stop at
                # its next look and exits without drawing again.
                self._lock.acquire()
                self._lock.release()
            self._unguard()
            if restore and self.drawn and self.threaded:
                try:
                    self.d._dirty = True
                except Exception:
                    pass
                self._present()
        except Exception as e:
            self.error = str(e)
        self._buf = None
        self._cv = None

    def __enter__(self):
        return self.start()

    def __exit__(self, *exc):
        self.stop()
        return False

    # ── animator thread ────────────────────────────────────────────────
    def _start_thread(self):
        if not hasattr(self.d, "push_buffer"):
            return False
        try:
            import _thread
            import framebuf
            self._buf = bytearray(self.w * self.h * 2)
            self._cv = _FB(framebuf.FrameBuffer(self._buf, self.w, self.h,
                                                framebuf.RGB565))
            self._lock = _thread.allocate_lock()
        except Exception:
            self._buf = self._cv = None
            return False
        self._guard()
        old = None
        try:
            try:
                old = _thread.stack_size(STACK)
            except Exception:
                old = None
            self.threaded = True
            _thread.start_new_thread(self._run, ())
        except Exception:
            self.threaded = False
            self._unguard()
            self._buf = self._cv = None
            return False
        finally:
            if old is not None:
                try:
                    _thread.stack_size(old)
                except Exception:
                    pass
        return True

    def _run(self):
        lock = self._lock
        try:
            while self.delay_ms and not self._stop and \
                    _diff(_ticks(), self._t0) < self.delay_ms:
                _sleep_ms(20)
            while True:
                lock.acquire()
                try:
                    if self._stop:
                        break
                    self._render_offscreen()
                finally:
                    lock.release()
                _sleep_ms(SPIN_MS)
        except Exception as e:
            self.error = str(e)

    def _render_offscreen(self):
        """Animator: draw into the private buffer, write it to the panel."""
        cv = self._cv
        if self.card:
            sx, sy = PAD, PAD
            if self._full:
                self._full = False
                draw_card(cv, 0, 0, self.title, self.text, self.frac,
                          self.step)
                self.d.push_buffer(self._buf, self.x, self.y, self.w, self.h)
            else:
                draw_spinner(cv, sx, sy, self.step)
                self.d.push_buffer(self._buf, self.x + sx, self.y + sy,
                                   SPIN, SPIN, sx, sy, self.w)
        else:
            draw_spinner(cv, 0, 0, self.step, self.fg, self.bg, self.dim)
            self.d.push_buffer(self._buf, self.x, self.y, SPIN, SPIN)
        self.drawn = True
        self.step += 1

    # ── fallback: draw on the calling thread ───────────────────────────
    def _poke(self, changed):
        if not self.running or self.threaded or self.d is None:
            return
        now = _ticks()
        if self.delay_ms and _diff(now, self._t0) < self.delay_ms:
            return
        if self._last is not None and _diff(now, self._last) < SPIN_MS:
            return                   # a change waits in _full for next time
        self._draw_inline(force=changed)

    def _draw_inline(self, force=False):
        d = self.d
        try:
            cv = _Disp(d)
            if self.card and (force or self._full or not self.drawn):
                self._full = False
                draw_card(cv, self.x, self.y, self.title, self.text,
                          self.frac, self.step)
                region = (self.x, self.y, self.w, self.h)
            elif self.card:
                draw_spinner(cv, self.x + PAD, self.y + PAD, self.step)
                region = (self.x + PAD, self.y + PAD, SPIN, SPIN)
            else:
                draw_spinner(cv, self.x, self.y, self.step, self.fg, self.bg,
                             self.dim)
                region = (self.x, self.y, SPIN, SPIN)
            self._present(region)
            self.drawn = True
            self.step += 1
            self._last = _ticks()
        except Exception as e:
            self.error = str(e)

    # ── the display's flush, guarded while the animator runs ───────────
    def _present(self, region=None):
        d = self.d
        cls = type(d)
        if region is None:
            fn = getattr(cls, "present", None)
            if fn is not None:
                fn(d)
            return
        fn = getattr(cls, "present_rect", None)
        if fn is not None:
            fn(d, *region)
        else:
            self._present()

    def _guard(self):
        """Make the UI thread's next present() stop the animator first."""
        d = self.d
        cls = type(d)
        me = self

        def present():
            me.stop(restore=True)
            return cls.present(d)

        def present_rect(x, y, w, h):
            me.stop(restore=True)
            return cls.present_rect(d, x, y, w, h)

        try:
            d.present = present
            d.present_rect = present_rect
            self._guarded = True
        except Exception:
            self._guarded = False

    def _unguard(self):
        if not self._guarded:
            return
        self._guarded = False
        for name in ("present", "present_rect"):
            try:
                delattr(self.d, name)
            except Exception:
                pass


# ── module API ──────────────────────────────────────────────────────────────

def show(title, detail="", progress=None, display=None, delay_ms=0):
    """A card animation, not started yet: use it with `with`, or call
    .start(). display defaults to the one bind() set."""
    return Busy(display if display is not None else _display, title, detail,
                progress, delay_ms)


def start(title, detail="", progress=None, display=None, delay_ms=0):
    """Show the card now (stopping any other animation) and return it."""
    return show(title, detail, progress, display, delay_ms).start()


def spinner(display, x, y, fg=None, bg=None, dim=None, delay_ms=0):
    """Start a spinner alone, its 24x24 box at (x, y), and return it."""
    return Busy(display, delay_ms=delay_ms, card=False, at=(x, y),
                fg=fg, bg=bg, dim=dim).start()


def progress(frac, detail=None):
    if _current is not None:
        _current.progress(frac, detail)


def detail(text):
    if _current is not None:
        _current.detail(text)


def pump():
    if _current is not None:
        _current.pump()


def stop(restore=True):
    if _current is not None:
        _current.stop(restore)


def active():
    return _current is not None
