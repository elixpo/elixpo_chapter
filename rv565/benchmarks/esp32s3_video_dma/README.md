# ESP32-S3 24 FPS DMA video benchmark

This is a standalone ESP-IDF firmware, not a FaleraOS app. It boots directly
into a full-screen video loop and leaves Wi-Fi, Bluetooth, MicroPython, the app
launcher, and the normal framebuffer out of the measurement.

The host encoder produces RV565 v6: independently Deflate-compressed 180×135
RGB565 frames with Lanczos scaling, 24 FPS, and no palette reduction. The ROM
inflater decodes one frame into a reusable PSRAM buffer. The firmware then
expands it into two small internal-RAM stripe buffers while SPI2 GDMA sends the
other stripe. At 40 MHz, the LCD wire time is about 30.7 ms per frame, leaving
roughly 11 ms of the 41.7 ms frame budget for inflate and scaling. Pass `--raw`
to the encoder to produce the uncompressed RV565 v5 baseline.

## Prerequisites

- ESP-IDF 5.x exported in the current shell
- FFmpeg
- ESP32-S3-DevKitC-1 N16R8 connected over its UART/programming USB port

## 1. Back up the complete current badge flash

This benchmark replaces MicroPython, its partition table, and FaleraOS. The
backup is the reliable route back to the exact current badge state.

```bash
python -m esptool --chip esp32s3 --port /dev/ttyACM0 read_flash \
  0x0 0x1000000 oreo-full-backup.bin
```

Keep `oreo-full-backup.bin` outside the repository.

## 2. Encode the test clip

```bash
python3 tools/encode_video_benchmark.py /path/to/video.mp4 \
  benchmarks/esp32s3_video_dma/main/video.rv565 --seconds 10 --fps 24
```

The reference ten-second clip occupies about 4.1 MiB in v6 versus 11.1 MiB in
v5. The generated video and ESP-IDF build output are gitignored.

## 3. Build and flash only the benchmark

```bash
cd benchmarks/esp32s3_video_dma
idf.py set-target esp32s3
idf.py -p /dev/ttyACM0 erase-flash flash monitor
```

The instrumented firmware warms up for two seconds, records 30 seconds of
per-frame timings in RAM, and prints the samples only after the timed window.
The first completed frame enables the backlight, avoiding uninitialised LCD
memory on startup. Capture and validate the run from the repository root:

```bash
python3 tools/collect_video_benchmark.py --port /dev/ttyACM0
```

The collector resets the application, waits for the complete run, verifies
that every numbered frame arrived, computes p50/p95/p99 timing, and writes the
raw log, frame CSV and JSON summary under `benchmarks/measurements/`. It also hashes
the application binary, encoded media and `sdkconfig` used for the run.

## RV565 against an MJPEG baseline

`-DRV565_CODEC=1` builds the same firmware with one change: each frame is a
JPEG, decoded to big-endian RGB565 by Espressif's SIMD-optimised
[`esp_new_jpeg`](https://components.espressif.com/components/espressif/esp_new_jpeg)
(1.0.2, pulled in by the component manager) instead of inflated by the ROM
`tinfl`. The decode buffers, scaling, stripes, DMA, pacing and measurement are
shared, and the RV565 build links no JPEG code, so the comparison isolates the
format and its decoder.

`tools/encode_mjpeg_benchmark.py` starts from exactly the RGB565 frames RV565
stores (same window, filter chain and 180×135 size), JPEG-encodes each at one
FFmpeg quality (`--q`, 2 best to 31 worst; `--subsampling 420|444`), and packs
them with RV565 v6's header and length framing under the magic `MJP\x01`. JPEG
is lossy, so it also decodes the result on the host and writes size and PSNR
against the lossless frames to `main/video.mjpeg.json`.

One configuration:

```bash
RV565_CODEC=mjpeg RV565_JPEG_Q=5 RV565_JPEG_SUB=420 \
  tools/run_rv565_matrix.sh /path/to/big_buck_bunny.mov 90 overlap
```

The whole comparison (both windows; dual core: RV565, MJPEG q2/q5/q10 4:2:0;
serial: RV565 and MJPEG q5), followed by the table. 4:4:4 is left out because
`esp_new_jpeg` 1.0.2 does not decode it. Results are in
[`docs/RESULTS_MJPEG.md`](../../docs/RESULTS_MJPEG.md#esp32-s3).

```bash
tools/run_codec_comparison.sh /path/to/big_buck_bunny.mov
```

`tools/compare_codecs.py` builds the table from the aggregate files: size,
bytes per frame, PSNR (mean and worst frame), FPS, deadline misses, drops,
decode time and frame time.

If `export.sh` reports a missing Python environment, point it at the one
ESP-IDF installed: `export IDF_PYTHON_ENV_PATH=~/.espressif/python_env/idf5.5_py3.11_env`.

## Restore the badge exactly as it was

Exit the monitor, put the board in download mode if necessary, then run:

```bash
python -m esptool --chip esp32s3 --port /dev/ttyACM0 erase_flash
python -m esptool --chip esp32s3 --port /dev/ttyACM0 write_flash \
  0x0 oreo-full-backup.bin
```

If the board ran FaleraOS, restore the backup before redeploying it: FaleraOS's
`tools/deploy.py` uploads files through the MicroPython REPL and cannot
recreate the firmware. The commands above use esptool v4 syntax (ESP-IDF 5.5);
esptool v5 spells them `erase-flash`, `write-flash` and `read-flash`.
