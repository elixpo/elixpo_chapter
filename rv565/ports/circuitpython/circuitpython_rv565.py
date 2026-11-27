# SPDX-FileCopyrightText: 2026 Ayushman Bhattacharya
# SPDX-License-Identifier: MIT
"""
`circuitpython_rv565`
================================================================================

Play RV565 video files on CircuitPython displays.

RV565 (https://github.com/elixpo/rv565, arXiv:2610.35935) stores video as
frames whose decoded bytes are already in the display's native pixel format.
This module reads format version 8 (region deltas), version 7 (nine pixel
formats, stored or zlib frames, keyframes, XOR deltas, partial deltas and
repeats) and version 6 (big-endian RGB565, zlib, every frame a keyframe), and
shows clips with ``displayio``
(:class:`Player`) or straight over an ST7789's bus (:class:`DirectPlayer`).

This is the easy route, not the fast one: the C library plays 24 FPS with
dual-core decoding, while this pure-Python reader inflates with CircuitPython's
``zlib`` and draws through ``displayio``, so expect a few frames per second.
Frames that fall behind are skipped, so a clip still plays at its own speed.

* Author: Ayushman Bhattacharya

Implementation Notes
--------------------

**Hardware:**

* Any CircuitPython board whose build includes ``zlib`` (most ESP32-S3 and
  RP2350 boards; clips with the stored codec need no ``zlib``), with a
  display such as an ST7789.

**Software and Dependencies:**

* CircuitPython firmware: https://circuitpython.org/downloads
* ``zlib``, ``displayio`` and ``bitmaptools`` built-in modules
"""

import struct

try:
    from zlib import decompress as _zlib_decompress
except ImportError:  # boards built without zlib
    _zlib_decompress = None

try:
    from time import monotonic_ns as _monotonic_ns
except ImportError:  # boards without long integers
    _monotonic_ns = None

__version__ = "3.0.0"
__repo__ = "https://github.com/elixpo/rv565.git"

MAGIC = b"RV5"
VERSION = 7
VERSION_6 = 6
VERSION_8 = 8  # version 7 plus region deltas (frame type 4)
MAX_FPS = 60
MAX_FPS_V6 = 30
HEADER_SIZE = 16  # version 7 and 8 header as written; version 6 has 12 bytes
HEADER_SIZE_V6 = 12
_HEADER_V6 = "<3sBHHBBH"  # magic, version, width, height, fps, flags, frames
_HEADER_V7 = "<BBBB"  # header size, pixel format, codec, keyframe interval
_LENGTH = "<I"

# Pixel formats and codecs by value (docs/FORMAT.md).
PIXEL_FORMATS = (
    "rgb565be",
    "rgb565le",
    "rgb444",
    "rgb666",
    "rgb888",
    "gray8",
    "gray4",
    "mono",
    "mono_vpage",
)
CODECS = ("stored", "zlib")
STORED = 0
ZLIB = 1
KEYFRAME = 0
DELTA = 1
REPEAT = 2
PARTIAL = 3
REGION = 4
FRAME_TYPES = ("key", "delta", "repeat", "partial", "region")

# Region deltas: per pixel format, the alignment A of a byte range (ranges
# start on a multiple of A and end on one or at the end of the line) and the
# pixels in A bytes (columns, for mono_vpage).
_ALIGN = (2, 2, 3, 3, 3, 1, 1, 1, 1)
_ALIGN_PIXELS = (1, 1, 2, 1, 1, 1, 2, 8, 1)

# ST7789 / ILI9341 commands used by DirectPlayer.
_CASET = 0x2A
_RASET = 0x2B
_RAMWR = 0x2C
_MADCTL = 0x36
_COLMOD = 0x3A

# MADCTL values. CircuitPython rotates displayio in software and never
# changes MADCTL, so after adafruit_st7789's init the controller still
# addresses its RAM as 240 columns x 320 rows (MADCTL 0xC0). DirectPlayer
# writes the controller directly, so for a landscape panel it must turn on
# row/column exchange (MV) itself.
MADCTL_LANDSCAPE = 0x60  # MV | MX: what the RV565 C and MicroPython benchmarks use
MADCTL_ADAFRUIT_ST7789 = 0xC0  # adafruit_st7789's last init value (portrait)

# COLMOD values: 16-bit (what adafruit_st7789 sets) and 18-bit pixels.
COLMOD_RGB565 = 0x55
COLMOD_RGB666 = 0x66

_builtin_open = open  # noqa: A001 - this module defines its own open()


class RV565Error(ValueError):
    """The data is not a valid RV565 file, or a frame does not decode."""


