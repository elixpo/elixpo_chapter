"""WiFi — status, nearby networks and saved networks.

Wi-Fi on the badge is for the internet only (App Store, OTA, GitHub
data, weather, time). Files arrive over USB through the Transfer app
(apps/transfer) and `falera transfer send`; new networks with a password
are added from a computer with `falera wifi connect`.

Pages (self._mode):

  main     : status rows. UP/DOWN walks (the list scrolls), A toggles or
             drills in.
  nearby   : live scan. Cached results from the last scan paint at once,
             a sweeping bar shows the scan running, fresh results replace
             them as soon as they land. Rows show signal bars, a lock for
             secured networks and a "saved" / "on" tag. A joins, C or
             RIGHT rescans, B/HOME goes back.
  saved    : saved networks. A joins, B forgets (press twice), LEFT
             toggles "metered". Rows show bars when the network is in
             range.
  connect  : overlay while joining: animated progress, then a clear
             success (with IP) or failure message. B cancels.
  pwhelp   : an unknown secured network was picked. The badge has no
             keyboard, so it explains how to add it over USB with
             `falera wifi connect`.

Nothing here waits in a frame: scans run in oreoWare.wifi's background
worker and joins use connect_begin()/connect_poll(), polled from update().
What is left are the radio's own C calls (wlan.active(), wlan.connect(),
set_power_mode()): they hold MicroPython's interpreter lock while they
run, so no spinner thread could draw during them. Every press that makes
one paints its answer first ("turning on...", "setting Eco...", the
connect overlay) and presents it, then makes the call; a row whose call
did not take says "failed" for NOTE_MS instead of snapping back. A press
of A on such a row in the first frame after the call was made during it
and is dropped, so a second tap never queues a second toggle.
Saved networks live in /wifi.json, managed by oreoWare.wifi.
"""

import oreoOS
import time

from oreoOS import api, theme, widgets


SW = api.SCREEN_W
SH = api.SCREEN_H

ROW_H        = 22
ROW_PAD_X    = 12
ROW_TOP_Y    = widgets.HEADER_H + 6
VALUE_X      = 138
LIST_BOTTOM  = SH - widgets.HINT_H - 2
VISIBLE_ROWS = (LIST_BOTTOM - ROW_TOP_Y) // ROW_H

# Nearby / saved lists start below a one-line status strip.
NET_TOP_Y    = ROW_TOP_Y + 18
NET_ROWS     = (LIST_BOTTOM - NET_TOP_Y) // ROW_H

ANIM_MS      = 90          # repaint cadence while something animates
RESULT_MS    = 2600        # how long the connect result stays up
FORGET_MS    = 2000        # window for the second B press on Saved
NOTE_MS      = 3000        # a row's "failed" note stays this long

POWER_LABELS = {
    "off":      "Off",
    "eco":      "Eco",
    "balanced": "Balanced",
    "max":      "Max",
}

FAIL_TEXT = {
    "bad_password": ("Wrong password", "Check it and send it again."),
    "not_found":    ("Network not found", "Move closer and rescan."),
    "timeout":      ("Timed out", "No answer from the router."),
    "failed":       ("Could not connect", "The radio refused the request."),
}

GREEN = api.rgb(61, 190, 120)


def _bars_icon(d, x, y, level, on_color):
    """4 ascending bars in a 15x10 box, bottom-aligned."""
    for i in range(4):
        h = 3 + i * 2
        c = on_color if i < level else theme.MUTED2
        d.rect(x + i * 4, y + 10 - h, 3, h, c, fill=True)


def _lock_icon(d, x, y, color):
    """7x10 padlock: hollow shackle over a solid body."""
    d.rect(x + 1, y, 5, 5, color)
    d.rect(x, y + 4, 7, 6, color, fill=True)


def _sel_row(d, y):
    d.rect(4, y - 2, SW - 8, ROW_H - 1, theme.DOCK_SEL, fill=True)
    d.rect(4, y - 2, SW - 8, 1, theme.SEL_BORDER, fill=True)
    d.rect(4, y + ROW_H - 4, SW - 8, 1, theme.SEL_BORDER, fill=True)


