"""IR Quest — focus / beacon receive, manual send, receiver diagnostics.

Four tabs cycled with B:

  FOCUS   live decode of the latest incoming IR signal. Big hex readout,
          protocol, pulse count. A "what's that remote sending" tester.

  BEACON  passive scanner: frames seen since the app opened, plus the last
          six payloads. Every signal is welcome, no match table.

  SEND    replay the last capture or a predefined NEC payload on the chosen
          carrier. A fires.

  DIAG    receiver diagnostics in full: backend (native RMT or the pin-IRQ
          fallback), RMT channel, DMA, glitch filter, driver state and the
          complete error text when something failed (UP/DOWN scroll it).
          RIGHT toggles serial lifecycle logging (`falera logs` shows it).

RX lifecycle: the receiver starts once in on_enter and stops in on_exit
(which also releases the TX channel). Tabs only change the mode hint, they
never tear the channel down, and the driver pauses/resumes RX around each
transmit by itself. If the receiver fails, the full error is shown wrapped
and scrollable (never truncated) and A retries.

Hardware: TSOP38238 RX on GPIO 18, 2N2222/IR-LED TX on GPIO 2 via
oreoWare.ir (RMT TX; native RMT RX with a Pin.irq fallback).
"""

import time
import oreoOS
from oreoOS import api, theme, widgets
from .text import wrap, hex32


SW = api.SCREEN_W
SH = api.SCREEN_H

TAB_FOCUS, TAB_BEACON, TAB_SEND, TAB_DIAG = 0, 1, 2, 3
TAB_NAMES = ("FOCUS", "BEACON", "SEND", "DIAG")
N_TABS = 4

# Predefined NEC payloads + supported carriers. Hand-edit CODES to add
# more (these go into the SEND tab as a vertical list).
CODES = (
    ("Booth A",  0xCAFEBABE),
    ("Booth B",  0xDEADBEEF),
    ("Booth C",  0xFEEDFACE),
    ("Booth D",  0xC0FFEE00),
    ("Ping",     0x12345678),
    ("Pong",     0x87654321),
)
FREQS = (38000, 40000, 56000)

HISTORY_MAX = 6
SEND_RECORDED = 0

# Card geometry shared by every tab.
CX = 12
CY = widgets.HEADER_H + 6
CW = SW - 24
CH = SH - widgets.HEADER_H - widgets.HINT_H - 12
TEXT_COLS = (CW - 24) // 8          # 8 px glyphs, 12 px padding each side
LINE_H = 11

HINTS = (
    "B=tab  HOME=back",
    "B=tab  HOME=back",
    "A=fire  UP/DN=code  L/R=freq  B=tab",
    "A=restart UP/DN=scroll R=log B=tab",
)
ERROR_HINT = "A=retry UP/DN=scroll B=tab"
ERROR_LINES = (CH - 56) // LINE_H     # lines that fit in the error panel


