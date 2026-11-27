"""WiFi manager for the Falera Badge.

Saved networks live in `/wifi.json` on flash — a user-editable list
maintained by the WiFi settings app:

    [
      {"ssid": "Home",   "password": "...", "priority": 1, "metered": false},
      {"ssid": "Hotspot","password": "...", "priority": 5, "metered": true}
    ]

Two sources can populate that list:
  • `secrets.WIFI_NETWORKS` (from `.env` via `tools/deploy.py`) — a
    list of {ssid, password, priority, metered} dicts. On every boot
    `connect_from_config()` merges this list into `/wifi.json`,
    refreshing passwords + priorities and adding any new entries
    without touching user-added networks. Edit `.env`, redeploy,
    new networks are live.
  • The on-device Settings → WiFi → Networks page — `add_saved()` /
    `remove_saved()` write the same json directly.

`.env` format is parallel CSV — first SSID matches first password:

    WIFI_SSID=home_net,elixpo_srv,office
    WIFI_PASSWORD=homepass,srvpass,officepass

`connect_from_config()` walks the merged list in ascending-priority
order (lower number = tried first) and stops on the first SSID that
associates.

Usage:
    from oreoWare import wifi
    wifi.connect_from_config()        # auto-pick best saved network
    wifi.is_connected()
    wifi.list_saved()                 # for the settings UI
    wifi.add_saved(ssid, pw, priority=10, metered=False)
    wifi.remove_saved(ssid)
    wifi.is_metered()                 # current link metered?

Non-blocking API (FaleraOS 2.0). Nothing below ever waits for the radio;
callers poll from their update()/run-loop tick instead:

    wifi.scan_start()                 # background scan (own thread)
    wifi.scan_poll()                  # "busy" | "done" | "error" | "idle"
    wifi.nearby()                     # last scan, strongest first; falls
                                      # back to /wifi_seen.json from an
                                      # earlier scan so UIs paint instantly
    wifi.connect_begin(ssid, pw)      # starts association, returns at once
    wifi.connect_poll()               # CONN_* result string
    wifi.auto_begin() / auto_tick()   # boot auto-connect state machine

Diagnostics (REPL): wifi.debug_dump() prints a ring buffer of scan / join
/ auto-connect transitions with the driver's status codes; wifi.diag()
returns a snapshot of the radio state. Passwords are never logged.
"""

import network
import time

try:
    import json as _json
except ImportError:
    _json = None

try:
    import os as _os
except ImportError:
    _os = None

_wlan = None

_SAVED_PATH       = "/wifi.json"
_PER_NET_TIMEOUT  = 10000   


def _get_wlan():
    global _wlan
    if _wlan is None:
        _wlan = network.WLAN(network.STA_IF)
    return _wlan


def _apply_power_cap(wlan):
    """Apply the secrets-baked TX-power dBm cap + power-save mode.

    Done as a best-effort: every `wlan.config(...)` call is wrapped in
    try/except so older / minimal MicroPython builds without one of these
    keys don't kill WiFi entirely.
    """
    try:
        from secrets import WIFI_TX_DBM
        try:
            wlan.config(txpower=int(WIFI_TX_DBM))
        except Exception:
            pass
    except Exception:
        pass
    try:
        from secrets import WIFI_POWERSAVE
        if WIFI_POWERSAVE:
            try:
                wlan.config(pm=wlan.PM_POWERSAVE)
            except Exception:
                pass
    except Exception:
        pass


MDNS_HOSTNAME = "falera"


_hostname_applied        = False     # per-WLAN dhcp_hostname / hostname
_global_hostname_applied = False     # network.hostname() (mDNS)


def _apply_global_hostname():
    """Set the global network hostname BEFORE `wlan.active(True)`.

    This is the one that actually drives the ESP-IDF mDNS responder
    — once `network.hostname("falera")` is set and the interface comes
    up, IDF auto-advertises `oreo.local` to the LAN. Setting it
    AFTER active(True) is a no-op on most builds because the mDNS
    service is already configured by then.

    The earlier worry that this call leaves the radio in a half-
    initialised state was misplaced — the actual culprit was IDF
    auto-connecting from cached NVS credentials, which we now
    cancel with wlan.disconnect() in connect(). Calling
    network.hostname() before any radio activity is safe.
    """
    global _global_hostname_applied
    if _global_hostname_applied:
        return
    try:
        import network as _net
        if hasattr(_net, "hostname"):
            _net.hostname(MDNS_HOSTNAME)
            _global_hostname_applied = True
    except Exception as e:
        # Older build without network.hostname() — fall through; the
        # per-WLAN dhcp_hostname applied later still gets us into the
        # router's DHCP-snooping resolver on most home gateways.
        try: print("[wifi] network.hostname() failed:", e)
        except Exception: pass


def _apply_hostname(wlan):
    """Per-WLAN hostname config (`dhcp_hostname` / `hostname`).
    Called AFTER active+disconnect so the radio is stable. The
    global mDNS broadcast was already configured by
    `_apply_global_hostname()` before active(True) — this is the
    secondary "tell the router via DHCP Option 12" path.
    """
    global _hostname_applied
    if _hostname_applied:
        return
    for key in ("dhcp_hostname", "hostname"):
        try:
            wlan.config(**{key: MDNS_HOSTNAME})
            _hostname_applied = True
        except Exception:
            pass


def radio_on():
    """Power up the radio without trying to associate. Lets the user
    flip WiFi 'on' from the Settings page even when no saved network
    is reachable — keeps the toggle from feeling broken when the
    badge is somewhere with no known WiFi nearby."""
    try:
        wlan = _get_wlan()
        wlan.active(True)
        return True
    except Exception:
        return False


def radio_off():
    """Power the radio fully down. Releases any active connection
    cleanly and saves the ~70 mA the WiFi MAC pulls in idle. Pairs
    with `radio_on()` so a UI toggle has a real on/off semantic.

    Also stops a pending non-blocking join and the boot auto-connect
    machine; otherwise the next auto_tick() would call connect_begin()
    or scan_start(), both of which power the radio straight back on."""
    global _auto_state, _auto_refresh, _conn_ssid, _conn_result, _link_ssid
    _auto_state   = AUTO_OFF
    _auto_refresh = False
    _conn_ssid    = None
    _conn_result  = CONN_IDLE
    _link_ssid    = None
    _dbg("radio off")
    try:
        wlan = _get_wlan()
        try: wlan.disconnect()
        except Exception: pass
        try: wlan.active(False)
        except Exception: pass
        return True
    except Exception:
        return False


def is_radio_on():
    """True iff the WiFi MAC is powered up. Distinct from
    `is_connected()`, which only flips true after a full association.
    UI 'WiFi: ON/OFF' should track this — association state is a
    sub-label on the same row."""
    try:
        return bool(_get_wlan().active())
    except Exception:
        return False


