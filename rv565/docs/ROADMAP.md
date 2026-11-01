# RV565 roadmap after 1.0

1.0 put RV565 in the Arduino Library Manager (ESP-IDF pending namespace
approval). The next goal is users and files in the wild, because that is what
FFmpeg and everything built on it (VLC, mpv, Kodi, ImageMagick) ask for before
adding a format.

Order of work:

1. **Reach**: meet makers where they already are; no gatekeepers.
2. **Recognition**: small upstream patches that make `.rv565` a known file type.
3. **FFmpeg**: once there are users and sample files.
4. **Second platform** (Pico 2): needs hardware budget, so it comes last.

Legend: 🤖 Claude can do it in a PR · 🙋 needs Ayushman (account, hardware,
money, or a decision).

---

## Stage 1: reach (no permission needed)

### 1.1 Library 1.1: any ST7789 panel

Today the ports are hard-wired to a 2.0" 320x240 landscape panel.

- [x] 🤖 Add `width`, `height`, `x_offset`, `y_offset`, `madctl` and
      `invert` to the ESP32 and RP2 display configs. Zero means today's values,
      so 1.0 code keeps working (minor release, not breaking).
- [x] 🤖 Presets for common modules: 320x240 (2.0"), 240x240 (1.3"/1.54"),
      240x320 portrait, 135x240 (1.14").
- [x] 🤖 Host test: address window and offsets for each preset.
- [x] 🙋 Check on the badge that default settings still play unchanged (1.1.0, 2026-11-01).
- [x] 🤖 Release 1.1.0 (CHANGELOG, `tools/check_version.py` also covering
      `python/src/rv565/__init__.py`, tag).

### 1.2 Display-library examples

Most ESP32 makers already drive their screen with TFT_eSPI or LovyanGFX. A
`rv565_display_ops_t` adapter lets RV565 decode while their library draws.

- [x] 🤖 `examples/TFT_eSPI_Player`: display ops on top of `pushImageDMA`.
- [x] 🤖 `examples/LovyanGFX_Player`: same with LovyanGFX DMA writes.
- [x] 🤖 Add both to CI (`depends=` stays empty; the examples install their
      display library in CI only).
- [ ] 🙋 Run one of them on the badge.

### 1.3 Python package and Pillow plugin (PyPI)

Gives desktop users `pip install rv565`, and download counts we can quote.

- [x] 🤖 Package `python/` in this repo: `rv565.encode()`, `rv565.open()`,
      frame iterator, `info`/`verify`, and the existing CLI as the `rv565`
      console script. Pure Python + zlib; FFmpeg optional for encoding.
- [x] 🤖 Pillow plugin: `Image.open("clip.rv565")` with `seek()`/`n_frames`,
      and `save(..., format="RV565", save_all=True)` for animations.
- [x] 🤖 Tests against `tests/data/testpattern.rv565` and the format spec.
- [x] 🤖 CI job that builds the wheel; publish workflow using PyPI trusted
      publishing (no token stored).
- [x] 🙋 Create the PyPI project `rv565` and add the trusted publisher
      (`elixpo/rv565`, workflow `publish-pypi.yml`). Check the name is free first.
- [x] 🙋 Run the publish workflow for 1.1.0.

### 1.4 Online converter on oreo.elixpo

A free page that turns a video into an `.rv565` (or an Arduino `clip.h`) in
the browser. It removes the biggest hurdle today: needing FFmpeg and Python.

Design:

- Runs **entirely in the browser**: the site is a static Next.js export on
  Cloudflare Pages, so there is no server and files are never uploaded. This
  is also the privacy promise on the page.
- No account. A size cap protects the visitor's browser memory, not our
  servers; proposed defaults: input up to 200 MB, output up to 30 s.
- Decode with `<video>` + canvas (WebCodecs where available), scale to the
  chosen panel size, convert to RGB565 big-endian, compress each frame with
  `CompressionStream("deflate")` (zlib framing, as the format requires).
- Options: panel preset (from 1.1), fps 1–30, start/end trim, fit/fill.
- Output: `.rv565`, `clip.h` (C array), and the schedule check from
  `rv565.py info` ("plays without missed frames on ESP32-S3: yes/no").
- Preview: play the result back in the page by inflating it with
  `DecompressionStream`, so users see exactly what the panel will show.

Tasks:

- [x] 🤖 JS module (encoder, decoder, schedule check) with tests: decodes the
      reference vector frame for frame, its files pass `rv565 verify`, and its
      `clip.h` is byte-identical to the CLI's (zlib output itself differs by
      implementation, so files are compared by decoded frames).
- [x] 🤖 Page `oreo.elixpo/rv565/convert` (OreoOS repo), in the existing
      research style, linked from the paper page and this README.
- [x] 🤖 SEO: title/description aimed at what people search for ("MP4 to
      RGB565 converter", "play video on ESP32 ST7789"), JSON-LD
      `SoftwareApplication`, Open Graph image, sitemap entry, an FAQ section
      on the page, and links back to the library and paper.
- [ ] 🙋 Usage numbers: enable Cloudflare Web Analytics for the Pages project
      (cookieless, no code change) to see converter page views.
- [x] 🙋 Deploy with `./deploy --pages` and submit the sitemap in Google
      Search Console.

### 1.5 Telling people

- [ ] 🙋 Badge video of a real clip (Big Buck Bunny, CC BY 3.0).
- [x] 🤖 Drafts: Espressif Developer Portal article, Arduino Project Hub post,
      Hackaday tip, r/esp32 and r/arduino posts. Each links the converter.
- [x] 🙋 Hackaday tip sent (2026-11-01).
- [x] 🙋 LinkedIn post for 1.1 (2026-11-01).
- [x] 🙋 Espressif Developer Portal article proposed:
      [developer-portal#852](https://github.com/espressif/developer-portal/discussions/852).
- [ ] 🙋 Arduino Project Hub post (needs the badge video).
- [x] 🤖 Awesome lists:
      [agucova/awesome-esp#67](https://github.com/agucova/awesome-esp/pull/67),
      [nhivp/Awesome-Embedded#92](https://github.com/nhivp/Awesome-Embedded/pull/92);
      `s0lness/awesome-esp32` waits for the badge video (it requires hardware proof).
- [x] 🤖 PlatformIO: the registry mirrors the Arduino library; `library.json`
      adds frameworks, platforms and examples.
- Reddit posts dropped: not something we can follow up on.

---

## Stage 2: recognition (small upstream patches)

All three rely on `docs/FORMAT.md` and its test vector.

- [x] 🤖 **libmagic (`file` command)**: magic entry for `RV5` + version byte,
      printing dimensions, fps and frame count. Prepare the patch and test it
      against the `file` test suite.
- [x] 🙋 Sent to the file maintainers:
      [bugs.astron.com #819](https://bugs.astron.com/view.php?id=819) (2026-11-01).
- [x] 🤖 **freedesktop shared-mime-info**: `video/x-rv565`, glob `*.rv565`,
      magic `RV5` at offset 0. Prepare the merge request.
- [x] 🙋 Merge request opened:
      [shared-mime-info!449](https://gitlab.freedesktop.org/xdg/shared-mime-info/-/merge_requests/449)
      (2026-11-01, CI passing).
- [x] 🤖 **PRONOM** (UK National Archives format registry): fill in the
      submission (signature, spec link, sample file).
- [x] 🙋 Submitted:
      [PRONOM_Research#202](https://github.com/digital-preservation/PRONOM_Research/pull/202) (2026-11-01).
- [ ] 🤖 Register `.rv565` in Wikidata as a file format once one of the
      above lands (it needs a reliable source to cite).

---

## Stage 3: FFmpeg (once there are users)

FFmpeg support brings VLC, mpv, Kodi and ImageMagick with it. Go when we can
point to users: PyPI downloads, converter usage, projects by other people.

- [x] 🤖 `libavformat/rv565dec.c`: demuxer (header, length-prefixed packets,
      seeking via the length table).
- [x] 🤖 `libavcodec/rv565dec.c`/`rv565enc.c`: decoder (zlib inflate to RGB565BE, which FFmpeg
      already has as a pixel format).
- [x] 🤖 Muxer + encoder, so `ffmpeg -i in.mp4 -s 180x135 out.rv565` works
      and replaces our Python encoder for most users.
- [x] 🤖 FATE test and sample files for samples.ffmpeg.org; documentation.
- [x] 🙋 Build FFmpeg with `contrib/ffmpeg/` (commands in its README), generate
      the FATE reference, test with a real clip.
- [x] 🙋 Submitted on code.ffmpeg.org:
      [FFmpeg#25653](https://code.ffmpeg.org/FFmpeg/FFmpeg/pulls/25653) (2026-11-01).
- [ ] 🙋 Handle review until merged.
- [ ] 🤖 Afterwards: tell VLC/mpv users it works, update the converter page.

---

## Stage 4: second platform (needs budget)

Moved last because it needs hardware and time on the bench.

- [ ] 🙋 Buy a Raspberry Pi Pico 2 and a 2.0" 320x240 ST7789 module.
- [ ] 🤖 Measurement harness for `examples_pico/player` (per-frame timings
      over USB serial, serial and overlap) and a script that fits the cost
      model, matching the ESP32-S3 methodology.
- [ ] 🙋 Bring-up and measurement runs.
- [ ] 🤖 RP2350 cost model in the library; drop "experimental".
- [ ] 🙋 Follow-up paper: same format, second platform, cost model transfer.

---

## What counts as success

Tracked in the README once there is something to show:

- Projects by other people that use RV565; issues and PRs from strangers.
- PyPI and ESP Component Registry downloads; converter usage; GitHub stars.
- Citations of the paper; follow-up paper accepted.
- `.rv565` recognised by `file`, Linux desktops and PRONOM.
- FFmpeg merges RV565 support.
