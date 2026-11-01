# RV565

[![Arduino Library Manager](https://www.ardu-badge.com/badge/RV565.svg)](https://www.ardu-badge.com/RV565)
[![PyPI](https://img.shields.io/pypi/v/rv565.svg)](https://pypi.org/project/rv565/)
[![arXiv](https://img.shields.io/badge/arXiv-2610.35935-b31b1b.svg)](https://arxiv.org/abs/2610.35935)
[![DOI](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.23543367-blue.svg)](https://doi.org/10.5281/zenodo.23543367)

Frame-independent RGB565 video for microcontroller displays, with a dual-core
decode and DMA pipeline.

RV565 plays video on SPI panels such as the ST7789 from small, simple files:
every frame is an independent zlib stream whose decoded bytes are already the
panel's native RGB565. That makes three things possible on a microcontroller:

- **24 FPS with zero missed frames** on the ESP32-S3: core 1 inflates the next
  frame while core 0 scales and DMA-transfers the current one, so frame time
  equals the display transfer (98.1% of the 40 MHz SPI bound).
- **Schedulability from the file alone**: inflate time is linear in the stored
  payload length, so `rv565_check_schedule()` tells you before playback whether
  a clip will keep up.
- **O(1) seeking and local error recovery**: no frame depends on another.

The design and measurements are described in
*RV565: Cross-Layer Co-Design for Frame-Independent Video Playback on
MicroPython-Class ESP32-S3 Systems*
([arXiv:2610.35935](https://arxiv.org/abs/2610.35935); artifact
[doi:10.5281/zenodo.23543367](https://doi.org/10.5281/zenodo.23543367)).

## Platforms

| Platform | Install | Status |
| --- | --- | --- |
| ESP32-S3, ESP-IDF | `idf.py add-dependency "elixpo/rv565"` | Measured in the paper |
| ESP32-S3, Arduino | Library Manager → *RV565* | Same code as ESP-IDF |
| RP2350 (Pico 2), Arduino-Pico | Library Manager → *RV565* | Experimental, not yet measured |
| RP2350 (Pico 2), Pico SDK | `add_subdirectory(rv565)` | Experimental, not yet measured |
| Desktop (Python 3.9+) | `pip install rv565` ([PyPI](https://pypi.org/project/rv565/)) | Encode, inspect, verify; Pillow plugin |
| Browser | [Online converter](https://oreo.elixpo.com/rv565/convert/) | No install, no upload |

Arduino: install *RV565* from the Library Manager, or run
`arduino-cli lib install RV565`. The ESP Component Registry listing is
pending; until then, clone this repository into your project's `components/`
folder (ESP-IDF).

## Panels

The ports drive any ST7789 module. Pick a preset from `rv565_panel.h` in the
display config and use the same size for the player:

```c
rv565_esp32_display_config_t display = { /* pins, clock, ... */
    .panel = RV565_PANEL_240X240,   /* 320X240 (default), 240X320, 135X240, 240X135 */
};
```

For another module, fill `rv565_panel_t` with its size, controller offset,
MADCTL rotation and inversion. Only the 320x240 preset is verified on
hardware so far; reports for other modules are welcome.

## Using your display library

Already drive your screen with TFT_eSPI or LovyanGFX? Keep it: RV565 decodes
and scales, your library sends the stripes by DMA. See
`examples/TFT_eSPI_Player` and `examples/LovyanGFX_Player` (ESP32); the
adapter is four small functions.

## Python

The Python package is published on PyPI:
[pypi.org/project/rv565](https://pypi.org/project/rv565/).

```bash
pip install rv565            # the rv565 command and library, no dependencies
pip install "rv565[pillow]"  # plus the Pillow plugin
```

It gives the `rv565` command (encode, info, verify, c-array) and a small
library; with Pillow, `Image.open("clip.rv565")` opens clips as animations.
See [python/](python/README.md). No Python? Use the
[online converter](https://oreo.elixpo.com/rv565/convert/), which runs in the
browser.

## Quick start

Encode a clip on your computer (needs FFmpeg), then check it:

```bash
python3 tools/rv565.py encode input.mp4 clip.rv565 --size 180x135 --fps 24
python3 tools/rv565.py info clip.rv565      # sizes and predicted late frames
python3 tools/rv565.py c-array clip.rv565 clip.h   # for Arduino sketches
```

Play it (ESP32-S3; see `examples/` and `examples_idf/` for complete code):

```c
#include <RV565.h>

rv565_clip_t clip;
static uint32_t frame_index[1024];
rv565_open(&clip, data, size, frame_index, 1024, 320, 240);

rv565_schedule_report_t report;
rv565_check_schedule(&clip, &RV565_COST_ESP32S3_180x135, 31312.0f, 1, &report);
// report.late_frames == 0 means the clip keeps up with dual-core decoding.

rv565_player_t player = { .clip = &clip, /* panel size, buffers, maps */ };
rv565_esp32_display_init(&display_config, &player.display);
rv565_esp32_decoder_init(&clip, 1, &player.decoder);   // inflate on core 1
rv565_player_init(&player);

rv565_pacer_t pacer;
rv565_pacer_start(&pacer, &clip.header, rv565_esp32_micros());
for (;;) {
    rv565_player_present(&player, pacer.frame, NULL);
    uint32_t wait;
    rv565_pacer_advance(&pacer, rv565_esp32_micros(), &wait);
    esp_rom_delay_us(wait);
}
```

Leave `player.decoder` empty to use the single-core serial path.

## Layout

```
src/                 portable core, player, and platform ports (Arduino src/)
  rv565.[ch]         container parsing, validation, inflate, scaling, cost model
  rv565_player.[ch]  stripe pipeline with optional second-core decoding
  port/esp32/        SPI GDMA display + FreeRTOS core-1 worker
  port/rp2/          SPI DMA display + multicore worker (experimental)
  third_party/       inflate-only miniz (used where no ROM inflater exists)
examples/            Arduino sketches (ESP32-S3, Pico 2)
examples_idf/        ESP-IDF example project
examples_pico/       Pico SDK example project
tools/rv565.py       encoder and inspection CLI
tests/               host tests (make -C tests)
benchmarks/          the paper's standalone ESP32-S3 benchmark and collectors
docs/                format specification, architecture notes, ecosystem plan
```

## Memory

On the ESP32-S3 with 180×135 frames and a 320×240 panel, the serial path uses
79.9 KiB of internal SRAM and the dual-core path 152.4 KiB (second decoded
frame and worker stack). `tinfl` keeps about 11 KB on the decoding task's
stack.

## Versioning

RV565 follows [semantic versioning](https://semver.org). From 1.0.0 the
container format and the public API in `rv565.h`, `rv565_player.h` and the
ESP32 port will not change incompatibly within 1.x. The RP2 port is
experimental and may change in a minor release until it has been measured on
hardware. Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Development

```bash
make -C tests                                    # host tests
make -C tests CLIPS="w90.rv565 w360.rv565"       # plus your own containers
```

CI builds the Arduino sketches for ESP32-S3 and Pico 2, the ESP-IDF example,
and the Pico SDK example, and lints the library for the Arduino Library Manager.

## Citation

```bibtex
@misc{bhattacharya2026rv565,
  author        = {Ayushman Bhattacharya and Anwesha Chakraborty},
  title         = {RV565: Cross-Layer Co-Design for Frame-Independent Video Playback on MicroPython-Class ESP32-S3 Systems},
  year          = {2026},
  eprint        = {2610.35935},
  archivePrefix = {arXiv},
  primaryClass  = {cs.AR}
}
```

## License

MIT; see [LICENSE](LICENSE). The bundled inflater is miniz (MIT); see
[NOTICE](NOTICE).
