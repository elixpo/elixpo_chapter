// Checks src/lib/rv565.ts against the RV565 format version 7 and 8
// conformance vectors from github.com/elixpo/rv565 (tests/data/v7, a subset
// copied to scripts/fixtures/rv565-v7, and tests/data/v8, copied to
// scripts/fixtures/rv565-v8) and the version 6 reference vector.
//
//   npm run test:rv565            (node --test, no dependencies needed)
//
// With the reference Python package available, files written here are also
// decoded by it: set RV565_PYTHON_SRC to the package's source directory
// (rv565/python/src in the library repository), or install rv565 >= 2.0
// (>= 3.0 for the region-delta cases).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CODECS, PIXEL_FORMATS, Rv565Encoder, Rv565Error, bytesSentFraction, changedLines, changedRects, checkSchedule, convertPixels,
  decodeFrame, encodeClip, frameLines, frameSize, frameTypeCounts, linesSentFraction, parseContainer,
  rgb565beToRgba, rgbaToRgb565be, testPatternFrame, toCArray, toRgba, verify,
} from "../src/lib/rv565.ts";

const FIXTURES = new URL("./fixtures/rv565-v7/", import.meta.url);
const FIXTURES_V8 = new URL("./fixtures/rv565-v8/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", FIXTURES), "utf8"));
const manifestV8 = JSON.parse(readFileSync(new URL("manifest.json", FIXTURES_V8), "utf8"));
const load = (file, dir = FIXTURES) => new Uint8Array(readFileSync(new URL(file, dir)));
const sha = (data) => createHash("sha256").update(data).digest("hex");
const TYPES = ["key", "delta", "repeat", "partial", "region"];

/** tools/make_conformance.py rgb_frames(): a gradient with a moving square;
 * frame 5 repeats frame 4. */
function conformanceRgb() {
  const { width: W, height: H } = manifest;
  return Array.from({ length: 10 }, (_, f) => {
    const t = f <= 5 ? Math.min(f, 4) : f - 1;
    const out = new Uint8Array(3 * W * H);
    let o = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const px = t * 2 <= x && x < t * 2 + 6 && 3 <= y && y < 9
          ? ((x + y) % 2 ? [255, 255, 255] : [255, 32, 0])
          : [Math.floor((x * 255) / (W - 1)), Math.floor((y * 255) / (H - 1)), 96];
        out.set(px, o);
        o += 3;
      }
    }
    return out;
  });
}

const rgbToRgba = (rgb) => {
  const out = new Uint8ClampedArray((rgb.length / 3) * 4);
  for (let i = 0, o = 0; i < rgb.length; i += 3, o += 4) out.set([rgb[i], rgb[i + 1], rgb[i + 2], 255], o);
  return out;
};

test("manifest covers every pixel format, both codecs, deltas, partial deltas, repeats and version 6", () => {
  const valid = manifest.valid;
  assert.deepEqual(new Set(valid.map((v) => v.pixel_format)), new Set(PIXEL_FORMATS));
  assert.deepEqual(new Set(valid.map((v) => v.codec)), new Set(CODECS));
  for (const fmt of PIXEL_FORMATS) {
    for (const codec of CODECS) {
      assert.ok(valid.some((v) => v.pixel_format === fmt && v.codec === codec && v.frame_types.includes("partial")), `${fmt} ${codec} partial`);
    }
  }
  assert.ok(manifest.invalid.filter((v) => v.file.includes("partial")).length >= 9);
  assert.ok(valid.some((v) => v.file.includes("shift")));
  assert.ok(valid.some((v) => v.version === 6));
  assert.ok(valid.some((v) => v.codec === "stored" && v.frame_types.includes("delta")));
  assert.ok(valid.some((v) => v.frame_types.includes("repeat")));
});

test("v8 manifest covers region deltas in every pixel format and codec, shifted ones, and invalid ones", () => {
  for (const fmt of PIXEL_FORMATS) {
    for (const codec of CODECS) {
      assert.ok(manifestV8.valid.some((v) => v.pixel_format === fmt && v.codec === codec && v.frame_types.includes("region")), `${fmt} ${codec}`);
    }
  }
  assert.ok(manifestV8.valid.some((v) => v.file.includes("shift")));
  assert.ok(manifestV8.invalid.length >= 10);
});

