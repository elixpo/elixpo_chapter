"""Data collection for the About app.

Everything here is split into small steps so the app can show the cached
values instantly and refresh one step per frame. Every probe is guarded:
a missing module or a failing call yields "-" instead of an exception.
"""

import gc
import sys
import time

CACHE_PATH = "apps/about/cache.txt"

OTA_LABELS = {
    "up-to-date":      "up to date",
    "downloading":     "downloading...",
    "ready":           "ready to install",
    "download-failed": "fetch failed",
}


def fmt_size(n):
    """Bytes to a short human string: 812 kB, 3.4 MB."""
    try:
        n = int(n)
    except (TypeError, ValueError):
        return "-"
    if n < 1024 * 1024:
        return "%d kB" % (n // 1024)
    tenths = n * 10 // (1024 * 1024)
    return "%d.%d MB" % (tenths // 10, tenths % 10)


def fmt_uptime(secs):
    secs = max(0, int(secs))
    d = secs // 86400
    h = (secs % 86400) // 3600
    m = (secs % 3600) // 60
    s = secs % 60
    if d:
        return "%dd %02d:%02d:%02d" % (d, h, m, s)
    return "%02d:%02d:%02d" % (h, m, s)


def fmt_mac(raw):
    try:
        return ":".join("%02X" % b for b in raw)
    except Exception:
        return "-"


def uptime_s():
    # ticks_ms wraps after ~12 days; good enough for a status line.
    return time.ticks_ms() // 1000


def mem_line():
    free = gc.mem_free()
    try:
        used = gc.mem_alloc()
        return "%s free / %s" % (fmt_size(free), fmt_size(free + used))
    except Exception:
        return fmt_size(free) + " free"


# ── refresh steps: each returns a dict of row values ─────────────────────

def step_os(os_):
    out = {}
    try:
        from oreoOS import config
        out["version"] = config.VERSION
        out["released"] = getattr(config, "RELEASE_DATE", "-")
    except Exception:
        out["version"] = "v?.?.?"
        out["released"] = "-"
    status = None
    try:
        status = os_.settings_get("ota_status", None)
    except Exception:
        pass
    out["update"] = OTA_LABELS.get(status, "-") if status else "-"
    try:
        v = sys.implementation.version
        out["runtime"] = "MicroPython %d.%d.%d" % (v[0], v[1], v[2])
    except Exception:
        out["runtime"] = "MicroPython"
    return out


def step_hw():
    out = {"board": "ESP32-S3 N16R8"}
    try:
        import machine
        out["cpu"] = "%d MHz" % (machine.freq() // 1000000)
    except Exception:
        out["cpu"] = "-"
    try:
        import os
        st = os.statvfs("/")
        total = st[0] * st[2]
        free = st[0] * st[3]
        out["flash"] = "%s free / %s" % (fmt_size(free), fmt_size(total))
    except Exception:
        out["flash"] = "-"
    return out


def step_net():
    out = {"ip": "-", "ssid": "-", "mac": "-"}
    try:
        from oreoWare import wifi
        if wifi.is_connected():
            out["ip"] = wifi.ip() or "-"
            out["ssid"] = wifi.ssid() or "-"
        else:
            out["ssid"] = "not connected"
    except Exception:
        pass
    try:
        import network
        out["mac"] = fmt_mac(network.WLAN(network.STA_IF).config("mac"))
    except Exception:
        pass
    return out
