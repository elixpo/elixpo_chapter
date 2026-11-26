"""Host tests for the Pixelify bitmap fonts: every glyph must sit on one
shared baseline (the old rasteriser cropped each glyph to its own ink
top, so 'a' floated up next to 'H' and descenders hung at random rows).

pixelfont is loaded from its file behind a stub `oreoOS` package that
only carries api.WHITE, like the other shell-UI tests.
"""

import importlib.util
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SIZES = ("pixelify_8", "pixelify_12", "pixelify_16", "pixelify_24")


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _font_module(name):
    return _load(ROOT / "assets/fonts/optimized" / (name + ".py"),
                 "_test_font_" + name)


def _ink_rows(mod, ch):
    """Rows of the glyph cell that contain at least one set pixel."""
    bits = mod._FONT[ch]
    rows = []
    for row in range(mod.GLYPH_H):
        if any(bits[row * mod.BPR + i] for i in range(mod.BPR)):
            rows.append(row)
    return rows


class FakeDisplay:
    def __init__(self):
        self.pixels = set()

    def rect(self, x, y, w, h, color, fill=False):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.pixels.add((xx, yy))


class GlyphBaselineTest(unittest.TestCase):
    def test_glyphs_share_one_baseline(self):
        for name in SIZES:
            mod = _font_module(name)
            base = mod.BASELINE
            with self.subTest(font=name):
                self.assertTrue(0 < base <= mod.GLYPH_H)
                # No-descender glyphs end on the row just above the baseline.
                for ch in "aemxnHEZ0145":
                    self.assertEqual(_ink_rows(mod, ch)[-1], base - 1,
                                     "%r bottom row in %s" % (ch, name))
                # Same x-height for the short lowercase letters.
                tops = {ch: _ink_rows(mod, ch)[0] for ch in "aemxnou"}
                self.assertEqual(len(set(tops.values())), 1, tops)
                # Same cap height.
                caps = {ch: _ink_rows(mod, ch)[0] for ch in "HEFTZ"}
                self.assertEqual(len(set(caps.values())), 1, caps)
                self.assertLess(caps["H"], tops["x"])
                # Descenders go below the baseline, all to the same row.
                bottoms = {ch: _ink_rows(mod, ch)[-1] for ch in "gpqy"}
                self.assertEqual(len(set(bottoms.values())), 1, bottoms)
                self.assertGreaterEqual(bottoms["g"], base)
                self.assertLess(bottoms["g"], mod.GLYPH_H)

    def test_glyph_widths_fit_the_cell(self):
        for name in SIZES:
            mod = _font_module(name)
            with self.subTest(font=name):
                self.assertEqual(mod.BPR, (mod.GLYPH_W + 7) // 8)
                for ch, bits in mod._FONT.items():
                    self.assertEqual(len(bits), mod.BPR * mod.GLYPH_H, ch)


class RendererBaselineTest(unittest.TestCase):
    def setUp(self):
        self._saved = {k: sys.modules.get(k)
                       for k in ("oreoOS", "oreoOS.api", "oreoOS.pixelfont")}
        pkg = types.ModuleType("oreoOS")
        api = types.ModuleType("oreoOS.api")
        api.WHITE = 0xFFFF
        pkg.api = api
        sys.modules["oreoOS"] = pkg
        sys.modules["oreoOS.api"] = api
        self.pf = _load(ROOT / "oreoOS/pixelfont.py", "oreoOS.pixelfont")

    def tearDown(self):
        for k, v in self._saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v

    def test_drawn_text_is_level(self):
        for name in SIZES:
            font = self.pf.PixelFont(_font_module(name))
            with self.subTest(font=name):
                # Draw each glyph alone at the same y and compare bottoms.
                bottoms = {}
                for ch in "Hamxe":
                    d = FakeDisplay()
                    font.text(d, ch, 0, 20, 1)
                    bottoms[ch] = max(y for _, y in d.pixels)
                self.assertEqual(set(bottoms.values()),
                                 {20 + font.baseline - 1}, bottoms)
                d = FakeDisplay()
                font.text(d, "g", 0, 20, 1)
                self.assertGreaterEqual(max(y for _, y in d.pixels),
                                        20 + font.baseline)
                self.assertLess(max(y for _, y in d.pixels), 20 + font.h)

    def test_measure_matches_drawn_width(self):
        font = self.pf.PixelFont(_font_module("pixelify_16"))
        d = FakeDisplay()
        font.text(d, "Settings", 0, 0, 1)
        xs = [x for x, _ in d.pixels]
        self.assertEqual(max(xs) - min(xs) + 1, font.measure("Settings"))


if __name__ == "__main__":
    unittest.main()
