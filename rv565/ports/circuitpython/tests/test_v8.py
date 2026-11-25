# SPDX-FileCopyrightText: 2026 Ayushman Bhattacharya
# SPDX-License-Identifier: MIT
"""Format version 8 (region deltas) conformance and players.

Checks circuitpython_rv565 against tests/data/v8/manifest.json: every valid
vector decodes to the listed SHA-256 per frame, in order and by random seeks,
from bytes and from a file, with the listed changed_lines and changed_rects;
every invalid vector is rejected at the stage the manifest names. Then checks
that Player marks only each changed band's columns of the bitmap dirty and
that DirectPlayer sends one column window per changed band, through the
panel model in test_v7.

    python3 -m unittest discover -s ports/circuitpython/tests -v
"""

import hashlib
import json
import random
import struct
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import circuitpython_rv565 as rv565  # noqa: E402
import fakes  # noqa: E402
import test_v7 as v7  # noqa: E402  (helpers only; its tests run from test_v7)

V8 = v7.ROOT / "tests" / "data" / "v8"
MANIFEST = json.loads((V8 / "manifest.json").read_text())
REFERENCE = v7.REFERENCE
W, H = v7.W, v7.H


def sha(frame):
    return hashlib.sha256(bytes(frame)).hexdigest()


def vector(name):
    return (V8 / name).read_bytes()


def entry(name):
    for item in MANIFEST["valid"]:
        if item["file"] == name:
            return item
    raise KeyError(name)


def rects_of(clip):
    return [[list(r) for r in clip.changed_rects(i)] for i in range(len(clip))]