const valid = [...manifest.valid.map((v) => [v, FIXTURES]), ...manifestV8.valid.map((v) => [v, FIXTURES_V8])];
const invalid = [...manifest.invalid.map((v) => [v, FIXTURES]), ...manifestV8.invalid.map((v) => [v, FIXTURES_V8])];

for (const [v, dir] of valid) {
  test(`decodes ${v.file}`, async () => {
    const clip = parseContainer(load(v.file, dir));
    const h = clip.header;
    assert.deepEqual(
      [h.version, h.width, h.height, h.fps, h.frames, h.pixelFormat, h.codec, h.keyframeInterval, h.frameBytes],
      [v.version, v.width, v.height, v.fps, v.frames, v.pixel_format, v.codec, v.keyframe_interval, v.frame_bytes],
    );
    assert.deepEqual(clip.index.map((r) => TYPES[r.type]), v.frame_types);
    assert.deepEqual(v.frame_types.map((_, i) => changedLines(clip, i)), v.changed_lines);
    if (v.changed_rects) assert.deepEqual(v.frame_types.map((_, i) => changedRects(clip, i)), v.changed_rects);
    for (let i = 0; i < v.frames; i++) assert.equal(sha(await decodeFrame(clip, i)), v.frame_sha256[i], `frame ${i} in order`);
    // Random access: a fresh clip, frames in reverse, each a seek from a keyframe.
    const seek = parseContainer(load(v.file, dir));
    for (let i = v.frames - 1; i >= 0; i--) {
      seek.last = undefined;
      assert.equal(sha(await decodeFrame(seek, i)), v.frame_sha256[i], `frame ${i} by seeking`);
    }
    // The preview path accepts every frame.
    assert.equal(toRgba(await decodeFrame(seek, 0), h.width, h.height, h.pixelFormat).length, 4 * h.width * h.height);
  });
}

for (const [v, dir] of invalid) {
  test(`rejects ${v.file} (${v.reason}, at ${v.stage})`, async () => {
    const data = load(v.file, dir);
    if (v.stage === "open") {
      assert.throws(() => parseContainer(data), Rv565Error);
    } else {
      const clip = parseContainer(data);
      await assert.rejects(verify(clip), Rv565Error);
    }
  });
}

test("pixel conversion is bit-identical to the reference rules", () => {
  const rgb = conformanceRgb();
  const { width: W, height: H } = manifest;
  for (const fmt of PIXEL_FORMATS) {
    const v = manifest.valid.find((e) => e.pixel_format === fmt && e.version === 7);
    rgb.forEach((frame, i) => {
      const out = convertPixels(frame, W, H, fmt, 3);
      assert.equal(out.length, frameSize(fmt, W, H));
      assert.equal(sha(out), v.frame_sha256[i], `${fmt} frame ${i}`);
      assert.deepEqual(convertPixels(rgbToRgba(frame), W, H, fmt, 4), out, `${fmt} frame ${i} from RGBA`);
    });
  }
});

test("RGB565 helpers keep their behaviour", () => {
  const be = Uint8Array.of(0xf8, 0x00, 0x07, 0xe0, 0x00, 0x1f, 0xff, 0xff, 0x00, 0x00);
  const rgba = rgb565beToRgba(be);
  assert.deepEqual(Array.from(rgba.subarray(0, 4)), [255, 0, 0, 255]);
  assert.deepEqual(Array.from(rgba.subarray(12, 16)), [255, 255, 255, 255]);
  assert.deepEqual(rgbaToRgb565be(rgba), be);
});

