# RV565 ecosystem plan

Goal: developers install RV565 from an official platform, not only read about
it in the paper ([arXiv:2610.35935](https://arxiv.org/abs/2610.35935)).

Scope is deliberately narrow — three ecosystems where the work already fits
and admission is decided by packaging quality rather than a maintainer's taste:

| Ecosystem | Official channel | Gatekeeping |
| --- | --- | --- |
| Espressif | ESP Component Registry | Manifest + upload; a custom namespace needs Espressif approval |
| Arduino | Arduino Library Manager | Automated checks on a PR to `arduino/library-registry` |
| Raspberry Pi Pico 2 | Arduino-Pico (via the Arduino library) and the Pico SDK | None for the library; reach comes through Arduino and the forum |

These three were the 1.0 scope. What comes next (display-library examples,
PyPI and Pillow, the online converter, file-type registries, FFmpeg, and the
Pico 2 measurements) is planned in [ROADMAP.md](ROADMAP.md).

## Decision: one repository, three front doors

This repository is laid out so each ecosystem recognises it unchanged:
`library.properties` (Arduino), `idf_component.yml` (ESP-IDF), and a
`CMakeLists.txt` that registers an ESP-IDF component under ESP-IDF and an
INTERFACE library under the Pico SDK. One Arduino library covers both chip
families because Arduino-Pico supports RP2040/RP2350 and Arduino-ESP32 covers
the ESP32-S3. ESP32 uses the ROM inflater; other targets use the bundled miniz
subset.

## Progress

### Library foundation

- [x] History of the RV565 files extracted from OreoOS (8 commits) as the base of this repository.
- [x] Portable core: parsing, validation, O(1) index, exact-length inflate, scaler, cost model, schedulability, pacer.
- [x] Player: stripe pipeline with optional second-core decoding.
- [x] Bundled inflate-only miniz with `rv565_`-prefixed symbols.
- [x] Host tests: all 240 frames of both paper windows match zlib; player draws serial and overlap paths pixel-exactly; malformed files rejected.
- [x] `tools/rv565.py`: encode, info (with schedule prediction), verify, c-array, testpattern.
- [x] Format specification with a test vector (`docs/FORMAT.md`).
- [x] CI: host tests, Arduino lint, Arduino builds (ESP32-S3, Pico 2), ESP-IDF build, Pico SDK build.

### 1. Espressif

- [x] ESP32 port (SPI GDMA + core-1 FreeRTOS worker) lifted from the measured benchmark.
- [x] `idf_component.yml` (target esp32s3) and `examples_idf/player`; compiles locally with ESP-IDF 5.5.1.
- [x] Flash the example and confirm playback on the badge (180x135 @ 24 FPS, 0 predicted late frames).
- [x] Request the `elixpo` namespace (submitted 2026-10-31, under review).
- [ ] Run the publish workflow once the namespace is approved.
- [ ] Developer Portal article (discussion first in `espressif/developer-portal`; Hugo, WebP images).
- [ ] Test and list further targets (esp32 dual-core; single-core chips use the serial path).

### 2. Arduino

- [x] `library.properties` (`architectures=esp32,rp2040`), `src/RV565.h` entry point.
- [x] `examples/ESP32S3_Player` compiles locally with Arduino-ESP32 3.3.8.
- [x] `examples/Pico2_Player` (compiled in CI).
- [x] Confirm the name *RV565* is free in the Library Manager index.
- [x] Tag `v0.1.0`, then PR the repository URL to `arduino/library-registry` (accepted in arduino/library-registry#9534).
- [ ] Arduino Project Hub write-up with a video of the badge.

### 3. Raspberry Pi Pico 2

- [x] RP2 port (SPI DMA + core-1 worker with a 24 KiB stack) and Pico SDK example.
- [ ] Bring up on a Pico 2 + ST7789; confirm the image and colours.
- [ ] Measure W90/W360, serial vs overlap, with the paper's methodology.
- [ ] Refit the cost model for RP2350 (no ROM inflater) and add it next to the ESP32-S3 model.
- [ ] Post results in the Raspberry Pi forums; consider a follow-up paper (second platform answers a stated limitation).

## Positioning

As a file format, RV565 is simple (length-prefixed zlib RGB565 frames). Lead
with what the library enables: decode time predictable from the file before
playback, O(1) seeking, and 24 FPS on a dual-core microcontroller with
headroom.
