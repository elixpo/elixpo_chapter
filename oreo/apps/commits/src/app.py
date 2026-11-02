"""Commits — GitHub contribution graph + stat strip.

Opens instantly from the graph cached on flash; when it is older than
oreoOS.github.GRAPH_TTL_S and WiFi is connected, it refreshes after the first
frame under a SYNCING label. Press A to refresh now. Layout fills the play area as
one tall card so there's no dead cream space below the grid:

  ┌── card ───────────────────────────────────────────┐
  │           @Circuit-Overtime                       │
  │           ──────────────────                      │
  │       352 active days  ~  45-day streak           │
  │                                                   │
  │   ░░▓▓██▓▓░░░▓▓    ← 52×7 contribution grid      │
  │   ...                                             │
  │                                                   │
  │   current  3       busiest  18      total  1.2k   │
  │                                                   │
  │ less ▒▒▓▓██ more                          [LIVE]  │
  └───────────────────────────────────────────────────┘

Data: `https://github.com/users/<user>/contributions`, one HTTPS fetch, no
token, parsed by oreoOS.github into chronological (date, level, count) days.
The grid is laid out by real weekday, newest week on the right, as on GitHub.

Controls:
  A      refresh
  HOME   apps drawer
"""

import oreoOS
from oreoOS import api, github
from oreoOS import theme, widgets

SW = api.SCREEN_W
SH = api.SCREEN_H

WEEKS    = 52
DAYS     = 7
CELL_PX  = 5
GAP_PX   = 1

BUCKETS = [
    (235, 237, 240),
    (155, 233, 168),
    ( 64, 196,  99),
    ( 48, 161,  78),
    ( 33, 110,  57),
]


def _bucket_color(level):
    r, g, b = BUCKETS[max(0, min(4, level))]
    return api.rgb(r, g, b)


def _weekday(iso):
    """0 = Sunday ... 6 = Saturday for a yyyy-mm-dd date (Sakamoto)."""
    y, m, d = int(iso[:4]), int(iso[5:7]), int(iso[8:10])
    if m < 3:
        y -= 1
    return (y + y // 4 - y // 100 + y // 400 +
            (0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)[m - 1] + d) % 7


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


def _max_streak(days):
    best = cur = 0
    for _, level, _c in days:
        cur = cur + 1 if level > 0 else 0
        if cur > best:
            best = cur
    return best


def _current_streak(days):
    """Days in a row up to today; today itself may not have commits yet."""
    cur = 0
    for k, (_, level, _c) in enumerate(reversed(days)):
        if level > 0:
            cur += 1
        elif k > 0:
            break
    return cur


def _busiest_week(days):
    """Most contributions in any Sunday-to-Saturday week."""
    best = week = 0
    for date, _, count in days:
        if _weekday(date) == 0:
            week = 0
        week += count
        if week > best:
            best = week
    return best


def _fmt_count(n):
    if n >= 1000:
        return "%.1fk" % (n / 1000.0)
    return str(n)