test("encoder chooses frames like the reference and round-trips every format and codec", async () => {
  const { width: W, height: H, fps } = manifest;
  const rgb = conformanceRgb();
  for (const pixelFormat of PIXEL_FORMATS) {
    const frames = rgb.map((f) => convertPixels(f, W, H, pixelFormat, 3));
    for (const codec of CODECS) {
      for (const keyframeInterval of [1, 3, 4, 255]) {
        for (const bandLines of [0, 1, 4, 8]) {
          const what = `${pixelFormat} ${codec} K${keyframeInterval} B${bandLines}`;
          const clip = parseContainer(await encodeClip(W, H, fps, frames, { pixelFormat, codec, keyframeInterval, bandLines }));
          const v7 = parseContainer(await encodeClip(W, H, fps, frames, { pixelFormat, codec, keyframeInterval, bandLines, version: 7 }));
          // Version 8 exactly when a region delta was written.
          assert.equal(clip.header.version, frameTypeCounts(clip).region ? 8 : 7, what);
          assert.equal(v7.header.version, 7);
          assert.equal(frameTypeCounts(v7).region, 0, `${what}: version 7 writes no region deltas`);
          clip.index.forEach((r, i) => {
            const type = TYPES[r.type];
            if (i % keyframeInterval === 0) assert.equal(type, "key", `${what} frame ${i}`);
            else if (i === 5) assert.equal(type, "repeat", `${what}: frame 5 repeats frame 4`);
            else if (codec === "stored") assert.notEqual(type, "delta", `${what}: a stored delta is never smaller`);
            if (!bandLines) assert.ok(type !== "partial" && type !== "region", `${what}: band height 0 disables partials and regions`);
            if (type === "partial") assert.equal(r.partial.band, bandLines);
            if (type === "region") {
              assert.equal(r.region.band, bandLines);
              assert.ok(r.region.ranges.some(([, xw]) => xw < frameLines(pixelFormat, W, H)[1]), `${what}: a region delta has a narrower range`);
            }
          });
          if (bandLines && keyframeInterval === 255) {
            // The moving square leaves bands untouched (mono_vpage has 2 pages,
            // so only band height 1 can skip one).
            if (pixelFormat !== "mono_vpage" || bandLines === 1) {
              assert.ok(frameTypeCounts(v7).partial > 0, `${what}: unchanged bands make partial deltas`);
              assert.ok(linesSentFraction(v7) < 1, `${what}: fewer lines sent`);
            }
            // The square changes a few pixels of each line: region deltas
            // (monochrome lines are only 2-3 bytes, too short to narrow).
            if (!pixelFormat.startsWith("mono")) {
              assert.ok(frameTypeCounts(clip).region > 0, `${what}: narrow changes make region deltas`);
              assert.ok(bytesSentFraction(clip) < bytesSentFraction(v7), `${what}: fewer bytes sent`);
            }
          }
          for (let i = 0; i < frames.length; i++) assert.deepEqual(await decodeFrame(v7, i), frames[i], `${what} v7 frame ${i}`);
          if (codec === "zlib" && keyframeInterval === 255 && !bandLines) {
            assert.ok(frameTypeCounts(clip).delta > 0, `${what}: small motion makes deltas`);
          }
          for (let i = 0; i < frames.length; i++) assert.deepEqual(await decodeFrame(clip, i), frames[i], `${what} frame ${i}`);
        }
      }
    }
  }
});

test("partial deltas carry exactly the changed bands", async () => {
  const W = 10, H = 20;
  const a = new Uint8Array(2 * W * H).fill(0x11);
  const b = a.slice();
  b[2 * W * 9] ^= 0xff;            // row 9: band 1 with 8-line bands
  b[2 * W * 19 + 3] ^= 0x01;       // row 19: band 2, the short last band
  const clip = parseContainer(await encodeClip(W, H, 10, [a, b], { keyframeInterval: 2, codec: "stored", version: 7 }));
  assert.equal(TYPES[clip.index[1].type], "partial");
  assert.deepEqual(clip.index[1].partial.changed, [1, 2]);
  assert.deepEqual(changedLines(clip, 1), [[8, 12]]);
  assert.deepEqual(changedLines(clip, 0), [[0, 20]]);
  assert.deepEqual(await decodeFrame(clip, 1), b);
  assert.deepEqual(clip.index[1].partial.shifts, [[0, 0], [0, 0]]);
  assert.deepEqual(frameLines("mono_vpage", 128, 64), [8, 128]);
  assert.deepEqual(frameLines("rgb444", 21, 13), [13, 32]);
});