def connect(ssid, password, timeout_ms=6000, pump_cb=None):
    """Initiate a WiFi association and wait (up to `timeout_ms`) for it
    to complete.

    On ESP32-S3, IDF auto-starts a connect attempt with its own
    NVS-cached credentials the moment `wlan.active(True)` is called.
    If we don't cancel that first, every subsequent `wlan.config()`
    or `wlan.connect()` returns `Wifi Internal State Error` because
    IDF thinks "sta is already connecting". We unconditionally
    `wlan.disconnect()` + sleep briefly to flush that state before
    doing any config of our own.

    `pump_cb` is the escape-hatch from the "badge looks frozen during
    SEARCH" trap: the wait loop calls it ~12 times per second and
    bails immediately if it returns truthy.
    """
    global _link_ssid
    wlan = _get_wlan()
    # Set the global hostname BEFORE bringing the radio up. The mDNS
    # responder in ESP-IDF reads it during interface init; setting
    # it later doesn't change the already-broadcast service record.
    # This is the single most important line for `oreo.local` to
    # actually resolve on the LAN.
    _apply_global_hostname()
    try:
        wlan.active(True)
    except Exception as e:
        print("[wifi] active(True) raised:", e)
        return False
    # Cancel any in-flight connect IDF kicked off on active(True). This
    # is the single most important line in this function on ESP32 —
    # without it the next wlan.config()/wlan.connect() returns "sta is
    # connecting, cannot set config" and the radio never associates to
    # the credentials we actually want.
    _link_ssid = None
    try:
        wlan.disconnect()
    except Exception:
        pass
    # Tiny settle window so the disconnect propagates inside the
    # IDF state machine before we issue the new connect. 50 ms is
    # enough on every build we've tested.
    time.sleep_ms(50)
    try:
        _apply_hostname(wlan)
    except Exception:
        pass
    try:
        _apply_power_cap(wlan)
    except Exception:
        pass
    try:
        if wlan.isconnected() and wlan.config("essid") == ssid:
            return True
    except Exception:
        pass
    try:
        wlan.connect(ssid, password)
    except Exception as e:
        print("[wifi] wlan.connect raised:", e)
        return False
    start = time.ticks_ms()
    while not wlan.isconnected():
        if time.ticks_diff(time.ticks_ms(), start) > timeout_ms:
            # The driver retries forever by default; left running it holds
            # the radio in "connecting" and every later scan() comes back
            # empty (MicroPython 1.28 swallows the IDF refusal).
            _dbg("legacy connect timeout st=%s" % _status_name(_safe_status(wlan)))
            try:
                wlan.disconnect()
            except Exception:
                pass
            return False
        # Pump first so the very-first frame of "searching..." can be
        # cancelled. Sleep duration is intentionally short (~80 ms) so
        # button-to-cancel feels instant, but long enough that we don't
        # eat all the CPU we're trying to keep available.
        if pump_cb:
            try:
                if pump_cb():
                    print("[wifi] connect cancelled by pump_cb")
                    try:
                        wlan.disconnect()
                    except Exception:
                        pass
                    return False
            except Exception:
                pass
        time.sleep_ms(80)
    # Established: let the driver recover short drops on its own (a
    # previous connect_begin() may have left the retries bounded).
    _set_reconnects(wlan, -1)
    _link_ssid = ssid
    try:
        _apply_power_cap(wlan)
    except Exception:
        pass
    return True


def _exists(path):
    if _os is None:
        return False
    try:
        _os.stat(path)
        return True
    except OSError:
        return False


def _load_saved_raw():
    """Read `/wifi.json` as a Python list. Returns [] on missing/bad
    file — the caller is expected to bootstrap from secrets if so."""
    if _json is None or not _exists(_SAVED_PATH):
        return []
    try:
        with open(_SAVED_PATH) as f:
            data = _json.loads(f.read())
        if not isinstance(data, list):
            return []
        return data
    except Exception:
        return []


def _save_raw(networks):
    if _json is None:
        return False
    try:
        with open(_SAVED_PATH, "w") as f:
            f.write(_json.dumps(networks))
        return True
    except Exception:
        return False


def _secrets_networks():
    """Read the canonical list of deploy-time networks from secrets.py.

    Modern secrets.py (generated by `tools/deploy.py`) ships
    WIFI_NETWORKS as a list of {ssid, password, priority, metered}
    dicts. Older builds only have the singular WIFI_SSID / WIFI_PASSWORD
    pair; we wrap that into a one-entry list so callers don't care.
    Returns [] when nothing is configured.
    """
    try:
        import secrets
    except Exception:
        return []
    nets = getattr(secrets, "WIFI_NETWORKS", None)
    if isinstance(nets, (list, tuple)) and nets:
        return [dict(n) for n in nets if isinstance(n, dict) and n.get("ssid")]
    # Legacy fallback: just the first pair.
    ssid = getattr(secrets, "WIFI_SSID", "")
    pw   = getattr(secrets, "WIFI_PASSWORD", "")
    if ssid:
        return [{"ssid": ssid, "password": pw, "priority": 1, "metered": False}]
    return []


def _sync_secrets_into_saved():
    """Merge the deploy-time WIFI_NETWORKS list into /wifi.json.

    Called once per boot from connect_from_config(). Semantics:
      • Every secrets network is ENSURED to be in /wifi.json. If
        present already (matched by SSID), its priority is refreshed
        and its password is refreshed ONLY when the new password is
        non-empty — that protects a previously-working credential
        from being clobbered if the user trims their .env (e.g.
        adds a new SSID slot but doesn't add the matching
        WIFI_PASSWORD entry).
      • Networks the user added on-device that are NOT in secrets
        are preserved as-is.
      • If /wifi.json doesn't exist yet, this acts as the initial
        bootstrap (replaces the old _bootstrap_from_secrets path).
    """
    secret_nets = _secrets_networks()
    if not secret_nets:
        return
    saved = _load_saved_raw() or []
    by_ssid = {n.get("ssid", ""): n for n in saved if n.get("ssid")}
    changed   = False
    added     = 0
    refreshed = 0
    for s in secret_nets:
        ssid = s.get("ssid", "")
        if not ssid:
            continue
        existing = by_ssid.get(ssid)
        if existing is None:
            saved.append({
                "ssid":     ssid,
                "password": s.get("password", ""),
                "priority": int(s.get("priority", 10)),
                "metered":  bool(s.get("metered", False)),
            })
            changed = True
            added  += 1
            continue
        # Existing entry — refresh priority unconditionally, password
        # only if the new value is non-empty.
        new_pri = int(s.get("priority", existing.get("priority", 10)))
        new_pw  = s.get("password", "") or ""
        local_changed = False
        if int(existing.get("priority", 99)) != new_pri:
            existing["priority"] = new_pri
            local_changed = True
        if new_pw and existing.get("password") != new_pw:
            existing["password"] = new_pw
            local_changed = True
        if local_changed:
            changed    = True
            refreshed += 1
    if changed:
        _save_raw(saved)
        print("[wifi] secrets sync: +%d new, %d refreshed (of %d)" %
              (added, refreshed, len(secret_nets)))


def _bootstrap_from_secrets():
    """Compat shim — older code paths call this. Delegates to the
    sync logic and then returns the freshly-loaded list."""
    _sync_secrets_into_saved()
    return _load_saved_raw()


def list_saved():
    """Return the saved-networks list, sorted by ascending priority.
    Caller gets fresh dicts — mutating them doesn't affect on-disk state
    until save_saved() is called."""
    nets = _load_saved_raw() or _bootstrap_from_secrets()
    # Defensive copy + priority sort (None or missing → very high so
    # nameless entries sink to the bottom).
    def _key(n):
        try:
            return int(n.get("priority", 999))
        except Exception:
            return 999
    return sorted([dict(n) for n in nets if n.get("ssid")], key=_key)


def save_saved(networks):
    """Replace the entire saved list. Settings UI uses this after
    add / remove / reorder."""
    return _save_raw(list(networks))


