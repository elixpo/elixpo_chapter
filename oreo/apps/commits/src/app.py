"""Commits — GitHub contribution graph + stat strip.

Opens instantly from the graph cached on flash; when it is older than
oreoOS.github.GRAPH_TTL_S and WiFi is connected, it is fetched again in the
background (oreoOS.cache.Refresh) while the cached graph stays on screen and
the bottom row turns into a progress bar with a SYNC nn% pill. With no cache
yet, an empty grid fills up with the progress instead. Press A to refresh now.
Layout fills the play area as one tall card so there's no dead cream space
below the grid:

  ┌── card ───────────────────────────────────────────┐
  │           @Circuit-Overtime                       │
  │           ──────────────────                      │
  │       352 active days  ~  45-day streak           │
  │                                                   │
  │   ░░▓▓██▓▓░░░▓▓    ← 53×7 contribution grid      │
  │   ...                                             │
  │                                                   │
  │   current  3       busiest  18      total  1.2k   │
  │                                                   │
  │ less ▒▒▓▓██ more                          [LIVE]  │
  └───────────────────────────────────────────────────┘

Data: `https://github.com/users/<user>/contributions`, one HTTPS fetch, no
token, parsed by oreoOS.github into chronological (date, level, count) days.
Each day is placed on the grid by its date (week column, weekday row), newest
week on the right, as on GitHub; a missing date leaves its own cell empty
instead of shifting the rest of the year.

Controls:
  A      refresh
  HOME   apps drawer
"""

import oreoOS
from oreoOS import api, cache, github
from oreoOS import theme, widgets

SW = api.SCREEN_W
SH = api.SCREEN_H

# GitHub's calendar is 53 week columns (371 slots, the newest week partly in
# the future). 53 x 5 px pitch = 264 px, which leaves margins inside the
# 300 px card; 5 px cells with a 1 px gap (317 px) would overflow it.
WEEKS    = 53
DAYS     = 7
CELL_PX  = 4
GAP_PX   = 1
PITCH    = CELL_PX + GAP_PX
SLOTS    = WEEKS * DAYS
NO_DAY   = 255                 # grid slot with no data (missing or future)

GRID_W = WEEKS * PITCH - GAP_PX
GRID_H = DAYS  * PITCH - GAP_PX

