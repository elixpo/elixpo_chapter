"""Shared UI widgets used across FaleraOS apps.

Goal: every app has the same visual chrome (header bar, hint footer, panel
backgrounds) so the OS feels cohesive. Apps just call:

    from oreoOS import widgets
    widgets.draw_header(d, "SETTINGS")
    widgets.draw_hint  (d, "A=select  HOME=back")

and the look is consistent.
"""

import sys as _sys

from oreoOS import api, pixelfont
from oreoOS import theme

try:
    import time as _time
except ImportError:
    _time = None

HEADER_H = 28
HINT_H   = 16

# Forest-green header for the home screen (matches the bg image's tones).
HEADER_HOME_BG = api.rgb(46, 102,  74)

# Cached link state for the header WiFi pip. netsvc.status() is cheap
# (a few driver calls) but we still amortise it to keep header draws
# free of network-module syscalls on tight game loops.
_WIFI_POLL_MS    = 2000
_wifi_cache      = {"connected": False, "rssi": None, "metered": False,
                    "state": "offline", "last_ms": None}

# How the pip draws each netsvc.status() state.
CONNECTING_STEP_MS = 400         # one more bar every step while joining


def _link_state(w):
    """netsvc's state ("connected", "connecting", "retrying", "off",
    "offline"), or one read from the driver when netsvc is missing."""
    # Only a netsvc the launcher already imported: when it failed at boot
    # the header must not retry a flash import every poll.
    try:
        netsvc = _sys.modules.get("oreoOS.netsvc")
        if netsvc is not None:
            return netsvc.status()[0]
    except Exception:
        pass
    try:
        return "connected" if w.is_connected() else "offline"
    except Exception:
        return "offline"


def _poll_wifi():
    """Refresh the cached WiFi snapshot on a 2 s cadence. Returns the
    dict so draw_header() can render the right-aligned icon without
    poking the network module on every paint."""
    now = _time.ticks_ms() if _time else 0
    last = _wifi_cache["last_ms"]
    if last is not None and _time and \
       _time.ticks_diff(now, last) < _WIFI_POLL_MS:
        return _wifi_cache
    try:
        from oreoWare import wifi as _w
        state = _link_state(_w)
        conn = state == "connected"
        _wifi_cache["state"] = state
        _wifi_cache["connected"] = conn
        try:
            _wifi_cache["rssi"] = _w.rssi() if conn else None
        except Exception:
            _wifi_cache["rssi"] = None
        try:
            _wifi_cache["metered"] = bool(_w.is_metered()) if conn else False
        except Exception:
            _wifi_cache["metered"] = False
    except Exception:
        # WiFi module not importable — leave cache as-is.
        pass
    _wifi_cache["last_ms"] = now
    return _wifi_cache


def _rssi_bars(rssi):
    if rssi is None:
        return 2
    if rssi >= -55:
        return 4
    if rssi >= -65:
        return 3
    if rssi >= -75:
        return 2
    return 1


