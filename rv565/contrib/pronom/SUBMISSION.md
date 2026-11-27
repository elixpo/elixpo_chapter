# PRONOM submission: RV565 video

Fields for the PRONOM new-format form at The National Archives
(https://www.nationalarchives.gov.uk/PRONOM/), with sample files to attach.
Versions 6, 7 and 8 are separate format records with separate signatures,
as PRONOM does for other versioned formats; versions 7 and 8 were added after
the version 6 submission (PRONOM_Research#202) and can be sent as updates to
it.

| Field | Value |
| --- | --- |
| Format name | RV565 Video |
| Version | 6; 7; 8 |
| Other names | RV565 container |
| File extension | `rv565` |
| MIME type | `video/x-rv565` |
| Format type / classification | Video |
| Byte order | Little-endian |
| Developer | Ayushman Bhattacharya and Anwesha Chakraborty (Elixpo) |
| Release date | Version 6: 2026-10-31 (library 1.0.0). Version 7: library 2.0.0. Version 8: library 3.0.0 |
| Licence | Specification and reference code MIT |
| Specification | https://github.com/elixpo/rv565/blob/main/docs/FORMAT.md |
| Further reading | Bhattacharya, A. and Chakraborty, A. (2026). *RV565: Cross-Layer Co-Design for Frame-Independent Video Playback on MicroPython-Class ESP32-S3 Systems.* arXiv:2610.35935. https://arxiv.org/abs/2610.35935 |
| Related formats | Contains zlib (RFC 1950) compressed streams (version 6; optional in versions 7 and 8) |
| Sample files | Version 6: `tests/data/testpattern.rv565` (6,322 bytes, SHA-256 `5908de84764962132f31543df0ca2276d10d7744fa2c292caf5fde3f66faa8a7`). Version 7: any valid file in `tests/data/v7/`, e.g. `rgb565be_zlib_k4.rv565` (listed with per-frame hashes in `tests/data/v7/manifest.json`). Version 8: any valid file in `tests/data/v8/`, e.g. `rgb565be_zlib_region_k5.rv565` (`tests/data/v8/manifest.json`) |

## Description

RV565 is a video container for microcontrollers driving small displays.
Frames are stored in the display's own pixel format, so a player only
decompresses and transfers them. A little-endian header (magic `RV5`,
version, width, height, frames per second, flags, frame count) is followed
by one record per frame, a 32-bit length and the frame data. There is no
audio.

**Version 6**: a 12-byte header; every frame is a zlib stream that inflates
to exactly width × height × 2 bytes of big-endian RGB565 pixels.

**Version 7**: the header grows to at least 16 bytes with a header size, a
pixel format (RGB565 big- or little-endian, packed RGB444, RGB666, RGB888,
8- or 4-bit grayscale, 1-bit monochrome in rows or in 8-row pages), a codec
(stored or zlib) and a keyframe interval. Each record starts with a frame
type: a keyframe, a delta (XOR with the previous frame), a repeat, or a
partial delta (only the bands of lines that changed, each a residual against
the previous frame's band shifted by a few bytes and lines). Every frame at a
multiple of the keyframe interval is a keyframe, so seeking needs no scan.

## Internal signatures

Both anchored at the beginning of file (BOF), offset 0.

### Version 6

    52563506{4}[01:1E]{7}78

| Bytes | Meaning |
| --- | --- |
| `52 56 35` | ASCII `RV5` |
| `06` | container version 6 |
| `{4}` | width and height (u16 each) |
| `[01:1E]` | frames per second, 1–30 |
| `{7}` | flags (1), frame count (2), first frame length (4) |
| `78` | zlib header of the first frame (CMF byte, deflate with 32 KiB window) |

### Version 7

    52563507{4}[01:3C]{3}10[00:08][00:01][01:FF]{4}00

| Bytes | Meaning |
| --- | --- |
| `52 56 35` | ASCII `RV5` |
| `07` | container version 7 |
| `{4}` | width and height (u16 each) |
| `[01:3C]` | frames per second, 1–60 |
| `{3}` | flags (1), frame count (2) |
| `10` | header size 16, as written by every version 7 writer |
| `[00:08]` | pixel format |
| `[00:01]` | codec: stored or zlib |
| `[01:FF]` | keyframe interval |
| `{4}` | first record length |
| `00` | first frame type: keyframe |

The header size may be larger in later minor revisions; the signature
requires 16 so that the first frame type is at a fixed offset.

### Version 8

    52563508{4}[01:3C]{3}10[00:08][00:01][01:FF]{4}00

The same fields as version 7, with container version `08`. Version 8 has the
version 7 header and adds one frame type (region deltas), so writers use it
only for files that contain one; a file that doesn't is written as version 7.

Flags are not part of any signature because readers must ignore unknown
bits.

## Contact

Ayushman Bhattacharya, ayushman.elixpo@gmail.com
