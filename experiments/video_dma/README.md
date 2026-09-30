# ESP32-S3 24 FPS DMA video benchmark

This is a standalone ESP-IDF firmware, not an OreoOS app. It boots directly
into a full-screen video loop and leaves Wi-Fi, Bluetooth, MicroPython, the app
launcher, and the normal framebuffer out of the measurement.

The host encoder produces RV565 v5: 180×135 RGB565 frames with Lanczos scaling,
24 FPS, and no palette reduction. The firmware expands each frame into two
small internal-RAM stripe buffers. SPI2 GDMA sends one stripe while the CPU
prepares the next from memory-mapped flash. At 40 MHz, the LCD wire time is
about 30.7 ms per frame, leaving roughly 11 ms of the 41.7 ms frame budget.

## Prerequisites

- ESP-IDF 5.x exported in the current shell
- FFmpeg
- ESP32-S3-DevKitC-1 N16R8 connected over its UART/programming USB port

## 1. Back up the complete current badge flash

This benchmark replaces MicroPython, its partition table, and OreoOS. The
backup is the reliable route back to the exact current badge state.

```bash
python -m esptool --chip esp32s3 --port /dev/ttyACM0 read-flash \
  0x0 0x1000000 oreo-full-backup.bin
```

Keep `oreo-full-backup.bin` outside the repository.

## 2. Encode the test clip

```bash
python3 tools/encode_video_benchmark.py /path/to/video.mp4 \
  experiments/video_dma/main/video.rv565 --seconds 10 --fps 24
```

Ten seconds at the default 180×135 resolution occupies about 11.1 MiB. The
generated video and ESP-IDF build output are gitignored.

## 3. Build and flash only the benchmark

```bash
cd experiments/video_dma
idf.py set-target esp32s3
idf.py -p /dev/ttyACM0 erase-flash flash monitor
```

The serial monitor reports measured FPS, average and worst frame-work time, the
uncapped hardware ceiling, and dropped frames every two seconds.
The first completed frame enables the backlight, avoiding uninitialised LCD
memory on startup.

## Restore the badge exactly as it was

Exit the monitor, put the board in download mode if necessary, then run:

```bash
python -m esptool --chip esp32s3 --port /dev/ttyACM0 erase-flash
python -m esptool --chip esp32s3 --port /dev/ttyACM0 write-flash \
  0x0 oreo-full-backup.bin
```

Do not run `tools/deploy.py` until MicroPython has been restored: that tool
uploads files through a MicroPython REPL and cannot recreate the firmware.
