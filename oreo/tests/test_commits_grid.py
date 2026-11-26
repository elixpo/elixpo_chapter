"""Host tests for the Commits app grid: a whole year must reach the screen.

The app is loaded from its file against stub oreoOS modules (only
oreoOS/github.py and oreoOS/cache.py are real), and draw() runs against a
fake display that records every rect, so the test sees exactly which week
columns get painted and where.

The bug these guard against: GitHub's contributions page lists the calendar
one weekday row at a time, so a body cut short by the read deadline still
parses into dates spanning the whole year, only with whole weekdays missing.
The app used to place cells by list position, which packed those ~100 days
into the newest ~15 weeks: a quarter of the graph, under a date strip that
claimed the full year.
"""

import datetime
import importlib.util
import os
import sys
import tempfile
import threading
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_commits():
    cache = _load("oreoOS/cache.py", "oreo_cache_commits_test")
    api = types.ModuleType("oreoOS.api")
    api.SCREEN_W, api.SCREEN_H = 320, 240
    api.BTN_A = 1
    api.WHITE = (255, 255, 255)
    api.rgb = lambda r, g, b: (r, g, b)
    theme = types.ModuleType("oreoOS.theme")
    for name in ("BG", "CARD", "PRIMARY", "GOLD", "MUTED", "MUTED2", "TEXT_BRIGHT",
                 "DOCK_SEL", "GREEN", "ORANGE", "TEAL"):
        setattr(theme, name, name)
    widgets = types.ModuleType("oreoOS.widgets")
    widgets.HEADER_H, widgets.HINT_H = 28, 16
    widgets.draw_header = widgets.draw_hint = lambda *a: None
    package = types.ModuleType("oreoOS")
    package.App = object
    package.cache, package.api, package.theme, package.widgets = cache, api, theme, widgets
    saved = {k: sys.modules.get(k) for k in ("oreoOS", "oreoOS.cache")}
    sys.modules["oreoOS"] = package
    sys.modules["oreoOS.cache"] = cache
    try:
        package.github = _load("oreoOS/github.py", "oreo_github_commits_test")
        app = _load("apps/commits/src/app.py", "commits_app_under_test")
        # No boot quiet window in these tests (netsvc is not loaded);
        # AutoFetchTest covers the gate itself.
        app.auto_fetch_ok = lambda net=None: True
    finally:
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
    return app, package.github


class FakeDisplay:
    def __init__(self):
        self.rects = []
        self.texts = []
        self.presented = []

    def present_rect(self, x, y, w, h):
        self.presented.append((x, y, w, h))

    def clear(self, color):
        self.rects = []
        self.texts = []

    def rect(self, x, y, w, h, color, fill=False):
        self.rects.append((x, y, w, h, color))

    def text(self, s, x, y, color, scale=1):
        self.texts.append((s, x, y))


TODAY = datetime.date(2026, 11, 8)        # a Sunday: the newest week has one day


def year(end=TODAY, n=371):
    days = []
    for i in range(n - 1, -1, -1):
        date = end - datetime.timedelta(days=i)
        days.append((date.isoformat(), 1 + i % 4, 1 + i % 3))
    return days


def truncated(days, weekdays=(0, 1)):
    """What a contributions page cut after its first weekday rows parses to."""
    keep = []
    for date, level, count in days:
        wd = (datetime.date.fromisoformat(date).weekday() + 1) % 7   # 0 = Sunday
        if wd in weekdays:
            keep.append((date, level, count))
    return keep


