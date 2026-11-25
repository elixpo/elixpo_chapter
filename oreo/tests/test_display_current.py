"""Host test for oreoWare.display.current(): the newest Display, which
`falera screenshot` reads the framebuffer from at the raw REPL.

The module is loaded by path with fake framebuf, machine, panel driver and
time.sleep_us, so no hardware is needed.
"""

import importlib.util
import sys
import time
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

NAMES = ("framebuf", "machine", "oreoOS", "oreoOS.api", "oreoWare", "oreoWare.pins",
         "oreoWare._st7789", "oreoWare.display", "micropython")


def _load(rel, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


class _Pin:
    OUT = 1

    def __init__(self, *a, **k):
        self.v = k.get("value", 0)

    def __call__(self, v=None):
        if v is not None:
            self.v = v
        return self.v


class _SPI:
    def __init__(self, *a, **k):
        self.sent = 0

    def write(self, data):
        self.sent += len(data)


class _Panel:
    def __init__(self, spi, dc, cs, rst, bl):
        self.spi, self.dc, self.cs, self.bl = spi, dc, cs, bl
        self._ramwr_cmd = b"\x2c"

    def init(self):
        pass

    def set_window(self, *a):
        pass


class _FrameBuffer:
    def __init__(self, buf, w, h, fmt):
        self.buf, self.w = buf, w

    def fill(self, c):
        # framebuf stores the (pre-swapped) value little-endian
        lo, hi = c & 0xFF, (c >> 8) & 0xFF
        for i in range(0, len(self.buf), 2):
            self.buf[i], self.buf[i + 1] = lo, hi

    def fill_rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                o = (yy * self.w + xx) * 2
                self.buf[o], self.buf[o + 1] = c & 0xFF, (c >> 8) & 0xFF


class DisplayCurrentTest(unittest.TestCase):
    def setUp(self):
        self.saved = {k: sys.modules.get(k) for k in NAMES}
        self.had_sleep_us = hasattr(time, "sleep_us")
        if not self.had_sleep_us:
            time.sleep_us = lambda us: None
        fb = types.ModuleType("framebuf")
        fb.RGB565, fb.MONO_HLSB = 1, 2
        fb.FrameBuffer = _FrameBuffer
        machine = types.ModuleType("machine")
        machine.Pin, machine.SPI = _Pin, _SPI     # no PWM: the driver copes
        sys.modules["framebuf"] = fb
        sys.modules["machine"] = machine
        sys.modules.pop("micropython", None)
        pkg = types.ModuleType("oreoOS")
        pkg.__path__ = [str(ROOT / "oreoOS")]
        sys.modules["oreoOS"] = pkg
        pkg.api = _load("oreoOS/api.py", "oreoOS.api")
        ware = types.ModuleType("oreoWare")
        ware.__path__ = [str(ROOT / "oreoWare")]
        sys.modules["oreoWare"] = ware
        ware.pins = _load("oreoWare/pins.py", "oreoWare.pins")
        st = types.ModuleType("oreoWare._st7789")
        st.ST7789 = _Panel
        sys.modules["oreoWare._st7789"] = st
        ware._st7789 = st
        self.display = _load("oreoWare/display.py", "oreoWare.display")
        self.api = pkg.api

    def tearDown(self):
        if not self.had_sleep_us:
            del time.sleep_us
        for k, v in self.saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v

    def test_none_before_any_display(self):
        self.assertIsNone(self.display.current())

    def test_returns_the_newest_display(self):
        first = self.display.Display()
        self.assertIs(self.display.current(), first)
        second = self.display.Display()     # entry.py's crash screen makes another
        self.assertIs(self.display.current(), second)

    def test_framebuffer_is_big_endian_rgb565(self):
        d = self.display.Display()
        buf = self.display.current()._buf
        self.assertEqual(len(buf), self.api.SCREEN_W * self.api.SCREEN_H * 2)
        red = 0xF800                         # RGB565 red
        d.rect(0, 0, 1, 1, red, fill=True)
        self.assertEqual((buf[0] << 8) | buf[1], red)
        d.clear(0x07E0)                      # green
        self.assertEqual((buf[-2] << 8) | buf[-1], 0x07E0)


if __name__ == "__main__":
    unittest.main()
