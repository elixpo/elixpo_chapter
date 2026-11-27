"""Weather — live conditions over a full-screen dimmed sky background.

Layout (landscape 320×240):

  ┌──── header ───────────────────────────────┐
  │ WEATHER                                   │
  ├───────────────────────────────────────────┤
  │  (dimmed sky bg fills entire play area)   │
  │                                           │
  │              33° Clear                    │  ← big temp + condition
  │              Kolkata                      │  ← city
  │                                           │
  │               [PANDA]                     │  ← centred mascot
  │                                           │
  │   feels 29°    hum 58%    wind 6 m/s      │  ← metric pill row
  └───────────────────────────────────────────┘

The bg asset (80×60) is upscaled to the play-area size on first frame, then
darkened to ~22 % brightness so white text reads crisply on top. No live
"blur" (per-pixel blur is too slow on MicroPython); the heavy dim achieves
the same visual hierarchy cheaply.

Controls:
  A      force refresh
  HOME   apps drawer

Network: the fetch runs off the UI loop (oreoOS.cache.Refresh on a
thread) through oreoOS._http, whose socket timeouts are honoured. The
last reading is drawn at once on re-entry; the first automatic fetch
waits for netsvc's boot quiet window, for Wi-Fi and for any other
background network thread (netsvc.fetch_busy()), and never runs inline
on a build without threads (A still fetches there). The fetch job lives
at module level: leaving and re-opening Weather while a fetch is in
flight re-attaches to it instead of starting a second one.
"""

import time
import oreoOS
from oreoOS import api
from oreoOS import theme, widgets

SW = api.SCREEN_W
SH = api.SCREEN_H

REFRESH_SEC = 600
DIM_FACTOR  = 0.22
T_FETCH     = 8             # seconds, DNS + TLS + GET

# Last reading, kept across app entries so re-opening draws it at once.
_last_data  = None
_last_ms    = None
# The fetch job and what it fetches, kept across entries (see above).
_job        = None
_cfg        = (12.97, 77.59, "")
_try_ms     = None              # ticks_ms when the running fetch started


def _bucket(code):
    if code is None:        return ("cloud", "Unknown")
    if 200 <= code < 300:   return ("storm", "Thunder")
    if 300 <= code < 600:   return ("rain",  "Rain")
    if 600 <= code < 700:   return ("snow",  "Snow")
    if 700 <= code < 800:   return ("cloud", "Misty")
    if code == 800:         return ("sun",   "Clear")
    if 801 <= code < 900:   return ("cloud", "Cloudy")
    return ("cloud", "Unknown")


def _try_sprite(name):
    try:
        m = __import__("apps.weather.assets.optimized." + name, None, None,
                       ["DATA", "W", "H"])
        return (bytearray(m.DATA), m.W, m.H)
    except (ImportError, AttributeError):
        return None


def _upscale_dim_bg(data, w, h, sw, sh, factor):
    """Nearest-neighbour upscale of `data` (big-endian RGB565) into a sw×sh
    buffer, with each pixel darkened by `factor`. One-time cost at app entry
    (~250 ms on hardware); thereafter the result is a single blit per frame.
    """
    fac = int(factor * 256)
    # Pre-dim the source once so the upscale inner loop is a 2-byte copy.
    dim = bytearray(w * h * 2)
    for i in range(w * h):
        v = (data[i*2] << 8) | data[i*2 + 1]
        r = ((v >> 11) & 0x1F) * fac >> 8
        g = ((v >>  5) & 0x3F) * fac >> 8
        b = ( v        & 0x1F) * fac >> 8
        v2 = (r << 11) | (g << 5) | b
        dim[i*2]     = v2 >> 8
        dim[i*2 + 1] = v2 & 0xFF

    out      = bytearray(sw * sh * 2)
    sx_step  = (w << 16) // sw
    sy_step  = (h << 16) // sh
    sy       = 0
    for dy in range(sh):
        src_row = (sy >> 16) * w * 2
        sx      = 0
        row_off = dy * sw * 2
        for dx in range(sw):
            src = src_row + (sx >> 16) * 2
            out[row_off + dx * 2]     = dim[src]
            out[row_off + dx * 2 + 1] = dim[src + 1]
            sx += sx_step
        sy += sy_step
    return out


