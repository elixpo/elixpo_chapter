"""Bluetooth — radio status and the BLE file-receive link.

What this page shows (all live, polled at 4 Hz, repainted only on change):

  Radio      ON / OFF            A toggles (same as the notification panel)
  Link       off / visible as "Falera" / connected + peer MAC
  Paired     bonded devices in /bonds.json
  Receive    idle, or a progress bar while a BLE transfer is arriving

Computers send files over USB with the Transfer app and `falera send`
(docs/TRANSFER.md), which is much faster. Over BLE the badge accepts .txt / .md (and raw image bytes)
from tools/bt_send.py on a laptop; see docs/BLUETOOTH.md for what works,
the limits, and the plan.
"""

import oreoOS
import time
from oreoOS import api, theme, widgets


SW = api.SCREEN_W
SH = api.SCREEN_H

ROW_H     = 22
PAD_X     = 12
TOP_Y     = widgets.HEADER_H + 8
VALUE_X   = 96
POLL_MS   = 250

GREEN = api.rgb(61, 190, 120)


class App(oreoOS.App):
    # C is one of this app's controls: a single C stays here and a
    # double-tap of C opens the notification panel.
    CAPTURES_C = True
    name         = "Bluetooth"
    author       = "Circuit-Overtime"
    SHOW_LOADING = False

    def on_enter(self, os_):
        super().on_enter(os_)
        self._os    = os_
        self._dirty = True
        self._next  = 0
        self._sig   = None
        self._msg   = ""
        self._msg_ms = 0
        try:
            from oreoWare import bt
            self._bt = bt
        except Exception:
            self._bt = None
        self._snap = self._read()

    # ── data ────────────────────────────────────────────────────────────
    def _read(self):
        bt = self._bt
        out = {"on": False, "conn": False, "peer": None, "paired": 0,
               "rx": None}
        if bt is None:
            return out
        try:
            out["on"] = bool(bt.is_active())
            out["conn"] = bool(bt.is_busy())
            out["peer"] = bt.peer_mac()
            out["rx"] = bt.rx_progress()
        except Exception:
            pass
        try:
            out["paired"] = len(bt.paired_devices())
        except Exception:
            pass
        return out

    # ── input ───────────────────────────────────────────────────────────
    def on_button_press(self, btn):
        if btn in (api.BTN_HOME, api.BTN_B):
            self._os.quit()
            return
        bt = self._bt
        if bt is None:
            return
        if btn == api.BTN_A:
            want = not self._snap.get("on")
            ok = False
            try:
                ok = bt.set_active(want)
            except Exception:
                ok = False
            if not ok:
                self._flash("Radio did not respond")
            elif want:
                self._flash('Visible as "Falera"')
            else:
                self._flash("Bluetooth off")
        elif btn == api.BTN_C and self._snap.get("conn"):
            try:
                bt.disconnect_peer()
            except Exception:
                pass
            self._flash("Disconnected")
        else:
            return
        self._snap = self._read()
        self._dirty = True

    def _flash(self, text):
        self._msg = text
        self._msg_ms = time.ticks_ms()

    # ── update ──────────────────────────────────────────────────────────
    def update(self, dt):
        now = time.ticks_ms()
        if time.ticks_diff(now, self._next) < 0:
            return
        self._next = time.ticks_add(now, POLL_MS)
        snap = self._read()
        rx = snap.get("rx")
        sig = (snap["on"], snap["conn"], snap["peer"], snap["paired"],
               rx[0] // 1024 if rx else -1, bool(self._msg))
        if sig != self._sig:
            self._sig = sig
            self._snap = snap
            self._dirty = True
        if self._msg and time.ticks_diff(now, self._msg_ms) > 2500:
            self._msg = ""
            self._dirty = True

    # ── render ──────────────────────────────────────────────────────────
    def _row(self, d, i, label, value, color):
        y = TOP_Y + i * ROW_H
        d.text(label, PAD_X, y, theme.TEXT_DIM)
        d.text(value[:26], VALUE_X, y, color)

    def draw(self, d):
        if not self._dirty:
            return
        self._dirty = False
        d.clear(theme.BG)
        widgets.draw_header(d, "BLUETOOTH")
        s = self._snap
        if self._bt is None:
            d.text("Bluetooth is not available", PAD_X, TOP_Y, theme.MUTED)
            d.text("on this firmware build.", PAD_X, TOP_Y + 14, theme.MUTED)
            widgets.draw_hint(d, "B=back")
            return

        on = s.get("on")
        self._row(d, 0, "Radio", "ON" if on else "OFF",
                  theme.PRIMARY if on else theme.MUTED)
        if not on:
            link, col = "off", theme.MUTED
        elif s.get("conn"):
            link, col = "connected", GREEN
        else:
            link, col = 'visible as "Falera"', theme.TEAL
        self._row(d, 1, "Link", link, col)
        if s.get("conn") and s.get("peer"):
            d.text(s["peer"], VALUE_X, TOP_Y + ROW_H + 12, theme.TEXT_DIM)
        n = s.get("paired", 0)
        self._row(d, 2, "Paired", "%d device%s" % (n, "" if n == 1 else "s"),
                  theme.TEXT_BRIGHT)

        rx = s.get("rx")
        y = TOP_Y + 3 * ROW_H
        if rx:
            got, total, kind = rx
            total = max(1, total)
            pct = min(100, got * 100 // total)
            self._row(d, 3, "Receive", "%s %d%%" % (kind, pct), theme.PRIMARY)
            bw = SW - VALUE_X - PAD_X
            d.rect(VALUE_X, y + 12, bw, 4, theme.MUTED2, fill=True)
            d.rect(VALUE_X, y + 12, bw * pct // 100, 4, theme.PRIMARY,
                   fill=True)
        else:
            self._row(d, 3, "Receive", "idle", theme.TEXT_DIM)

        d.rect(PAD_X, y + 26, SW - 2 * PAD_X, 1, theme.MUTED2, fill=True)
        lines = (
            ("Computers: Transfer app over USB", theme.TEXT_BRIGHT),
            ("(`falera send` on the computer).", theme.TEXT_DIM),
            ("BLE receive: .txt / .md from a", theme.TEXT_DIM),
            ("laptop with tools/bt_send.py.", theme.TEXT_DIM),
            ("Pair requests pop up on screen.", theme.TEXT_DIM),
        )
        for i, (ln, c) in enumerate(lines):
            d.text(ln, PAD_X, y + 34 + i * 13, c)

        if self._msg:
            w = len(self._msg) * 8 + 20
            x = (SW - w) // 2
            py = SH - widgets.HINT_H - 22
            d.rect(x, py, w, 16, theme.TEAL, fill=True)
            d.text(self._msg, x + 10, py + 4, theme.BG)
        widgets.draw_hint(d, "A=on/off  C=disconnect  B=back"
                          if s.get("conn") else "A=on/off  B=back")
