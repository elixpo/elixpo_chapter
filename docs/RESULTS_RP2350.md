# RV565 on the Raspberry Pi Pico 2 (RP2350)

Measured 2026-11-04 with the paper's method (arXiv:2610.35935) on a second
platform. The RP2350 runs the same container, player and stripe pipeline as
the ESP32-S3; what changes is the chip, its clock, and the inflater.

The story of the bring-up, from a blank screen to crosstalk on the DC line,
is written up in [*The Screen Was Blank*](https://blogs.elixpo.com/elixpohere/rv565-pico-2-tweak).

## Setup

| | |
| --- | --- |
| Board | Raspberry Pi Pico 2 (RP2350, Cortex-M33), 150 MHz, 4 MB flash |
| Display | 2.0" 320×240 ST7789, SPI0 at 37.5 MHz (150 MHz / 4), mode 3; command bytes at 10 MHz |
| Inflater | bundled miniz `tinfl` (the RP2350 has no ROM inflater), decompressor in static RAM |
| Clip storage | linked into the image, read through the XIP flash cache |
| Firmware | `benchmarks/rp2350_video_dma`, revision `5549b6b` (no tracked changes), Pico SDK 2.1.1 |
| Source | *Big Buck Bunny* 480p (SHA-256 `b2acb9bd…55b9a27`, as in the paper), FFmpeg 8.0.1 |
| Windows | W90: 90–94 s; W360: 360–364 s; 96 frames each, 180×135 at 24 FPS |
| Method | 48 warm-up frames, then 720 timed frames per run; 10 runs per configuration after independent resets (7,200 frames); timings held in RAM and printed afterwards |

The windows are 4 s rather than the paper's 10 s because the paper's clips
(6.4 and 9.0 MB) do not fit in 4 MB of flash; the timed window loops the clip.

| Clip | Bytes | Payload range (bytes) | Mean payload | SHA-256 |
| --- | --- | --- | --- | --- |
| W90 | 2,691,461 | 26,666–30,548 | 28,032 | `201a21c39ae88e082731a45fdf06ced59d2c291359b65d5be236af5a4aa0f702` |
| W360 | 3,580,336 | 36,958–37,710 | 37,291 | `f501bbd27700335c280e8c9dfe680459bee90da778a07f057a7c8ae2da116f75` |

## Results

Times in milliseconds; the deadline at 24 FPS is 41.667 ms.

| Configuration | Frames | FPS | Drops | Misses | Inflate | Scale | LCD | Work mean | p50 | p99 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| W90, serial | 7,200 | 20.662 | 1,160 | 7,200 | 14.959 | 5.672 | 33.419 | 48.384 | 48.129 | 48.986 | 49.028 |
| W360, serial | 7,200 | 19.732 | 1,550 | 7,200 | 17.238 | 5.672 | 33.419 | 50.663 | 50.660 | 50.762 | 50.808 |
| W90, dual-core | 7,200 | **24.007** | **0** | **0** | 16.173 | 7.741 | 33.758 | **33.775** | 33.759 | 33.843 | 33.893 |
| W360, dual-core | 7,200 | **24.007** | **0** | **0** | 18.654 | 8.238 | 33.833 | **33.850** | 33.847 | 33.888 | 33.979 |

- **Dual-core meets every deadline on both windows** with at least 7.69 ms
  of slack at the worst frame.
- **The serial path misses every deadline on both windows.** Inflation and
  transfer together take 48–51 ms, and the pacer skips about one frame in six.
- **The display transfer runs at 98.1% of the wire bound** (33.419 ms against
  32.768 ms at 37.5 MHz) in the serial path, as on the ESP32-S3 (98.1%).

## Cost model

Pooled over both windows (serial runs, 14,400 frames):

    T_inflate ≈ 8.108 ms + 0.2446 µs/byte × L      r² = 0.9984, MAE 0.036 ms

It ships as `RV565_COST_RP2350_180x135`. Even-to-odd hold-out error is
0.036 ms (max 0.206 ms). Against the ESP32-S3 (4.858 ms + 0.1515 µs/byte),
the RP2350 costs 1.67× in the fixed term and 1.61× per byte. That is close
to the clock ratio (240 / 150 = 1.6) plus a RAM-based inflater reading
through the flash cache.

Cross-window transfer is weaker than in the paper. The W90 model predicts
W360 to 0.20 ms on average (paper: 0.04 ms). The W360 model mispredicts W90
by 1.81 ms (paper: 0.86 ms). The reason is the shorter windows: the 4 s W90
spans only 26.7–30.5 KB (the paper's 10 s W90 spans 24.3–33.3 KB), and W360
spans 2%, so each window alone constrains the slope poorly. The pooled
model, which covers 26.7–37.7 KB, is the one to use.

### What the model predicts

On the serial path a frame meets 24 FPS only if

    8.108 + 0.0002446 × L + 33.419 ≤ 41.667   →   L ≤ 571 bytes

so **no realistic film frame plays in real time serially**; both windows are
predicted late on every frame, as measured. With dual-core decoding,
inflation stays hidden while 8.108 + 0.0002446 × L ≤ 33.419, i.e. for frames
up to about 103 KB, twice the 48,600-byte raw frame. So on the RP2350, as
on the ESP32-S3, dual-core playback no longer depends on content.

## A difference from the ESP32-S3: the cores contend

On the ESP32-S3, inflating on the second core cost nothing measurable (within
13 µs). On the RP2350 the two cores slow each other down:

| | Serial | Dual-core | Difference |
| --- | ---: | ---: | ---: |
| Inflate, W90 | 14.959 | 16.173 | +1.21 ms |
| Inflate, W360 | 17.238 | 18.654 | +1.42 ms |
| Scale (core 0) | 5.672 | 7.741–8.238 | +2.1–2.6 ms |
| LCD phase | 33.419 | 33.758–33.833 | +0.34–0.41 ms |

Core 1 reads the clip through the XIP flash cache while core 0 runs the
player and scaler, partly from the same flash. The likely cause is
contention for the cache and the bus, but this was not isolated (for example
by copying the clip or the code into RAM). The cost is absorbed by the
transfer, so frame time stays at the bus bound.

## Bring-up findings

The first run on hardware found two port problems, both fixed before these
measurements (PR #20):

- **Command bytes at 37.5 MHz were misread**, so the panel stayed blank. The
  init sequence and each frame's RAMWR now go out at 10 MHz.
- **SPI mode 0 left a gap after every byte**, a PL022 property, so the
  transfer ran at 83.8% of the wire bound. Mode 3 removed it: frame time on
  the test pattern fell from 39.71 to 33.57 ms.

PR #21 moved the bundled decompressor off core 0's 2 KB stack, which it
overflowed in serial mode.

Breadboard wiring was the other half. At 37.5 MHz, long jumper wires rang and
coupled into each other; real film data, unlike the test pattern, then
turned glitched pixel bytes into panel commands (blank screen, inverted
colours). The fixes were short wires, 33 Ω series resistors at the Pico on
the fast lines, a ground wire beside SCL, and keeping DC away from SCL and
SDA. See `benchmarks/rp2350_video_dma/README.md`. These affect what the
panel shows, not the measured timings, which are the Pico's own work.

## Reproducing

```bash
export PICO_SDK_PATH=~/pico-sdk
for start in 90 360; do for mode in serial overlap; do
  tools/run_rv565_matrix_rp2350.sh big_buck_bunny_480p_h264.mov $start $mode
done; done
python3 tools/encode_video_benchmark.py big_buck_bunny_480p_h264.mov w90.rv565  --start 90  --seconds 4 --fps 24
python3 tools/encode_video_benchmark.py big_buck_bunny_480p_h264.mov w360.rv565 --start 360 --seconds 4 --fps 24
python3 tools/fit_cost_model.py \
  --window w90.rv565  benchmarks/measurements/video-benchmark-rp2350-bbb090-serial-r*.json \
  --window w360.rv565 benchmarks/measurements/video-benchmark-rp2350-bbb360-serial-r*.json
```

The re-encoded clips reproduce the SHA-256 digests above byte for byte.

Firmware digests (`build/rv565_rp2350_bench.uf2`): W90 serial `705f6d17…`,
W90 dual-core `984a989d…`, W360 serial `9cc7c74a…`, W360 dual-core `77f8b9d9…`.