# Fixed layout: one card filling the play area.
CARD_X = 10
CARD_Y = widgets.HEADER_H + 4
CARD_W = SW - 20
CARD_H = SH - widgets.HEADER_H - widgets.HINT_H - 8
USER_Y = CARD_Y + 8
GX0    = (SW - GRID_W) // 2
_SUB_BOT   = USER_Y + 52                      # subtitle + date range
STRIP_TOP  = CARD_Y + CARD_H - 60             # stat strip + legend
GY0    = _SUB_BOT + max(0, (STRIP_TOP - _SUB_BOT - GRID_H) // 2)
GRID_PAD = 4
LEG_Y  = CARD_Y + CARD_H - 14

# Sync progress band: the legend row, swapped for a bar and a pill while a
# fetch runs. Only this band is repainted and flushed per frame.
BAND_X, BAND_Y = CARD_X + 2, LEG_Y - 3
BAND_W, BAND_H = CARD_W - 4, 15
PILL_W = len("SYNC 100%") * 8 + 12
PILL_X = CARD_X + CARD_W - PILL_W - 10
BAR_X, BAR_Y, BAR_H = CARD_X + 10, LEG_Y + 1, 4
BAR_W = PILL_X - 8 - BAR_X
CHASE_W = 14
# With no graph yet, the grid area fills too (and the status line above it).
EMPTY_Y = USER_Y + 28
EMPTY_REGION = (CARD_X + 2, EMPTY_Y, CARD_W - 4, BAND_Y + BAND_H - EMPTY_Y)

# Progress: _http reports dns -> connect -> tls -> request -> read (bytes so
# far); the body read fills READ_FROM..READ_TO against github.GRAPH_BYTES.
_PHASE_PCT = {"dns": 3, "connect": 7, "tls": 11, "request": 16,
              "redirect": 16, "read": 18, "parse": 97}
READ_FROM, READ_TO = 18, 95
_PHASE_TEXT = {"dns": "Looking up github.com", "connect": "Connecting",
               "tls": "Securing the connection", "request": "Asking GitHub",
               "redirect": "Following a redirect", "parse": "Reading the graph"}


def progress_pct(phase, received):
    """0..99 for a fetch at `phase` with `received` bytes read."""
    if phase == "read":
        n = received if received < github.GRAPH_BYTES else github.GRAPH_BYTES
        return READ_FROM + (READ_TO - READ_FROM) * n // github.GRAPH_BYTES
    return _PHASE_PCT.get(phase, 0)


def tls_mark():
    """A mark for tls_failed(); None on an OS without verified TLS."""
    try:
        from oreoOS import _http
        return _http.tls_mark()
    except Exception:
        return None


def tls_failed(mark):
    """True when a certificate check (or the clock it needs) failed since
    `mark`: the sync failed for security reasons, not the network."""
    if mark is None:
        return False
    try:
        from oreoOS import _http
        return bool(_http.tls_error_since(mark))
    except Exception:
        return False


BUCKETS = [
    (235, 237, 240),
    (155, 233, 168),
    ( 64, 196,  99),
    ( 48, 161,  78),
    ( 33, 110,  57),
]
_COLORS = [api.rgb(r, g, b) for r, g, b in BUCKETS]


def _bucket_color(level):
    return _COLORS[max(0, min(4, level))]


_MONTHS = ("", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def _fmt_date(iso):
    """yyyy-mm-dd → 'D Mon YYYY' for the date-range strip."""
    if not iso or len(iso) < 10:
        return ""
    try:
        y, m, d = iso[:4], int(iso[5:7]), int(iso[8:10])
        return "%d %s %s" % (d, _MONTHS[m], y)
    except (ValueError, IndexError):
        return iso


def place(days, levels):
    """Lay `days` out on the WEEKS x DAYS grid by their dates.

    `levels` (a bytearray of SLOTS) gets one level per slot, column-major
    from the oldest Sunday: slot = week * 7 + weekday. The newest day sits in
    the last column at its weekday row, as on GitHub; slots after it, and
    any date missing from `days`, stay NO_DAY. Cells are placed by date and
    never by list position, so a gap in the data cannot slide the rest of
    the year sideways.

    Returns (first, last_slot): days[first:] are the days on the grid, and
    last_slot is the newest day's slot (-1 when there are no days).
    """
    for i in range(SLOTS):
        levels[i] = NO_DAY
    if not days:
        return 0, -1
    last = github.day_number(days[-1][0])
    last_slot = SLOTS - 1 - (6 - github.weekday(last))
    start = last - last_slot                  # day number of slot 0, a Sunday
    first = len(days)
    for i in range(len(days) - 1, -1, -1):
        k = github.day_number(days[i][0]) - start
        if k < 0:
            break
        if k <= last_slot:
            levels[k] = max(0, min(4, days[i][1]))
        first = i
    return first, last_slot


def stats(days):
    """(active, longest streak, current streak, busiest week, total).

    Streaks only count calendar-consecutive days, so a missing date breaks
    them instead of being skipped over.
    """
    active = total = best = run = busiest = week = 0
    prev = wk = None
    for date, level, count in days:
        n = github.day_number(date)
        if prev is None or n != prev + 1:
            run = 0
        w = (n + 4) // 7            # Sunday-to-Saturday week index
        if w != wk:
            week = 0
            wk = w
        prev = n
        total += count
        week += count
        if week > busiest:
            busiest = week
        if level > 0:
            active += 1
            run += 1
            if run > best:
                best = run
        else:
            run = 0
    # Current streak: days in a row up to the newest; it may have none yet.
    cur = 0
    prev = None
    for k in range(len(days) - 1, -1, -1):
        n = github.day_number(days[k][0])
        if prev is not None and n != prev - 1:
            break
        prev = n
        if days[k][1] > 0:
            cur += 1
        elif k < len(days) - 1:
            break
    return active, best, cur, busiest, total


def _fmt_count(n):
    if n >= 1000:
        return "%.1fk" % (n / 1000.0)
    return str(n)


def auto_fetch_ok(net=None):
    """True when an automatic (not user-asked) fetch may start: Wi-Fi up,
    past netsvc's boot quiet window, on a build with threads (where the
    fetch runs off the UI loop) and with no other background network
    thread running (netsvc.fetch_busy()). Until then the request stays
    pending, so a join still running after boot only delays it."""
    if not github.online():
        return False
    if net is None:
        try:
            from oreoOS import netsvc as net
        except Exception:
            return True
    try:
        if not net.has_threads() or net.in_quiet():
            return False
    except Exception:
        return True
    try:
        return not net.fetch_busy()
    except Exception:
        return True


# Shown when no GITHUB_USER is set: the badge never borrows someone
# else's profile.
SETUP_LINES = (
    "No GitHub user set yet.",
    "",
    "Set GITHUB_USER in .env.local",
    "and redeploy, or put it in",
    "/profile.json on the badge.",
    "See docs/PROFILE.md.",
)


class App(oreoOS.App):
    name         = "Commits"
    SHOW_LOADING = False      # the cached graph is drawn immediately

    def on_enter(self, os):
        self._os = os
        # "" until the owner sets GITHUB_USER: then nothing is fetched and
        # draw() shows how to set it (never a stranger's graph).
        self._user = github.user("")
        self._levels = bytearray(SLOTS)
        if self._user:
            days, age = github.cached_graph(self._user)
        else:
            days, age = None, None
        self._set_days(days)
        self._live = False
        self._note = None             # "NO WIFI" / "FAILED" pill text
        self._job = cache.Refresh(self._fetch) if self._user else None
        self._reset_progress()
        self._dirty = True
        # A stale cache is refreshed automatically, but not inside the
        # boot quiet window (update() starts it once that is over).
        self._auto = bool(self._user) and github.stale(age, github.GRAPH_TTL_S)
        if self._auto and auto_fetch_ok():
            self._refresh(quiet=True)

    def on_exit(self):
        # A running fetch finishes on its own and writes the cache; the next
        # open picks the result up from flash.
        self._job = None

    def _set_days(self, days):
        """Adopt a new day list; everything derived from it is built here,
        once, so draw() only paints."""
        self._days = days or None
        first, self._last_slot = place(days, self._levels)
        shown = days[first:] if days else []
        if not shown:
            return
        active, best, cur, busy, total = stats(shown)
        self._sub = "%d active days  ~  %d-day streak" % (active, best)
        a, b = _fmt_date(shown[0][0]), _fmt_date(shown[-1][0])
        self._range = "%s  -  %s" % (a, b) if a and b else ""
        self._cols = (("current", "%dd" % cur),
                      ("busiest", "%d" % busy),
                      ("total",   _fmt_count(total)))

    # ── background fetch ─────────────────────────────────────────────────
    def _fetch(self):
        # Runs on the Refresh worker thread: no drawing, only data.
        return github.fetch_graph(self._user, self._on_progress)

    def _on_progress(self, phase, received=0):
        self._phase = phase
        self._rx = received
        job = self._job
        if job is None or job.threaded or not job.busy():
            return
        # No _thread: the fetch runs inside poll(), so the main loop is
        # stalled. Repaint the band from here, at most every 16 kB read.
        if phase == "read" and received - self._painted_rx < 16384:
            return
        self._painted_rx = received
        self._tick_progress(0.1)
        try:
            d = self._os.display
            self._draw_progress(d)
            if self._days:
                d.present_rect(BAND_X, BAND_Y, BAND_W, BAND_H)
            else:
                d.present_rect(*EMPTY_REGION)
        except Exception:
            pass

    def _reset_progress(self):
        self._phase = None
        self._rx = 0
        self._painted_rx = 0
        self._pct = 0
        self._anim = 0.0
        self._step = -1
        self._kb = -1
        self._pill = "SYNC 0%"
        self._status = "Starting"
        self._filled = 0              # skeleton grid columns already filled
        self._band_dirty = False

    def _refresh(self, quiet=False):
        job = self._job
        if job is None or job.busy():
            return
        if not github.online():
            if not quiet:
                self._note = "NO WIFI"
                self._dirty = True
            return
        self._note = None
        self._auto = False            # this fetch covers a pending auto one
        self._reset_progress()
        self._tls_mark = tls_mark()
        job.start()
        self._dirty = True

    def _tick_progress(self, dt):
        """Advance the animation; flag the band only when its look changes."""
        self._anim += dt
        phase = self._phase
        pct = progress_pct(phase, self._rx)
        if pct < self._pct:
            pct = self._pct           # never run backwards (e.g. redirect)
        step = int(self._anim * 15)
        if pct != self._pct:
            self._pct = pct
            self._pill = "SYNC %d%%" % pct
        if not self._days:
            if phase == "read":
                kb = self._rx >> 10
                if kb >> 3 != self._kb:
                    self._kb = kb >> 3
                    self._status = "Downloading %d kB" % kb
            else:
                self._status = _PHASE_TEXT.get(phase, "Starting")
        if step != self._step:
            self._step = step
            self._band_dirty = True

    def on_button_press(self, btn):
        if btn == api.BTN_A:
            self._refresh()

    def update(self, dt):
        job = self._job
        if job is None:
            return
        if self._auto and auto_fetch_ok():
            self._refresh(quiet=True)
        if job.poll():
            if job.result:
                self._set_days(job.result)
                self._live = True
                self._note = None
            else:
                self._note = ("TLS ERROR"
                              if tls_failed(getattr(self, "_tls_mark", None))
                              else "FAILED")
            self._dirty = True
        elif job.busy():
            self._tick_progress(dt)

    # ── render ───────────────────────────────────────────────────────────
    def _busy(self):
        return self._job is not None and self._job.busy()

    def draw(self, d):
        if not self._dirty:
            if self._band_dirty and self._busy():
                self._draw_progress(d)
                self._present_region = ((BAND_X, BAND_Y, BAND_W, BAND_H)
                                        if self._days else EMPTY_REGION)
            return
        self._dirty = False
        self._present_region = None
        d.clear(theme.BG)
        widgets.draw_header(d, "COMMITS")
        widgets.draw_hint  (d, "A=refresh  HOME=back")

        d.rect(CARD_X + 2, CARD_Y + 2, CARD_W, CARD_H, theme.MUTED2, fill=True)
        d.rect(CARD_X,     CARD_Y,     CARD_W, CARD_H, theme.CARD,   fill=True)
        d.rect(CARD_X,     CARD_Y,     CARD_W, 3,      theme.PRIMARY, fill=True)

        if not self._user:
            y = USER_Y + 8
            for i, line in enumerate(SETUP_LINES):
                col = theme.PRIMARY if i == 0 else theme.TEXT_BRIGHT
                d.text(line, (SW - len(line) * 8) // 2, y, col)
                y += 14
            return

        # Username (scale=2 pink) + gold underline.
        user_str = "@" + self._user[:17]
        uw = len(user_str) * 16
        d.text(user_str, (SW - uw) // 2, USER_Y, theme.PRIMARY, scale=2)
        d.rect((SW - uw) // 2, USER_Y + 20, uw, 2, theme.GOLD, fill=True)

        if not self._days:
            self._draw_empty(d)
            return

        # Headline (active days, longest streak) and the window it covers.
        d.text(self._sub, (SW - len(self._sub) * 8) // 2, USER_Y + 28,
               theme.TEXT_BRIGHT)
        if self._range:
            d.text(self._range, (SW - len(self._range) * 8) // 2,
                   USER_Y + 40, theme.MUTED)

        self._draw_grid(d)

        # Stat strip: current streak / busiest week / total contributions.
        strip_y = STRIP_TOP + 4
        col_w = CARD_W // len(self._cols)
        for i, (lbl, val) in enumerate(self._cols):
            mx = CARD_X + col_w * i + col_w // 2
            d.text(val, mx - len(val) * 8, strip_y, theme.PRIMARY, scale=2)
            d.text(lbl, mx - len(lbl) * 4, strip_y + 22, theme.MUTED)

        if self._busy():
            self._draw_progress(d)
        else:
            self._draw_legend(d)

    def _draw_grid(self, d):
        """Every week of the year, oldest on the left, newest on the right."""
        d.rect(GX0 - GRID_PAD, GY0 - GRID_PAD,
               GRID_W + GRID_PAD * 2, GRID_H + GRID_PAD * 2,
               theme.DOCK_SEL, fill=True)
        levels = self._levels
        colors = _COLORS
        for k in range(self._last_slot + 1):
            lv = levels[k]
            if lv != NO_DAY:
                d.rect(GX0 + (k // DAYS) * PITCH, GY0 + (k % DAYS) * PITCH,
                       CELL_PX, CELL_PX, colors[lv], fill=True)

    def _draw_legend(self, d):
        """Legend (bottom-left) and LIVE / OFFLINE / note pill (bottom-right)."""
        lg_x = CARD_X + 10
        d.text("less", lg_x, LEG_Y + (CELL_PX - 8) // 2, theme.MUTED)
        for i in range(5):
            d.rect(lg_x + 36 + i * PITCH, LEG_Y, CELL_PX, CELL_PX,
                   _COLORS[i], fill=True)
        d.text("more", lg_x + 36 + 5 * PITCH + 4,
               LEG_Y + (CELL_PX - 8) // 2, theme.MUTED)
        self._draw_pill(d)

    def _draw_pill(self, d):
        if self._note:
            pill, pill_c = self._note, theme.ORANGE
        elif self._live:
            pill, pill_c = "LIVE", theme.GREEN
        else:
            pill, pill_c = "OFFLINE", theme.MUTED
        pw = len(pill) * 8 + 12
        d.rect(CARD_X + CARD_W - pw - 10, LEG_Y - 2, pw, 12, pill_c, fill=True)
        d.text(pill, CARD_X + CARD_W - pw - 4, LEG_Y, api.WHITE)

    def _draw_progress(self, d):
        """The sync band: progress bar, moving chaser and SYNC nn% pill.

        With no graph yet the skeleton grid fills column by column with the
        progress and the status line above it names the current step.
        """
        self._band_dirty = False
        d.rect(BAND_X, BAND_Y, BAND_W, BAND_H, theme.CARD, fill=True)
        fw = BAR_W * self._pct // 100
        d.rect(BAR_X, BAR_Y, BAR_W, BAR_H, theme.MUTED2, fill=True)
        if fw:
            d.rect(BAR_X, BAR_Y, fw, BAR_H, theme.PRIMARY, fill=True)
        rem = BAR_W - fw
        if rem > CHASE_W:
            cx = BAR_X + fw + (self._step * 4) % (rem - CHASE_W)
            d.rect(cx, BAR_Y, CHASE_W, BAR_H, theme.GOLD, fill=True)
        d.rect(PILL_X, LEG_Y - 2, PILL_W, 12, theme.PRIMARY, fill=True)
        d.text(self._pill, PILL_X + (PILL_W - len(self._pill) * 8) // 2,
               LEG_Y, api.WHITE)
        if self._days:
            return
        # Status line and filling skeleton grid (no-cache state only).
        d.rect(CARD_X + 2, USER_Y + 40, CARD_W - 4, 10, theme.CARD, fill=True)
        st = self._status
        d.text(st, (SW - len(st) * 8) // 2, USER_Y + 41, theme.MUTED)
        cols = WEEKS * self._pct // 100
        fill = _COLORS[1]
        for w in range(self._filled, cols):
            x = GX0 + w * PITCH
            for r in range(DAYS):
                d.rect(x, GY0 + r * PITCH, CELL_PX, CELL_PX, fill, fill=True)
        if cols > self._filled:
            self._filled = cols
        # Leading column pulses so the grid moves during the TLS handshake.
        if cols < WEEKS:
            lead = _COLORS[2 + (self._step >> 2) % 3]
            x = GX0 + cols * PITCH
            for r in range(DAYS):
                d.rect(x, GY0 + r * PITCH, CELL_PX, CELL_PX, lead, fill=True)

    def _draw_empty(self, d):
        busy = self._busy()
        line = "No contribution data yet."
        d.text(line, (SW - len(line) * 8) // 2, EMPTY_Y, theme.TEXT_BRIGHT)
        if not busy:
            hint = ("Sync failed, press A to retry." if self._note == "FAILED"
                    else "Secure link failed, A to retry."
                    if self._note == "TLS ERROR"
                    else "Connect WiFi, then press A.")
            d.text(hint, (SW - len(hint) * 8) // 2, USER_Y + 41,
                   theme.TEXT_BRIGHT)
            self._draw_pill(d)
            return
        # Empty skeleton grid that _draw_progress fills as the fetch runs.
        d.rect(GX0 - GRID_PAD, GY0 - GRID_PAD,
               GRID_W + GRID_PAD * 2, GRID_H + GRID_PAD * 2,
               theme.DOCK_SEL, fill=True)
        empty = _COLORS[0]
        for w in range(WEEKS):
            x = GX0 + w * PITCH
            for r in range(DAYS):
                d.rect(x, GY0 + r * PITCH, CELL_PX, CELL_PX, empty, fill=True)
        self._filled = 0
        self._draw_progress(d)
