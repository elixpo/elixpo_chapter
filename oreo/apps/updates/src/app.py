"""Updates: the installed FaleraOS version, the update check, and installs.

Reached from Settings > Version, About, and the notification panel's
"Update available" card.

    +---------------- UPDATES ----------------+
    | INSTALLED                       CHANNEL |
    | v2.0.13                          stable |
    | Checked 5 min ago                       |
    | --------------------------------------- |
    |   state block (below)                   |
    +- hint: the buttons for this state ------+

States and buttons (A selects / confirms, B goes back, HOME is the OS's):
    checking    spinner                                   B back
    up to date  "You're up to date", newest release       A check again
    ahead       a build newer than the newest release     A check again
    available   new version, size, start of the notes;
                INSTALL / NOTES, LEFT/RIGHT choose        A select
    notes       release notes, UP/DOWN scroll             B back
    confirm     what installing does                      A install, B cancel
    installing  progress bar: files, bytes, current file  (HOME stops it)
    ready       downloaded; restarts to install           A restart now
    failed      what failed, in plain words               A try again

Nothing here blocks a frame: the check (GitHub tags, then the release
manifest and the file comparison) and the download run on a worker
(oreoOS.cache.Refresh). The worker only returns data and writes progress
numbers; settings and drawing stay on the UI thread. Without threads the
job runs inside poll() a frame later, as everywhere else in FaleraOS.
"""

import oreoOS
import time
from oreoOS import api, theme, widgets

SW = api.SCREEN_W
SH = api.SCREEN_H

# A background probe (or the clock sync) still on its thread when this
# app checks: wait this long for it, so two TLS sessions never share the
# heap. Longer than ota.T_GH_API plus a DNS lookup.
WAIT_BG_MS = 12000

CHANNEL = "stable"
RESTART_MS = 1500        # "Restarting to install" stays this long
SPIN_MS = 90             # spinner step
PAD_X = 14
LINE_H = 12
CHARS = (SW - 2 * PAD_X) // 8        # 36 columns at scale 1

INFO_Y = widgets.HEADER_H + 6
RULE_Y = INFO_Y + 46
BODY_Y = RULE_Y + 8
BODY_BOT = SH - widgets.HINT_H - 4
BTN_W = 132
BTN_H = 28
BTN_GAP = 12
BTN_Y = BODY_BOT - BTN_H

S_CHECKING = "checking"
S_UP_TO_DATE = "up_to_date"
S_AHEAD = "ahead"
S_AVAILABLE = "available"
S_NOTES = "notes"
S_CONFIRM = "confirm"
S_INSTALLING = "installing"
S_READY = "ready"
S_FAILED = "failed"

HINTS = {
    S_CHECKING:   "B back",
    S_UP_TO_DATE: "A check again   B back",
    S_AHEAD:      "A check again   B back",
    S_AVAILABLE:  "L/R choose   A select   B back",
    S_NOTES:      "UP/DOWN scroll   B back",
    S_CONFIRM:    "A install   B cancel",
    S_INSTALLING: "Downloading. HOME stops it",
    S_READY:      "A restart now   B back",
    S_FAILED:     "A try again   B back",
}


# ── small helpers (pure; host-tested) ────────────────────────────────────

def wait_background(pulse=None, limit_ms=WAIT_BG_MS, net=None):
    """Block (on the worker) while netsvc.fetch_busy() is True, at most
    `limit_ms`. Returns True if the way is clear."""
    if net is None:
        try:
            from oreoOS import netsvc as net
        except Exception:
            return True
    t0 = time.ticks_ms()
    while True:
        try:
            if not net.fetch_busy():
                return True
        except Exception:
            return True
        if time.ticks_diff(time.ticks_ms(), t0) >= limit_ms:
            return False
        if pulse is not None:
            pulse("wait")
        time.sleep_ms(50)


def wrap(text, width=CHARS):
    """Word-wrap `text` (keeping its line breaks) to `width` columns."""
    out = []
    for raw in (text or "").splitlines():
        if not raw.strip():
            out.append("")
            continue
        cur = ""
        for w in raw.split():
            while len(w) > width:
                if cur:
                    out.append(cur)
                    cur = ""
                out.append(w[:width])
                w = w[width:]
            cand = (cur + " " + w) if cur else w
            if len(cand) <= width:
                cur = cand
            else:
                out.append(cur)
                cur = w
        if cur:
            out.append(cur)
    return out


