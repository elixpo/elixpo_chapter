"""RV565: frame-independent RGB565 video files.

Read, write and check RV565 files (container version 6), the format played by
the RV565 microcontroller library (arXiv:2610.35935):

    import rv565

    clip = rv565.open("clip.rv565")
    print(clip.width, clip.height, clip.fps, len(clip))
    frame = clip.frame(0)          # bytes, RGB565 big-endian

    rv565.write("out.rv565", 180, 135, 24, frames)

With Pillow installed (``pip install rv565[pillow]``), ``import rv565.pillow``
lets ``PIL.Image`` open and save RV565 files as animations.
"""

import struct
import zlib
from dataclasses import dataclass
from pathlib import Path

__all__ = [
    "RV565Error", "Header", "Clip", "CostModel", "ScheduleReport",
    "COST_ESP32S3_180x135", "open", "write", "encode_frames",
    "rgb888_to_rgb565be", "rgb565be_to_rgb888",
]

__version__ = "1.1.0"

MAGIC = b"RV5"
VERSION = 6
MAX_FPS = 30
MAX_FRAMES = 0xFFFF
HEADER = struct.Struct("<3sBHHBBH")  # magic, version, width, height, fps, flags, frames
LENGTH = struct.Struct("<I")


class RV565Error(ValueError):
    """The data is not a valid RV565 file, or an argument is out of range."""


@dataclass(frozen=True)
class Header:
    width: int
    height: int
    fps: int
    flags: int
    frames: int

    @property
    def frame_bytes(self):
        """Decoded size of one frame: 2 * width * height."""
        return 2 * self.width * self.height

    @property
    def duration(self):
        """Length in seconds."""
        return self.frames / self.fps


def parse_header(data):
    """Parse and range-check the 12-byte header."""
    if len(data) < HEADER.size:
        raise RV565Error("file too short")
    magic, version, width, height, fps, flags, frames = HEADER.unpack_from(data)
    if magic != MAGIC:
        raise RV565Error("not an RV565 file")
    if version != VERSION:
        raise RV565Error("unsupported RV565 version %d" % version)
    if not (width and height and 1 <= fps <= MAX_FPS and frames):
        raise RV565Error("invalid header")
    return Header(width, height, fps, flags, frames)


class Clip:
    """An RV565 file held in memory, with an O(1) frame index.

    The whole container is validated on open: every length must be nonzero and
    inside the data, and nothing may follow the last frame.
    """

    def __init__(self, data):
        self.data = bytes(data)
        self.header = parse_header(self.data)
        offsets, offset = [], HEADER.size
        for i in range(self.header.frames):
            if len(self.data) - offset < LENGTH.size:
                raise RV565Error("truncated frame table at frame %d" % i)
            (length,) = LENGTH.unpack_from(self.data, offset)
            offset += LENGTH.size
            if length == 0 or len(self.data) - offset < length:
                raise RV565Error("invalid length for frame %d" % i)
            offsets.append((offset, length))
            offset += length
        if offset != len(self.data):
            raise RV565Error("trailing bytes after the last frame")
        self._index = offsets

    width = property(lambda self: self.header.width)
    height = property(lambda self: self.header.height)
    fps = property(lambda self: self.header.fps)

    def __len__(self):
        return self.header.frames

    def payload_sizes(self):
        """Compressed length of every frame, in order."""
        return [length for _, length in self._index]

    def payload(self, i):
        """The zlib payload of frame i."""
        offset, length = self._index[self._check(i)]
        return self.data[offset:offset + length]

    def frame(self, i):
        """Frame i as RGB565 big-endian bytes (2 * width * height of them)."""
        try:
            frame = zlib.decompress(self.payload(i))
        except zlib.error as exc:
            raise RV565Error("frame %d does not inflate: %s" % (i, exc)) from None
        if len(frame) != self.header.frame_bytes:
            raise RV565Error("frame %d inflates to %d bytes, expected %d"
                             % (i, len(frame), self.header.frame_bytes))
        return frame

    def __iter__(self):
        return (self.frame(i) for i in range(len(self)))

    def verify(self):
        """Inflate every frame; raises RV565Error on the first bad one."""
        for i in range(len(self)):
            self.frame(i)
        return len(self)

    def check_schedule(self, model=None, transfer_us=31312.0, overlap=True):
        """Predict missed deadlines from the payload sizes alone.

        ``transfer_us`` is the display transfer per frame (31312 us is 320x240
        at 40 MHz SPI). With ``overlap`` the next frame inflates on another
        core during the transfer, so frame work is max(transfer, inflate);
        otherwise it is transfer + inflate.
        """
        model = model or COST_ESP32S3_180x135
        period = 1e6 / self.fps
        sizes = self.payload_sizes()
        work = [max(transfer_us, model.predict(s)) if overlap else transfer_us + model.predict(s)
                for s in sizes]
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


def open(source):  # noqa: A001 - mirrors the module-level open() idiom
    """Open an RV565 file from a path, bytes, or a binary file object."""
    if isinstance(source, (bytes, bytearray, memoryview)):
        return Clip(source)
    if hasattr(source, "read"):
        return Clip(source.read())
    return Clip(Path(source).read_bytes())


def encode_frames(frames, width, height, level=1):
    """Yield the zlib payload of each RGB565BE frame (level 1 is what the
    paper measured; higher levels give smaller files, slower to encode)."""
    frame_bytes = 2 * width * height
    for i, frame in enumerate(frames):
        if len(frame) != frame_bytes:
            raise RV565Error("frame %d has %d bytes, expected %d" % (i, len(frame), frame_bytes))
        yield zlib.compress(bytes(frame), level)


def write(target, width, height, fps, frames, level=1):
    """Write RGB565BE frames (an iterable of bytes) as an RV565 file.

    ``target`` is a path or a seekable binary file object. Returns the number
    of frames written.
    """
    if not (0 < width <= 0xFFFF and 0 < height <= 0xFFFF):
        raise RV565Error("size %dx%d out of range" % (width, height))
    if not 1 <= fps <= MAX_FPS:
        raise RV565Error("fps must be 1-%d" % MAX_FPS)
    if hasattr(target, "write"):
        return _write(target, width, height, fps, frames, level)
    with Path(target).open("wb") as out:
        return _write(out, width, height, fps, frames, level)


def _write(out, width, height, fps, frames, level):
    start = out.tell()
    out.write(HEADER.pack(MAGIC, VERSION, width, height, fps, 0, 0))
    count = 0
    for payload in encode_frames(frames, width, height, level):
        count += 1
        if count > MAX_FRAMES:
            raise RV565Error("more than %d frames" % MAX_FRAMES)
        out.write(LENGTH.pack(len(payload)))
        out.write(payload)
    if count == 0:
        raise RV565Error("no frames")
    end = out.tell()
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
