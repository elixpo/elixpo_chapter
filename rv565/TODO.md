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

## Pico 2 (Stage 4 of the roadmap)

4. Done 2026-11-04: bring-up on a Pico 2, test pattern at 24 FPS (see
   `benchmarks/rp2350_video_dma/README.md`, *Wiring for 37.5 MHz*).
5. Done 2026-11-04: measured with the paper's method; cost model in the
   library (`docs/RESULTS_RP2350.md`).

## Write-ups

6. Espressif Developer Portal article and Arduino Project Hub post once the
   listings are live.

## Getting RV565 known (2026-11-10)

Upstream reviews first, then listings, then posts. 🤖 = Claude drafts,
🙋 = you send or post.

7. **FFmpeg** (code.ffmpeg.org PR, `rv565` branch on the `elixpo` fork):
   rebased on master 2026-11-10 (lavc 63.29.100, lavf 63.19.100), probe
   accepts any zlib window. Waiting for the maintainers' inclusion decision;
   if asked, shrink or drop `libavformat/tests/rv565.c` and keep
   `fate-lavf-rv565`. `contrib/ffmpeg/` still holds the old single patch:
   refresh it from the two commits once merged.
8. **shared-mime-info** (freedesktop !449): fixes pushed; 🙋 ping the MR once
   FFmpeg merges.
9. Done 2026-11-10: **Pico 2 MJPEG comparison** with JPEGDEC, in
   `docs/RESULTS_MJPEG.md` (#36). RV565 decodes 1.15–1.54× faster there.
10. Sent 2026-11-10: **`file(1)` magic**, https://bugs.astron.com/view.php?id=822
    and by email to Christos Zoulas; ⏳ waiting for it to be committed.
11. Sent 2026-11-01: **PRONOM**,
    https://github.com/digital-preservation/PRONOM_Research/pull/202 (Readme,
    signature and sample; #205 was a duplicate and is closed); ⏳ waiting for
    review.
12. **Kaitai Struct format gallery**: written, `contrib/kaitai/rv565.ksy`; 🙋 PR to
    kaitai-io/kaitai_struct_formats (`media/`).
13. **Arduino_GFX**: 🤖 an RV565 playback example beside its MJPEG demo;
    🙋 PR to moononournation/Arduino_GFX.
14. **LVGL**: 🤖 an RV565 video decoder for LVGL (it has image decoders but
    no cheap video); 🙋 post on the LVGL forum first to check interest.
15. **Awesome lists**: 🤖 one-line PRs for RV565 itself in awesome-esp,
    awesome-micropython and awesome-raspberry-pi-pico (the existing entries
    are for FaleraOS).
16. **Raspberry Pi**: 🙋 a forum post (Projects) and a news tip, after item 9,
    with the Pico numbers and the RP2350 HSTX measurements. A `pico-examples`
    PR would likely be declined, so skip it.
17. **Adafruit**: 🙋 a blog tip / Python on Hardware newsletter submission.