class App(oreoOS.App):
    name         = "IR Quest"
    SHOW_LOADING = False
    # IR scanning needs to keep the radio active; don't let the OS doze.
    BLOCK_IDLE   = True

    # ── lifecycle ──────────────────────────────────────────────────────
    def on_enter(self, os):
        self._os  = os
        self._tab = TAB_FOCUS

        # Caught so the app still renders without the driver.
        self._ir = None
        try:
            from oreoWare import ir
            self._ir = ir
        except Exception:
            self._ir = None

        # SEND-tab persistence
        self._send_sel  = os.settings_get("ir_code_idx",  0) or 0
        self._send_freq = os.settings_get("ir_freq_idx",  0) or 0
        if self._send_sel  > len(CODES): self._send_sel  = 0
        if self._send_freq >= len(FREQS): self._send_freq = 0

        # Live RX state (mutated by _on_packet)
        self._total_frames  = 0
        self._last_code     = None
        self._last_kind     = None       # "nec" / "raw"
        self._last_pulse_n  = 0
        self._last_seen_ms  = 0
        self._last_capture  = None
        self._history       = []         # (kind, code) tuples
        self._ago_s         = -1

        # Errors are kept as full strings; the panel wraps them and UP/DOWN
        # scroll whatever does not fit, so nothing is ever cut off.
        self._error       = None
        self._error_lines = None
        self._scroll      = 0
        self._status      = {}
        self._rx_desc     = ""
        self._rx_warn     = False

        self._send_flash_ms = 0
        self._dirty = True
        if self._ir is not None and os.settings_get("ir_debug", False):
            self._set_debug(True)
        self._start_rx()

    def on_exit(self):
        if self._ir is not None:
            try:
                # Stops RX and releases the TX channel as well.
                close = getattr(self._ir, "close", None)
                if close is not None:
                    close()
                else:
                    self._ir.stop_receive()
            except Exception as exc:
                print("[quest] IR close: %s" % exc)
        try:
            self._os.settings_set("ir_code_idx", self._send_sel)
            self._os.settings_set("ir_freq_idx", self._send_freq)
        except Exception:
            pass

    # ── RX plumbing ─────────────────────────────────────────────────────
    def _mode(self):
        return "beacon" if self._tab == TAB_BEACON else "focus"

    def _set_error(self, msg):
        if msg and msg != self._error:
            # Rare event, never per frame: keep the full text on serial too.
            print("[quest] IR error: %s" % msg)
        self._error = msg
        self._error_lines = wrap(msg, TEXT_COLS) if msg else None
        self._scroll = 0
        self._dirty = True

    def _set_debug(self, on):
        fn = getattr(self._ir, "debug", None)
        if fn is None:
            return False
        try:
            return fn(on)
        except Exception:
            return False

    def _debug_on(self):
        fn = getattr(self._ir, "debug", None) if self._ir is not None else None
        try:
            return bool(fn()) if fn is not None else False
        except Exception:
            return False

    def _diag_text(self):
        """Everything DIAG explains below the table, as one string."""
        st = self._status
        parts = []
        if st.get("warning"):
            parts.append(st["warning"])
        if self._ir is not None:
            try:
                err = self._ir.last_error()
            except Exception:
                err = None
            if err and err not in parts:
                parts.append(err)
        if st.get("dma_skipped") and st.get("backend") == "rmt":
            parts.append("DMA skipped: %s" % st["dma_skipped"])
        return "\n".join(parts)

    def _scroll_by(self, step, total, visible):
        top = max(0, total - visible)
        new = min(top, max(0, self._scroll + step))
        if new != self._scroll:
            self._scroll = new
            self._dirty = True

    def _refresh_status(self):
        """Snapshot driver diagnostics (called on events, not per frame)."""
        st = {}
        if self._ir is not None:
            try:
                st = self._ir.rx_status()
            except Exception:
                st = {}
        self._status = st
        backend = st.get("backend")
        if backend == "rmt":
            fns = st.get("filter_ns")
            self._rx_desc = "RMT RX%s%s" % (
                "  DMA" if st.get("dma") else "",
                ("  filter %dns" % fns) if fns else "")
            self._rx_warn = False
        elif backend == "irq":
            reason = st.get("esp_err") if st.get("warning") else None
            if reason and reason != "ESP_OK":
                self._rx_desc = "IRQ RX: %s" % reason
            else:
                self._rx_desc = "pin-IRQ fallback, see DIAG"
            self._rx_warn = bool(st.get("warning"))
        else:
            self._rx_desc = "receiver stopped"
            self._rx_warn = True

    def _start_rx(self):
        """Start RX, or just switch mode if it is already running."""
        if self._ir is None:
            return
        try:
            self._ir.start_receive(self._on_packet, mode=self._mode())
            self._set_error(None)
        except Exception as exc:
            self._set_error("RX start: %s" % exc)
        self._refresh_status()
        self._dirty = True

    def _restart_rx(self):
        self._stop_rx()
        self._start_rx()

    def _stop_rx(self):
        if self._ir is None:
            return
        try:
            self._ir.stop_receive()
        except Exception as exc:
            self._set_error("RX stop: %s" % exc)

    def _on_packet(self, code, info):
        """Driver callback when a complete frame arrives."""
        self._total_frames += 1
        self._last_code     = code
        self._last_kind     = info.get("protocol", "raw")
        self._last_pulse_n  = info.get("pulse_count", 0)
        self._last_seen_ms  = time.ticks_ms()
        self._last_capture  = info
        self._ago_s         = 0
        self._history.append((self._last_kind, code))
        if len(self._history) > HISTORY_MAX:
            self._history.pop(0)
        self._dirty = True

    # ── input ──────────────────────────────────────────────────────────
    def on_button_press(self, btn):
        if btn == api.BTN_B:
            self._tab = (self._tab + 1) % N_TABS
            self._scroll = 0
            if self._error:
                # Leaving an error: clear it and bring RX back up fresh.
                self._set_error(None)
                self._restart_rx()
            else:
                self._start_rx()        # mode swap only; channel stays up
            if self._tab == TAB_DIAG:
                self._refresh_status()
            self._dirty = True
            return
        if self._error:
            if btn == api.BTN_A:
                self._set_error(None)
                self._restart_rx()
            elif btn in (api.BTN_UP, api.BTN_DOWN):
                self._scroll_by(-1 if btn == api.BTN_UP else 1,
                                len(self._error_lines or ()), ERROR_LINES)
            return
        if self._tab == TAB_SEND:
            self._on_send_button(btn)
        elif self._tab == TAB_DIAG:
            self._on_diag_button(btn)

    def _on_diag_button(self, btn):
        if btn == api.BTN_A:
            self._restart_rx()
        elif btn in (api.BTN_UP, api.BTN_DOWN):
            lines = wrap(self._diag_text(), TEXT_COLS)
            self._scroll_by(-1 if btn == api.BTN_UP else 1,
                            len(lines), self._diag_lines())
        elif btn == api.BTN_RIGHT:
            on = not self._debug_on()
            self._set_debug(on)
            try:
                self._os.settings_set("ir_debug", on)
            except Exception:
                pass
            self._dirty = True

    def _on_send_button(self, btn):
        if btn == api.BTN_UP:
            self._send_sel = (self._send_sel - 1) % (len(CODES) + 1)
        elif btn == api.BTN_DOWN:
            self._send_sel = (self._send_sel + 1) % (len(CODES) + 1)
        elif btn == api.BTN_LEFT:
            self._send_freq = (self._send_freq - 1) % len(FREQS)
        elif btn == api.BTN_RIGHT:
            self._send_freq = (self._send_freq + 1) % len(FREQS)
        elif btn == api.BTN_A:
            self._fire_send()
        else:
            return
        self._dirty = True

    def _fire_send(self):
        if self._ir is None:
            return
        freq = int(FREQS[self._send_freq])
        err = None
        try:
            # The driver pauses RX for the burst and resumes it afterwards.
            if self._send_sel == SEND_RECORDED:
                if not self._last_capture:
                    raise ValueError("nothing recorded yet: point a remote "
                                     "at the badge on FOCUS first")
                self._ir.transmit_capture(self._last_capture, carrier_hz=freq)
            else:
                _, code = CODES[self._send_sel - 1]
                self._ir.transmit_nec(int(code), carrier_hz=freq)
        except Exception as exc:
            err = "Send: %s" % exc
        # Make sure RX came back after the burst; surface its error if not.
        self._refresh_status()
        if self._status.get("backend") is None:
            self._start_rx()
        if err:
            self._set_error(err)
        elif not self._error:
            self._send_flash_ms = 600

    # ── per-frame ───────────────────────────────────────────────────────
    def update(self, dt):
        if self._ir is not None and not self._error:
            try:
                self._ir.poll()
            except Exception as exc:
                self._set_error("RX: %s" % exc)
                self._refresh_status()
        if self._send_flash_ms > 0:
            self._send_flash_ms = max(0, self._send_flash_ms - int(dt * 1000))
            if self._send_flash_ms == 0:
                self._dirty = True
        # FOCUS shows "Ns ago": redraw only when the second changes.
        if self._tab == TAB_FOCUS and self._last_seen_ms:
            ago = time.ticks_diff(time.ticks_ms(), self._last_seen_ms) // 1000
            if ago != self._ago_s:
                self._ago_s = ago
                self._dirty = True

    # ── render ─────────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return
        self._dirty = False

        d.clear(theme.BG)
        self._draw_header(d)
        hint = ERROR_HINT if self._error else HINTS[self._tab]
        widgets.draw_hint(d, hint)

        if self._ir is None:
            self._draw_no_hw(d)
            return

        self._card(d)
        if self._error:
            self._draw_error(d)
        elif self._tab == TAB_FOCUS:
            self._draw_focus(d)
        elif self._tab == TAB_BEACON:
            self._draw_beacon(d)
        elif self._tab == TAB_SEND:
            self._draw_send(d)
        else:
            self._draw_diag(d)

    def _card(self, d):
        d.rect(CX + 2, CY + 2, CW, CH, theme.MUTED2, fill=True)
        d.rect(CX, CY, CW, CH, theme.CARD, fill=True)
        d.rect(CX, CY, CW, 3, theme.PRIMARY, fill=True)

    def _draw_rx_line(self, d):
        """One-line receiver status pinned to the bottom of the card."""
        col = theme.ORANGE if self._rx_warn else theme.MUTED
        d.rect(CX + 12, CY + CH - 26, 6, 6,
               theme.ORANGE if self._rx_warn else theme.GREEN, fill=True)
        d.text(self._rx_desc, CX + 24, CY + CH - 26, col)

    # ── header w/ tab indicator ─────────────────────────────────────────
    def _draw_header(self, d):
        H = widgets.HEADER_H
        d.rect(0, 0, SW, H, theme.PRIMARY, fill=True)
        d.rect(0, H - 1, SW, 1, theme.GOLD, fill=True)
        d.text("QUEST", 8, (H - 16) // 2, api.WHITE, scale=2)
        right_x = SW - 6
        for i in range(N_TABS - 1, -1, -1):
            tag = TAB_NAMES[i]
            pw  = len(tag) * 8 + 8
            x   = right_x - pw
            if i == self._tab:
                d.rect(x, 6, pw, H - 12, theme.GOLD, fill=True)
                d.text(tag, x + 4, 10, api.BLACK)
            else:
                d.text(tag, x + 4, 10, api.WHITE)
            right_x = x - 3

    # ── tabs ────────────────────────────────────────────────────────────
    def _draw_no_hw(self, d):
        cw, ch = SW - 40, 120
        cx, cy = (SW - cw) // 2, (SH - ch) // 2
        d.rect(cx, cy, cw, ch, theme.CARD,    fill=True)
        d.rect(cx, cy, cw, 3,  theme.PRIMARY, fill=True)
        title = "IR offline"
        d.text(title, (SW - len(title) * 16) // 2, cy + 16, theme.PRIMARY, scale=2)
        msg = ["The IR driver couldn't load.",
               "Check oreoWare.ir + the",
               "TSOP/2N2222 wiring then",
               "reboot the badge."]
        for i, m in enumerate(msg):
            d.text(m, cx + 16, cy + 44 + i * 14, theme.TEXT_BRIGHT)

    def _draw_error(self, d):
        d.rect(CX, CY, CW, 3, theme.ORANGE, fill=True)
        d.text("IR error", CX + 12, CY + 12, theme.PRIMARY, scale=2)
        lines = self._error_lines or ()
        y = CY + 38
        for line in lines[self._scroll:self._scroll + ERROR_LINES]:
            d.text(line, CX + 12, y, theme.TEXT_BRIGHT)
            y += LINE_H
        if len(lines) > ERROR_LINES:
            more = "%d-%d/%d" % (self._scroll + 1,
                                 min(len(lines), self._scroll + ERROR_LINES),
                                 len(lines))
            d.text(more, CX + CW - len(more) * 8 - 12, CY + 16, theme.MUTED)
        d.text("A retries, B moves on", CX + 12, CY + CH - 18, theme.MUTED)

    def _draw_focus(self, d):
        d.text("Latest signal", CX + 12, CY + 10, theme.MUTED)

        if self._last_kind is None:
            msg = "listening..."
            d.text(msg, (SW - len(msg) * 16) // 2, CY + 60,
                   theme.MUTED, scale=2)
            self._draw_rx_line(d)
            return

        if self._last_code is not None:
            hexs = hex32(self._last_code)
            d.text(hexs, (SW - len(hexs) * 24) // 2, CY + 40,
                   theme.PRIMARY, scale=3)
            d.text("NEC", (SW - 3 * 8) // 2, CY + 74, theme.GOLD)
        else:
            msg = "raw / unknown"
            d.text(msg, (SW - len(msg) * 16) // 2, CY + 48,
                   theme.PRIMARY, scale=2)

        info = "%d pulses" % self._last_pulse_n
        d.text(info, CX + 12, CY + CH - 46, theme.TEXT_BRIGHT)
        if self._ago_s >= 0:
            ago = "%ds ago" % self._ago_s
            d.text(ago, CX + CW - len(ago) * 8 - 12, CY + CH - 46,
                   theme.MUTED)
        self._draw_rx_line(d)

    def _draw_beacon(self, d):
        n = "%d" % self._total_frames
        d.text(n, (SW - len(n) * 24) // 2, CY + 10, theme.PRIMARY, scale=3)
        sub = "frames seen"
        d.text(sub, (SW - len(sub) * 8) // 2, CY + 38, theme.MUTED)

        d.text("Recent", CX + 12, CY + 56, theme.GOLD)
        d.rect(CX + 12, CY + 67, CW - 24, 1, theme.MUTED2, fill=True)
        if not self._history:
            d.text("(nothing yet)", CX + 12, CY + 74, theme.MUTED)
        else:
            y = CY + 74
            for i in range(len(self._history) - 1, -1, -1):
                if y + 10 > CY + CH - 30:
                    break
                kind, code = self._history[i]
                if kind == "nec" and code is not None:
                    d.text(hex32(code), CX + 12, y, theme.TEXT_BRIGHT)
                    d.text("NEC", CX + CW - 36, y, theme.GOLD)
                else:
                    d.text("raw / unknown", CX + 12, y, theme.TEXT_DIM)
                y += LINE_H
        self._draw_rx_line(d)

    def _draw_send(self, d):
        freq   = FREQS[self._send_freq]
        freq_s = "Carrier  <  %d kHz  >" % (freq // 1000)
        d.text(freq_s, CX + 12, CY + 10, theme.PRIMARY, scale=2)

        list_top = CY + 36
        row_h    = 18
        max_rows = (CY + CH - list_top - 6) // row_h
        first = 0
        if self._send_sel >= max_rows:
            first = self._send_sel - max_rows + 1
        item_count = len(CODES) + 1
        for i in range(first, min(item_count, first + max_rows)):
            if i == SEND_RECORDED:
                name, code = "Recorded", None
            else:
                name, code = CODES[i - 1]
            y   = list_top + (i - first) * row_h
            sel = (i == self._send_sel)
            if sel:
                d.rect(CX + 4, y - 2, CW - 8, row_h, theme.DOCK_SEL, fill=True)
                d.rect(CX + 4, y - 2, 3,      row_h, theme.PRIMARY, fill=True)
            d.text(name, CX + 16, y + 3,
                   theme.PRIMARY if sel else theme.TEXT_BRIGHT)
            if code is None:
                hexs = ("%d pulses" % self._last_capture.get("pulse_count", 0)
                        if self._last_capture else "empty")
            else:
                hexs = hex32(code)
            d.text(hexs, CX + CW - len(hexs) * 8 - 14, y + 3, theme.MUTED)

        if self._send_flash_ms > 0:
            msg = "Sent"
            mw  = len(msg) * 16
            tx  = (SW - mw) // 2
            ty  = SH - widgets.HINT_H - 30
            d.rect(tx - 10, ty - 4, mw + 20, 22, theme.GREEN, fill=True)
            d.text(msg, tx, ty, api.WHITE, scale=2)

    def _diag_rows(self):
        st = self._status
        backend = st.get("backend")
        if not st.get("native"):
            rmt = "module missing"
        else:
            ch = st.get("channel")
            rmt = "%s%s %s" % (
                ("ch%d " % ch) if isinstance(ch, int) and ch >= 0 else "",
                "DMA" if st.get("dma") else "no DMA",
                ("%dns" % st["filter_ns"]) if st.get("filter_ns") else "nofilt")
            if st.get("live_channels") is not None:
                rmt += " L%d" % st["live_channels"]
        state = st.get("state") or "-"
        stage = st.get("stage")
        if stage and stage != state:
            state = "%s/%s" % (state, stage)
        return (
            ("Backend", {"rmt": "native RMT",
                         "irq": "pin IRQ (fallback)"}.get(backend, "stopped")),
            ("RMT",     rmt),
            ("State",   state),
            ("ESP err", st.get("esp_err") or "-"),
            ("Frames",  "%d" % self._total_frames),
            ("Log",     "serial on" if self._debug_on() else "off (R)"),
        )

    def _diag_lines(self):
        """Text lines that fit under the DIAG table."""
        top = CY + 10 + len(self._diag_rows()) * (LINE_H + 1) + 9
        return (CY + CH - 6 - top) // LINE_H

    def _draw_diag(self, d):
        rows = self._diag_rows()
        y = CY + 10
        for label, value in rows:
            d.text(label, CX + 12, y, theme.MUTED)
            d.text(str(value)[:TEXT_COLS - 10], CX + 92, y, theme.TEXT_BRIGHT)
            y += LINE_H + 1
        text = self._diag_text()
        if not text:
            return
        y += 4
        d.rect(CX + 12, y, CW - 24, 1, theme.ORANGE, fill=True)
        y += 5
        lines = wrap(text, TEXT_COLS)
        visible = self._diag_lines()
        if self._scroll > max(0, len(lines) - visible):
            self._scroll = max(0, len(lines) - visible)
        for line in lines[self._scroll:self._scroll + visible]:
            d.text(line, CX + 12, y, theme.TEXT_BRIGHT)
            y += LINE_H
        if len(lines) > visible:
            more = "%d/%d" % (self._scroll + visible, len(lines))
            d.text(more, CX + CW - len(more) * 8 - 12, CY + 10, theme.MUTED)
