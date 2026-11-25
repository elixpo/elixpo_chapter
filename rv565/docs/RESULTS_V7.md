# Format version 7: sizes, quality and display traffic

Measured 2026-11-12 on the host with the reference encoder (Python package
2.0.0, `tools/measure_v7.py`), at 180×135 and 24 FPS, 240 frames per clip:

- **Film:** *Big Buck Bunny* 480p (SHA-256 `b2acb9bd…55b9a27`), the paper's
  10-second windows from 90 s (W90) and 360 s (W360), as in
  [`RESULTS_MJPEG.md`](RESULTS_MJPEG.md).
- **UI:** `tools/make_ui_clip.py`, a deterministic status screen: a static
  background and header, a clock, a progress bar, a spinner and a scrolling
  ticker, the kind of content small displays mostly show.

PSNR is computed as in `RESULTS_MJPEG.md`: against the RGB565 frames FFmpeg
produces from the source, in 8-bit RGB, pooled over all frames (worst frame
in brackets). "Lines sent" is the share of frame rows a player has to
transfer to the display: all of them for keyframes and deltas, the changed
bands for partial deltas, none for repeats. On the ESP32-S3 and RP2350 the
transfer, not the decoder, bounds the frame time (31.3 and 33.4 ms of the
41.7 ms budget at 24 FPS).

