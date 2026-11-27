"""oreoOS/icons.py finds an App Store app's own icon in its folder."""

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class AppLocalIconTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        opt = base / "apps" / "zzstoreapp" / "assets" / "optimized"
        opt.mkdir(parents=True)
        for d in (base / "apps", base / "apps" / "zzstoreapp",
                  base / "apps" / "zzstoreapp" / "assets", opt):
            (d / "__init__.py").write_text("")
        (opt / "zzstoreapp_icon.py").write_text("W = 2\nH = 1\nDATA = b'\\x01\\x02\\x03\\x04'\n")
        self.saved = {k: v for k, v in sys.modules.items()
                      if k == "apps" or k.startswith("apps.")}
        for k in self.saved:
            del sys.modules[k]
        sys.path.insert(0, str(base))
        spec = importlib.util.spec_from_file_location("icons_under_test",
                                                      ROOT / "oreoOS" / "icons.py")
        self.icons = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.icons)

    def tearDown(self):
        sys.path.remove(self.tmp.name)
        for k in [k for k in sys.modules if k == "apps" or k.startswith("apps.")]:
            del sys.modules[k]
        sys.modules.update(self.saved)
        self.tmp.cleanup()

    def test_store_app_icon_from_its_folder(self):
        got = self.icons.load("zzstoreapp", "zzstoreapp_icon.png")
        self.assertEqual(got, (b"\x01\x02\x03\x04", 2, 1))

    def test_wrong_name_falls_back_to_app_icon(self):
        got = self.icons.load("zzstoreapp", "nothing_here.png")
        self.assertEqual(got, (b"\x01\x02\x03\x04", 2, 1))

    def test_app_without_icon_is_none(self):
        self.assertIsNone(self.icons.load("zznoiconapp", None))


if __name__ == "__main__":
    unittest.main()
