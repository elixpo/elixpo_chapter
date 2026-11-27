# SPDX-FileCopyrightText: 2026 Ayushman Bhattacharya
# SPDX-License-Identifier: MIT
"""ESP32-S3 board with a built-in ST7789: the Adafruit ESP32-S3 TFT Feather.

Its 240x135 display is already set up as board.DISPLAY, so the 180x135 test
pattern fits at native size. Other ESP32-S3 boards with board.DISPLAY work
the same way; for a separate SPI panel, set it up as in
rv565_pico2_st7789.py with your board's pins.

The clip can live on CIRCUITPY or on an SD card mounted with sdcardio and
storage.mount (for example "/sd/clip.rv565"); frames are read from the file
one at a time, so the clip does not have to fit in RAM.
"""

import board

import circuitpython_rv565 as rv565

display = board.DISPLAY
clip = rv565.open("/testpattern.rv565")
print("RV565 %dx%d, %d FPS, %d frames" % (clip.width, clip.height, clip.fps, len(clip)))

player = rv565.Player(clip, display)
while True:
    stats = player.play(loops=3)
    print(stats)