test("region deltas carry exactly the changed range of each changed band", async () => {
  const W = 10, H = 20, R = 2 * W;
  const a = new Uint8Array(R * H).fill(0x11);
  const b = a.slice();
  b[R * 9 + 3] ^= 0xff;            // row 9, byte 3 (pixel 1): band 1, bytes 2-3
  b[R * 19 + 18] ^= 0x01;          // row 19, byte 18 (pixel 9): band 2, bytes 18-19
  b[R * 17 + 10] ^= 0x01;          // row 17, byte 10 (pixel 5): band 2 widens to 10-19
  const data = await encodeClip(W, H, 10, [a, b], { keyframeInterval: 2, codec: "stored" });
  assert.equal(data[3], 8);
  const clip = parseContainer(data);
  assert.equal(TYPES[clip.index[1].type], "region");
  assert.deepEqual(clip.index[1].region.changed, [1, 2]);
  assert.deepEqual(clip.index[1].region.ranges, [[2, 2], [10, 10]]);
  assert.deepEqual(changedRects(clip, 1), [[8, 8, 2, 2], [16, 4, 10, 10]]);
  assert.deepEqual(changedLines(clip, 1), [[8, 12]]);
  assert.deepEqual(changedRects(clip, 0), [[0, 20, 0, R]]);
  assert.deepEqual(await decodeFrame(clip, 1), b);
  // rgb444 ranges align to 3 bytes (two pixels) or run to the end of the line.
  const W4 = 5, R4 = 8;
  const c = new Uint8Array(R4 * 4).fill(0x22), d = c.slice();
  d[R4 + 7] ^= 0x10;
  const clip4 = parseContainer(await encodeClip(W4, 4, 10, [c, d], { keyframeInterval: 2, codec: "stored", pixelFormat: "rgb444" }));
  assert.equal(TYPES[clip4.index[1].type], "region");
  assert.deepEqual(clip4.index[1].region.ranges, [[6, 2]]);
  assert.deepEqual(await decodeFrame(clip4, 1), d);
  // Version 7 asked for: a partial delta, and the file says version 7.
  const old = await encodeClip(W, H, 10, [a, b], { keyframeInterval: 2, codec: "stored", version: 7 });
  assert.equal(old[3], 7);
  assert.equal(TYPES[parseContainer(old).index[1].type], "partial");
  // A change across the whole width: no region delta, version 7.
  const wide = a.slice();
  wide[R * 3] ^= 1; wide[R * 3 + R - 1] ^= 1;
  const w = await encodeClip(W, H, 10, [a, wide], { keyframeInterval: 2, codec: "stored" });
  assert.equal(w[3], 7);
  assert.equal(TYPES[parseContainer(w).index[1].type], "partial");
  // Version 8 asked for always says 8.
  assert.equal((await encodeClip(W, H, 10, [a, wide], { keyframeInterval: 2, version: 8 }))[3], 8);
  assert.throws(() => new Rv565Encoder(4, 4, 24, { version: 9 }), Rv565Error);
});

test("partial deltas shift bands to follow scrolling and panning", async () => {
  const W = 16, H = 16, R = 2 * W;
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24;
  const a = Uint8Array.from({ length: R * H }, rand);
  // Scrolled up by 2 lines: a band's lines come from 2 lines further down.
  const up = new Uint8Array(R * H);
  for (let y = 0; y < H; y++) up.set(y + 2 < H ? a.subarray((y + 2) * R, (y + 3) * R) : new Uint8Array(R), y * R);
  // Panned right by 1 pixel (2 bytes).
  const right = new Uint8Array(R * H);
  for (let y = 0; y < H; y++) right.set(a.subarray(y * R, y * R + R - 2), y * R + 2);
  for (const [frame, shift] of [[up, [0, -2]], [right, [2, 0]]]) {
    const clip = parseContainer(await encodeClip(W, H, 10, [a, frame], { keyframeInterval: 2, codec: "stored" }));
    assert.equal(TYPES[clip.index[1].type], "partial");
    assert.deepEqual(clip.index[1].partial.shifts, [shift, shift]);
    assert.deepEqual(await decodeFrame(clip, 1), frame);
    const off = parseContainer(await encodeClip(W, H, 10, [a, frame], { keyframeInterval: 2, codec: "stored", motionRange: 0 }));
    if (off.index[1].partial) assert.deepEqual(off.index[1].partial.shifts, [[0, 0], [0, 0]]);
    assert.deepEqual(await decodeFrame(off, 1), frame);
  }
  assert.throws(() => new Rv565Encoder(4, 4, 24, { motionRange: 256 }), Rv565Error);
});

/** Deterministic noise frames: a base image, then per-frame small jitter
 * (|d| <= jitter) on every channel plus a few large changes. */
function noisyRgb(W, H, count, jitter, seed = 12345) {
  const rand = () => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24;
  const base = Uint8Array.from({ length: 3 * W * H }, rand);
  return Array.from({ length: count }, (_, f) => {
    const frame = base.map((v) => Math.max(0, Math.min(255, v + (f ? (rand() % (2 * jitter + 1)) - jitter : 0))));
    for (let k = 0; k < 3 * f; k++) frame[rand() % frame.length] = rand();
    return frame;
  });
}

