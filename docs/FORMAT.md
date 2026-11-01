# RV565 container format, version 6

RV565 stores video as independently compressed frames whose decoded bytes are
already in the native pixel format of RGB565 SPI panels. Any frame can be
decoded on its own, so seeking is O(1) and a damaged frame cannot affect others.

## Identification

| | |
| --- | --- |
| Extension | `.rv565` |
| MIME type | `video/x-rv565` |
| Signature | `RV5` at offset 0, version `6` at offset 3, a frame rate of 1–30 at offset 8, and `0x78` (zlib header) at offset 16 |

Signatures for `file(1)`, shared-mime-info and PRONOM are in `contrib/`.

## Layout

All multi-byte integers are little-endian.

| Offset | Size | Field | Constraint |
| --- | --- | --- | --- |
| 0 | 3 | Magic | ASCII `RV5` |
| 3 | 1 | Version | `6` |
| 4 | 2 | Width `w` | ≥ 1 |
| 6 | 2 | Height `h` | ≥ 1 |
| 8 | 1 | Frames per second | 1–30 |
| 9 | 1 | Flags | `0`; readers must ignore unknown bits |
| 10 | 2 | Frame count `n` | ≥ 1 |
| 12 | … | `n` frame records | see below |

Each frame record is a 32-bit compressed length `L` (≥ 1) followed by `L` bytes
of a zlib stream (RFC 1950 wrapping RFC 1951 Deflate). Records are contiguous;
the file ends exactly after the last record.

## Decoded frame

A payload must inflate to exactly `2 * w * h` bytes: `h` rows of `w` pixels,
row-major, top to bottom. Each pixel is 16-bit RGB565,

    p = (r5 << 11) | (g6 << 5) | b5

stored **big-endian** (high byte first), the byte order ST7789-class panels
expect on SPI. A decoder must reject a payload that inflates to any other
length.

## Reader validation

A conforming reader rejects a file when any of these hold:

- the magic or version differs;
- width or height is 0, the rate is outside 1–30, or the frame count is 0;
- a length field is 0 or runs past the end of the data;
- bytes remain after the last frame record;
- a payload does not inflate to exactly `2 * w * h` bytes.

Readers may also reject dimensions larger than their panel.

## Indexing and decode cost

One linear scan of the length fields gives every frame's offset, after which
lookup is O(1). Because frames share no state, inflate time depends only on
the payload: the RV565 paper (arXiv:2610.35935) measured it as linear in `L`
on the ESP32-S3, so a reader can predict from the length table alone whether a
clip will play at its rate before decoding anything.

## Writing

Encoders choose the zlib level; `tools/rv565.py encode` uses level 1, the
configuration measured in the paper. Frames should be resampled and converted
to RGB565 on the host so the device only inflates, scales and transfers.

## Test vector

`tests/data/testpattern.rv565` (24 frames of scrolling colour bars, 180×135,
24 FPS, 6,322 bytes) has SHA-256

    5908de84764962132f31543df0ca2276d10d7744fa2c292caf5fde3f66faa8a7

`tests/check_host.py` checks the C decoder against Python's zlib frame by frame.
