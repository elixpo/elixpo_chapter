# Changelog

All notable changes to RV565 are listed here. The project follows
[semantic versioning](https://semver.org).

## Unreleased

- LVGL widget: `lv_rv565_set_auto_pause_invisible()` holds the current
  frame while the widget can't be seen (hidden, scrolled or clipped out of
  view) and carries on from it when it can, without catching up on the time
  it was away. Off by default, as in `lv_gif`. Tested against LVGL 9.2.2 and
  9.4.0.
- Python encoder: frames with lines wider than 65535 bytes (for example,
  more than 32767 px of `rgb565be`) no longer fail with a `struct.error`
  when the changed range can't fit a region delta's 16-bit `x0`/`xw`
  fields; that frame falls back to a partial delta, a delta or a keyframe.
  Found in review of the FFmpeg encoder, which had the same limit.

## 3.0.0 — 2026-11-20

Version 3.0.0 introduces RV565 format version 8 (`docs/FORMAT.md`): a new
frame type, the **region delta** (type 4). Like a partial delta it stores
only the bands of rows that changed, each with a shift, but each band also
gives the byte range of its lines that changed, so a player decodes and
sends to the display only that rectangle. On the Falera Badge (ESP32-S3,
ST7789 at 40 MHz) the SPI transfer of a UI animation falls from 14.8 to
6.2 ms per frame against version 7, and of low-motion film from 27.5 to
15.8 ms, with every frame on time (`docs/RESULTS_V8.md`). A file is written
as version 8 only when it holds a region delta; every reader accepts
versions 6, 7 and 8, and a region delta in a version 7 file is invalid.

The major version changes because files written by default can now be
version 8, which 2.x readers reject. Write `--v7` (CLI) or `version=7`
(Python) for players still on 2.x.

- **Format:** region delta body = band height, band mask, 6 bytes per changed
  band (dx, dy, first byte, byte count), then each range's residual through
  the codec. Ranges start and end on whole pixels (2 bytes for `rgb565*`,
  3 for `rgb444`/`rgb666`/`rgb888`, 1 otherwise) or at the line's end.
- **Conformance vectors** in `tests/data/v8` (24 valid, 12 invalid), written
  and checked by `tools/make_conformance.py`; every implementation is tested
  against them in CI alongside `tests/data/v7`.
- **C library:** `rv565_rect_t`, `rv565_changed_rects()` (the windows a frame
  needs, without decoding), `rv565_region_rects()`, `rv565_region_runs()`,
  `rv565_apply_region()`, `rv565_byte_columns()` (byte range to pixel
  columns), `rv565_pixel_align()`, `RV565_FRAME_REGION`, `RV565_CONTAINER_V8`.
  `RV565_ERR_PARTIAL` now also covers invalid region deltas.
- **Player:** a `begin_window(x, y, w, h)` display operation; with it, region
  deltas are sent as one window per changed band (bands with the same columns
  that touch share one), up to `RV565_PLAYER_MAX_RECTS` (32) bands, else as row
  windows. `rv565_frame_stats_t.pixels_sent` reports the panel pixels sent.
  The ESP32 and RP2 ports and the LovyanGFX and TFT_eSPI examples implement
  `begin_window`; `rv565_st7789_columns()` builds the column address command.
- **MicroPython module:** `apply_region()`, and `FORMAT_VERSION` is 8.
- **Python package and CLI:** the encoder writes region deltas when they
  help (not when every range is the full line), `Clip.changed_rects()`,
  `FRAME_TYPES` includes `"region"`, `rv565 encode --v7`, and `rv565 info`
  reports region frames and the share of pixels and windows sent.
- **CircuitPython library:** region deltas, `changed_rects()`,
  `dirty_rects()`, `columns()`, and windowed `Player`/`DirectPlayer` writes.
- **Benchmarks and tools:** `benchmarks/esp32s3_v7_player` reports pixels
  sent and region frames; `tools/compare_zmbv.py` compares version 7,
  version 8 and FFmpeg's ZMBV on the same frames.
- **Signatures:** `contrib/file/rv565.magic`, the shared-mime-info entry,
  the Kaitai Struct description and the PRONOM submission describe version 8.
