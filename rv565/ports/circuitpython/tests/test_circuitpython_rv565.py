# SPDX-FileCopyrightText: 2026 Ayushman Bhattacharya
# SPDX-License-Identifier: MIT
"""Host tests for circuitpython_rv565, run with CPython and fake displayio.

    python3 -m unittest discover -s ports/circuitpython/tests -v
"""

import io
import struct
import sys
import unittest
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import circuitpython_rv565 as rv565  # noqa: E402
import fakes  # noqa: E402

VECTOR = HERE.parent.parent.parent / "tests" / "data" / "testpattern.rv565"


def reference_frames(data):
    """Every frame of an RV565 file, decoded with CPython's zlib directly."""
    count = struct.unpack_from("<H", data, 10)[0]
    frames, offset = [], 12
    for _ in range(count):
        (size,) = struct.unpack_from("<I", data, offset)
        offset += 4
        frames.append(zlib.decompress(data[offset:offset + size]))
        offset += size
    return frames


def build(width=4, height=2, fps=10, frames=None, version=6, magic=b"RV5",
          count=None, wbits=15):
    """An RV565 file from a list of raw frames."""
    if frames is None:
        frames = [bytes([i]) * (2 * width * height) for i in range(3)]
    out = bytearray(struct.pack("<3sBHHBBH", magic, version, width, height, fps,
                                0, len(frames) if count is None else count))
    for frame in frames:
        comp = zlib.compressobj(1, zlib.DEFLATED, wbits)
        payload = comp.compress(frame) + comp.flush()
        out += struct.pack("<I", len(payload)) + payload
    return bytes(out)


class ReaderTest(unittest.TestCase):
    def setUp(self):
        self.data = VECTOR.read_bytes()
        self.expected = reference_frames(self.data)

    def test_header(self):
        clip = rv565.open(self.data)
        self.assertEqual((clip.width, clip.height, clip.fps, len(clip)),
                         (180, 135, 24, 24))
        self.assertEqual(clip.frame_bytes, 2 * 180 * 135)
        self.assertEqual(clip.duration, 1.0)

    def test_all_frames_match_zlib_from_bytes(self):
        clip = rv565.open(self.data)
        self.assertEqual(len(self.expected), 24)
        for i, expected in enumerate(self.expected):
            self.assertEqual(bytes(clip.frame(i)), expected, "frame %d" % i)
        self.assertEqual(clip.verify(), 24)

    def test_all_frames_match_zlib_from_path(self):
        with rv565.open(str(VECTOR)) as clip:
            self.assertEqual([bytes(f) for f in clip], self.expected)

    def test_file_object_is_not_closed(self):
        stream = io.BytesIO(self.data)
        clip = rv565.open(stream)
        self.assertEqual(clip.frame(23), self.expected[23])
        clip.close()
        self.assertFalse(stream.closed)

    def test_index_is_lazy(self):
        clip = rv565.open(self.data)
        self.assertFalse(clip.indexed)
        self.assertEqual(len(clip), 24)
        self.assertFalse(clip.indexed)
        clip.frame(5)
        self.assertTrue(clip.indexed)

    def test_payload_sizes(self):
        clip = rv565.open(self.data)
        sizes = clip.payload_sizes()
        self.assertEqual(len(sizes), 24)
        self.assertEqual(sum(sizes) + 4 * 24 + 12, len(self.data))
        self.assertEqual(len(clip.payload(3)), sizes[3])

    def test_random_access(self):
        clip = rv565.open(self.data)
        for i in (23, 0, 11, 11, 1):
            self.assertEqual(clip.frame(i), self.expected[i])

    def test_out_of_range(self):
        clip = rv565.open(self.data)
        with self.assertRaises(IndexError):
            clip.frame(24)
        with self.assertRaises(IndexError):
            clip.frame(-1)

    def test_smaller_zlib_window_is_accepted(self):
        frames = [bytes(range(16))]
        clip = rv565.open(build(width=4, height=2, frames=frames, wbits=9))
        self.assertEqual(clip.frame(0), frames[0])

    def test_one_argument_decompress(self):
        calls = []

        def decompress(data):  # CircuitPython builds without bufsize
            calls.append(len(data))
            return zlib.decompress(data)

        clip = rv565.open(self.data, decompress=decompress)
        self.assertEqual(clip.frame(2), self.expected[2])
        self.assertEqual(len(calls), 1)

    def test_falls_back_when_bufsize_is_rejected(self):
        def decompress(data, *args):
            if args:
                raise TypeError("function takes 1 positional arguments")
            return zlib.decompress(data)

        clip = rv565.open(self.data)
        clip._decompress = decompress
        clip._sized_inflate = True
        self.assertEqual(clip.frame(0), self.expected[0])
        self.assertFalse(clip._sized_inflate)
        self.assertEqual(clip.frame(1), self.expected[1])

    def test_missing_zlib_gives_a_clear_error(self):
        clip = rv565.open(self.data)
        clip._decompress = None
        with self.assertRaisesRegex(rv565.RV565Error, "no zlib module"):
            clip.frame(0)