def add_saved(ssid, password, priority=10, metered=False):
    """Add or update a single saved network. Matched by SSID; existing
    entries are overwritten so the user doesn't accumulate duplicates
    if they re-enter the same network. The "last connected" marker
    survives an update so the boot fast path keeps working."""
    nets = _load_saved_raw() or _bootstrap_from_secrets()
    last = False
    out  = []
    for n in nets:
        if n.get("ssid") == ssid:
            last = bool(n.get("last"))
        else:
            out.append(n)
    entry = {
        "ssid":     ssid,
        "password": password or "",
        "priority": int(priority),
        "metered":  bool(metered),
    }
    if last:
        entry["last"] = True
    out.append(entry)
    return _save_raw(out)


def remove_saved(ssid):
    nets = _load_saved_raw()
    out  = [n for n in nets if n.get("ssid") != ssid]
    if len(out) == len(nets):
        return False
    return _save_raw(out)


def set_priority(ssid, priority):
    nets = _load_saved_raw()
    changed = False
    for n in nets:
        if n.get("ssid") == ssid:
            n["priority"] = int(priority)
            changed = True
            break
    if not changed:
        return False
    return _save_raw(nets)


def is_metered():
    """True iff the currently-associated SSID is flagged metered in
    /wifi.json. Used by OTA + Store to back off on tethered/hotspot
    connections so we don't burn the user's data plan."""
    cur = ssid()
    if not cur:
        return False
    for n in _load_saved_raw():
        if n.get("ssid") == cur:
            return bool(n.get("metered"))
    return False


def connect_from_config(pump_cb=None):
    """Try each saved network in priority order until one associates.

    Order of operations:
      0. Merge the .env-defined WIFI_NETWORKS list into /wifi.json
         (ensures every secret network is present + has current
         creds, without clobbering user-added entries).
      1. /wifi.json — the user-managed list, edited via Settings → WiFi.
      2. secrets.py legacy single-pair bootstrap if step 0 produced
         nothing somehow.
      3. Otherwise: return False, radio stays off.

    Per-network timeout is short (_PER_NET_TIMEOUT) so a stale entry
    doesn't stall the boot.
    """
    # Pull deploy-time networks into the on-flash list. Cheap on
    # subsequent calls — only re-writes /wifi.json if something
    # actually changed since the last sync.
    try:
        _sync_secrets_into_saved()
    except Exception as e:
        print("[wifi] secrets sync failed:", e)
    nets = list_saved()
    if not nets:
        # Last-ditch: try the deploy-time secret directly. Without this
        # an empty /wifi.json silently disabled WiFi forever on freshly
        # flashed badges — the toggle on the Status row would call
        # connect_from_config(), find no saved nets, and bail without
        # ever bringing the radio up.
        try:
            import secrets
            ssid_ = getattr(secrets, "WIFI_SSID", "")
            pw    = getattr(secrets, "WIFI_PASSWORD", "")
            if ssid_:
                print("[wifi] no saved nets, falling back to secrets bootstrap")
                # Persist as the new "priority 1" entry so this branch
                # only fires once per device — subsequent connects use
                # the normal path.
                try:
                    add_saved(ssid_, pw, priority=1, metered=False)
                except Exception:
                    pass
                ok = False
                try:
                    ok = connect(ssid_, pw,
                                 timeout_ms=_PER_NET_TIMEOUT,
                                 pump_cb=pump_cb)
                except Exception:
                    pass
                return ok
        except Exception as e:
            print("[wifi] secrets bootstrap failed:", e)
        print("[wifi] no networks configured")
        return False
    for n in nets:
        ssid_ = n.get("ssid") or ""
        if not ssid_:
            continue
        pw = n.get("password") or ""
        try:
            print("[wifi] trying a saved network")
            ok = connect(ssid_, pw,
                         timeout_ms=_PER_NET_TIMEOUT,
                         pump_cb=pump_cb)
        except Exception as e:
            print("[wifi] connect raised:", e)
            ok = False
        if ok:
            print("[wifi] associated")
            return True
        # If the user cancelled mid-search, stop trying further
        # networks — they explicitly asked us to give up. Without
        # this we'd plough through every saved entry honouring their
        # individual timeouts.
        if pump_cb is not None:
            try:
                if pump_cb():
                    print("[wifi] connect_from_config cancelled")
                    return False
            except Exception:
                pass
    print("[wifi] all %d saved networks failed" % len(nets))
    return False


def disconnect():
    global _link_ssid
    _link_ssid = None
    wlan = _get_wlan()
    wlan.disconnect()
    wlan.active(False)


def is_connected():
    try:
        return _get_wlan().isconnected()
    except Exception:
        return False


def ip():
    try:
        wlan = _get_wlan()
        if wlan.isconnected():
            return wlan.ifconfig()[0]
    except Exception:
        pass
    return None


def rssi():
    try:
        return _get_wlan().status("rssi")
    except Exception:
        return None


def ssid():
    """Currently-associated SSID, or None if not connected."""
    try:
        wlan = _get_wlan()
        if wlan.isconnected():
            return wlan.config("essid")
    except Exception:
        pass
    return None


def ping(host="8.8.8.8", port=53, timeout_s=2):
    """TCP-connect "ping" to a known endpoint. MicroPython doesn't ship
    raw ICMP sockets on this port, so we time the TCP handshake to a
    cheap target (Google's DNS on port 53 by default).

    Returns (ok, rtt_ms). `ok=False, rtt_ms=None` on failure.
    """
    try:
        import socket as _s
    except ImportError:
        return (False, None)
    if not is_connected():
        return (False, None)
    try:
        addr = _s.getaddrinfo(host, port)[0][-1]
    except Exception:
        return (False, None)
    sock = _s.socket()
    try:
        sock.settimeout(timeout_s)
    except Exception:
        pass
    t0 = time.ticks_ms()
    try:
        sock.connect(addr)
        rtt = time.ticks_diff(time.ticks_ms(), t0)
        return (True, rtt)
    except Exception:
        return (False, None)
    finally:
        try:
            sock.close()
        except Exception:
            pass