def frame_size(pixel_format, width, height):
    """Decoded size in bytes of one frame.

    :param pixel_format: a name from :data:`PIXEL_FORMATS` or its index
    """
    if not isinstance(pixel_format, int):
        if pixel_format not in PIXEL_FORMATS:
            raise RV565Error("unknown pixel format %r" % (pixel_format,))
        pixel_format = PIXEL_FORMATS.index(pixel_format)
    if pixel_format in (0, 1):
        row = 2 * width
    elif pixel_format == 2:
        row = (3 * width + 1) // 2
    elif pixel_format in (3, 4):
        row = 3 * width
    elif pixel_format == 5:
        row = width
    elif pixel_format == 6:
        row = (width + 1) // 2
    elif pixel_format == 7:
        row = (width + 7) // 8
    elif pixel_format == 8:
        return width * ((height + 7) // 8)
    else:
        raise RV565Error("unknown pixel format %r" % (pixel_format,))
    return row * height


def frame_lines(pixel_format, width, height):
    """``(P, R)``: a frame is ``P`` lines of ``R`` bytes, pixel rows for
    formats 0-7 and pages of 8 rows for ``mono_vpage``. Partial deltas divide
    the frame into bands of lines."""
    if not isinstance(pixel_format, int):
        if pixel_format not in PIXEL_FORMATS:
            raise RV565Error("unknown pixel format %r" % (pixel_format,))
        pixel_format = PIXEL_FORMATS.index(pixel_format)
    if pixel_format == 8:
        return (height + 7) // 8, width
    return height, frame_size(pixel_format, width, 1)


def _partial_layout(head, lines, line_bytes, shifts=None, align=0):
    """Parse the start of a partial or region delta body: band height, band
    mask and the entry of each changed band.

    :param head: the body from its start, at least through the band mask
    :param shifts: the bytes after the mask (two per changed band for a
        partial delta, six for a region delta); taken from ``head`` when
        omitted
    :param align: 0 for a partial delta; for a region delta, the pixel
        format's alignment ``A`` in bytes (see :data:`_ALIGN`)
    :return: ``(band, changed, shifts, data_offset, data_size)``: the band
        height, the list of changed band numbers, a ``bytes`` of the entries
        of the changed bands (``dx, dy`` as unsigned bytes, then for a region
        delta ``x0`` and ``xw`` as 16-bit little-endian), where the encoded
        data starts in the body, and how many bytes it decodes to
    """
    name = "region delta" if align else "partial delta"
    step = 6 if align else 2
    if len(head) < 1 or head[0] == 0:
        raise RV565Error("%s with band height 0" % name)
    band = head[0]
    count = (lines + band - 1) // band
    mask_len = (count + 7) // 8
    if len(head) < 1 + mask_len:
        raise RV565Error("%s too short for its band mask" % name)
    changed = []
    for b in range(8 * mask_len):
        if head[1 + (b >> 3)] >> (b & 7) & 1:
            if b >= count:
                raise RV565Error("%s sets a band past the frame" % name)
            changed.append(b)
    if not changed:
        raise RV565Error("%s with no changed band" % name)
    start = 1 + mask_len + step * len(changed)
    if shifts is None:
        shifts = head[1 + mask_len : start]
    if len(shifts) < step * len(changed):
        raise RV565Error(
            "%s too short for its band %s" % (name, "entries" if align else "shifts")
        )
    shifts = bytes(shifts[: step * len(changed)])
    size = 0
    for k, b in enumerate(changed):
        e = step * k
        dy = shifts[e + 1]
        if dy > 127:
            dy -= 256
        if dy >= band or -dy >= band:
            raise RV565Error(
                "%s shifts a band by %d lines, more than it has" % (name, dy)
            )
        end = (b + 1) * band
        rows = (end if end < lines else lines) - b * band
        if not align:
            size += rows * line_bytes
            continue
        x0 = shifts[e + 2] | shifts[e + 3] << 8
        xw = shifts[e + 4] | shifts[e + 5] << 8
        x1 = x0 + xw
        if not xw or x1 > line_bytes or x0 % align or (x1 % align and x1 != line_bytes):
            raise RV565Error(
                "region delta band %d has an invalid range %d+%d" % (b, x0, xw)
            )
        size += rows * xw
    return band, changed, shifts, start, size


def parse_header(data, size=None):
    """Parse and range-check a version 6, 7 or 8 header.

    :param data: the first 16 bytes of the file (12 are enough for version 6)
    :param size: the file's length, to check the header size against
    :return: ``(width, height, fps, flags, frames, version, header_size,
        pixel_format, codec, keyframe_interval)``, the last three as
        indexes into :data:`PIXEL_FORMATS`, :data:`CODECS` and
        ``keyframe_interval`` 1 for version 6
    """
    if size is None:
        size = len(data)
    if len(data) < HEADER_SIZE_V6:
        raise RV565Error("file too short")
    magic, version, width, height, fps, flags, frames = struct.unpack_from(
        _HEADER_V6, data, 0
    )
    if bytes(magic) != MAGIC:
        raise RV565Error("not an RV565 file")
    if version == VERSION_6:
        max_fps = MAX_FPS_V6
    elif version in (VERSION, VERSION_8):
        max_fps = MAX_FPS
    else:
        raise RV565Error("unsupported RV565 version %d" % version)
    if not width or not height:
        raise RV565Error("invalid header: zero width or height")
    if not 1 <= fps <= max_fps:
        raise RV565Error("invalid header: fps %d outside 1-%d" % (fps, max_fps))
    if not frames:
        raise RV565Error("invalid header: no frames")
    if version == VERSION_6:
        return (width, height, fps, flags, frames, version, HEADER_SIZE_V6, 0, 1, 1)
    if len(data) < HEADER_SIZE:
        raise RV565Error("file too short")
    header_size, fmt, codec, interval = struct.unpack_from(_HEADER_V7, data, 12)
    if header_size < HEADER_SIZE or size < header_size:
        raise RV565Error("invalid header size %d" % header_size)
    if fmt >= len(PIXEL_FORMATS):
        raise RV565Error("unsupported pixel format %d" % fmt)
    if codec >= len(CODECS):
        raise RV565Error("unsupported codec %d" % codec)
    if interval == 0:
        raise RV565Error("invalid keyframe interval 0")
    return (width, height, fps, flags, frames, version, header_size, fmt, codec, interval)


def _probe_bigint():
    try:
        return int.from_bytes(bytes(16) + b"\x01", "little") == 1 << 128
    except Exception:  # pylint: disable=broad-except
        return False


# Long integers turn XOR into three C loops (from_bytes, ^, to_bytes) per
# chunk; boards without them fall back to a Python loop per byte.
_BIGINT = _probe_bigint()
_XOR_CHUNK = 2048


def _xor_into(dst, src, dst_off=0, src_off=0, n=None):
    """``dst[dst_off + k] ^= src[src_off + k]`` for ``k`` below ``n`` (default:
    all of ``dst``); ``dst`` is a writable buffer."""
    if n is None:
        n = len(dst) - dst_off
    if _BIGINT:
        dv = memoryview(dst)
        sv = memoryview(src)
        o = 0
        while o < n:
            e = o + _XOR_CHUNK
            e = min(e, n)
            d = dst_off + o
            t = src_off + o
            dv[d : dst_off + e] = (
                int.from_bytes(dv[d : dst_off + e], "little")
                ^ int.from_bytes(sv[t : src_off + e], "little")
            ).to_bytes(e - o, "little")
            o = e
        return
    for k in range(n):
        dst[dst_off + k] ^= src[src_off + k]


class _BytesSource:
    """Random access over bytes already in RAM (no copies)."""

    def __init__(self, data):
        self._view = memoryview(data)
        self.size = len(self._view)

    def read(self, offset, size):
        return self._view[offset : offset + size]

    def readinto(self, offset, buf):
        buf[:] = self._view[offset : offset + len(buf)]

    def close(self):
        pass


class _FileSource:
    """Random access over a file object opened in binary mode."""

    def __init__(self, stream, owned):
        self._stream = stream
        self._owned = owned
        stream.seek(0, 2)
        self.size = stream.tell()

    def read(self, offset, size):
        self._stream.seek(offset)
        return self._stream.read(size)

    def readinto(self, offset, buf):
        self._stream.seek(offset)
        got = self._stream.readinto(buf)
        if got != len(buf):
            raise RV565Error("short read at offset %d" % offset)

    def close(self):
        if self._owned:
            self._stream.close()


class Clip:
    """An RV565 file: header, a lazily built frame index, and frame decoding.

    Use :func:`open` rather than constructing this directly. Only the header
    is read and checked on open; the frame index is built on first use by one
    pass over the record headers (4 bytes of RAM per frame, plus 1 per frame
    for the frame types in versions 7 and 8), which also validates the rest
    of the container: every length is nonzero and inside the file, no bytes
    follow the last record, frame types are known (region deltas only in
    version 8), every ``K``-th frame is a keyframe, repeats have no body,
    partial and region deltas have a valid band height, mask, shifts and
    (region) byte ranges, and stored bodies are exactly one frame (or, for a
    partial or region delta, exactly its changed bands or ranges). Whether zlib data inflates to its
    expected size is checked when it is decoded.

    Decoding keeps one frame buffer of :attr:`frame_bytes` bytes and returns
    it from :meth:`frame`; it is overwritten by the next call.

    :param source: an internal byte source (see :func:`open`)
    :param decompress: function inflating a zlib stream to bytes; defaults to
        the built-in ``zlib.decompress``
    """

    def __init__(self, source, decompress=None):
        self._source = source
        try:
            header = bytes(source.read(0, HEADER_SIZE))
            (
                self.width,
                self.height,
                self.fps,
                self.flags,
                self.frame_count,
                self.version,
                self.header_size,
                self.pixel_format_id,
                self.codec_id,
                self.keyframe_interval,
            ) = parse_header(header, source.size)
        except Exception:
            source.close()
            raise
        self.pixel_format = PIXEL_FORMATS[self.pixel_format_id]
        self.codec = CODECS[self.codec_id]
        self.frame_bytes = frame_size(self.pixel_format_id, self.width, self.height)
        self.lines, self.line_bytes = frame_lines(
            self.pixel_format_id, self.width, self.height
        )
        self._records = None  # offset of each record's length field
        self._types = None  # frame type per record (versions 7 and 8)
        self._frame = None  # decoded frame buffer
        self._scratch = None  # stored (partial) deltas read from a file
        self._band = None  # one band of a shifted partial or region delta
        self._zeros = None  # one line of zeros
        self._pos = None  # index of the frame held in _frame
        self._decompress = decompress or _zlib_decompress
        self._sized_inflate = decompress is None  # try passing the output size

    # -- container -----------------------------------------------------------

    def __len__(self):
        return self.frame_count

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def close(self):
        """Close the underlying file, if :func:`open` opened it."""
        self._source.close()

    @property
    def duration(self):
        """Length in seconds."""
        return self.frame_count / self.fps

    @property
    def indexed(self):
        """True once the frame index has been built."""
        return self._records is not None

    def build_index(self):
        """Scan the record headers once and validate the container.

        Called automatically by :meth:`frame`, :meth:`payload`,
        :meth:`frame_type` and :meth:`payload_sizes`; call it yourself to fail
        early on a damaged file. Raises :class:`RV565Error` if the container
        is invalid.
        """
        if self._records is not None:
            return
        import array  # pylint: disable=import-outside-toplevel

        records = array.array("L")
        v7 = self.version != VERSION_6  # typed records: version 7 or 8
        regions = self.version == VERSION_8
        types = bytearray(self.frame_count) if v7 else None
        head = 5 if v7 else 4
        interval = self.keyframe_interval
        stored = self.codec_id == STORED
        frame_bytes = self.frame_bytes
        source = self._source
        size = source.size
        offset = self.header_size
        for i in range(self.frame_count):
            if size - offset < 4:
                raise RV565Error("truncated frame table at frame %d" % i)
            record = bytes(source.read(offset, min(head, size - offset)))
            (length,) = struct.unpack_from(_LENGTH, record, 0)
            if length == 0 or size - offset - 4 < length:
                raise RV565Error("invalid length for frame %d" % i)
            if v7:
                kind = record[4]
                if kind >= len(FRAME_TYPES) or (kind == REGION and not regions):
                    raise RV565Error("unsupported frame type %d at frame %d" % (kind, i))
                if i % interval == 0 and kind != KEYFRAME:
                    raise RV565Error("frame %d must be a keyframe" % i)
                if kind == REPEAT:
                    if length != 1:
                        raise RV565Error("repeat frame %d has a body" % i)
                elif kind in (PARTIAL, REGION):
                    _, _, _, start, want = self._layout(
                        offset + 5, length - 1, kind == REGION
                    )
                    if stored and length - 1 - start != want:
                        raise RV565Error(
                            "stored %s frame %d has %d bytes, expected %d"
                            % (FRAME_TYPES[kind], i, length - 1 - start, want)
                        )
                elif stored and length - 1 != frame_bytes:
                    raise RV565Error(
                        "stored frame %d has %d bytes, expected %d"
                        % (i, length - 1, frame_bytes)
                    )
                types[i] = kind
            records.append(offset)
            offset += 4 + length
        if offset != size:
            raise RV565Error("trailing bytes after the last frame")
        self._records = records
        self._types = types

    def _check(self, i):
        if not 0 <= i < self.frame_count:
            raise IndexError(
                "frame %d out of range (0-%d)" % (i, self.frame_count - 1)
            )
        self.build_index()

    def _span(self, i):
        self._check(i)
        start = self._records[i] + (5 if self._types is not None else 4)
        if i + 1 < self.frame_count:
            end = self._records[i + 1]
        else:
            end = self._source.size
        return start, end - start

    def _layout(self, offset, length, region=False):
        """:func:`_partial_layout` of the partial (or, with ``region``,
        region) delta body at ``offset``: reads the band height and mask,
        then the entries of the changed bands."""
        head = (self.lines + 7) // 8 + 1  # the longest band mask, plus B
        head = bytes(self._source.read(offset, length if length < head else head))
        align = _ALIGN[self.pixel_format_id] if region else 0
        if len(head) < 1 or head[0] == 0:
            return _partial_layout(head, self.lines, self.line_bytes, None, align)
        mask_end = 1 + ((self.lines + head[0] - 1) // head[0] + 7) // 8
        count = 0
        for byte in head[1:mask_end]:
            bits = byte
            while bits:
                count += bits & 1
                bits >>= 1
        want = (6 if region else 2) * count
        if length - mask_end < want:
            want = max(0, length - mask_end)
        shifts = bytes(self._source.read(offset + mask_end, want)) if want else b""
        return _partial_layout(head, self.lines, self.line_bytes, shifts, align)

    def _kind(self, i):
        return self._types[i] if self._types is not None else KEYFRAME

    def frame_type(self, i):
        """``"key"``, ``"delta"``, ``"repeat"``, ``"partial"`` or
        ``"region"``."""
        self._check(i)
        return FRAME_TYPES[self._types[i] if self._types is not None else KEYFRAME]

    def content_index(self, i):
        """The frame whose picture frame ``i`` shows: ``i`` itself unless it is a
        repeat, else the latest earlier frame that is not one."""
        self._check(i)
        types = self._types
        if types is not None:
            while types[i] == REPEAT:
                i -= 1
        return i

    def changed_lines(self, i):
        """Line runs ``(first, count)`` that frame ``i`` changes from frame
        ``i - 1``: every line for a keyframe or delta, none for a repeat, the
        changed bands merged into runs for a partial or region delta. Lines
        are pixel rows, or pages of 8 rows for ``mono_vpage`` (see
        :attr:`lines`)."""
        self._check(i)
        kind = self._kind(i)
        if kind == REPEAT:
            return []
        if kind not in (PARTIAL, REGION):
            return [(0, self.lines)]
        offset, length = self._span(i)
        band, changed, _, _, _ = self._layout(offset, length, kind == REGION)
        lines = self.lines
        runs = []
        for b in changed:
            first = b * band
            end = first + band
            end = min(end, lines)
            if runs and runs[-1][0] + runs[-1][1] == first:
                runs[-1] = (runs[-1][0], end - runs[-1][0])
            else:
                runs.append((first, end - first))
        return runs

    def changed_rects(self, i):
        """Rectangles ``(first line, line count, first byte, byte count)``
        that frame ``i`` changes from frame ``i - 1``: one per changed band
        for a region delta (its byte range along the band's lines), and the
        runs of :meth:`changed_lines` across whole lines otherwise (none for
        a repeat). Read from the record without decoding; byte ranges start
        and end on whole pixels (see :meth:`columns`)."""
        self._check(i)
        if self._kind(i) != REGION:
            stride = self.line_bytes
            return [(first, count, 0, stride) for first, count in self.changed_lines(i)]
        offset, length = self._span(i)
        band, changed, entries, _, _ = self._layout(offset, length, True)
        lines = self.lines
        rects = []
        for k, b in enumerate(changed):
            e = 6 * k
            first = b * band
            end = first + band
            end = min(end, lines)
            rects.append(
                (
                    first,
                    end - first,
                    entries[e + 2] | entries[e + 3] << 8,
                    entries[e + 4] | entries[e + 5] << 8,
                )
            )
        return rects

    def dirty_rects(self, since, i):
        """Rectangles, as in :meth:`changed_rects`, that differ between
        frame ``since`` (what a display shows) and frame ``i``. When the only
        frame between them that is not a repeat is a region delta, its
        :meth:`changed_rects`; otherwise the runs of :meth:`dirty_lines`
        across whole lines."""
        self._check(i)
        if since is not None and since < i:
            last = None
            for k in range(since + 1, i + 1):
                if self._kind(k) != REPEAT:
                    if last is not None:
                        last = None
                        break
                    last = k
            if last is not None and self._kind(last) == REGION:
                return self.changed_rects(last)
        stride = self.line_bytes
        return [
            (first, count, 0, stride) for first, count in self.dirty_lines(since, i)
        ]

    def columns(self, first, count):
        """``(first column, column count)``: the pixel columns that bytes
        ``first`` to ``first + count - 1`` of a line cover, for a byte range
        from :meth:`changed_rects` (``x0 / A * p`` to ``(x0 + xw) / A * p -
        1``, where ``p`` pixels take ``A`` bytes, fewer at the end of a
        line). For ``mono_vpage`` a column is one byte of a page."""
        align = _ALIGN[self.pixel_format_id]
        per = _ALIGN_PIXELS[self.pixel_format_id]
        width = self.width
        c0 = first // align * per
        c1 = (first + count + align - 1) // align * per
        c1 = min(c1, width)
        return c0, c1 - c0

    def dirty_lines(self, since, i):
        """Line runs that differ between frame ``since`` (what a display
        shows) and frame ``i``, from the frame types and band masks alone:
        the union of :meth:`changed_lines` of frames ``since + 1`` to ``i``
        (whole lines, also for region deltas; see :meth:`dirty_rects`).
        Every line when ``since`` is ``None`` or after ``i``, or a keyframe or
        delta lies between."""
        self._check(i)
        full = [(0, self.lines)]
        if since is None or since > i:
            return full
        if since == i:
            return []
        runs = None
        marks = None
        for k in range(since + 1, i + 1):
            kind = self._kind(k)
            if kind == REPEAT:
                continue
            if kind not in (PARTIAL, REGION):
                return full
            more = self.changed_lines(k)
            if runs is None:
                runs = more
                continue
            if marks is None:
                marks = bytearray(self.lines)
                for first, count in runs:
                    marks[first : first + count] = b"\x01" * count
            for first, count in more:
                marks[first : first + count] = b"\x01" * count
        if marks is None:
            return runs or []
        runs = []
        y = 0
        lines = self.lines
        while y < lines:
            if marks[y]:
                first = y
                while y < lines and marks[y]:
                    y += 1
                runs.append((first, y - first))
            else:
                y += 1
        return runs

    def payload_sizes(self):
        """Body length of every frame (0 for repeats), in order."""
        return [self._span(i)[1] for i in range(self.frame_count)]

    def payload(self, i):
        """The encoded body of frame ``i`` (bytes or a memoryview; empty for
        a repeat)."""
        offset, length = self._span(i)
        return self._source.read(offset, length)

    # -- decoding ------------------------------------------------------------

    def _inflate(self, data, size):
        if self._decompress is None:
            raise RV565Error(
                "this CircuitPython build has no zlib module; use a board "
                "whose build includes zlib (most ESP32-S3 and RP2350 boards), "
                "or pass decompress= to open()"
            )
        if self._sized_inflate:
            # CPython and some CircuitPython builds accept (data, wbits,
            # bufsize); wbits 15 means "zlib header, any window up to 32 KiB".
            # Builds that only take (data) raise TypeError once, and from then
            # on we call the one-argument form.
            try:
                return self._decompress(data, 15, size)
            except TypeError:
                self._sized_inflate = False
        return self._decompress(data)

    def _body(self, i, into, offset=None, length=None, size=None):
        """Decode frame ``i``'s body (or the part of it at ``offset``, of
        ``length`` bytes, decoding to ``size``). With ``into`` (a buffer of
        ``size`` bytes) a stored body from a file is read straight into it;
        otherwise the data is returned as a buffer of ``size`` bytes."""
        if offset is None:
            offset, length = self._span(i)
            size = self.frame_bytes
        if self.codec_id == STORED:
            if into is not None:
                self._source.readinto(offset, into)
                return into
            return self._source.read(offset, length)
        payload = self._source.read(offset, length)
        try:
            data = self._inflate(payload, size)
        except MemoryError:
            raise
        except RV565Error:
            raise
        except Exception as exc:  # zlib.error, ValueError, OSError by port
            raise RV565Error("frame %d does not inflate: %s" % (i, exc))
        if len(data) != size:
            raise RV565Error(
                "frame %d inflates to %d bytes, expected %d" % (i, len(data), size)
            )
        return data

    def _decode_band(self, frame, data, pos, lo, hi, dx, dy):
        """Decode one changed band, lines ``lo`` to ``hi - 1``, in place:
        replace the previous frame's lines by their prediction (the band
        shifted by ``dx`` bytes and ``dy`` lines, zero where that reaches
        outside the band or the line), then XOR in the residual (``data``
        from ``pos``). Returns where the next band's data starts."""
        stride = self.line_bytes
        n = (hi - lo) * stride
        if dx or dy:
            # Predict from a copy of the band, so the frame can be
            # overwritten in place: one band of scratch.
            if self._band is None or len(self._band) < n:
                self._band = bytearray(n)
            if self._zeros is None:
                self._zeros = bytes(stride)
            copy = memoryview(self._band)
            fv = memoryview(frame)
            copy[:n] = fv[lo * stride : hi * stride]
            zeros = self._zeros
            for y in range(lo, hi):
                o = y * stride
                src = y - dy
                if not lo <= src < hi or dx >= stride or -dx >= stride:
                    fv[o : o + stride] = zeros
                    continue
                s = (src - lo) * stride
                if dx >= 0:
                    fv[o : o + dx] = zeros[:dx]
                    fv[o + dx : o + stride] = copy[s : s + stride - dx]
                else:
                    fv[o : o + stride + dx] = copy[s - dx : s + stride]
                    fv[o + stride + dx : o + stride] = zeros[: -dx]
        _xor_into(frame, data, lo * stride, pos, n)
        return pos + n

    def _decode_range(self, frame, data, pos, lo, hi, entry):
        """Decode one changed band of a region delta, lines ``lo`` to
        ``hi - 1``, in place: within the band's byte range ``x0`` to
        ``x0 + xw - 1``, replace the previous frame's bytes by their
        prediction (as in :meth:`_decode_band`, from the whole line), then
        XOR in the residual (``data`` from ``pos``, ``xw`` bytes per line).
        Bytes outside the range keep the previous frame. ``entry`` is the
        band's ``dx, dy, x0, xw`` as 6 bytes. Returns where the next band's
        data starts."""
        stride = self.line_bytes
        dx = entry[0] - 256 if entry[0] > 127 else entry[0]
        dy = entry[1] - 256 if entry[1] > 127 else entry[1]
        x0 = entry[2] | entry[3] << 8
        xw = entry[4] | entry[5] << 8
        x1 = x0 + xw
        if dx or dy:
            # Predicted bytes a..e-1 of each line come from bytes a-dx..e-dx
            # of a line of the band; the rest of the range predicts 0. Copy
            # those columns of the band first (at most one band of scratch)
            # so the frame can be overwritten in place.
            a = x0 if x0 > dx else dx
            e = x1 if x1 < stride + dx else stride + dx
            cw = e - a if e > a else 0
            rows = hi - lo
            if cw and (self._band is None or len(self._band) < rows * cw):
                self._band = bytearray(rows * cw)
            if self._zeros is None:
                self._zeros = bytes(stride)
            zeros = self._zeros
            fv = memoryview(frame)
            if cw:
                copy = memoryview(self._band)
                for r in range(rows):
                    o = (lo + r) * stride + a - dx
                    copy[r * cw : (r + 1) * cw] = fv[o : o + cw]
            for y in range(lo, hi):
                o = y * stride
                src = y - dy
                if not cw or not lo <= src < hi:
                    fv[o + x0 : o + x1] = zeros[:xw]
                    continue
                if a > x0:
                    fv[o + x0 : o + a] = zeros[: a - x0]
                c = (src - lo) * cw
                fv[o + a : o + e] = copy[c : c + cw]
                if e < x1:
                    fv[o + e : o + x1] = zeros[: x1 - e]
        if xw == stride:
            n = (hi - lo) * stride
            _xor_into(frame, data, lo * stride, pos, n)
            return pos + n
        for y in range(lo, hi):
            _xor_into(frame, data, y * stride + x0, pos, xw)
            pos += xw
        return pos

    def _apply(self, i):
        """Turn the buffer holding frame ``i - 1`` into frame ``i``."""
        kind = self._kind(i)
        if kind == REPEAT:
            return
        frame = self._frame
        from_file = self.codec_id == STORED and isinstance(self._source, _FileSource)
        if kind in (PARTIAL, REGION):
            # XOR the decoded bands (or their ranges) into their lines, in
            # place; the decoded data is only as large as those.
            region = kind == REGION
            offset, length = self._span(i)
            band, changed, shifts, start, size = self._layout(offset, length, region)
            into = None
            if from_file:
                if self._scratch is None:
                    self._scratch = bytearray(self.frame_bytes)
                into = memoryview(self._scratch)[:size]
            data = self._body(i, into, offset + start, length - start, size)
            lines = self.lines
            pos = 0
            for k, b in enumerate(changed):
                lo = b * band
                hi = lo + band
                hi = min(hi, lines)
                if region:
                    pos = self._decode_range(
                        frame, data, pos, lo, hi, shifts[6 * k : 6 * k + 6]
                    )
                    continue
                dx = shifts[2 * k]
                dy = shifts[2 * k + 1]
                pos = self._decode_band(
                    frame,
                    data,
                    pos,
                    lo,
                    hi,
                    dx - 256 if dx > 127 else dx,
                    dy - 256 if dy > 127 else dy,
                )
            return
        if kind == KEYFRAME:
            if from_file:
                self._body(i, frame)
            else:
                frame[:] = self._body(i, None)
            return
        # Delta: XOR the decoded body into the previous frame, in place.
        if from_file:
            if self._scratch is None:
                self._scratch = bytearray(self.frame_bytes)
            body = self._body(i, self._scratch)
        else:
            body = self._body(i, None)
        _xor_into(frame, body)

    def frame(self, i):
        """Frame ``i`` as bytes in the clip's pixel format (:attr:`frame_bytes`).

        The result is the clip's own frame buffer: the next call to
        :meth:`frame` overwrites it, so copy it with ``bytes()`` to keep it.
        Decoding the next frame applies one record; any other frame starts at
        the latest keyframe at or before it (at most ``K - 1`` records back).

        Raises :class:`RV565Error` if zlib data does not inflate to exactly
        :attr:`frame_bytes` bytes (for a partial delta, its changed bands;
        for a region delta, their ranges).
        """
        self._check(i)
        types = self._types
        key = i
        if types is not None:
            while types[key] != KEYFRAME:
                key -= 1
        pos = self._pos
        if self._frame is None:
            self._frame = bytearray(self.frame_bytes)
        self._pos = None  # invalid until decoding finishes
        if pos is not None and key <= pos <= i:
            start = pos
        else:
            start = key
            self._apply(key)
        for j in range(start + 1, i + 1):
            self._apply(j)
        self._pos = i
        return self._frame

    def __iter__(self):
        """Yield every frame in order; each is the shared frame buffer."""
        for i in range(self.frame_count):
            yield self.frame(i)

    def verify(self):
        """Decode every frame; raise :class:`RV565Error` on the first bad one.

        :return: the number of frames checked
        """
        self._pos = None
        for i in range(self.frame_count):
            self.frame(i)
        return self.frame_count


def open(source, decompress=None):  # noqa: A001 pylint: disable=redefined-builtin
    """Open an RV565 clip.

    :param source: a path such as ``"/clip.rv565"`` or ``"/sd/clip.rv565"``,
        a file object opened in binary mode, or ``bytes``/``bytearray``
    :param decompress: optional replacement for ``zlib.decompress``
    :return: a :class:`Clip`

    A path is opened and read frame by frame, so the clip does not have to fit
    in RAM; :meth:`Clip.close` (or a ``with`` block) closes it again.
    """
    if isinstance(source, (bytes, bytearray, memoryview)):
        return Clip(_BytesSource(source), decompress)
    if hasattr(source, "read"):
        return Clip(_FileSource(source, False), decompress)
    return Clip(_FileSource(_builtin_open(source, "rb"), True), decompress)


# -- pacing ------------------------------------------------------------------


class _Clock:
    """Seconds since the last reset(), as a float.

    CircuitPython floats have about 22 bits of mantissa, so absolute uptime in
    seconds loses millisecond precision after an hour or so. The origin is
    kept in integer nanoseconds and the play loop moves it forward with
    :meth:`rebase` at every loop of the clip, so the floats it sees stay
    within one clip's length even when ``loops=0`` plays for days.

    Boards without ``time.monotonic_ns`` (no long integers) fall back to
    ``time.monotonic()``, whose own value is absolute uptime as a float;
    rebasing cannot restore precision it has already lost there.
    """

    def __init__(self):
        self._t0 = 0
        self.reset()

    def reset(self):
        if _monotonic_ns is not None:
            self._t0 = _monotonic_ns()
        else:
            import time  # pylint: disable=import-outside-toplevel

            self._t0 = time.monotonic()

    def rebase(self, frames, fps):
        """Move the origin forward by ``frames`` frames at ``fps``."""
        if _monotonic_ns is not None:
            self._t0 += frames * 1_000_000_000 // fps
        else:
            self._t0 += frames / fps

    def __call__(self):
        if _monotonic_ns is not None:
            return (_monotonic_ns() - self._t0) / 1e9
        import time  # pylint: disable=import-outside-toplevel

        return time.monotonic() - self._t0


def _default_sleep(seconds):
    import time  # pylint: disable=import-outside-toplevel

    time.sleep(seconds)


class PlayStats:
    """What :meth:`Player.play` achieved.

    :ivar shown: frames shown on time (repeats included)
    :ivar skipped: frames dropped to keep up with the clip's rate
    :ivar repeated: frames shown at no cost because the screen already held
        their picture (repeat frames)
    :ivar rows_updated: pixel rows written to the bitmap or sent to the
        panel; partial and region deltas update only their changed rows
    :ivar pixels_updated: pixels written or sent; region deltas update only
        each changed band's range of columns
    :ivar elapsed: wall time in seconds
    :ivar decode_time: seconds spent inflating
    :ivar draw_time: seconds spent filling the bitmap and refreshing
    """

    def __init__(self, fps):
        self.target_fps = fps
        self.shown = 0
        self.skipped = 0
        self.repeated = 0
        self.rows_updated = 0
        self.pixels_updated = 0
        self.elapsed = 0.0
        self.decode_time = 0.0
        self.draw_time = 0.0

    @property
    def fps(self):
        """Frames actually shown per second."""
        return self.shown / self.elapsed if self.elapsed > 0 else 0.0

    def __repr__(self):
        per = self.shown or 1
        return (
            "<PlayStats %.2f of %d FPS: %d shown (%d repeats), %d skipped in "
            "%.2f s; %d rows updated (%d pixels); %.1f ms decode + %.1f ms draw "
            "per frame>"
            % (
                self.fps,
                self.target_fps,
                self.shown,
                self.repeated,
                self.skipped,
                self.elapsed,
                self.rows_updated,
                self.pixels_updated,
                1000 * self.decode_time / per,
                1000 * self.draw_time / per,
            )
        )


class _Pacer:
    """Shared play loop: shows frames on the clip's timeline, skipping late ones."""

    def __init__(self, clip, clock=None, sleep=None):
        self.clip = clip
        self._clock = clock or _Clock()
        self._sleep = sleep or _default_sleep
        self._shown_content = None  # content_index of the picture on screen
        self.last_rows = 0  # rows the last show() updated
        self.last_pixels = 0  # pixels the last show() updated

    def show(self, i):
        """Decode and draw frame ``i``; return (decode_s, draw_s)."""
        raise NotImplementedError

    def play(self, loops=1, start=0, on_frame=None):
        """Play the clip at its frame rate, skipping frames that are late.

        :param loops: how many times to play the clip; 0 loops forever
        :param start: first frame, ``0 <= start < len(clip)``
        :param on_frame: optional ``callback(index, stats)``; return ``False``
            to stop
        :return: :class:`PlayStats`
        :raises IndexError: if ``start`` is not a frame of the clip
        """
        clip = self.clip
        n = len(clip)
        if not 0 <= start < n:
            raise IndexError("start frame %d out of range 0..%d" % (start, n - 1))
        fps = clip.fps
        total = n * loops - start if loops else None
        stats = PlayStats(fps)
        self._shown_content = None
        clock = self._clock
        if hasattr(clock, "reset"):
            clock.reset()
        rebase = getattr(clock, "rebase", None)
        t0 = clock()
        played = 0.0  # seconds of timeline moved out of the clock by rebase
        position = 0  # frames since t0 on the clip's timeline
        while total is None or position < total:
            if rebase is not None and position >= n:
                # Keep the clock's floats small on long runs: move its origin
                # forward by whole clips and count from there.
                shift = position // n * n
                rebase(shift, fps)
                position -= shift
                if total is not None:
                    total -= shift
                played += shift / fps
            index = (start + position) % n
            content = clip.content_index(index)
            if content == self._shown_content:
                # A repeat of the picture already on screen: nothing to
                # decode or send.
                stats.repeated += 1
            else:
                self.last_rows = 0
                self.last_pixels = 0
                decode_s, draw_s = self.show(index)
                self._shown_content = content
                stats.rows_updated += self.last_rows
                stats.pixels_updated += self.last_pixels
                stats.decode_time += decode_s
                stats.draw_time += draw_s
            stats.shown += 1
            if on_frame is not None and on_frame(index, stats) is False:
                break
            position += 1
            now = clock()
            due = int((now - t0) * fps)  # frame the timeline has reached
            if due > position:
                # Behind: drop the frames that are already late.
                if total is not None and due > total:
                    due = total
                stats.skipped += due - position
                position = due
            else:
                wait = t0 + position / fps - now
                if wait > 0:
                    self._sleep(wait)
        stats.elapsed = played + clock() - t0
        return stats


# Player: per pixel format, (bitmap value count, bits per pixel for
# bitmaptools.readinto, element size, first pixel in the high bits).
_PLAYER_FORMATS = {
    0: (65536, 16, 2, False),  # rgb565be
    1: (65536, 16, 2, False),  # rgb565le
    5: (256, 8, 1, False),  # gray8
    6: (16, 4, 1, True),  # gray4, high nibble first
    7: (2, 1, 1, True),  # mono, most significant bit first
}
_BAND_ROWS = 8  # rows per scratch bitmap for partial updates
_WINDOW_BYTES = 4096  # DirectPlayer: most bytes gathered per region window write
PLAYER_FORMATS = ("rgb565be", "rgb565le", "gray8", "gray4", "mono")
DIRECT_FORMATS = ("rgb565be", "rgb666")


class Player(_Pacer):
    """Show an RV565 clip through ``displayio``.

    Shows the pixel formats in :data:`PLAYER_FORMATS`; other formats raise
    :class:`RV565Error`. Each frame is copied into a ``displayio.Bitmap``
    with one ``bitmaptools.readinto()`` call, with no per-pixel work in
    Python:

    * ``rgb565be``: 65536-value bitmap through a ``ColorConverter`` whose
      input colorspace is ``RGB565_SWAPPED``. The file's big-endian bytes,
      read into the bitmap's little-endian 16-bit storage, are byte-swapped
      values, which is what ``RGB565_SWAPPED`` describes.
    * ``rgb565le``: the same bitmap through ``Colorspace.RGB565``.
    * ``gray8``, ``gray4``, ``mono``: a 256-, 16- or 2-value bitmap through a
      grey ``displayio.Palette`` (mono: 0 black, 1 white).

    Repeat frames are not decoded or drawn during :meth:`play`.

    :param clip: a :class:`Clip`
    :param display: a display object (``board.DISPLAY``, ``busdisplay.BusDisplay``
        or ``adafruit_st7789.ST7789``), or ``None`` to only build :attr:`group`
    :param int scale: integer zoom for the group (1 = native size)
    :param x: left edge on the display; centred when omitted
    :param y: top edge on the display; centred when omitted
    :param clock: function returning seconds (for tests)
    :param sleep: function sleeping for seconds (for tests)
    """

    def __init__(
        self, clip, display=None, scale=1, x=None, y=None, clock=None, sleep=None
    ):
        fmt = clip.pixel_format_id
        if fmt not in _PLAYER_FORMATS:
            raise RV565Error(
                "Player shows %s clips; this clip is %s (use DirectPlayer for "
                "rgb666, or encode the clip as rgb565be)"
                % (", ".join(PLAYER_FORMATS), clip.pixel_format)
            )
        super().__init__(clip, clock, sleep)
        import displayio  # pylint: disable=import-outside-toplevel

        try:
            import bitmaptools  # pylint: disable=import-outside-toplevel
        except ImportError:
            bitmaptools = None
        self._readinto = getattr(bitmaptools, "readinto", None)
        try:
            from io import BytesIO  # pylint: disable=import-outside-toplevel
        except ImportError:
            BytesIO = None  # pylint: disable=invalid-name
        if BytesIO is None:
            self._readinto = None
        self._bytesio = BytesIO
        # bitmaptools.blit (CircuitPython 9+) or Bitmap.blit (8.x), to copy
        # a scratch band into the bitmap for partial updates.
        blit = getattr(bitmaptools, "blit", None)
        if blit is not None:
            self._blit = lambda dest, src, x, y, w, rows: blit(
                dest, src, x, y, x1=x, y1=0, x2=x + w, y2=rows
            )
        else:
            self._blit = None
        self._band = None  # scratch bitmaps for partial updates
        self._row = None
        self._displayio = displayio

        values, self._bits, self._element, self._msb_first = _PLAYER_FORMATS[fmt]
        self.display = display
        self._values = values
        self.bitmap = displayio.Bitmap(clip.width, clip.height, values)
        if self._blit is None and hasattr(self.bitmap, "blit"):
            self._blit = lambda dest, src, x, y, w, rows: dest.blit(
                x, y, src, x1=x, y1=0, x2=x + w, y2=rows
            )
        if fmt == 0:
            self.converter = displayio.ColorConverter(
                input_colorspace=displayio.Colorspace.RGB565_SWAPPED
            )
        elif fmt == 1:
            self.converter = displayio.ColorConverter(
                input_colorspace=displayio.Colorspace.RGB565
            )
        else:
            self.converter = displayio.Palette(values)
            step = 255 // (values - 1)
            for v in range(values):
                grey = v * step
                self.converter[v] = (grey << 16) | (grey << 8) | grey
        self.tilegrid = displayio.TileGrid(self.bitmap, pixel_shader=self.converter)
        if display is not None:
            if x is None:
                x = max(0, (display.width - clip.width * scale) // 2)
            if y is None:
                y = max(0, (display.height - clip.height * scale) // 2)
        self.group = displayio.Group(scale=scale, x=x or 0, y=y or 0)
        self.group.append(self.tilegrid)
        if display is not None:
            display.root_group = self.group

    def blit(self, frame, runs=None, rects=None):
        """Copy one decoded frame (bytes in the clip's format) into :attr:`bitmap`.

        :param runs: row runs ``(first, count)`` to copy; all rows if ``None``.
            Only those rows of the bitmap change, so ``displayio`` refreshes
            only that area.
        :param rects: instead of ``runs``, rectangles ``(first row, row
            count, first byte, byte count)`` as :meth:`Clip.changed_rects`
            gives them; only their columns (:meth:`Clip.columns`) change.
        """
        if rects is not None:
            clip = self.clip
            for first, count, x0, xw in rects:
                col, cols = clip.columns(x0, xw)
                self._blit_rows(frame, first, count, col, cols)
            return
        if runs is not None and runs != [(0, self.bitmap.height)]:
            for first, count in runs:
                self._blit_rows(frame, first, count)
            return
        if self._readinto is not None:
            # One C call: reads the rows into the bitmap, handling both the
            # file's row padding and the bitmap's.
            self._readinto(
                self.bitmap,
                self._bytesio(frame),
                bits_per_pixel=self._bits,
                element_size=self._element,
                reverse_pixels_in_element=self._msb_first,
            )
            return
        self._slow_rows(frame, 0, self.bitmap.height)

    def _blit_rows(self, frame, first, count, col=0, cols=None):
        """Copy rows ``first`` to ``first + count - 1`` of ``frame`` (columns
        ``col`` to ``col + cols - 1``; all when ``cols`` is ``None``) into
        the bitmap: ``readinto`` into a small scratch bitmap, then ``blit``
        that window of it."""
        if cols is None:
            cols = self.bitmap.width - col
        if self._readinto is None or self._blit is None:
            self._slow_rows(frame, first, first + count, col, col + cols)
            return
        stride = self.clip.line_bytes
        view = memoryview(frame)
        y = first
        end = first + count
        while y < end:
            if end - y >= _BAND_ROWS:
                if self._band is None:
                    self._band = self._new_bitmap(_BAND_ROWS)
                scratch = self._band
            else:
                if self._row is None:
                    self._row = self._new_bitmap(1)
                scratch = self._row
            rows = scratch.height
            self._readinto(
                scratch,
                self._bytesio(view[y * stride : (y + rows) * stride]),
                bits_per_pixel=self._bits,
                element_size=self._element,
                reverse_pixels_in_element=self._msb_first,
            )
            self._blit(self.bitmap, scratch, col, y, cols, rows)
            y += rows

    def _slow_rows(self, frame, first, end, col=0, col_end=None):
        """Fallback without bitmaptools: one Python step per pixel, far
        slower, but correct."""
        bitmap = self.bitmap
        bits = self._bits
        width = bitmap.width if col_end is None else col_end
        stride = self.clip.line_bytes
        if bits >= 8:
            step = bits // 8
            for y in range(first, end):
                row = y * stride
                for x in range(col, width):
                    p = row + step * x
                    if step == 2:
                        bitmap[x, y] = frame[p] | (frame[p + 1] << 8)
                    else:
                        bitmap[x, y] = frame[p]
            return
        per = 8 // bits
        mask = (1 << bits) - 1
        for y in range(first, end):
            row = y * stride
            for x in range(col, width):
                shift = 8 - bits * (x % per + 1)
                bitmap[x, y] = (frame[row + x // per] >> shift) & mask

    def _new_bitmap(self, rows):
        return self._displayio.Bitmap(self.clip.width, rows, self._values)

    def show(self, i):
        """Decode frame ``i``, draw it, and refresh the display.

        Only the area that differs from the picture already in the bitmap is
        copied (:meth:`Clip.dirty_rects`): after a partial delta, its changed
        bands; after a region delta, each changed band's range of columns.
        :attr:`last_rows` and :attr:`last_pixels` say how much.

        :return: ``(decode_seconds, draw_seconds)``
        """
        clock = self._clock
        clip = self.clip
        rects = clip.dirty_rects(self._shown_content, i)
        t0 = clock()
        frame = clip.frame(i)
        t1 = clock()
        self._shown_content = clip.content_index(i)
        rows = 0
        pixels = 0
        whole = True
        for _, count, x0, xw in rects:
            rows += count
            cols = clip.columns(x0, xw)[1]
            pixels += count * cols
            whole = whole and cols == clip.width
        self.last_rows = rows
        self.last_pixels = pixels
        if not rows:
            return t1 - t0, clock() - t1
        if whole:
            self.blit(frame, [(first, count) for first, count, _, _ in rects])
        else:
            self.blit(frame, rects=rects)
        if self.display is not None and not getattr(self.display, "auto_refresh", True):
            self.display.refresh()
        return t1 - t0, clock() - t1

    def play(self, loops=1, start=0, on_frame=None):
        """Play at the clip's rate, skipping late frames; see :class:`PlayStats`.

        ``auto_refresh`` is turned off while playing so each frame is pushed
        once, and restored afterwards.
        """
        display = self.display
        restore = None
        if display is not None and hasattr(display, "auto_refresh"):
            restore = display.auto_refresh
            display.auto_refresh = False
        try:
            return super().play(loops, start, on_frame)
        finally:
            if restore is not None:
                display.auto_refresh = restore


class DirectPlayer(_Pacer):
    """Experimental: send frames straight to an ST7789 over its display bus.

    RV565 frames are already in the byte order an ST7789 expects on SPI, so
    this skips ``displayio`` entirely: it sets the address window and sends
    the decoded bytes with one ``bus.send()`` per frame. It plays the pixel
    formats in :data:`DIRECT_FORMATS`: ``rgb565be`` as the panel is set up by
    ``adafruit_st7789``, and ``rgb666`` by switching the controller to 18-bit
    pixels (COLMOD ``0x66``) while playing and back to ``restore_colmod``
    afterwards. Repeat frames are not decoded or sent during :meth:`play`;
    the panel keeps showing the picture. It is much faster
    than :class:`Player` but bypasses ``displayio``, so the display must be
    initialised first (for example by ``adafruit_st7789.ST7789``) and then left
    alone: this class sets ``root_group = None`` and turns off
    ``auto_refresh``.

    ``displayio`` rotation is a software transform: it never reaches the
    controller, whose RAM stays 240 columns x 320 rows. So for a landscape
    panel (``panel_width > panel_height``) :meth:`play` first sends MADCTL
    ``madctl`` (default :data:`MADCTL_LANDSCAPE`, ``0x60``, as the RV565
    benchmarks do), which makes the controller's columns run along the long
    side; the address window is then in landscape coordinates. When play
    ends, MADCTL is set back to ``restore_madctl`` so ``displayio`` can draw
    again. A portrait panel sends no MADCTL unless ``madctl`` is given.

    :param clip: a :class:`Clip`
    :param bus: the ``fourwire.FourWire`` (CircuitPython 9+) or
        ``displayio.FourWire`` bus the display was created on
    :param int panel_width: width of the panel as the clip should appear
    :param int panel_height: height of the panel as the clip should appear
    :param int x_offset: controller column offset for this module and MADCTL
        (0 for 320x240 panels in the benchmarks; 40 or 52/53 for 240x135
        ones, depending on orientation)
    :param int y_offset: controller row offset, likewise
    :param display: the display object, so it can be quieted while playing
    :param madctl: MADCTL byte to send before playing; ``None`` picks
        :data:`MADCTL_LANDSCAPE` for a landscape panel and nothing for a
        portrait one. Use ``0xA0`` to turn a landscape picture upside down.
    :param restore_madctl: MADCTL byte to send after playing, or ``None`` to
        leave it; default :data:`MADCTL_ADAFRUIT_ST7789`
    :param restore_colmod: COLMOD byte to send after playing an ``rgb666``
        clip; default :data:`COLMOD_RGB565`, ``adafruit_st7789``'s value
    """

    def __init__(
        self,
        clip,
        bus,
        panel_width,
        panel_height,
        x_offset=0,
        y_offset=0,
        display=None,
        clock=None,
        sleep=None,
        madctl=None,
        restore_madctl=MADCTL_ADAFRUIT_ST7789,
        restore_colmod=COLMOD_RGB565,
    ):
        if clip.pixel_format not in DIRECT_FORMATS:
            raise RV565Error(
                "DirectPlayer sends %s clips; this clip is %s"
                % (" and ".join(DIRECT_FORMATS), clip.pixel_format)
            )
        super().__init__(clip, clock, sleep)
        self.colmod = COLMOD_RGB666 if clip.pixel_format == "rgb666" else None
        self.restore_colmod = restore_colmod
        if clip.width > panel_width or clip.height > panel_height:
            raise RV565Error(
                "clip is %dx%d, larger than the %dx%d panel"
                % (clip.width, clip.height, panel_width, panel_height)
            )
        if madctl is None and panel_width > panel_height:
            madctl = MADCTL_LANDSCAPE
        self.madctl = madctl
        self.restore_madctl = restore_madctl
        self.bus = bus
        self.display = display
        x0 = (panel_width - clip.width) // 2 + x_offset
        y0 = (panel_height - clip.height) // 2 + y_offset
        self._caset = struct.pack(">HH", x0, x0 + clip.width - 1)
        self._raset = struct.pack(">HH", y0, y0 + clip.height - 1)
        self._x0 = x0
        self._y0 = y0
        self._window = None  # gathers a region window's rows for one write

    def show(self, i):
        """Decode frame ``i`` and send it to the panel.

        Sends only what differs from the picture on the panel
        (:meth:`Clip.dirty_rects`): the whole frame after a keyframe or
        delta; after a partial delta, one row window and write per run of
        changed bands; after a region delta, one column and row window per
        changed band, covering only its range. :attr:`last_rows` and
        :attr:`last_pixels` say how much went out.

        Called on its own, outside :meth:`play`, it does not send MADCTL;
        call :meth:`begin` first.
        """
        clock = self._clock
        clip = self.clip
        rects = clip.dirty_rects(self._shown_content, i)
        t0 = clock()
        frame = clip.frame(i)
        t1 = clock()
        self._shown_content = clip.content_index(i)
        bus = self.bus
        rows = 0
        pixels = 0
        stride = clip.line_bytes
        if rects == [(0, clip.height, 0, stride)]:
            bus.send(_CASET, self._caset)
            bus.send(_RASET, self._raset)
            bus.send(_RAMWR, frame)
            rows = clip.height
            pixels = rows * clip.width
        elif rects:
            view = memoryview(frame)
            y0 = self._y0
            caset = None
            for first, count, x0, xw in rects:
                rows += count
                if xw == stride:
                    # Whole lines: contiguous in the frame, one write.
                    if caset is not self._caset:
                        caset = self._caset
                        bus.send(_CASET, caset)
                    bus.send(
                        _RASET, struct.pack(">HH", y0 + first, y0 + first + count - 1)
                    )
                    bus.send(_RAMWR, view[first * stride : (first + count) * stride])
                    pixels += count * clip.width
                    continue
                col, cols = clip.columns(x0, xw)
                pixels += count * cols
                caset = struct.pack(">HH", self._x0 + col, self._x0 + col + cols - 1)
                bus.send(_CASET, caset)
                self._send_window(view, first, count, x0, xw)
        self.last_rows = rows
        self.last_pixels = pixels
        return t1 - t0, clock() - t1

    def _send_window(self, view, first, count, x0, xw):
        """Send bytes ``x0`` to ``x0 + xw - 1`` of lines ``first`` to
        ``first + count - 1`` into the column window already set: the lines
        are gathered into a scratch buffer of at most :data:`_WINDOW_BYTES`
        (or one range, if longer) and sent with one row window and write per
        buffer full."""
        stride = self.clip.line_bytes
        per = _WINDOW_BYTES // xw or 1
        per = min(per, count)
        if self._window is None or len(self._window) < per * xw:
            self._window = bytearray(per * xw)
        window = memoryview(self._window)
        bus = self.bus
        y0 = self._y0
        y = first
        end = first + count
        while y < end:
            n = end - y if end - y < per else per
            for r in range(n):
                o = (y + r) * stride + x0
                window[r * xw : (r + 1) * xw] = view[o : o + xw]
            bus.send(_RASET, struct.pack(">HH", y0 + y, y0 + y + n - 1))
            bus.send(_RAMWR, window[: n * xw])
            y += n

    def begin(self):
        """Take the panel from ``displayio`` and set MADCTL (and COLMOD for
        ``rgb666``) for streaming."""
        display = self.display
        if display is not None:
            display.root_group = None
            if hasattr(display, "auto_refresh"):
                display.auto_refresh = False
        if self.madctl is not None:
            self.bus.send(_MADCTL, bytes((self.madctl,)))
        if self.colmod is not None:
            self.bus.send(_COLMOD, bytes((self.colmod,)))

    def end(self):
        """Put MADCTL and COLMOD back (where :meth:`begin` changed them)."""
        if self.madctl is not None and self.restore_madctl is not None:
            self.bus.send(_MADCTL, bytes((self.restore_madctl,)))
        if self.colmod is not None and self.restore_colmod is not None:
            self.bus.send(_COLMOD, bytes((self.restore_colmod,)))

    def play(self, loops=1, start=0, on_frame=None):
        """Play at the clip's rate, skipping late frames.

        Sends MADCTL before the first frame and restores it afterwards, also
        when playing stops with an exception.
        """
        self.begin()
        try:
            return super().play(loops, start, on_frame)
        finally:
            self.end()