class GridTest(unittest.TestCase):
    def setUp(self):
        self.app_mod, self.github = load_commits()

    def render(self, days):
        app = self.app_mod.App()
        app._user = "Circuit-Overtime"
        app._levels = bytearray(self.app_mod.SLOTS)
        app._set_days(days)
        app._live = False
        app._note = None
        app._job = None
        app._dirty = True
        d = FakeDisplay()
        app.draw(d)
        m = self.app_mod
        colors = set(m._COLORS)
        cells = [r for r in d.rects
                 if r[2] == m.CELL_PX and r[3] == m.CELL_PX and r[4] in colors
                 and m.GY0 <= r[1] < m.GY0 + m.GRID_H]
        return app, d, cells

    def test_grid_fits_inside_the_card(self):
        m = self.app_mod
        self.assertLessEqual(m.WEEKS * m.PITCH - m.GAP_PX, m.GRID_W)
        self.assertGreaterEqual(m.GX0 - m.GRID_PAD, m.CARD_X + 4)
        self.assertLessEqual(m.GX0 + m.GRID_W + m.GRID_PAD, m.CARD_X + m.CARD_W - 4)
        self.assertLess(m.GY0 + m.GRID_H + m.GRID_PAD, m.STRIP_TOP + 4)
        self.assertGreaterEqual(m.WEEKS, 53)

    def test_full_year_draws_every_week_across_the_width(self):
        _, _, cells = self.render(year())
        m = self.app_mod
        xs = sorted(set(x for x, _, _, _, _ in cells))
        self.assertEqual(len(xs), 53)
        self.assertEqual(xs[0], m.GX0)
        self.assertEqual(xs[-1], m.GX0 + 52 * m.PITCH)
        self.assertEqual(len(cells), 365)     # 52 full weeks + Sunday 8 Nov
        # Newest day: last column, Sunday row.
        self.assertIn((m.GX0 + 52 * m.PITCH, m.GY0), [(x, y) for x, y, _, _, _ in cells])

    def test_cells_sit_at_their_real_weekday(self):
        days = year()
        m = self.app_mod
        _, _, cells = self.render(days)
        pos = {(x, y): c for x, y, _, _, c in cells}
        start = TODAY - datetime.timedelta(days=52 * 7)     # Sunday 9 Nov 2025
        for date, level, _ in days:
            dt = datetime.date.fromisoformat(date)
            if dt < start:
                continue
            k = (dt - start).days
            xy = (m.GX0 + (k // 7) * m.PITCH, m.GY0 + (k % 7) * m.PITCH)
            self.assertEqual(pos[xy], m._COLORS[level], date)

    def test_truncated_page_is_not_packed_into_a_quarter(self):
        # Regression: with list-position placement, Sunday and Monday rows
        # only (106 days) landed in the newest 16 columns.
        _, _, cells = self.render(truncated(year()))
        m = self.app_mod
        xs = sorted(set(x for x, _, _, _, _ in cells))
        self.assertEqual(len(xs), 53)
        self.assertEqual(xs[0], m.GX0)
        ys = set(y for _, y, _, _, _ in cells)
        self.assertEqual(ys, {m.GY0, m.GY0 + m.PITCH})   # only their own rows

    def test_stats_cover_exactly_the_days_on_the_grid(self):
        days = year()
        app, d, cells = self.render(days)
        shown = days[-365:]
        texts = [t for t, _, _ in d.texts]
        self.assertIn("365 active days  ~  365-day streak", texts)
        self.assertIn("9 Nov 2025  -  8 Nov 2026", texts)
        total = sum(c for _, _, c in shown)
        self.assertIn(self.app_mod._fmt_count(total), texts)

    def test_stats_honour_gaps_and_weeks(self):
        m = self.app_mod
        days = [("2026-11-01", 1, 2), ("2026-11-02", 1, 3), ("2026-11-04", 2, 10),
                ("2026-11-07", 0, 0), ("2026-11-08", 1, 4)]
        active, best, cur, busiest, total = m.stats(days)
        self.assertEqual((active, best, cur, total), (4, 2, 1, 19))
        self.assertEqual(busiest, 15)       # Sun 1 .. Sat 7 Nov


class GraphValidationTest(unittest.TestCase):
    def setUp(self):
        _, self.github = load_commits()

    def test_day_number_and_weekday(self):
        g = self.github
        self.assertEqual(g.day_number("1970-01-01"), 0)
        self.assertEqual(g.day_number("2026-11-08"),
                         (datetime.date(2026, 11, 8) - datetime.date(1970, 1, 1)).days)
        self.assertEqual(g.day_number("2024-03-01") - g.day_number("2024-02-28"), 2)
        self.assertEqual(g.weekday(g.day_number("2026-11-08")), 0)   # Sunday
        self.assertEqual(g.weekday(g.day_number("2026-11-14")), 6)   # Saturday

    def test_complete_year_accepted_truncated_page_rejected(self):
        self.assertTrue(self.github.complete(year()))
        self.assertFalse(self.github.complete(truncated(year())))
        self.assertFalse(self.github.complete(year()[:200]))
        self.assertFalse(self.github.complete([]))
        self.assertFalse(self.github.complete(None))


def row_major_page(days):
    """A contributions page laid out like GitHub's: one row per weekday."""
    first = datetime.date.fromisoformat(days[0][0])
    lead = (first.weekday() + 1) % 7
    rows = [[] for _ in range(7)]
    for i, (date, level, count) in enumerate(days):
        k = lead + i
        rows[k % 7].append('<td data-date="%s" id="c-%d" data-level="%d"></td>'
                           '<tool-tip for="c-%d">%d contributions on %s.</tool-tip>'
                           % (date, k, level, k, count, date))
    return ("<table>" + "".join("<tr>" + "".join(r) + "</tr>" for r in rows)
            + "</table>").encode()


class FetchGraphTest(unittest.TestCase):
    def setUp(self):
        _, self.github = load_commits()
        self.dir = tempfile.TemporaryDirectory()
        self.github.GRAPH_PATH = os.path.join(self.dir.name, "cache.txt")
        self.github.online = lambda: True
        self.days = year()
        self.body = row_major_page(self.days)
        self.calls = []

    def tearDown(self):
        self.dir.cleanup()

    def serve(self, body):
        def fake_get(url, accept=None, timeout_s=None, on_progress=None):
            self.calls.append((timeout_s, on_progress))
            if on_progress:
                on_progress("read", len(body))
            return body
        self.github._get = fake_get

    def test_cut_short_page_is_rejected_and_not_cached(self):
        self.serve(self.body[:len(self.body) * 3 // 10])
        self.assertIsNone(self.github.fetch_graph("u"))
        self.assertFalse(os.path.exists(self.github.GRAPH_PATH))

    def test_whole_page_is_parsed_cached_and_reported(self):
        seen = []
        self.serve(self.body)
        days = self.github.fetch_graph("u", lambda phase, n: seen.append(phase))
        self.assertEqual(days, self.days)
        self.assertEqual(seen, ["read", "parse"])
        self.assertEqual(self.calls[0][0], self.github.GRAPH_TIMEOUT_S)
        cached, age = self.github.cached_graph("u")
        self.assertEqual(cached, self.days)
        self.assertIsNotNone(age)

    def test_truncated_cache_is_shown_but_stale(self):
        with open(self.github.GRAPH_PATH, "w") as f:
            f.write("u|%d\n" % 2000000000)
            for date, level, count in truncated(self.days):
                f.write("%s,%d,%d\n" % (date, level, count))
        cached, age = self.github.cached_graph("u")
        self.assertEqual(len(cached), 106)
        self.assertIsNone(age)
        self.assertTrue(self.github.stale(age, self.github.GRAPH_TTL_S))


class FakeOS:
    def __init__(self):
        self.display = FakeDisplay()


class LoadingTest(unittest.TestCase):
    """The fetch runs on cache.Refresh while the UI keeps animating."""

    def setUp(self):
        self.m, self.github = load_commits()
        self.gate = threading.Event()
        self.result = year()
        self.cached = None
        g = self.github
        g.user = lambda default="": "Circuit-Overtime"
        g.online = lambda: True
        g.cached_graph = lambda login: (self.cached, None)
        self.started = threading.Event()

        def fake_fetch(login, on_progress=None):
            self.progress = on_progress
            self.started.set()
            self.gate.wait(5)
            return self.result
        g.fetch_graph = fake_fetch

    def tearDown(self):
        self.gate.set()

    def enter(self):
        app = self.m.App()
        os_ = FakeOS()
        app.on_enter(os_)
        return app, os_.display

    def finish(self, app):
        self.gate.set()
        for _ in range(500):
            app.update(0.016)
            if not app._busy():
                return
            threading.Event().wait(0.002)
        self.fail("fetch never finished")

    def in_band(self, rects, region):
        x0, y0, w, h = region
        return all(x0 <= x and y0 <= y and x + rw <= x0 + w and y + rh <= y0 + h
                   for x, y, rw, rh, _ in rects)

    def test_cached_graph_stays_while_band_animates(self):
        self.cached = year()
        app, d = self.enter()
        self.assertTrue(app._busy())
        self.assertTrue(app._job.threaded)
        self.assertTrue(self.started.wait(2))
        app.draw(d)
        cells = [r for r in d.rects if r[4] in set(self.m._COLORS) and r[2] == self.m.CELL_PX
                 and self.m.GY0 <= r[1] < self.m.GY0 + self.m.GRID_H]
        self.assertEqual(len(set(r[0] for r in cells)), 53)      # cached graph shown
        self.assertIn("SYNC 0%", [t for t, _, _ in d.texts])
        self.assertNotIn("less", [t for t, _, _ in d.texts])

        # Progress reported from the worker thread repaints only the band.
        self.progress("read", self.github.GRAPH_BYTES // 2)
        app.update(0.1)
        d.rects, d.texts = [], []
        app.draw(d)
        band = (self.m.BAND_X, self.m.BAND_Y, self.m.BAND_W, self.m.BAND_H)
        self.assertTrue(d.rects)
        self.assertTrue(self.in_band(d.rects, band))
        self.assertEqual(app._present_region, band)
        self.assertEqual([t for t, _, _ in d.texts], ["SYNC 56%"])

        # Nothing changed: nothing drawn.
        d.rects = []
        app.draw(d)
        self.assertEqual(d.rects, [])
        # Time alone moves the chaser.
        app.update(0.2)
        app.draw(d)
        self.assertTrue(d.rects)

        self.finish(app)
        d.rects, d.texts = [], []
        app.draw(d)
        texts = [t for t, _, _ in d.texts]
        self.assertIn("LIVE", texts)
        self.assertIn("less", texts)
        self.assertIsNone(app._present_region)

    def test_no_cache_fills_skeleton_grid(self):
        app, d = self.enter()
        self.assertTrue(self.started.wait(2))
        app.draw(d)
        m = self.m
        skeleton = [r for r in d.rects if r[4] == m._COLORS[0] and r[2] == m.CELL_PX]
        self.assertEqual(len(skeleton), m.SLOTS)
        self.progress("tls", 0)
        app.update(0.1)
        d.rects, d.texts = [], []
        app.draw(d)
        self.assertIn("Securing the connection", [t for t, _, _ in d.texts])
        self.progress("read", self.github.GRAPH_BYTES)
        app.update(0.1)
        d.rects, d.texts = [], []
        app.draw(d)
        # Only the newly reached columns are painted: 5 (at 11%) .. 49 (at 95%).
        filled = sorted(set(r[0] for r in d.rects
                            if r[4] == m._COLORS[1] and r[2] == m.CELL_PX))
        self.assertEqual(app._filled, m.WEEKS * 95 // 100)
        self.assertEqual(filled, [m.GX0 + w * m.PITCH for w in range(5, 50)])
        self.assertEqual(app._present_region, m.EMPTY_REGION)
        self.assertTrue(self.in_band(d.rects, m.EMPTY_REGION))
        self.finish(app)
        app.draw(d)
        self.assertTrue(app._days)

    def test_failed_fetch_keeps_cache_and_says_so(self):
        self.cached = year()
        self.result = None
        app, d = self.enter()
        self.finish(app)
        app.draw(d)
        self.assertIn("FAILED", [t for t, _, _ in d.texts])
        self.assertEqual(app._days, self.cached)

    def test_without_thread_progress_paints_from_the_callback(self):
        self.cached = year()
        saved = sys.modules.get("_thread")
        sys.modules["_thread"] = None           # import fails: deferred path
        try:
            app, d = self.enter()
        finally:
            if saved is not None:
                sys.modules["_thread"] = saved
            else:
                del sys.modules["_thread"]
        self.assertFalse(app._job.threaded)
        app.draw(d)                              # cached screen first
        self.gate.set()
        orig = self.github.fetch_graph

        def fetch_with_progress(login, on_progress=None):
            on_progress("tls", 0)
            on_progress("read", 20000)
            return orig(login, on_progress)
        self.github.fetch_graph = fetch_with_progress
        for _ in range(3):
            app.update(0.016)
        self.assertGreaterEqual(len(d.presented), 2)
        self.assertFalse(app._busy())
        self.assertTrue(app._live)


if __name__ == "__main__":
    unittest.main()