class V8ConformanceTest(unittest.TestCase):
    def test_every_valid_vector(self):
        for item in MANIFEST["valid"]:
            with self.subTest(item["file"]):
                for source in (vector(item["file"]), str(V8 / item["file"])):
                    with rv565.open(source) as clip:
                        v7.ConformanceTest.check_header(self, clip, item)
                        self.assertEqual(clip.version, 8)
                        self.assertEqual([sha(f) for f in clip], item["frame_sha256"])
                        self.assertEqual(clip.verify(), item["frames"])

    def test_every_valid_vector_by_random_seeks(self):
        rng = random.Random(8)
        for item in MANIFEST["valid"]:
            with self.subTest(item["file"]):
                n = item["frames"]
                order = [rng.randrange(n) for _ in range(3 * n)]
                order += [n - 1, 0, n - 1, n - 2, n - 2]
                for source in (vector(item["file"]), str(V8 / item["file"])):
                    with rv565.open(source) as clip:
                        for i in order:
                            self.assertEqual(sha(clip.frame(i)),
                                             item["frame_sha256"][i], "frame %d" % i)

    def test_changed_lines_and_rects(self):
        for item in MANIFEST["valid"]:
            with self.subTest(item["file"]):
                for source in (vector(item["file"]), str(V8 / item["file"])):
                    with rv565.open(source) as clip:
                        self.assertEqual(
                            [[list(r) for r in clip.changed_lines(i)]
                             for i in range(len(clip))],
                            item["changed_lines"])
                        self.assertEqual(rects_of(clip), item["changed_rects"])

    def test_v7_changed_rects_are_whole_lines(self):
        for item in v7.MANIFEST["valid"]:
            with self.subTest(item["file"]):
                clip = rv565.open(v7.vector(item["file"]))
                stride = clip.line_bytes
                self.assertEqual(
                    rects_of(clip),
                    [[[f, c, 0, stride] for f, c in runs] for runs in item["changed_lines"]])

    def test_region_vectors_cover_every_format_and_codec(self):
        region = [i for i in MANIFEST["valid"] if "region" in i["frame_types"]]
        self.assertEqual({(i["pixel_format"], i["codec"]) for i in region},
                         {(f, c) for f in rv565.PIXEL_FORMATS for c in rv565.CODECS})

    def test_shift_vectors_shift(self):
        shifted = narrow = 0
        for item in MANIFEST["valid"]:
            clip = rv565.open(vector(item["file"]))
            for i in range(len(clip)):
                if clip.frame_type(i) != "region":
                    continue
                offset, length = clip._span(i)
                entries = clip._layout(offset, length, True)[2]
                shifted += any(entries[k] or entries[k + 1]
                               for k in range(0, len(entries), 6))
                narrow += any(xw < clip.line_bytes for _, _, _, xw in clip.changed_rects(i))
        self.assertGreater(shifted, 0)
        self.assertGreater(narrow, 0)

    def test_every_invalid_vector_is_rejected_at_its_stage(self):
        for item in MANIFEST["invalid"]:
            with self.subTest(item["file"]):
                data = vector(item["file"])
                if item["stage"] == "open":
                    with self.assertRaises(rv565.RV565Error):
                        rv565.open(data).build_index()
                else:
                    clip = rv565.open(data)
                    clip.build_index()
                    with self.assertRaises(rv565.RV565Error):
                        clip.verify()
                with self.assertRaises(rv565.RV565Error):
                    with rv565.open(str(V8 / item["file"])) as clip:
                        clip.verify()

    def test_index_rules(self):
        cases = {
            "invalid_region_in_v7.rv565": "frame type 4",
            "invalid_region_band_0.rv565": "region delta with band height 0",
            "invalid_region_short_entries.rv565": "too short for its band entries",
            "invalid_region_no_band.rv565": "no changed band",
            "invalid_region_misaligned_start.rv565": "invalid range",
            "invalid_region_misaligned_end.rv565": "invalid range",
            "invalid_region_zero_width.rv565": "invalid range",
            "invalid_region_past_line.rv565": "invalid range",
            "invalid_region_shift_dy_too_far.rv565": "more than it has",
            "invalid_region_stored_wrong_size.rv565": "stored region frame",
            "invalid_region_at_keyframe.rv565": "must be a keyframe",
        }
        self.assertEqual(set(cases) | {"invalid_region_inflate_short.rv565"},
                         {i["file"] for i in MANIFEST["invalid"]})
        for name, message in cases.items():
            with self.subTest(name):
                clip = rv565.open(vector(name))
                with self.assertRaisesRegex(rv565.RV565Error, message):
                    clip.build_index()

    def test_versions(self):
        data = bytearray(vector("gray8_zlib_region_k5.rv565"))
        self.assertEqual(rv565.parse_header(bytes(data))[5], 8)
        data[3] = 7  # a version 7 file may not hold region deltas
        with self.assertRaisesRegex(rv565.RV565Error, "frame type 4"):
            rv565.open(bytes(data)).build_index()
        for version in (5, 9):
            data[3] = version
            with self.assertRaisesRegex(rv565.RV565Error, "version %d" % version):
                rv565.open(bytes(data))

    def test_xor_fallback_without_long_integers(self):
        saved = rv565._BIGINT
        rv565._BIGINT = False
        try:
            for name in ("rgb565be_zlib_region_shift_k10.rv565",
                         "rgb444_stored_region_k5.rv565",
                         "mono_vpage_zlib_region_k5.rv565"):
                item = entry(name)
                clip = rv565.open(vector(name))
                self.assertEqual([sha(f) for f in clip], item["frame_sha256"])
        finally:
            rv565._BIGINT = saved

    def test_region_band_matches_reference(self):
        # Every (dx, dy) and many ranges on a 3-line band of 6-byte lines,
        # against the reference's prediction restricted to the range.
        rng = random.Random(6)
        clip = rv565.open(vector("gray8_zlib_region_k5.rv565"))
        clip.line_bytes = 6
        prev = bytes(rng.randrange(256) for _ in range(36))
        residual = bytes(rng.randrange(256) for _ in range(18))
        for x0, xw in ((0, 6), (0, 1), (2, 3), (5, 1), (1, 4)):
            for dx in range(-8, 9):
                for dy in range(-2, 3):
                    frame = bytearray(prev)
                    entry_bytes = bytes((dx & 255, dy & 255, x0, 0, xw, 0))
                    pos = clip._decode_range(frame, residual, 0, 2, 5, entry_bytes)
                    self.assertEqual(pos, 3 * xw)
                    pred = REFERENCE._predict(prev, 2, 5, 6, dx, dy)
                    want = bytearray(prev)
                    for r in range(3):
                        for j in range(xw):
                            want[(2 + r) * 6 + x0 + j] = (pred[r * 6 + x0 + j]
                                                          ^ residual[r * xw + j])
                    self.assertEqual(bytes(frame), bytes(want), (x0, xw, dx, dy))

    def test_columns(self):
        # 21 pixels wide: rgb444 lines are 32 bytes, gray4 11, mono 3.
        want = {
            "rgb565be": ((4, 6), (2, 3)),
            "rgb444": ((3, 29), (2, 19)),
            "rgb666": ((3, 6), (1, 2)),
            "gray8": ((4, 6), (4, 6)),
            "gray4": ((4, 7), (8, 13)),
            "mono": ((1, 2), (8, 13)),
        }
        for fmt, (rng_bytes, cols) in want.items():
            with self.subTest(fmt):
                clip = rv565.open(vector("%s_zlib_region_k5.rv565" % fmt))
                self.assertEqual(clip.columns(*rng_bytes), cols)
                self.assertEqual(clip.columns(0, clip.line_bytes), (0, clip.width))

    def test_dirty_rects(self):
        data, frames = v7.square_clip(version=None)
        clip = rv565.open(data)
        types = [clip.frame_type(i) for i in range(len(clip))]
        self.assertEqual(types[4], "repeat")
        self.assertEqual(types[5], "region")
        self.assertEqual(clip.dirty_rects(4, 5), clip.changed_rects(5))
        self.assertEqual(clip.dirty_rects(3, 5), clip.changed_rects(5))  # 4 repeats
        self.assertEqual(clip.dirty_rects(5, 5), [])
        stride = clip.line_bytes
        for since, i in ((None, 5), (2, 5), (6, 5)):
            self.assertEqual(clip.dirty_rects(since, i),
                             [(f, c, 0, stride) for f, c in clip.dirty_lines(since, i)])
        for i in range(len(clip)):
            for f, c, x0, xw in clip.changed_rects(i):
                self.assertTrue(x0 % 2 == 0 and xw % 2 == 0 and x0 + xw <= stride)


