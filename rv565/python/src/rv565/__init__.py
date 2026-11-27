"""RV565: video files for microcontroller displays.

Read, write and check RV565 files, the format played by the RV565
microcontroller library (arXiv:2610.35935). Version 7 files declare one of
nine pixel formats and a codec, and mix keyframes, XOR deltas and repeats;
version 6 files (RGB565 big-endian, zlib, every frame a keyframe) still read.

    import rv565

    clip = rv565.open("clip.rv565")
    print(clip.width, clip.height, clip.fps, len(clip), clip.pixel_format)
    frame = clip.frame(0)          # bytes in the clip's pixel format

    rv565.write("out.rv565", 180, 135, 24, frames)              # RGB565 BE, zlib
    rv565.write("oled.rv565", 128, 64, 15, frames,
                pixel_format="mono_vpage", keyframe_interval=15)

``rv565.convert`` turns packed RGB888 into any pixel format, and
``rv565.to_rgb888`` turns it back. With Pillow installed
(``pip install rv565[pillow]``), ``import rv565.pillow`` lets ``PIL.Image``
open and save RV565 files as animations.
"""

import struct
import zlib
from dataclasses import dataclass
from pathlib import Path

__all__ = [
    "RV565Error", "Header", "Clip", "CostModel", "ScheduleReport",
    "COST_ESP32S3_180x135", "COST_RP2350_180x135", "open", "write", "encode_frames",
    "PIXEL_FORMATS", "CODECS", "frame_size", "convert", "to_rgb888",
    "rgb888_to_rgb565be", "rgb565be_to_rgb888",
]

__version__ = "3.0.0"

MAGIC = b"RV5"
VERSION = 7
VERSION_6 = 6
VERSION_8 = 8  # version 7 plus region deltas (frame type 4)
MAX_FPS = 60
MAX_FPS_V6 = 30
MAX_FRAMES = 0xFFFF
HEADER_V6 = struct.Struct("<3sBHHBBH")  # magic, version, width, height, fps, flags, frames
HEADER = struct.Struct("<3sBHHBBHBBBB")  # ... header size, pixel format, codec, keyframe interval
LENGTH = struct.Struct("<I")

# Pixel formats by value (docs/FORMAT.md).
PIXEL_FORMATS = ("rgb565be", "rgb565le", "rgb444", "rgb666", "rgb888",
                 "gray8", "gray4", "mono", "mono_vpage")
CODECS = ("stored", "zlib")
KEYFRAME, DELTA, REPEAT, PARTIAL, REGION = 0, 1, 2, 3, 4
FRAME_TYPES = ("key", "delta", "repeat", "partial", "region")
BAND_LINES = 8  # default band height of the reference encoder
MOTION_RANGE = 8  # default shift search range of the reference encoder, in pixels


class RV565Error(ValueError):
    """The data is not a valid RV565 file, or an argument is out of range."""


def _format_index(pixel_format):
    if isinstance(pixel_format, int):
        if 0 <= pixel_format < len(PIXEL_FORMATS):
            return pixel_format
    elif pixel_format in PIXEL_FORMATS:
        return PIXEL_FORMATS.index(pixel_format)
    raise RV565Error("unknown pixel format %r" % (pixel_format,))


def _codec_index(codec):
    if isinstance(codec, int):
        if 0 <= codec < len(CODECS):
            return codec
    elif codec in CODECS:
        return CODECS.index(codec)
    raise RV565Error("unknown codec %r" % (codec,))


def row_bytes(pixel_format, width):
    """Bytes in one row of a frame (not defined for mono_vpage)."""
    fmt = PIXEL_FORMATS[_format_index(pixel_format)]
    return {"rgb565be": 2 * width, "rgb565le": 2 * width, "rgb444": (3 * width + 1) // 2,
            "rgb666": 3 * width, "rgb888": 3 * width, "gray8": width,
            "gray4": (width + 1) // 2, "mono": (width + 7) // 8,
            "mono_vpage": None}[fmt]


