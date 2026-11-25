# RP2350 (Raspberry Pi Pico 2) video benchmark

Results from this harness are in [`docs/RESULTS_RP2350.md`](../../docs/RESULTS_RP2350.md).

Measures RV565 on the Pico 2 with the method used for the ESP32-S3 in the
paper (`benchmarks/esp32s3_video_dma`): two seconds of warm-up, then 30
seconds of per-frame timings recorded in RAM and printed afterwards in the
same `RV565_*` format, so the same collector records it and
`tools/fit_cost_model.py` turns the runs into an RP2350 cost model.

Differences from the ESP32-S3 setup, all reported in the output:

- **Clip windows are 4 s (96 frames), not 10 s.** The paper's windows are
  6.4 MB (W90) and 9.0 MB (W360); the Pico 2 has 4 MB of flash. The 30-second
  measurement loops the window.
- **Inflate uses the bundled miniz**, not a ROM inflater (the RP2350 has none).
- **SPI runs at what the RP2350 can divide from 150 MHz**: a 40 MHz request
  gives 37.5 MHz. The actual rate is printed as `spi_khz` and used for the
  wire-time bound.
- Output goes over the Pico's USB serial, and each run starts when the host
  sends a byte (there is no reset line).

## Hardware

Raspberry Pi Pico 2 (or Pico 2 W) and a 2.0" 320×240 ST7789 SPI module.
Physical pin numbers count with the USB port at the top: the right-hand
column runs from pin 40 (top) down to pin 21.

| Display | Pico 2 | Pin |
| --- | --- | --- |
| VCC | VBUS, 5 V (modules with an onboard 3.3 V regulator, as most 2.0" ones have) or 3V3 (OUT) (modules without one) | 40 or 36 |
| GND | GND | 38, or 23 beside the signal pins |
| SCL / SCK | GP18 | 24 |
| SDA / MOSI | GP19 | 25 |
| CS | GP17 | 22 |
| DC | GP20 | 26 |
| RST | GP21 | 27 |
| BL / EN / BLK (backlight) | GP22 | 29 |
| TE | not connected | |

### Wiring for 37.5 MHz

The first Pico 2 bring-up (2026-11-04) showed the backlight but no image
until the wiring was improved: long breadboard jumpers ring at 37.5 MHz and
the panel misreads the clock. What made it work:

- short wires for SCL, SDA, CS and DC;
- a 33 Ω resistor in series with SCL, at the Pico end (22–100 Ω works);
- a ground wire run beside SCL to GND pin 23.

`st7789_test.py` (in this directory) checks the wiring without the C build: flash
MicroPython for the Pico 2, then `mpremote connect /dev/ttyACM0 run
st7789_test.py`. It fills the panel red, green and blue and draws four bars at
1 MHz; change `baudrate=` in the script to try faster rates.

## Prerequisites

```bash
sudo apt install cmake gcc-arm-none-eabi libnewlib-arm-none-eabi picotool
git clone --depth 1 --branch 2.1.1 https://github.com/raspberrypi/pico-sdk.git ~/pico-sdk
git -C ~/pico-sdk submodule update --init --depth 1 lib/tinyusb   # needed for USB serial
export PICO_SDK_PATH=~/pico-sdk
python3 -m pip install pyserial   # for the collector
```

If your distribution has no `picotool` package, hold BOOTSEL while plugging
the Pico in and copy `build/rv565_rp2350_bench.uf2` to the drive that appears.

## 1. Bring-up with the test pattern

Check wiring and colours before measuring anything:

```bash
cd benchmarks/rp2350_video_dma
cmake -B build -DPICO_BOARD=pico2 -DRV565_VIDEO=$PWD/../../tests/data/testpattern.rv565
cmake --build build -j
picotool load -f -x build/rv565_rp2350_bench.uf2
cd ../.. && python3 tools/collect_video_benchmark.py --platform rp2350 --label rp2350-bringup
```

The panel shows scrolling colour bars (white, yellow, cyan, green, magenta,
red, blue, black from left to right) and the collector prints FPS and timing
percentiles. Then delete `build/` before the real runs:
`rm -rf benchmarks/rp2350_video_dma/build`.

## 2. Measure

From the repository root, with the Big Buck Bunny source used in the paper
(CC BY 3.0, Blender Foundation):

```bash
for start in 90 360; do
  for mode in serial overlap; do
    tools/run_rv565_matrix_rp2350.sh /path/to/big_buck_bunny.mp4 $start $mode
  done
done
```

Each configuration encodes the window, builds, flashes and records ten runs
into `benchmarks/measurements/`. Keep the two clips for the fit:

```bash
python3 tools/encode_video_benchmark.py /path/to/big_buck_bunny.mp4 /tmp/w90.rv565  --start 90  --seconds 4
python3 tools/encode_video_benchmark.py /path/to/big_buck_bunny.mp4 /tmp/w360.rv565 --start 360 --seconds 4
```

## 3. Fit the cost model

```bash
python3 tools/fit_cost_model.py \
  --window /tmp/w90.rv565  benchmarks/measurements/video-benchmark-rp2350-bbb090-serial-r*.json \
  --window /tmp/w360.rv565 benchmarks/measurements/video-benchmark-rp2350-bbb360-serial-r*.json
```

It prints FPS, drops and misses per window, transfer time against the wire
bound, the pooled `T(L) = a + b·L` model with r² and hold-out error, the
serial admission threshold, and a `rv565_cost_model_t` initialiser for the
library. Run it on the overlap records too, for their FPS and miss counts.

The same script reproduces the paper's ESP32-S3 numbers from its committed
records (4.858 ms + 0.1515 µs/byte, r² 0.9987).

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Backlight on, nothing drawn | Long wires or a loose SCK/MOSI/CS/DC wire (see *Wiring for 37.5 MHz*; check with `st7789_test.py`), or the module needs 5 V on VCC |
| Colours inverted (white shows black) | Non-IPS panel: set `.invert = 0` in the panel (use a custom `rv565_panel_t`) |
| Image shifted or wrapped | Different module size or offset: pick another preset |
| Noise, or an image that starts and then vanishes | Signal ringing at 37.5 MHz: add the series resistor on SCL; `.clock_hz = 25 MHz` confirms the rest works (too slow for 24 FPS full screen) |
| Collector times out | Wrong port (`ls /dev/ttyACM*`), or the Pico is still in BOOTSEL mode |

## RV565 against MJPEG

`-DRV565_CODEC=1` builds the same benchmark with JPEG frames
(`tools/encode_mjpeg_benchmark.py`) decoded to big-endian RGB565 by bitbank2's
[JPEGDEC](https://github.com/bitbank2/JPEGDEC) 1.8.5, fetched at a pinned commit.
JPEGDEC runs as plain C on the RP2350 (its SIMD paths are for other chips).
In overlap mode JPEGDEC runs on core 1 through the player's decoder backend.
In serial mode it decodes on core 0 only the frame being presented, as RV565's
serial path does. Scaling, stripes, DMA, pacing and
measurement are shared with the RV565 build.

The whole comparison (both windows; dual core: RV565, MJPEG q2/q5/q10 4:2:0;
serial: RV565 and MJPEG q5), followed by the table:

```bash
tools/run_codec_comparison_rp2350.sh /path/to/big_buck_bunny.mov /dev/ttyACM0 10
```

The panel is optional for this: SPI clocks the frames out with or without it.
Results are in
[`docs/RESULTS_MJPEG.md`](../../docs/RESULTS_MJPEG.md#raspberry-pi-pico-2-rp2350).
