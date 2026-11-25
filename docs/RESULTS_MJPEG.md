# RV565 against MJPEG

Measured on two boards: the [ESP32-S3](#esp32-s3), which has an optimised
JPEG decoder, and the [Raspberry Pi Pico 2](#raspberry-pi-pico-2-rp2350),
which does not. In short: on the S3 MJPEG decodes faster; on the Pico RV565
does. Both formats play at 24 FPS on both boards when decoding runs on the
second core, MJPEG files are 3–11× smaller, and only RV565 is pixel-exact.

## ESP32-S3

Measured 2026-11-09 on the paper's ESP32-S3 board (arXiv:2610.35935), with
the paper's method. The firmware is the paper's player built twice: once
inflating RV565 frames with the ROM `tinfl`, and once decoding JPEG frames
with Espressif's SIMD-optimised `esp_new_jpeg`. Everything else (decode
buffers, scaling, stripes, DMA, pacing, measurement) is shared, so the
comparison isolates the format and its decoder.

### Setup

| | |
| --- | --- |
| Board | ESP32-S3 N16R8, 240 MHz, as in the paper |
| Display | 2.0" 320×240 ST7789, SPI at 40 MHz |
| RV565 decoder | ROM `tinfl` (RV565 v6) |
| MJPEG decoder | [`esp_new_jpeg`](https://components.espressif.com/components/espressif/esp_new_jpeg) 1.0.2, output big-endian RGB565, header parsed per frame |
| Firmware | `benchmarks/esp32s3_video_dma`, ESP-IDF 5.5.1; revisions `8205350` (W90 dual-core) and `309b3c2` (the rest), which differ only in `tools/run_codec_comparison.sh`; no tracked changes in either |
| Source | *Big Buck Bunny* 480p (SHA-256 `b2acb9bd…55b9a27`, as in the paper), FFmpeg 8.0.1 |
| Windows | W90: 90–100 s; W360: 360–370 s; 240 frames each, 180×135 at 24 FPS |
| Method | 48 warm-up frames, then 720 timed frames per run; 10 runs per configuration after independent resets (7,200 frames) |

The MJPEG clips start from exactly the RGB565 frames RV565 stores, and each
frame is a baseline JPEG at one FFmpeg quality (`-q:v`, 2 best to 31 worst).
PSNR is against those lossless frames, decoded on the host.

**4:4:4 is not in the table because it does not play.** `esp_new_jpeg` 1.0.2
rejects 4:4:4 JPEGs (`Not supported JPEG format`), so on the S3 MJPEG is
limited to chroma subsampling.

### Results

Times in milliseconds; the deadline at 24 FPS is 41.667 ms. Decode is
`tinfl` for RV565 and `esp_new_jpeg` for MJPEG. RAM is the heap the media
state takes (clip index, decoder and decode buffers).

#### Dual-core

| Clip | Format | Size | Bytes/frame | PSNR mean (worst) | FPS | Misses | Drops | Decode mean | Decode p99 | Frame p99 | RAM |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| W90 | **RV565** | 6.12 MiB | 26,751 | exact | 24.009 | 0 | 0 | 8.90 | 10.02 | 31.33 | 99,136 |
| W90 | MJPEG q2 | 1.84 MiB | 8,026 | 34.8 dB (33.6) | 24.009 | 0 | 0 | 6.26 | 7.44 | 31.33 | 107,864 |
| W90 | MJPEG q5 | 0.97 MiB | 4,217 | 32.1 dB (30.5) | 24.009 | 0 | 0 | 4.44 | 5.34 | 31.33 | 107,864 |
| W90 | MJPEG q10 | 0.57 MiB | 2,483 | 29.7 dB (27.6) | 24.009 | 0 | 0 | 3.56 | 4.09 | 31.33 | 107,864 |
| W360 | **RV565** | 8.54 MiB | 37,327 | exact | 24.009 | 0 | 0 | 10.50 | 10.55 | 31.34 | 99,136 |
| W360 | MJPEG q2 | 2.58 MiB | 11,267 | 33.9 dB (33.7) | 24.009 | 0 | 0 | 7.81 | 8.05 | 31.34 | 107,864 |
| W360 | MJPEG q5 | 1.40 MiB | 6,133 | 30.9 dB (30.5) | 24.009 | 0 | 0 | 5.35 | 5.52 | 31.33 | 107,864 |
| W360 | MJPEG q10 | 0.84 MiB | 3,647 | 28.2 dB (27.8) | 24.009 | 0 | 0 | 4.13 | 4.24 | 31.33 | 107,864 |

#### Serial (one core decodes, then transfers)

| Clip | Format | FPS | Misses | Drops | Decode mean | Frame mean | Frame p99 | RAM |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| W90 | **RV565** | 24.002 | 0 | 0 | 8.91 | 40.22 | 41.35 | 50,532 |
| W90 | MJPEG q5 | 24.005 | 0 | 0 | 4.44 | 35.75 | 36.65 | 59,260 |
| W360 | **RV565** | 23.905 | 7,200 | 20 | 10.52 | 41.83 | 41.88 | 50,532 |
| W360 | MJPEG q5 | 24.004 | 0 | 0 | 5.36 | 36.67 | 36.84 | 59,260 |

The RV565 rows reproduce the paper's measurements (serial W90 24.002 FPS;
serial W360 23.905 FPS, 20 drops, every frame late).

### What this shows

- **Dual-core, both formats play every frame on time** with 10.3 ms of
  slack. The display transfer (31.3 ms) bounds the frame, and both decoders
  fit inside it, so on this board the viewer sees the same playback.
- **MJPEG decodes faster on the S3**: 1.34–1.42× faster than RV565 at q2
  and about 2× at q5. `esp_new_jpeg` uses the S3's SIMD instructions; the
  RV565 build uses the ROM inflater.
- **MJPEG files are 3.3× smaller at q2 and 10–11× smaller at q10.**
- **On the serial path, MJPEG q5 holds 24 FPS on both windows; RV565 misses
  W360** by 0.16 ms per frame.
- **RV565 is lossless; MJPEG is not.** The best playable MJPEG (q2 4:2:0)
  averages 33.9–34.8 dB, and the mode that would come closest to exact
  colour (4:4:4) does not decode on this chip.
- **RV565 needs 8,728 bytes less RAM** in both modes, and no decoder library.

So RV565 does not win on size or decode speed on the ESP32-S3, where
Espressif ships an optimised JPEG decoder. What it offers is pixel-exact
RGB565 at the same frame rate, a smaller memory footprint, and a decoder
(`tinfl`) that is in ROM on the ESP32 family and plain portable C
elsewhere.

## Raspberry Pi Pico 2 (RP2350)

Measured 2026-11-10 with `benchmarks/rp2350_video_dma`, the same method as
the S3 and [`RESULTS_RP2350.md`](RESULTS_RP2350.md). The firmware is built
twice: once inflating RV565 frames with the library's `tinfl`, and once
decoding JPEG frames with bitbank2's
[JPEGDEC](https://github.com/bitbank2/JPEGDEC), a widely used JPEG decoder
for microcontrollers. JPEGDEC has no SIMD path for the RP2350, so it runs as plain C.
Everything else is shared, as on the S3.

### Setup

| | |
| --- | --- |
| Board | Raspberry Pi Pico 2, RP2350 at 150 MHz |
| Display | SPI0 at 37.5 MHz (40 MHz requested). Run headless: SPI clocks every frame out with or without a panel, so the timings are the same |
| RV565 decoder | the library's `tinfl` (RV565 v6, library 1.2.0) |
| MJPEG decoder | JPEGDEC 1.8.5 (commit `0e87964`), big-endian RGB565 output, header parsed per frame |
| Firmware | Pico SDK; revision `37ecfbb`, except serial MJPEG at `891c33a` (that commit only changes the serial MJPEG path, see below); no tracked changes |
| Source | *Big Buck Bunny* 480p, as on the S3 |
| Windows | W90: 90–94 s; W360: 360–364 s; 96 frames each, 180×135 at 24 FPS. They are 4 s rather than 10 s because the Pico 2 has 4 MB of flash |
| Method | 48 warm-up frames, then 720 timed frames per run (the clip loops); 10 runs per configuration (7,200 frames) |

PSNR is given twice. *Encoder* is the figure the encoder reports, decoding
with FFmpeg (as in the S3 table). *Pico* is what JPEGDEC produces from the
same files, computed on the host with JPEGDEC's plain-C code built for x86
(`-DNO_SIMD`, the path the RP2350 runs). JPEGDEC's output is less accurate
than FFmpeg's: 1.4–4.2 dB lower, and the most at the best quality.

### Results

Times in milliseconds; the deadline at 24 FPS is 41.667 ms. Decode is
`tinfl` for RV565 and JPEGDEC for MJPEG.

#### Dual-core (core 1 decodes the next frame during the transfer)

| Clip | Format | Size | Bytes/frame | PSNR encoder (worst) | PSNR Pico (worst) | FPS | Misses | Drops | Decode mean | Decode p99 | Frame p99 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| W90 | **RV565** | 2.57 MiB | 28,032 | exact | exact | 24.007 | 0 | 0 | 16.17 | 16.84 | 33.84 |
| W90 | MJPEG q2 | 0.80 MiB | 8,683 | 34.5 dB (33.6) | 30.2 dB (29.8) | 24.006 | 0 | 0 | 23.59 | 25.22 | 34.11 |
| W90 | MJPEG q5 | 0.43 MiB | 4,671 | 31.6 dB (30.5) | 29.1 dB (28.4) | 24.006 | 0 | 0 | 21.35 | 23.05 | 34.15 |
| W90 | MJPEG q10 | 0.25 MiB | 2,761 | 29.0 dB (27.6) | 27.6 dB (26.5) | 24.006 | 0 | 0 | 18.62 | 19.99 | 34.10 |
| W360 | **RV565** | 3.41 MiB | 37,291 | exact | exact | 24.007 | 0 | 0 | 18.65 | 18.78 | 33.89 |
| W360 | MJPEG q2 | 1.05 MiB | 11,412 | 33.8 dB (33.7) | 29.7 dB (29.6) | 24.006 | 0 | 0 | 28.79 | 29.29 | 34.21 |
| W360 | MJPEG q5 | 0.57 MiB | 6,217 | 30.8 dB (30.5) | 28.4 dB (28.2) | 24.006 | 0 | 0 | 24.29 | 24.52 | 34.15 |
| W360 | MJPEG q10 | 0.34 MiB | 3,701 | 28.2 dB (27.8) | 26.8 dB (26.5) | 24.006 | 0 | 0 | 22.00 | 22.30 | 34.18 |

#### Serial (one core decodes, then transfers)

| Clip | Format | FPS | Misses | Drops | Decode mean | Frame mean | Frame p99 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| W90 | **RV565** | 20.662 | 7,200 | 1,160 | 14.96 | 48.38 | 48.99 |
| W90 | MJPEG q5 | 19.536 | 7,200 | 1,640 | 17.75 | 51.17 | 52.46 |
| W360 | **RV565** | 19.733 | 7,200 | 1,550 | 17.24 | 50.66 | 50.76 |
| W360 | MJPEG q5 | 19.063 | 7,200 | 1,860 | 19.01 | 52.44 | 52.83 |

The serial MJPEG rows come from `891c33a`. The first serial MJPEG build
prefetched the next frame, so after each skip it decoded twice (frame p99
about 72 ms); RV565's serial path never decodes a skipped frame. Those runs
were discarded and the build fixed so both serial paths do the same work.
The dual-core RV565 rows match the earlier Pico measurements in
`RESULTS_RP2350.md` (24.007 FPS, 33.76 ms frame p50).

### What this shows

- **Dual-core, both formats play every frame on time.** The transfer
  (about 34 ms) bounds the frame, and every decoder fits inside it, leaving
  about 7.5 ms of slack.
- **RV565 decodes faster than JPEGDEC on the Pico**: 1.15–1.18× faster than
  q10, 1.30–1.32× faster than q5, and 1.46–1.54× faster than q2. This is the
  reverse of the S3, where SIMD `esp_new_jpeg` was faster than RV565.
- **MJPEG files are 3.2–3.3× smaller at q2 and 10× smaller at q10.**
- **Serially, neither format reaches 24 FPS.** The transfer alone takes
  33.4 ms, which leaves 8.3 ms per frame to decode, and both decoders need
  more. RV565 comes closer (20.7 and 19.7 FPS against 19.5 and 19.1 FPS for
  q5).
- **JPEGDEC's output is worse than the encoder's figures.** On the Pico, q2
  averages only 29.7–30.2 dB, about 1 dB better than q5. RV565 is exact.

So on the Pico 2, RV565 is lossless *and* the faster decoder; MJPEG's
advantage is file size.

## Not measured

- **Content where lossless matters most** (UI captures, pixel art, text),
  where JPEG artefacts are most visible. *Big Buck Bunny* is film, JPEG's
  best case.
- **RAM on the Pico.** All of the Pico benchmark's buffers are static, so it
  prints no heap report. The MJPEG build adds JPEGDEC's decoder state to the
  same frame buffers.
- **4:4:4 MJPEG on the Pico.** It was left out to keep the matrix the same
  as the S3, where 4:4:4 does not decode.

## Reproduce

ESP32-S3:

```bash
. ~/esp/esp-idf-v5.5.1/export.sh
tools/run_codec_comparison.sh /path/to/big_buck_bunny_480p_h264.mov /dev/ttyACM0 10
```

`tools/run_codec_comparison.sh` runs every configuration through
`tools/run_rv565_matrix.sh` and prints the table with
`tools/compare_codecs.py`; `RV565_RESUME=1` skips configurations that
already have results. The MJPEG encoder needs NumPy in the Python that
`export.sh` activates.

Raspberry Pi Pico 2 (Pico SDK, `PICO_SDK_PATH` set, NumPy in the active
Python):

```bash
tools/run_codec_comparison_rp2350.sh /path/to/big_buck_bunny_480p_h264.mov /dev/ttyACM0 10
```

It does the same through `tools/run_rv565_matrix_rp2350.sh` and also accepts
`RV565_RESUME=1`.
