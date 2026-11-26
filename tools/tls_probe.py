"""On-badge check of verified TLS (#110). Runs ON the badge:

    falera run tools/tls_probe.py

With certificate verification on, it reports for every host the badge
uses: handshake time, free Python heap (gc) and free ESP-IDF heap (where
mbedTLS allocates) before and during the connection. It then checks that
a wrong server name is refused, and fetches the OTA tag list through
oreoOS._http.get_url. Nothing is written to flash; the clock is synced
over NTP only if it is not set yet.

Needs a Wi-Fi network saved on the badge (`falera wifi`). Paste the whole
output into the pull request for #110.
"""

import gc
import socket
import time

from oreoOS import _http

HOSTS = (
    "api.github.com",
    "github.com",
    "raw.githubusercontent.com",
    "release-assets.githubusercontent.com",
    "objects.githubusercontent.com",
    "codeload.github.com",
    "ipwho.is",
    "ipapi.co",
    "api.openweathermap.org",
    "speed.cloudflare.com",
)


def idf_free():
    """(total free, largest free block) of the ESP-IDF data heap, which
    mbedTLS uses for its buffers and parsed certificates."""
    try:
        import esp32
        info = esp32.idf_heap_info(esp32.HEAP_DATA)
        return sum(i[1] for i in info), max(i[2] for i in info)
    except Exception:
        return 0, 0


def heap():
    gc.collect()
    return gc.mem_free(), idf_free()[0]


def wifi_up():
    try:
        from oreoWare import wifi
    except ImportError:
        return False
    if wifi.is_connected():
        return True
    print("Wi-Fi: connecting to a saved network...")
    try:
        wifi.connect_from_config()
    except Exception as e:
        print("Wi-Fi: connect failed:", e)
    return wifi.is_connected()


def handshake(host, name=None):
    """(ms, gc_used, idf_used) for one verified handshake with `host`,
    sending `name` as the server name (default: host)."""
    addr = socket.getaddrinfo(host, 443)[0][-1]
    raw = socket.socket()
    raw.settimeout(15)
    s = None
    try:
        raw.connect(addr)
        gc0, idf0 = heap()
        t0 = time.ticks_ms()
        s = _http.tls_wrap(raw, name or host)
        ms = time.ticks_diff(time.ticks_ms(), t0)
        idf1 = idf_free()[0]
        gc1 = gc.mem_free()
        return ms, gc0 - gc1, idf0 - idf1
    finally:
        for h in (s, raw):
            try:
                if h is not None:
                    h.close()
            except Exception:
                pass


def main():
    print("== FaleraOS TLS probe (#110) ==")
    print("verification:", "OFF (INSECURE_DEBUG)" if _http.INSECURE_DEBUG
          else "on")
    if not wifi_up():
        print("FAIL: no Wi-Fi")
        return
    t = time.localtime()
    print("clock before: %04d-%02d-%02d %02d:%02d:%02d (set: %s)"
          % (t[0], t[1], t[2], t[3], t[4], t[5], _http.clock_ok()))
    t0 = time.ticks_ms()
    ok = _http.ensure_clock()
    t = time.localtime()
    print("clock after:  %04d-%02d-%02d %02d:%02d:%02d (set: %s, %d ms)"
          % (t[0], t[1], t[2], t[3], t[4], t[5], ok,
             time.ticks_diff(time.ticks_ms(), t0)))

    gc0, idf0 = heap()
    t0 = time.ticks_ms()
    roots = _http._load_roots()
    ms = time.ticks_diff(time.ticks_ms(), t0)
    gc1, idf1 = heap()
    print("roots: %d certificates, %d bytes DER, import %d ms, heap +%d B"
          % (len(roots), sum(len(r) for r in roots), ms, gc0 - gc1))
    print("free heap: gc %d B, idf %d B (largest block %d B)"
          % (gc1, idf1, idf_free()[1]))

    print()
    print("%-38s %7s %9s %9s" % ("host", "ms", "gc B", "idf B"))
    fails = 0
    times = []
    for host in HOSTS:
        try:
            ms, gcu, idfu = handshake(host)
            times.append(ms)
            print("%-38s %7d %9d %9d" % (host, ms, gcu, idfu))
        except Exception as e:
            fails += 1
            print("%-38s FAIL %r" % (host, e))

    print()
    # A certificate that does not name the host must be refused.
    try:
        handshake("api.github.com", name="wrong-name.example.com")
        print("FAIL: wrong server name was accepted")
        fails += 1
    except _http.TLSError as e:
        print("ok: wrong server name refused (%s)" % e.reason)
    except Exception as e:
        print("?: wrong server name gave %r" % (e,))

    # A full request through the OS helper (the Updates app's first call).
    t0 = time.ticks_ms()
    body = _http.get_url("https://api.github.com/repos/elixpo/falera/tags"
                         "?per_page=1", accept="application/vnd.github+json",
                         timeout_s=10)
    print("get_url api.github.com tags: %s, %d ms"
          % ("%d bytes" % len(body) if body else "FAIL",
             time.ticks_diff(time.ticks_ms(), t0)))
    if not body:
        fails += 1

    gc2, idf2 = heap()
    print()
    if times:
        print("handshake ms: min %d, max %d, mean %d"
              % (min(times), max(times), sum(times) // len(times)))
    print("free heap after: gc %d B, idf %d B" % (gc2, idf2))
    print("last TLS error:", _http.last_tls_error())
    print("RESULT:", "PASS" if not fails else "%d FAILED" % fails)


main()
