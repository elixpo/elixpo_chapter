# SPDX-FileCopyrightText: 2026 Ayushman Bhattacharya
# SPDX-License-Identifier: MIT
"""Raspberry Pi Pico 2 with a 2.0" 320x240 ST7789 on SPI0, through displayio.

Wiring (the same as the RV565 Pico 2 benchmark):
SCK GP18, MOSI GP19, CS GP17, DC GP20, RST GP21, BL GP22, plus 3V3 and GND.

CIRCUITPY needs:
  lib/circuitpython_rv565.py
  lib/adafruit_st7789.mpy   (from the Adafruit CircuitPython bundle)
  testpattern.rv565          (tests/data in the RV565 repository)

Keep clips at 180x135 or smaller on the Pico 2: a 320x240 frame needs 150 KiB
for the inflated bytes and as much again for the bitmap.
"""

import board
import busio
import displayio
from adafruit_st7789 import ST7789

try:
    from fourwire import FourWire  # CircuitPython 9 and later
except ImportError:
    from displayio import FourWire  # CircuitPython 8

import circuitpython_rv565 as rv565

displayio.release_displays()
spi = busio.SPI(clock=board.GP18, MOSI=board.GP19)
bus = FourWire(
    spi,
    command=board.GP20,
    chip_select=board.GP17,
    reset=board.GP21,
    baudrate=40_000_000,
)
display = ST7789(bus, width=320, height=240, rotation=90, backlight_pin=board.GP22)

clip = rv565.open("/testpattern.rv565")
clip.build_index()  # validate the whole file before playing
player = rv565.Player(clip, display)
while True:
    print(player.play())
