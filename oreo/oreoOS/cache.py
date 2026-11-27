"""TTL-cached file storage for app data fetched over WiFi.

Apps that hit the network (Badge, Commits, Weather)
all do the same dance:

  1. on entry: show whatever's in the cache so the screen isn't blank
  2. if the cache is older than TTL, fire a fresh fetch in the background
  3. when the fetch lands, swap the new data in + persist

This module wraps that into one function pair:

    from oreoOS.cache import save, load

    save("apps/badge/cache.txt", profile_dict)
    profile, age_s = load("apps/badge/cache.txt", ttl_s=3600)

`profile` is None when the file doesn't exist OR has expired past `ttl_s`;
`age_s` tells the caller how stale the cache was (so they can show
"updated 5 min ago" in the UI).

The serializer is intentionally text-based (key=value per line) because
MicroPython's filesystem can survive a partial write but its JSON parser
is mp_lexer-allocated and a corrupt file would crash the boot. A few
lines of `name=Ayushman` survive any abrupt reset.
"""

import time

# Age reported when the clock cannot tell how old a cache is.
UNKNOWN_AGE = 1 << 30


def _now_s():
    """Wall-clock seconds since epoch (RTC) — used for TTL bookkeeping."""
    try:
        return int(time.time())
    except Exception:
        # On boards without a synced clock time.time() may raise; fall back
        # to ticks_ms() converted to seconds, which is monotonic-since-boot.
        return time.ticks_ms() // 1000


# ── tiny key=value serializer ───────────────────────────────────────────────
# We intentionally don't use JSON to avoid the parser-allocation cost on
# MicroPython. The values are coerced to str on write and returned as str
# on read; callers cast back to int / float / tuple as needed.

def _ser(obj):
    if isinstance(obj, dict):
        out = []
        for k, v in obj.items():
            out.append("%s=%s" % (k, _esc(v)))
        return "\n".join(out)
    return _esc(obj)


def _esc(v):
    if isinstance(v, str):
        return v.replace("\\", "\\\\").replace("\n", "\\n")
    return str(v)


def _unesc(s):
    if "\\" not in s:
        return s
    out = []
    i = 0
    n = len(s)
    while i < n:
        c = s[i]
        if c == "\\" and i + 1 < n:
            nxt = s[i + 1]
            if nxt == "n":
                out.append("\n")
                i += 2
                continue
            elif nxt == "\\":
                out.append("\\")
                i += 2
                continue
        out.append(c)
        i += 1
    return "".join(out)


def _deser(text):
    if "=" not in text:
        return _unesc(text)
    out = {}
    for line in text.splitlines():
        if not line or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = _unesc(v)
    return out


# ── public API ──────────────────────────────────────────────────────────────

def save(path, payload):
    """Write `payload` (dict OR scalar) to `path` with a timestamp header.

    The file is written to `path + ".tmp"` and renamed over the old one, so
    a reset mid-write leaves the previous cache intact instead of a torn
    file. On filesystem error we silently swallow — the cache is a
    nice-to-have, never required for correctness.
    """
    tmp = path + ".tmp"
    try:
        with open(tmp, "w") as f:
            f.write("__ts=%d\n" % _now_s())
            f.write(_ser(payload))
    except Exception:
        return False
    try:
        import os as _os
        try:
            _os.rename(tmp, path)
        except OSError:
            # FAT refuses to rename over an existing file.
            try:
                _os.remove(path)
            except OSError:
                pass
            _os.rename(tmp, path)
        return True
    except Exception:
        return False


def load(path, ttl_s=None):
    """Return (payload, age_seconds) or (None, None).

    If `ttl_s` is given and the cache is older, the function still returns
    the payload but with `age_seconds > ttl_s`. The caller can decide:
        - render stale data immediately (always)
        - + kick off a background refresh when age_seconds > ttl_s.

    Returns (None, None) when the file doesn't exist OR the header is
    malformed. Apps treat that as "no cache, hit the network".
    """
    try:
        with open(path) as f:
            text = f.read()
    except OSError:
        return None, None

    if not text.startswith("__ts="):
        # Pre-cache file or corrupt header — treat as no cache.
        return None, None
    first, _, rest = text.partition("\n")
    try:
        ts = int(first[5:])
    except ValueError:
        return None, None
    now = _now_s()
    if now < ts:
        # The clock is behind the save (RTC not synced since boot), so the
        # real age is unknown: report it as very stale so callers still
        # show the data but refresh it when they can.
        return _deser(rest), UNKNOWN_AGE
    return _deser(rest), now - ts


def fresh(path, ttl_s):
    """Convenience: True iff the cache at `path` is younger than `ttl_s`."""
    _, age = load(path)
    return age is not None and age <= ttl_s


def invalidate(path):
    """Delete a cache file. Used when the user presses 'force refresh'."""
    try:
        import os as _os
        _os.remove(path)
        return True
    except Exception:
        return False


# ── background refresh ─────────────────────────────────────────────────────

IDLE, RUNNING, DONE = 0, 1, 2


class Refresh:
    """Run `fn()` off the UI loop, then hand its result back via poll().

        job = cache.Refresh(fetch_profile_for_me)
        job.start()                 # returns at once
        ...
        if job.poll():              # in update(): True once, when finished
            use(job.result)

    With `_thread` (on in the stock ESP32 port) `fn` runs on its own task,
    so buttons and redraws keep working while it waits on the network; the
    ESP32 socket layer releases the GIL while blocked. Without it, or if the
    thread cannot be created, `fn` runs inside poll() a frame later, after
    the cached screen has already been drawn. `fn` must not draw; it only
    returns data. Exceptions become `result = None` and `error = str`.
    """

    STACK = 16 * 1024      # TLS handshakes need more than the default stack

    def __init__(self, fn):
        self._fn = fn
        self.state = IDLE
        self.result = None
        self.error = None
        self.threaded = False
        self._deferred = 0

    def busy(self):
        return self.state == RUNNING

    def _run(self):
        try:
            self.result = self._fn()
            self.error = None
        except Exception as exc:
            self.result = None
            self.error = str(exc)
        self.state = DONE

    def start(self, use_thread=True):
        if self.state == RUNNING:
            return False
        self.result = None
        self.error = None
        self.state = RUNNING
        self.threaded = False
        if use_thread:
            try:
                import _thread
                old = None
                try:
                    old = _thread.stack_size(self.STACK)
                except Exception:
                    pass
                try:
                    _thread.start_new_thread(self._run, ())
                    self.threaded = True
                finally:
                    if old is not None:
                        try:
                            _thread.stack_size(old)
                        except Exception:
                            pass
            except Exception:
                self.threaded = False
        # Deferred path: skip one poll so the caller's frame is drawn first.
        self._deferred = 0 if self.threaded else 2
        return True

    def poll(self):
        """True exactly once, on the call that sees the job finished."""
        if self.state == RUNNING and not self.threaded:
            self._deferred -= 1
            if self._deferred <= 0:
                self._run()
        if self.state == DONE:
            self.state = IDLE
            return True
        return False
