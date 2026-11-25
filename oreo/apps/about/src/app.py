"""About — FaleraOS info, build metadata, and credits.

Opens instantly with the values cached on flash (apps/about/cache.txt via
oreoOS.cache), then refreshes them one step per frame after the first
paint: OS/runtime, then hardware/flash, then network. The cache is
rewritten only when something changed. Memory and uptime are live and
repaint in place once a second without redrawing the screen.

Layout: a fixed hero card (mascot, FALERA OS, version pill, update state)
above a scrollable details card with SYSTEM / NETWORK / CREDITS sections.

Controls:
  UP/DOWN  scroll details
  A        open Updates
  HOME     back to apps drawer
"""

import time

import oreoOS
from oreoOS import api, cache, pixelfont
from oreoOS import theme, widgets
from . import info


SW = api.SCREEN_W
SH = api.SCREEN_H

# Hero card
HX, HY = 8, widgets.HEADER_H + 4
HW, HH = SW - 16, 76
# Details card
LX, LY = 8, HY + HH + 4
LW = SW - 16
LH = SH - widgets.HINT_H - 4 - LY
ROW_H = 13
LIST_TOP = LY + 6
VISIBLE = (LH - 10) // ROW_H
LABEL_X = LX + 12
VALUE_X = LX + 84
VALUE_COLS = (LX + LW - 10 - VALUE_X) // 8

LIVE_KEYS = ("mem", "uptime")
NET_POLL_MS = 10000

DEFAULTS = {
    "version": "-", "released": "-", "update": "-", "runtime": "-",
    "board": "ESP32-S3", "cpu": "-", "flash": "-",
    "ip": "-", "ssid": "-", "mac": "-",
}


def _load_mascot():
    try:
        m = __import__("assets.sprites.optimized.mascot", None, None,
                       ["DATA", "W", "H"])
        return (bytearray(m.DATA), m.W, m.H)
    except (ImportError, AttributeError):
        return None


