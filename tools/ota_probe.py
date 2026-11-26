# SPDX-License-Identifier: MIT
"""On-badge dry run of an OTA update. Runs ON the badge:

    falera run tools/ota_probe.py

It does what the Updates app does, without installing anything:

  1. the update check against the latest release on the channel;
  2. the release manifest;
  3. for each GitHub host the update uses: the address the badge's
     resolver gives, every address the DNS server lists, and whether a TCP
     connection to each one opens (a black-holed address shows here);
  4. every file of the release downloaded and verified (SHA-256, size)
     into a scratch directory, /_ota_probe, one at a time, each deleted
     once checked.

Per file it prints the hosts it went through (redirects), size, time and
whether the hash matched; on the first failure, the full error. Free
flash and heap are printed before and after. The installed OS, and any
update already staged in /_ota, are never touched; /_ota_probe is removed
at the end.

Needs a Wi-Fi network saved on the badge (`falera wifi`). Paste the whole
output into the issue or pull request.
"""

import gc
import os
import socket
import time

from oreoOS import _http, ota

PROBE_DIR = "/_ota_probe"
CHANNEL = "stable"
HOSTS = ("api.github.com", "github.com",
         "release-assets.githubusercontent.com")


def idf_free():
    try:
        import esp32
        info = esp32.idf_heap_info(esp32.HEAP_DATA)
        return sum(i[1] for i in info), max(i[2] for i in info)
    except Exception:
        return 0, 0


def free_flash():
    try:
        st = os.statvfs("/")
        return (st[1] or st[0]) * st[4]
    except Exception:
        return -1


