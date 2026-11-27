"""Colors app: palette derivation from one colour, text contrast, presets.

    python3 -m unittest discover -s tests -v
"""

import importlib
import importlib.util
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_by_path(relative_path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pal = _load_by_path("apps_market/Colors/src/palette.py", "colors_palette_under_test")


def _theme_rgb():
    """The *_R/_G/_B triplets of oreoOS/theme.py, read without importing it
    (it needs oreoOS.api)."""
    out = {}
    for line in (ROOT / "oreoOS" / "theme.py").read_text().splitlines():
        code = line.split("#")[0]
        if "=" not in code:
            continue
        names, vals = code.split("=", 1)
        if names.split(",")[0].strip().endswith("_R") and "(" not in vals:
            key = names.split(",")[0].strip()[:-2]
            out[key] = tuple(int(v) for v in vals.split(","))
    return out


class ConversionTest(unittest.TestCase):
    def test_luma_is_rec601(self):
        self.assertEqual(pal.luma((255, 255, 255)), 255)
        self.assertEqual(pal.luma((0, 0, 0)), 0)
        self.assertEqual(pal.luma((255, 0, 0)), 76)
        self.assertEqual(pal.luma((0, 255, 0)), 149)
        self.assertEqual(pal.luma((0, 0, 255)), 29)

    def test_contrast_text(self):
        self.assertEqual(pal.contrast_text((255, 255, 255)), pal.DARK_TEXT)
        self.assertEqual(pal.contrast_text((255, 248, 235)), pal.DARK_TEXT)
        self.assertEqual(pal.contrast_text((0, 0, 0)), pal.LIGHT_TEXT)
        self.assertEqual(pal.contrast_text((255, 93, 104)), pal.LIGHT_TEXT)
        # Bright yellow is light enough for dark text.
        self.assertEqual(pal.contrast_text((255, 230, 0)), pal.DARK_TEXT)

    def test_hsv_round_trip(self):
        for rgb in ((255, 93, 104), (0, 180, 165), (255, 190, 30),
                    (12, 34, 56), (128, 128, 128), (0, 0, 0), (255, 255, 255)):
            back = pal.hsv_to_rgb(*pal.rgb_to_hsv(*rgb))
            for a, b in zip(rgb, back):
                self.assertLessEqual(abs(a - b), 1, (rgb, back))

    def test_hsv_primaries(self):
        self.assertEqual(pal.rgb_to_hsv(255, 0, 0), (0.0, 1.0, 1.0))
        self.assertEqual(pal.rgb_to_hsv(0, 255, 0)[0], 120)
        self.assertEqual(pal.rgb_to_hsv(0, 0, 255)[0], 240)
        self.assertEqual(pal.hsv_to_rgb(-120, 1, 1), (0, 0, 255))
        self.assertEqual(pal.hsv_to_rgb(480, 1, 1), (0, 255, 0))


class DeriveTest(unittest.TestCase):
    def test_five_slots_primary_first(self):
        p = pal.derive((255, 93, 104))
        self.assertEqual(len(p), len(pal.SLOTS))
        self.assertEqual(p[0], (255, 93, 104))
        for c in p:
            self.assertEqual(len(c), 3)
            for v in c:
                self.assertTrue(0 <= v <= 255)

    def test_accents_follow_the_hue(self):
        h = pal.rgb_to_hsv(255, 0, 0)[0]
        p = pal.derive((255, 0, 0))
        self.assertAlmostEqual(pal.rgb_to_hsv(*p[3])[0], (h + 160) % 360,
                               delta=2)
        self.assertAlmostEqual(pal.rgb_to_hsv(*p[4])[0], (h + 50) % 360,
                               delta=2)
        # Accents stay vivid and bright even from a dull colour.
        q = pal.derive((60, 50, 50))
        self.assertGreaterEqual(pal.rgb_to_hsv(*q[4])[2], 0.8 - 0.01)
        self.assertGreaterEqual(pal.rgb_to_hsv(*q[3])[1], 0.5 - 0.01)

    def test_base_follows_brightness(self):
        dark = pal.derive((10, 10, 40))
        light = pal.derive((240, 245, 250))
        mid = pal.derive((255, 93, 104))
        self.assertLess(pal.luma(dark[1]), 40)
        self.assertGreater(pal.luma(light[1]), 230)
        self.assertEqual(mid[1], (255, 248, 235))
        # The card sits one step off the background in every mode.
        for p in (dark, light, mid):
            self.assertNotEqual(p[1], p[2])
            self.assertLess(abs(pal.luma(p[1]) - pal.luma(p[2])), 30)

    def test_clamps_out_of_range_input(self):
        self.assertEqual(pal.derive((300, -5, 128.7))[0], (255, 0, 128))


class PresetTest(unittest.TestCase):
    def test_presets_are_well_formed(self):
        names = [n for n, _ in pal.PRESETS]
        self.assertEqual(len(names), len(set(names)))
        for name, colours in pal.PRESETS:
            self.assertLessEqual(len(name), 18, name)   # header readout
            self.assertEqual(len(colours), len(pal.SLOTS), name)
            for c in colours:
                self.assertEqual(len(c), 3)
                self.assertTrue(all(0 <= v <= 255 for v in c), name)

    def test_falera_preset_is_the_os_theme(self):
        t = _theme_rgb()
        name, colours = pal.PRESETS[0]
        self.assertEqual(name, "Falera")
        self.assertEqual(colours, (t["PRIMARY"], t["BG"], t["CARD"],
                                   t["TEAL"], t["GOLD"]))


class AppViewTest(unittest.TestCase):
    """The app's PALETTE / PRESETS views, against stub oreoOS modules."""

    def setUp(self):
        keys = [k for k in sys.modules if k.split(".")[0] in
                ("oreoOS", "oreoWare", "apps_market")]
        saved = {k: sys.modules.pop(k) for k in keys}

        def restore():
            for k in [k for k in sys.modules if k.split(".")[0] in
                      ("oreoOS", "oreoWare", "apps_market")]:
                del sys.modules[k]
            sys.modules.update(saved)
        self.addCleanup(restore)
        pkg = types.ModuleType("oreoOS")
        pkg.__path__ = []
        sys.modules["oreoOS"] = pkg
        pkg.api = _load_by_path("oreoOS/api.py", "oreoOS.api")
        sys.modules["oreoOS.api"] = pkg.api
        pkg.theme = _load_by_path("oreoOS/theme.py", "oreoOS.theme")
        widgets = types.ModuleType("oreoOS.widgets")
        widgets.HEADER_H, widgets.HINT_H = 28, 16
        self.hints = []
        widgets.draw_hint = lambda d, t: self.hints.append(t)
        pkg.widgets = widgets
        pkg.App = object
        sys.modules["oreoOS.state"] = None
        sys.modules["oreoWare"] = None        # no LED off-badge
        sys.path.insert(0, str(ROOT))
        self.addCleanup(sys.path.remove, str(ROOT))
        self.m = importlib.import_module("apps_market.Colors.src.app")
        api = pkg.api
        self.api = api

        class Buttons:
            def is_pressed(self, b):
                return False

        class Display:
            def __init__(self):
                self.texts = []

            def rect(self, *a, **k):
                pass

            def blit(self, *a, **k):
                pass

            def text(self, s, *a, **k):
                self.texts.append(s)

        self.d = Display()
        self.os = types.SimpleNamespace(
            buttons=Buttons(), display=self.d,
            settings_get=lambda k, default=None: default,
            settings_set=lambda k, v: None)
        self.app = self.m.App()
        self.app._save = []
        self.m._save_rgb = lambda rgb: self.app._save.append(tuple(rgb))
        self.app.on_enter(self.os)

    def press(self, btn):
        self.app.on_button_press(btn)

    def test_b_cycles_through_palette_and_presets(self):
        api = self.api
        seen = [self.app._mode]
        for _ in range(5):
            self.press(api.BTN_B)
            seen.append(self.app._mode)
        self.assertEqual(seen, ["RGB", "HSL", "CMYK", "PAL", "PRESET", "RGB"])

    def test_palette_view_draws_the_ribbon(self):
        for _ in range(3):
            self.press(self.api.BTN_B)
        self.app.draw(self.d)
        for slot in pal.SLOTS:
            self.assertIn(slot, self.d.texts)
        self.assertTrue(any(t.startswith("PAL #") for t in self.d.texts))

    def test_presets_step_and_save_their_colour(self):
        api = self.api
        for _ in range(4):
            self.press(api.BTN_B)
        self.assertEqual(self.app._rgb, pal.PRESETS[0][1][0])
        cursor = (self.app._cx, self.app._cy)
        self.press(api.BTN_RIGHT)
        self.assertEqual(self.app._rgb, pal.PRESETS[1][1][0])
        self.press(api.BTN_LEFT)
        self.press(api.BTN_LEFT)
        self.assertEqual(self.app._rgb, pal.PRESETS[-1][1][0])
        self.press(api.BTN_UP)                 # arrows never move the cursor
        self.app.update(0.5)
        self.assertEqual((self.app._cx, self.app._cy), cursor)
        self.press(api.BTN_A)
        self.assertEqual(self.app._save, [pal.PRESETS[-1][1][0]])
        self.assertEqual(self.app._rgb, pal.PRESETS[-1][1][0])
        self.app.draw(self.d)
        self.assertIn(pal.PRESETS[-1][0], self.d.texts)
        self.assertEqual(self.hints[-1], "L/R=preset B=mode A=save C=LED")


class AppTextTest(unittest.TestCase):
    def test_hints_fit_the_screen(self):
        src = (ROOT / "apps_market/Colors/src/app.py").read_text()
        for hint in ("L/R=preset B=mode A=save C=LED",
                     "arrows=pick B=mode A=save C=LED"):
            self.assertIn(hint, src)
            self.assertLessEqual(len(hint) * 8, 320)


if __name__ == "__main__":
    unittest.main()