def frame_size(pixel_format, width, height):
    """Decoded size in bytes of one frame."""
    fmt = PIXEL_FORMATS[_format_index(pixel_format)]
    if fmt == "mono_vpage":
        return width * ((height + 7) // 8)
    return row_bytes(fmt, width) * height


def frame_lines(pixel_format, width, height):
    """(P, R): a frame is P lines of R bytes (pixel rows, or pages of 8 rows
    for mono_vpage). Partial deltas divide the frame into bands of lines."""
    fmt = PIXEL_FORMATS[_format_index(pixel_format)]
    if fmt == "mono_vpage":
        return (height + 7) // 8, width
    return height, row_bytes(fmt, width)


def _partial_layout(body, lines, line_bytes):
    """Parse a partial delta body: (band height, changed bands, shifts,
    data offset, decoded data size). Raises RV565Error if the header part is
    invalid."""
    if len(body) < 1 or body[0] == 0:
        raise RV565Error("partial delta with band height 0")
    band = body[0]
    count = (lines + band - 1) // band
    mask_len = (count + 7) // 8
    if len(body) < 1 + mask_len:
        raise RV565Error("partial delta too short for its band mask")
    mask = body[1:1 + mask_len]
    changed = [b for b in range(count) if mask[b >> 3] >> (b & 7) & 1]
    if not changed:
        raise RV565Error("partial delta with no changed band")
    if any(mask[b >> 3] >> (b & 7) & 1 for b in range(count, 8 * mask_len)):
        raise RV565Error("partial delta sets a band past the frame")
    start = 1 + mask_len + 2 * len(changed)
    if len(body) < start:
        raise RV565Error("partial delta too short for its band shifts")
    shifts = []
    for k in range(len(changed)):
        dx, dy = (v - 256 if v > 127 else v for v in body[1 + mask_len + 2 * k:
                                                          3 + mask_len + 2 * k])
        if abs(dy) >= band:
            raise RV565Error("partial delta shifts a band by %d lines, more than it has" % dy)
        shifts.append((dx, dy))
    size = sum((min(lines, (b + 1) * band) - b * band) * line_bytes for b in changed)
    return band, changed, shifts, start, size


# Byte ranges of region deltas start and end on whole pixels: a range is a
# multiple of this many bytes, or runs to the end of the line.
_ALIGN = {"rgb565be": 2, "rgb565le": 2, "rgb444": 3, "rgb666": 3, "rgb888": 3,
          "gray8": 1, "gray4": 1, "mono": 1, "mono_vpage": 1}


def _region_layout(body, lines, line_bytes, align):
    """Parse a region delta body: (band height, changed bands, shifts,
    ranges, data offset, decoded data size). Raises RV565Error if the header
    part is invalid."""
    if len(body) < 1 or body[0] == 0:
        raise RV565Error("region delta with band height 0")
    band = body[0]
    count = (lines + band - 1) // band
    mask_len = (count + 7) // 8
    if len(body) < 1 + mask_len:
        raise RV565Error("region delta too short for its band mask")
    mask = body[1:1 + mask_len]
    changed = [b for b in range(count) if mask[b >> 3] >> (b & 7) & 1]
    if not changed:
        raise RV565Error("region delta with no changed band")
    if any(mask[b >> 3] >> (b & 7) & 1 for b in range(count, 8 * mask_len)):
        raise RV565Error("region delta sets a band past the frame")
    start = 1 + mask_len + 6 * len(changed)
    if len(body) < start:
        raise RV565Error("region delta too short for its band entries")
    shifts, ranges, size = [], [], 0
    for k, b in enumerate(changed):
        o = 1 + mask_len + 6 * k
        dx, dy = (v - 256 if v > 127 else v for v in body[o:o + 2])
        x0, xw = struct.unpack_from("<HH", body, o + 2)
        if abs(dy) >= band:
            raise RV565Error("region delta shifts a band by %d lines, more than it has" % dy)
        if xw == 0 or x0 + xw > line_bytes or x0 % align or \
                ((x0 + xw) % align and x0 + xw != line_bytes):
            raise RV565Error("region delta band %d has an invalid range %d+%d" % (b, x0, xw))
        shifts.append((dx, dy))
        ranges.append((x0, xw))
        size += (min(lines, (b + 1) * band) - b * band) * xw
    return band, changed, shifts, ranges, start, size


def _predict(prev, first, end, line_bytes, dx, dy):
    """Prediction of lines first..end-1 from prev, shifted by (dx bytes, dy
    lines), never reaching outside the band; zero where it would."""
    out = bytearray((end - first) * line_bytes)
    for y in range(first, end):
        src = y - dy
        if not first <= src < end:
            continue
        line = prev[src * line_bytes:(src + 1) * line_bytes]
        o = (y - first) * line_bytes
        if dx >= 0:
            if dx < line_bytes:
                out[o + dx:o + line_bytes] = line[:line_bytes - dx]
        elif -dx < line_bytes:
            out[o:o + line_bytes + dx] = line[-dx:]
    return bytes(out)


@dataclass(frozen=True)
class Header:
    width: int
    height: int
    fps: int
    flags: int
    frames: int
    version: int = VERSION
    header_size: int = HEADER.size
    pixel_format: str = "rgb565be"
    codec: str = "zlib"
    keyframe_interval: int = 1

    @property
    def frame_bytes(self):
        """Decoded size of one frame, in the clip's pixel format."""
        return frame_size(self.pixel_format, self.width, self.height)

    @property
    def duration(self):
        """Length in seconds."""
        return self.frames / self.fps


def parse_header(data):
    """Parse and range-check a version 6, 7 or 8 header."""
    if len(data) < HEADER_V6.size:
        raise RV565Error("file too short")
    magic, version, width, height, fps, flags, frames = HEADER_V6.unpack_from(data)
    if magic != MAGIC:
        raise RV565Error("not an RV565 file")
    if version == VERSION_6:
        if not (width and height and 1 <= fps <= MAX_FPS_V6 and frames):
            raise RV565Error("invalid header")
        return Header(width, height, fps, flags, frames, VERSION_6, HEADER_V6.size)
    if version not in (VERSION, VERSION_8):
        raise RV565Error("unsupported RV565 version %d" % version)
    if len(data) < HEADER.size:
        raise RV565Error("file too short")
    fields = HEADER.unpack_from(data)
    header_size, fmt, codec, interval = fields[7:]
    if not (width and height and 1 <= fps <= MAX_FPS and frames):
        raise RV565Error("invalid header")
    if header_size < HEADER.size or len(data) < header_size:
        raise RV565Error("invalid header size %d" % header_size)
    if fmt >= len(PIXEL_FORMATS):
        raise RV565Error("unsupported pixel format %d" % fmt)
    if codec >= len(CODECS):
        raise RV565Error("unsupported codec %d" % codec)
    if interval == 0:
        raise RV565Error("invalid keyframe interval 0")
    return Header(width, height, fps, flags, frames, version, header_size,
                  PIXEL_FORMATS[fmt], CODECS[codec], interval)


def _xor(a, b):
    return (int.from_bytes(a, "little") ^ int.from_bytes(b, "little")).to_bytes(len(a), "little")


class Clip:
    """An RV565 file held in memory, with an O(1) frame index.

    The whole container is validated on open (docs/FORMAT.md, Validation):
    everything except whether each zlib body inflates to the frame size, which
    ``verify()`` checks.
    """

    def __init__(self, data):
        self.data = bytes(data)
        self.header = h = parse_header(self.data)
        size = h.frame_bytes
        offsets, offset = [], h.header_size
        for i in range(h.frames):
            if len(self.data) - offset < LENGTH.size:
                raise RV565Error("truncated frame table at frame %d" % i)
            (length,) = LENGTH.unpack_from(self.data, offset)
            offset += LENGTH.size
            if length == 0 or len(self.data) - offset < length:
                raise RV565Error("invalid length for frame %d" % i)
            if h.version == VERSION_6:
                kind, body = KEYFRAME, offset
            else:
                kind, body = self.data[offset], offset + 1
                if kind >= len(FRAME_TYPES) or (kind == REGION and h.version < VERSION_8):
                    raise RV565Error("unsupported frame type %d at frame %d" % (kind, i))
                if i % h.keyframe_interval == 0 and kind != KEYFRAME:
                    raise RV565Error("frame %d must be a keyframe" % i)
                if kind == REPEAT and length != 1:
                    raise RV565Error("repeat frame %d has a body" % i)
                if kind in (KEYFRAME, DELTA) and h.codec == "stored" and length - 1 != size:
                    raise RV565Error("stored frame %d has %d bytes, expected %d"
                                     % (i, length - 1, size))
                if kind == PARTIAL:
                    lines, line_bytes = frame_lines(h.pixel_format, h.width, h.height)
                    _, _, _, start, want = _partial_layout(
                        self.data[offset + 1:offset + length], lines, line_bytes)
                    if h.codec == "stored" and length - 1 - start != want:
                        raise RV565Error("stored partial frame %d has %d bytes, expected %d"
                                         % (i, length - 1 - start, want))
                if kind == REGION:
                    lines, line_bytes = frame_lines(h.pixel_format, h.width, h.height)
                    _, _, _, _, start, want = _region_layout(
                        self.data[offset + 1:offset + length], lines, line_bytes,
                        _ALIGN[h.pixel_format])
                    if h.codec == "stored" and length - 1 - start != want:
                        raise RV565Error("stored region frame %d has %d bytes, expected %d"
                                         % (i, length - 1 - start, want))
            offsets.append((kind, body, offset + length - body))
            offset += length
        if offset != len(self.data):
            raise RV565Error("trailing bytes after the last frame")
        self._index = offsets
        self._last = None  # (index, decoded frame) for sequential decoding

    width = property(lambda self: self.header.width)
    height = property(lambda self: self.header.height)
    fps = property(lambda self: self.header.fps)
    pixel_format = property(lambda self: self.header.pixel_format)

    def __len__(self):
        return self.header.frames

    def frame_type(self, i):
        """'key', 'delta', 'repeat', 'partial' or 'region'."""
        return FRAME_TYPES[self._index[self._check(i)][0]]

    def payload_sizes(self):
        """Body length of every frame (0 for repeats), in order."""
        return [length for _, _, length in self._index]

    def payload(self, i):
        """The encoded body of frame i (empty for a repeat)."""
        _, offset, length = self._index[self._check(i)]
        return self.data[offset:offset + length]

    def _decode_data(self, i, data, size):
        if self.header.codec == "stored":
            return data
        try:
            out = zlib.decompress(data)
        except zlib.error as exc:
            raise RV565Error("frame %d does not inflate: %s" % (i, exc)) from None
        if len(out) != size:
            raise RV565Error("frame %d inflates to %d bytes, expected %d" % (i, len(out), size))
        return out

    def changed_lines(self, i):
        """Line ranges (first, count) that frame i changes, so a player knows
        what to send to the display: everything for a keyframe or delta,
        nothing for a repeat, the changed bands (merged into runs) for a
        partial delta. Lines are pixel rows, or pages of 8 rows for mono_vpage."""
        h = self.header
        lines, line_bytes = frame_lines(h.pixel_format, h.width, h.height)
        kind = self._index[self._check(i)][0]
        if kind == REPEAT:
            return []
        if kind not in (PARTIAL, REGION):
            return [(0, lines)]
        if kind == REGION:
            band, changed = _region_layout(self.payload(i), lines, line_bytes,
                                           _ALIGN[h.pixel_format])[:2]
        else:
            band, changed, _, _, _ = _partial_layout(self.payload(i), lines, line_bytes)
        runs = []
        for b in changed:
            first, end = b * band, min(lines, (b + 1) * band)
            if runs and runs[-1][0] + runs[-1][1] == first:
                runs[-1] = (runs[-1][0], end - runs[-1][0])
            else:
                runs.append((first, end - first))
        return runs

    def changed_rects(self, i):
        """Rectangles (first line, line count, first byte, byte count) that
        frame i changes, one per changed band for a partial or region delta,
        the whole frame for a keyframe or delta, none for a repeat. A player
        sends each to the display as one window; byte ranges start and end
        on whole pixels."""
        h = self.header
        lines, line_bytes = frame_lines(h.pixel_format, h.width, h.height)
        kind = self._index[self._check(i)][0]
        if kind == REPEAT:
            return []
        if kind == REGION:
            band, changed, _, ranges, _, _ = _region_layout(
                self.payload(i), lines, line_bytes, _ALIGN[h.pixel_format])
            return [(b * band, min(lines, (b + 1) * band) - b * band, x0, xw)
                    for b, (x0, xw) in zip(changed, ranges)]
        return [(first, count, 0, line_bytes) for first, count in self.changed_lines(i)]

    def _body(self, i):
        body, size = self.payload(i), self.header.frame_bytes
        if self.header.codec == "stored":
            return body
        try:
            out = zlib.decompress(body)
        except zlib.error as exc:
            raise RV565Error("frame %d does not inflate: %s" % (i, exc)) from None
        if len(out) != size:
            raise RV565Error("frame %d inflates to %d bytes, expected %d" % (i, len(out), size))
        return out

    def _apply(self, i, prev):
        kind = self._index[i][0]
        if kind == KEYFRAME:
            return self._body(i)
        if kind == REPEAT:
            return prev
        if kind == PARTIAL:
            h = self.header
            lines, line_bytes = frame_lines(h.pixel_format, h.width, h.height)
            body = self.payload(i)
            band, changed, shifts, start, size = _partial_layout(body, lines, line_bytes)
            data = self._decode_data(i, body[start:], size)
            out, pos = bytearray(prev), 0
            for b, (dx, dy) in zip(changed, shifts):
                first, end = b * band, min(lines, (b + 1) * band)
                lo, hi = first * line_bytes, end * line_bytes
                out[lo:hi] = _xor(_predict(prev, first, end, line_bytes, dx, dy),
                                  data[pos:pos + hi - lo])
                pos += hi - lo
            return bytes(out)
        if kind == REGION:
            h = self.header
            lines, line_bytes = frame_lines(h.pixel_format, h.width, h.height)
            body = self.payload(i)
            band, changed, shifts, ranges, start, size = _region_layout(
                body, lines, line_bytes, _ALIGN[h.pixel_format])
            data = self._decode_data(i, body[start:], size)
            out, pos = bytearray(prev), 0
            for b, (dx, dy), (x0, xw) in zip(changed, shifts, ranges):
                first, end = b * band, min(lines, (b + 1) * band)
                pred = _predict(prev, first, end, line_bytes, dx, dy)
                for y in range(first, end):
                    o = (y - first) * line_bytes + x0
                    res = data[pos:pos + xw]
                    out[y * line_bytes + x0:y * line_bytes + x0 + xw] = _xor(pred[o:o + xw], res)
                    pos += xw
            return bytes(out)
        return _xor(prev, self._body(i))

    def frame(self, i):
        """Frame i as bytes in the clip's pixel format (header.frame_bytes of them)."""
        self._check(i)
        if self._last is not None and self._last[0] in (i, i - 1):
            start, frame = self._last
            if start == i:
                return frame
        else:
            # The latest keyframe at or before i; the interval guarantees one
            # at i - (i mod K), so this looks back at most K - 1 records.
            start = i
            while self._index[start][0] != KEYFRAME:
                start -= 1
            frame = self._body(start)
        for j in range(start + 1, i + 1):
            frame = self._apply(j, frame)
        self._last = (i, frame)
        return frame

    def __iter__(self):
        return (self.frame(i) for i in range(len(self)))

    def verify(self):
        """Decode every frame; raises RV565Error on the first bad one."""
        self._last = None
        for i in range(len(self)):
            self.frame(i)
        return len(self)

    def check_schedule(self, model=None, transfer_us=31312.0, overlap=True):
        """Predict missed deadlines from the payload sizes alone.

        ``transfer_us`` is the display transfer per frame (31312 us is 320x240
        at 40 MHz SPI). With ``overlap`` the next frame inflates on another
        core during the transfer, so frame work is max(transfer, inflate);
        otherwise it is transfer + inflate. Repeats cost nothing to decode.
        """
        model = model or COST_ESP32S3_180x135
        period = 1e6 / self.fps
        sizes = self.payload_sizes()
        decode = [model.predict(s) if s else 0.0 for s in sizes]
        work = [max(transfer_us, d) if overlap else transfer_us + d for d in decode]
        return ScheduleReport(late_frames=sum(w > period for w in work),
                              max_payload=max(sizes), worst_frame_us=max(work),
                              period_us=period)

    def _check(self, i):
        if not 0 <= i < len(self):
            raise IndexError("frame %d out of range (0-%d)" % (i, len(self) - 1))
        return i


@dataclass(frozen=True)
class CostModel:
    """T_inflate(L) = intercept_us + slope_us_per_byte * L."""
    intercept_us: float
    slope_us_per_byte: float

    def predict(self, payload_len):
        return self.intercept_us + self.slope_us_per_byte * payload_len


@dataclass(frozen=True)
class ScheduleReport:
    late_frames: int
    max_payload: int
    worst_frame_us: float
    period_us: float


# Pooled fit from the RV565 paper: ESP32-S3 at 240 MHz, ROM tinfl, 180x135
# frames. Refit for other chips, clocks or frame sizes.
COST_ESP32S3_180x135 = CostModel(4858.0, 0.1515)

# Pooled fit on a Raspberry Pi Pico 2: RP2350 at 150 MHz, bundled tinfl, clip in
# XIP flash, 180x135 frames (docs/RESULTS_RP2350.md in the library repository).
COST_RP2350_180x135 = CostModel(8108.1, 0.2446)


def open(source):  # noqa: A001 - mirrors the module-level open() idiom
    """Open an RV565 file from a path, bytes, or a binary file object."""
    if isinstance(source, (bytes, bytearray, memoryview)):
        return Clip(source)
    if hasattr(source, "read"):
        return Clip(source.read())
    return Clip(Path(source).read_bytes())


def _encode(data, codec, level):
    return bytes(data) if codec == "stored" else zlib.compress(bytes(data), level)


def _shift_steps(fmt, motion_range):
    """(step, max) of the horizontal shift search, in bytes."""
    m = motion_range
    return {"rgb565be": (2, 2 * m), "rgb565le": (2, 2 * m), "rgb666": (3, 3 * m),
            "rgb888": (3, 3 * m), "rgb444": (3, 3 * (m // 2)), "gray8": (1, m),
            "gray4": (1, m // 2), "mono": (1, m // 8), "mono_vpage": (1, m)}[fmt]


def _alternating(limit, step=1):
    yield 0
    for k in range(step, limit + 1, step):
        yield -k
        yield k


def _nonzero(data):
    return len(data) - data.count(0)


def _partial_body(frame, prev, lines, line_bytes, band, codec, level, fmt="rgb565be",
                  motion_range=0):
    """Body of a partial delta (None if no band changed or the band height
    does not fit in a byte). With a motion range, each changed band gets the
    first shift (in the documented search order) with the fewest nonzero
    residual bytes."""
    if not 1 <= band <= 255:
        return None
    count = (lines + band - 1) // band
    mask = bytearray((count + 7) // 8)
    shifts, parts = bytearray(), []
    step, max_dx = _shift_steps(fmt, motion_range) if motion_range else (1, 0)
    max_dy = min(band - 1, 127) if motion_range else 0
    max_dx = min(max_dx, 127 - 127 % step)
    for b in range(count):
        first, end = b * band, min(lines, (b + 1) * band)
        lo, hi = first * line_bytes, end * line_bytes
        cur = frame[lo:hi]
        if cur == prev[lo:hi]:
            continue
        mask[b >> 3] |= 1 << (b & 7)
        best = _xor(cur, prev[lo:hi])
        best_cost, best_shift = _nonzero(best), (0, 0)
        if best_cost and (max_dx or max_dy):
            for dy in _alternating(min(max_dy, end - first - 1)):
                for dx in _alternating(max_dx, step):
                    if dx == 0 and dy == 0:
                        continue
                    res = _xor(cur, _predict(prev, first, end, line_bytes, dx, dy))
                    cost = _nonzero(res)
                    if cost < best_cost:
                        best, best_cost, best_shift = res, cost, (dx, dy)
                        if cost == 0:
                            break
                if best_cost == 0:
                    break
        shifts += bytes((best_shift[0] & 0xFF, best_shift[1] & 0xFF))
        parts.append(best)
    if not parts:
        return None
    return bytes((band,)) + bytes(mask) + bytes(shifts) + _encode(b"".join(parts), codec, level)


def _changed_range(cur, old, rows, line_bytes, align):
    """(x0, xw): the bytes of a band's lines that differ, widened to whole
    pixels, or None if none do."""
    lo, hi = line_bytes, -1
    for r in range(rows):
        a = cur[r * line_bytes:(r + 1) * line_bytes]
        b = old[r * line_bytes:(r + 1) * line_bytes]
        if a == b:
            continue
        i = 0
        while a[i] == b[i]:
            i += 1
        j = line_bytes - 1
        while a[j] == b[j]:
            j -= 1
        lo, hi = min(lo, i), max(hi, j)
    if hi < 0:
        return None
    x0 = lo - lo % align
    x1 = min(line_bytes, hi + 1 + (-(hi + 1)) % align)
    return x0, x1 - x0


def _crop(data, rows, line_bytes, x0, xw):
    return b"".join(data[r * line_bytes + x0:r * line_bytes + x0 + xw] for r in range(rows))


def _region_body(frame, prev, lines, line_bytes, band, codec, level, fmt="rgb565be",
                 motion_range=0):
    """Body of a region delta (None if no band changed or the band height
    does not fit in a byte): like a partial delta, but each changed band
    stores only the range of bytes along its lines that changed. With a
    motion range, each band gets the first shift (in the documented search
    order) with the fewest nonzero residual bytes inside its range."""
    if not 1 <= band <= 255:
        return None
    align = _ALIGN[fmt]
    count = (lines + band - 1) // band
    mask = bytearray((count + 7) // 8)
    entries, parts, narrower = bytearray(), [], False
    step, max_dx = _shift_steps(fmt, motion_range) if motion_range else (1, 0)
    max_dy = min(band - 1, 127) if motion_range else 0
    max_dx = min(max_dx, 127 - 127 % step)
    for b in range(count):
        first, end = b * band, min(lines, (b + 1) * band)
        lo, hi = first * line_bytes, end * line_bytes
        cur, old = frame[lo:hi], prev[lo:hi]
        if cur == old:
            continue
        rows = end - first
        x0, xw = _changed_range(cur, old, rows, line_bytes, align)
        # x0 and xw are stored as unsigned 16-bit fields. A range that does
        # not fit (lines wider than 65535 bytes) can't be a region delta; the
        # caller falls back to a partial delta or a keyframe.
        if x0 > 0xFFFF or xw > 0xFFFF:
            return None
        mask[b >> 3] |= 1 << (b & 7)
        cur_c = _crop(cur, rows, line_bytes, x0, xw)
        best = _xor(cur_c, _crop(old, rows, line_bytes, x0, xw))
        best_cost, best_shift = _nonzero(best), (0, 0)
        if best_cost and (max_dx or max_dy):
            for dy in _alternating(min(max_dy, rows - 1)):
                for dx in _alternating(max_dx, step):
                    if dx == 0 and dy == 0:
                        continue
                    pred = _predict(prev, first, end, line_bytes, dx, dy)
                    res = _xor(cur_c, _crop(pred, rows, line_bytes, x0, xw))
                    cost = _nonzero(res)
                    if cost < best_cost:
                        best, best_cost, best_shift = res, cost, (dx, dy)
                        if cost == 0:
                            break
                if best_cost == 0:
                    break
        entries += bytes((best_shift[0] & 0xFF, best_shift[1] & 0xFF))
        entries += struct.pack("<HH", x0, xw)
        parts.append(best)
        narrower = narrower or xw < line_bytes
    # Every band changed across its whole width: a partial delta says the
    # same in fewer bytes, and keeps the file readable by version 7 players.
    if not parts or not narrower:
        return None
    return bytes((band,)) + bytes(mask) + bytes(entries) + _encode(b"".join(parts), codec, level)


def _apply_tolerance(frame, prev, width, height, fmt, tolerance):
    """Keep each pixel of prev where every channel of frame, in 8 bits, is
    within tolerance of it. Returns the frame the decoder will show."""
    new = to_rgb888(frame, width, height, fmt)
    old = to_rgb888(prev, width, height, fmt)
    try:
        import numpy as np
    except ImportError:
        np = None
    if np is not None:
        a = np.frombuffer(new, np.uint8).reshape(-1, 3).astype(np.int16)
        b = np.frombuffer(old, np.uint8).reshape(-1, 3).astype(np.int16)
        keep = (np.abs(a - b) <= tolerance).all(axis=1)
        mixed = np.where(keep[:, None], b, a).astype(np.uint8).tobytes()
    else:
        out = bytearray(new)
        for p in range(0, len(new), 3):
            if abs(new[p] - old[p]) <= tolerance and abs(new[p + 1] - old[p + 1]) <= tolerance \
                    and abs(new[p + 2] - old[p + 2]) <= tolerance:
                out[p:p + 3] = old[p:p + 3]
        mixed = bytes(out)
    return convert(mixed, width, height, fmt)


def encode_frames(frames, width, height, level=1, pixel_format="rgb565be", codec="zlib",
                  keyframe_interval=1, band_lines=BAND_LINES, tolerance=0,
                  motion_range=MOTION_RANGE, regions=True):
    """Yield (frame type, body) for each frame, already in ``pixel_format``.

    Frames at multiples of ``keyframe_interval`` are keyframes; any other frame
    is a repeat when it equals the previous one, else the smallest of a
    partial delta (bands of ``band_lines`` lines; 0 disables them), a delta
    and a keyframe. ``level`` is the zlib level (1 is what the paper
    measured). ``tolerance`` (0-255, default 0: lossless) keeps a pixel of
    the previous decoded frame where every channel is within it, in 8 bits.
    ``motion_range`` (pixels, 0 turns it off) bounds the per-band shift search
    of partial deltas. ``regions`` (version 8) lets a changed band store only
    the range of each line that changed (region deltas); a file that uses
    them must be written as version 8.
    """
    size = frame_size(pixel_format, width, height)
    fmt = PIXEL_FORMATS[_format_index(pixel_format)]
    codec = CODECS[_codec_index(codec)]
    lines, line_bytes = frame_lines(fmt, width, height)
    if keyframe_interval < 1 or keyframe_interval > 255:
        raise RV565Error("keyframe interval must be 1-255")
    if not 0 <= tolerance <= 255:
        raise RV565Error("tolerance must be 0-255")
    prev = None
    for i, frame in enumerate(frames):
        frame = bytes(frame)
        if len(frame) != size:
            raise RV565Error("frame %d has %d bytes, expected %d" % (i, len(frame), size))
        if tolerance and prev is not None:
            frame = _apply_tolerance(frame, prev, width, height, fmt, tolerance)
        if i % keyframe_interval == 0:
            yield KEYFRAME, _encode(frame, codec, level)
        elif frame == prev:
            yield REPEAT, b""
        else:
            options = [(KEYFRAME, _encode(frame, codec, level))]
            if codec != "stored":
                options.append((DELTA, _encode(_xor(frame, prev), codec, level)))
            if band_lines:
                partial = _partial_body(frame, prev, lines, line_bytes, band_lines, codec, level,
                                        fmt, motion_range)
                if partial is not None:
                    options.append((PARTIAL, partial))
                if regions:
                    region = _region_body(frame, prev, lines, line_bytes, band_lines, codec,
                                          level, fmt, motion_range)
                    if region is not None:
                        options.append((REGION, region))
            # The smallest body, except that a region delta, then a partial
            # delta, wins whenever it is at most 2% (and at least 16 bytes)
            # larger: they save the display transfer of everything unchanged,
            # which on these boards costs more than a few bytes of inflate.
            best = min(options, key=lambda o: (len(o[1]), o[0] != DELTA))
            for kind in (REGION, PARTIAL):
                pick = [o for o in options if o[0] == kind]
                if pick and len(pick[0][1]) <= len(best[1]) + max(16, len(best[1]) // 50):
                    best = pick[0]
                    break
            yield best
        prev = frame


def write(target, width, height, fps, frames, level=1, *, pixel_format="rgb565be",
          codec="zlib", keyframe_interval=1, version=None, band_lines=BAND_LINES,
          tolerance=0, motion_range=MOTION_RANGE):
    """Write frames (an iterable of bytes in ``pixel_format``) as an RV565 file.

    ``target`` is a path or a seekable binary file object. By default the
    file is version 8 if it uses region deltas and version 7 otherwise, so
    players older than RV565 3.0 read every file that doesn't need them.
    ``version=7`` never writes region deltas (for RV565 2.x players);
    ``version=6`` writes a version 6 file for players older than RV565 2.0;
    it allows only rgb565be, zlib and keyframe_interval 1 (and so no partial
    deltas).
    ``band_lines``, ``tolerance`` and ``motion_range`` are passed to
    encode_frames. Returns the
    number of frames.
    """
    if not (0 < width <= 0xFFFF and 0 < height <= 0xFFFF):
        raise RV565Error("size %dx%d out of range" % (width, height))
    fmt, cod = _format_index(pixel_format), _codec_index(codec)
    if version == VERSION_6:
        if (fmt, cod, keyframe_interval) != (0, 1, 1):
            raise RV565Error("version 6 supports only rgb565be, zlib, keyframe_interval 1")
        if not 1 <= fps <= MAX_FPS_V6:
            raise RV565Error("fps must be 1-%d" % MAX_FPS_V6)
    elif version in (None, VERSION, VERSION_8):
        if not 1 <= fps <= MAX_FPS:
            raise RV565Error("fps must be 1-%d" % MAX_FPS)
    else:
        raise RV565Error("can write version 6, 7 or 8, not %r" % (version,))
    if hasattr(target, "write"):
        return _write(target, width, height, fps, frames, level, fmt, cod,
                      keyframe_interval, version, band_lines, tolerance, motion_range)
    with Path(target).open("wb") as out:
        return _write(out, width, height, fps, frames, level, fmt, cod,
                      keyframe_interval, version, band_lines, tolerance, motion_range)


def _write(out, width, height, fps, frames, level, fmt, codec, interval, version,
           band_lines=BAND_LINES, tolerance=0, motion_range=MOTION_RANGE):
    start = out.tell()
    if version == VERSION_6:
        out.write(HEADER_V6.pack(MAGIC, version, width, height, fps, 0, 0))
    else:
        out.write(HEADER.pack(MAGIC, version or VERSION, width, height, fps, 0, 0,
                              HEADER.size, fmt, codec, interval))
    count, used_regions = 0, False
    for kind, body in encode_frames(frames, width, height, level, fmt, codec, interval,
                                    band_lines, tolerance, motion_range,
                                    regions=version in (None, VERSION_8)):
        used_regions = used_regions or kind == REGION
        count += 1
        if count > MAX_FRAMES:
            raise RV565Error("more than %d frames" % MAX_FRAMES)
        if version == VERSION_6:
            out.write(LENGTH.pack(len(body)))
        else:
            out.write(LENGTH.pack(len(body) + 1))
            out.write(bytes((kind,)))
        out.write(body)
    if count == 0:
        raise RV565Error("no frames")
    end = out.tell()
    if version is None and used_regions:
        out.seek(start + 3)
        out.write(bytes((VERSION_8,)))
    out.seek(start + 10)
    out.write(struct.pack("<H", count))
    out.seek(end)
    return count


# Pixel conversion -----------------------------------------------------------

_R5 = bytes(v & 0xF8 for v in range(256))
_G_HI = bytes(v >> 5 for v in range(256))
_G_LO = bytes((v & 0x1C) << 3 for v in range(256))
_B5 = bytes(v >> 3 for v in range(256))


def _or_bytes(a, b):
    return (int.from_bytes(a, "big") | int.from_bytes(b, "big")).to_bytes(len(a), "big")


def rgb888_to_rgb565be(rgb):
    """Convert packed RGB888 bytes to RGB565 big-endian bytes."""
    rgb = bytes(rgb)
    if len(rgb) % 3:
        raise RV565Error("RGB data length is not a multiple of 3")
    r, g, b = rgb[0::3], rgb[1::3], rgb[2::3]
    hi = _or_bytes(r.translate(_R5), g.translate(_G_HI))
    lo = _or_bytes(g.translate(_G_LO), b.translate(_B5))
    out = bytearray(2 * len(r))
    out[0::2] = hi
    out[1::2] = lo
    return bytes(out)


def _expand(bits):
    top = (1 << bits) - 1
    return [(v * 255 + top // 2) // top for v in range(1 << bits)]


_E5, _E6 = _expand(5), _expand(6)
_HI_R = bytes(_E5[v >> 3] for v in range(256))
_LO_B = bytes(_E5[v & 0x1F] for v in range(256))
_HI_G = bytes((v & 0x07) << 3 for v in range(256))
_LO_G = bytes(v >> 5 for v in range(256))
_G6 = bytes(_E6[v & 0x3F] for v in range(256))


def rgb565be_to_rgb888(data):
    """Convert RGB565 big-endian bytes to packed RGB888 bytes."""
    data = bytes(data)
    if len(data) % 2:
        raise RV565Error("RGB565 data length is odd")
    hi, lo = data[0::2], data[1::2]
    r = hi.translate(_HI_R)
    b = lo.translate(_LO_B)
    g = _or_bytes(hi.translate(_HI_G), lo.translate(_LO_G)).translate(_G6)
    out = bytearray(3 * len(hi))
    out[0::3], out[1::3], out[2::3] = r, g, b
    return bytes(out)


# Every pixel format -----------------------------------------------------------

def _luma(r, g, b):
    return (299 * r + 587 * g + 114 * b + 500) // 1000


def convert(rgb, width, height, pixel_format):
    """Convert packed RGB888 bytes (width * height pixels) to one frame in
    ``pixel_format``, with the conversions in docs/FORMAT.md, Writing."""
    rgb = bytes(rgb)
    if len(rgb) != 3 * width * height:
        raise RV565Error("expected %d RGB bytes, got %d" % (3 * width * height, len(rgb)))
    fmt = PIXEL_FORMATS[_format_index(pixel_format)]
    if fmt == "rgb565be":
        return rgb888_to_rgb565be(rgb)
    if fmt == "rgb565le":
        be = rgb888_to_rgb565be(rgb)
        out = bytearray(len(be))
        out[0::2], out[1::2] = be[1::2], be[0::2]
        return bytes(out)
    if fmt == "rgb888":
        return rgb
    if fmt == "rgb666":
        return rgb.translate(bytes(v & 0xFC for v in range(256)))
    out = bytearray(frame_size(fmt, width, height))
    if fmt == "rgb444":
        stride = row_bytes(fmt, width)
        for y in range(height):
            nibbles = []
            for x in range(width):
                p = 3 * (y * width + x)
                nibbles += (rgb[p] >> 4, rgb[p + 1] >> 4, rgb[p + 2] >> 4)
            if len(nibbles) % 2:
                nibbles.append(0)
            for k in range(0, len(nibbles), 2):
                out[y * stride + k // 2] = (nibbles[k] << 4) | nibbles[k + 1]
        return bytes(out)
    lum = bytes(_luma(rgb[p], rgb[p + 1], rgb[p + 2]) for p in range(0, len(rgb), 3))
    if fmt == "gray8":
        return lum
    if fmt == "gray4":
        stride = row_bytes(fmt, width)
        for y in range(height):
            for x in range(width):
                v = lum[y * width + x] >> 4
                out[y * stride + x // 2] |= v << 4 if x % 2 == 0 else v
        return bytes(out)
    if fmt == "mono":
        stride = row_bytes(fmt, width)
        for y in range(height):
            for x in range(width):
                if lum[y * width + x] >= 128:
                    out[y * stride + x // 8] |= 0x80 >> (x % 8)
        return bytes(out)
    # mono_vpage
    for y in range(height):
        for x in range(width):
            if lum[y * width + x] >= 128:
                out[(y // 8) * width + x] |= 1 << (y % 8)
    return bytes(out)


def to_rgb888(frame, width, height, pixel_format):
    """Convert one frame in ``pixel_format`` to packed RGB888 bytes, for
    previews and tools. Channels with fewer bits are scaled to 0-255."""
    frame = bytes(frame)
    fmt = PIXEL_FORMATS[_format_index(pixel_format)]
    if len(frame) != frame_size(fmt, width, height):
        raise RV565Error("expected %d bytes, got %d"
                         % (frame_size(fmt, width, height), len(frame)))
    if fmt == "rgb565be":
        return rgb565be_to_rgb888(frame)
    if fmt == "rgb565le":
        be = bytearray(len(frame))
        be[0::2], be[1::2] = frame[1::2], frame[0::2]
        return rgb565be_to_rgb888(be)
    if fmt == "rgb888":
        return frame
    if fmt == "rgb666":
        return frame.translate(bytes(_E6[v >> 2] for v in range(256)))
    out = bytearray(3 * width * height)
    stride = row_bytes(fmt, width) if fmt != "mono_vpage" else 0
    for y in range(height):
        for x in range(width):
            p = 3 * (y * width + x)
            if fmt == "rgb444":
                n = 3 * x
                nib = [(frame[y * stride + (n + k) // 2] >> (4 if (n + k) % 2 == 0 else 0)) & 0xF
                       for k in range(3)]
                out[p:p + 3] = bytes(v * 17 for v in nib)
                continue
            if fmt == "gray8":
                v = frame[y * width + x]
            elif fmt == "gray4":
                b = frame[y * stride + x // 2]
                v = ((b >> 4) if x % 2 == 0 else (b & 0xF)) * 17
            elif fmt == "mono":
                v = 255 if frame[y * stride + x // 8] & (0x80 >> (x % 8)) else 0
            else:  # mono_vpage
                v = 255 if frame[(y // 8) * width + x] & (1 << (y % 8)) else 0
            out[p:p + 3] = bytes((v, v, v))
    return bytes(out)
