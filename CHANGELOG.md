# Changelog

All notable changes to RV565 are listed here. The project follows
[semantic versioning](https://semver.org).

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