def wifi_bars(state, now_ms=0):
    """(filled bars 0-4, style) for a _wifi_cache snapshot. style is
    "on" (white: connected), "dim" (muted fill: joining, or waiting to
    retry) or "off" (outlines only). While connecting the fill climbs one
    bar per CONNECTING_STEP_MS each time the header is drawn; retrying
    shows one dim bar."""
    link = state.get("state")
    if link is None:                 # old-style snapshot
        link = "connected" if state.get("connected") else "offline"
    if link == "connected":
        return _rssi_bars(state.get("rssi")), "on"
    if link == "connecting":
        return 1 + (now_ms // CONNECTING_STEP_MS) % 4, "dim"
    if link == "retrying":
        return 1, "dim"
    return 0, "off"


def _draw_wifi_pip(d, x, y, w, h, state):
    """4-bar WiFi indicator: white bars by RSSI when associated, dim bars
    while joining or waiting to retry, outlines when off or offline, and
    a tiny "$" next to a metered link so the user knows OTA + store won't
    auto-fetch on it."""
    bars     = 4
    bar_w    = 2
    gap      = 1
    block_w  = bars * bar_w + (bars - 1) * gap
    bx       = x + (w - block_w) // 2
    by_base  = y + h - 1
    now = _time.ticks_ms() if _time else 0
    fill, style = wifi_bars(state, now)
    color = api.WHITE if style == "on" else theme.MUTED
    for i in range(bars):
        bh = 2 + i * 2     # ascending 2,4,6,8 px
        bx_i = bx + i * (bar_w + gap)
        if i < fill:
            d.rect(bx_i, by_base - bh, bar_w, bh, color, fill=True)
        else:
            # Hollow outline for the empty cells so the gauge stays
            # readable even at full bars.
            d.rect(bx_i, by_base - bh, bar_w, 1, theme.MUTED, fill=True)
    # Metered marker: a tiny "$" 8 px to the left of the pip cluster.
    if style == "on" and state.get("metered"):
        d.text("$", bx - 10, y + (h - 8) // 2, theme.GOLD, scale=1)

# Lazy-loaded title font (Pixelify Sans 16 — fits the 28-px header bar nicely).
_TITLE_FONT = None


def _title_font():
    global _TITLE_FONT
    if _TITLE_FONT is None:
        try:
            _TITLE_FONT = pixelfont.load("pixelify_16")
        except (ImportError, AttributeError):
            _TITLE_FONT = False
    return _TITLE_FONT if _TITLE_FONT else None


def draw_header(d, title, color=None, accent=None):
    """App header bar with a centred Pixelify Sans title.

    color  : header bg colour (default theme.STATUS_BG — crimson)
    accent : 1-px line under the header (default theme.PRIMARY)
    """
    SW = api.SCREEN_W
    bg = color  or theme.STATUS_BG
    ac = accent or theme.PRIMARY
    d.rect(0, 0, SW, HEADER_H, bg, fill=True)
    d.rect(0, HEADER_H - 1, SW, 1, ac, fill=True)

    pf = _title_font()
    if pf:
        tw = pf.measure(title)
        pf.text(d, title, (SW - tw) // 2, (HEADER_H - pf.h) // 2, api.WHITE)
    else:
        tx = (SW - len(title) * 16) // 2
        d.text(title, tx, (HEADER_H - 16) // 2, api.WHITE, scale=2)

    # Top-right WiFi pip. Polled on a 2 s cadence so this paint stays
    # cheap. Outlines only when Wi-Fi is off or offline; dim bars while
    # netsvc is joining (climbing on each redraw) or waiting to retry.
    pip_w = 16
    pip_h = HEADER_H - 4
    pip_x = SW - pip_w - 6
    pip_y = 2
    _draw_wifi_pip(d, pip_x, pip_y, pip_w, pip_h, _poll_wifi())


def draw_hint(d, text, color=None):
    """Small grey hint text at the very bottom of the screen.

    Use for "press X for Y" prompts so apps don't have to handcode the bar.
    """
    SW = api.SCREEN_W
    SH = api.SCREEN_H
    y  = SH - HINT_H
    d.rect(0, y, SW, HINT_H, theme.DOCK_BG, fill=True)
    tx = (SW - len(text) * 8) // 2
    d.text(text, tx, y + 4, color or theme.TEXT_BRIGHT)


def draw_panel(d, x, y, w, h, color=None, border=True):
    """Filled panel + optional accent border. Useful for cards / dialogs."""
    fill_color = color or theme.CARD
    d.rect(x, y, w, h, fill_color, fill=True)
    if border:
        d.rect(x, y, w, 1, theme.PRIMARY, fill=True)
        d.rect(x, y + h - 1, w, 1, theme.PRIMARY, fill=True)


def scrollbar_thumb(h, total, visible, pos, min_thumb=12):
    """(offset, length) of a scrollbar thumb on a track `h` px long, for a
    view of `visible` units scrolled `pos` units into `total` (rows, lines
    or pixels: any unit, used consistently). None when it all fits."""
    if total <= visible or h <= 0:
        return None
    thumb = h * visible // total
    if thumb < min_thumb:
        thumb = min_thumb
    if thumb > h:
        thumb = h
    span = total - visible
    pos = 0 if pos < 0 else span if pos > span else pos
    return (h - thumb) * pos // span, thumb


def draw_scrollbar(d, x, y, h, total, visible, pos, track=None, color=None,
                   w=2, min_thumb=12):
    """Vertical scrollbar at (x, y), `h` px tall: an optional `track`
    colour behind a thumb in `color` (theme.PRIMARY). Draws nothing when
    the content fits. See scrollbar_thumb() for the units."""
    t = scrollbar_thumb(h, total, visible, pos, min_thumb)
    if t is None:
        return
    if track is not None:
        d.rect(x, y, w, h, track, fill=True)
    d.rect(x, y + t[0], w, t[1],
           theme.PRIMARY if color is None else color, fill=True)


def play_area():
    """(x, y, w, h) of the screen region between header and hint bar."""
    SW = api.SCREEN_W
    SH = api.SCREEN_H
    return (0, HEADER_H, SW, SH - HEADER_H - HINT_H)


# ── easing + smooth scrolling ────────────────────────────────────────────────

def ease_out(t):
    """Cubic ease-out on 0..1: fast start, soft landing."""
    if t <= 0.0:
        return 0.0
    if t >= 1.0:
        return 1.0
    u = 1.0 - t
    return 1.0 - u * u * u


def ease_in(t):
    """Cubic ease-in on 0..1: soft start, fast finish."""
    if t <= 0.0:
        return 0.0
    if t >= 1.0:
        return 1.0
    return t * t * t


class Scroller:
    """Time-based eased scroll offset for lists and grids.

    Apps keep their logical position (selected row, top row) as before and
    hand the pixel target to the scroller; it glides there with an ease-out
    curve over `dur` seconds, independent of the frame rate. Re-targeting
    mid-glide (held UP/DOWN auto-repeat) restarts the curve from the current
    position, so the motion chases the cursor instead of jumping.

        self._scroll = widgets.Scroller()
        self._scroll.set_target(top_row * ROW_H)      # on input
        if self._scroll.step(dt): self._anim_dirty = True   # in update()
        y = base - self._scroll.value                  # in draw()

    No allocation per step: plain float maths on four slots.
    """

    __slots__ = ("pos", "target", "dur", "_from", "_t")

    def __init__(self, pos=0, dur=0.16):
        self.pos    = float(pos)
        self.target = float(pos)
        self.dur    = dur
        self._from  = float(pos)
        self._t     = dur

    def set_target(self, target, snap=False):
        target = float(target)
        if snap:
            self.pos = self.target = self._from = target
            self._t  = self.dur
            return
        if target == self.target:
            return
        self._from  = self.pos
        self.target = target
        self._t     = 0.0

    def step(self, dt):
        """Advance by dt seconds. Returns True while the offset changed."""
        if self._t >= self.dur:
            return False
        self._t += dt
        if self._t >= self.dur:
            self._t  = self.dur
            self.pos = self.target
            return True
        self.pos = self._from + (self.target - self._from) * \
            ease_out(self._t / self.dur)
        return True

    def moving(self):
        return self._t < self.dur

    @property
    def value(self):
        """Current offset rounded to whole pixels."""
        p = self.pos
        return int(p + 0.5) if p >= 0 else -int(-p + 0.5)