test("tolerance bounds the error per channel and turns small changes into repeats", async () => {
  const W = 19, H = 11;
  const rgb = noisyRgb(W, H, 8, 6);
  for (const pixelFormat of PIXEL_FORMATS) {
    const frames = rgb.map((f) => convertPixels(f, W, H, pixelFormat, 3));
    for (const tolerance of [0, 3, 20, 255]) {
      for (const codec of CODECS) {
        const clip = parseContainer(await encodeClip(W, H, 24, frames, { pixelFormat, codec, keyframeInterval: 4, tolerance }));
        for (let i = 0; i < frames.length; i++) {
          const got = toRgba(await decodeFrame(clip, i), W, H, pixelFormat);
          const want = toRgba(frames[i], W, H, pixelFormat);
          let worst = 0;
          for (let k = 0; k < got.length; k++) worst = Math.max(worst, Math.abs(got[k] - want[k]));
          assert.ok(worst <= tolerance, `${pixelFormat} ${codec} T${tolerance} frame ${i}: error ${worst}`);
        }
        if (tolerance === 255) {
          // Everything is within 255: every frame after the first shows frame 0.
          const counts = frameTypeCounts(clip);
          assert.equal(counts.repeat, frames.length - 1 - Math.floor((frames.length - 1) / 4), `${pixelFormat} ${codec}`);
        }
      }
    }
  }
  // Only jitter, no large changes: a tolerance at least the jitter gives repeats.
  const still = noisyRgb(W, H, 6, 2).map((f) => convertPixels(f, W, H, "rgb888", 3));
  const jittered = parseContainer(await encodeClip(W, H, 24, [still[0], ...still.slice(1).map((f) => {
    const out = still[0].slice();
    for (let k = 0; k < out.length; k++) out[k] = Math.max(0, Math.min(255, still[0][k] + ((f[k] + k) % 5) - 2));
    return out;
  })], { pixelFormat: "rgb888", keyframeInterval: 255, tolerance: 2 }));
  assert.equal(frameTypeCounts(jittered).repeat, 5);
  assert.throws(() => new Rv565Encoder(4, 4, 24, { tolerance: 256 }), Rv565Error);
  assert.throws(() => new Rv565Encoder(4, 4, 24, { bandLines: 256 }), Rv565Error);
});

test("writes version 6 for older players, and only what version 6 allows", async () => {
  const frames = Array.from({ length: 6 }, (_, i) => testPatternFrame(i, 6, 32, 16));
  const data = await encodeClip(32, 16, 12, frames, { version: 6 });
  assert.deepEqual(Array.from(data.subarray(0, 4)), [0x52, 0x56, 0x35, 6]);
  const clip = parseContainer(data);
  assert.equal(clip.header.headerSize, 12);
  for (let i = 0; i < 6; i++) assert.deepEqual(await decodeFrame(clip, i), frames[i]);
  for (const bad of [{ pixelFormat: "gray8" }, { codec: "stored" }, { keyframeInterval: 2 }]) {
    assert.throws(() => new Rv565Encoder(32, 16, 12, { version: 6, ...bad }), Rv565Error);
  }
  assert.throws(() => new Rv565Encoder(32, 16, 31, { version: 6 }), Rv565Error);
  assert.throws(() => new Rv565Encoder(32, 16, 61), Rv565Error);
  assert.throws(() => new Rv565Encoder(32, 16, 24, { keyframeInterval: 256 }), Rv565Error);
  assert.throws(() => new Rv565Encoder(0, 16, 24), Rv565Error);
});