def parse_owm(j):
    """OpenWeatherMap /weather JSON (dict) -> the fields drawn."""
    try:
        return {
            "temp":  round(float(j.get("main", {}).get("temp", 0))),
            "feels": round(float(j.get("main", {}).get("feels_like", 0))),
            "hum":   int(j.get("main", {}).get("humidity", 0)),
            "wind":  float(j.get("wind", {}).get("speed", 0)),
            "code":  int((j.get("weather") or [{"id": 0}])[0].get("id", 0)),
            "city":  j.get("name") or "—",
        }
    except Exception:
        return None


def _fetch_owm(lat, lon, api_key):
    # Runs on the Refresh worker thread: network and parsing only.
    try:
        import json
        from oreoOS import _http
        url = ("https://api.openweathermap.org/data/2.5/weather"
               "?lat=%.3f&lon=%.3f&units=metric" % (lat, lon))
        # The key rides only on the request line, never in a logged URL.
        body = _http.get_url(url, accept="application/json",
                             timeout_s=T_FETCH,
                             secret_query="appid=" + api_key)
        if not body:
            return None
        return parse_owm(json.loads(body.decode("utf-8")))
    except Exception:
        return None


def _auto_location():
    """(lat, lon) of the badge from oreoOS.geo, or None. Network I/O: runs
    on the Refresh worker thread. An OS without oreoOS.geo has no automatic
    location; the setup card then asks for WEATHER_LAT / WEATHER_LON."""
    try:
        from oreoOS import geo
    except ImportError:
        return None
    try:
        got = geo.lookup()
    except Exception:
        return None
    if not got:
        return None
    return got["lat"], got["lon"]


def _fetch_cfg():
    # Runs on the Refresh worker thread.
    lat, lon, key = _cfg
    if lat is None or lon is None:
        found = _auto_location()
        if found is None:
            return None
        lat, lon = found
    return _fetch_owm(lat, lon, key)


def _tls_mark():
    """A mark for _tls_failed(); None on an OS without verified TLS."""
    try:
        from oreoOS import _http
        return _http.tls_mark()
    except Exception:
        return None


def _tls_failed(mark):
    """True when a certificate check (or the clock it needs) failed since
    `mark` (FaleraOS with verified TLS, #110)."""
    if mark is None:
        return False
    try:
        from oreoOS import _http
        return bool(_http.tls_error_since(mark))
    except Exception:
        return False


def _online():
    try:
        from oreoWare import wifi
        return bool(wifi.is_connected())
    except Exception:
        return False


def auto_fetch_ok(net=None):
    """True when an automatic fetch may start: past netsvc's boot quiet
    window, on a build with threads, with Wi-Fi up."""
    if net is None:
        try:
            from oreoOS import netsvc as net
        except Exception:
            net = None
    if net is not None:
        try:
            if net.in_quiet() or not net.has_threads():
                return False
        except Exception:
            pass
        try:
            if net.fetch_busy():
                return False
        except Exception:
            pass
    return _online()


def _owner_location():
    """(lat, lon, key) for the owner. lat/lon are None when no place is
    pinned; the fetch then uses the badge's own location (oreoOS.geo). With
    no key the setup card explains what to set.

    Reads /profile.json then secrets.py through oreoOS.profile. An OS
    built before oreoOS.profile existed falls back to reading secrets.py
    directly, so an App Store update never loses a location that worked.
    """
    try:
        from oreoOS import profile
    except ImportError:
        profile = None
    lat = lon = None
    key = ""
    try:
        if profile is not None:
            lat = profile.get("WEATHER_LAT")
            lon = profile.get("WEATHER_LON")
            key = profile.get("OWM_API_KEY", "") or ""
        else:
            import secrets
            lat = getattr(secrets, "WEATHER_LAT", None)
            lon = getattr(secrets, "WEATHER_LON", None)
            key = getattr(secrets, "OWM_API_KEY", "") or ""
            lat = None if lat is None else float(lat)
            lon = None if lon is None else float(lon)
    except Exception:
        lat = lon = None
    if lat is None or lon is None:
        # No pinned place: the fetch finds the badge's own location.
        return None, None, key
    return lat, lon, key