def report_resources(label):
    gc.collect()
    idf, block = idf_free()
    print("%s: flash free %d KB, gc heap free %d KB, idf heap free %d KB "
          "(largest block %d KB)" % (label, free_flash() // 1024,
                                     getattr(gc, "mem_free", lambda: 0)() // 1024, idf // 1024,
                                     block // 1024))


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
        print("Wi-Fi: connect failed: %r" % (e,))
    return wifi.is_connected()


def rm_tree(path):
    try:
        names = os.listdir(path)
    except OSError:
        try:
            os.remove(path)
        except OSError:
            pass
        return
    for n in names:
        rm_tree(path + "/" + n)
    try:
        os.rmdir(path)
    except OSError:
        pass


def tcp_ms(ip, port=443, timeout=6):
    s = socket.socket()
    t0 = time.ticks_ms()
    try:
        s.settimeout(timeout)
        s.connect((ip, port))
        return "%d ms" % time.ticks_diff(time.ticks_ms(), t0)
    except Exception as e:
        return "FAIL %r after %d ms" % (e, time.ticks_diff(time.ticks_ms(), t0))
    finally:
        s.close()


def check_addresses():
    server = None
    try:
        server = _http._dns_server()
    except Exception:
        pass
    print("DNS server: %s" % server)
    for host in HOSTS:
        try:
            sys_ip = socket.getaddrinfo(host, 443)[0][-1][0]
        except Exception as e:
            print("%s: resolver FAIL %r" % (host, e))
            continue
        ips = []
        if server and hasattr(_http, "_dns_query"):
            ips = _http._dns_query(host, server)
        print("%s: resolver -> %s; DNS lists %s" % (host, sys_ip, ips or "?"))
        for ip in ([sys_ip] + [i for i in ips if i != sys_ip]):
            print("    tcp %-16s %s" % (ip, tcp_ms(ip)))


def hosts_from_trace(trace):
    out = []
    for ev in trace:
        if ev[0] == "connect":
            out.append("%s(%s)" % (ev[1], ev[2]))
        elif ev[0] == "redirect":
            out.append("->" + ev[1])
        elif ev[0] == "connect-fail":
            out.append("x%s(%s: %s)" % (ev[1], ev[2], ev[3]))
    return " ".join(out) or "(kept-alive connection)"


def fetch(entry):
    """(ok, error) for one manifest entry, through the OS's own code."""
    if hasattr(ota, "fetch_file"):
        ok = ota.fetch_file(entry, PROBE_DIR)
        return ok, (None if ok else ota.error_text())
    # An OS from before fetch_file: the plain streaming download.
    dest = PROBE_DIR + "/" + entry["path"].replace("/", "_")
    try:
        ok = _http.download_to_file(entry["url"], dest, entry.get("sha256"),
                                    timeout_s=60)
        return ok, (None if ok else "failed")
    except Exception as e:
        return False, repr(e)


def main():
    print("== FaleraOS OTA probe (dry run: nothing is installed) ==")
    try:
        from oreoOS.config import VERSION
    except Exception:
        VERSION = "?"
    print("installed: %s, staged update pending: %s"
          % (VERSION, ota.is_pending()))
    report_resources("before")
    if not wifi_up():
        print("FAIL: no Wi-Fi")
        return
    print("clock set: %s" % _http.ensure_clock())
    check_addresses()

    t0 = time.ticks_ms()
    ver, rel = ota.latest_version(CHANNEL)
    ms = time.ticks_diff(time.ticks_ms(), t0)
    if not rel:
        err = getattr(ota, "error_text", lambda: "")()
        print("check: FAIL after %d ms: %s" % (ms, err or "no answer"))
        return
    print("check: latest %s is %s (%d ms); newer than installed: %s"
          % (CHANNEL, ver, ms, ota.compare_version(ver, VERSION) > 0))

    # The manifest the Updates app would install: the precompiled one
    # (manifest-mpy.json) on firmware that loads .mpy, else manifest.json.
    import json
    urls = [rel["manifest_url"]]
    mpy_ok = getattr(ota, "_mpy_ok", None)
    mname = getattr(ota, "MPY_MANIFEST_NAME", None)
    if mpy_ok and mname and mpy_ok("6") and urls[0].endswith(ota.MANIFEST_NAME):
        urls.insert(0, urls[0][:-len(ota.MANIFEST_NAME)] + mname)
    manifest = None
    for url in urls:
        t0 = time.ticks_ms()
        try:
            body = _http.get_url(url, timeout_s=ota.T_MANIFEST)
            manifest = json.loads(body.decode()) if body else None
        except Exception as e:
            body, manifest = None, None
            print("manifest %s: FAIL %r" % (url.rsplit("/", 1)[1], e))
        ms = time.ticks_diff(time.ticks_ms(), t0)
        if manifest:
            break
        err = getattr(_http, "last_error", lambda: "")()
        print("manifest %s: FAIL after %d ms: %s"
              % (url.rsplit("/", 1)[1], ms, err or "no answer"))
    if not manifest:
        return
    files = manifest.get("files", [])
    total = sum(int(f.get("size", 0) or 0) for f in files)
    print("manifest %s: %d bytes, %d files, %d KB, %d ms; removes %d .py"
          % (url.rsplit("/", 1)[1], len(body), len(files), total // 1024, ms,
             len(manifest.get("remove", ()) or ())))
    body = None
    gc.collect()

    rm_tree(PROBE_DIR)
    os.mkdir(PROBE_DIR)
    ok_n = 0
    first_err = None
    t_all = time.ticks_ms()
    try:
        for i, entry in enumerate(files):
            _http.TRACE = []
            t0 = time.ticks_ms()
            ok, err = fetch(entry)
            ms = time.ticks_diff(time.ticks_ms(), t0)
            size = int(entry.get("size", 0) or 0)
            print("%3d/%d %-44s %7d B %6d ms %s  %s"
                  % (i + 1, len(files), entry.get("path", "?")[:44], size, ms,
                     "hash ok" if ok else "FAIL",
                     hosts_from_trace(_http.TRACE)))
            if ok:
                ok_n += 1
            else:
                print("      error: %s" % err)
                if first_err is None:
                    first_err = (entry.get("path"), err)
            rm_tree(PROBE_DIR + "/" + entry.get("path", ""))
    except Exception as e:
        print("probe stopped: %r" % (e,))
        if first_err is None:
            first_err = ("?", repr(e))
    finally:
        _http.TRACE = None
        try:
            _http.close_pool()
        except Exception:
            pass
        rm_tree(PROBE_DIR)
    secs = time.ticks_diff(time.ticks_ms(), t_all) // 1000
    print()
    print("files: %d of %d downloaded and verified in %d s"
          % (ok_n, len(files), secs))
    report_resources("after")
    if first_err:
        print("first error: %s: %s" % first_err)
    print("RESULT:", "PASS" if ok_n == len(files) else "FAIL")


main()
