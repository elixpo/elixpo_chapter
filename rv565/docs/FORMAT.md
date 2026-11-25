# RV565 container format, version 8

RV565 stores video for microcontrollers as frames whose decoded bytes are
already in the native pixel format of the display, so a player only
decompresses and transfers: no colour conversion runs on the device.

Version 7 makes the format general. The header declares one of nine pixel
formats, from RGB565 and RGB888 for colour TFTs to 4-bit grayscale and 1-bit
monochrome for OLED, e-paper and memory LCDs, and one of two codecs (stored or
zlib). Frames are keyframes, XOR differences from the previous frame, or
repeats of it, and a keyframe interval in the header keeps seeking O(1).
Partial deltas store only the bands of rows that changed, so a player decodes
and sends to the display only those bands: on these boards the display bus,
not the decoder, limits the frame rate.

Version 8 adds one frame type to version 7: the *region delta*, a partial
delta whose changed bands also say which range of each line changed. A player
sends each changed band as one window covering just that range, so a frame
costs the display bus only the pixels that changed, in a handful of windows.
Nothing else differs: a version 8 file that contains no region delta is a
valid version 7 file apart from its version byte, and writers write version 7
unless they use region deltas.

Version 8 readers also read version 7 and version 6 files (see
[Version 6](#version-6)); version 6 is the special case RGB565 big-endian,
zlib, every frame a keyframe.

## Identification

| | |
| --- | --- |
| Extension | `.rv565` |
| MIME type | `video/x-rv565` |
| Signature | `RV5` at offset 0, version `6`, `7` or `8` at offset 3, a frame rate at offset 8 (1–30 in version 6, 1–60 in versions 7 and 8) |

Signatures for `file(1)`, shared-mime-info, PRONOM and Kaitai Struct are in
`contrib/`.

## Header

All multi-byte integers are little-endian.

| Offset | Size | Field | Constraint |
| --- | --- | --- | --- |
| 0 | 3 | Magic | ASCII `RV5` |
| 3 | 1 | Version | `7`, or `8` if the file contains a region delta |
| 4 | 2 | Width `w` | ≥ 1 |
| 6 | 2 | Height `h` | ≥ 1 |
| 8 | 1 | Frames per second | 1–60 |
| 9 | 1 | Flags | none defined; writers write 0, readers ignore unknown bits |
| 10 | 2 | Frame count `n` | ≥ 1 |
| 12 | 1 | Header size `H` | ≥ 16 |
| 13 | 1 | Pixel format | 0–8, see [Pixel formats](#pixel-formats) |
| 14 | 1 | Codec | 0–1, see [Codecs](#codecs) |
| 15 | 1 | Keyframe interval `K` | ≥ 1 |
| 16 | `H` − 16 | Extension | readers skip it; writers of this version write `H` = 16 |

The fields at offsets 0–11 are where version 6 has them, so tools that print
the size, rate and frame count of a version 6 file can do the same for
versions 7 and 8. The header is the same in versions 7 and 8. `H` lets a later minor revision append header fields without
breaking version 7 readers. Unknown pixel formats, codecs and frame types
cannot be skipped safely, so readers reject them.

## Frame records

`n` records follow the header, starting at offset `H`, contiguous, and the
file ends exactly after the last one. Each record is:

| Size | Field |
| --- | --- |
| 4 | Record length `L` (≥ 1): the bytes that follow, type included |
| 1 | Frame type `T` |
| `L` − 1 | Body |

| `T` | Name | Body | Decoded frame `F[i]` |
| --- | --- | --- | --- |
| 0 | Keyframe | the frame, encoded with the codec | the decoded body |
| 1 | Delta | `F[i] XOR F[i−1]`, encoded with the codec | `F[i−1] XOR` the decoded body |
| 2 | Repeat | empty (`L` = 1) | `F[i−1]` |
| 3 | Partial delta | band height, band mask, a shift for each changed band, then the changed bands' residuals, encoded with the codec | `F[i−1]` with each changed band replaced by its prediction XOR its residual |
| 4 | Region delta (version 8) | band height, band mask, a shift and a byte range for each changed band, then the residuals of those ranges, encoded with the codec | `F[i−1]` with the range of each changed band's lines replaced by its prediction XOR its residual |

Type 4 is reserved in version 7 files. Other types are reserved; readers
reject them.

**Partial delta.** The frame's bytes are `P` lines of `R` bytes each: pixel
rows for formats 0–7 (`P = h`), pages of 8 rows for `mono_vpage` (`P = ⌈h /
8⌉`, `R = w`). The body is:

| Size | Field |
| --- | --- |
| 1 | Band height `B` in lines, ≥ 1 |
| `⌈N / 8⌉` | Band mask: bit `b mod 8` (least significant first) of byte `⌊b / 8⌋` is set when band `b` changed. `N = ⌈P / B⌉`; band `b` is lines `bB` to `min(P, (b + 1)B) − 1`. At least one bit is set, and bits from `N` on are zero |
| 2 per changed band | Shift of each changed band, in band order: signed bytes `dx` (in bytes along the line) and `dy` (in lines), with `|dy|` < `B` |
| rest | The residuals of the changed bands, in band order, concatenated and encoded with the codec |

The prediction of byte `j` of line `y` in a changed band is byte `j − dx` of
line `y − dy` of `F[i−1]` when that line lies in the same band and
`0 ≤ j − dx < R`, and 0 otherwise. The band of `F[i]` is its prediction XOR
its residual. With `dx = dy = 0` the residual is simply `F[i] XOR F[i−1]`
over the band; a shift lets scrolling text, lists and pans cost a small
residual instead of a full one. The decoded data is exactly as long as the
changed bands together; every other band is unchanged. A player may send only
the changed bands to the display.

A prediction never reaches outside its band, so a decoder working in place
needs a scratch copy of one band, not of the previous frame.

**Region delta** (version 8). The same as a partial delta, except that each
changed band also stores the range of bytes along its lines that changed, and
only that range has a residual. The body is:

| Size | Field |
| --- | --- |
| 1 | Band height `B` in lines, ≥ 1 |
| `⌈N / 8⌉` | Band mask, as in a partial delta |
| 6 per changed band | In band order: signed bytes `dx` and `dy`, as in a partial delta; then `x0` and `xw`, unsigned 16-bit little-endian: the band's range is bytes `x0` to `x0 + xw − 1` of each of its lines |
| rest | The residuals of the changed bands' ranges, in band order, each band line by line (`xw` bytes per line), concatenated and encoded with the codec |

A range has `xw` ≥ 1 and `x0 + xw` ≤ `R`, and starts and ends on whole
pixels: `x0` is a multiple of the format's alignment `A`, and `x0 + xw` is a
multiple of `A` or equal to `R`.

| Pixel format | `A` (bytes) | Pixels in `A` bytes |
| --- | --- | --- |
| `rgb565be`, `rgb565le` | 2 | 1 |
| `rgb444` | 3 | 2 |
| `rgb666`, `rgb888` | 3 | 1 |
| `gray8` | 1 | 1 |
| `gray4` | 1 | 2 |
| `mono` | 1 | 8 |
| `mono_vpage` | 1 | 1 column of the page's 8 rows |

Within the range, byte `j` of line `y` of `F[i]` is the prediction of that
byte (defined exactly as for a partial delta, from the whole line of `F[i−1]`)
XOR the residual; outside the range, and in every unchanged band, `F[i]`
equals `F[i−1]`. The decoded data is exactly the sum over changed bands of
`xw` times the band's line count. A player may send only each changed band's
range to the display, as one window: columns `x0 / A × p` to
`(x0 + xw) / A × p − 1` (fewer at the end of a line), where `p` is the
number of pixels in `A` bytes, and the band's rows.

**Keyframe interval.** Every frame `i` with `i mod K = 0` must be a
keyframe, frame 0 included. Encoders may make other frames keyframes too. A
reader seeking to frame `i` can therefore start at keyframe `i − (i mod K)`
and apply at most `K − 1` records, without scanning the file. `K` = 1 makes
every frame a keyframe, as in version 6.

**Delta, partial delta and repeat** frames are exact: XOR is applied to the frame's encoded
bytes, so the result is bit-identical to the source frame in its pixel
format, padding bits included.

## Codecs

| Value | Codec | Encoded data |
| --- | --- | --- |
| 0 | Stored | the bytes as they are |
| 1 | zlib | a zlib stream (RFC 1950 wrapping RFC 1951 Deflate) |

The data decodes to exactly `S` bytes for a keyframe or delta, and to the
total size of the changed bands for a partial delta. `S` is the frame size
from the pixel format table. Values 2–255 are reserved
(2 is set aside for LZ4); readers reject them.

Stored suits displays whose bus is fast and whose CPU is slow, and clips that
are mostly repeats; zlib is what the RV565 paper measured, and on the ESP32
family its inflater is in ROM.

## Pixel formats

A frame is `h` rows, top to bottom, each `R` bytes, so `S = R × h`, except
format 8. Unused low-order bits at the end of a row are zero.

| Value | Name | Row bytes `R` | Layout | Typical displays |
| --- | --- | --- | --- | --- |
| 0 | `rgb565be` | `2w` | 16-bit `(r5 << 11) \| (g6 << 5) \| b5`, high byte first | ST7789, ST7735, ILI9341, GC9A01 on SPI |
| 1 | `rgb565le` | `2w` | the same value, low byte first | RGB parallel and MIPI panels, frame buffers in memory, LVGL with `LV_COLOR_16_SWAP` 0 |
| 2 | `rgb444` | `⌈3w / 2⌉` | 12-bit pixels packed high nibble first: `R0G0 B0R1 G1B1` | ST7789/ST7735 12-bit mode (COLMOD 0x03) |
| 3 | `rgb666` | `3w` | bytes R, G, B, each channel in the high 6 bits | ILI9341, ILI9488, ST7796 18-bit mode over SPI |
| 4 | `rgb888` | `3w` | bytes R, G, B | 24-bit panels, host tools |
| 5 | `gray8` | `w` | one byte per pixel, 0 black, 255 white | grayscale displays, intermediate buffers |
| 6 | `gray4` | `⌈w / 2⌉` | two pixels per byte, high nibble first, 0 black, 15 white | SSD1322, SSD1327, SSD1362 OLEDs |
| 7 | `mono` | `⌈w / 8⌉` | one bit per pixel, most significant bit first, 1 lit (white) | e-paper, Sharp memory LCDs, ST7920 |
| 8 | `mono_vpage` | — | pages of 8 rows, top to bottom; each page is `w` bytes left to right; bit `k` (least significant first) of a byte is row `8p + k`. `S = w × ⌈h / 8⌉` | SSD1306, SH1106, ST7567 |

Displays whose 1-bit convention is "1 is black" invert on the device, or the
encoder inverts the image; the format itself always means 1 lit.

## Validation

A conforming reader rejects a file when any of these hold:

- the magic differs, or the version is not 6, 7 or 8;
- width, height or frame count is 0, or the rate is out of range;
- in versions 7 and 8: `H` < 16, or the pixel format, codec or a frame type
  is reserved (type 4 is reserved in version 7), or `K` = 0;
- a record length is 0 or runs past the end of the data, or bytes remain
  after the last record;
- a frame `i` with `i mod K = 0` is not a keyframe;
- a repeat record has a body, or a stored keyframe or delta body is not
  exactly `S` bytes;
- a partial delta has `B` = 0, is too short for its mask and shifts, sets no
  band or a bit from `N` on, has a shift with `|dy|` ≥ `B`, or (stored) its
  data is not exactly the size of its changed bands;
- a region delta fails any of those checks (with 6 bytes per changed band
  instead of 2), or has a range with `xw` = 0, `x0 + xw` > `R`, or an
  unaligned start or end, or (stored) its data is not exactly the size of
  its ranges;
- zlib data does not inflate to exactly its expected size.

All but the last are checked when the file is opened, by one linear scan of
the record lengths that also builds the frame index. Readers may also reject
dimensions or formats their display does not support.

## Decoding

A player decoding frames in order keeps the previous frame, which it already
has for the display. Keyframes decode on their own; a delta decodes into the
frame buffer and is then XORed with the previous frame (or, in place, decodes
to a scratch buffer of `S` bytes and is XORed into the previous frame); a
repeat costs nothing and need not be sent to the display again. A partial
delta is decoded like a delta but only over its changed bands, and only those
bands need to be sent to the display: on SPI panels, set the column and row
window to each run of changed bands. A region delta is decoded the same way
over its ranges, and each changed band's range is one window.

To seek to frame `i`, decode keyframe `k = i − (i mod K)`, then apply records
`k + 1` … `i`.

## Indexing and decode cost

One linear scan of the record lengths gives every record's offset, after
which lookup is O(1). Inflate time depends only on the body: the RV565 paper
(arXiv:2610.35935) measured it as linear in `L` on the ESP32-S3, so a reader
can predict from the length table alone whether a clip will play at its rate
before decoding anything. A delta adds one pass of XOR over `S` bytes; a
partial delta, one pass over its changed bands; a region delta, one pass
over its ranges. The band mask (and a region delta's ranges) also tell a
player how much of the frame it must transfer, before decoding.

## Writing

The reference encoder (`rv565 encode`, the `rv565` Python package) converts
and resamples on the host, so the device only decodes and transfers. With
`K` > 1 it writes a repeat when a frame equals the previous one, and otherwise
the smallest of a delta and a keyframe, or a partial delta (bands of 8 lines
by default) when it is at most 2% (and at least 16 bytes) larger, because it
saves the display transfer of every unchanged band. For each changed band it
searches a shift within a motion range (by default 8 pixels across and
`B − 1` lines): `dy` in the order 0, −1, +1, −2, +2, …, and for each, `dx` in
the order 0, −s, +s, −2s, +2s, … up to the range, where `s` is 2 bytes for
`rgb565*`, 3 for `rgb666`, `rgb888` and `rgb444` (two pixels), and 1 for
the others; a range of `m` pixels is `2m`, `3m`, `3⌊m / 2⌋`, `m`, `⌊m / 2⌋`,
`⌊m / 8⌋` and `m` bytes for `rgb565*`, `rgb666`/`rgb888`, `rgb444`,
`gray8`, `gray4`, `mono` and `mono_vpage`. It keeps the first shift with the
fewest nonzero residual bytes. It uses zlib level 1, the configuration the paper measured, unless
told otherwise.

It also builds a region delta, unless asked for version 7: each changed
band's range is the bytes that differ from `F[i−1]` in any of its lines,
widened to whole pixels, and the shift search counts nonzero residual bytes
inside that range. It prefers a region delta, then a partial delta, whenever
that is at most 2% (and at least 16 bytes) larger than the smallest option,
and does not write a region delta whose every range is a whole line (a
partial delta says the same in fewer bytes). A file is written as version 8
only if it contains a region delta.

**Tolerance** (encoder only; the format is unchanged). With a tolerance `T`
of 1–255, the encoder keeps a pixel of the previous decoded frame wherever
every channel of the new pixel, expanded to 8 bits, is within `T` of it.
The encoder compares against what the decoder will show, so no pixel is ever
more than `T` from the source frame converted to the pixel format, and
unchanged regions become repeats and skipped bands. `T` = 0, the default, is
lossless.

Colour conversion from 8-bit RGB, used by every reference encoder so that
they produce identical frames:

| Format | From `(r, g, b)` |
| --- | --- |
| `rgb565*` | `r5 = r >> 3`, `g6 = g >> 2`, `b5 = b >> 3` |
| `rgb444` | `r >> 4`, `g >> 4`, `b >> 4` |
| `rgb666` | `r & 0xFC`, `g & 0xFC`, `b & 0xFC` |
| `gray8` | `Y = (299r + 587g + 114b + 500) // 1000` |
| `gray4` | `Y >> 4` |
| `mono`, `mono_vpage` | 1 when `Y` ≥ 128 |

## Version 6

Version 6 is the format of RV565 1.x. Its header is the first 12 bytes above
with version `6` and a rate of 1–30; records start at offset 12 and are a
32-bit length followed by a zlib stream, with no type byte. A version 7
reader treats it as `H` = 12, pixel format 0, codec 1, `K` = 1, every record
a keyframe. Writers can still produce it for players that predate 2.0, and
version 7 for players that predate 3.0.

## Conformance vectors

`tests/data/v7/` holds one file per pixel format and codec, clips with
deltas, partial deltas and repeats, the version 6 test pattern, and invalid
files; `tests/data/v8/` holds clips with region deltas in every pixel format
and codec, and invalid region deltas. Each directory's `manifest.json` lists, for every valid file, its header fields
and the SHA-256 of each decoded frame, and for every invalid file the reason
it must be rejected. Every RV565 implementation (the C library, the Python
package, CircuitPython, the browser converter and the MicroPython module)
checks itself against these files in CI, so none needs a board or a display
to prove it decodes the format.

`tests/data/testpattern.rv565` (version 6, 24 frames of scrolling colour
bars, 180×135, 24 FPS, 6,322 bytes) has SHA-256

    5908de84764962132f31543df0ca2276d10d7744fa2c292caf5fde3f66faa8a7