class App(oreoOS.App):
    name         = "Weather"
    SHOW_LOADING = True

    def on_enter(self, os):
        global _job, _cfg
        self._os = os
        self._lat, self._lon, self._key = _owner_location()

        play_h = SH - widgets.HEADER_H - widgets.HINT_H

        bg = _try_sprite("background")
        if bg:
            data, bw, bh = bg
            self._bg = (_upscale_dim_bg(data, bw, bh, SW, play_h, DIM_FACTOR),
                        SW, play_h)
        else:
            self._bg = None

        self._pandas = {k: _try_sprite("panda_" + k)
                        for k in ("sun", "cloud", "rain", "snow", "storm")}

        _cfg = (self._lat, self._lon, self._key)
        self._data  = _last_data
        self._last  = _last_ms
        if _job is None:
            try:
                from oreoOS import cache
                _job = cache.Refresh(_fetch_cfg)
            except Exception:
                _job = None
        # A fetch started on an earlier visit may still be running (or
        # finished while the app was closed): update() picks it up.
        self._job = _job
        self._dirty = True

    def on_exit(self):
        # A running fetch finishes on its own; the module keeps the job,
        # so the next visit collects its result instead of fetching again.
        self._job = None

    def _due(self):
        return (self._last is None or
                time.ticks_diff(time.ticks_ms(), self._last)
                > REFRESH_SEC * 1000)

    def _refresh(self):
        """Start a fetch; returns at once. update() picks the result up."""
        job = self._job
        if not self._key or job is None or job.busy():
            return
        try:
            # Import on the UI thread, not on the worker.
            import json                 # noqa: F401
            from oreoOS import _http    # noqa: F401
        except Exception:
            pass
        global _try_ms
        self._last = _try_ms = time.ticks_ms()
        self._tls_mark = _tls_mark()
        self._tls = False
        job.start()
        self._dirty = True

    def on_button_press(self, btn):
        if btn == api.BTN_A:
            self._refresh()

    def update(self, dt):
        global _last_data, _last_ms
        job = self._job
        if job is None:
            return
        if job.poll():
            if job.result is not None:
                self._data = job.result
                _last_data, _last_ms = self._data, _try_ms
                self._last = _try_ms
            else:
                self._tls = _tls_failed(getattr(self, "_tls_mark", None))
            self._dirty = True
        elif not job.busy() and self._key and self._due() and auto_fetch_ok():
            self._refresh()

    # ── render ─────────────────────────────────────────────────────────
    def draw(self, d):
        if not self._dirty:
            return

        play_top = widgets.HEADER_H
        play_h   = SH - widgets.HEADER_H - widgets.HINT_H

        # Full-play-area dimmed bg, single blit.
        if self._bg:
            data, bw, bh = self._bg
            d.blit(data, 0, play_top, bw, bh)
        else:
            d.rect(0, play_top, SW, play_h, api.rgb(20, 30, 45), fill=True)

        widgets.draw_header(d, "WEATHER")
        widgets.draw_hint  (d, "A=refresh  HOME=back")

        if not self._key:
            self._draw_setup_card(d)
            self._dirty = False
            return
        if self._data is None:
            busy = self._job is not None and self._job.busy()
            self._draw_offline(d, busy)
            self._dirty = False
            return

        p             = self._data
        cond_key, lbl = _bucket(p["code"])
        sprite        = self._pandas.get(cond_key)

        # Vertical stack centred in the play area:
        #   temp+condition row (40px) / city (16px) / panda (80px) / metric row (14px)
        # Plus 10px gaps between each block. Total ~190 — fits play_h=196.
        gap     = 10
        block_h = 40 + 16 + gap + 80 + gap + 14
        block_y = play_top + max(4, (play_h - block_h) // 2)

        # Big temperature centred, with hollow degree mark + condition tag.
        t_str  = "%d" % p["temp"]
        temp_w = len(t_str) * 40           # scale=5 → 8*5 px per glyph
        deg_w  = 14
        cond_w = len(lbl) * 16             # scale=2 → 8*2 px per glyph
        spacer = 8
        total_w = temp_w + deg_w + spacer + cond_w
        tx      = (SW - total_w) // 2
        d.text(t_str, tx, block_y, api.WHITE, scale=5)
        deg_x   = tx + temp_w + 2
        d.rect(deg_x,     block_y + 4, 8, 8, api.WHITE, fill=False)
        d.rect(deg_x + 2, block_y + 6, 4, 4, api.rgb(20, 30, 45), fill=True)
        d.text(lbl, tx + temp_w + deg_w + spacer,
               block_y + (40 - 16) // 2 + 2, theme.GOLD, scale=2)

        # City — white scale=2 centred under temp.
        city = p["city"][:18]
        cw   = len(city) * 16
        cy   = block_y + 40
        d.text(city, (SW - cw) // 2, cy, api.WHITE, scale=2)

        # Mascot — centred horizontally.
        panda_y = cy + 16 + gap
        if sprite:
            sdata, pw, ph = sprite
            d.blit(sdata, (SW - pw) // 2, panda_y, pw, ph)
        else:
            d.rect((SW - 80) // 2, panda_y, 80, 80, theme.PRIMARY, fill=True)

        # Three centred metric pills.
        m_y = panda_y + 80 + gap
        pills = [
            ("feels", "%d C"  % p["feels"]),
            ("hum",   "%d%%"  % p["hum"]),
            ("wind",  "%d m/s" % round(p["wind"])),
        ]
        pill_widths = [(len(l) + 1 + len(v)) * 8 + 18 for l, v in pills]
        total_pw    = sum(pill_widths) + 8 * (len(pills) - 1)
        px          = (SW - total_pw) // 2
        for i, (label, val) in enumerate(pills):
            pw = pill_widths[i]
            d.rect(px, m_y, pw, 14, theme.PRIMARY, fill=True)
            d.text("%s %s" % (label, val), px + 8, m_y + 3, api.WHITE)
            px += pw + 8

        self._dirty = False

    # ── error cards ────────────────────────────────────────────────────
    def _draw_setup_card(self, d):
        cw, ch = SW - 32, SH - widgets.HEADER_H - widgets.HINT_H - 32
        cx, cy = 16, widgets.HEADER_H + 16
        d.rect(cx, cy, cw, ch, theme.CARD, fill=True)
        d.rect(cx, cy, cw, 2,  theme.PRIMARY, fill=True)
        d.text("setup needed", (SW - 12 * 16) // 2, cy + 14, theme.PRIMARY, scale=2)
        for i, ln in enumerate([
                "Set your OpenWeatherMap key",
                "  OWM_API_KEY",
                "with falera setup or .env.local.",
                "",
                "Location: found from the",
                "badge's network, or pin it",
                "with WEATHER_LAT / WEATHER_LON."]):
            d.text(ln, cx + 16, cy + 38 + i * 14, theme.TEXT_BRIGHT)

    def _draw_offline(self, d, busy=False):
        title = "loading" if busy else "offline"
        msg = "fetching weather..." if busy else "offline — press A to retry"
        if not busy and getattr(self, "_tls", False):
            title = "not secure"
            msg = "certificate check failed, A=retry"
        if busy and (self._lat is None or self._lon is None):
            msg = "finding your location..."
        d.rect(20, 110, SW - 40, 36, theme.CARD, fill=True)
        d.rect(20, 110, SW - 40,  2, theme.PRIMARY, fill=True)
        d.text(title, (SW - len(title) * 16) // 2, 118, theme.PRIMARY, scale=2)
        d.text(msg, (SW - len(msg) * 8) // 2, 138, theme.TEXT_BRIGHT)