class App(oreoOS.App):
    name         = "Commits"
    SHOW_LOADING = False      # the cached graph is drawn immediately

    def on_enter(self, os):
        self._os = os
        self._user = github.user("Circuit-Overtime")
        self._days, age = github.cached_graph(self._user)
        self._live = False
        # 0 idle, 1 SYNCING label requested, 2 label drawn: fetch now.
        self._sync = 1 if (github.stale(age, github.GRAPH_TTL_S)
                           and github.online()) else 0
        self._dirty = True

    def on_button_press(self, btn):
        if btn == api.BTN_A and self._sync == 0:
            self._sync = 1
            self._dirty = True

    def update(self, dt):
        if self._sync == 1:
            self._sync = 2          # let draw() paint the SYNCING label first
        elif self._sync == 2:
            days = github.fetch_graph(self._user)
            if days:
                self._days = days
                self._live = True
            self._sync = 0
            self._dirty = True

    def draw(self, d):
        if not self._dirty:
            return
        d.clear(theme.BG)
        widgets.draw_header(d, "COMMITS")
        widgets.draw_hint  (d, "A=refresh  HOME=back")

        # Full-height card filling the play area.
        card_x = 10
        card_y = widgets.HEADER_H + 4
        card_w = SW - 20
        card_h = SH - widgets.HEADER_H - widgets.HINT_H - 8
        d.rect(card_x + 2, card_y + 2, card_w, card_h, theme.MUTED2, fill=True)
        d.rect(card_x,     card_y,     card_w, card_h, theme.CARD,   fill=True)
        d.rect(card_x,     card_y,     card_w, 3,      theme.PRIMARY, fill=True)

        # Username (scale=2 pink) + gold underline.
        user_str = "@" + self._user[:20]
        uw = len(user_str) * 16
        uy = card_y + 8
        d.text(user_str, (SW - uw) // 2, uy, theme.PRIMARY, scale=2)
        d.rect((SW - uw) // 2, uy + 20, uw, 2, theme.GOLD, fill=True)

        days = self._days or []
        if not days:
            self._draw_empty(d, card_x, card_y, card_w, card_h, uy)
            self._dirty = False
            return
        # Only the days that fit the 52-week grid: the newest week still has
        # empty cells after today, so stats and grid cover the same days.
        tail = 6 - _weekday(days[-1][0])
        shown = days[-(WEEKS * DAYS - tail):]

        # Headline subtitle (active days · longest streak).
        active = sum(1 for _, level, _c in shown if level > 0)
        streak = _max_streak(shown)
        sub = "%d active days  ~  %d-day streak" % (active, streak)
        sw  = len(sub) * 8
        d.text(sub, (SW - sw) // 2, uy + 28, theme.TEXT_BRIGHT)

        # Date range strip — "from 12 May 2025 to 13 May 2026" — pulled from
        # the SVG so the user knows exactly what window this grid covers.
        first = _fmt_date(shown[0][0])
        last  = _fmt_date(shown[-1][0])
        if first and last:
            rng = "%s  -  %s" % (first, last)
            rw  = len(rng) * 8
            d.text(rng, (SW - rw) // 2, uy + 40, theme.MUTED)

        # Grid — centred horizontally and vertically between subtitle and
        # stat strip so it fills the cream void.
        grid_w = WEEKS * (CELL_PX + GAP_PX) - GAP_PX
        grid_h = DAYS  * (CELL_PX + GAP_PX) - GAP_PX
        gx0    = (SW - grid_w) // 2

        sub_bot   = uy + 52                  # subtitle + date range
        strip_top = card_y + card_h - 60     # reserve for stat strip + legend
        gy0       = sub_bot + max(0, (strip_top - sub_bot - grid_h) // 2)

        gp = 4
        d.rect(gx0 - gp, gy0 - gp,
               grid_w + gp * 2, grid_h + gp * 2,
               theme.DOCK_SEL, fill=True)
        # Newest day sits in the last column at its weekday row; earlier
        # days fill backwards, exactly like GitHub's calendar.
        n = len(shown)
        for idx in range(n):
            k = tail + (n - 1 - idx)
            week = WEEKS - 1 - k // DAYS
            if week < 0:
                continue
            day = DAYS - 1 - k % DAYS
            cx  = gx0 + week * (CELL_PX + GAP_PX)
            cy  = gy0 + day  * (CELL_PX + GAP_PX)
            d.rect(cx, cy, CELL_PX, CELL_PX,
                   _bucket_color(shown[idx][1]), fill=True)

        # Stat strip — current streak / busiest week / total commits.
        strip_y = strip_top + 4
        total   = sum(c for _, _l, c in shown)
        cur_str = _current_streak(shown)
        busy    = _busiest_week(shown)
        cols = [
            ("current", "%dd" % cur_str),
            ("busiest", "%d"  % busy),
            ("total",   _fmt_count(total)),
        ]
        col_w = card_w // len(cols)
        for i, (lbl, val) in enumerate(cols):
            mx = card_x + col_w * i + col_w // 2
            d.text(val, mx - len(val) * 8, strip_y, theme.PRIMARY, scale=2)
            d.text(lbl, mx - len(lbl) * 4, strip_y + 22, theme.MUTED)

        # Legend (bottom-left) + LIVE pill (bottom-right), inside the card.
        lg_y = card_y + card_h - 14
        lg_x = card_x + 10
        d.text("less", lg_x, lg_y + (CELL_PX - 8) // 2, theme.MUTED)
        for i in range(5):
            d.rect(lg_x + 36 + i * (CELL_PX + GAP_PX), lg_y,
                   CELL_PX, CELL_PX, _bucket_color(i), fill=True)
        d.text("more", lg_x + 36 + 5 * (CELL_PX + GAP_PX) + 4,
               lg_y + (CELL_PX - 8) // 2, theme.MUTED)

        pill   = "LIVE" if self._live else "OFFLINE"
        pill_c = theme.GREEN if self._live else theme.MUTED
        pw     = len(pill) * 8 + 12
        d.rect(card_x + card_w - pw - 10, lg_y - 2, pw, 12, pill_c, fill=True)
        d.text(pill, card_x + card_w - pw - 4, lg_y, api.WHITE)

        self._draw_sync(d)
        self._dirty = False

    def _draw_sync(self, d):
        if not self._sync:
            return
        label = "SYNCING"
        w = len(label) * 8 + 12
        x = SW - w - 8
        y = widgets.HEADER_H + 4
        d.rect(x, y, w, 12, theme.PRIMARY, fill=True)
        d.text(label, x + 6, y + 2, api.WHITE)

    def _draw_empty(self, d, card_x, card_y, card_w, card_h, uy):
        lines = ("No contribution data yet.",
                 "Connect WiFi, then press A." if not self._sync
                 else "Fetching from GitHub...")
        for i, line in enumerate(lines):
            d.text(line, (SW - len(line) * 8) // 2, uy + 50 + i * 14,
                   theme.TEXT_BRIGHT)
        self._draw_sync(d)