Playback was then measured on the Falera Badge (see
[On the badge](#on-the-badge-esp32-s3)).

## Results

Keyframe every 24 frames, bands of 8 lines, shift search ±8 pixels, zlib
level 9 unless noted. Tolerance 0 is lossless.

| Clip | Encoding | Size | Lines sent | Quality |
| --- | --- | ---: | ---: | --- |
| W90 | version 6 (paper) | 6.12 MiB | 100% | exact |
| W90 | version 7, tolerance 0 | 1.11 MiB | 87% | exact |
| W90 | version 7, tolerance 8 | 0.81 MiB | 75% | 40.2 dB (38.6) |
| W90 | version 7, tolerance 16 | 0.66 MiB | 57% | 37.2 dB (36.1) |
| W360 | version 6 (paper) | 8.54 MiB | 100% | exact |
| W360 | version 7, tolerance 0 | 4.07 MiB | 100% | exact |
| W360 | version 7, tolerance 8 | 3.06 MiB | 99% | 36.5 dB (35.3) |
| W360 | version 7, tolerance 16 | 2.38 MiB | 97% | 31.9 dB (31.2) |
| UI | version 7, tolerance 0, zlib level 1 | 0.16 MiB | 44% | exact |
| UI | version 7, tolerance 0 | 0.12 MiB | 44% | exact |

Without band shifts the UI clip is 0.49 MiB: the scrolling ticker accounts
for most of it, and a shift turns it into a near-empty residual. Without
partial deltas every row of every changed frame is sent.

## Against MJPEG and ZMBV

Same frames. MJPEG figures for the film are from
[`RESULTS_MJPEG.md`](RESULTS_MJPEG.md) (FFmpeg `-q:v`, 4:2:0); the UI figures
were measured the same way with `tools/encode_mjpeg_benchmark.py`. ZMBV is
FFmpeg's Zip Motion Blocks Video encoder (`-c:v zmbv -g 24`, RGB565
little-endian in AVI), which also combines zlib, XOR deltas and motion
vectors.

| Clip | Format | Size | Lines sent | Quality |
| --- | --- | ---: | ---: | --- |
| W90 | **RV565 v7, tolerance 8** | **0.81 MiB** | **75%** | **40.2 dB** |
| W90 | RV565 v7, tolerance 16 | 0.66 MiB | 57% | 37.2 dB |
| W90 | MJPEG q2 | 1.84 MiB | 100% | 34.8 dB |
| W90 | MJPEG q5 | 0.97 MiB | 100% | 32.1 dB |
| W90 | RV565 v7, lossless | 1.11 MiB | 87% | exact |
| W90 | ZMBV level 9, lossless | 1.14 MiB | 100% | exact |
| W360 | RV565 v7, tolerance 8 | 3.06 MiB | 99% | 36.5 dB |
| W360 | MJPEG q2 | 2.58 MiB | 100% | 33.9 dB |
| W360 | MJPEG q5 | 1.40 MiB | 100% | 30.9 dB |
| W360 | RV565 v7, lossless | 4.07 MiB | 100% | exact |
| W360 | ZMBV level 9, lossless | 4.05 MiB | 100% | exact |
| UI | **RV565 v7, lossless** | 0.12 MiB | **44%** | **exact** |
| UI | MJPEG q2 | 1.85 MiB | 100% | 31.8 dB |
| UI | MJPEG q5 | 1.14 MiB | 100% | 30.2 dB |
| UI | ZMBV level 9, lossless | **0.08 MiB** | 100% | exact |

What this shows:

- **Film with little motion (W90):** at tolerance 8 RV565 is 2.3× smaller
  than MJPEG at its best quality and 5.4 dB better, and sends a quarter fewer
  rows to the display. At tolerance 16 it is smaller than MJPEG q5 and 5 dB
  better.
- **Film with a lot of motion (W360):** MJPEG keeps the edge in size. At its
  best quality it is 16% smaller than RV565 at tolerance 8, which is 2.6 dB
  better; at lower quality MJPEG q5 is much smaller. RV565 sends almost every
  row here.
- **UI content:** RV565 is lossless at 6% of MJPEG q2's size, where JPEG
  blurs the text to 31.8 dB, and sends 44% of the rows.
- **ZMBV:** the same size as RV565 when both are lossless on film. On the UI
  clip ZMBV is 1.5× smaller: its motion vectors are per 16×16 block, RV565's
  per band of rows. ZMBV gives the device no way to send less than the whole
  frame, and its block motion compensation and AVI container are more work
  for a microcontroller than RV565's band copies.

## On the badge (ESP32-S3)

Measured 2026-11-12 on the Falera Badge: ESP32-S3 N16R8 at 240 MHz, 2.0"
320x240 ST7789 on SPI at 40 MHz, ESP-IDF 5.5.1, with
[`benchmarks/esp32s3_v7_player`](../benchmarks/esp32s3_v7_player) (the
library's player and ESP32 port, ROM `tinfl`). Each clip is the 180x135,
24 FPS, 240-frame clip above, lossless, scaled to the full panel. The
`_full` clips are the same video encoded with `--band-lines 0`, so every
changed frame is sent whole (and, having no partial deltas, no band shifts
either, which is why `ui_full` is a larger file). Figures are per frame,
from passes 2–4 of four (pass 1 includes start-up; all four agree within
0.05 ms). The frame budget at 24 FPS is 41.67 ms.

| Clip | Mode | Frame work mean (max) | Transfer mean | Decode mean | Rows sent | Late / skipped |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| UI | dual-core | **14.84 ms** (31.48) | 14.82 ms | 1.76 ms | 44.3% | 0 / 0 |
| UI, `--band-lines 0` | dual-core | 31.36 ms (31.44) | 31.35 ms | 3.04 ms | 100% | 0 / 0 |
| UI | serial | **16.59 ms** (34.70) | 14.82 ms | 1.76 ms | 44.3% | 0 / 0 |
| UI, `--band-lines 0` | serial | 34.40 ms (34.68) | 31.35 ms | 3.04 ms | 100% | 0 / 0 |
| W90 | dual-core | **27.50 ms** (31.44) | 27.47 ms | 3.63 ms | 86.9% | 0 / 0 |
| W90, `--band-lines 0` | dual-core | 31.36 ms (31.44) | 31.35 ms | 3.87 ms | 100% | 0 / 0 |
| W90 | serial | **31.11 ms** (41.42) | 27.47 ms | 3.63 ms | 86.9% | 0 / 0 |
| W90, `--band-lines 0` | serial | 35.23 ms (41.39) | 31.35 ms | 3.88 ms | 100% | 0 / 0 |

What this shows:

- **Partial deltas cut the frame time by the rows they do not send.** On the
  UI clip the mean frame takes 14.8 ms instead of 31.4 ms dual-core, and
  16.6 ms instead of 34.4 ms serial: 2.1× less, matching the 44% of rows
  sent. On film (W90) it is 12% less in both modes. The transfer is the
  frame time in dual-core mode, as in the paper, and partial deltas are the
  only thing here that shortens it.
- **The maximum is still a whole frame:** keyframes (one per second here)
  and frames that change everywhere send all 240 rows, so the worst frame is
  unchanged. Partial deltas lower the average load, freeing the bus and the
  CPU for the rest of the application, not the worst case.
- **Decode is short:** 3.6 ms per W90 frame (1.8 ms on the UI clip), against
  8.9 ms for the same frames as version 6 and 4.4–6.3 ms for MJPEG q5–q2
  with Espressif's SIMD decoder, both measured with the paper's benchmark in
  [`RESULTS_MJPEG.md`](RESULTS_MJPEG.md). That benchmark is a different
  firmware, so take the comparison as indicative: the version 7 bodies are
  4–6× smaller, and inflate time is linear in the body.
- **Every clip played every frame on time** in both modes, including W90
  serial, whose worst frame (41.4 ms, a keyframe) is just inside the budget.
  In the paper, version 6 W90 serial took 40.2 ms per frame on average.

## Reproduce

```bash
SRC=big_buck_bunny_480p_h264.mov
python3 tools/measure_v7.py $SRC --start 90 --tolerance 0 8 16 --level 9
python3 tools/measure_v7.py $SRC --start 360 --tolerance 0 8 16 --level 9
python3 tools/make_ui_clip.py ui.mkv
python3 tools/measure_v7.py ui.mkv --tolerance 0 --level 1 9
python3 tools/encode_mjpeg_benchmark.py ui.mkv ui_q2.mjpeg --q 2
ffmpeg -i ui.mkv -vf format=rgb565le -c:v zmbv -g 24 -compression_level 9 ui_zmbv.avi
```

`tools/measure_v7.py` needs NumPy for speed (it works without it, slowly).
For W90 and W360 add the same `fps`, `scale` and `crop` filter to the ZMBV
command as `tools/measure_v7.py` uses.

On the badge:

```bash
benchmarks/esp32s3_v7_player/run.sh ui.rv565 1        # dual-core
benchmarks/esp32s3_v7_player/run.sh ui_full.rv565 0   # serial, --band-lines 0
```

## Not measured yet

- Version 7 playback on the RP2350 (Pico 2), and with tolerance above 0.
- Power: partial deltas leave the SPI bus idle for part of each frame.