- **LVGL widget:** `lv_rv565` in `ports/lvgl/`, an LVGL 9 widget that plays
  RV565 clips, modelled on `lv_gif` (#25). It plays `rgb565le`, `rgb565be`
  and `gray8` clips from memory or through `lv_fs`, invalidates only the
  rows a partial delta changes and only the rectangles a region delta
  changes, and supports pause, resume, restart, loop counts and
  `LV_EVENT_READY`. A host test plays every version 7 and 8 conformance
  clip on LVGL 9.2.2 and 9.4.0, checks each frame pixel for pixel and the
  areas each region delta invalidates; CI runs it.

## 2.0.1 — 2026-11-19

Documentation only; the format, encoder, decoders and players are unchanged.
OreoOS, the operating system RV565 was built for, is now FaleraOS (the badge
is the Elixpo Falera Badge), so the READMEs, docs and links name FaleraOS,
elixpo/falera and falera.elixpo.com (the converter is at
https://falera.elixpo.com/rv565/convert/). Released on every channel so the
Arduino, ESP Component Registry and PyPI pages show the new text.

## 2.0.0 — 2026-11-12

Version 2.0.0 introduces RV565 format version 7 (`docs/FORMAT.md`): the
header declares one of nine pixel formats (`rgb565be`, `rgb565le`, `rgb444`,
`rgb666`, `rgb888`, `gray8`, `gray4`, `mono`, `mono_vpage`) and a codec
(stored or zlib), frames are keyframes, exact XOR deltas, partial deltas
or repeats, and a keyframe interval keeps seeking bounded. A partial delta
stores only the bands of rows that changed, each with a shift, so players
decode and send to the display only those rows, and scrolling content costs
a small residual. Version 6 files stay readable everywhere.

- Conformance vectors in `tests/data/v7` (53 valid files with each decoded
  frame's SHA-256 and changed lines, 29 invalid files with the stage that
  must reject them),
  written and checked by `tools/make_conformance.py`. Every implementation
  is tested against them in CI.
- Python package 2.0.0, the reference implementation: `rv565.write()` takes
  `pixel_format`, `codec`, `keyframe_interval` and `version=6`;
  `rv565.convert()` and `rv565.to_rgb888()` handle every pixel format;
  `Clip.frame_type()`, and `Header` gains `version`, `header_size`,
  `pixel_format`, `codec` and `keyframe_interval`. `rv565 encode` and
  `testpattern` take `--format`, `--codec`, `--keyframe-interval` and `--v6`;
  `encode` now writes version 7 with one keyframe per second by default.
  `rv565 info` reports the format, codec and frame types. The Pillow plugin
  opens every pixel format and saves with the same options.
- The reference encoder writes partial deltas (`band_lines`, 8 by default;
  `--band-lines`), searches a shift per changed band (`motion_range`, 8
  pixels; `--motion-range`), and takes a tolerance (`tolerance`,
  `--tolerance`, 0 by default): it keeps a pixel of the previous decoded
  frame when every channel is within T, so the error stays bounded by T.
  `Clip.changed_lines()` and `rv565.frame_lines()` give the rows a frame
  changes; `rv565 info` reports the share of lines sent to the display.
  `tools/measure_v7.py` and `tools/make_ui_clip.py` measure size, PSNR and
  display traffic.
- `docs/RESULTS_V7.md`: sizes, PSNR and display traffic on the paper's film
  windows and a UI clip, against MJPEG and ZMBV. Lossless, version 7 is
  5.5× (W90) and 2.1× (W360) smaller than version 6; at tolerance 8 the W90
  clip is 2.3× smaller than MJPEG q2 at 5.4 dB better; the UI clip is
  lossless at 6% of MJPEG q2's size and sends 44% of the rows. MJPEG stays
  smaller on high-motion film, and ZMBV on the UI clip.
- `benchmarks/esp32s3_v7_player`: version 7 playback on the Oreo Badge
  (ESP32-S3, ST7789 at 40 MHz). Partial deltas cut the mean frame time of
  the UI clip from 31.4 to 14.8 ms dual-core (34.4 to 16.6 ms serial) and of
  the W90 film window by 12%; every clip played every frame on time, and W90
  decodes in 3.6 ms per frame.
- `contrib/ffmpeg`: the FFmpeg decoder, demuxer and muxer read and validate
  partial deltas with shifted bands, and the encoder writes them
  (`-band_lines`, `-motion_range`) and takes `-tolerance`, byte-identical to
  `rv565.write` with the same options; checked against all 53 valid and 29
  invalid conformance vectors and FATE. The Kaitai Struct description gains
  the partial delta frame type and body.

Version 2.0.0 of the C library reads RV565 format version 7
(`docs/FORMAT.md`) and keeps reading version 6.

- Format version 7 in the core (`rv565.h`): nine pixel formats
  (`rv565_pixel_format_t`, `RV565_PIXEL_RGB565BE` … `RV565_PIXEL_MONO_VPAGE`),
  codecs stored and zlib (`rv565_codec_t`), keyframe, delta and repeat
  frames (`rv565_frame_type_t`) and the keyframe interval. Still
  allocation-free; the zlib path still uses the ESP32 ROM tinfl or the
  bundled one.
- `rv565_open()` validates everything the spec checks at open time in its one
  linear scan: reserved pixel format, codec or frame type, `K` = 0, a missing
  keyframe at a multiple of `K`, a repeat with a body, a stored body that is
  not `S` bytes, truncation and trailing bytes. Rates up to 60 FPS in
  version 7 (30 in version 6).
- New: `rv565_decode(clip, i, prev, dst, dst_len, scratch, scratch_len)`
  (keyframe, delta against `prev`, repeat; in place with a scratch buffer
  for zlib deltas, or between two buffers without one), `rv565_seek()`
  (from the keyframe at or before a frame), `rv565_frame_type()`,
  `rv565_keyframe_at_or_before()`, `rv565_row_bytes()`,
  `rv565_bytes_per_pixel()`, and `rv565_scale_stripe_bpp()` for 1-, 2- and
  3-byte pixels (packed formats are not scaled).
- Player: deltas decode into the frame buffer that is not on screen, using
  the presented frame as their base; repeats decode nothing and are not sent
  to the display again; after a pacer skip the player applies the skipped
  records the delta chain needs (at most `K` − 1) without showing them.
  `rv565_frame_stats_t` gains `decoded` and `rows_sent`. Only RGB565
  big-endian clips play (the bundled ST7789 drivers run the panel in
  RGB565); other formats return `RV565_ERR_UNSUPPORTED` from
  `rv565_player_init()`.
- Partial deltas (frame type 3) with band shifts in the core:
  `rv565_open()` validates them in its scan (`RV565_ERR_PARTIAL` for a band
  height of 0, a short mask, no band or a band past the frame, missing
  shifts or a shift of `B` lines or more; `RV565_ERR_RECORD` for stored data
  of the wrong size). `rv565_decode()` builds each changed band as its
  shifted prediction XOR its residual: in place it writes only the changed
  bands and needs no band copy (zlib residuals go through `scratch`, at most
  `S` bytes); between two buffers it writes the whole frame without scratch.
  New: `rv565_changed_lines()` (the changed line runs of a frame, without
  decoding), `rv565_frame_lines()` (`P` and `R`), and, for readers that parse
  the container themselves, `rv565_partial_runs()` and
  `rv565_apply_partial()` on a raw body.
- The player sends only what changed: it tracks the frame on the panel and,
  for a partial delta, transfers only the panel rows scaled from its changed
  lines, one row window per run, through the new optional
  `rv565_display_ops_t.begin_rows`; keyframes and full deltas send the whole
  frame, repeats nothing, and after skips the envelope of the changes is
  sent. The ESP32 and RP2 ST7789 ports implement `begin_rows` with RASET
  (`rv565_st7789_rows()` in `port/st7789_init.h`) and restore the full
  window for the next whole frame; the TFT_eSPI and LovyanGFX examples
  implement it with `setAddrWindow`. Without `begin_rows` every change is a
  whole-frame write. A clip with zlib partial deltas needs `frames[1]`.
- `rv565_check_schedule()` models repeats as costing no decode, and applies
  the cost model to the body length (type byte excluded).
- MicroPython module (`ports/micropython`): `inflate_delta(body, prev, frame[,
  scratch])`, `xor_frame(frame, other)`, `apply_partial(body, frame,
  line_bytes, zlib[, scratch])` (applies a partial delta in place and returns
  its changed line runs) and `FORMAT_VERSION`; `inflate_frame()` is
  unchanged. The module now links `src/rv565.c`.
- Tests: `tests/test_conformance.c` and `tests/check_conformance.py` decode
  every vector in `tests/data/v7` in order (in place and between two
  buffers) and by seeking, compare each frame's SHA-256 with the manifest,
  and check that every invalid file is rejected at the right stage with the
  matching status, and compare `rv565_changed_lines()` with each frame's
  changed lines. `make -C tests` runs them. The player test plays the
  rgb565be vectors and synthetic stored and zlib clips with scattered bands
  and shifts, checks the panel after every frame and the exact number of
  rows sent. CI also runs the tests under ASan/UBSan and checks
  the vectors with `tools/make_conformance.py --check`.

API changes from 1.x (source-incompatible where noted):

- `rv565_header_t` gains `version`, `header_size`, `pixel_format`, `codec`
  and `keyframe_interval`. Code that fills a header by hand must set them.
- `rv565_frame_bytes()` is a function instead of a static inline and follows
  the pixel format.
- `RV565_MAX_FPS` is 60 (version 7); `RV565_MAX_FPS_V6` is 30.
  `RV565_HEADER_SIZE` is replaced by `RV565_HEADER_SIZE_V6` (12) and
  `RV565_HEADER_SIZE_V7` (16, the minimum).
- `rv565_clip_t.index[i]` points just past each record's length: at the type
  byte in version 7. `rv565_payload()` returns the body without the type
  byte (length 0 for a repeat).
- `rv565_decode_frame(clip, i, dst, len)` decodes in place: a keyframe on its
  own, otherwise `dst` must hold frame i−1, and a zlib delta returns
  `RV565_ERR_ARG` (use `rv565_decode()` with scratch or two buffers).
- `rv565_parse_header()` returns `RV565_ERR_TRUNCATED` (not
  `RV565_ERR_ARG`) for fewer than 12 bytes.
- New status codes: `RV565_ERR_FORMAT`, `RV565_ERR_KEYFRAME`,
  `RV565_ERR_RECORD`, `RV565_ERR_UNSUPPORTED`, `RV565_ERR_PARTIAL`.
- `rv565_display_ops_t` gains `begin_rows` (last member, optional).
- `rv565_decoder_ops_t.start` takes the previous frame:
  `start(ctx, index, prev, dst, dst_len)`, and the struct gains an optional
  `decode` hook for the serial path. Backends call `rv565_decode(clip,
  index, prev, dst, dst_len, NULL, 0)`.
- `rv565_player_t`: `frames[1]` is required for clips with zlib deltas or
  zlib partial deltas, even on the serial path; the state fields changed
  (`ready_frame` is gone; `current`, `held[]`, `shown`).

- CircuitPython library 2.0.0 (`ports/circuitpython/`): reads format
  version 7 as well as version 6, with every pixel format, the stored and
  zlib codecs, and keyframe, XOR delta and repeat frames, validated on open
  and indexing as the reference does, and checked in host tests against every
  conformance vector in `tests/data/v7` (in order and by random seeks). It
  decodes into one reused frame buffer, so `Clip.frame()` returns a buffer
  that the next call overwrites, and XORs deltas in 2 KiB chunks through long
  integers. `Player` shows `rgb565be`, `rgb565le`, `gray8`, `gray4` and
  `mono`, and `DirectPlayer` sends `rgb565be` and `rgb666` (COLMOD 0x66);
  both skip repeat frames and name the supported formats for any other clip.
  The version 7 paths have not yet run on a board.
- CircuitPython library: partial delta frames (type 3). The index checks
  each partial delta's band height, band mask, band shifts and stored size;
  decoding inflates only the changed bands, predicts shifted bands from a
  one-band scratch copy, and XORs the residuals in place into the reused
  frame buffer. `Clip.changed_lines(i)` matches the reference and
  `Clip.dirty_lines(since, i)` merges it over skipped frames. `DirectPlayer`
  sends one row window and write per run of changed bands, `Player` copies
  only the changed rows into the bitmap (`readinto` into a scratch band,
  then `bitmaptools.blit`) so `displayio` refreshes only that area, and
  `PlayStats.rows_updated` counts the rows drawn. Host-tested only.
- Experimental CircuitPython library, `ports/circuitpython/`
  (`circuitpython_rv565`): reads version 6 files from a path, file object or
  bytes with a lazily built frame index, inflates with the built-in `zlib`,
  and plays through `displayio` (`Player`) or straight to an ST7789 over its
  bus (`DirectPlayer`), paced to the clip's rate with frame skipping. Host
  tests with CPython and fake `displayio`; not yet run on a board. Expect a
  few FPS ([#30](https://github.com/elixpo/rv565/issues/30)).
- `contrib/`: the FFmpeg patches (now two, `avcodec` and `avformat`) read
  and write format version 7, with every pixel format, stored or zlib frames,
  keyframe/delta/repeat frames and keyframe seeking, and still read and write
  version 6; they pass the `tests/data/v7` conformance vectors and FATE. The
  `file(1)`, shared-mime-info, PRONOM and Kaitai Struct signatures recognise
  version 7 as well as version 6.

## 1.2.0 — 2026-11-04

- RP2350 cost model `RV565_COST_RP2350_180x135` (8.108 ms + 0.2446 µs/byte,
  r² 0.9984), measured on a Pico 2 with the paper's method; results in
  `docs/RESULTS_RP2350.md`. Dual-core playback runs at 24 FPS with zero
  misses on both film windows; the serial path cannot (every frame late).
- The RP2 port is no longer experimental on the RP2350 and joins the 1.x
  compatibility promise; on the RP2040 it compiles but is not yet run.
- Python: `COST_RP2350_180x135`, and `rv565 info --chip esp32s3|rp2350` picks
  the cost model and that chip's measured display transfer.
- Bundled inflate (RP2 and other non-ESP32 targets) keeps its ~11 KB
  decompressor in static memory instead of on the stack. On the RP2040/RP2350
  core 0 has a 2 KB stack, so inflating there (serial mode, or the Pico
  example's single-core path) overflowed it. The ESP32 ROM path is unchanged.
- RP2 port runs on hardware: first bring-up on a Raspberry Pi Pico 2 with a
  2.0" 320x240 ST7789, 24 FPS with zero misses on the test pattern.
  - Command bytes (the init sequence and each frame's RAMWR) now go out at
    10 MHz; at 37.5 MHz the panel misread them and stayed blank. Pixel data
    still runs at the configured rate.
  - SPI mode 3 instead of mode 0: the RP2350's PL022 leaves a gap after every
    byte in mode 0. Measured frame time 39.71 ms → 33.57 ms; the transfer
    now runs at 99.4% of the 37.5 MHz wire time (83.8% before).
- RP2350 benchmark: wiring notes (short wires, a series resistor on SCL) and
  `st7789_test.py`, a MicroPython wiring check.

## 1.1.0 — 2026-11-01

- Any ST7789 module: the ESP32 and RP2 display configs take an
  `rv565_panel_t` (size, controller offset, MADCTL rotation, inversion), with
  presets for 320x240, 240x320, 240x240, 135x240 and 240x135 in
  `rv565_panel.h`. A zeroed panel keeps the 1.0 behaviour (320x240
  landscape), so existing code is unchanged. Only 320x240 is verified on
  hardware so far.
- Examples show where to pick the panel.
- `examples/TFT_eSPI_Player` and `examples/LovyanGFX_Player`: keep your
  display library for the panel and use RV565 for decoding (compiled in CI,
  not yet run on hardware).
- Python package `rv565` (`python/`): read, write, verify and schedule-check
  files, the `rv565` command (which `tools/rv565.py` now wraps), and a Pillow
  plugin (`import rv565.pillow`). Published to PyPI with the same version.
- `contrib/`: file type registration for `.rv565` (`file(1)` magic,
  shared-mime-info `video/x-rv565`, PRONOM fields) and an FFmpeg patch
  (decoder, encoder, demuxer, muxer), prepared for upstream submission.
- `docs/FORMAT.md` gains an identification section (extension, MIME type,
  signature).

## 1.0.0 — 2026-10-31

First stable release. The container format (version 6) and the public API are
now covered by the 1.x compatibility promise; see *Versioning* in the README.

- Core: header parsing and validation, O(1) frame index, exact-length
  inflate, nearest-neighbour stripe scaler, decode-cost model,
  schedulability check, absolute-deadline pacer.
- Player: two-stripe DMA pipeline with optional second-core decoding.
- ESP32 port (ESP-IDF and Arduino-ESP32), verified on the ESP32-S3 badge.
- RP2040/RP2350 port (Pico SDK and Arduino-Pico), experimental: compiled in
  CI, not yet run on hardware.
- `tools/rv565.py`: encode, info, verify, c-array, testpattern.
- Published in the Arduino Library Manager.

## 0.1.0 — 2026-10-31

Initial listing in the Arduino Library Manager.