def speed_test(bytes_=200_000, timeout_s=10, pump_cb=None):
    """Throughput probe: download `bytes_` from speed.cloudflare.com
    and report observed kbps.

    `pump_cb` is called between every recv() so the caller can keep
    the OS run loop alive — typically passes a closure that re-reads
    the button matrix and bumps the screen. The socket is set to a
    50-ms recv timeout so each blocked read can't freeze the UI for
    more than that. If pump_cb returns True the test aborts cleanly
    (used by the WiFi app's "cancel by any keypress" UX).

    Default size dropped from 500 KB → 200 KB. The handshake is
    still amortised but the test finishes in ~1–2 s on home WiFi
    and ~5 s on weak links, both well within user attention span.

    Returns (ok, kbps, elapsed_ms). On failure or cancel,
    (False, 0, elapsed).
    """
    try:
        import socket as _s
        from oreoOS._http import tls_wrap as _tls_wrap
    except ImportError:
        return (False, 0, 0)
    if not is_connected():
        return (False, 0, 0)
    host = "speed.cloudflare.com"
    path = "/__down?bytes=%d" % int(bytes_)
    try:
        addr = _s.getaddrinfo(host, 443)[0][-1]
    except Exception:
        return (False, 0, 0)

    raw = None
    s   = None
    deadline = time.ticks_add(time.ticks_ms(), int(timeout_s * 1000))
    t0 = time.ticks_ms()
    received = 0
    body_started = False
    cancelled = False

    # 50 ms recv timeout caps each blocking read so the run loop
    # can resume between reads. This is the difference between
    # "buttons frozen for 5 s" and "buttons responsive throughout".
    PER_READ_S = 0.05

    def _pump():
        """Run the caller's pump callback if any; flag cancel."""
        nonlocal cancelled
        if pump_cb is None:
            return
        try:
            if pump_cb():
                cancelled = True
        except Exception:
            pass

    try:
        raw = _s.socket()
        try: raw.settimeout(timeout_s)   # connect can take a while
        except Exception: pass
        raw.connect(addr)
        s = _tls_wrap(raw, host)
        try: s.settimeout(PER_READ_S)
        except Exception: pass
        req = ("GET %s HTTP/1.1\r\nHost: %s\r\n"
               "User-Agent: FaleraBadge-Speed\r\n"
               "Accept-Encoding: identity\r\n"
               "Connection: close\r\n\r\n") % (path, host)
        s.write(req.encode())
        head = b""
        # Read headers. With the short PER_READ_S timeout each recv
        # bails fast on no-data; we loop until the separator arrives
        # or the overall deadline blows.
        while b"\r\n\r\n" not in head:
            if cancelled:
                break
            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                break
            try:
                chunk = s.read(2048)
            except OSError:
                _pump()
                continue
            except Exception:
                break
            if not chunk:
                break
            head += chunk
            if len(head) > 16 * 1024:
                break
            _pump()
        sep = head.find(b"\r\n\r\n")
        if sep >= 0:
            body_started = True
            received = len(head) - (sep + 4)
        # Drain the body.
        while body_started:
            if cancelled:
                break
            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                break
            try:
                chunk = s.read(4096)
            except OSError:
                _pump()
                continue
            except Exception:
                break
            if not chunk:
                break
            received += len(chunk)
            _pump()
            if received >= bytes_:
                break
    except Exception:
        pass
    finally:
        for h in (s, raw):
            try:
                if h is not None:
                    h.close()
            except Exception:
                pass
    elapsed = max(1, time.ticks_diff(time.ticks_ms(), t0))
    if cancelled:
        return (False, 0, elapsed)
    if received <= 0:
        return (False, 0, elapsed)
    kbps = int((received * 8) // elapsed)   # bytes*8 / ms = kbps
    return (True, kbps, elapsed)


def info():
    """One-shot snapshot for the WiFi detail screen.

    Returns a dict with `connected`, `ssid`, `ip`, `subnet`, `gateway`,
    `dns`, and `rssi`. Missing fields are None — the UI fills with '—'.
    """
    out = {"connected": False, "radio_on": False,
           "ssid": None,    "ip": None,
           "subnet":   None,  "gateway": None, "dns": None,
           "rssi":     None}
    try:
        wlan = _get_wlan()
        try:
            out["radio_on"] = bool(wlan.active())
        except Exception:
            pass
        out["connected"] = bool(wlan.isconnected())
        if out["connected"]:
            cfg = wlan.ifconfig()    # (ip, subnet, gateway, dns)
            out["ip"]      = cfg[0]
            out["subnet"]  = cfg[1]
            out["gateway"] = cfg[2]
            out["dns"]     = cfg[3]
            try:
                out["ssid"] = wlan.config("essid")
            except Exception:
                pass
            try:
                out["rssi"] = wlan.status("rssi")
            except Exception:
                pass
    except Exception:
        pass
    return out


# ── power-mode preset cycling ────────────────────────────────────────────
# A single dial that covers TX dBm + power-save mode together so the user
# doesn't reason about both. Persisted on the OS settings dict so the
# choice survives a reboot.

POWER_MODES = ("off", "eco", "balanced", "max")

_MODE_TX_DBM = {"eco": 5, "balanced": 11, "max": 19}


def set_power_mode(mode):
    """Apply a coherent (tx_dbm, pm) preset to the live radio.

    'off'      → radio down
    'eco'      → 5 dBm, PM_POWERSAVE
    'balanced' → 11 dBm, PM_POWERSAVE (matches existing default)
    'max'      → 19 dBm, PM_NONE
    """
    global _link_ssid
    if mode not in POWER_MODES:
        return False
    wlan = _get_wlan()
    if mode == "off":
        _link_ssid = None
        try:
            wlan.disconnect()
        except Exception:
            pass
        try:
            wlan.active(False)
        except Exception:
            pass
        return True

    try:
        wlan.active(True)
    except Exception:
        return False
    try:
        wlan.config(txpower=_MODE_TX_DBM[mode])
    except Exception:
        pass
    try:
        wlan.config(pm=(wlan.PM_NONE if mode == "max" else wlan.PM_POWERSAVE))
    except Exception:
        pass
    return True


def get_power_mode():
    """Best-effort introspection — returns the current preset name based
    on the active TX-power level and PM mode. Falls back to 'balanced'
    when MicroPython doesn't expose enough config to be sure."""
    try:
        wlan = _get_wlan()
        if not wlan.active():
            return "off"
        try:
            tx = int(wlan.config("txpower"))
        except Exception:
            return "balanced"
        if tx <= 6:
            return "eco"
        if tx >= 17:
            return "max"
        return "balanced"
    except Exception:
        return "balanced"


# ═════════════════════════════════════════════════════════════════════════
# Non-blocking scan / connect / boot auto-connect (FaleraOS 2.0)
# ═════════════════════════════════════════════════════════════════════════
#
# Everything below returns immediately. A scan runs in a short-lived
# `_thread` worker: MicroPython's ESP32 port releases the GIL around
# esp_wifi_scan_start(), so the UI keeps drawing while the radio hops
# channels (~1.5-2.5 s). Builds without `_thread` fall back to a
# synchronous scan, which costs one ~2 s hitch but is otherwise identical.
#
# The worker only touches `_scan_raw` / `_scan_err` / `_scan_busy`; all
# parsing, flash writes and state changes happen on the main thread in
# scan_poll(). Each scan carries a generation number so a worker that was
# abandoned (scan_poll timeout) can never publish into a later scan.
#
# How the MicroPython 1.28 ESP32 driver behaves (ports/esp32/network_wlan.c),
# which everything here is written against:
#
#   • wlan.scan() does NOT raise when IDF refuses to scan (for example
#     ESP_ERR_WIFI_STATE while the STA is connecting or retrying): it
#     returns an empty list. An empty scan is therefore "maybe refused",
#     not "nothing nearby".
#   • wlan.status() returns NO_AP_FOUND (201/210/211/212) and AUTH_FAIL
#     (202, also used for CONNECTION_FAIL 205) as soon as one attempt
#     fails, even while the driver is still retrying, and keeps returning
#     it until the next disconnect event or GOT_IP. A new connect() does
#     not clear it.
#   • Every other failure reason (4-way handshake timeout 15, handshake
#     timeout 204, assoc fail 203, ...) is hidden behind STAT_CONNECTING
#     until the configured reconnects are used up. The default is to retry
#     forever, so with defaults a wrong password usually never shows up.
#   • After our own wlan.disconnect() the reason becomes ASSOC_LEAVE (8),
#     which status() reports as STAT_IDLE (1000), during the next join too.
#   • wlan.config(reconnects=n) means n retries after the first attempt;
#     -1 restores "retry forever".

_SEEN_PATH     = "/wifi_seen.json"
_SEEN_MAX      = 16          # networks remembered from the last scan
_SCAN_TIMEOUT  = 8000        # ms; a worker that never reports is abandoned
_SCAN_TRIES    = 2           # an empty / refused scan is retried once
_SCAN_RETRY_MS = 300

# Association results returned by connect_poll().
CONN_IDLE     = "idle"
CONN_BUSY     = "connecting"
CONN_OK       = "ok"
CONN_BAD_PW   = "bad_password"
CONN_NO_AP    = "not_found"
CONN_TIMEOUT  = "timeout"
CONN_FAIL     = "failed"

# Driver status codes (network.STAT_* and IDF disconnect reasons on the
# ESP32 port). Hard-coded so the classifier also works on the host and on
# builds that do not export every constant.
_STAT_IDLE       = 1000
_STAT_CONNECTING = 1001
_STAT_GOT_IP     = 1010
_ST_NO_AP     = (201, 210, 211, 212)    # NO_AP_FOUND (+ threshold variants)
_ST_BAD_PW    = (202, 15, 204)          # AUTH_FAIL / 4-way handshake timeout
_ST_NEUTRAL   = (0, 8, _STAT_IDLE, _STAT_CONNECTING, _STAT_GOT_IP)
# Codes status() reports while the driver may still be retrying; only
# these need to persist before they count (see connect_poll()).
_ST_EARLY     = _ST_NO_AP + (202,)
_BAD_HOLD_MS  = 2500                    # an early code must persist this long
_JOIN_RECONNECTS = 1                    # driver retries per join (2 attempts)
_JOIN_TIMEOUT    = 15000

_STAT_NAMES = {
    0: "NONE", 2: "AUTH_EXPIRE", 3: "AUTH_LEAVE", 4: "ASSOC_EXPIRE",
    8: "ASSOC_LEAVE", 15: "4WAY_HANDSHAKE_TIMEOUT", 200: "BEACON_TIMEOUT",
    201: "NO_AP_FOUND", 202: "AUTH_FAIL", 203: "ASSOC_FAIL",
    204: "HANDSHAKE_TIMEOUT", 205: "CONNECTION_FAIL",
    210: "NO_AP_FOUND_W_COMPATIBLE_SECURITY",
    211: "NO_AP_FOUND_IN_AUTHMODE_THRESHOLD",
    212: "NO_AP_FOUND_IN_RSSI_THRESHOLD",
    1000: "IDLE", 1001: "CONNECTING", 1010: "GOT_IP",
}

_scan_busy    = False
_scan_raw     = None
_scan_err     = None
_scan_t0      = 0
_scan_gen     = 0            # bumps on every scan_start()
_scan_seq     = 0            # bumps on every completed scan
_nearby       = None         # parsed list from the most recent scan
_nearby_live  = False        # True once a scan finished this boot


def _now():
    return time.ticks_ms()


# ── diagnostics ring buffer ─────────────────────────────────────────────
#
# A fixed ring of (ticks_ms, text) entries for state transitions and
# driver status codes. Nothing is recorded while idle; connect_poll()
# only records a status code when it changes. Passwords are never
# recorded (only whether one was given). From the REPL:
#
#     >>> from oreoWare import wifi
#     >>> wifi.debug_dump()          # print the log, oldest first
#     >>> wifi.diag()                # one-shot snapshot of driver state

_DBG_N   = 48
_dbg_buf = [None] * _DBG_N
_dbg_i   = 0


def _dbg(msg):
    global _dbg_i
    try:
        _dbg_buf[_dbg_i % _DBG_N] = (time.ticks_ms(), msg)
        _dbg_i += 1
    except Exception:
        pass


def debug_log():
    """The diagnostics ring as a list of "t=<ms> <event>" strings, oldest
    first. Safe to call at any time; never contains a password."""
    out = []
    n = _dbg_i
    start = n - _DBG_N if n > _DBG_N else 0
    for k in range(start, n):
        e = _dbg_buf[k % _DBG_N]
        if e is not None:
            out.append("t=%d %s" % (e[0], e[1]))
    return out


def debug_dump():
    for line in debug_log():
        print(line)


def debug_clear():
    global _dbg_i
    for k in range(_DBG_N):
        _dbg_buf[k] = None
    _dbg_i = 0


def _status_name(code):
    try:
        return "%d:%s" % (code, _STAT_NAMES.get(code, "?"))
    except Exception:
        return str(code)


def status_name(code):
    """Readable name for a wlan.status() code, e.g. "202:AUTH_FAIL"."""
    return _status_name(code)


def _safe_status(wlan):
    try:
        return wlan.status()
    except Exception:
        return None


def diag():
    """Snapshot of the radio and of this module's state machines, for the
    REPL and the CLI. Reads only; never touches the radio."""
    out = {"active": None, "connected": None, "status": None,
           "reconnects": None, "joining": _conn_ssid,
           "conn_result": _conn_result, "last_code": _conn_last_code,
           "auto": _auto_state, "scan_busy": _scan_busy,
           "scan_err": _scan_err, "scan_seq": _scan_seq,
           "nearby": len(_nearby) if _nearby is not None else None,
           "link_seq": _link_seq}
    try:
        wlan = _get_wlan()
        try:
            out["active"] = bool(wlan.active())
        except Exception:
            pass
        try:
            out["connected"] = bool(wlan.isconnected())
        except Exception:
            pass
        st = _safe_status(wlan)
        out["status"] = _status_name(st) if st is not None else None
        try:
            out["reconnects"] = wlan.config("reconnects")
        except Exception:
            pass
    except Exception:
        pass
    return out


def _set_reconnects(wlan, n):
    try:
        wlan.config(reconnects=n)
        return True
    except Exception as e:
        _dbg("config reconnects=%d failed: %s" % (n, e))
        return False


def _decode_ssid(raw):
    """Scan SSIDs are bytes and may not be valid UTF-8. Never raise."""
    if isinstance(raw, str):
        return raw
    try:
        return raw.decode("utf-8")
    except Exception:
        return "".join(chr(b) if 32 <= b < 127 else "?" for b in raw)


def parse_scan(raw, limit=_SEEN_MAX):
    """wlan.scan() tuples -> [{ssid, rssi, secure, ch}], strongest first.

    Hidden networks (empty SSID) are dropped and an SSID broadcast by
    several access points is kept once, with its strongest signal.
    Pure function: host-tested in tests/test_wifi_logic.py.
    """
    best = {}
    for r in raw or ():
        try:
            ssid = _decode_ssid(r[0])
            rssi = int(r[3])
            auth = int(r[4])
            ch   = int(r[2])
        except Exception:
            continue
        if not ssid:
            continue
        cur = best.get(ssid)
        if cur is None or rssi > cur["rssi"]:
            best[ssid] = {"ssid": ssid, "rssi": rssi,
                          "secure": auth != 0, "ch": ch}
    out = sorted(best.values(), key=lambda n: -n["rssi"])
    return out[:limit]


def signal_level(rssi):
    """RSSI (dBm) -> 0..4 bars. Same thresholds the WiFi app always used."""
    if rssi is None:
        return 0
    if rssi >= -50:
        return 4
    if rssi >= -65:
        return 3
    if rssi >= -75:
        return 2
    if rssi >= -85:
        return 1
    return 0


def classify_status(code):
    """wlan.status() -> CONN_BAD_PW / CONN_NO_AP / CONN_FAIL, or None
    (still trying, idle, connected, or not a number).

    Any other numeric disconnect reason (assoc fail, beacon timeout,
    auth expired, ...) is CONN_FAIL. ASSOC_LEAVE (8) is our own
    disconnect() and is never a failure."""
    try:
        code = int(code)
    except Exception:
        return None
    if code in _ST_BAD_PW:
        return CONN_BAD_PW
    if code in _ST_NO_AP:
        return CONN_NO_AP
    if code in _ST_NEUTRAL:
        return None
    return CONN_FAIL


def pick_candidates(saved, visible, exclude=()):
    """Saved networks worth trying, best first.

    With a scan in hand only networks that are actually on the air are
    returned, ordered by (priority, strongest signal). Without one
    (`visible` is None, e.g. the scan failed) every saved network is
    returned in priority order so the badge still tries something.
    """
    def _pri(n):
        try:
            return int(n.get("priority", 999))
        except Exception:
            return 999
    if visible is None:
        nets = [n for n in saved
                if n.get("ssid") and n.get("ssid") not in exclude]
        return sorted(nets, key=_pri)
    rssi = {}
    for v in visible:
        rssi[v["ssid"]] = v["rssi"]
    nets = [n for n in saved
            if n.get("ssid") in rssi and n.get("ssid") not in exclude]
    return sorted(nets, key=lambda n: (_pri(n), -rssi[n["ssid"]]))


def _scan_worker(gen):
    """Runs wlan.scan() (in the worker thread when there is one).

    MicroPython 1.28 turns an IDF refusal into an empty list, so an empty
    result is retried once. Before the retry, a driver retry loop that
    nothing here owns (e.g. left over from a join made outside this
    module) is stopped. It is left alone when a join is in progress
    (connect_poll() owns the radio then), when the link is up, and when
    an established link has dropped and the driver is bringing it back:
    stopping that would end the recovery for good, since nothing restarts
    it. While joining or recovering, an empty result is reported as busy
    rather than as "nothing around", so callers keep the list they have."""
    global _scan_raw, _scan_err, _scan_busy
    res = None
    err = None
    joining = False
    recovering = False
    try:
        wlan = _get_wlan()
        for attempt in range(_SCAN_TRIES):
            try:
                res = wlan.scan()
                err = None
            except OSError as e:
                res = None
                err = str(e) or "scan failed"
            if res or gen != _scan_gen or attempt + 1 >= _SCAN_TRIES:
                break
            joining = _conn_ssid is not None
            try:
                up = wlan.isconnected()
            except Exception:
                up = False
            # Link we established is down and the driver is retrying it.
            recovering = not up and not joining and _link_ssid is not None
            if not up and not joining and not recovering:
                _dbg("scan empty/refused (%s), stopping driver retries"
                     % (err or "0 results"))
                try:
                    wlan.disconnect()
                except Exception:
                    pass
            else:
                _dbg("scan empty/refused (%s), retrying" % (err or "0 results"))
            time.sleep_ms(_SCAN_RETRY_MS)
        if not res and res is not None and (joining or _conn_ssid is not None):
            # Empty because a join holds the radio, not because nothing
            # is around: report it so callers keep the list they have.
            res = None
            err = "radio busy joining"
        elif not res and res is not None and recovering:
            res = None
            err = "radio busy reconnecting"
    except Exception as e:
        res = None
        err = str(e) or "scan failed"
    if gen != _scan_gen:
        _dbg("abandoned scan #%d finished late" % gen)
        return
    if res is None:
        _scan_err = err or "scan failed"
    else:
        _scan_raw = res
    _scan_busy = False


def scan_start():
    """Start a background scan. Returns True if one is running now."""
    global _scan_busy, _scan_raw, _scan_err, _scan_t0, _scan_gen
    if _scan_busy:
        return True
    try:
        _apply_global_hostname()
        wlan = _get_wlan()
        if not wlan.active():
            wlan.active(True)
    except Exception as e:
        _scan_err = str(e) or "radio error"
        _dbg("scan_start radio error: %s" % _scan_err)
        return False
    _scan_gen += 1
    gen = _scan_gen
    _scan_err_logged[0] = None
    _scan_raw  = None
    _scan_err  = None
    _scan_busy = True
    _scan_t0   = _now()
    _dbg("scan #%d start%s" % (gen, " (joining)" if _conn_ssid else ""))
    try:
        import _thread
        _thread.start_new_thread(_scan_worker, (gen,))
    except Exception:
        _scan_worker(gen)        # no threads: synchronous fallback
    return True


def scan_busy():
    return _scan_busy


def scan_seq():
    """Counter that increases each time fresh scan results land."""
    return _scan_seq


def scan_error():
    return _scan_err


def scan_elapsed_ms():
    if not _scan_busy:
        return 0
    return time.ticks_diff(_now(), _scan_t0)


def scan_poll():
    """Collect a finished scan. Main thread only. Returns "busy",
    "done" (fresh results just landed), "error" or "idle"."""
    global _scan_raw, _scan_busy, _scan_err, _scan_seq, _nearby, _nearby_live
    global _scan_gen
    if _scan_busy:
        if time.ticks_diff(_now(), _scan_t0) > _SCAN_TIMEOUT:
            # Worker wedged; abandon it. Bumping the generation makes
            # sure its late result can never land in a later scan.
            _scan_gen += 1
            _scan_busy = False
            _scan_err  = "scan timed out"
            _dbg("scan timed out, worker abandoned")
            return "error"
        return "busy"
    raw = _scan_raw
    if raw is not None:
        _scan_raw    = None
        _nearby      = parse_scan(raw)
        _nearby_live = True
        _scan_seq   += 1
        _dbg("scan done: %d raw, %d listed" % (len(raw), len(_nearby)))
        if _nearby:
            _save_seen(_nearby)
        return "done"
    if _scan_err:
        if _scan_err != _scan_err_logged[0]:
            _scan_err_logged[0] = _scan_err
            _dbg("scan error: %s" % _scan_err)
        return "error"
    return "idle"


_scan_err_logged = [None]


def nearby():
    """Networks from the most recent scan (this boot), else the list
    remembered on flash from an earlier one. Strongest first."""
    global _nearby
    if _nearby is None:
        _nearby = _load_seen()
    return _nearby


def nearby_is_live():
    """False while nearby() is still showing the remembered list."""
    return _nearby_live


def _load_seen():
    if _json is None or not _exists(_SEEN_PATH):
        return []
    try:
        with open(_SEEN_PATH) as f:
            data = _json.loads(f.read())
        if isinstance(data, list):
            return [d for d in data if isinstance(d, dict) and d.get("ssid")]
    except Exception:
        pass
    return []


_seen_sig = None


def _save_seen(nets):
    """Persist the scan so the next boot's Settings page paints
    instantly. Only rewritten when the set of SSIDs changes, so the
    flash is not worn by every periodic scan."""
    global _seen_sig
    if _json is None:
        return
    sig = ",".join(sorted(n["ssid"] for n in nets))
    if _seen_sig is None:
        _seen_sig = ",".join(sorted(n.get("ssid", "") for n in _load_seen()))
    if sig == _seen_sig:
        return
    try:
        with open(_SEEN_PATH, "w") as f:
            f.write(_json.dumps(
                [{"ssid": n["ssid"], "rssi": n["rssi"],
                  "secure": n["secure"]} for n in nets]))
        _seen_sig = sig
    except Exception:
        pass


def saved_ssids():
    """Set-like dict of saved SSIDs, for "is this network known?" checks."""
    out = {}
    for n in _load_saved_raw():
        s = n.get("ssid")
        if s:
            out[s] = True
    return out


def get_saved(ssid):
    for n in _load_saved_raw():
        if n.get("ssid") == ssid:
            return dict(n)
    return None


def _mark_last(ssid):
    """Remember which network connected so the next boot tries it first
    without scanning. Writes only when the marker moves."""
    nets = _load_saved_raw()
    changed = False
    for n in nets:
        want = n.get("ssid") == ssid
        if bool(n.get("last")) != want:
            if want:
                n["last"] = True
            else:
                n.pop("last", None)
            changed = True
    if changed:
        _save_raw(nets)


def last_connected(saved=None):
    """The saved entry that connected most recently, or None."""
    for n in (saved if saved is not None else _load_saved_raw()):
        if n.get("last") and n.get("ssid"):
            return n
    return None


# ── non-blocking association ────────────────────────────────────────────

_conn_ssid      = None
_conn_t0        = 0
_conn_timeout   = _JOIN_TIMEOUT
_conn_bad       = None     # early failure class currently held
_conn_bad_t0    = 0
_conn_stale     = None     # failure code left over from an earlier attempt
_conn_result    = CONN_IDLE
_conn_code      = None     # last status code seen by connect_poll()
_conn_last_code = None     # status code at the end of the last attempt
_link_seq       = 0        # bumps every time a join succeeds
_link_ssid      = None     # network we joined and want the driver to keep;
                           # cleared by every deliberate disconnect


def connect_timeout_ms():
    """Timeout of the join in progress (or the default), for progress bars."""
    return _conn_timeout


def connect_last_code():
    """Raw wlan.status() code the last finished join ended on, or None."""
    return _conn_last_code


def link_seq():
    """Counter that bumps every time connect_poll() reports CONN_OK, from
    any caller (boot auto-connect or a manual join). Lets background work
    (time sync, keep-alive) notice a new link without owning the join."""
    return _link_seq


def connect_begin(ssid, password, timeout_ms=_JOIN_TIMEOUT):
    """Start associating with `ssid` and return at once. Poll
    connect_poll() for the outcome. The password is never printed."""
    global _conn_ssid, _conn_t0, _conn_timeout, _conn_bad, _conn_result
    global _conn_stale, _conn_code, _conn_last_code, _link_ssid
    if not ssid:
        _conn_result = CONN_FAIL
        return False
    _dbg("join %r begin (pw=%s, scan_busy=%s)"
         % (ssid, "yes" if password else "no", _scan_busy))
    wlan = _get_wlan()
    _apply_global_hostname()
    # A new attempt: the previous one's code must not be shown for it, and
    # the old link (if any) is being replaced on purpose.
    _conn_last_code = None
    _link_ssid = None
    try:
        wlan.active(True)
        # Same flush as connect(): stop a previous join or retry loop
        # before configuring a new target.
        try:
            wlan.disconnect()
        except Exception:
            pass
        time.sleep_ms(30)
        _apply_hostname(wlan)
        _apply_power_cap(wlan)
        # Bounded retries: with the default (forever) the driver keeps the
        # radio busy, scans come back empty, and handshake failures are
        # never reported (status() stays STAT_CONNECTING).
        _set_reconnects(wlan, _JOIN_RECONNECTS)
        try:
            wlan.connect(ssid, password or "")
        except OSError as e:
            # "Wifi Internal State Error": IDF still busy with the previous
            # attempt or a scan. Give it a moment and try once more.
            _dbg("connect raised %s, retrying once" % e)
            try:
                wlan.disconnect()
            except Exception:
                pass
            time.sleep_ms(150)
            wlan.connect(ssid, password or "")
    except Exception as e:
        print("[wifi] connect_begin failed:", e)
        _dbg("join %r refused: %s" % (ssid, e))
        _conn_ssid   = None
        _conn_result = CONN_FAIL
        _conn_last_code = None
        return False
    # The ESP32 port only overwrites its disconnect reason on the next
    # disconnect event or on GOT_IP, so wlan.status() can keep reporting
    # the previous attempt's AUTH_FAIL / NO_AP_FOUND for the whole of a
    # healthy new handshake. Remember that code and ignore it until the
    # driver reports something else (see connect_poll()).
    code = _safe_status(wlan)
    _conn_stale = code if classify_status(code) else None
    _dbg("join %r started, status %s%s" % (
        ssid, _status_name(code), " (stale)" if _conn_stale else ""))
    print("[wifi] connecting")
    _conn_ssid    = ssid
    _conn_t0      = _now()
    _conn_timeout = int(timeout_ms)
    _conn_bad     = None
    _conn_code    = code
    _conn_result  = CONN_BUSY
    return True


def connect_target():
    """SSID currently being joined, or None."""
    return _conn_ssid


def connect_elapsed_ms():
    if _conn_ssid is None:
        return 0
    return time.ticks_diff(_now(), _conn_t0)


def connect_cancel():
    global _conn_ssid, _conn_result, _link_ssid
    if _conn_ssid is None:
        return
    _dbg("join %r cancelled" % _conn_ssid)
    _conn_ssid = None
    _link_ssid = None
    _conn_result = CONN_IDLE
    try:
        _get_wlan().disconnect()
    except Exception:
        pass


def connect_poll():
    """Advance the association started by connect_begin()."""
    global _conn_ssid, _conn_bad, _conn_bad_t0, _conn_result, _conn_stale
    global _conn_code, _conn_last_code, _link_seq, _link_ssid
    if _conn_ssid is None:
        return _conn_result
    wlan = _get_wlan()
    now  = _now()
    try:
        up = wlan.isconnected()
    except Exception:
        up = False
    if up:
        ssid = _conn_ssid
        _conn_ssid   = None
        _conn_result = CONN_OK
        _conn_last_code = _STAT_GOT_IP
        _link_seq += 1
        _link_ssid = ssid
        # Back to "retry forever" so a short drop of an established link
        # still recovers on its own, as before.
        _set_reconnects(wlan, -1)
        try:
            _apply_power_cap(wlan)
        except Exception:
            pass
        try:
            _mark_last(ssid)
        except Exception:
            pass
        _dbg("join %r ok after %d ms" % (ssid, time.ticks_diff(now, _conn_t0)))
        print("[wifi] associated")
        return CONN_OK
    code = _safe_status(wlan)
    if code != _conn_code:
        _conn_code = code
        _dbg("join status %s" % _status_name(code))
    bad = classify_status(code)
    if bad is not None and _conn_stale is not None and code == _conn_stale:
        # Possibly the previous attempt's reason; only a timeout ends
        # this attempt, and then it is reported as that reason.
        stale_bad, bad = bad, None
    else:
        stale_bad = None
        if code != _conn_stale:
            _conn_stale = None      # driver has moved on: trust new codes
    fail = None
    if bad is None:
        _conn_bad = None
    elif code not in _ST_EARLY:
        # Only reported once the driver's retries are used up: final.
        fail = bad
    elif bad != _conn_bad:
        _conn_bad, _conn_bad_t0 = bad, now
    elif time.ticks_diff(now, _conn_bad_t0) >= _BAD_HOLD_MS:
        fail = bad
    if fail is None and time.ticks_diff(now, _conn_t0) > _conn_timeout:
        fail = _conn_bad or stale_bad or CONN_TIMEOUT
    if fail is None:
        return CONN_BUSY
    print("[wifi] connect failed: %s" % fail)
    _dbg("join %r failed: %s (status %s, %d ms)" % (
        _conn_ssid, fail, _status_name(code), time.ticks_diff(now, _conn_t0)))
    _conn_ssid   = None
    _conn_result = fail
    _conn_last_code = code
    try:
        wlan.disconnect()       # stop the driver's retry loop
    except Exception:
        pass
    return fail


# ── boot auto-connect state machine ─────────────────────────────────────
#
#   auto_begin()  — returns immediately. Fast path: if a saved network
#                   connected last time, start joining it with no scan.
#                   Otherwise start a background scan first.
#   auto_tick()   — call every frame (cheap: rate-limited). Returns True
#                   exactly once, on the tick the badge gets an IP, so the
#                   caller can start the HTTP server / NTP sync.
#
# After connecting, one background scan refreshes the nearby list (and
# /wifi_seen.json) so Settings shows nearby networks immediately. It waits
# _REFRESH_DELAY_MS so it does not take the radio off-channel while the
# first requests on the new link (time sync, App Store) run. When no saved
# network is in range, the scan still runs and its results are kept.

AUTO_OFF   = "off"
AUTO_TRY   = "connecting"
AUTO_SCAN  = "scanning"
AUTO_DONE  = "connected"
AUTO_FAIL  = "no_network"

_auto_state   = AUTO_OFF
_auto_queue   = []
_auto_tried   = []
_auto_fast    = None      # SSID tried on the no-scan fast path
_auto_retry_last = None   # fast-path SSID to retry after the scan
_auto_scanned = False
_auto_refresh = False     # post-connect nearby scan still to do
_auto_refresh_at = 0
_auto_next_ms = 0
_auto_seq     = 0         # scan_seq() when this machine started its scan
_AUTO_TICK_MS = 150
_REFRESH_DELAY_MS = 8000


def _auto_set(state):
    global _auto_state
    if state != _auto_state:
        _dbg("auto %s -> %s" % (_auto_state, state))
        _auto_state = state


def auto_state():
    return _auto_state


def auto_stop():
    """Hand the radio to the user: the WiFi app calls this before a
    manual connect so the boot sequence does not fight it."""
    if _auto_state in (AUTO_TRY, AUTO_SCAN):
        _auto_set(AUTO_OFF)


def _auto_scan():
    global _auto_scanned, _auto_seq
    _auto_scanned = True
    _auto_seq = _scan_seq
    _auto_set(AUTO_SCAN if scan_start() else AUTO_FAIL)


def _auto_try_next():
    while _auto_queue:
        n = _auto_queue.pop(0)
        ssid = n.get("ssid") or ""
        if not ssid or ssid in _auto_tried:
            continue
        _auto_tried.append(ssid)
        if connect_begin(ssid, n.get("password") or ""):
            _auto_set(AUTO_TRY)
            return True
    return False


def auto_begin():
    """Kick off boot auto-connect without blocking. Safe to call again
    (e.g. from the WiFi app) — it restarts the sequence."""
    global _auto_queue, _auto_tried, _auto_scanned, _auto_refresh
    global _auto_fast, _auto_seq, _auto_retry_last
    try:
        _sync_secrets_into_saved()
    except Exception as e:
        print("[wifi] secrets sync failed:", e)
    saved = list_saved()
    _auto_queue   = []
    _auto_tried   = []
    _auto_fast    = None
    _auto_retry_last = None
    _auto_scanned = False
    _auto_refresh = True
    _dbg("auto begin: %d saved" % len(saved))
    if is_connected():
        _auto_set(AUTO_DONE)
        return
    if _conn_ssid is not None:
        # A join is already in flight (e.g. started from the WiFi app):
        # adopt it instead of tearing it down.
        _auto_tried.append(_conn_ssid)
        _auto_set(AUTO_TRY)
        return
    if _scan_busy:
        # A join now would be refused by IDF mid-scan (and burn the
        # fast-path network); use the scan that is already running.
        _auto_scanned = True
        _auto_seq = _scan_seq
        _auto_set(AUTO_SCAN)
        return
    last = last_connected(saved)
    if last is not None:
        _auto_fast = last.get("ssid")
        _auto_queue.append(last)
        if _auto_try_next():
            return
    _auto_scan()


def auto_tick():
    """Advance auto-connect. True exactly once when the link comes up.

    Also finishes a join this machine does not own (a manual join from
    the WiFi app, left when the user pressed HOME mid-connect): without a
    poller its CONN_OK bookkeeping (retry-forever, link_seq, last-network
    marker) would never run. That case returns False; the outcome stays
    readable through connect_poll() and link_seq()."""
    global _auto_queue, _auto_refresh, _auto_next_ms, _auto_refresh_at
    global _auto_retry_last
    orphan = _conn_ssid is not None and _auto_state != AUTO_TRY
    if _auto_state == AUTO_OFF and not orphan:
        return False
    now = _now()
    if time.ticks_diff(now, _auto_next_ms) < 0:
        return False
    _auto_next_ms = time.ticks_add(now, _AUTO_TICK_MS)

    if orphan:
        connect_poll()
        return False

    if _auto_state == AUTO_TRY:
        target = _conn_ssid
        r = connect_poll()
        if r == CONN_BUSY:
            return False
        if r == CONN_OK:
            _auto_set(AUTO_DONE)
            _auto_refresh_at = time.ticks_add(now, _REFRESH_DELAY_MS)
            return True
        if (target is not None and target == _auto_fast and
                not _auto_scanned and r in (CONN_NO_AP, CONN_TIMEOUT)):
            # The fast path joins without a scan, so "not found" may just
            # be a missed beacon. Let the scan decide: if the network is
            # on the air it is tried again, after the other candidates.
            try:
                _auto_tried.remove(target)
            except ValueError:
                pass
            _auto_retry_last = target
        if _auto_try_next():
            return False
        if not _auto_scanned:
            _auto_scan()
            return False
        _auto_set(AUTO_FAIL)
        return False

    if _auto_state == AUTO_SCAN:
        s = scan_poll()
        if s == "busy":
            return False
        # Another poller (the WiFi app) may have collected the results
        # first; a moved scan_seq means they are fresh all the same.
        fresh = s == "done" or _scan_seq != _auto_seq
        visible = nearby() if fresh else None
        if not visible:
            # An empty scan on 1.28 is as likely "refused" as "nothing
            # around"; try every saved network rather than none.
            visible = None
        saved = list_saved()
        _auto_queue = pick_candidates(saved, visible, _auto_tried)
        if _auto_retry_last:
            again = [n for n in _auto_queue if n.get("ssid") == _auto_retry_last]
            _auto_queue = [n for n in _auto_queue
                           if n.get("ssid") != _auto_retry_last] + again
        _dbg("auto scan %s: %d candidates" % (s, len(_auto_queue)))
        if _auto_try_next():
            return False
        if not saved:
            # Nothing to join: power down like the old boot path did.
            radio_off()
        _auto_set(AUTO_FAIL)
        _auto_refresh = False
        return False

    if _auto_state == AUTO_DONE and _auto_refresh:
        # One post-connect scan so Settings shows what is around. Runs in
        # the background thread; skipped silently on thread-less builds
        # (a synchronous 2 s scan here would stall the home screen).
        if time.ticks_diff(now, _auto_refresh_at) < 0:
            return False
        if not _scan_busy and _conn_ssid is None:
            try:
                import _thread  # noqa: F401 (availability probe)
                _auto_refresh = False
                scan_start()
            except Exception:
                _auto_refresh = False
        return False

    if _scan_busy or _scan_raw is not None:
        scan_poll()       # collect the post-connect refresh scan
    return False
