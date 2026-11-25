# SPDX-License-Identifier: MIT
# ST7789 wiring test for the Pico 2 (MicroPython), run with:
#   mpremote connect /dev/ttyACM0 run st7789_test.py
# Same pins and panel settings as the RV565 RP2350 benchmark, but at 1 MHz;
# raise baudrate= to test the wiring at higher rates.
# Expected: backlight on, then the screen fills red, green, blue, then shows
# four colour bars.

import time
from machine import Pin, SPI

SCK, MOSI, CS, DC, RST, BL = 18, 19, 17, 20, 21, 22
W, H = 320, 240

spi = SPI(0, baudrate=1_000_000, polarity=0, phase=0, sck=Pin(SCK), mosi=Pin(MOSI))
cs = Pin(CS, Pin.OUT, value=1)
dc = Pin(DC, Pin.OUT, value=1)
rst = Pin(RST, Pin.OUT, value=1)
bl = Pin(BL, Pin.OUT, value=0)


def cmd(c, data=b""):
    cs(0)
    dc(0)
    spi.write(bytes([c]))
    if data:
        dc(1)
        spi.write(data)
    cs(1)


def fill(rgb565):
    row = bytes([rgb565 >> 8, rgb565 & 0xFF]) * W
    cs(0)
    dc(0)
    spi.write(b"\x2c")      # RAMWR
    dc(1)
    for _ in range(H):
        spi.write(row)
    cs(1)


def bars():
    colours = (0xF800, 0x07E0, 0x001F, 0xFFFF)   # red, green, blue, white
    row = b"".join(bytes([c >> 8, c & 0xFF]) * (W // 4) for c in colours)
    cs(0)
    dc(0)
    spi.write(b"\x2c")
    dc(1)
    for _ in range(H):
        spi.write(row)
    cs(1)


print("reset")
rst(1); time.sleep_ms(10); rst(0); time.sleep_ms(10); rst(1); time.sleep_ms(120)

print("init")
cmd(0x01); time.sleep_ms(150)            # software reset
cmd(0x11); time.sleep_ms(120)            # sleep out
cmd(0x3A, b"\x55")                       # RGB565
cmd(0x36, b"\x60")                       # landscape (RV565_PANEL_320X240)
cmd(0x2A, bytes([0, 0, (W - 1) >> 8, (W - 1) & 0xFF]))
cmd(0x2B, bytes([0, 0, (H - 1) >> 8, (H - 1) & 0xFF]))
cmd(0x21)                                # inversion on (IPS)
cmd(0x13)                                # normal mode
cmd(0x29); time.sleep_ms(20)             # display on
bl(1)

for name, colour in (("red", 0xF800), ("green", 0x07E0), ("blue", 0x001F)):
    print("fill", name)
    fill(colour)
    time.sleep_ms(1500)

print("bars")
bars()
print("done")
