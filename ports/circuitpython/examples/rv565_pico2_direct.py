# SPDX-FileCopyrightText: 2026 Ayushman Bhattacharya
# SPDX-License-Identifier: MIT
"""Experimental fast path: send frames straight to the ST7789 on a Pico 2.

RV565 frames are already in the panel's byte order, so DirectPlayer skips
displayio and sends each inflated frame with one bus.send(). Same wiring and
files as rv565_pico2_st7789.py. displayio is left without a root group while
this runs, so nothing else is drawn on the panel.
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
# The driver sends the ST7789 init sequence (rotation, inversion, colour mode).
display = ST7789(bus, width=320, height=240, rotation=90, backlight_pin=board.GP22)

clip = rv565.open("/testpattern.rv565")
# displayio's rotation=90 is done in software, so DirectPlayer sets the
# controller's MADCTL to landscape (0x60, as the RV565 Pico 2 benchmark does)
# while playing and restores it afterwards. The benchmark's 320x240 module
# needs no offset that way; if the picture is shifted, upside down or
# mirrored on yours, pass x_offset/y_offset or madctl=0xA0.
player = rv565.DirectPlayer(clip, bus, 320, 240, display=display)
while True:
    print(player.play())
