# FFmpeg support (patches, built and tested)

Two patches, in the order FFmpeg reviews them:

- `0001-avcodec-add-RV565-decoder-and-encoder.patch`
- `0002-avformat-add-RV565-demuxer-and-muxer.patch`

They add format version 7 support (and keep version 6):

- `rv565` decoder: every pixel format, stored or zlib frames, keyframe, delta
  (XOR with the previous frame), repeat and partial delta frames (changed
  bands only, each predicted from the previous band shifted by `dx`, `dy`). It keeps the previous
  frame in the stored layout and outputs, losslessly:

  | RV565 | FFmpeg |
  | --- | --- |
  | `rgb565be`, `rgb565le` | `rgb565be`, `rgb565le` |
  | `rgb444` | `rgb444be` (unpacked to 16 bits) |
  | `rgb666`, `rgb888` | `rgb24` (`rgb666` as stored: low 2 bits zero) |
  | `gray8` | `gray` |
  | `gray4` | `gray` (value × 17) |
  | `mono`, `mono_vpage` | `monob` (`mono_vpage` transposed) |

  Data that does not decode to exactly its expected size, malformed partial
  delta headers, and inter frames without a reference frame are errors.
- `rv565` encoder: stores the input pixel format as it is, or the format
  chosen with `-format` (`rgb666` from `rgb24`, `gray4` from `gray`,
  `mono_vpage` from `monob`; FFmpeg converts the input to match).
  `-g` is the keyframe interval (1–255, default 1), `-compressor stored|zlib`
  (default zlib), `-compression_level` the zlib level (default 1),
  `-band_lines` the partial delta band height (default 8, 0 = none),
  `-motion_range` the per-band shift search in pixels (default 8, 0 = none)
  and `-tolerance` (0–255, default 0 = lossless) the reference encoder's
  conditional replenishment. Like the reference encoder it writes a repeat
  for an unchanged frame, otherwise the smaller of a keyframe and a delta,
  or a partial delta when that is at most 2% (and at least 16 bytes)
  larger, with the same shift search order and tie-break; with the same zlib
  its files are byte-identical to `rv565.write`.
- `rv565` demuxer: versions 6 and 7. Packets are frame records (type byte +
  body; the demuxer adds the type byte to version 6 records), keyframes are
  flagged, and extradata carries the pixel format, codec and keyframe
  interval. Seekable input is fully validated when opened (every rule in
  docs/FORMAT.md, Validation, except inflating) and indexed, so a seek lands
  on the keyframe at or before the target.
- `rv565` muxer: version 7, or version 6 with `-format_version 6`; patches
  the frame count at the end (needs seekable output).
- FATE tests, docs (`encoders`, `muxers`, `general_contents`), Changelog and
  version bumps.

## Tested

Built on 2026-11-12 on top of FFmpeg master `49a3b1f259`
("tests/fate/aac: test encoding a near-silent window ahead of an onset"),
Linux x86-64, GCC, system zlib, `./configure --enable-zlib --disable-doc`.
No compiler warnings in the RV565 files. Then rebased onto master
`23c4540053` ("avcodec/x86/vp9: convert tm_4x4_10/12 predictors MMXEXT to
SSE2") without conflicts; after re-running `configure`, the full
`make fate` and the 30 RV565 sample tests pass again.

- Conformance vectors (`tests/data/v7`): all 53 valid files (every pixel
  format and codec, partial deltas, shifted bands, version 6) decode to the
  manifest's per-frame SHA-256 (FFmpeg output converted back to the stored
  layout) and to the same RGB888 as `rv565.to_rgb888`; `ffprobe` frame types
  and packet key flags match; for every frame, an accurate seek (`-ss`) gives
  that frame and a fast seek (`-noaccurate_seek -ss`) gives the keyframe at
  or before it. All 29 invalid files are rejected at the manifest's stage
  (26 when opened, the 3 inflate failures when decoding).
- Encoder against `rv565.write` with the same options: the 46 non-forced
  version 7 vectors, each re-encoded with 9 option sets (zlib levels 1 and
  9; band heights 0, 3, 5, 8, 16; motion ranges 0, 3, 8, 20; tolerances 0,
  12, 40, 255): 414/414 files byte-identical, all passing
  `rv565.open(...).verify()`, lossless ones decoding to the manifest hashes.
  A 45x29 `mandelbrot` clip in all 9 pixel formats with tolerances 0–20,
  stored and zlib, band heights 0/4/8/16 and motion ranges 0/8/24: 54/54
  byte-identical, with tolerance changing the frames. 78 of the 1475 partial
  deltas in these files use a nonzero shift.
