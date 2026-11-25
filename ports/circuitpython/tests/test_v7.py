# SPDX-FileCopyrightText: 2026 Ayushman Bhattacharya
# SPDX-License-Identifier: MIT
"""Format version 7 conformance and players, with CPython and fake displayio.

Checks circuitpython_rv565 against tests/data/v7/manifest.json: every valid
vector decodes to the listed SHA-256 per frame, in order and by random seeks,
from bytes and from a file; every invalid vector is rejected at the stage the
manifest names ("open": opening plus building the index; "decode": decoding).
Player and DirectPlayer pixels are compared with the reference package's
to_rgb888.

    python3 -m unittest discover -s ports/circuitpython/tests -v
"""

import hashlib
import importlib.util
import io
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

ROOT = HERE.parent.parent.parent
V7 = ROOT / "tests" / "data" / "v7"
MANIFEST = json.loads((V7 / "manifest.json").read_text())


def _load_reference():
    """The CPython reference package (python/src/rv565), loaded by path."""
    path = ROOT / "python" / "src" / "rv565" / "__init__.py"
    spec = importlib.util.spec_from_file_location("rv565_reference", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["rv565_reference"] = module
    spec.loader.exec_module(module)
    return module


REFERENCE = _load_reference()


def sha(frame):
    return hashlib.sha256(bytes(frame)).hexdigest()


def vector(name):
    return (V7 / name).read_bytes()


def entry(name):
    for item in MANIFEST["valid"]:
        if item["file"] == name:
            return item
    raise KeyError(name)


class ConformanceTest(unittest.TestCase):
    def check_header(self, clip, item):
        self.assertEqual(
            (clip.version, clip.width, clip.height, clip.fps, len(clip),
             clip.pixel_format, clip.pixel_format_id, clip.codec,
             clip.keyframe_interval, clip.frame_bytes),
            (item["version"], item["width"], item["height"], item["fps"],
             item["frames"], item["pixel_format"], item["pixel_format_id"],
             item["codec"], item["keyframe_interval"], item["frame_bytes"]))
        self.assertEqual([clip.frame_type(i) for i in range(len(clip))],
                         item["frame_types"])

    def test_every_valid_vector_in_order(self):
        for item in MANIFEST["valid"]:
            with self.subTest(item["file"]):
                clip = rv565.open(vector(item["file"]))
                self.check_header(clip, item)
                self.assertEqual([sha(f) for f in clip], item["frame_sha256"])
                self.assertEqual(clip.verify(), item["frames"])

    def test_every_valid_vector_from_a_file(self):
        # Stored frames from a file are read straight into the frame buffer
        # (and stored deltas into a scratch buffer).
        for item in MANIFEST["valid"]:
            with self.subTest(item["file"]):
                with rv565.open(str(V7 / item["file"])) as clip:
                    self.check_header(clip, item)
                    self.assertEqual([sha(f) for f in clip], item["frame_sha256"])

    def test_every_valid_vector_by_random_seeks(self):
        rng = random.Random(7)
        for item in MANIFEST["valid"]:
            with self.subTest(item["file"]):
                n = item["frames"]
                order = [rng.randrange(n) for _ in range(3 * n)]
                order += [n - 1, 0, n - 1, n - 2, n - 2]
                for source in (vector(item["file"]), str(V7 / item["file"])):
                    with rv565.open(source) as clip:
                        for i in order:
                            self.assertEqual(sha(clip.frame(i)),
                                             item["frame_sha256"][i],
                                             "frame %d" % i)

    def test_changed_lines_of_every_valid_vector(self):
        for item in MANIFEST["valid"]:
            with self.subTest(item["file"]):
                for source in (vector(item["file"]), str(V7 / item["file"])):
                    with rv565.open(source) as clip:
                        got = [[list(run) for run in clip.changed_lines(i)]
                               for i in range(len(clip))]
                        self.assertEqual(got, item["changed_lines"])

    def test_partial_vectors_cover_every_format_and_codec(self):
        partial = [item for item in MANIFEST["valid"] if "partial" in item["frame_types"]]
        self.assertEqual({(i["pixel_format"], i["codec"]) for i in partial},
                         {(f, c) for f in rv565.PIXEL_FORMATS for c in rv565.CODECS})

    def test_shift_vectors_shift(self):
        shifted = 0
        for item in MANIFEST["valid"]:
            if "shift" not in item["file"]:
                continue
            clip = rv565.open(vector(item["file"]))
            for i in range(len(clip)):
                if clip.frame_type(i) == "partial":
                    offset, length = clip._span(i)
                    shifts = clip._layout(offset, length)[2]
                    shifted += any(shifts)
        self.assertGreater(shifted, 0)

    def test_shifted_band_matches_reference_prediction(self):
        # Every (dx, dy) on a 3-line band of 5-byte lines, including shifts
        # past the line and the band, against the reference's _predict.
        rng = random.Random(5)
        clip = rv565.open(vector("gray8_zlib_k4.rv565"))
        clip.line_bytes = 5
        prev = bytes(rng.randrange(256) for _ in range(30))
        residual = bytes(rng.randrange(256) for _ in range(15))
        for dx in range(-7, 8):
            for dy in range(-2, 3):
                frame = bytearray(prev)
                clip._decode_band(frame, residual, 0, 2, 5, dx, dy)
                pred = REFERENCE._predict(prev, 2, 5, 5, dx, dy)
                want = bytes(a ^ b for a, b in zip(pred, residual))
                self.assertEqual(bytes(frame[10:25]), want, (dx, dy))
                self.assertEqual(frame[:10] + frame[25:], prev[:10] + prev[25:])

    def test_every_invalid_vector_is_rejected_at_its_stage(self):
        for item in MANIFEST["invalid"]:
            with self.subTest(item["file"]):
                data = vector(item["file"])
                if item["stage"] == "open":
                    with self.assertRaises(rv565.RV565Error):
                        rv565.open(data).build_index()
                else:
                    clip = rv565.open(data)
                    clip.build_index()  # the container itself is valid
                    with self.assertRaises(rv565.RV565Error):
                        clip.verify()

    def test_invalid_vectors_rejected_from_files_too(self):
        for item in MANIFEST["invalid"]:
            with self.subTest(item["file"]):
                with self.assertRaises(rv565.RV565Error):
                    with rv565.open(str(V7 / item["file"])) as clip:
                        clip.verify()

    def test_xor_fallback_without_long_integers(self):
        saved = rv565._BIGINT
        rv565._BIGINT = False
        try:
            for name in ("rgb565be_zlib_forced_delta_k8.rv565",
                         "rgb444_stored_forced_delta_k8.rv565",
                         "mono_zlib_k4.rv565",
                         "rgb666_stored_partial_k5.rv565",
                         "mono_vpage_zlib_partial_k5.rv565"):
                item = entry(name)
                clip = rv565.open(vector(name))
                self.assertEqual([sha(f) for f in clip], item["frame_sha256"])
        finally:
            rv565._BIGINT = saved

    def test_xor_into_across_chunks(self):
        rng = random.Random(1)
        for n in (0, 1, 3, rv565._XOR_CHUNK - 1, rv565._XOR_CHUNK,
                  2 * rv565._XOR_CHUNK + 5):
            a = bytes(rng.randrange(256) for _ in range(n))
            b = bytes(rng.randrange(256) for _ in range(n))
            dst = bytearray(a)
            rv565._xor_into(dst, memoryview(b))
            self.assertEqual(bytes(dst), bytes(x ^ y for x, y in zip(a, b)))

    def test_frame_buffer_is_reused(self):
        clip = rv565.open(vector("rgb565be_zlib_k4.rv565"))
        first = clip.frame(0)
        self.assertIs(clip.frame(1), first)
        self.assertEqual(len(first), clip.frame_bytes)

    def test_content_index_follows_repeats(self):
        clip = rv565.open(vector("rgb565be_zlib_k4.rv565"))
        self.assertEqual(clip.frame_type(5), "repeat")
        self.assertEqual(clip.content_index(5), 4)
        self.assertEqual(clip.content_index(6), 6)
        self.assertEqual(clip.payload_sizes()[5], 0)
        self.assertEqual(bytes(clip.payload(5)), b"")

    def test_header_reports_reserved_values(self):
        cases = {
            "invalid_pixel_format_9.rv565": "pixel format 9",
            "invalid_codec_2.rv565": "codec 2",
            "invalid_keyframe_interval_0.rv565": "keyframe interval 0",
            "invalid_header_size_15.rv565": "header size 15",
            "invalid_fps_61.rv565": "fps 61",
            "invalid_v6_fps_31.rv565": "fps 31",
        }
        for name, message in cases.items():
            with self.subTest(name):
                with self.assertRaisesRegex(rv565.RV565Error, message):
                    rv565.open(vector(name))

    def test_index_rules(self):
        cases = {
            "invalid_frame_type_4.rv565": "frame type 4",
            "invalid_first_frame_delta.rv565": "frame 0 must be a keyframe",
            "invalid_missing_keyframe.rv565": "must be a keyframe",
            "invalid_repeat_with_body.rv565": "has a body",
            "invalid_stored_wrong_size.rv565": "stored frame",
            "invalid_partial_band_0.rv565": "band height 0",
            "invalid_partial_short_mask.rv565": "too short for its band mask",
            "invalid_partial_no_band.rv565": "no changed band",
            "invalid_partial_band_past_end.rv565": "past the frame",
            "invalid_partial_stored_wrong_size.rv565": "stored partial frame",
            "invalid_partial_at_keyframe.rv565": "must be a keyframe",
            "invalid_partial_short_shifts.rv565": "too short for its band shifts",
            "invalid_partial_shift_dy_too_far.rv565": "more than it has",
        }
        for name, message in cases.items():
            with self.subTest(name):
                clip = rv565.open(vector(name))  # the header is fine
                with self.assertRaisesRegex(rv565.RV565Error, message):
                    clip.build_index()

    def test_frame_size(self):
        self.assertEqual(rv565.frame_size("rgb565be", 180, 135), 48600)
        self.assertEqual([rv565.frame_size(f, 21, 13) for f in rv565.PIXEL_FORMATS],
                         [REFERENCE.frame_size(f, 21, 13) for f in rv565.PIXEL_FORMATS])
        with self.assertRaises(rv565.RV565Error):
            rv565.frame_size("rgb332", 1, 1)

    def test_version(self):
        self.assertEqual(rv565.__version__, "3.0.0")


def expected_rgb(item, frame):
    """Packed RGB888 of a frame, from the reference package."""
    return REFERENCE.to_rgb888(bytes(frame), item["width"], item["height"],
                               item["pixel_format"])


class V7PlayerTest(unittest.TestCase):
    def setUp(self):
        self.displayio = fakes.install()

    def tearDown(self):
        fakes.uninstall()

    def shown_rgb(self, player):
        """What each bitmap pixel looks like through the shader, as RGB888."""
        out = bytearray()
        conv = player.converter
        for value in player.bitmap.values:
            if isinstance(conv, fakes.Palette):
                c = conv[value]
                out += bytes(((c >> 16) & 255, (c >> 8) & 255, c & 255))
            else:
                out += REFERENCE.rgb565be_to_rgb888(struct.pack(">H", conv.rgb565(value)))
        return bytes(out)

    def check_formats(self):
        for name, colorspace in (
                ("rgb565be_zlib_k4.rv565", "RGB565_SWAPPED"),
                ("rgb565le_stored_k3.rv565", "RGB565"),
                ("rgb565le_zlib_k4.rv565", "RGB565"),
                ("gray8_zlib_k4.rv565", None),
                ("gray4_stored_k3.rv565", None),
                ("mono_zlib_k4.rv565", None),
                ("mono_stored_forced_delta_k8.rv565", None),
                ("rgb565be_zlib_partial_k5.rv565", "RGB565_SWAPPED"),
                ("rgb565le_stored_partial_k5.rv565", "RGB565"),
                ("gray8_stored_partial_k5.rv565", None),
                ("gray4_zlib_partial_k5.rv565", None),
                ("mono_zlib_partial_k5.rv565", None),
                ("rgb565be_zlib_shift_k10.rv565", "RGB565_SWAPPED"),
                ("rgb565le_stored_shift_k10.rv565", "RGB565"),
                ("gray4_zlib_shift_k10.rv565", None),
                ("mono_zlib_shift_k10.rv565", None)):
            with self.subTest(name):
                item = entry(name)
                player = rv565.Player(rv565.open(vector(name)), fakes.Display())
                if colorspace is None:
                    self.assertIsInstance(player.converter, fakes.Palette)
                else:
                    self.assertEqual(player.converter.input_colorspace, colorspace)
                for i in range(item["frames"]):
                    player.show(i)
                    frame = player.clip.frame(i)
                    self.assertEqual(self.shown_rgb(player), expected_rgb(item, frame),
                                     "frame %d" % i)

    def test_formats_through_readinto(self):
        self.check_formats()

    def test_formats_without_readinto(self):
        fakes.install(with_readinto=False)
        self.check_formats()

    def test_repeat_frames_cost_nothing(self):
        display = fakes.Display()
        clock = fakes.FakeClock()
        clip = rv565.open(vector("rgb565be_zlib_k4.rv565"))  # frame 5 repeats 4
        player = rv565.Player(clip, display, clock=clock, sleep=clock.sleep)
        decoded = []
        real_frame = clip.frame

        def counting_frame(i):
            decoded.append(i)
            return real_frame(i)

        clip.frame = counting_frame
        stats = player.play()
        self.assertEqual((stats.shown, stats.repeated, stats.skipped), (10, 1, 0))
        self.assertEqual(display.refreshes, 9)
        self.assertNotIn(5, decoded)
        self.assertIn("1 repeats", repr(stats))
        # Frame 6 is a delta on frame 5 = frame 4, and still decodes right.
        item = entry("rgb565be_zlib_k4.rv565")
        self.assertEqual(self.shown_rgb(player),
                         expected_rgb(item, clip.frame(9)))

    def test_skipping_through_deltas(self):
        clock = fakes.FakeClock()
        name = "rgb565be_zlib_forced_delta_k8.rv565"
        item = entry(name)
        clip = rv565.open(vector(name))
        player = rv565.Player(clip, None, clock=clock, sleep=clock.sleep)
        real_show = player.show

        def slow_show(i):
            clock.now += 0.25  # 4 FPS on a 12 FPS clip: two of three skipped
            result = real_show(i)
            self.assertEqual(self.shown_rgb(player), expected_rgb(item, clip.frame(i)))
            return result

        player.show = slow_show
        stats = player.play()
        self.assertGreater(stats.skipped, 0)
        self.assertEqual(stats.shown + stats.skipped, 10)

    def test_unsupported_format(self):
        for name in ("rgb444_zlib_k4.rv565", "rgb666_zlib_k4.rv565",
                     "rgb888_zlib_k4.rv565", "mono_vpage_zlib_k4.rv565"):
            with self.subTest(name):
                with self.assertRaisesRegex(rv565.RV565Error,
                                            "rgb565be, rgb565le, gray8, gray4, mono"):
                    rv565.Player(rv565.open(vector(name)))


class V7DirectPlayerTest(unittest.TestCase):
    def play(self, name):
        bus = fakes.FourWire()
        clock = fakes.FakeClock()
        clip = rv565.open(vector(name))
        player = rv565.DirectPlayer(clip, bus, 320, 240, clock=clock, sleep=clock.sleep)
        stats = player.play()
        return clip, bus, stats

    def test_rgb565be_deltas_and_repeats(self):
        name = "rgb565be_zlib_k4.rv565"
        item = entry(name)
        clip, bus, stats = self.play(name)
        self.assertEqual(stats.repeated, 1)
        frames = [data for cmd, data in bus.sent if cmd == 0x2C]
        expected = [h for i, h in enumerate(item["frame_sha256"]) if i != 5]
        self.assertEqual([sha(f) for f in frames], expected)
        self.assertEqual(bus.sent[0], (0x36, b"\x60"))
        self.assertEqual(bus.sent[-1], (0x36, b"\xc0"))
        self.assertNotIn(0x3A, [c for c, _ in bus.sent])

    def test_rgb666_switches_colmod(self):
        name = "rgb666_stored_k3.rv565"
        item = entry(name)
        clip, bus, stats = self.play(name)
        self.assertEqual(bus.sent[:2], [(0x36, b"\x60"), (0x3A, b"\x66")])
        self.assertEqual(bus.sent[-2:], [(0x36, b"\xc0"), (0x3A, b"\x55")])
        frames = [data for cmd, data in bus.sent if cmd == 0x2C]
        shown = [h for i, h in enumerate(item["frame_sha256"])
                 if item["frame_types"][i] != "repeat"]
        self.assertEqual([sha(f) for f in frames], shown)
        self.assertEqual(len(frames[0]), 3 * 21 * 13)

    def test_unsupported_format(self):
        with self.assertRaisesRegex(rv565.RV565Error, "rgb565be and rgb666"):
            rv565.DirectPlayer(rv565.open(vector("gray8_zlib_k4.rv565")),
                               fakes.FourWire(), 320, 240)


# -- partial deltas on a clip with a small moving square -------------------

W, H = 40, 32


def square_frames(fmt, count=12):
    """A 4x4 white square moving over grey; frames 3 and 4 are equal."""
    frames = []
    for n in range(count):
        k = min(n, 3) if n < 5 else n - 1
        rgb = bytearray(b"\x40\x40\x40" * (W * H))
        for y in range(2 + 2 * k, 6 + 2 * k):
            for x in range(3 * k, 3 * k + 4):
                p = 3 * (y * W + x)
                rgb[p:p + 3] = b"\xff\xff\xff"
        frames.append(REFERENCE.convert(bytes(rgb), W, H, fmt))
    return frames


def square_clip(fmt="rgb565be", codec="zlib", version=7):
    """The square clip as version 7 (partial deltas) or, with version=None,
    as the encoder's default (version 8, region deltas)."""
    frames = square_frames(fmt)
    out = io.BytesIO()
    REFERENCE.write(out, W, H, 12, frames, pixel_format=fmt, codec=codec,
                    keyframe_interval=30, band_lines=4, version=version)
    return out.getvalue(), frames


class FakePanel:
    """Interprets CASET/RASET/RAMWR from a fake bus into a panel's memory."""

    def __init__(self, width, height, bpp):
        self.width, self.bpp = width, bpp
        self.ram = bytearray(width * height * bpp)
        self.window = None

    def run(self, sent):
        cols = rows = None
        for cmd, data in sent:
            if cmd == 0x2A:
                cols = struct.unpack(">HH", data)
            elif cmd == 0x2B:
                rows = struct.unpack(">HH", data)
            elif cmd == 0x2C:
                x0, x1 = cols
                y0, y1 = rows
                w = x1 - x0 + 1
                assert len(data) == w * (y1 - y0 + 1) * self.bpp
                for y in range(y0, y1 + 1):
                    o = (y - y0) * w * self.bpp
                    p = (y * self.width + x0) * self.bpp
                    self.ram[p:p + w * self.bpp] = data[o:o + w * self.bpp]

    def region(self, x0, y0, w, h):
        out = bytearray()
        for y in range(y0, y0 + h):
            p = (y * self.width + x0) * self.bpp
            out += self.ram[p:p + w * self.bpp]
        return bytes(out)


class PartialTest(unittest.TestCase):
    def setUp(self):
        fakes.install()

    def tearDown(self):
        fakes.uninstall()

    def test_clip_has_small_partials(self):
        data, frames = square_clip()
        clip = rv565.open(data)
        types = [clip.frame_type(i) for i in range(len(clip))]
        self.assertEqual(types[0], "key")
        self.assertIn("partial", types)
        self.assertIn("repeat", types)
        for i, t in enumerate(types):
            if t == "partial":
                rows = sum(c for _, c in clip.changed_lines(i))
                self.assertLessEqual(rows, 12, "frame %d" % i)
        self.assertEqual([bytes(f) for f in clip], frames)

    def test_dirty_lines_union_and_seeks(self):
        data, frames = square_clip()
        clip = rv565.open(data)
        n = len(clip)
        for since in [None] + list(range(n)):
            for i in range(n):
                runs = clip.dirty_lines(since, i)
                rows = set()
                for first, count in runs:
                    self.assertGreater(count, 0)
                    rows.update(range(first, first + count))
                stride = 2 * W
                differ = {y for y in range(H)
                          if since is None or
                          frames[since][y * stride:(y + 1) * stride]
                          != frames[i][y * stride:(y + 1) * stride]}
                self.assertTrue(differ <= rows, (since, i, runs))
                if since is not None and since <= i:
                    want = set()
                    for k in range(since + 1, i + 1):
                        for first, count in clip.changed_lines(k):
                            want.update(range(first, first + count))
                    self.assertEqual(rows, want)
        rng = random.Random(3)
        for i in [rng.randrange(n) for _ in range(40)]:
            self.assertEqual(bytes(clip.frame(i)), frames[i])

    def test_direct_player_sends_only_changed_rows(self):
        for codec in ("zlib", "stored"):
            with self.subTest(codec):
                data, frames = square_clip(codec=codec)
                clip = rv565.open(data)
                bus = fakes.FourWire()
                panel = FakePanel(320, 240, 2)
                player = rv565.DirectPlayer(clip, bus, 320, 240,
                                            clock=fakes.FakeClock(),
                                            sleep=lambda s: None)
                x0, y0 = (320 - W) // 2, (240 - H) // 2
                for i in range(len(clip)):
                    bus.sent.clear()
                    player.show(i)
                    panel.run(bus.sent)
                    self.assertEqual(panel.region(x0, y0, W, H), frames[i], i)
                    sent = sum(len(d) for c, d in bus.sent if c == 0x2C)
                    rows = sum(c for _, c in clip.changed_lines(i))
                    self.assertEqual(player.last_rows, rows)
                    self.assertEqual(sent, rows * 2 * W)
                    if clip.frame_type(i) == "partial":
                        self.assertLess(sent, 2 * W * H)

    def test_direct_player_on_vectors(self):
        for name in ("rgb565be_zlib_partial_k5.rv565", "rgb565be_stored_partial_k5.rv565",
                     "rgb565be_zlib_shift_k10.rv565", "rgb666_zlib_partial_k5.rv565"):
            with self.subTest(name):
                item = entry(name)
                clip = rv565.open(vector(name))
                bpp = 3 if item["pixel_format"] == "rgb666" else 2
                bus = fakes.FourWire()
                panel = FakePanel(320, 240, bpp)
                player = rv565.DirectPlayer(clip, bus, 320, 240,
                                            clock=fakes.FakeClock(),
                                            sleep=lambda s: None)
                x0, y0 = (320 - clip.width) // 2, (240 - clip.height) // 2
                for i in range(len(clip)):
                    bus.sent.clear()
                    player.show(i)
                    panel.run(bus.sent)
                    self.assertEqual(sha(panel.region(x0, y0, clip.width, clip.height)),
                                     item["frame_sha256"][i], i)
                    rows = sum(c for _, c in item["changed_lines"][i])
                    sent = sum(len(d) for c, d in bus.sent if c == 0x2C)
                    self.assertEqual(sent, rows * clip.line_bytes)

    def test_direct_player_play_counts_rows(self):
        data, frames = square_clip()
        clip = rv565.open(data)
        clock = fakes.FakeClock()
        player = rv565.DirectPlayer(clip, fakes.FourWire(), 320, 240, clock=clock,
                                    sleep=clock.sleep)
        stats = player.play()
        want = sum(c for i in range(len(clip)) for _, c in clip.changed_lines(i))
        self.assertEqual(stats.rows_updated, want)
        self.assertLess(stats.rows_updated, H * len(clip))
        self.assertIn("rows updated", repr(stats))

    def check_player_dirty_area(self):
        for fmt in ("rgb565be", "gray4", "mono"):
            with self.subTest(fmt):
                data, frames = square_clip(fmt)
                clip = rv565.open(data)
                player = rv565.Player(clip, fakes.Display())
                for i in range(len(clip)):
                    player.bitmap.dirty_rows.clear()
                    want = clip.dirty_lines(player._shown_content, i)
                    player.show(i)
                    rows = set()
                    for first, count in want:
                        rows.update(range(first, first + count))
                    self.assertEqual(player.bitmap.dirty_rows, rows, i)
                    self.assertEqual(player.last_rows, len(rows))
                    item = {"width": W, "height": H, "pixel_format": fmt}
                    self.assertEqual(V7PlayerTest.shown_rgb(self, player),
                                     expected_rgb(item, frames[i]), i)

    def test_player_updates_only_changed_rows(self):
        self.check_player_dirty_area()

    def test_player_without_blit(self):
        fakes.install(with_blit=False)
        self.check_player_dirty_area()

    def test_player_without_readinto(self):
        fakes.install(with_readinto=False, with_blit=False)
        self.check_player_dirty_area()

    def test_player_skipping_partials(self):
        data, frames = square_clip()
        clip = rv565.open(data)
        clock = fakes.FakeClock()
        player = rv565.Player(clip, None, clock=clock, sleep=clock.sleep)
        real_show = player.show
        item = {"width": W, "height": H, "pixel_format": "rgb565be"}

        def slow_show(i):
            clock.now += 0.2  # 5 FPS on a 12 FPS clip
            result = real_show(i)
            self.assertEqual(V7PlayerTest.shown_rgb(self, player),
                             expected_rgb(item, frames[i]), i)
            return result

        player.show = slow_show
        stats = player.play()
        self.assertGreater(stats.skipped, 0)
        self.assertLess(stats.rows_updated, H * stats.shown)


if __name__ == "__main__":
    unittest.main()
