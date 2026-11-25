# SPDX-FileCopyrightText: 2026 Ayushman Bhattacharya
# SPDX-License-Identifier: MIT
"""Run every example once against fake board, busio, fourwire and adafruit_st7789.

This catches typos and API misuse in the examples; it cannot show that the
pins, rotation or speed are right on a real board.
"""

import contextlib
import io
import runpy
import sys
import types
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import circuitpython_rv565 as rv565  # noqa: E402
import fakes  # noqa: E402

EXAMPLES = sorted((HERE.parent / "examples").glob("*.py"))
VECTOR = HERE.parent.parent.parent / "tests" / "data" / "testpattern.rv565"


class _Stop(Exception):
    pass


class FakeST7789(fakes.Display):
    instances = []

    def __init__(self, bus, *, width, height, rotation=0, backlight_pin=None, **kw):
        super().__init__(width, height)
        self.bus = bus
        self.rotation = rotation
        self.backlight_pin = backlight_pin
        FakeST7789.instances.append(self)


class FakeBus(fakes.FourWire):
    def __init__(self, spi, *, command, chip_select, reset=None, baudrate=24000000):
        super().__init__()
        self.pins = dict(command=command, chip_select=chip_select, reset=reset)
        self.baudrate = baudrate


def fake_modules():
    displayio = fakes.install()
    displayio.release_displays = lambda: None
    board = types.ModuleType("board")
    for n in range(29):
        setattr(board, "GP%d" % n, "GP%d" % n)
    board.DISPLAY = fakes.Display(240, 135)
    busio = types.ModuleType("busio")
    busio.SPI = lambda clock, MOSI=None, MISO=None: ("SPI", clock, MOSI)
    fourwire = types.ModuleType("fourwire")
    fourwire.FourWire = FakeBus
    st7789 = types.ModuleType("adafruit_st7789")
    st7789.ST7789 = FakeST7789
    return {"board": board, "busio": busio, "fourwire": fourwire,
            "adafruit_st7789": st7789}


class ExamplesTest(unittest.TestCase):
    def setUp(self):
        self.modules = fake_modules()
        sys.modules.update(self.modules)
        FakeST7789.instances.clear()
        self.real_open = rv565._builtin_open
        self.real_play = rv565._Pacer.play
        rv565._builtin_open = self.open_clip
        self.plays = []
        self.streams = []

        def play_once(player, *args, **kwargs):
            if self.plays:
                raise _Stop
            self.plays.append(player)
            return self.real_play(player, *args, **kwargs)

        rv565._Pacer.play = play_once

    def tearDown(self):
        rv565._builtin_open = self.real_open
        rv565._Pacer.play = self.real_play
        for stream in self.streams:
            stream.close()
        for name in self.modules:
            sys.modules.pop(name, None)
        fakes.uninstall()

    def open_clip(self, path, mode):
        self.assertEqual((path, mode), ("/testpattern.rv565", "rb"))
        stream = open(VECTOR, "rb")
        self.streams.append(stream)
        return stream

    def run_example(self, path):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(_Stop):
            runpy.run_path(str(path), run_name="__main__")
        self.assertEqual(len(self.plays), 1)
        self.assertIn("PlayStats", out.getvalue())
        return self.plays[0]

    def test_examples_exist(self):
        self.assertEqual([p.name for p in EXAMPLES], [
            "rv565_esp32s3_tft.py", "rv565_pico2_direct.py",
            "rv565_pico2_st7789.py", "rv565_simpletest.py"])

    def test_board_display_examples(self):
        for name in ("rv565_simpletest.py", "rv565_esp32s3_tft.py"):
            with self.subTest(name):
                self.plays.clear()
                player = self.run_example(HERE.parent / "examples" / name)
                self.assertIsInstance(player, rv565.Player)
                display = self.modules["board"].DISPLAY
                self.assertIs(display.root_group, player.group)
                self.assertEqual((player.group.x, player.group.y), (30, 0))

    def check_pico2_wiring(self):
        (display,) = FakeST7789.instances
        self.assertEqual((display.width, display.height, display.rotation),
                         (320, 240, 90))
        self.assertEqual(display.backlight_pin, "GP22")
        self.assertEqual(display.bus.pins,
                         dict(command="GP20", chip_select="GP17", reset="GP21"))
        return display

    def test_pico2_displayio(self):
        player = self.run_example(HERE.parent / "examples" / "rv565_pico2_st7789.py")
        self.assertIsInstance(player, rv565.Player)
        display = self.check_pico2_wiring()
        self.assertEqual(display.refreshes, 24)

    def test_pico2_direct(self):
        player = self.run_example(HERE.parent / "examples" / "rv565_pico2_direct.py")
        self.assertIsInstance(player, rv565.DirectPlayer)
        display = self.check_pico2_wiring()
        sent = display.bus.sent
        # MADCTL to landscape, 24 frames of CASET/RASET/RAMWR, MADCTL back;
        # then the example's while loop starts play() again, which the test
        # stops after its MADCTL, and MADCTL is restored on the way out.
        landscape, portrait = (0x36, b"\x60"), (0x36, b"\xc0")
        self.assertEqual(len(sent), 3 * 24 + 4)
        self.assertEqual(sent[0], landscape)
        self.assertEqual([c for c, _ in sent[1:73]], [0x2A, 0x2B, 0x2C] * 24)
        self.assertEqual(sent[73:], [portrait, landscape, portrait])


if __name__ == "__main__":
    unittest.main()