class ValidationTest(unittest.TestCase):
    def assertRejected(self, data, message):
        with self.assertRaisesRegex(rv565.RV565Error, message):
            rv565.open(data).verify()

    def test_valid_builder(self):
        self.assertEqual(rv565.open(build()).verify(), 3)

    def test_too_short(self):
        self.assertRejected(b"RV5\x06", "too short")

    def test_magic(self):
        self.assertRejected(build(magic=b"RV4"), "not an RV565")

    def test_version(self):
        self.assertRejected(build(version=5), "version 5")

    def test_zero_size(self):
        self.assertRejected(build(width=0, frames=[b""]), "width or height")

    def test_fps_range(self):
        self.assertRejected(build(fps=0), "fps")
        self.assertRejected(build(fps=31), "fps")

    def test_no_frames(self):
        self.assertRejected(build(frames=[], count=0), "no frames")

    def test_zero_length(self):
        data = bytearray(build())
        struct.pack_into("<I", data, 12, 0)
        self.assertRejected(bytes(data), "invalid length for frame 0")

    def test_length_past_end(self):
        data = build()
        self.assertRejected(data[:-1], "invalid length for frame 2")

    def test_truncated_table(self):
        self.assertRejected(build(count=4), "truncated frame table at frame 3")

    def test_trailing_bytes(self):
        self.assertRejected(build() + b"\0", "trailing bytes")

    def test_wrong_decoded_size(self):
        data = build(width=4, height=2, frames=[bytes(15)])
        self.assertRejected(data, "inflates to 15 bytes, expected 16")

    def test_corrupt_payload(self):
        data = bytearray(build())
        data[16] ^= 0xFF  # first byte of frame 0's zlib header
        self.assertRejected(bytes(data), "frame 0 does not inflate")

    def test_path_is_closed_on_bad_header(self):
        opened = []
        real_open = rv565._builtin_open

        def tracking_open(path, mode):
            stream = io.BytesIO(b"nope, not a clip")
            opened.append(stream)
            return stream

        rv565._builtin_open = tracking_open
        try:
            with self.assertRaises(rv565.RV565Error):
                rv565.open("/clip.rv565")
        finally:
            rv565._builtin_open = real_open
        self.assertTrue(opened[0].closed)


class PlayerTest(unittest.TestCase):
    def setUp(self):
        self.displayio = fakes.install()
        self.data = VECTOR.read_bytes()
        self.expected = reference_frames(self.data)

    def tearDown(self):
        fakes.uninstall()

    def test_bitmap_setup(self):
        display = fakes.Display(320, 240)
        player = rv565.Player(rv565.open(self.data), display)
        self.assertEqual(player.bitmap.value_count, 65536)
        self.assertEqual((player.bitmap.width, player.bitmap.height), (180, 135))
        self.assertEqual(player.converter.input_colorspace,
                         self.displayio.Colorspace.RGB565_SWAPPED)
        self.assertIs(display.root_group, player.group)
        self.assertEqual((player.group.x, player.group.y), (70, 52))

    def test_scale_and_position(self):
        player = rv565.Player(rv565.open(self.data), fakes.Display(), scale=2, x=1)
        self.assertEqual((player.group.scale, player.group.x, player.group.y),
                         (2, 1, 0))

    def check_bitmap_matches(self, player, frame):
        """Every pixel, read back through the converter, equals the file's."""
        pixels = struct.unpack(">%dH" % (len(frame) // 2), frame)
        shown = [player.converter.rgb565(v) for v in player.bitmap.values]
        self.assertEqual(shown, list(pixels))

    def test_every_frame_through_readinto(self):
        player = rv565.Player(rv565.open(self.data), fakes.Display())
        for i in range(24):
            player.show(i)
            self.check_bitmap_matches(player, self.expected[i])

    def test_fallback_without_readinto(self):
        fakes.install(with_readinto=False)
        player = rv565.Player(rv565.open(self.data))
        self.assertIsNone(player._readinto)
        for i in (0, 13):
            player.show(i)
            self.check_bitmap_matches(player, self.expected[i])

    def test_refresh_once_per_frame_with_auto_refresh_off(self):
        display = fakes.Display()
        clock = fakes.FakeClock()
        player = rv565.Player(rv565.open(self.data), display, clock=clock,
                              sleep=clock.sleep)
        stats = player.play()
        self.assertEqual(stats.shown, 24)
        self.assertEqual(display.refreshes, 24)
        self.assertEqual(set(display.auto_refresh_seen), {False})
        self.assertTrue(display.auto_refresh)  # restored

    def test_auto_refresh_restored_after_error(self):
        display = fakes.Display()
        player = rv565.Player(rv565.open(self.data), display)

        def boom(i):
            raise RuntimeError("stop")

        player.show = boom
        with self.assertRaises(RuntimeError):
            player.play()
        self.assertTrue(display.auto_refresh)


class _CountingPlayer(rv565.Player):
    """A Player whose frames cost a fixed amount of fake time."""

    def __init__(self, clip, clock, cost):
        super().__init__(clip, None, clock=clock, sleep=clock.sleep)
        self.fake_clock = clock
        self.cost = cost
        self.indices = []

    def show(self, i):
        self.indices.append(i)
        self.fake_clock.now += self.cost
        return self.cost, 0.0


class PacingTest(unittest.TestCase):
    def setUp(self):
        fakes.install()
        self.clip = rv565.open(VECTOR.read_bytes())  # 24 frames at 24 FPS

    def tearDown(self):
        fakes.uninstall()

    def test_fast_decode_plays_every_frame_at_rate(self):
        clock = fakes.FakeClock()
        player = _CountingPlayer(self.clip, clock, cost=0.01)
        stats = player.play()
        self.assertEqual(player.indices, list(range(24)))
        self.assertEqual(stats.skipped, 0)
        self.assertAlmostEqual(stats.elapsed, 1.0, places=6)
        self.assertAlmostEqual(stats.fps, 24.0, places=4)
        self.assertTrue(all(s > 0 for s in clock.sleeps))

    def test_slow_decode_skips_to_keep_time(self):
        clock = fakes.FakeClock()
        player = _CountingPlayer(self.clip, clock, cost=0.25)  # 4 FPS
        stats = player.play()
        self.assertEqual(player.indices, [0, 6, 12, 18])
        self.assertEqual(stats.shown, 4)
        self.assertEqual(stats.shown + stats.skipped, 24)
        self.assertAlmostEqual(stats.fps, 4.0, places=4)
        self.assertEqual(clock.sleeps, [])
        self.assertIn("4.00 of 24 FPS", repr(stats))

    def test_loops_wrap_around(self):
        clock = fakes.FakeClock()
        player = _CountingPlayer(self.clip, clock, cost=0.001)
        stats = player.play(loops=2, start=20)
        self.assertEqual(player.indices[:6], [20, 21, 22, 23, 0, 1])
        self.assertEqual(stats.shown, 28)

    def test_on_frame_can_stop_an_endless_loop(self):
        clock = fakes.FakeClock()
        player = _CountingPlayer(self.clip, clock, cost=0.001)
        stats = player.play(loops=0, on_frame=lambda i, s: s.shown < 50)
        self.assertEqual(stats.shown, 50)


    def test_start_must_be_a_frame(self):
        clock = fakes.FakeClock()
        player = _CountingPlayer(self.clip, clock, cost=0.001)
        for start in (24, 100, -1):
            with self.assertRaises(IndexError):
                player.play(start=start)
        self.assertEqual(player.indices, [])
        stats = player.play(start=23)
        self.assertEqual(player.indices, [23])
        self.assertEqual(stats.shown, 1)

    def test_rebase_keeps_clock_small_on_endless_play(self):
        clock = _RebasingClock()
        player = _CountingPlayer(self.clip, clock, cost=0.01)
        stats = player.play(loops=0, on_frame=lambda i, s: s.shown < 24 * 10)
        self.assertEqual(stats.shown, 240)
        self.assertEqual(stats.skipped, 0)
        self.assertEqual(player.indices, list(range(24)) * 10)
        # Ten loops of a one-second clip, but the clock never reads past
        # about one clip's length because play() moves its origin.
        self.assertEqual(clock.rebased, [24] * 9)
        self.assertLess(max(clock.readings), 1.1)
        self.assertAlmostEqual(stats.elapsed, 10.0 - 1 / 24 + 0.01, places=6)

    def test_rebase_with_skipping_and_finite_loops(self):
        clock = _RebasingClock()
        player = _CountingPlayer(self.clip, clock, cost=0.25)  # 4 FPS
        stats = player.play(loops=3, start=5)
        self.assertEqual(stats.shown + stats.skipped, 3 * 24 - 5)
        self.assertEqual(player.indices[:4], [5, 11, 17, 23])
        self.assertLess(max(clock.readings), 1.3)
        self.assertAlmostEqual(stats.elapsed, stats.shown * 0.25, places=6)


class _RebasingClock(fakes.FakeClock):
    """A fake clock with _Clock's rebase(): records each origin shift."""

    def __init__(self):
        super().__init__()
        self.rebased = []
        self.readings = []

    def __call__(self):
        self.readings.append(self.now)
        return self.now

    def rebase(self, frames, fps):
        self.rebased.append(frames)
        self.now -= frames / fps


class ClockTest(unittest.TestCase):
    def test_rebase_moves_origin_in_whole_nanoseconds(self):
        clock = rv565._Clock()
        if rv565._monotonic_ns is not None:
            t0 = clock._t0
            clock.rebase(25, 24)
            self.assertIsInstance(clock._t0, int)
            self.assertEqual(clock._t0 - t0, 25 * 10**9 // 24)
        self.assertLess(clock(), 0)  # origin is now in the future

    def test_default_clock_counts_from_reset(self):
        clock = rv565._Clock()
        first = clock()
        self.assertGreaterEqual(first, 0.0)
        self.assertLess(first, 1.0)
        clock.reset()
        self.assertLess(clock(), 1.0)

    def test_real_play_uses_real_clock(self):
        fakes.install()
        try:
            player = rv565.Player(rv565.open(build(fps=30)))
            stats = player.play()
        finally:
            fakes.uninstall()
        self.assertEqual(stats.shown + stats.skipped, 3)
        self.assertGreater(stats.elapsed, 0.05)  # three frames at 30 FPS


class DirectPlayerTest(unittest.TestCase):
    def setUp(self):
        self.data = VECTOR.read_bytes()
        self.expected = reference_frames(self.data)

    def test_window_and_pixels(self):
        bus = fakes.FourWire()
        display = fakes.Display()
        clock = fakes.FakeClock()
        player = rv565.DirectPlayer(rv565.open(self.data), bus, 320, 240,
                                    display=display, clock=clock,
                                    sleep=clock.sleep)
        stats = player.play()
        self.assertEqual(stats.shown, 24)
        self.assertIsNone(display.root_group)
        self.assertFalse(display.auto_refresh)
        self.assertEqual(len(bus.sent), 3 * 24 + 2)
        # displayio rotates in software, so the controller is put in
        # landscape (MV) before streaming and back to adafruit_st7789's
        # portrait MADCTL afterwards.
        self.assertEqual(bus.sent[0], (0x36, b"\x60"))
        self.assertEqual(bus.sent[-1], (0x36, b"\xc0"))
        caset, raset, ramwr = bus.sent[1:4]
        self.assertEqual(caset, (0x2A, struct.pack(">HH", 70, 249)))
        self.assertEqual(raset, (0x2B, struct.pack(">HH", 52, 186)))
        self.assertEqual(ramwr, (0x2C, self.expected[0]))
        self.assertEqual(bus.sent[-2], (0x2C, self.expected[23]))

    def test_portrait_panel_sends_no_madctl(self):
        bus = fakes.FourWire()
        player = rv565.DirectPlayer(rv565.open(self.data), bus, 240, 320,
                                    clock=fakes.FakeClock(),
                                    sleep=lambda s: None)
        player.play(loops=1, on_frame=lambda i, s: False)
        self.assertEqual([c for c, _ in bus.sent], [0x2A, 0x2B, 0x2C])

    def test_custom_madctl_and_no_restore(self):
        bus = fakes.FourWire()
        player = rv565.DirectPlayer(rv565.open(self.data), bus, 320, 240,
                                    madctl=0xA0, restore_madctl=None,
                                    clock=fakes.FakeClock(),
                                    sleep=lambda s: None)
        player.play(on_frame=lambda i, s: False)
        self.assertEqual(bus.sent[0], (0x36, b"\xa0"))
        self.assertEqual(bus.sent[-1][0], 0x2C)

    def test_madctl_restored_after_error(self):
        bus = fakes.FourWire()
        player = rv565.DirectPlayer(rv565.open(self.data), bus, 320, 240)

        def boom(i):
            raise RuntimeError("stop")

        player.show = boom
        with self.assertRaises(RuntimeError):
            player.play()
        self.assertEqual(bus.sent, [(0x36, b"\x60"), (0x36, b"\xc0")])

    def test_offsets(self):
        bus = fakes.FourWire()
        player = rv565.DirectPlayer(rv565.open(self.data), bus, 240, 135,
                                    x_offset=40, y_offset=53)
        player.show(0)
        self.assertEqual(bus.sent[0], (0x2A, struct.pack(">HH", 70, 249)))
        self.assertEqual(bus.sent[1], (0x2B, struct.pack(">HH", 53, 187)))

    def test_clip_larger_than_panel(self):
        with self.assertRaisesRegex(rv565.RV565Error, "larger than"):
            rv565.DirectPlayer(rv565.open(self.data), fakes.FourWire(), 135, 240)


if __name__ == "__main__":
    unittest.main()
