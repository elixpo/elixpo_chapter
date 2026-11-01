# PRONOM submission: RV565 video

Fields for the PRONOM new-format form at The National Archives
(https://www.nationalarchives.gov.uk/PRONOM/), with a sample file to attach.

| Field | Value |
| --- | --- |
| Format name | RV565 Video |
| Version | 6 |
| Other names | RV565 container; frame-independent RGB565 video |
| File extension | `rv565` |
| MIME type | `video/x-rv565` |
| Format type / classification | Video |
| Byte order | Little-endian |
| Developer | Ayushman Bhattacharya and Anwesha Chakraborty (Elixpo) |
| Release date | 2026-10-31 (library 1.0.0; specification version 6) |
| Licence | Specification and reference code MIT |
| Specification | https://github.com/elixpo/rv565/blob/main/docs/FORMAT.md |
| Further reading | Bhattacharya, A. and Chakraborty, A. (2026). *RV565: Cross-Layer Co-Design for Frame-Independent Video Playback on MicroPython-Class ESP32-S3 Systems.* arXiv:2610.35935. https://arxiv.org/abs/2610.35935 |
| Related formats | Contains zlib (RFC 1950) compressed streams |
| Sample file | `tests/data/testpattern.rv565` (6,322 bytes, SHA-256 `5908de84764962132f31543df0ca2276d10d7744fa2c292caf5fde3f66faa8a7`) |

## Description

RV565 is a video container for microcontrollers driving RGB565 SPI displays
such as the ST7789. A 12-byte header (magic `RV5`, version, width, height,
frames per second, flags, frame count) is followed by one record per frame: a
32-bit little-endian payload length and a zlib stream that inflates to exactly
width × height × 2 bytes of big-endian RGB565 pixels. Frames are independent,
so any frame can be decoded on its own and the payload lengths allow decode
time to be predicted before playback. There is no audio.

## Internal signature

One byte sequence, anchored at the beginning of file (BOF), offset 0:

    52563506{4}[01:1E]{7}78

| Bytes | Meaning |
| --- | --- |
| `52 56 35` | ASCII `RV5` |
| `06` | container version 6 |
| `{4}` | width and height (u16 each) |
| `[01:1E]` | frames per second, 1–30 |
| `{7}` | flags (1), frame count (2), first frame length (4) |
| `78` | zlib header of the first frame (CMF byte, deflate with 32 KiB window) |

Flags are not part of the signature because readers must ignore unknown bits.

## Contact

Ayushman Bhattacharya, ayushman.elixpo@gmail.com
