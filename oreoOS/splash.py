"""Boot splash and the OTA "updating" screen, 320x240 landscape.

Boot splash: the dimmed photo backdrop with the logo top left, "hello"
rolling through languages in the middle (each word in its own script,
anti-aliased, light on the dark photo), a small "FaleraOS" under it and a
loader along the bottom; it hands over to the OS with a chevron swipe
(swipe_in). tools/build_splash.py renders it all into
oreoOS/splash.bin: the static frame, plus one 16-level coverage mask per
greeting. Each frame restores the greeting band from the static frame and
draws two masks with framebuf's palette blit, then flushes only the band
(and the loader when it moves).

Native player. On firmware whose _oreo_rv565 module has splash_start
(firmware/usermods/oreo_rv565/oreo_splash.c), intro() draws the first frame
here, copies oreoOS/splash.rv565 (tools/build_splash_clip.py: the greeting
band, every frame exactly as this module draws it, as an RV565 version 7
clip at CLIP_FPS) into the player and hands it the band and the loader. The
player is a FreeRTOS task on core 0, away from MicroPython (core 1) and its
interpreter lock, so the roll stays smooth whatever boot does. It shares
machine.SPI(1)'s bus as a second SPI device, drives the same CS/DC pins, and
never resets the panel; between intro() and finish() nothing in Python
draws. progress() and finish() pass the loader's target and finish time
on; finish() stops the player on a word at rest, and splash_stop() copies
the frame on the panel into the framebuffer's band (and the loader width
it drew is redrawn here), so the swipe starts from exactly what is shown.
oreoWare.display.Display() and oreoOS.hostui stop a player left running
(a crash or a soft reset during boot), and it stops itself after
MAX_TOTAL_MS + LIFE_MARGIN_MS.

Fallback. OTA replaces OS files, never the firmware, so on older firmware
(or without the clip, or if the player fails to start) the animation runs
on a Python thread as before. It keeps moving while boot imports modules
and starts the radios, but shares the interpreter lock with them, so it can
stutter. Boot code never has to call into either.

    sp = Splash(os_obj)
    sp.intro()          # first frame, starts the native player or the thread
    sp.progress(0.5)    # optional: the loader's target as boot advances
    sp.finish()         # minimum show time, fills the loader, word boundary
    sp.finish(settled)  # also wait (up to MAX_TOTAL_MS) for settled() -> True

Without _thread (or without splash.bin) it degrades to pump() calls or a
static frame. Splash must never break boot: every method swallows errors.
"""

import struct
import time
from oreoOS import api
from oreoOS import theme

try:
    import framebuf
except ImportError:          # host tests
    framebuf = None

SW = api.SCREEN_W
SH = api.SCREEN_H

BIN_PATH     = "oreoOS/splash.bin"

HOLD_MS      = 150          # a word rests in place
ROLL_MS      = 183          # the roll to the next word: 3 words a second
CYCLE_MS     = HOLD_MS + ROLL_MS
FRAME_MS     = 12           # animation thread tick
MIN_TOTAL_MS = 4000         # finish() never returns earlier than this
MAX_TOTAL_MS = 6000         # ...nor later, while it waits for boot to settle
FILL_MS      = 300          # finish() runs the loader to full over this

# Swipe into the OS: big chevrons (tip pointing left) in the light
# wallpaper's colours sweep right to left over the final splash frame,
# revealing the OS's first frame behind them.
SWIPE_MS     = 520
SWIPE_T      = 30           # chevron thickness, px
SWIPE_GAP    = 12           # gap between chevrons (shows the OS)
SWIPE_SLOPE  = 70           # 1/100 px of depth per row from the centre
SWIPE_COLS   = ((250, 186, 194), (166, 226, 208), (253, 212, 140))

# The native player's clip (tools/build_splash_clip.py): the greeting band
# at CLIP_FPS, CLIP_WORD_FRAMES frames per greeting (13 at 39 FPS is one
# CYCLE_MS, three words a second, at about the panel's ~39 Hz refresh).
CLIP_PATH        = "oreoOS/splash.rv565"
CLIP_FPS         = 39
CLIP_WORD_FRAMES = 13


