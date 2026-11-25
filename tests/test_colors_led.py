"""Colors app: the LED drive level and its C-button rule."""

import ast
import unittest
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "apps_market" / "Colors" / "src" / "app.py"


def _load(names):
    tree = ast.parse(SRC.read_text())
    keep = [n for n in tree.body
            if (isinstance(n, ast.FunctionDef) and n.name in names)
            or (isinstance(n, ast.Assign)
                and any(getattr(t, "id", "") in names for t in n.targets))]
    ns = {}
    exec(compile(ast.Module(body=keep, type_ignores=[]), str(SRC), "exec"), ns)
    return ns


class LedTest(unittest.TestCase):
    def setUp(self):
        self.ns = _load({"led_level", "LED_SCALE"})

    def test_scaled(self):
        s = self.ns["LED_SCALE"]
        self.assertEqual(self.ns["led_level"]((255, 0, 100)),
                         (int(255 * s + 0.5), 0, int(100 * s + 0.5)))

    def test_dim_channel_stays_lit(self):
        self.assertEqual(self.ns["led_level"]((1, 0, 2)), (1, 0, 1))

    def test_black_is_off(self):
        self.assertEqual(self.ns["led_level"]((0, 0, 0)), (0, 0, 0))

    def test_app_captures_c(self):
        tree = ast.parse(SRC.read_text())
        app = [n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "App"][0]
        attrs = {t.id: n.value for n in app.body if isinstance(n, ast.Assign)
                 for t in n.targets if isinstance(t, ast.Name)}
        self.assertTrue(ast.literal_eval(attrs["CAPTURES_C"]))
        self.assertNotIn("C_DOUBLE_TAP", attrs)   # double-tap C opens the panel


if __name__ == "__main__":
    unittest.main()