def clean_notes(text):
    """Release notes for a 36-column screen: Markdown marks dropped, at
    most one blank line in a row."""
    res = []
    for ln in (text or "").splitlines():
        s = ln.strip()
        while s.startswith("#"):
            s = s[1:]
        s = s.strip()
        if s.startswith("* "):
            s = "- " + s[2:]
        s = s.replace("**", "").replace("`", "")
        if s or (res and res[-1]):
            res.append(s)
    while res and not res[-1]:
        res.pop()
    return "\n".join(res)


def error_lines(text, width=CHARS):
    """An error such as 'Downloading oreoOS/splash.rv565: release-assets.
    githubusercontent.com: timed out' as screen lines: one line per part
    (step and file, host, reason), each wrapped."""
    parts = []
    for part in (text or "").split(": "):
        part = part.strip()
        if parts and parts[-1] == "TLS":
            parts[-1] = "TLS: " + part       # keep "TLS: <reason>" whole
        elif part:
            parts.append(part)
    if len(parts) > 1 and parts[0] == "Checking for updates":
        parts.pop(0)                         # the screen's title says it
    out = []
    for part in parts:
        out.extend(wrap(part, width))
    return out


def human_size(n):
    n = int(n or 0)
    if n < 1024:
        return "%d B" % n
    if n < 1024 * 1024:
        return "%d KB" % ((n + 1023) // 1024)
    mb = 1024 * 1024
    return "%d.%d MB" % (n // mb, (n % mb) * 10 // mb)


def ago(then_s, now_s):
    """'Checked 5 min ago' for wall-clock seconds; '' when unknown."""
    try:
        then_s = int(then_s or 0)
        now_s = int(now_s or 0)
    except (TypeError, ValueError):
        return ""
    if now_s <= 0:
        return ""
    if then_s <= 0:
        return "Not checked yet"
    if now_s < then_s:
        return ""
    d = now_s - then_s
    if d < 60:
        return "Checked just now"
    if d < 3600:
        return "Checked %d min ago" % (d // 60)
    if d < 86400:
        return "Checked %d h ago" % (d // 3600)
    return "Checked %d days ago" % (d // 86400)


def _ota():
    try:
        from oreoOS import ota
        return ota
    except Exception:
        return None


def _why(ota, fallback):
    try:
        return ota.error_text() or fallback
    except Exception:
        return fallback


def _current_version():
    try:
        from oreoOS.config import VERSION
        return VERSION
    except Exception:
        return "?"


def _now_s():
    """Wall-clock seconds, or 0 while the clock is not set (the RTC starts
    in 2000, which would read as 'checked 9000 days ago')."""
    try:
        t = int(time.time())
        return t if time.localtime(t)[0] >= 2026 else 0
    except Exception:
        return 0


# ── worker job: network and flash only, no settings, no drawing ──────────

def check_job(channel=CHANNEL):
    """Newest release vs this badge; the file comparison when newer."""
    ota = _ota()
    if ota is None:
        return {"error": "Update module missing"}
    wait_background()
    ver, rel = ota.latest_version(channel)
    if not ver or not rel:
        return {"error": _why(ota, "Couldn't reach GitHub")}
    cmp = ota.compare_version(_current_version(), ver)
    out = {"latest": ver, "release": rel, "cmp": cmp}
    if cmp < 0:
        pk = ota.peek(rel)
        if not pk:
            out["error"] = _why(ota, "Couldn't read the release")
        else:
            out["peeked"] = pk
    return out


class App(oreoOS.App):
    name = "Updates"
    author = "Circuit-Overtime"
    SHOW_LOADING = True

    BTN_INSTALL, BTN_NOTES = 0, 1

    def on_enter(self, os_):
        super().on_enter(os_)
        self._os = os_
        self._state = S_CHECKING
        self._sel = self.BTN_INSTALL
        self._latest = ""
        self._release = None
        self._peeked = None
        self._notes = []
        self._scroll = 0
        self._error = ""
        self._fail_action = "check"
        self._job = None
        self._job_kind = None
        self._cancel = False
        self._restart_at = None
        self._spin = 0
        self._spin_ms = 0
        self._dirty = True
        # Progress, written by the download worker, read by draw().
        self._p_files = 0
        self._p_total = 0
        self._p_bytes = 0
        self._p_bytes_total = 0
        self._p_path = ""
        ota = _ota()
        if ota is not None and ota.is_pending():
            # Downloaded earlier and not installed yet: offer the restart.
            self._latest = self._get("ota_pending_version", "") or ""
            self._state = S_READY
            return
        self._start_check()

    def on_exit(self):
        # A download still running stops after its current file (HOME).
        self._cancel = True
        try:
            super().on_exit()
        except Exception:
            pass

    # ── settings (UI thread only) ─────────────────────────────────────
    def _get(self, key, default=None):
        try:
            return self._os.settings_get(key, default)
        except Exception:
            return default

    def _set(self, key, value):
        try:
            self._os.settings_set(key, value)
        except Exception:
            pass

    # ── jobs ──────────────────────────────────────────────────────────
    def _start(self, kind, fn):
        try:
            from oreoOS import cache
            job = cache.Refresh(fn)
        except Exception:
            self._fail("Update module missing", kind)
            return
        self._job, self._job_kind = job, kind
        job.start()
        self._dirty = True

    def _start_check(self):
        if self._job is not None and self._job.busy():
            return
        self._state = S_CHECKING
        self._error = ""
        self._start("check", check_job)

    def _start_install(self):
        ota = _ota()
        if ota is None or not self._peeked:
            self._fail("Nothing to install yet: check again.", "check")
            return
        busy = getattr(ota, "download_busy", None)
        if busy is not None and busy():
            self._fail("The last download is still stopping. Try again "
                       "in a moment.", "install")
            return
        self._state = S_INSTALLING
        self._cancel = False
        self._p_files = 0
        self._p_total = len(self._peeked.get("changed", ()))
        self._p_bytes = 0
        self._p_bytes_total = int(self._peeked.get("bytes", 0) or 0)
        self._p_path = ""
        peeked = self._peeked

        def run():
            kw = {"on_progress": self._on_file, "on_bytes": self._on_bytes}
            try:
                ok = ota.download(peeked, cancel=self._cancelled, **kw)
            except TypeError:           # an ota.download without cancel=
                ok = ota.download(peeked, **kw)
            return {"ok": bool(ok),
                    "error": "" if ok else _why(ota, "Download failed")}
        self._start("install", run)

    def _cancelled(self):
        return self._cancel

    # Worker thread: plain assignments only.
    def _on_file(self, index, total, path):
        self._p_files = index
        self._p_total = total
        self._p_path = path or ""

    def _on_bytes(self, done, total, path):
        self._p_bytes = done
        self._p_bytes_total = total
        self._p_path = path or ""

    def _finish_job(self, kind, res):
        if kind == "check":
            self._finish_check(res or {"error": "Check failed"})
        else:
            self._finish_install(res or {"ok": False,
                                         "error": "Download failed"})

    def _finish_check(self, res):
        if res.get("latest"):
            self._latest = res["latest"]
            self._release = res.get("release")
            now = _now_s()
            if now:
                self._set("ota_last_check_s", now)
        if res.get("error"):
            self._fail(res["error"], "check")
            return
        cmp = res.get("cmp", 0)
        if cmp > 0:
            self._state = S_AHEAD
            self._set("ota_status", "beta")
            return
        if cmp == 0:
            self._state = S_UP_TO_DATE
            self._set("ota_status", "up-to-date")
            return
        pk = res.get("peeked") or {}
        self._peeked = pk
        notes = pk.get("notes") or (self._release or {}).get("notes") or ""
        self._notes = wrap(clean_notes(notes)) or ["No release notes."]
        self._scroll = 0
        self._sel = self.BTN_INSTALL
        self._state = S_AVAILABLE
        self._set("ota_pending_version", self._latest)
        self._set("ota_pending_bytes", int(pk.get("bytes", 0) or 0))
        self._set("ota_status", "available")
        try:
            _ota().push_update_notification(self._latest)
        except Exception:
            pass

    def _finish_install(self, res):
        if not res.get("ok"):
            self._set("ota_status", "download-failed")
            self._fail(res.get("error") or "Download failed", "install")
            return
        self._set("ota_status", "ready")
        self._set("ota_pending_peek_ok", False)
        self._state = S_READY
        self._restart_at = time.ticks_add(time.ticks_ms(), RESTART_MS)

    def _fail(self, why, action):
        self._state = S_FAILED
        self._error = why or "Something went wrong"
        self._fail_action = action
        self._dirty = True

    def _restart(self):
        self._restart_at = None
        try:
            import machine
            machine.reset()
        except Exception:
            self._os.quit()

    # ── update / input ────────────────────────────────────────────────
    def update(self, dt):
        job = self._job
        if job is not None and job.poll():
            self._job = None
            self._finish_job(self._job_kind, job.result)
            self._dirty = True
        if self._state in (S_CHECKING, S_INSTALLING):
            now = time.ticks_ms()
            if time.ticks_diff(now, self._spin_ms) >= SPIN_MS:
                self._spin_ms = now
                self._spin = (self._spin + 1) % 8
                self._dirty = True
        if (self._restart_at is not None
                and time.ticks_diff(time.ticks_ms(), self._restart_at) >= 0):
            self._restart()

    def on_button_press(self, btn):
        st = self._state
        if st == S_NOTES:
            if btn == api.BTN_B:
                self._state = S_AVAILABLE
            elif btn == api.BTN_UP:
                self._scroll = max(0, self._scroll - 1)
            elif btn == api.BTN_DOWN:
                self._scroll = min(self._max_scroll(), self._scroll + 1)
            else:
                return
        elif st == S_CONFIRM:
            if btn == api.BTN_A:
                self._start_install()
            elif btn == api.BTN_B:
                self._state = S_AVAILABLE
            else:
                return
        elif st == S_AVAILABLE:
            if btn in (api.BTN_LEFT, api.BTN_RIGHT):
                self._sel = (self.BTN_INSTALL if btn == api.BTN_LEFT
                             else self.BTN_NOTES)
            elif btn == api.BTN_A:
                if self._sel == self.BTN_INSTALL:
                    self._state = S_CONFIRM
                else:
                    self._state = S_NOTES
                    self._scroll = 0
            elif btn == api.BTN_B:
                self._os.quit()
            else:
                return
        elif st == S_INSTALLING:
            return                      # HOME (the OS's) is the way out
        elif st == S_READY:
            if btn == api.BTN_A:
                self._restart()
            elif btn == api.BTN_B and self._restart_at is None:
                self._os.quit()
            else:
                return
        elif st == S_FAILED:
            if btn == api.BTN_A:
                if self._fail_action == "install" and self._peeked:
                    self._start_install()
                else:
                    self._start_check()
            elif btn == api.BTN_B:
                self._os.quit()
            else:
                return
        else:                           # checking, up to date, ahead
            if btn == api.BTN_A and st != S_CHECKING:
                self._start_check()
            elif btn == api.BTN_B:
                self._os.quit()
            else:
                return
        self._dirty = True

    # ── drawing ───────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return
        self._dirty = False
        d.clear(theme.BG)
        widgets.draw_header(d, "UPDATES")
        widgets.draw_hint(d, HINTS.get(self._state, "B back"))
        if self._state == S_NOTES:
            self._draw_notes(d)
            return
        self._draw_info(d)
        getattr(self, "_draw_" + self._state)(d)

    def _center(self, d, s, y, color, scale=1):
        s = s[:(SW - 8) // (8 * scale)]
        d.text(s, (SW - len(s) * 8 * scale) // 2, y, color, scale=scale)

    def _draw_info(self, d):
        d.text("INSTALLED", PAD_X, INFO_Y, theme.MUTED)
        d.text("CHANNEL", SW - PAD_X - 7 * 8, INFO_Y, theme.MUTED)
        d.text(_current_version()[:12], PAD_X, INFO_Y + 12,
               theme.TEXT_BRIGHT, scale=2)
        d.text(CHANNEL, SW - PAD_X - len(CHANNEL) * 8, INFO_Y + 16,
               theme.TEXT_BRIGHT)
        line = ago(self._get("ota_last_check_s", 0), _now_s())
        if line:
            d.text(line[:CHARS], PAD_X, INFO_Y + 32, theme.TEXT_DIM)
        d.rect(PAD_X, RULE_Y, SW - 2 * PAD_X, 1, theme.MUTED2, fill=True)

    def _draw_spinner(self, d, x, y):
        try:
            from oreoOS import busy
            busy.draw_spinner(d, x, y, self._spin, bg=theme.BG)
            return
        except Exception:
            pass
        for i in range(8):
            c = theme.PRIMARY if i == self._spin else theme.MUTED2
            d.rect(x + i * 3, y + 10, 2, 4, c, fill=True)

    def _draw_tick(self, d, x, y, color):
        # A small check mark from 3x3 squares.
        for i in range(5):
            d.rect(x + i, y + 6 + i, 3, 3, color, fill=True)
        for i in range(10):
            d.rect(x + 5 + i, y + 10 - i, 3, 3, color, fill=True)

    def _draw_checking(self, d):
        self._draw_spinner(d, (SW - 24) // 2, BODY_Y + 14)
        self._center(d, "Checking for updates", BODY_Y + 48,
                     theme.TEXT_BRIGHT)
        self._center(d, "Asking GitHub for the newest release",
                     BODY_Y + 64, theme.TEXT_DIM)

    def _draw_up_to_date(self, d):
        self._draw_tick(d, (SW - 18) // 2, BODY_Y + 10, theme.TEAL)
        self._center(d, "You're up to date", BODY_Y + 34, theme.TEAL, scale=2)
        self._center(d, "Newest %s release: %s" % (CHANNEL,
                                                   self._latest or "?"),
                     BODY_Y + 60, theme.TEXT_DIM)

    def _draw_ahead(self, d):
        self._center(d, "Ahead of " + CHANNEL, BODY_Y + 18, theme.PRIMARY,
                     scale=2)
        self._center(d, "This is a development build.", BODY_Y + 46,
                     theme.TEXT_DIM)
        self._center(d, "Newest %s release: %s" % (CHANNEL,
                                                   self._latest or "?"),
                     BODY_Y + 60, theme.TEXT_DIM)

    def _draw_available(self, d):
        pk = self._peeked or {}
        d.text("UPDATE AVAILABLE", PAD_X, BODY_Y, theme.PRIMARY)
        d.text(self._latest[:10], PAD_X, BODY_Y + 12, theme.TEXT_BRIGHT,
               scale=2)
        meta = "%d files, %s to download" % (len(pk.get("changed", ())),
                                             human_size(pk.get("bytes", 0)))
        d.text(meta[:CHARS], PAD_X, BODY_Y + 32, theme.TEXT_DIM)
        y = BODY_Y + 48
        for ln in self._notes[:2]:
            d.text(ln, PAD_X, y, theme.TEXT_DIM)
            y += LINE_H
        total_w = BTN_W * 2 + BTN_GAP
        x0 = (SW - total_w) // 2
        self._draw_btn(d, x0, "INSTALL", self._sel == self.BTN_INSTALL)
        self._draw_btn(d, x0 + BTN_W + BTN_GAP, "NOTES",
                       self._sel == self.BTN_NOTES)

    def _draw_btn(self, d, x, label, sel):
        border = theme.GOLD if sel else theme.MUTED2
        fill = theme.PRIMARY if sel else theme.CARD
        ink = api.WHITE if sel else theme.TEXT_DIM
        d.rect(x, BTN_Y, BTN_W, BTN_H, border, fill=True)
        d.rect(x + 2, BTN_Y + 2, BTN_W - 4, BTN_H - 4, fill, fill=True)
        d.text(label, x + (BTN_W - len(label) * 16) // 2,
               BTN_Y + (BTN_H - 16) // 2, ink, scale=2)

    def _draw_confirm(self, d):
        pk = self._peeked or {}
        self._center(d, "Install %s?" % self._latest, BODY_Y + 4,
                     theme.TEXT_BRIGHT, scale=2)
        lines = wrap("Downloads %s (%d files), then the badge restarts to "
                     "install it. Your apps, files and Wi-Fi stay."
                     % (human_size(pk.get("bytes", 0)),
                        len(pk.get("changed", ()))))
        y = BODY_Y + 32
        for ln in lines[:5]:
            self._center(d, ln, y, theme.TEXT_DIM)
            y += LINE_H

    def _draw_installing(self, d):
        self._draw_spinner(d, PAD_X, BODY_Y)
        d.text(("Downloading " + self._latest)[:CHARS - 4], PAD_X + 32,
               BODY_Y + 8, theme.TEXT_BRIGHT)
        tot = self._p_bytes_total
        if tot:
            frac = self._p_bytes / tot
        elif self._p_total:
            frac = self._p_files / self._p_total
        else:
            frac = 0.0
        frac = 0.0 if frac < 0 else 1.0 if frac > 1 else frac
        bx, by, bw, bh = PAD_X, BODY_Y + 32, SW - 2 * PAD_X, 12
        d.rect(bx, by, bw, bh, theme.MUTED2, fill=True)
        d.rect(bx + 2, by + 2, bw - 4, bh - 4, theme.CARD, fill=True)
        fill = int((bw - 4) * frac)
        if fill:
            d.rect(bx + 2, by + 2, fill, bh - 4, theme.PRIMARY, fill=True)
        pct = "%d%%" % int(frac * 100)
        d.text(pct, SW - PAD_X - len(pct) * 8, by + 18, theme.TEXT_BRIGHT)
        d.text("%d of %d files" % (self._p_files, self._p_total), PAD_X,
               by + 18, theme.TEXT_DIM)
        d.text("%s of %s" % (human_size(self._p_bytes), human_size(tot)),
               PAD_X, by + 32, theme.TEXT_DIM)
        cur = (self._p_path or "").split("/")[-1]
        if cur:
            d.text(("Now: " + cur)[:CHARS], PAD_X, by + 46, theme.MUTED)

    def _draw_ready(self, d):
        self._draw_tick(d, (SW - 18) // 2, BODY_Y + 6, theme.TEAL)
        title = (self._latest + " downloaded") if self._latest else \
            "Update downloaded"
        self._center(d, title, BODY_Y + 28, theme.TEAL,
                     scale=2 if len(title) <= 19 else 1)
        msg = ("Restarting to install..." if self._restart_at is not None
               else "Restart the badge to install it.")
        self._center(d, msg, BODY_Y + 54, theme.TEXT_DIM)
        self._center(d, "Your apps, files and Wi-Fi stay.", BODY_Y + 68,
                     theme.TEXT_DIM)

    def _draw_failed(self, d):
        title = ("Couldn't check for updates" if self._fail_action == "check"
                 else "Update not installed")
        self._center(d, title, BODY_Y, theme.PRIMARY)
        y = BODY_Y + 16
        for ln in error_lines(self._error)[:6]:
            d.text(ln, PAD_X, y, theme.TEXT_BRIGHT)
            y += LINE_H
        if self._fail_action == "install":
            self._center(d, "Nothing was changed on the badge.",
                         min(y + 4, BODY_BOT - LINE_H), theme.TEXT_DIM)

    # ── release notes page ────────────────────────────────────────────
    def _notes_top(self):
        return widgets.HEADER_H + 24

    def _notes_rows(self):
        return (BODY_BOT - self._notes_top()) // LINE_H

    def _max_scroll(self):
        return max(0, len(self._notes) - self._notes_rows())

    def _draw_notes(self, d):
        self._center(d, "What's new in " + self._latest,
                     widgets.HEADER_H + 6, theme.PRIMARY)
        top = self._notes_top()
        rows = self._notes_rows()
        y = top
        for ln in self._notes[self._scroll:self._scroll + rows]:
            d.text(ln, PAD_X, y, theme.TEXT_BRIGHT)
            y += LINE_H
        n = len(self._notes)
        if n > rows:
            view_h = rows * LINE_H
            thumb = max(10, view_h * rows // n)
            ty = top + (view_h - thumb) * self._scroll // max(1, n - rows)
            d.rect(SW - 6, top, 2, view_h, theme.MUTED2, fill=True)
            d.rect(SW - 6, ty, 2, thumb, theme.PRIMARY, fill=True)
