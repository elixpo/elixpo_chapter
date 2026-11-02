# TODO for Ayushman

Everything below needs hardware, an account, or a decision. The library,
packaging, examples, tests and CI are done; see `docs/ECOSYSTEM.md`. The
plan after 1.0, with every 🙋 item that needs you, is in `docs/ROADMAP.md`.

## Done

- `v1.0.0` released (first stable; `v0.1.0` was the initial listing).
- ESP-IDF example and the Library Manager copy of `ESP32S3_Player` verified on the badge: 180x135 @ 24 FPS, 0 predicted late
  frames, colour bars scroll.
- Arduino Library Manager: accepted (arduino/library-registry#9534).
- Repository description and topics set.
- Espressif `elixpo` namespace approved (2026-11-01); 1.1.0 published to the
  ESP Component Registry.

## Open

1. Espressif: done. `elixpo/rv565` 1.1.0 is on the ESP Component Registry
   (namespace approved 2026-11-01); new release tags publish automatically.
2. Arduino: confirm the index shows 1.0.0 (`arduino-cli lib search RV565`).
3. Optional: play a real clip by replacing `examples_idf/player/main/clip.rv565`
   with one from `tools/rv565.py encode`.

## Pico 2 (when there is budget for the board; Stage 4 of the roadmap)

4. Wire an ST7789 to GP17-22 (see `examples_pico/player/main.c`), build with
   the Pico SDK or upload `examples/Pico2_Player` via Arduino-Pico, and check
   the image. Expect to adjust SPI pins or the clock; the RP2350 port has only
   been compiled, never run.
5. Measure with the paper's methodology and record a cost model for RP2350.

## Write-ups

6. Espressif Developer Portal article and Arduino Project Hub post once the
   listings are live.