class App(oreoOS.App):
    name = "About"
    SHOW_LOADING = False

    def on_enter(self, os):
        super().on_enter(os)
        self._os = os
        self._mascot = _load_mascot()
        try:
            self._pf_title = pixelfont.load("pixelify_24")
        except (ImportError, AttributeError):
            self._pf_title = None

        vals = dict(DEFAULTS)
        cached, _age = cache.load(info.CACHE_PATH)
        if isinstance(cached, dict):
            for k in DEFAULTS:
                if k in cached:
                    vals[k] = cached[k]
        self._vals = vals
        self._saved = dict(vals) if cached else None

        self._rows = self._build_rows()
        self._top = 0
        self._live_y = {}            # live key -> screen y while visible
        self._live_txt = {"mem": "", "uptime": ""}
        self._last_s = -1
        self._stage = 0              # 0..2 refresh steps, 3 = done
        self._drawn = False
        self._net_ms = time.ticks_ms()
        self._dirty = True
        self._live_dirty = False

    # ── data ────────────────────────────────────────────────────────────
    def _build_rows(self):
        v = self._vals
        return (
            ("h", "SYSTEM", None),
            ("r", "Board", "board"),
            ("r", "CPU", "cpu"),
            ("r", "Runtime", "runtime"),
            ("t", "Display", "ST7789 320x240"),
            ("r", "Flash", "flash"),
            ("l", "Memory", "mem"),
            ("l", "Uptime", "uptime"),
            ("h", "NETWORK", None),
            ("r", "Wi-Fi", "ssid"),
            ("r", "IP", "ip"),
            ("r", "MAC", "mac"),
            ("h", "CREDITS", None),
            ("c", "Crafted by @Circuit-Overtime", theme.PRIMARY),
            ("c", "Co-maintained by @anwe-ch", theme.PURPLE),
            ("c", "github.com/elixpo/falera", theme.TEAL),
            ("c", "Released " + str(v.get("released", "-")), theme.MUTED),
        )

    def _merge(self, new):
        changed = False
        for k, val in new.items():
            val = str(val)
            if self._vals.get(k) != val:
                self._vals[k] = val
                changed = True
        return changed

    def _refresh_step(self):
        stage = self._stage
        if stage == 0:
            changed = self._merge(info.step_os(self._os))
        elif stage == 1:
            changed = self._merge(info.step_hw())
        else:
            changed = self._merge(info.step_net())
        self._stage = stage + 1
        if changed:
            self._rows = self._build_rows()
            self._dirty = True
        if self._stage == 3 and self._saved != self._vals:
            cache.save(info.CACHE_PATH, self._vals)
            self._saved = dict(self._vals)

    # ── loop ────────────────────────────────────────────────────────────
    def update(self, dt):
        if not self._drawn:
            return                    # paint the cached screen first
        if self._stage < 3:
            self._refresh_step()
        elif time.ticks_diff(time.ticks_ms(), self._net_ms) >= NET_POLL_MS:
            self._net_ms = time.ticks_ms()
            self._stage = 2           # re-poll the network only
        s = info.uptime_s()
        if s != self._last_s:
            self._last_s = s
            self._live_txt["uptime"] = info.fmt_uptime(s)
            self._live_txt["mem"] = info.mem_line()
            self._live_dirty = True

    def on_button_press(self, btn):
        max_top = max(0, len(self._rows) - VISIBLE)
        if btn == api.BTN_UP and self._top > 0:
            self._top -= 1
            self._dirty = True
        elif btn == api.BTN_DOWN and self._top < max_top:
            self._top += 1
            self._dirty = True
        elif btn == api.BTN_A:
            try:
                self._os.launch("updates")
            except Exception:
                pass

    # ── render ──────────────────────────────────────────────────────────
    def draw(self, d):
        if self._dirty:
            self._draw_full(d)
            self._dirty = False
            self._live_dirty = False
            self._drawn = True
        elif self._live_dirty:
            self._live_dirty = False
            for key, y in self._live_y.items():
                d.rect(VALUE_X, y, LX + LW - 8 - VALUE_X, 9, theme.CARD,
                       fill=True)
                d.text(self._live_txt[key][:VALUE_COLS], VALUE_X, y,
                       theme.TEXT_BRIGHT)

    def _draw_full(self, d):
        if not self._live_txt["uptime"]:
            self._live_txt["uptime"] = info.fmt_uptime(info.uptime_s())
            self._live_txt["mem"] = info.mem_line()
        d.clear(theme.BG)
        widgets.draw_header(d, "ABOUT")
        widgets.draw_hint(d, "UP/DN=scroll  A=updates  HOME=back")
        self._draw_hero(d)
        self._draw_list(d)

    def _draw_hero(self, d):
        d.rect(HX + 2, HY + 2, HW, HH, theme.MUTED2, fill=True)
        d.rect(HX, HY, HW, HH, theme.CARD, fill=True)
        d.rect(HX, HY, 3, HH, theme.PRIMARY, fill=True)

        tx = HX + 14
        if self._mascot:
            data, mw, mh = self._mascot
            d.blit(data, HX + 8, HY + (HH - mh) // 2, mw, mh)
            tx = HX + 8 + mw + 10

        title = "FALERA OS"
        if self._pf_title:
            self._pf_title.text(d, title, tx, HY + 8, theme.PRIMARY)
        else:
            d.text(title, tx, HY + 10, theme.PRIMARY, scale=3)

        v = self._vals
        ver = str(v.get("version", "-"))
        pw = len(ver) * 8 + 10
        py = HY + 40
        d.rect(tx, py, pw, 13, theme.PRIMARY, fill=True)
        d.text(ver, tx + 5, py + 3, api.WHITE)
        d.text("Sweet Sandwich", tx + pw + 8, py + 3, theme.MUTED)

        upd = str(v.get("update", "-"))
        col = theme.ORANGE if upd == "ready to install" else theme.TEAL
        d.text("update", tx, py + 20, theme.MUTED)
        d.text(upd, tx + 56, py + 20, col)

    def _draw_list(self, d):
        d.rect(LX + 2, LY + 2, LW, LH, theme.MUTED2, fill=True)
        d.rect(LX, LY, LW, LH, theme.CARD, fill=True)
        self._live_y = {}
        rows = self._rows
        v = self._vals
        y = LIST_TOP
        end = min(len(rows), self._top + VISIBLE)
        for i in range(self._top, end):
            kind, label, ref = rows[i]
            if kind == "h":
                d.text(label, LABEL_X, y + 2, theme.GOLD)
                lx = LABEL_X + len(label) * 8 + 6
                d.rect(lx, y + 5, LX + LW - 14 - lx, 1, theme.MUTED2, fill=True)
            elif kind == "c":
                d.text(label[:(LW - 24) // 8], LABEL_X, y + 2, ref)
            else:
                if kind == "l":
                    val = self._live_txt[ref]
                    self._live_y[ref] = y + 2
                elif kind == "t":
                    val = ref
                else:
                    val = str(v.get(ref, "-"))
                d.text(label, LABEL_X, y + 2, theme.MUTED)
                d.text(val[:VALUE_COLS], VALUE_X, y + 2, theme.TEXT_BRIGHT)
            y += ROW_H

        # Scrollbar
        widgets.draw_scrollbar(d, LX + LW - 5, LY + 4, LH - 8,
                               len(rows), VISIBLE, self._top,
                               track=theme.DOCK_SEL)
