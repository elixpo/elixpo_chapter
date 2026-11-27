"""Where the badge is, from its public IP address.

Weather uses this when the owner set no WEATHER_LAT / WEATHER_LON: the
badge asks a keyless geolocation service where its internet connection
is, and gets a latitude, a longitude and a town. City-level only, from the
network's address; no GPS, and nothing is sent but the request itself.

lookup() does network I/O (DNS, TLS, one GET): call it off the UI thread,
as Weather does from its fetch worker. The last good answer is kept in
memory and in /state/geo.json, so later calls and the next boot have a
location even when the services are unreachable. location() never
touches the network.

Setting WEATHER_LAT and WEATHER_LON in the profile always wins.
"""

try:
    import ujson as json
except ImportError:
    import json
import time

from oreoOS import state as _state


STATE_APP = "geo"
TIMEOUT_S = 6
RETRY_MS = 60000    # wait this long after a failed try before asking again

# Keyless HTTPS services, tried in order. Each entry: (url, parser).
def _parse_ipwho(j):
    if not j.get("success"):
        return None
    return j.get("latitude"), j.get("longitude"), j.get("city") or ""


def _parse_ipapi(j):
    if j.get("error"):
        return None
    return j.get("latitude"), j.get("longitude"), j.get("city") or ""


PROVIDERS = (
    ("https://ipwho.is/?fields=success,latitude,longitude,city", _parse_ipwho),
    ("https://ipapi.co/json/", _parse_ipapi),
)

_mem = None          # {"lat", "lon", "name"} once known this boot
_looked_up = False   # a service answered this boot
_tried_at = None     # ticks of the last network try, to space out retries


def _ticks():
    try:
        return time.ticks_ms()
    except AttributeError:
        return int(time.monotonic() * 1000)


def _diff(a, b):
    try:
        return time.ticks_diff(a, b)
    except AttributeError:
        return a - b


def _valid(lat, lon):
    try:
        lat = float(lat)
        lon = float(lon)
    except (TypeError, ValueError):
        return None
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return None
    if lat == 0.0 and lon == 0.0:
        return None
    return lat, lon


def parse(body, parser):
    """(lat, lon, name) from a service's JSON body, or None."""
    try:
        j = json.loads(body.decode("utf-8") if isinstance(body, (bytes, bytearray))
                       else body)
        got = parser(j)
    except Exception:
        return None
    if not got:
        return None
    ok = _valid(got[0], got[1])
    if ok is None:
        return None
    return {"lat": ok[0], "lon": ok[1], "name": str(got[2] or "")[:32]}


def location():
    """The last known location ({"lat", "lon", "name"}) or None. No I/O
    beyond reading /state/geo.json once."""
    global _mem
    if _mem is None:
        try:
            saved = _state.load(STATE_APP, {})
            ok = _valid(saved.get("lat"), saved.get("lon"))
            if ok is not None:
                _mem = {"lat": ok[0], "lon": ok[1],
                        "name": str(saved.get("name") or "")[:32]}
        except Exception:
            pass
    return _mem


def lookup(force=False):
    """Ask the services once per boot (or again with force=True); a failed
    try is retried, at most every RETRY_MS. Returns the location, falling
    back to the last known one. Network I/O: call it off the UI thread."""
    global _mem, _looked_up, _tried_at
    if not force:
        if _looked_up:
            return location()
        if _tried_at is not None and 0 <= _diff(_ticks(), _tried_at) < RETRY_MS:
            return location()
    _tried_at = _ticks()
    try:
        from oreoOS import _http
    except Exception:
        return location()
    for url, parser in PROVIDERS:
        try:
            body = _http.get_url(url, accept="application/json",
                                 timeout_s=TIMEOUT_S)
        except Exception:
            body = None
        if not body:
            continue
        got = parse(body, parser)
        if got is not None:
            _mem = got
            _looked_up = True
            try:
                _state.save(STATE_APP, got)
            except Exception:
                pass
            return got
    return location()


def forget():
    """Drop the remembered location (memory and /state/geo.json)."""
    global _mem, _looked_up, _tried_at
    _mem = None
    _looked_up = False
    _tried_at = None
    try:
        _state.delete(STATE_APP)
    except Exception:
        pass