test("v6 reference vector decodes to the test pattern", async () => {
  const clip = parseContainer(new Uint8Array(readFileSync(new URL("./fixtures/testpattern.rv565", import.meta.url))));
  for (let i = 0; i < 24; i++) assert.deepEqual(await decodeFrame(clip, i), testPatternFrame(i, 24, 180, 135), `frame ${i}`);
  const report = checkSchedule(clip, true);
  assert.equal(report.lateFrames, 0);
  assert.equal(report.worstFrameUs, 31312);
  const text = toCArray(clip, "testpattern.rv565");
  assert.match(text, /^\/\* Generated by tools\/rv565\.py from testpattern\.rv565: 180x135, 24 FPS, 24 frames\. \*\//);
  assert.match(text, /static const size_t rv565_clip_size = sizeof\(rv565_clip\);\n$/);
});

/* Cross-check with the reference Python package. */

const PY_CHECK = String.raw`
import io, json, sys
src = sys.argv[1]
if src:
    sys.path.insert(0, src)
import rv565
assert rv565.VERSION == 7, "rv565 %s reads only version 6" % rv565.__version__
has_rects = hasattr(rv565.Clip, "changed_rects")
d = sys.argv[2]
cases = json.load(open(d + "/cases.json"))
for c in cases:
    data = open(d + "/" + c["file"], "rb").read()
    clip = rv565.open(data)
    h = clip.header
    w, ht, fmt, t = h.width, h.height, h.pixel_format, c["tolerance"]
    assert (h.version, w, ht, h.fps, fmt, h.codec, h.keyframe_interval) == (
        c["version"], c["width"], c["height"], c["fps"], c["pixel_format"], c["codec"], c["keyframe_interval"]), c["file"]
    assert [clip.frame_type(i) for i in range(len(clip))] == c["types"], c["file"]
    assert [[list(r) for r in clip.changed_lines(i)] for i in range(len(clip))] == c["changed_lines"], c["file"]
    if has_rects:
        assert [[list(r) for r in clip.changed_rects(i)] for i in range(len(clip))] == c["changed_rects"], c["file"]
    rgb = open(d + "/" + c["rgb"], "rb").read()
    js_frames = open(d + "/" + c["frames"], "rb").read()
    preview = open(d + "/" + c["preview"], "rb").read()
    n, size = 3 * w * ht, h.frame_bytes
    clip.verify()
    sources = []
    for i in range(len(clip)):
        source = rv565.convert(rgb[i * n:(i + 1) * n], w, ht, fmt)
        sources.append(source)
        frame = clip.frame(i)
        assert frame == js_frames[i * size:(i + 1) * size], (c["file"], i, "decoded frame differs")
        if t == 0:
            assert frame == source, (c["file"], i)
        else:
            a, b = rv565.to_rgb888(frame, w, ht, fmt), rv565.to_rgb888(source, w, ht, fmt)
            assert max(abs(x - y) for x, y in zip(a, b)) <= t, (c["file"], i, "tolerance exceeded")
        assert rv565.to_rgb888(frame, w, ht, fmt) == preview[i * n:(i + 1) * n], (c["file"], i)
    if h.codec == "stored":
        # Stored output does not depend on a zlib build: the reference encoder
        # must write the very same bytes, frame choices included.
        buf = io.BytesIO()
        rv565.write(buf, w, ht, h.fps, sources, pixel_format=fmt, codec="stored",
                    keyframe_interval=h.keyframe_interval, version=h.version,
                    band_lines=c["band_lines"], tolerance=t, motion_range=c["motion_range"])
        assert buf.getvalue() == data, (c["file"], "differs from the reference encoder")
print(len(cases))
`;

function findPython() {
  const src = process.env.RV565_PYTHON_SRC ?? "";
  const probe = spawnSync("python3", ["-I", "-c", "import sys\nif sys.argv[1]: sys.path.insert(0, sys.argv[1])\nimport rv565\nassert rv565.VERSION == 7\nassert rv565.PARTIAL == 3\nassert hasattr(rv565, 'MOTION_RANGE')\nprint(getattr(rv565, 'REGION', 0) == 4)", src], { encoding: "utf8" });
  return probe.status === 0 ? { src, v8: probe.stdout.trim() === "True" } : null;
}

const py = findPython();
const pySrc = py?.src ?? null;

test("files written here decode identically with the reference Python package",
  { skip: pySrc === null && "reference rv565 with partial deltas not found (set RV565_PYTHON_SRC)" }, async () => {
    const dir = mkdtempSync(join(tmpdir(), "rv565-js-"));
    try {
      // Odd sizes pad rows and pages; noise exercises every value; frame 3
      // repeats frame 2.
      const W = 19, H = 21;
      const rgb = noisyRgb(W, H, 9, 3);
      rgb[3] = rgb[2];
      // A still region: rows 8 and up keep frame 1's pixels from frame 2 on,
      // so partial deltas skip bands; rows 0-7 of frames 5 on scroll and pan
      // frame 4's, so the shift search finds vectors.
      for (let f = 2; f < rgb.length; f++) rgb[f].set(rgb[1].subarray(3 * W * 8), 3 * W * 8);
      for (let f = 5; f < rgb.length; f++) {
        const d = f - 4;
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < W; x++) {
            const sy = Math.min(7, y + d), sx = Math.max(0, x - d);
            rgb[f].set(rgb[4].subarray(3 * (sy * W + sx), 3 * (sy * W + sx) + 3), 3 * (y * W + x));
          }
        }
      }
      const cases = [];
      const writeCase = async (name, opts) => {
        const { pixelFormat, codec, keyframeInterval, bandLines = 8, tolerance = 0, motionRange = 8, version } = opts;
        const frames = rgb.map((f) => convertPixels(f, W, H, pixelFormat, 3));
        const data = await encodeClip(W, H, 30, frames, { pixelFormat, codec, keyframeInterval, bandLines, tolerance, motionRange, version });
        const clip = parseContainer(data);
        const decoded = [], preview = [];
        for (let i = 0; i < frames.length; i++) {
          const frame = await decodeFrame(clip, i);
          decoded.push(frame);
          const rgba = toRgba(frame, W, H, pixelFormat);
          preview.push(Uint8Array.from({ length: 3 * W * H }, (_, j) => rgba[4 * Math.floor(j / 3) + (j % 3)]));
        }
        writeFileSync(join(dir, `${name}.rv565`), data);
        writeFileSync(join(dir, `${name}.frames`), Buffer.concat(decoded));
        writeFileSync(join(dir, `${name}.preview`), Buffer.concat(preview));
        cases.push({
          file: `${name}.rv565`, rgb: "source.rgb", frames: `${name}.frames`, preview: `${name}.preview`, version: clip.header.version,
          width: W, height: H, fps: 30, pixel_format: pixelFormat, codec, keyframe_interval: keyframeInterval,
          band_lines: bandLines, tolerance, motion_range: motionRange,
          types: clip.index.map((r) => TYPES[r.type]),
          changed_lines: clip.index.map((_, i) => changedLines(clip, i)),
          changed_rects: clip.index.map((_, i) => changedRects(clip, i)),
        });
        return clip;
      };
      writeFileSync(join(dir, "source.rgb"), Buffer.concat(rgb));
      // Version 7 always; with a reference that writes version 8, also the
      // default (version 8 when a region delta helps, which the reference
      // must reproduce byte for byte when stored).
      let partials = 0, shifted = 0, regions = 0, shiftedRegions = 0;
      for (const version of py.v8 ? [7, undefined] : [7]) {
        for (const fmt of PIXEL_FORMATS) {
          for (const codec of CODECS) {
            for (const [bandLines, tolerance, motionRange] of [[8, 0, 8], [3, 0, 8], [8, 0, 0], [0, 0, 8], [8, 6, 8], [1, 40, 8], [4, 0, 3]]) {
              const clip = await writeCase(`${fmt}_${codec}_b${bandLines}_t${tolerance}_m${motionRange}_v${version ?? "auto"}`,
                { pixelFormat: fmt, codec, keyframeInterval: 9, bandLines, tolerance, motionRange, version });
              partials += frameTypeCounts(clip).partial;
              regions += frameTypeCounts(clip).region;
              for (const r of clip.index) if (r.partial?.shifts.some(([dx, dy]) => dx || dy)) shifted++;
              for (const r of clip.index) if (r.region?.shifts.some(([dx, dy]) => dx || dy)) shiftedRegions++;
            }
          }
        }
      }
      assert.ok(partials > 0, "the cross-check exercises partial deltas");
      assert.ok(shifted > 0, "the cross-check exercises shifted bands");
      if (py.v8) {
        assert.ok(regions > 0, "the cross-check exercises region deltas");
        assert.ok(shiftedRegions > 0, "the cross-check exercises shifted region bands");
      }
      await writeCase("rgb565be_v6", { pixelFormat: "rgb565be", codec: "zlib", keyframeInterval: 1, version: 6 });
      writeFileSync(join(dir, "cases.json"), JSON.stringify(cases));
      const run = spawnSync("python3", ["-I", "-c", PY_CHECK, pySrc, dir], { encoding: "utf8" });
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.stdout.trim(), String(cases.length));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
