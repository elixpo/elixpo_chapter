"""Tests for oreoOS.github: parsing GitHub's contributions page.

The page lays the calendar out row by row (one table row per weekday), the
legend squares also carry data-level, and exact counts live in <tool-tip>
labels linked by cell id. The fixture below reproduces those three traits.
"""

import importlib.util
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_github():
    # oreoOS/__init__.py expects a badge, so give github.py just the cache
    # module it imports.
    spec = importlib.util.spec_from_file_location("oreo_cache_under_test", ROOT / "oreoOS/cache.py")
    cache = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cache)
    package = types.ModuleType("oreoOS")
    package.cache = cache
    saved = sys.modules.get("oreoOS")
    sys.modules["oreoOS"] = package
    try:
        spec = importlib.util.spec_from_file_location("oreo_github_under_test", ROOT / "oreoOS/github.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    finally:
        if saved is None:
            del sys.modules["oreoOS"]
        else:
            sys.modules["oreoOS"] = saved
    return module


def cell(row, col, date, level):
    return ('<td tabindex="0" data-ix="%d" style="width: 10px" data-date="%s" '
            'id="contribution-day-component-%d-%d" data-level="%d" role="gridcell" '
            'class="ContributionCalendar-day"></td>' % (col, date, row, col, level))


def tooltip(row, col, text):
    return ('<tool-tip id="t-%d-%d" for="contribution-day-component-%d-%d" '
            'popover="manual">%s</tool-tip>' % (row, col, row, col, text))


# Two weeks starting Sunday 2026-10-18, written row by row as GitHub does.
DAYS = [("2026-10-%02d" % d) for d in range(18, 32)]
LEVELS = [0, 1, 2, 0, 4, 3, 1, 0, 0, 2, 1, 1, 0, 4]
COUNTS = [0, 1, 5, 0, 18, 9, 2, 0, 0, 4, 1, 3, 0, 22]


def page():
    rows = []
    for weekday in range(7):
        rows.append("<tr>" + "".join(cell(weekday, week, DAYS[week * 7 + weekday],
                                          LEVELS[week * 7 + weekday])
                                     for week in range(2)) + "</tr>")
    tips = []
    for i, n in enumerate(COUNTS):
        week, weekday = divmod(i, 7)
        text = "No contributions on %s." % DAYS[i] if n == 0 else \
            "%d contribution%s on %s." % (n, "" if n == 1 else "s", DAYS[i])
        tips.append(tooltip(weekday, week, text))
    legend = "".join('<div data-level="%d" class="ContributionCalendar-day"></div>' % lv
                     for lv in range(5))
    return ("<table>" + "".join(rows) + "</table>" + "".join(tips) + legend).encode()


class ContributionsParserTest(unittest.TestCase):
    def setUp(self):
        self.github = load_github()
        self.days = self.github.parse_contributions(page())

    def test_days_are_chronological_despite_row_major_layout(self):
        self.assertEqual([d for d, _, _ in self.days], DAYS)

    def test_legend_squares_are_not_counted_as_days(self):
        self.assertEqual(len(self.days), 14)

    def test_levels_and_tooltip_counts_follow_their_cells(self):
        self.assertEqual([lv for _, lv, _ in self.days], LEVELS)
        self.assertEqual([n for _, _, n in self.days], COUNTS)

    def test_levels_are_clamped(self):
        body = (cell(0, 0, "2026-10-18", 9) + tooltip(0, 0, "3 contributions")).encode()
        self.assertEqual(self.github.parse_contributions(body), [("2026-10-18", 4, 3)])

    def test_empty_page_gives_no_days(self):
        self.assertEqual(self.github.parse_contributions(b"<html></html>"), [])


class StalenessTest(unittest.TestCase):
    def test_missing_or_old_cache_is_stale(self):
        github = load_github()
        self.assertTrue(github.stale(None, 3600))
        self.assertTrue(github.stale(3601, 3600))
        self.assertFalse(github.stale(10, 3600))


if __name__ == "__main__":
    unittest.main()