def windows(clip, rects):
    """Pixels (x, y) the rectangles cover."""
    out = set()
    for first, count, x0, xw in rects:
        col, cols = clip.columns(x0, xw)
        for y in range(first, first + count):
            for x in range(col, col + cols):
                out.add((x, y))
    return out


class RegionPlayerTest(unittest.TestCase):
    def setUp(self):
        fakes.install()

    def tearDown(self):
        fakes.uninstall()

    def check_player_windows(self):
        for fmt in ("rgb565be", "gray4", "mono"):
            with self.subTest(fmt):
                data, frames = v7.square_clip(fmt, version=None)
                clip = rv565.open(data)
                self.assertIn("region", [clip.frame_type(i) for i in range(len(clip))])
                player = rv565.Player(clip, fakes.Display())
                item = {"width": W, "height": H, "pixel_format": fmt}
                for i in range(len(clip)):
                    player.bitmap.dirty.clear()
                    rects = clip.dirty_rects(player._shown_content, i)
                    player.show(i)
                    covered = windows(clip, rects)
                    self.assertEqual(player.bitmap.dirty, covered, i)
                    self.assertEqual(player.last_pixels, len(covered))
                    if clip.frame_type(i) == "region":
                        self.assertLess(len(covered), W * len({y for _, y in covered}))
                    self.assertEqual(v7.V7PlayerTest.shown_rgb(self, player),
                                     v7.expected_rgb(item, frames[i]), i)

    def test_player_updates_only_windows(self):
        self.check_player_windows()

    def test_player_windows_with_bitmap_blit(self):
        fakes.install(with_blit=False)
        displayio = sys.modules["displayio"]

        def bitmap_blit(dest, x, y, src, *, x1=0, y1=0, x2=None, y2=None):
            fakes.blit(dest, src, x, y, x1=x1, y1=y1, x2=x2, y2=y2)

        displayio.Bitmap = type("Bitmap8", (fakes.Bitmap,), {"blit": bitmap_blit})
        self.check_player_windows()

    def test_player_windows_without_readinto(self):
        fakes.install(with_readinto=False, with_blit=False)
        self.check_player_windows()

    def test_player_on_vectors(self):
        for name in ("rgb565be_zlib_region_shift_k10.rv565",
                     "rgb565le_stored_region_k5.rv565",
                     "gray8_zlib_region_k5.rv565",
                     "gray4_zlib_region_shift_k10.rv565",
                     "mono_stored_region_k5.rv565"):
            with self.subTest(name):
                item = entry(name)
                player = rv565.Player(rv565.open(vector(name)), fakes.Display())
                for i in range(item["frames"]):
                    player.show(i)
                    self.assertEqual(v7.V7PlayerTest.shown_rgb(self, player),
                                     v7.expected_rgb(item, player.clip.frame(i)), i)

    def direct(self, clip, panel_bpp):
        bus = fakes.FourWire()
        panel = v7.FakePanel(320, 240, panel_bpp)
        player = rv565.DirectPlayer(clip, bus, 320, 240, clock=fakes.FakeClock(),
                                    sleep=lambda s: None)
        return bus, panel, player

    def test_direct_player_sends_one_window_per_band(self):
        for codec in ("zlib", "stored"):
            with self.subTest(codec):
                data, frames = v7.square_clip(codec=codec, version=None)
                clip = rv565.open(data)
                bus, panel, player = self.direct(clip, 2)
                px, py = (320 - W) // 2, (240 - H) // 2
                for i in range(len(clip)):
                    bus.sent.clear()
                    player.show(i)
                    panel.run(bus.sent)
                    self.assertEqual(panel.region(px, py, W, H), frames[i], i)
                    rects = clip.changed_rects(i)
                    sent = [d for c, d in bus.sent if c == 0x2C]
                    self.assertEqual(sum(len(d) for d in sent),
                                     sum(c * xw for _, c, _, xw in rects))
                    self.assertEqual(player.last_pixels, len(windows(clip, rects)))
                    if clip.frame_type(i) != "region":
                        continue
                    self.assertLess(sum(len(d) for d in sent),
                                    sum(c for _, c, _, _ in rects) * 2 * W)
                    want = []
                    for first, count, x0, xw in rects:
                        col, cols = clip.columns(x0, xw)
                        want.append((0x2A, struct.pack(">HH", px + col,
                                                          px + col + cols - 1)))
                        want.append((0x2B, struct.pack(">HH", py + first,
                                                          py + first + count - 1)))
                    self.assertEqual([s for s in bus.sent if s[0] != 0x2C], want)

    def test_direct_player_small_window_buffer(self):
        # A window larger than the gather buffer goes out in several writes,
        # each at most the buffer (or one range, when a range is longer).
        data, frames = v7.square_clip(version=None)
        saved = rv565._WINDOW_BYTES
        try:
            for limit in (10, 30):
                with self.subTest(limit):
                    rv565._WINDOW_BYTES = limit
                    clip = rv565.open(data)
                    bus, panel, player = self.direct(clip, 2)
                    px, py = (320 - W) // 2, (240 - H) // 2
                    for i in range(len(clip)):
                        bus.sent.clear()
                        player.show(i)
                        panel.run(bus.sent)
                        self.assertEqual(panel.region(px, py, W, H), frames[i], i)
                        writes = [len(d) for c, d in bus.sent if c == 0x2C]
                        if clip.frame_type(i) != "region":
                            continue
                        rects = clip.changed_rects(i)
                        widest = max(xw for _, _, _, xw in rects)
                        self.assertTrue(all(n <= max(limit, widest) for n in writes))
                        self.assertGreater(len(writes), len(rects))
                    self.assertLessEqual(len(player._window), max(limit, 2 * W))
        finally:
            rv565._WINDOW_BYTES = saved

    def test_direct_player_on_vectors(self):
        for name in ("rgb565be_zlib_region_k5.rv565", "rgb565be_stored_region_k5.rv565",
                     "rgb565be_zlib_region_shift_k10.rv565",
                     "rgb666_zlib_region_k5.rv565", "rgb666_stored_region_k5.rv565"):
            with self.subTest(name):
                item = entry(name)
                clip = rv565.open(vector(name))
                bus, panel, player = self.direct(
                    clip, 3 if item["pixel_format"] == "rgb666" else 2)
                px, py = (320 - clip.width) // 2, (240 - clip.height) // 2
                for i in range(len(clip)):
                    bus.sent.clear()
                    player.show(i)
                    panel.run(bus.sent)
                    self.assertEqual(sha(panel.region(px, py, clip.width, clip.height)),
                                     item["frame_sha256"][i], i)
                    sent = sum(len(d) for c, d in bus.sent if c == 0x2C)
                    self.assertEqual(sent, sum(c * xw for _, c, _, xw
                                               in item["changed_rects"][i]))

    def test_play_counts_pixels(self):
        data, frames = v7.square_clip(version=None)
        clip = rv565.open(data)
        clock = fakes.FakeClock()
        player = rv565.DirectPlayer(clip, fakes.FourWire(), 320, 240, clock=clock,
                                    sleep=clock.sleep)
        stats = player.play()
        want = sum(len(windows(clip, clip.changed_rects(i))) for i in range(len(clip)))
        self.assertEqual(stats.pixels_updated, want)
        self.assertLess(stats.pixels_updated, stats.rows_updated * W)
        self.assertIn("pixels", repr(stats))

    def test_player_skipping_regions(self):
        data, frames = v7.square_clip(version=None)
        clip = rv565.open(data)
        clock = fakes.FakeClock()
        player = rv565.Player(clip, None, clock=clock, sleep=clock.sleep)
        real_show = player.show
        item = {"width": W, "height": H, "pixel_format": "rgb565be"}

        def slow_show(i):
            clock.now += 0.2  # 5 FPS on a 12 FPS clip
            result = real_show(i)
            self.assertEqual(v7.V7PlayerTest.shown_rgb(self, player),
                             v7.expected_rgb(item, frames[i]), i)
            return result

        player.show = slow_show
        stats = player.play()
        self.assertGreater(stats.skipped, 0)


if __name__ == "__main__":
    unittest.main()
