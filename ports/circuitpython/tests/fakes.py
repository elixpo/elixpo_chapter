# SPDX-FileCopyrightText: 2026 Ayushman Bhattacharya
# SPDX-License-Identifier: MIT
"""Minimal stand-ins for CircuitPython's displayio and bitmaptools.

They model only what circuitpython_rv565 relies on, with CircuitPython's
semantics: a Bitmap holds one integer per pixel, and bitmaptools.readinto
reads each 16-bit element in the board's native (little-endian) byte order
unless swap_bytes_in_element is set.
"""

import sys
import types


class Bitmap:
    def __init__(self, width, height, value_count):
        if not 1 <= value_count <= 65536:
            raise ValueError("value_count")
        self.width = width
        self.height = height
        self.value_count = value_count
        self.values = [0] * (width * height)
        self.writes = 0
        self.dirty_rows = set()  # rows written since the test last cleared it
        self.dirty = set()  # (x, y) written since the test last cleared it

    def __setitem__(self, index, value):
        if isinstance(index, tuple):
            x, y = index
            index = y * self.width + x
        if not 0 <= value < self.value_count:
            raise ValueError("value out of range")
        self.values[index] = value
        self.writes += 1
        self.dirty_rows.add(index // self.width)
        self.dirty.add((index % self.width, index // self.width))

    def __getitem__(self, index):
        if isinstance(index, tuple):
            x, y = index
            index = y * self.width + x
        return self.values[index]


class Colorspace:
    RGB888 = "RGB888"
    RGB565 = "RGB565"
    RGB565_SWAPPED = "RGB565_SWAPPED"


class ColorConverter:
    def __init__(self, *, input_colorspace=Colorspace.RGB888, dither=False):
        self.input_colorspace = input_colorspace

    def rgb565(self, value):
        """The true RGB565 value a bitmap value stands for."""
        if self.input_colorspace == Colorspace.RGB565_SWAPPED:
            return ((value & 0xFF) << 8) | (value >> 8)
        if self.input_colorspace == Colorspace.RGB565:
            return value
        raise NotImplementedError(self.input_colorspace)


class Palette:
    def __init__(self, color_count):
        self.colors = [0] * color_count

    def __len__(self):
        return len(self.colors)

    def __setitem__(self, index, color):
        if not 0 <= color <= 0xFFFFFF:
            raise ValueError("color")
        self.colors[index] = color

    def __getitem__(self, index):
        return self.colors[index]


class TileGrid:
    def __init__(self, bitmap, *, pixel_shader):
        self.bitmap = bitmap
        self.pixel_shader = pixel_shader


class Group:
    def __init__(self, *, scale=1, x=0, y=0):
        self.scale = scale
        self.x = x
        self.y = y
        self.items = []

    def append(self, item):
        self.items.append(item)


class Display:
    def __init__(self, width=320, height=240):
        self.width = width
        self.height = height
        self.root_group = None
        self.auto_refresh = True
        self.refreshes = 0
        self.auto_refresh_seen = []

    def refresh(self, *, target_frames_per_second=None, minimum_frames_per_second=0):
        self.refreshes += 1
        self.auto_refresh_seen.append(self.auto_refresh)


class FourWire:
    def __init__(self):
        self.sent = []

    def send(self, command, data, *, toggle_every_byte=False):
        self.sent.append((command, bytes(data)))


def readinto(bitmap, file, bits_per_pixel, element_size=1,
             reverse_pixels_in_element=False, swap_bytes_in_element=False,
             reverse_rows=False):
    """CircuitPython's bitmaptools.readinto for 1-, 2-, 4-, 8- and 16-bit
    pixels: rows padded to whole elements; within an element the first pixel
    is in the least significant bits unless reverse_pixels_in_element."""
    if reverse_rows or bits_per_pixel not in (1, 2, 4, 8, 16):
        raise NotImplementedError("fake readinto: unmodelled options")
    if bits_per_pixel == 16 and element_size != 2:
        raise NotImplementedError("fake readinto models 16-bit in 2-byte elements")
    if bits_per_pixel < 16 and element_size != 1:
        raise NotImplementedError("fake readinto models small pixels in bytes")
    element_bits = 8 * element_size
    row_bytes = element_size * ((bitmap.width * bits_per_pixel + element_bits - 1)
                                // element_bits)
    mask = (1 << bits_per_pixel) - 1
    per = 8 // bits_per_pixel if bits_per_pixel < 8 else 1
    for y in range(bitmap.height):
        row = file.read(row_bytes)
        if len(row) != row_bytes:
            raise EOFError("short read")
        for x in range(bitmap.width):
            if bits_per_pixel == 16:
                lo, hi = row[2 * x], row[2 * x + 1]
                if swap_bytes_in_element:
                    lo, hi = hi, lo
                value = lo | (hi << 8)
            elif bits_per_pixel == 8:
                value = row[x]
            else:
                k = x % per
                if reverse_pixels_in_element:
                    k = per - 1 - k
                value = (row[x // per] >> (k * bits_per_pixel)) & mask
            bitmap[x, y] = value


def blit(dest_bitmap, source_bitmap, x, y, *, x1=0, y1=0, x2=None, y2=None,
         skip_source_index=None, skip_dest_index=None):
    """bitmaptools.blit (CircuitPython 9+): copy source[x1:x2, y1:y2] to
    dest at (x, y); x2 and y2 are exclusive."""
    x2 = source_bitmap.width if x2 is None else x2
    y2 = source_bitmap.height if y2 is None else y2
    if skip_source_index is not None or skip_dest_index is not None:
        raise NotImplementedError("fake blit: skip indexes")
    for sy in range(y1, y2):
        for sx in range(x1, x2):
            dest_bitmap[x + sx - x1, y + sy - y1] = source_bitmap[sx, sy]


def install(with_readinto=True, with_blit=True):
    """Register fake displayio and bitmaptools modules; return displayio."""
    displayio = types.ModuleType("displayio")
    for name in ("Bitmap", "Colorspace", "ColorConverter", "Palette", "TileGrid",
                 "Group"):
        setattr(displayio, name, globals()[name])
    bitmaptools = types.ModuleType("bitmaptools")
    if with_readinto:
        bitmaptools.readinto = readinto
    if with_blit:
        bitmaptools.blit = blit
    sys.modules["displayio"] = displayio
    sys.modules["bitmaptools"] = bitmaptools
    return displayio


def uninstall():
    sys.modules.pop("displayio", None)
    sys.modules.pop("bitmaptools", None)


class FakeClock:
    """A clock that advances only when told to (by decode work or sleep)."""

    def __init__(self):
        self.now = 0.0
        self.sleeps = []

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds
