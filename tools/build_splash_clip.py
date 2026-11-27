# SPDX-License-Identifier: MIT
"""Render the boot splash's greeting band into oreoOS/splash.rv565.

The native splash player in the firmware (firmware/usermods/oreo_rv565,
`_oreo_rv565.splash_start`) plays the "hello" roll as an RV565 version 7
clip on the core MicroPython does not run on, so it stays smooth while boot
imports modules and starts the radios. This tool makes that clip from
oreoOS/splash.bin (tools/build_splash.py) by running oreoOS/splash.py's own
band renderer (its pure-Python framebuf twin) for every frame, so each
frame is exactly what the Python splash draws for that moment:

    python3 tools/build_splash_clip.py            # writes oreoOS/splash.rv565
    python3 tools/build_splash_clip.py --check    # rebuild in memory and
                                                  # compare decoded frames

The clip is the greeting band only (320 x band_h rows, placed at band_y on
the panel): CLIP_WORD_FRAMES frames per greeting at CLIP_FPS, one full
cycle of the greetings, looping. Frame i shows the Python splash at
splash.clip_time(i). The encoding is RV565 version 7, rgb565be (the
panel's byte order), zlib, one keyframe (frame 0) and otherwise repeats
(the word at rest) and partial deltas (only the bands of rows the rolling
words change), lossless.

Needs the rv565 package (2.0.0): `pip install rv565==2.0.0`, or put the
rv565 checkout's python/src on PYTHONPATH.
"""

import argparse
import importlib.util
import io
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BIN = ROOT / "oreoOS" / "splash.bin"
OUT = ROOT / "oreoOS" / "splash.rv565"

BAND_LINES = 4          # partial-delta band height: the rows sent follow
                        # the words' ink closely (8 and 16 send 8% and 23%
                        # more rows for a clip within 1% of the size)
MOTION_RANGE = 0        # the photo behind the words does not move with them,
                        # so shifted predictions do not pay here (a range of
                        # 8 pixels gives a clip no smaller, and costs the
                        # player a shifted prediction per band)
LEVEL = 9               # zlib level: 11% smaller than level 1; inflate cost
                        # follows the output size, not the level


def _load(relative, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def load_splash():
    """oreoOS/splash.py behind a stub oreoOS package (api and theme only),
    with framebuf unavailable so it draws through its Python twin."""
    saved = {k: sys.modules.get(k) for k in
             ("oreoOS", "oreoOS.api", "oreoOS.theme", "oreoOS.splash_clip_src")}
    try:
        pkg = types.ModuleType("oreoOS")
        pkg.__path__ = [str(ROOT / "oreoOS")]
        sys.modules["oreoOS"] = pkg
        pkg.api = _load("oreoOS/api.py", "oreoOS.api")
        pkg.theme = _load("oreoOS/theme.py", "oreoOS.theme")
        sp = _load("oreoOS/splash.py", "oreoOS.splash_clip_src")
    finally:
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
    sp.framebuf = None
    sp.time = types.SimpleNamespace(ticks_ms=lambda: 0, ticks_diff=lambda a, b: a - b,
                                    sleep_ms=lambda ms: None)
    return sp


class _Display:
    def __init__(self, sp):
        self._buf = bytearray(sp.SW * sp.SH * 2)
        self._dirty = False

    def present(self):
        pass

    def present_rect(self, x, y, w, h):
        pass


def band_frames(sp, bin_path=BIN):
    """Yield the clip's frames (band rows, big-endian RGB565) in order, as
    splash.py draws them: (word, next word, roll offset) at clip_time(i)."""
    import types as _t
    d = _Display(sp)
    sp.BIN_PATH = str(bin_path)
    s = sp.Splash(_t.SimpleNamespace(display=d))
    a = s._art
    if a is None:
        raise SystemExit("cannot read %s" % bin_path)
    try:
        d._buf[:] = s._bg
        cache = {}
        for i in range(sp.CLIP_WORD_FRAMES * a.count):
            k, n, off = sp.roll_state(sp.clip_time(i), a.count, a.band_h)
            if off == a.band_h:             # the next word at rest
                k, n, off = n, (n + 1) % a.count, 0
            key = (k, off) if off else (k,)
            frame = cache.get(key)
            if frame is None:
                s._ensure(k, n)
                s._draw_band(k, n, off)
                frame = bytes(d._buf[s._band0:s._band1])
                cache[key] = frame
            yield frame
    finally:
        s.release()


def clip_geometry(sp, bin_path=BIN):
    sp.BIN_PATH = str(bin_path)
    a = sp._Art(str(bin_path))
    try:
        return a.band_y, a.band_h, a.count
    finally:
        a.close()


def encode(sp, bin_path=BIN, band_lines=BAND_LINES, motion_range=MOTION_RANGE):
    import rv565
    _, band_h, count = clip_geometry(sp, bin_path)
    frames = list(band_frames(sp, bin_path))
    out = io.BytesIO()
    # One keyframe per loop: the player plays in order and loops to frame 0,
    # so it never seeks.
    rv565.write(out, sp.SW, band_h, sp.CLIP_FPS, frames, LEVEL,
                keyframe_interval=min(255, len(frames)),
                band_lines=band_lines, motion_range=motion_range)
    return out.getvalue(), frames


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, default=OUT)
    p.add_argument("--bin", type=Path, default=BIN)
    p.add_argument("--band-lines", type=int, default=BAND_LINES)
    p.add_argument("--motion-range", type=int, default=MOTION_RANGE)
    p.add_argument("--check", action="store_true",
                   help="compare the committed clip's frames with a fresh render")
    args = p.parse_args()
    import rv565
    sp = load_splash()
    if args.check:
        clip = rv565.Clip(args.out.read_bytes())
        frames = list(band_frames(sp, args.bin))
        bad = [i for i in range(len(frames)) if clip.frame(i) != frames[i]] \
            if len(clip) == len(frames) else ["count"]
        if bad:
            raise SystemExit("%s is stale (frames %s): rerun tools/build_splash_clip.py"
                             % (args.out, bad[:8]))
        print("%s matches splash.bin and splash.py" % args.out)
        return
    data, frames = encode(sp, args.bin, args.band_lines, args.motion_range)
    clip = rv565.Clip(data)
    for i, f in enumerate(frames):
        if clip.frame(i) != f:
            raise SystemExit("round trip failed at frame %d" % i)
    types_ = [clip.frame_type(i) for i in range(len(clip))]
    rows = sum(sum(r[1] for r in clip.changed_lines(i)) for i in range(len(clip)))
    args.out.write_bytes(data)
    print("wrote %s: %d frames at %d FPS, %dx%d, %.1f KB; types %s; %d rows sent per loop"
          % (args.out, len(clip), sp.CLIP_FPS, sp.SW, len(frames[0]) // (2 * sp.SW),
             len(data) / 1024, {t: types_.count(t) for t in sorted(set(types_))}, rows))


if __name__ == "__main__":
    main()