- `-format_version 6` reproduces the frames of `testpattern.rv565`, and
  `-c copy -format_version 6` reproduces the file byte for byte.
- FATE: `make fate` (no samples) and the RV565 sample tests pass;
  `make fate-source` passes.

## FATE tests

| Test | Needs samples | What |
| --- | --- | --- |
| `fate-rv565-demux` | no | `libavformat/tests/rv565`: header and record validation (including partial deltas and shifts) on seekable and streamed input, I/O errors, keyframe seeking |
| `fate-rv565-enc-<format>` (9) | no | a clip with repeated frames encoded to each pixel format, stored, `-g 4`: keyframes, partial deltas, repeats |
| `fate-rv565-enc-delta` | no | zlib with keyframes, deltas and repeats (`-band_lines 0`) |
| `fate-rv565-enc-tolerance` | no | stored, `-band_lines 2 -tolerance 48` |
| `fate-rv565-enc-v6` | no | version 6 output |
| `fate-lavf-rv565`, `fate-seek-lavf-rv565` | no | lavf round trip and seeking |
| `fate-rv565-<vector>` (15) | `rv565/` | decode of conformance vectors (below) |
| `fate-seek-extra-rv565` | `rv565/` | seeking in `rgb565be_zlib_forced_delta_k8.rv565` |

`fate-rv565-enc-delta` records the md5 of a zlib-compressed file, as
`vsynth*-zlib` does; the other encoder tests store frames, so their
references do not depend on the zlib implementation.

### Samples to upload to samples.ffmpeg.org (`fate-suite/rv565/`)

Fifteen files, 80 KiB in total, copied from this repository's
`tests/data/v7/` (and `tests/data/testpattern.rv565`):

| fate-suite file | What |
| --- | --- |
| `rv565/rgb565be_zlib_forced_delta_k8.rv565` | deltas, zlib |
| `rv565/rgb565le_stored_k3.rv565` | stored |
| `rv565/rgb444_zlib_k4.rv565` | packed 12-bit |
| `rv565/rgb666_stored_k3.rv565` | |
| `rv565/rgb888_zlib_k4.rv565` | |
| `rv565/gray8_stored_k3.rv565` | |
| `rv565/gray4_zlib_k4.rv565` | |
| `rv565/mono_zlib_forced_delta_k8.rv565` | |
| `rv565/mono_vpage_zlib_k4.rv565` | page layout |
| `rv565/rgb565be_zlib_partial_k5.rv565` | partial deltas |
| `rv565/gray4_stored_partial_k5.rv565` | partial deltas, stored |
| `rv565/mono_vpage_zlib_partial_k5.rv565` | partial deltas in pages |
| `rv565/rgb565be_zlib_shift_k10.rv565` | shifted bands |
| `rv565/rgb565le_stored_shift_k10.rv565` | shifted bands, stored |
| `rv565/testpattern_v6.rv565` | version 6 (`tests/data/testpattern.rv565`) |

FFmpeg asks for samples on ffmpeg-devel (or in the pull request) and a
maintainer with access uploads them; the sample tests are skipped until then.

## Build and test

```bash
git clone https://code.ffmpeg.org/FFmpeg/FFmpeg.git && cd FFmpeg
git am /path/to/rv565/contrib/ffmpeg/000*.patch
./configure --enable-zlib --disable-doc
make -j"$(nproc)"

make fate-source fate-rv565-demux fate-lavf-rv565 fate-seek-lavf-rv565 \
     fate-rv565-enc-rgb565be fate-rv565-enc-mono_vpage fate-rv565-enc-delta \
     fate-rv565-enc-tolerance

# Sample tests, with the files above in $SAMPLES/rv565/
make SAMPLES=$SAMPLES fate-rv565 fate-seek-extra-rv565

# By hand
./ffprobe -hide_banner /path/to/rv565/tests/data/v7/mono_vpage_zlib_k4.rv565
./ffmpeg -i input.mp4 -vf scale=128:64 -r 15 -c:v rv565 -format mono_vpage -g 15 out.rv565
./ffmpeg -i ui.mp4 -vf scale=320:240 -r 30 -c:v rv565 -g 30 -tolerance 8 ui.rv565
python3 /path/to/rv565/tools/rv565.py verify out.rv565
```

## Submitting

The version 6 patch is open as
[FFmpeg#25653](https://code.ffmpeg.org/FFmpeg/FFmpeg/pulls/25653); these two
patches replace it there (force-push of the branch, or a new revision on
ffmpeg-devel), with the samples above offered for fate-suite.