def _sweep(d, y, t_ms, color):
    """Indeterminate progress: a 70 px segment gliding along a track."""
    x0, w = ROW_PAD_X, SW - 2 * ROW_PAD_X
    d.rect(x0, y, w, 3, theme.MUTED2, fill=True)
    seg = 70
    span = w + seg
    p = (t_ms // 6) % span - seg
    a = max(0, p)
    b = min(w, p + seg)
    if b > a:
        d.rect(x0 + a, y, b - a, 3, color, fill=True)


def _clip(s, n):
    s = s or ""
    return s if len(s) <= n else s[:n - 1] + "~"


class App(oreoOS.App):
    # C is one of this app's controls: a single C stays here and a
    # double-tap of C opens the notification panel.
    CAPTURES_C = True
    name         = "WiFi"
    author       = "Circuit-Overtime"
    SHOW_LOADING = False

    (ROW_STATUS, ROW_NETWORK, ROW_IP, ROW_NEARBY, ROW_SAVED,
     ROW_SPEED, ROW_PING, ROW_POWER,
     ROW_AUTOCONNECT) = range(9)
    N_ROWS = 9

    def on_enter(self, os_):
        super().on_enter(os_)
        self._os    = os_
        self._sel   = self.ROW_STATUS
        self._top   = 0
        self._dirty = True

        try:
            from oreoWare import wifi
            self._wifi = wifi
        except Exception:
            self._wifi = None

        # 5 Hz info refresh so RSSI and IP track reality.
        self._poll_t  = 0.0
        self._poll_dt = 0.2
        self._snap    = self._read()
        self._anim_next = 0

        self._mode    = "main"
        self._back    = "main"        # page the connect overlay returns to

        # Nearby page
        self._near      = []
        self._near_sel  = 0
        self._near_top  = 0
        self._scan_seq  = -1
        self._scan_want = False       # rescan once the radio is free
        self._scan_note = ""
        self._saved_set = {}

        # Saved page
        self._nets      = []
        self._nets_sel  = 0
        self._nets_top  = 0
        self._forget_ssid = ""
        self._forget_ms   = 0

        # Connect overlay
        self._c_ssid    = ""
        self._c_state   = ""          # "busy" | "ok" | wifi.CONN_* failure
        self._c_done_ms = 0
        self._c_save    = None        # (ssid, pw) to save once joined
        self._c_ip      = ""
        self._c_pending = None        # (ssid, pw) waiting for a scan to end
        self._c_phase   = ""          # "starting" while connect_begin runs
        self._c_code    = ""          # raw driver reason shown on failure
        self._pw_ssid   = ""
        self._n_saved   = 0
        self._count_saved()

        self._speed_label = ""
        self._ping_label  = ""
        self._busy        = ""

        # Radio rows: (row, text) while a radio call runs, row ->
        # (start_ms, text) failure notes, and the frame count when the
        # last call ended (a press latched during it arrives next frame).
        self._pending   = None
        self._row_note  = {}
        self._frames    = 0
        self._call_end  = None

    # ── data ────────────────────────────────────────────────────────────
    def _read(self):
        if not self._wifi:
            return {"connected": False}
        try:
            return self._wifi.info()
        except Exception:
            return {"connected": False}

    def _power_mode(self):
        if not self._wifi:
            return "balanced"
        try:
            return self._wifi.get_power_mode()
        except Exception:
            return "balanced"

    def _autoconnect(self):
        try:
            return bool(self._os.settings_get("wifi_autoconnect", True))
        except Exception:
            return True

    def _count_saved(self):
        try:
            self._n_saved = len(self._wifi.list_saved()) if self._wifi else 0
        except Exception:
            self._n_saved = 0

    def _reload_nets(self):
        try:
            self._nets = self._wifi.list_saved() if self._wifi else []
        except Exception:
            self._nets = []
        self._n_saved = len(self._nets)
        if self._nets_sel >= len(self._nets):
            self._nets_sel = max(0, len(self._nets) - 1)

    def _reload_near(self):
        w = self._wifi
        if not w:
            self._near = []
            return
        try:
            self._near = list(w.nearby())
            self._saved_set = w.saved_ssids()
        except Exception:
            self._near = []
        if self._near_sel >= len(self._near):
            self._near_sel = max(0, len(self._near) - 1)

    def _rssi_of(self, ssid):
        for n in self._near:
            if n.get("ssid") == ssid:
                return n.get("rssi")
        return None

    def _joining(self):
        """SSID the radio is joining right now (boot or manual), or ''."""
        try:
            return self._wifi.connect_target() or ""
        except Exception:
            return ""

    # ── input ───────────────────────────────────────────────────────────
    def on_button_press(self, btn):
        m = self._mode
        if m == "nearby":
            return self._on_button_nearby(btn)
        if m == "saved":
            return self._on_button_saved(btn)
        if m == "connect":
            return self._on_button_connect(btn)
        if m == "pwhelp":
            return self._on_button_pwhelp(btn)
        return self._on_button_main(btn)

    def _on_button_main(self, btn):
        if btn in (api.BTN_HOME, api.BTN_B):
            self._os.quit()
            return
        if btn == api.BTN_UP:
            self._sel = (self._sel - 1) % self.N_ROWS
        elif btn == api.BTN_DOWN:
            self._sel = (self._sel + 1) % self.N_ROWS
        elif btn == api.BTN_A:
            self._activate_row()
        else:
            return
        self._top = self._scroll(self._sel, self._top, VISIBLE_ROWS)
        self._dirty = True

    @staticmethod
    def _scroll(sel, top, rows):
        if sel < top:
            return sel
        if sel >= top + rows:
            return sel - rows + 1
        return top

    # ── radio calls: answer the press before the blocking call ──────────
    def _radio_call(self, row, text, fn):
        """Show `text` on the row and present it, then run fn() (blocking
        radio work; truthy when it took). A failure leaves "failed" on
        the row for NOTE_MS."""
        self._pending = (row, text)
        self._row_note.pop(row, None)
        self._present_now()
        try:
            ok = fn()
        except Exception:
            ok = False
        self._pending = None
        self._call_end = self._frames
        self._snap = self._read()
        if not ok:
            self._row_note[row] = time.ticks_ms()
        self._dirty = True

    def _echo(self):
        """True for a press in the first frame after a radio call: it was
        latched while the call held the badge, so it is not a new tap."""
        return (self._call_end is not None and
                self._frames - self._call_end <= 1)

    def _present_now(self):
        """Paint the page and push it to the screen now, before a call
        that blocks the frame."""
        self._dirty = True
        try:
            self.draw(self._os.display)
            self._os.display.present()
        except Exception:
            pass

    def _noted(self, row):
        t = self._row_note.get(row)
        if t is None:
            return False
        if time.ticks_diff(time.ticks_ms(), t) > NOTE_MS:
            del self._row_note[row]
            self._dirty = True
            return False
        return True

    def _activate_row(self):
        if not self._wifi:
            return
        r = self._sel
        if r in (self.ROW_STATUS, self.ROW_POWER) and self._echo():
            return                      # pressed while the last call ran
        if r == self.ROW_STATUS:
            w = self._wifi
            if self._snap.get("radio_on"):
                def off():
                    w.auto_stop()
                    w.connect_cancel()
                    w.radio_off()
                    return not w.is_radio_on()
                self._radio_call(r, "turning off...", off)
            else:
                # The join itself is non-blocking: the run loop's
                # auto_tick() joins the best saved network in range.
                def on():
                    w.auto_begin()
                    return w.is_radio_on()
                self._radio_call(r, "turning on...", on)
        elif r == self.ROW_NEARBY:
            self._open_nearby()
        elif r == self.ROW_SAVED:
            self._open_saved()
        elif r == self.ROW_POWER:
            modes = self._wifi.POWER_MODES
            cur   = self._power_mode()
            try:
                nxt = modes[(modes.index(cur) + 1) % len(modes)]
            except ValueError:
                nxt = modes[0]
            def power():
                if self._wifi.set_power_mode(nxt) is False:
                    return False
                self._os.settings_set("wifi_power_mode", nxt)
                return True
            self._radio_call(r, "setting %s..." % POWER_LABELS.get(nxt, nxt),
                             power)
        elif r == self.ROW_AUTOCONNECT:
            try:
                self._os.settings_set("wifi_autoconnect",
                                      not self._autoconnect())
            except Exception:
                pass
        elif r == self.ROW_SPEED:
            self._run_speed_test()
        elif r == self.ROW_PING:
            self._run_ping()

    # ── nearby page ─────────────────────────────────────────────────────
    def _open_nearby(self):
        self._mode = "nearby"
        self._near_sel = 0
        self._near_top = 0
        self._reload_near()
        self._scan_seq = self._wifi.scan_seq()
        self._request_scan()

    def _request_scan(self):
        """Scan now, or as soon as an in-flight join releases the radio
        (IDF cannot scan while it is associating)."""
        w = self._wifi
        if w.scan_busy():
            self._scan_want = False
            return
        if self._joining():
            self._scan_want = True
            self._scan_note = "waiting for radio"
            return
        self._scan_want = False
        self._scan_note = ""
        try:
            radio_off = not w.is_radio_on()
        except Exception:
            radio_off = False
        if radio_off:
            # scan_start() powers the radio up first (a blocking C call):
            # say so on screen before it runs.
            self._scan_note = "starting the radio..."
            self._present_now()
            self._scan_note = ""
        if not w.scan_start():
            self._scan_note = "scan failed"

    def _on_button_nearby(self, btn):
        # C rescans here; the OS opens the notification panel on a
        # double-tap of C instead (CAPTURES_C on the class).
        if btn in (api.BTN_HOME, api.BTN_B):
            self._mode = "main"
        elif btn in (api.BTN_C, api.BTN_RIGHT):
            self._request_scan()
        elif self._near:
            n = len(self._near)
            if btn == api.BTN_UP:
                self._near_sel = (self._near_sel - 1) % n
            elif btn == api.BTN_DOWN:
                self._near_sel = (self._near_sel + 1) % n
            elif btn == api.BTN_A:
                self._pick_nearby(self._near[self._near_sel])
            else:
                return
            self._near_top = self._scroll(self._near_sel, self._near_top,
                                          NET_ROWS)
        else:
            return
        self._dirty = True

    def _pick_nearby(self, net):
        ssid = net.get("ssid") or ""
        if not ssid:
            return
        if ssid == (self._snap.get("ssid") or "") and self._snap.get("connected"):
            self._c_ssid, self._c_state = ssid, "ok"
            self._c_ip = self._snap.get("ip") or ""
            self._c_done_ms = time.ticks_ms()
            self._back, self._mode = "nearby", "connect"
            return
        saved = self._wifi.get_saved(ssid)
        if saved is not None:
            self._start_connect(ssid, saved.get("password") or "", "nearby")
        elif not net.get("secure"):
            # Open network: join, and remember it only once it works.
            self._start_connect(ssid, "", "nearby", save=True)
        else:
            self._pw_ssid = ssid
            self._mode = "pwhelp"

    def _on_button_pwhelp(self, btn):
        if btn in (api.BTN_A, api.BTN_B, api.BTN_HOME):
            self._mode = "nearby"
        else:
            return
        self._dirty = True

    # ── saved page ──────────────────────────────────────────────────────
    def _open_saved(self):
        self._reload_nets()
        self._reload_near()
        self._nets_sel = 0
        self._nets_top = 0
        self._forget_ssid = ""
        self._mode = "saved"

    def _on_button_saved(self, btn):
        if btn in (api.BTN_HOME,) or (btn == api.BTN_B and not self._nets):
            self._mode = "main"
            self._dirty = True
            return
        n = len(self._nets)
        if n == 0:
            return
        net = self._nets[self._nets_sel]
        ssid = net.get("ssid") or ""
        if btn == api.BTN_UP:
            self._nets_sel = (self._nets_sel - 1) % n
            self._forget_ssid = ""
        elif btn == api.BTN_DOWN:
            self._nets_sel = (self._nets_sel + 1) % n
            self._forget_ssid = ""
        elif btn == api.BTN_A:
            try:
                self._wifi.set_priority(ssid, 1)
            except Exception:
                pass
            self._start_connect(ssid, net.get("password") or "", "saved")
        elif btn == api.BTN_B:
            now = time.ticks_ms()
            if (self._forget_ssid == ssid and
                    time.ticks_diff(now, self._forget_ms) < FORGET_MS):
                try:
                    self._wifi.remove_saved(ssid)
                except Exception:
                    pass
                self._forget_ssid = ""
                self._reload_nets()
            else:
                self._forget_ssid = ssid
                self._forget_ms = now
        elif btn == api.BTN_LEFT:
            try:
                self._wifi.add_saved(ssid, net.get("password") or "",
                                     priority=int(net.get("priority", 10)),
                                     metered=not bool(net.get("metered")))
            except Exception:
                pass
            self._reload_nets()
        else:
            return
        self._nets_top = self._scroll(self._nets_sel, self._nets_top, NET_ROWS)
        self._dirty = True

    # ── connect overlay ─────────────────────────────────────────────────
    def _start_connect(self, ssid, pw, back, save=False):
        w = self._wifi
        try:
            w.auto_stop()
        except Exception:
            pass
        self._c_ssid  = ssid
        self._c_save  = (ssid, pw) if save else None
        self._c_ip    = ""
        self._back    = back
        self._mode    = "connect"
        self._dirty   = True
        self._c_state = "busy"
        # IDF cannot join while a scan is hopping channels; queue the join
        # until the background scan ends (a second or two at most).
        self._c_pending = (ssid, pw)
        if not w.scan_busy():
            self._begin_pending()
        else:
            self._present_now()         # "waiting for the scan"

    def _begin_pending(self):
        ssid, pw = self._c_pending
        self._c_pending = None
        # connect_begin() powers the radio and hands the network to the
        # driver (C calls that block the frame): the overlay goes up first.
        self._c_phase = "starting"
        self._present_now()
        self._c_phase = ""
        ok = False
        try:
            ok = self._wifi.connect_begin(ssid, pw)
        except Exception:
            ok = False
        if not ok:
            self._finish_connect("failed")

    def _on_button_connect(self, btn):
        if self._c_state == "busy":
            if btn in (api.BTN_B, api.BTN_HOME):
                self._c_pending = None
                try:
                    self._wifi.connect_cancel()
                except Exception:
                    pass
                self._finish_connect("cancelled")
            return
        # Any key dismisses a finished result.
        self._mode = self._back
        self._reload_near()
        self._reload_nets()
        self._dirty = True

    def _finish_connect(self, state):
        self._c_state = state
        self._c_done_ms = time.ticks_ms()
        self._c_code = ""
        if state not in ("ok", "cancelled"):
            # Only a real disconnect reason is worth showing; a timeout
            # usually ends on a neutral status (IDLE / CONNECTING).
            try:
                code = self._wifi.connect_last_code()
                if (code is not None and
                        self._wifi.classify_status(code) is not None):
                    self._c_code = "code " + self._wifi.status_name(code)
            except Exception:
                pass
        self._snap = self._read()
        if state == "ok":
            self._c_ip = self._snap.get("ip") or ""
            if self._c_save:
                ssid, pw = self._c_save
                try:
                    self._wifi.add_saved(ssid, pw, priority=10)
                except Exception:
                    pass
                self._count_saved()
        self._c_save = None
        self._dirty = True

    def _tick_connect(self):
        if self._c_state == "busy" and self._c_pending is not None:
            try:
                self._wifi.scan_poll()
                if not self._wifi.scan_busy():
                    self._begin_pending()
            except Exception:
                self._finish_connect("failed")
            return True
        if self._c_state == "busy":
            try:
                r = self._wifi.connect_poll()
            except Exception:
                r = "failed"
            if r != "connecting":
                self._finish_connect(r)
            return True
        if time.ticks_diff(time.ticks_ms(), self._c_done_ms) > RESULT_MS:
            self._mode = self._back
            self._reload_near()
            self._reload_nets()
            self._dirty = True
        return False

    # ── async-ish helpers (blocking but with a "Testing..." paint) ──────
    def _paint_busy(self, label):
        """Force a frame showing the busy label so the user sees that
        the device hasn't frozen during the synchronous test call."""
        self._busy = label
        self._dirty = True
        try:
            self.draw(self._os.display)
            self._os.display.present()
        except Exception:
            pass

    def _card(self, title, detail):
        """An oreoOS.busy card (spinner on its own thread) over the page
        while a synchronous test runs, or None on an OS without it."""
        try:
            from oreoOS import busy
            return busy.start(title, detail, display=self._os.display)
        except Exception:
            return None

    @staticmethod
    def _end_card(card):
        if card is not None:
            card.stop(restore=False)     # the page repaints next frame

    def _run_speed_test(self):
        if not self._wifi or not self._snap.get("connected"):
            self._speed_label = "no link"
            return
        self._speed_label = "testing..."
        self._paint_busy("speed")
        cancel = [False]

        def _pump():
            try:
                self._os.buttons.update()
                for b_ in api.BUTTONS:
                    if self._os.buttons.just_pressed(b_):
                        cancel[0] = True
                        return True
            except Exception:
                pass
            return False

        card = self._card("Testing speed", "Any button cancels")
        try:
            ok, kbps, ms = self._wifi.speed_test(pump_cb=_pump)
        except Exception:
            ok, kbps, ms = (False, 0, 0)
        finally:
            self._end_card(card)
        self._busy = ""
        if cancel[0]:
            self._speed_label = "cancelled"
        elif not ok or kbps <= 0:
            self._speed_label = "failed"
        elif kbps >= 1000:
            self._speed_label = "%.1f Mbps %d ms" % (kbps / 1000.0, ms)
        else:
            self._speed_label = "%d kbps %d ms" % (kbps, ms)
        self._dirty = True

    def _run_ping(self):
        if not self._wifi or not self._snap.get("connected"):
            self._ping_label = "no link"
            return
        self._ping_label = "pinging..."
        self._paint_busy("ping")
        card = self._card("Pinging", "Waiting for a reply")
        try:
            ok, rtt = self._wifi.ping()
        except Exception:
            ok, rtt = (False, None)
        finally:
            self._end_card(card)
        self._busy = ""
        if not ok or rtt is None:
            self._ping_label = "timeout"
        else:
            self._ping_label = "%d ms" % rtt
        self._dirty = True

    # ── update ──────────────────────────────────────────────────────────
    def update(self, dt):
        self._frames += 1
        self._poll_t += dt
        if self._poll_t >= self._poll_dt:
            self._poll_t = 0.0
            fresh = self._read()
            if fresh != self._snap:
                self._snap = fresh
                self._dirty = True

        animating = False
        w = self._wifi
        m = self._mode
        if w is not None:
            if m == "connect":
                animating = self._tick_connect()
            elif m in ("nearby", "saved", "main"):
                try:
                    st = w.scan_poll()
                except Exception:
                    st = "idle"
                seq = w.scan_seq()
                if seq != self._scan_seq:
                    self._scan_seq = seq
                    self._reload_near()
                    if not self._scan_want:
                        self._scan_note = ""
                    self._dirty = True
                if st == "error" and m == "nearby":
                    try:
                        why = w.scan_error() or "scan failed"
                    except Exception:
                        why = "scan failed"
                    note = _clip(why, 24) + " - C to retry"
                    if note != self._scan_note:
                        self._scan_note = note
                        self._dirty = True
                if self._scan_want and not self._joining():
                    self._request_scan()
                    self._dirty = True
                if m == "nearby" and (st == "busy" or self._scan_want):
                    animating = True
                if m == "main" and self._joining():
                    animating = True
                if m == "saved" and self._forget_ssid and time.ticks_diff(
                        time.ticks_ms(), self._forget_ms) >= FORGET_MS:
                    self._forget_ssid = ""
                    self._dirty = True
        if animating:
            now = time.ticks_ms()
            if time.ticks_diff(now, self._anim_next) >= 0:
                self._anim_next = time.ticks_add(now, ANIM_MS)
                self._dirty = True

    # ── render ──────────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return
        self._dirty = False
        d.clear(theme.BG)
        m = self._mode
        if m == "nearby":
            self._draw_nearby(d)
        elif m == "saved":
            self._draw_saved(d)
        elif m == "connect":
            self._draw_connect(d)
        elif m == "pwhelp":
            self._draw_pwhelp(d)
        else:
            self._draw_main(d)

    def _main_rows(self):
        snap = self._snap
        on = bool(snap.get("radio_on"))
        joining = self._joining()
        if joining:
            dots = "." * (1 + (time.ticks_ms() // 300) % 3)
            net = ("joining" + dots, theme.GOLD)
        elif snap.get("connected"):
            net = (snap.get("ssid") or "?", theme.TEXT_BRIGHT)
        else:
            net = ("not connected" if on else "-", theme.MUTED)
        try:
            n_near = len(self._wifi.nearby()) if self._wifi else 0
        except Exception:
            n_near = 0
        n_saved = self._n_saved
        scanning = bool(self._wifi and self._wifi.scan_busy())
        status = ("ON" if on else "OFF", theme.PRIMARY if on else theme.MUTED)
        power = (POWER_LABELS.get(self._power_mode(), "?"), theme.TEAL)
        pend = self._pending
        if pend is not None and pend[0] == self.ROW_STATUS:
            status = (pend[1], theme.GOLD)
        elif self._noted(self.ROW_STATUS):
            status = ("failed (" + status[0] + ")", theme.PRIMARY)
        if pend is not None and pend[0] == self.ROW_POWER:
            power = (pend[1], theme.GOLD)
        elif self._noted(self.ROW_POWER):
            power = ("failed (" + power[0] + ")", theme.PRIMARY)
        return (
            ("Status",       status[0], status[1]),
            ("Network",      net[0], net[1]),
            ("IP",           snap.get("ip") or "-", theme.TEXT_DIM),
            ("Nearby",       "scanning..." if scanning else
                             ("%d found" % n_near), theme.TEAL),
            ("Saved",        "%d saved" % n_saved, theme.TEXT_BRIGHT),
            ("Speed",        self._speed_label or "-", theme.TEAL),
            ("Ping",         self._ping_label or "-", theme.TEAL),
            ("Power",        power[0], power[1]),
            ("Auto-connect", "ON" if self._autoconnect() else "OFF",
                             theme.TEXT_BRIGHT),
        )

    def _draw_main(self, d):
        widgets.draw_header(d, "WIFI")
        rows = self._main_rows()
        snap = self._snap
        for vi in range(VISIBLE_ROWS):
            i = self._top + vi
            if i >= len(rows):
                break
            label, value, color = rows[i]
            y = ROW_TOP_Y + vi * ROW_H
            if i == self._sel:
                _sel_row(d, y)
            d.text(label, ROW_PAD_X, y + 4, theme.TEXT_BRIGHT, scale=1)
            d.text(_clip(str(value), 20), VALUE_X, y + 4, color, scale=1)
            if i == self.ROW_NETWORK and snap.get("connected"):
                lvl = self._wifi.signal_level(snap.get("rssi"))
                _bars_icon(d, SW - ROW_PAD_X - 16, y + 3, lvl, theme.TEAL)
        # Scroll cues.
        if self._top > 0:
            d.text("^", SW - 10, ROW_TOP_Y - 4, theme.MUTED)
        if self._top + VISIBLE_ROWS < len(rows):
            d.text("v", SW - 10, LIST_BOTTOM - 10, theme.MUTED)
        if self._pending is not None:
            widgets.draw_hint(d, "Please wait...")
        elif self._noted(self.ROW_STATUS) or self._noted(self.ROW_POWER):
            widgets.draw_hint(d, "The radio didn't change. A = retry")
        else:
            widgets.draw_hint(d, "A=select  B=back")

    def _draw_status_strip(self, d, text, color, busy):
        d.text(text, ROW_PAD_X, ROW_TOP_Y - 2, color, scale=1)
        if busy:
            _sweep(d, ROW_TOP_Y + 10, time.ticks_ms(), theme.PRIMARY)
        else:
            d.rect(ROW_PAD_X, ROW_TOP_Y + 10, SW - 2 * ROW_PAD_X, 1,
                   theme.MUTED2, fill=True)

    def _draw_nearby(self, d):
        widgets.draw_header(d, "NEARBY")
        w = self._wifi
        busy = bool(w and w.scan_busy())
        if busy:
            secs = w.scan_elapsed_ms() // 100
            self._draw_status_strip(
                d, "Scanning%s %d.%ds" % ("." * (1 + secs // 3 % 3),
                                          secs // 10, secs % 10),
                theme.PRIMARY, True)
        elif self._scan_note:
            self._draw_status_strip(d, self._scan_note, theme.GOLD,
                                    self._scan_want)
        else:
            live = bool(w and w.nearby_is_live())
            txt = ("%d networks" % len(self._near)) if live else \
                  ("%d remembered - C to scan" % len(self._near))
            self._draw_status_strip(d, txt, theme.TEXT_DIM, False)

        if not self._near:
            if not busy:
                d.text("No networks found.", ROW_PAD_X, NET_TOP_Y + 10,
                       theme.MUTED)
                d.text("Press C to scan again.", ROW_PAD_X, NET_TOP_Y + 26,
                       theme.MUTED2)
            widgets.draw_hint(d, "C=rescan  B=back")
            return

        cur = (self._snap.get("ssid") or "") if self._snap.get("connected") else ""
        joining = self._joining()
        for vi in range(NET_ROWS):
            i = self._near_top + vi
            if i >= len(self._near):
                break
            n = self._near[i]
            y = NET_TOP_Y + vi * ROW_H
            if i == self._near_sel:
                _sel_row(d, y)
            ssid = n.get("ssid") or "?"
            lvl = w.signal_level(n.get("rssi"))
            _bars_icon(d, ROW_PAD_X, y + 3, lvl,
                       theme.TEAL if lvl >= 2 else theme.GOLD)
            d.text(_clip(ssid, 22), ROW_PAD_X + 22, y + 4,
                   theme.TEXT_BRIGHT, scale=1)
            x = SW - ROW_PAD_X - 8
            if n.get("secure"):
                _lock_icon(d, x, y + 3, theme.TEXT_DIM)
            x -= 8
            if ssid == cur:
                tag, col = "on", GREEN
            elif ssid == joining:
                tag, col = "...", theme.GOLD
            elif ssid in self._saved_set:
                tag, col = "saved", theme.PRIMARY
            else:
                tag = ""
                col = theme.MUTED
            if tag:
                d.text(tag, x - len(tag) * 8, y + 4, col, scale=1)
        if self._near_top + NET_ROWS < len(self._near):
            d.text("v", SW - 10, LIST_BOTTOM - 10, theme.MUTED)
        widgets.draw_hint(d, "A=join  C=rescan  B=back")

    def _draw_saved(self, d):
        widgets.draw_header(d, "SAVED")
        if not self._nets:
            self._draw_status_strip(d, "No saved networks", theme.MUTED, False)
            d.text("Join one from Nearby, or add one", ROW_PAD_X,
                   NET_TOP_Y + 6, theme.TEXT_DIM)
            d.text("from a computer over USB:", ROW_PAD_X,
                   NET_TOP_Y + 20, theme.TEXT_DIM)
            d.text("falera wifi connect \"name\"", ROW_PAD_X,
                   NET_TOP_Y + 34, theme.TEAL)
            widgets.draw_hint(d, "B=back")
            return
        if self._forget_ssid:
            self._draw_status_strip(d, "Press B again to forget",
                                    theme.PRIMARY, False)
        else:
            self._draw_status_strip(d, "%d saved - first match joins at boot"
                                    % len(self._nets), theme.TEXT_DIM, False)
        cur = (self._snap.get("ssid") or "") if self._snap.get("connected") else ""
        for vi in range(NET_ROWS):
            i = self._nets_top + vi
            if i >= len(self._nets):
                break
            n = self._nets[i]
            y = NET_TOP_Y + vi * ROW_H
            if i == self._nets_sel:
                _sel_row(d, y)
            ssid = n.get("ssid") or "?"
            rssi = self._rssi_of(ssid)
            if rssi is not None:
                _bars_icon(d, ROW_PAD_X, y + 3, self._wifi.signal_level(rssi),
                           theme.TEAL)
            else:
                d.text("-", ROW_PAD_X + 4, y + 4, theme.MUTED2)
            d.text(_clip(ssid, 20), ROW_PAD_X + 22, y + 4,
                   theme.TEXT_BRIGHT if ssid != self._forget_ssid
                   else theme.PRIMARY, scale=1)
            x = SW - ROW_PAD_X
            if n.get("metered"):
                x -= 8
                d.text("$", x, y + 4, theme.GOLD)
            if ssid == cur:
                x -= 24
                d.text("on", x, y + 4, GREEN)
        widgets.draw_hint(d, "A=join  B=forget  L=metered")

    def _draw_connect(self, d):
        widgets.draw_header(d, "WIFI")
        cx = SW // 2
        y = 70
        st = self._c_state
        ssid = _clip(self._c_ssid, 26)
        if st == "busy":
            t = time.ticks_ms()
            d.text("Connecting to", cx - 13 * 4, y, theme.TEXT_DIM)
            d.text(ssid, cx - len(ssid) * 4, y + 16, theme.TEXT_BRIGHT)
            # Three pulsing dots plus a progress bar against the timeout.
            for k in range(3):
                on = (t // 250) % 3 == k
                d.rect(cx - 20 + k * 16, y + 44, 8, 8,
                       theme.PRIMARY if on else theme.MUTED2, fill=True)
            el, total = 0, 15000
            try:
                el = self._wifi.connect_elapsed_ms()
                total = max(1, self._wifi.connect_timeout_ms())
            except Exception:
                pass
            bw = SW - 80
            d.rect(40, y + 70, bw, 4, theme.MUTED2, fill=True)
            d.rect(40, y + 70, min(bw, bw * el // total), 4,
                   theme.PRIMARY, fill=True)
            if self._c_phase:
                note = "Starting the radio..."
            elif self._c_pending is not None:
                note = "Waiting for the scan to end"
            else:
                note = "Joining: %d of %d s" % (el // 1000, total // 1000)
            d.text(note, cx - len(note) * 4, y + 84, theme.TEXT_DIM)
            widgets.draw_hint(d, "B=cancel")
            return
        if st == "ok":
            d.rect(cx - 14, y, 28, 28, GREEN, fill=True)
            d.text("OK", cx - 8, y + 10, theme.BG)
            msg = "Connected"
            d.text(msg, cx - len(msg) * 8, y + 40, GREEN, scale=2)
            d.text(ssid, cx - len(ssid) * 4, y + 64, theme.TEXT_BRIGHT)
            if self._c_ip:
                d.text(self._c_ip, cx - len(self._c_ip) * 4, y + 80,
                       theme.TEXT_DIM)
        elif st == "cancelled":
            msg = "Cancelled"
            d.text(msg, cx - len(msg) * 8, y + 30, theme.MUTED, scale=2)
        else:
            title, sub = FAIL_TEXT.get(st, FAIL_TEXT["failed"])
            d.rect(cx - 14, y, 28, 28, theme.PRIMARY, fill=True)
            d.text("!", cx - 4, y + 10, theme.BG)
            d.text(title, cx - len(title) * 8, y + 40, theme.PRIMARY, scale=2)
            d.text(ssid, cx - len(ssid) * 4, y + 64, theme.TEXT_BRIGHT)
            d.text(sub, cx - len(sub) * 4, y + 80, theme.TEXT_DIM)
            if self._c_code:
                # Raw driver reason, so a failure on the badge can be
                # matched against wifi.debug_dump() / the IDF reason list.
                code = _clip(self._c_code, 38)
                d.text(code, cx - len(code) * 4, y + 96, theme.MUTED)
        widgets.draw_hint(d, "any key to continue")

    def _draw_pwhelp(self, d):
        widgets.draw_header(d, "PASSWORD")
        y = ROW_TOP_Y + 4
        ssid = _clip(self._pw_ssid, 30)
        _lock_icon(d, ROW_PAD_X, y + 1, theme.PRIMARY)
        d.text(ssid, ROW_PAD_X + 14, y + 2, theme.TEXT_BRIGHT)
        lines = (
            "This network needs a password.",
            "The badge has no keyboard, so add",
            "it from a computer over USB:",
            "",
            "1. Plug the badge in",
            "2. Run: falera wifi connect",
            "   \"" + _clip(self._pw_ssid, 22) + "\"",
            "3. Type the password there",
            "",
            "It is saved here and joined; next",
            "time it joins on its own.",
        )
        for i, ln in enumerate(lines):
            d.text(ln, ROW_PAD_X, y + 22 + i * 13,
                   theme.TEAL if ln and ln[0] in "123 " else theme.TEXT_DIM)
        widgets.draw_hint(d, "B=back")