NATIVE           = True      # use the firmware's player when it has one
LIFE_MARGIN_MS   = 6000      # it stops itself this long after MAX_TOTAL_MS
STOP_TIMEOUT_MS  = 1000      # finish() waits this long for a word at rest
CLIP_CHUNK       = 8192      # bytes per splash_load() while copying the clip


def clip_time(i):
    """The splash time (ms) clip frame i shows."""
    j = i % CLIP_WORD_FRAMES
    return (i // CLIP_WORD_FRAMES) * CYCLE_MS + j * CYCLE_MS // CLIP_WORD_FRAMES


def native_player():
    """The firmware's splash player (_oreo_rv565 with splash_start), or
    None. OTA updates the OS but never the firmware, so an OS with this file
    still meets firmware without the player, and then animates in Python."""
    if not NATIVE:
        return None
    try:
        import _oreo_rv565 as m
    except Exception:
        return None
    for name in ("splash_load", "splash_start", "splash_progress", "splash_stop"):
        if not hasattr(m, name):
            return None
    return m


def load_clip(m, path):
    """Copy the clip into the player's own memory, a chunk at a time (no
    clip-sized buffer on the Python heap). Returns its size."""
    f = open(path, "rb")
    try:
        f.seek(0, 2)
        total = f.tell()
        f.seek(0)
        buf = bytearray(min(CLIP_CHUNK, total) or 1)
        mv = memoryview(buf)
        off = 0
        while off < total:
            n = f.readinto(buf)
            if not n:
                raise ValueError("short splash clip")
            m.splash_load(mv[:n], off, total)
            off += n
    finally:
        f.close()
    return total


def clip_rest_frames(count, band_h):
    """How many leading frames of each greeting show the word at rest."""
    j = 0
    while j < CLIP_WORD_FRAMES and roll_state(clip_time(j), count, band_h)[2] == 0:
        j += 1
    return j


def _rgb565(c):
    return ((c[0] & 0xF8) << 8) | ((c[1] & 0xFC) << 3) | (c[2] >> 3)


def swipe_span():
    """Total width of the chevron stack."""
    n = len(SWIPE_COLS)
    return n * SWIPE_T + (n - 1) * SWIPE_GAP


def swipe_edge(t_ms):
    """x of the leading chevron tip at t_ms: from just off the right edge to
    fully off the left edge, eased."""
    depth = (SH // 2) * SWIPE_SLOPE // 100
    x0 = SW
    x1 = -(swipe_span() + depth)
    return int(x0 + (x1 - x0) * ease(t_ms / SWIPE_MS))


def compose_swipe(dst, splash, home, edge, fill_row):
    """One swipe frame into dst (big-endian RGB565 rows). Per row: splash
    left of the leading chevron, then the chevron bands (fill_row(x, y, w,
    colour_index)) with the OS showing in the gaps and behind them."""
    stride = SW * 2
    t, g = SWIPE_T, SWIPE_GAP
    n = len(SWIPE_COLS)
    half = SH // 2
    for y in range(SH):
        o = y * stride
        dy = y - half
        x = edge + (dy if dy >= 0 else -dy) * SWIPE_SLOPE // 100
        # splash, left of the chevrons
        a = 0 if x < 0 else (SW if x > SW else x)
        if a:
            dst[o:o + a * 2] = splash[o:o + a * 2]
        # bands and gaps, then the OS
        cur = a
        for i in range(n):
            b0 = x + i * (t + g)
            b1 = b0 + t
            c0 = 0 if b0 < 0 else (SW if b0 > SW else b0)
            c1 = 0 if b1 < 0 else (SW if b1 > SW else b1)
            if c0 > cur:
                dst[o + cur * 2:o + c0 * 2] = home[o + cur * 2:o + c0 * 2]
            if c1 > c0:
                fill_row(c0, y, c1 - c0, i)
            if c1 > cur:
                cur = c1
        if cur < SW:
            dst[o + cur * 2:o + stride] = home[o + cur * 2:o + stride]


SWIPE_STRIP  = 4            # rows per strip in the framebuf path


def compose_swipe_fb(fb, splash_mv, home_mv, edge, cols, fb_mod):
    """One swipe frame through framebuf (all copying in C): per 4-row strip,
    a blit of the splash left of the chevrons, a blit of the OS right of
    them (strided views, no copies), then the chevron bands as fill_rect.
    cols are framebuf pixel values (byte-swapped RGB565)."""
    FB = fb_mod.FrameBuffer
    fmt = fb_mod.RGB565
    t, g = SWIPE_T, SWIPE_GAP
    n = len(cols)
    half = SH // 2
    stride = SW * 2
    y0 = 0
    while y0 < SH:
        h = SWIPE_STRIP if y0 + SWIPE_STRIP <= SH else SH - y0
        dy = y0 + (h >> 1) - half
        x = edge + (dy if dy >= 0 else -dy) * SWIPE_SLOPE // 100
        a = 0 if x < 0 else (SW if x > SW else x)
        base = y0 * stride
        if a > 0:
            fb.blit(FB(splash_mv[base:], a, h, fmt, SW), 0, y0)
        if a < SW:
            fb.blit(FB(home_mv[base + a * 2:], SW - a, h, fmt, SW), a, y0)
        for i in range(n):
            b0 = x + i * (t + g)
            c0 = 0 if b0 < 0 else (SW if b0 > SW else b0)
            b1 = b0 + t
            c1 = 0 if b1 < 0 else (SW if b1 > SW else b1)
            if c1 > c0:
                fb.fill_rect(c0, y0, c1 - c0, h, cols[i])
        y0 += h


def swipe_in(os_obj):
    """Run the swipe if the splash left one pending. The launcher calls this
    with the OS's first frame drawn in the framebuffer but not yet shown;
    it ends with that frame in place for the normal present."""
    splash = getattr(os_obj, "_splash_frame", None)
    if splash is None:
        return
    os_obj._splash_frame = None
    d = os_obj.display
    home = None
    frames = 0
    try:
        try:
            import gc
            gc.collect()
        except Exception:
            pass
        home = bytearray(d._buf)
        buf = d._buf
        cols = [_rgb565(c) for c in SWIPE_COLS]
        if framebuf is not None:
            fb = framebuf.FrameBuffer(buf, SW, SH, framebuf.RGB565)
            sw = [((c & 0xFF) << 8) | (c >> 8) for c in cols]
            smv = memoryview(splash)
            hmv = memoryview(home)

            def draw(edge):
                compose_swipe_fb(fb, smv, hmv, edge, sw, framebuf)
        else:
            rows = [struct.pack(">H", c) for c in cols]

            def fill_row(x, y, w, i):
                o = (y * SW + x) * 2
                buf[o:o + w * 2] = rows[i] * w

            def draw(edge):
                compose_swipe(buf, splash, home, edge, fill_row)
        t0 = _ms()
        while True:
            t = _diff(_ms(), t0)
            if t >= SWIPE_MS:
                break
            draw(swipe_edge(t))
            d._dirty = True
            d.present()
            frames += 1
            time.sleep_ms(1)        # yield (and lets a test clock advance)
        buf[:] = home
        print("[splash] swipe: %d frames in %d ms" % (frames, _diff(_ms(), t0)))
    except Exception as e:
        print("[splash] swipe failed:", e)
        if home is not None:
            try:
                d._buf[:] = home
            except Exception:
                pass
    d._dirty = True


def _ms():
    return time.ticks_ms()


def _diff(a, b):
    return time.ticks_diff(a, b)


def ease(p):
    """Ease-in-out cubic, 0..1 -> 0..1."""
    if p <= 0.0:
        return 0.0
    if p >= 1.0:
        return 1.0
    if p < 0.5:
        return 4.0 * p * p * p
    q = -2.0 * p + 2.0
    return 1.0 - q * q * q / 2.0


def roll_state(t_ms, count, band_h):
    """(word, next_word, offset_px) at t_ms. offset 0 shows `word` at rest;
    during the roll it grows to band_h as `next_word` rises into place."""
    if count <= 0:
        return 0, 0, 0
    cycle = t_ms // CYCLE_MS
    phase = t_ms - cycle * CYCLE_MS
    k = cycle % count
    nxt = (k + 1) % count
    if phase < HOLD_MS:
        return k, nxt, 0
    p = ease((phase - HOLD_MS) / ROLL_MS)
    return k, nxt, min(band_h, int(p * band_h + 0.5))


def loader_frac(t_ms, target, done_ms=None):
    """Loader fill 0..1: follows the clock towards MIN_TOTAL_MS but never
    past the boot's reported progress `target`; after finish() starts
    (done_ms) it runs to full over FILL_MS."""
    f = t_ms / MIN_TOTAL_MS
    if f > target:
        f = target
    if done_ms is not None:
        g = f + (1.0 - f) * min(1.0, (t_ms - done_ms) / FILL_MS)
        f = g
    return 0.0 if f < 0.0 else (1.0 if f > 1.0 else f)


def blit_gs4(dst, dst_w, dst_h, src, w, h, x, y, pal, key):
    """Pure-Python twin of framebuf's GS4_HMSB palette blit with a key,
    used when framebuf is unavailable (host tests). dst is big-endian
    RGB565 rows; pal holds 16 big-endian entries; key is entry 0 read as
    framebuf reads it (little-endian), so it is never drawn."""
    row_b = (w + 1) >> 1
    for sy in range(h):
        dy = y + sy
        if dy < 0 or dy >= dst_h:
            continue
        for sx in range(w):
            dx = x + sx
            if dx < 0 or dx >= dst_w:
                continue
            b = src[sy * row_b + (sx >> 1)]
            v = (b >> 4) if (sx & 1) == 0 else (b & 15)
            if pal[2 * v] | (pal[2 * v + 1] << 8) == key:
                continue
            o = (dy * dst_w + dx) * 2
            dst[o] = pal[2 * v]
            dst[o + 1] = pal[2 * v + 1]


class _Art:
    """Reads oreoOS/splash.bin (OSP2). Greeting masks load on demand."""

    def __init__(self, path):
        f = open(path, "rb")
        self._f = f
        if f.read(4) != b"OSP2":
            raise ValueError("bad splash.bin")
        self.count, _ = struct.unpack("<BB", f.read(2))
        self.band_y, self.band_h = struct.unpack("<HH", f.read(4))
        (self.bar_x, self.bar_y, self.bar_w, self.bar_h,
         self.bar_track, self.bar_fill) = struct.unpack("<HHHHHH", f.read(12))
        self.key = struct.unpack("<H", f.read(2))[0]
        self.pal = bytearray(f.read(32))
        self.bg_pos = f.tell()
        pos = self.bg_pos + SW * SH * 2
        self.offsets = []
        self.widths = []
        max_w = 0
        for _ in range(self.count):
            f.seek(pos)
            w = struct.unpack("<H", f.read(2))[0]
            self.widths.append(w)
            self.offsets.append(pos + 2)
            pos += 2 + (w >> 1) * self.band_h
            if w > max_w:
                max_w = w
        self.size = pos
        self._mask_bytes = (max_w >> 1) * self.band_h

    def read_bg(self, buf):
        self._f.seek(self.bg_pos)
        self._f.readinto(buf)

    def buffer(self):
        return bytearray(self._mask_bytes)

    def load(self, k, buf):
        n = (self.widths[k] >> 1) * self.band_h
        self._f.seek(self.offsets[k])
        self._f.readinto(memoryview(buf)[:n])

    def close(self):
        try:
            self._f.close()
        except Exception:
            pass


class Splash:
    def __init__(self, os_obj):
        self._os = os_obj
        self._art = None
        self._start = _ms()
        self._stop = False
        self._alive = False
        self._threaded = False
        self._last = None
        self._loaded = (-1, -1)
        self._target = 0.15
        self._done_ms = None
        self._bar_px = -1
        self._native = None
        try:
            a = _Art(BIN_PATH)
            self._art = a
            self._bg = bytearray(SW * SH * 2)
            a.read_bg(self._bg)
            self._masks = [a.buffer(), a.buffer()]
            self._mfb = [None, None]
            self._band0 = a.band_y * SW * 2
            self._band1 = (a.band_y + a.band_h) * SW * 2
            self._band_fb = None
            self._pal_fb = None
        except Exception as e:
            print("[splash] art unavailable:", e)
            self._art = None
            self._bg = None

    # -- public API (all calls are safe to make; errors never escape) -----

    def intro(self):
        try:
            self._start = _ms()
            if self._art is None:
                self._static()
                return
            self._first_frame()
            if not self._start_native():
                self._start_thread()
        except Exception as e:
            print("[splash] intro:", e)

    def progress(self, frac):
        if frac > self._target:
            self._target = frac
        m = self._native
        if m is not None:
            try:
                m.splash_progress(frac)
            except Exception:
                pass

    def pump(self):
        """Draw one frame when no animation thread is running. Returns False
        (callers pass it as a cancel callback)."""
        if not self._threaded and self._art is not None:
            try:
                self._frame()
            except Exception:
                pass
        return False

    def finish(self, settled=None, cap_ms=MAX_TOTAL_MS):
        """Hold the splash for MIN_TOTAL_MS, and longer while `settled()`
        returns False, up to cap_ms in all. `settled` is called about
        every FRAME_MS and may do a little boot work itself (#119)."""
        try:
            self.wait_settled(settled, cap_ms)
            if self._art is not None:
                self.progress(1.0)
                while _diff(_ms(), self._start) < MIN_TOTAL_MS - FILL_MS:
                    self._tick_wait()
                self._done_ms = _diff(_ms(), self._start)
                if self._native is not None:
                    self._finish_native()
                else:
                    limit = self._done_ms + FILL_MS + CYCLE_MS
                    while True:
                        t = _diff(_ms(), self._start)
                        full = t >= self._done_ms + FILL_MS
                        rest = roll_state(t, self._art.count, self._art.band_h)[2] == 0
                        if (full and rest) or t >= limit:
                            break
                        self._tick_wait()
                    if not self._threaded:
                        self._frame()
            self._stop = True
            waited = 0
            while self._alive and waited < 500:
                time.sleep_ms(5)
                waited += 5
            if self._art is not None and self._bg is not None:
                # Keep the final frame for the swipe into the OS (swipe_in).
                # The backdrop buffer is no longer needed, so it becomes the
                # snapshot: no new 150 KB allocation at this point.
                snap = self._bg
                self._bg = None
                snap[:] = self._os.display._buf
                self._os._splash_frame = snap
                print("[splash] frame kept for the swipe")
        except Exception as e:
            print("[splash] finish:", e)
        self.release()

    def wait_settled(self, settled, cap_ms=MAX_TOTAL_MS):
        """Return once settled() is True or cap_ms has passed since the
        splash started (leaving FILL_MS for the loader). True if settled."""
        if settled is None:
            return True
        limit = cap_ms - (FILL_MS if self._art is not None else 0)
        while True:
            try:
                if settled():
                    return True
            except Exception as e:
                print("[splash] settled:", e)
                return True
            if _diff(_ms(), self._start) >= limit:
                print("[splash] boot not settled after %d ms" % cap_ms)
                return False
            if self._art is not None:
                self._tick_wait()
            else:
                time.sleep_ms(FRAME_MS)

    def release(self):
        self._stop = True
        if self._native is not None:
            self._stop_native(False)
        if self._art is not None:
            self._art.close()
        self._art = None
        self._bg = None
        self._masks = None
        self._mfb = None
        self._band_fb = None

    # -- drawing ----------------------------------------------------------

    def _tick_wait(self):
        if not self._threaded:
            self._frame()
        time.sleep_ms(FRAME_MS)

    def _static(self):
        d = self._os.display
        d.clear(api.rgb(12, 18, 32))
        d.text("hello", (SW - 5 * 24) // 2, SH // 2 - 20, api.WHITE, scale=3)
        d.text("FaleraOS", (SW - 6 * 8) // 2, SH // 2 + 12, theme.PRIMARY)
        d.present()

    def _first_frame(self):
        a = self._art
        d = self._os.display
        d._buf[:] = self._bg
        if framebuf is not None:
            mv = memoryview(d._buf)
            self._band_fb = framebuf.FrameBuffer(mv[self._band0:self._band1],
                                                 SW, a.band_h, framebuf.RGB565)
            self._pal_fb = framebuf.FrameBuffer(a.pal, 16, 1, framebuf.RGB565)
        self._ensure(0, 1)
        self._draw_band(0, 1, 0)
        self._last = (0, 0)
        self._draw_bar(0.0)
        d._dirty = True
        d.present()

    def _ensure(self, k, n):
        """Have word k in mask slot 0 and word n in slot 1."""
        lk, ln = self._loaded
        a = self._art
        if lk != k:
            if ln == k:
                self._masks.reverse()
                self._mfb.reverse()
                ln = -1
            else:
                a.load(k, self._masks[0])
                self._mfb[0] = self._mask_fb(0, k)
        if ln != n:
            a.load(n, self._masks[1])
            self._mfb[1] = self._mask_fb(1, n)
        self._loaded = (k, n)

    def _mask_fb(self, slot, k):
        if framebuf is None:
            return None
        return framebuf.FrameBuffer(self._masks[slot], self._art.widths[k],
                                    self._art.band_h, framebuf.GS4_HMSB)

    def _draw_band(self, k, n, off):
        a = self._art
        d = self._os.display
        b0, b1, bh = self._band0, self._band1, a.band_h
        d._buf[b0:b1] = memoryview(self._bg)[b0:b1]
        wk, wn = a.widths[k], a.widths[n]
        xk, xn = (SW - wk) // 2, (SW - wn) // 2
        if self._band_fb is not None:
            self._band_fb.blit(self._mfb[0], xk, -off, a.key, self._pal_fb)
            self._band_fb.blit(self._mfb[1], xn, bh - off, a.key, self._pal_fb)
        else:
            band = memoryview(d._buf)[b0:b1]
            blit_gs4(band, SW, bh, self._masks[0], wk, bh, xk, -off, a.pal, a.key)
            blit_gs4(band, SW, bh, self._masks[1], wn, bh, xn, bh - off, a.pal, a.key)

    def _draw_bar(self, frac):
        return self._draw_bar_px(int(self._art.bar_w * frac))

    def _draw_bar_px(self, px):
        a = self._art
        if px == self._bar_px:
            return False
        self._bar_px = px
        fb = self._os.display._buf
        stride = SW * 2
        track = struct.pack(">H", a.bar_track)
        fill = struct.pack(">H", a.bar_fill)
        for r in range(a.bar_h):
            o = (a.bar_y + r) * stride + a.bar_x * 2
            fb[o:o + px * 2] = fill * px
            fb[o + px * 2:o + a.bar_w * 2] = track * (a.bar_w - px)
        return True

    def _frame(self):
        a = self._art
        d = self._os.display
        t = _diff(_ms(), self._start)
        k, n, off = roll_state(t, a.count, a.band_h)
        if (k, off) != self._last:
            self._ensure(k, n)
            self._last = (k, off)
            self._draw_band(k, n, off)
            d._dirty = True
            d.present_rect(0, a.band_y, SW, a.band_h)
        if self._draw_bar(loader_frac(t, self._target, self._done_ms)):
            d._dirty = True
            d.present_rect(a.bar_x, a.bar_y, a.bar_w, a.bar_h)

    def _run(self):
        try:
            while not self._stop and self._art is not None:
                self._frame()
                time.sleep_ms(FRAME_MS)
        except Exception as e:
            print("[splash] thread:", e)
        self._alive = False

    # -- the native player (firmware _oreo_rv565, see the module docstring) -

    def _start_native(self):
        """Hand the band and the loader to the firmware's splash player.
        False (and nothing changed) when the firmware or the clip lacks it."""
        m = native_player()
        if m is None:
            return False
        a = self._art
        t0 = _ms()
        try:
            total = load_clip(m, CLIP_PATH)
            kw = {}
            try:
                from oreoWare import pins
                kw = {"cs": pins.DISPLAY_CS, "dc": pins.DISPLAY_DC,
                      "baud": pins.DISPLAY_BAUD}
            except Exception:
                pass            # the firmware's defaults are the badge's pins
            m.splash_start(a.band_y, period=CLIP_WORD_FRAMES,
                           hold=clip_rest_frames(a.count, a.band_h),
                           bar=(a.bar_x, a.bar_y, a.bar_w, a.bar_h),
                           track=a.bar_track, fill=a.bar_fill,
                           bar_px=max(0, self._bar_px),
                           t0=_diff(_ms(), self._start),
                           min_total=MIN_TOTAL_MS, fill_ms=FILL_MS,
                           life=MAX_TOTAL_MS + LIFE_MARGIN_MS, spi=1, **kw)
            m.splash_progress(self._target)
        except Exception as e:
            print("[splash] native player unavailable:", e)
            try:
                m.splash_stop()         # frees a partly loaded clip
            except Exception:
                pass
            return False
        self._native = m
        self._threaded = True           # no Python animation, no pump()
        print("[splash] native player: %d KB clip in %d ms"
              % (total // 1024, _diff(_ms(), t0)))
        return True

    def _finish_native(self):
        """The player runs the loader to full over FILL_MS, then stops on a
        word at rest; its last frame lands in the framebuffer."""
        try:
            self._native.splash_progress(1.0, self._done_ms)
        except Exception:
            pass
        while _diff(_ms(), self._start) < self._done_ms + FILL_MS:
            self._tick_wait()
        self._stop_native(True)

    def _stop_native(self, at_rest):
        """Stop the player and take the panel back: its last frame goes
        into the framebuffer's band and the loader is redrawn where the
        player left it, so the framebuffer matches the screen."""
        m = self._native
        self._native = None
        try:
            band = memoryview(self._os.display._buf)[self._band0:self._band1]
            r = m.splash_stop(band, at_rest, STOP_TIMEOUT_MS)
            if r:
                self._draw_bar_px(r[0])
                print("[splash] native: %d frames, %d late, worst %d us, err %d"
                      % (r[1], r[2], r[3], r[4]))
        except Exception as e:
            print("[splash] native stop:", e)

    def _start_thread(self):
        try:
            import _thread
            try:
                _thread.stack_size(8 * 1024)
            except Exception:
                pass
            self._alive = True
            self._threaded = True
            _thread.start_new_thread(self._run, ())
        except Exception as e:
            print("[splash] no thread, pump() fallback:", e)
            self._alive = False
            self._threaded = False


# -- OTA updating screen ------------------------------------------------------

def show_updating(os_obj, target_version, total_files):
    """Draw a system-update splash while OTA files are being copied.

    Modelled on the app-loader slide: a pink panel fills the screen with a
    vertically centred title, progress bar, target version and safety copy.
    The caller advances the bar via update_progress(). Returns a callable
    `(done_count, current_file) -> None` so the apply step can pump
    progress without re-doing all the panel rendering each call.
    """
    d  = os_obj.display
    SW = api.SCREEN_W
    SH = api.SCREEN_H

    # Build the complete block around the screen centre instead of anchoring
    # individual elements to unrelated offsets. This keeps the title, bar,
    # version, warning and current filename visually balanced as one unit.
    d.rect(0, 0, SW, SH, theme.PRIMARY, fill=True)
    centre_y = SH // 2
    title_y  = centre_y - 54
    bar_y    = centre_y - 20
    bar_h    = 10
    version_y = bar_y + bar_h + 10
    warning_y = version_y + 20
    file_y    = warning_y + 18

    title = "UPDATING FALERAOS"
    tw    = len(title) * 16
    d.text(title, (SW - tw) // 2, title_y, api.WHITE, scale=2)

    bar_x = 30
    bar_w = SW - 60
    # Gold outer frame separates the progress track from the pink panel.
    d.rect(bar_x - 2, bar_y - 2, bar_w + 4, bar_h + 4,
           theme.GOLD, fill=True)
    d.rect(bar_x, bar_y, bar_w, bar_h, api.rgb(40, 40, 40), fill=True)

    # The target version belongs to the progress operation, so keep it just
    # below the bar rather than near the title. Scale 2 makes the destination
    # unambiguous from normal status text.
    version = target_version or "unknown"
    vw = len(version) * 16
    d.text(version, (SW - vw) // 2, version_y, theme.GOLD, scale=2)
    d.text("do not unplug", (SW - 13 * 8) // 2, warning_y,
           api.WHITE)
    d.present()

    def _advance(done, current_file=""):
        # Only repaint the bar's filled portion + the file-name strip to
        # keep this cheap (full-screen reflows during an OTA apply would
        # add 30+ ms of GC pressure per file).
        pct = done / float(max(1, total_files))
        fill_w = int(bar_w * pct)
        d.rect(bar_x, bar_y, bar_w, bar_h, api.rgb(40, 40, 40), fill=True)
        if fill_w:
            d.rect(bar_x, bar_y, fill_w, bar_h, theme.GOLD, fill=True)
        # Clear + re-draw the file-name line under the bar.
        d.rect(0, file_y, SW, 14, theme.PRIMARY, fill=True)
        name = (current_file or "")[:38]
        if name:
            d.text(name, (SW - len(name) * 8) // 2, file_y,
                   api.WHITE)
        d.present()

    return _advance
