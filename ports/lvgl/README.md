# lv_rv565: RV565 video in LVGL 9

`lv_rv565` is an LVGL 9 widget that plays RV565 clips, modelled on
`lv_gif`. It is an `lv_image` whose image descriptor points at one decoded
frame; a timer at the clip's frame rate decodes the next frame into it in
place.

- **Lossless and conversion-free.** RV565 stores frames in the display's own
  pixel format, so playing a frame is an inflate and nothing else.
- **Only what changed is redrawn.** For format version 7 partial deltas the
  widget invalidates just the bands of lines that changed, so LVGL redraws
  and flushes only those rows. For format version 8 region deltas it
  invalidates one rectangle per changed band, the band's lines by the
  columns its byte range covers, so a moving cursor or a ticking clock
  redraws only that box. On an ESP32-S3 with a 320x240 SPI panel, partial
  deltas cut the mean frame time on UI-style content from 31.5 ms to
  14.8 ms with dual-core decoding ([`docs/RESULTS_V7.md`](../../docs/RESULTS_V7.md)).
- **Small RAM.** One decoded frame, the frame index (4 bytes per frame), and
  a scratch buffer of up to one frame only for clips with zlib deltas.

Status: tested on the host against LVGL 9.2.2 and 9.4.0 (below); not yet
run on a board. It was proposed for LVGL on the
[LVGL forum](https://forum.lvgl.io/t/interest-in-a-lossless-low-ram-video-widget-for-mcus-rv565-like-lv-gif/24490).

## Pixel formats

| RV565 clip | LVGL colour format |
|---|---|
| `rgb565le` | `LV_COLOR_FORMAT_RGB565` (LVGL's native byte order: encode with `--format rgb565le`) |
| `rgb565be` | `LV_COLOR_FORMAT_RGB565_SWAPPED` on LVGL 9.4+; on 9.2 and 9.3 the widget swaps each decoded row into RGB565 itself, no extra RAM |
| `gray8` | `LV_COLOR_FORMAT_L8` |

Other pixel formats fail to load, with `lv_rv565_get_error()` returning
`RV565_ERR_UNSUPPORTED`.

## What is redrawn

| Frame | Invalidated |
|---|---|
| Keyframe, delta | The whole widget |
| Repeat | Nothing |
| Partial delta (version 7) | Each run of changed bands, full width |
| Region delta (version 8) | Each changed band's rectangle: its lines, and the pixel columns of its byte range (`rv565_byte_columns()`) |

Rows and rectangles are invalidated one by one only when the image sits 1:1
at the top-left of the widget's content area (no scale, rotation or offset,
and the widget is the clip's size); otherwise every changed frame
invalidates the whole widget. A region delta with more than
`LV_RV565_MAX_RECTS` (32) changed bands, or a partial delta with more than
8 runs, also invalidates the whole widget. LVGL merges overlapping and
neighbouring invalid areas before it redraws.

On LVGL 9.2 and 9.3 an `rgb565be` clip is held byte-swapped for drawing.
Before a delta the widget swaps back only the bytes the delta reads or
writes, and swaps them again after decoding: for a region delta, the lines
of each changed band, across its byte range and the range its shift reads
from in the previous frame; for a partial delta, the changed rows.

## Use

Add `ports/lvgl/lv_rv565.c`, `src/rv565.c` and `src/third_party/miniz_tinfl.c`
to your build, with `ports/lvgl` and `src` on the include path. The widget
includes LVGL as `lvgl.h` when `LV_LVGL_H_INCLUDE_SIMPLE` is defined (as in
ESP-IDF's LVGL component), and as `lvgl/lvgl.h` otherwise. `LV_USE_RV565`
defaults to 1.

```c
#include "lv_rv565.h"
#include "intro_rv565.h"   /* rv565 c-array intro.rv565 intro_rv565.h --name intro_rv565 */

static lv_image_dsc_t src;
src.header.magic = LV_IMAGE_HEADER_MAGIC;
src.data = intro_rv565;                 /* stays in flash */
src.data_size = sizeof(intro_rv565);

lv_obj_t * player = lv_rv565_create(lv_screen_active());
lv_rv565_set_src(player, &src);         /* or a path: "S:/videos/intro.rv565" */
lv_obj_center(player);
```

Make a clip with the [`rv565` Python package](https://pypi.org/project/rv565/):

```bash
pip install rv565
rv565 encode intro.mp4 intro.rv565 --size 320x240 --fps 20 --format rgb565le
```

`examples/lv_example_rv565.c` plays a clip from flash and one from an SD
card.

## API

| Function | |
|---|---|
| `lv_rv565_create(parent)` | Create a player. |
| `lv_rv565_set_src(obj, src)` | Load a clip and play it from frame 0. `src` is an `lv_image_dsc_t` whose `data`/`data_size` are the `.rv565` file's bytes, or a path for LVGL's file system (read into RAM whole). |
| `lv_rv565_pause(obj)` / `lv_rv565_resume(obj)` | Pause on the current frame; resume from it. |
| `lv_rv565_restart(obj)` | Back to frame 0 and play. |
| `lv_rv565_set_auto_pause_invisible(obj, on)` / `lv_rv565_get_auto_pause_invisible(obj)` | Hold the frame while the widget can't be seen (hidden, scrolled or clipped out of view) and carry on from it when it can, without catching up. Off by default, as in `lv_gif`. |
| `lv_rv565_set_loop_count(obj, n)` | Play `n` times, then stop on the last frame; `LV_RV565_LOOP_FOREVER` (0, the default) loops for ever. |
| `lv_rv565_get_loop_count(obj)` | Passes left. |
| `lv_rv565_is_loaded(obj)` | Whether a clip loaded. |
| `lv_rv565_get_frame(obj)` / `lv_rv565_get_frame_count(obj)` | Frame on screen; frames in the clip. |
| `lv_rv565_get_error(obj)` | The last error as an `rv565_status_t`; `rv565_strerror()` names it. |

`LV_EVENT_READY` is sent at the end of each pass. If LVGL falls behind, the
widget decodes at most `LV_RV565_MAX_CATCHUP` (4) frames in one timer call
and then slows the clip down rather than stall the UI.

## Test

```bash
ports/lvgl/test/run.sh                 # LVGL 9.2.2 and 9.4.0
ports/lvgl/test/run.sh v9.4.0          # one version
```

The script clones each LVGL release once into `ports/lvgl/test/build/`,
builds it with a generated `lv_conf.h`, and runs `test/test_lv_rv565.c` on a
headless RGB565 display. For every conformance clip in `tests/data/v7` and
`tests/data/v8` in a supported format, and four larger region-delta clips
written by `test/make_clips.py` (one with more bands than
`LV_RV565_MAX_RECTS`, one scrolling sideways so bands carry shifts), it
checks each frame on screen against an independent decode, pixel for pixel,
on both the `RGB565_SWAPPED` path (9.4) and the swapped-buffer path (9.2).
It checks that partial deltas flush only the rows they change, and that a
region delta invalidates exactly its rectangles (or the whole widget past
the limit) and flushes nothing outside them. It also checks looping and `LV_EVENT_READY`, pause, resume, restart, auto-pause while hidden,
catch-up, loading through `lv_fs`, and that unsupported and invalid clips
are refused. CI runs it on every push.
