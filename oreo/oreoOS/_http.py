"""Raw-socket HTTP GET with a timeout that's actually honoured.

Both `oreoOS.ota` and `oreoOS.store` use this instead of `urequests`
because `urequests`'s `timeout=` flag on the MicroPython 1.28 build we
ship only covers the connect step — body read can hang forever on a
slow / mis-behaving server, wedging the OS run loop for minutes.

Public surface:
    get_url(url, accept=None, timeout_s=4, auth=None,
            on_progress=None) -> bytes | None

`accept` overrides the Accept header (GitHub Contents API needs
`application/vnd.github.raw` for raw file bodies, otherwise we get the
base64-wrapped JSON envelope).

`auth` is an optional ("Bearer <token>") header value.

Follows a small, bounded number of HTTPS redirects. This is required for
GitHub Release assets: their public download URL responds with HTTP 302 and
points at a short-lived release-assets.githubusercontent.com URL.

Returns the response body as bytes on HTTP 200, or None on any unsupported
status / timeout / DNS failure / SSL error. Caller logs / surfaces.

Every connection verifies the server's certificate (tls_wrap, #110). When
a request fails because of it, tls_error_since(tls_mark()) says why.
"""

import time

try:
    import socket as _socket
    import ssl    as _ssl
    _OK = True
except ImportError:
    _OK = False


USER_AGENT = "FaleraBadge"


# ═════════════════════════════════════════════════════════════════════════
# TLS with certificate verification (#110)
# ═════════════════════════════════════════════════════════════════════════
#
# Every HTTPS connection verifies the server's chain against the roots in
# oreoOS/tls_roots.py (imported on the first TLS connection, not at boot)
# and the server's name (mbedTLS checks it against server_hostname, which
# also sets SNI). A failure raises TLSError and is never retried without
# verification. Docs: docs/TLS.md.

# A clock earlier than this is "not set" (the RTC starts at 2000-01-01).
# mbedTLS compares certificate dates with the RTC, so TLS waits for, or
# runs, an NTP sync first.
MIN_CLOCK_YEAR = 2026
CLOCK_WAIT_MS = 6000        # wait for a sync already running (netsvc)
CLOCK_RETRY_MS = 30000      # own NTP attempts at most this often

# Debug escape hatch, OFF by default: set it from the REPL
# (`import oreoOS._http as h; h.INSECURE_DEBUG = True`) to skip certificate
# checks until the next reset. It is never saved and every connection
# prints a warning while it is on.
INSECURE_DEBUG = False

# Short, user-facing reasons (they fit the Updates screen's 34 columns
# with the "TLS: " prefix).
CLOCK    = "clock not set"
DATE     = "certificate date invalid"
UNTRUSTED = "untrusted certificate"
NAME     = "certificate name mismatch"
BUNDLE   = "CA bundle failed to load"
REJECTED = "certificate rejected"


class TLSError(OSError):
    """A TLS connection refused for security reasons: the certificate
    did not verify, or the clock is not set so it could not be checked.
    `reason` is one of the short strings above; `host` the server."""

    def __init__(self, reason, host="", detail=""):
        # super(), not OSError.__init__: MicroPython's native exception
        # types have no __init__ attribute.
        super().__init__("TLS: " + reason)
        self.reason = reason
        self.host = host
        self.detail = detail


# Last TLS failure, for screens that only see "the request failed". A
# caller takes tls_mark() before its requests and asks
# tls_error_since(mark) after a failure: a sequence number rather than a
# clear-then-read flag, so background threads cannot wipe another
# caller's error.
_tls_seq = 0
_tls_reason = ""
_tls_host = ""
_ntp_try_ms = None
_roots = None


def tls_mark():
    return _tls_seq


def tls_error_since(mark):
    """'TLS: <reason>' if a TLS connection failed after tls_mark()
    returned `mark`, else None."""
    if _tls_seq != mark and _tls_reason:
        return "TLS: " + _tls_reason
    return None


def last_tls_error():
    """(seq, reason, host) of the most recent TLS failure (seq 0: none)."""
    return _tls_seq, _tls_reason, _tls_host


def _fail(reason, host, detail=""):
    global _tls_seq, _tls_reason, _tls_host
    _tls_seq += 1
    _tls_reason = reason
    _tls_host = host
    _bc("TLS refused %s: %s %s" % (host, reason, detail))
    return TLSError(reason, host, detail)


def _ticks():
    try:
        return time.ticks_ms()
    except AttributeError:          # CPython (host tests)
        return int(time.monotonic() * 1000)


def _ticks_diff(a, b):
    try:
        return time.ticks_diff(a, b)
    except AttributeError:
        return a - b


def _sleep_ms(ms):
    try:
        time.sleep_ms(ms)
    except AttributeError:
        time.sleep(ms / 1000)


def clock_ok():
    """True when the RTC holds a plausible date (after MIN_CLOCK_YEAR)."""
    try:
        return time.localtime()[0] >= MIN_CLOCK_YEAR
    except Exception:
        return False


def ensure_clock():
    """Make sure the clock is set before a certificate is checked.

    Already set: returns at once. A sync in progress (netsvc's worker on
    link-up): waits up to CLOCK_WAIT_MS for it. Otherwise runs one NTP
    sync itself (bounded: DNS plus a 2.5 s UDP timeout), at most once per
    CLOCK_RETRY_MS so a network without NTP does not slow every request.
    Callers run on a worker or under a busy card, like the request itself.
    Returns True when the clock is set.
    """
    global _ntp_try_ms
    if clock_ok():
        return True
    try:
        from oreoOS import timeutil
    except Exception:
        return False
    start = _ticks()
    while timeutil.sync_busy():
        if _ticks_diff(_ticks(), start) >= CLOCK_WAIT_MS:
            break
        _sleep_ms(100)
    if clock_ok():
        return True
    now = _ticks()
    if _ntp_try_ms is not None and _ticks_diff(now, _ntp_try_ms) < CLOCK_RETRY_MS:
        return False
    _ntp_try_ms = now
    _bc("clock not set: NTP sync before TLS")
    try:
        timeutil.sync_from_ntp()
    except Exception:
        pass
    return clock_ok()


def _load_roots():
    """The DER roots, imported on the first TLS connection and kept."""
    global _roots
    if _roots is None:
        from oreoOS import tls_roots
        _roots = tls_roots.ROOTS
    return _roots


def _classify(text):
    """Map an mbedTLS / OpenSSL verification message to a short reason."""
    t = text.lower()
    if "expired" in t or "future" in t or "not yet valid" in t:
        return DATE
    if "common name" in t or "hostname" in t or "match" in t:
        return NAME
    if ("trusted" in t or "unknown ca" in t or "issuer" in t
            or "self signed" in t or "self-signed" in t
            or "not correctly signed" in t or "local issuer" in t):
        return UNTRUSTED
    return REJECTED


def _is_verify_failure(e):
    """True for a certificate rejection, as opposed to a network error.

    MicroPython raises ValueError with mbedtls_x509_crt_verify_info()'s
    text, or OSError(-0x2700, "X509 - Certificate verification failed")
    when that text is unavailable. CPython raises
    ssl.SSLCertVerificationError, a ValueError subclass."""
    if isinstance(e, ValueError):
        return True
    text = str(e)
    return ("X509" in text or "-9984" in text or "verif" in text.lower()
            or "certificate" in text.lower())


def tls_wrap(raw, host):
    """Wrap a connected socket in TLS 1.2+ as a client, with SNI, and
    verify the server's certificate chain and name.

    One place for every HTTPS connection on the badge (OTA, App Store,
    GitHub data, geo, weather, the WiFi speed test). Raises TLSError when
    the clock is not set or the certificate is rejected; there is no
    fallback to an unverified connection (see INSECURE_DEBUG). Network
    errors pass through unchanged. A fresh context per connection keeps
    concurrent fetches (background refresh threads) independent.
    """
    ctx = _ssl.SSLContext(_ssl.PROTOCOL_TLS_CLIENT)
    # TLS 1.2 is the floor. MicroPython's mbedTLS 3.x has no TLS 1.0/1.1 at
    # all and no minimum_version attribute, so this only takes effect where
    # the attribute exists (CPython, host tests).
    try:
        ctx.minimum_version = _ssl.TLSVersion.TLSv1_2
    except Exception:
        pass
    if INSECURE_DEBUG:
        _bc("WARNING: certificate verification OFF (INSECURE_DEBUG) " + host)
        ctx.verify_mode = _ssl.CERT_NONE
        try:
            ctx.check_hostname = False      # CPython only
        except Exception:
            pass
        return ctx.wrap_socket(raw, server_hostname=host)

    if not ensure_clock():
        raise _fail(CLOCK, host)
    try:
        # MicroPython's mbedTLS parses one DER certificate per call (it
        # rejects trailing bytes), and each call adds to the trust list.
        for der in _load_roots():
            ctx.load_verify_locations(cadata=der)
    except Exception as e:
        raise _fail(BUNDLE, host, str(e))
    ctx.verify_mode = _ssl.CERT_REQUIRED
    try:
        ctx.check_hostname = True           # CPython; mbedTLS always checks
    except Exception:
        pass
    try:
        # server_hostname is SNI and, with CERT_REQUIRED, the name mbedTLS
        # matches against the certificate's SAN/CN.
        return ctx.wrap_socket(raw, server_hostname=host)
    except Exception as e:
        if _is_verify_failure(e):
            raise _fail(_classify(str(e)), host, str(e))
        raise


MAX_REDIRECTS = 3
# get_url() buffers the whole body in RAM (OTA files stream to flash through
# download_to_file instead). Keep a hard ceiling so a bad or hostile
# endpoint cannot consume the whole heap; the OTA manifest is ~55 KiB.
MAX_RESPONSE_BYTES = 1024 * 1024


# ═════════════════════════════════════════════════════════════════════════
# Errors in plain words, for the screens that show why a request failed
# ═════════════════════════════════════════════════════════════════════════
#
# Like the TLS reason above, but for every failure: "<host>: <what>", e.g.
# "release-assets.githubusercontent.com: connect timed out (185.199.109.133)".
# Sequence-numbered, so a caller compares error_mark() before and
# error_since(mark) after instead of clearing a shared flag.

_err_seq = 0
_err_text = ""


def _note(text):
    global _err_seq, _err_text
    _err_seq += 1
    _err_text = text
    _trace("error", text)


def error_mark():
    return _err_seq


def error_since(mark):
    """The last request error after error_mark() returned `mark`, else None."""
    if _err_seq != mark and _err_text:
        return _err_text
    return None


def last_error():
    return _err_text


def _reason(e):
    """Short words for an exception from a socket / TLS / file call."""
    if isinstance(e, TLSError):
        return "TLS: " + e.reason
    t = str(e)
    u = t.upper()
    if "TIMED OUT" in u or "ETIMEDOUT" in u or "EAGAIN" in u:
        return "timed out"
    if "DEADLINE" in u:
        return "too slow (time limit)"
    if u == "EOF":
        return "connection closed early"
    if "EHOSTUNREACH" in u or "ENETUNREACH" in u:
        return "host unreachable"
    if "ECONNRESET" in u or "ECONNABORTED" in u:
        return "connection reset"
    if "ECONNREFUSED" in u:
        return "connection refused"
    if "ENOMEM" in u or "MEMORY" in u or "-0X7F00" in u:
        return "out of memory"
    if "ENOSPC" in u:
        return "storage full"
    if isinstance(e, MemoryError):
        return "out of memory"
    return t or repr(e)


# Optional trace for diagnostics (tools/ota_probe.py): set TRACE = [] and
# every connect, redirect and failure is appended as a tuple. None: off.
TRACE = None


def _trace(*ev):
    if TRACE is not None:
        try:
            TRACE.append(ev)
        except Exception:
            pass


# ═════════════════════════════════════════════════════════════════════════
# Connecting with address fallback
# ═════════════════════════════════════════════════════════════════════════
#
# GitHub serves release assets, raw files and the asset CDN from four
# anycast addresses (185.199.108-111.133). Some networks black-hole one of
# them: a TCP connect to it never completes. lwIP's getaddrinfo() returns
# ONE address and caches it for the DNS TTL, so a badge that drew the dead
# one timed out on every OTA file (and App Store download) until the cache
# expired. _connect() therefore:
#   * tries every address getaddrinfo() gives, with a short connect timeout;
#   * remembers addresses that failed (BAD_TTL_MS) and tries them last;
#   * when all of those fail, asks the network's DNS server directly for
#     every A record of the host and tries the ones not tried yet.

CONNECT_S = 6               # per-address TCP connect timeout
BAD_TTL_MS = 10 * 60 * 1000
DNS_TIMEOUT_S = 2

_bad = {}                   # ip -> ticks when its connect failed
_alt = {}                   # host -> [ip, ...] from our own DNS query


def _is_bad(ip):
    t = _bad.get(ip)
    if t is None:
        return False
    if _ticks_diff(_ticks(), t) > BAD_TTL_MS:
        _bad.pop(ip, None)
        return False
    return True


def _mark_bad(ip):
    if len(_bad) > 32:
        _bad.clear()
    _bad[ip] = _ticks()


def _gai(host, port):
    """[(ip, port), ...] from the system resolver (one on MicroPython)."""
    out = []
    for ai in _socket.getaddrinfo(host, port):
        addr = ai[-1]
        if addr not in out:
            out.append(addr)
    return out


def _dns_server():
    try:
        import network
        try:
            s = network.ipconfig("dns")
            if s:
                return s
        except Exception:
            pass
        return network.WLAN(network.STA_IF).ifconfig()[3]
    except Exception:
        return None


def _dns_query(host, server, timeout_s=DNS_TIMEOUT_S):
    """Every IPv4 address (A record) for `host`, asked of `server` over
    UDP. [] on any failure. Small and bounded: one datagram each way."""
    try:
        qid = (_ticks() * 7919) & 0xFFFF
        q = bytearray(qid.to_bytes(2, "big") + b"\x01\x00\x00\x01"
                      + b"\x00\x00\x00\x00\x00\x00")
        for label in host.split("."):
            q.append(len(label))
            q.extend(label.encode())
        q.extend(b"\x00\x00\x01\x00\x01")
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
        try:
            s.settimeout(timeout_s)
            addr = _socket.getaddrinfo(server, 53)[0][-1]
            s.sendto(bytes(q), addr)
            data = s.recv(1024)
        finally:
            s.close()
        return _parse_dns(data, qid)
    except Exception:
        return []


def _parse_dns(data, qid=None):
    """IPv4 strings from the answer section of a DNS response."""
    if len(data) < 12:
        return []
    if qid is not None and int.from_bytes(data[0:2], "big") != qid:
        return []
    qd = int.from_bytes(data[4:6], "big")
    an = int.from_bytes(data[6:8], "big")
    i = 12

    def skip_name(i):
        while i < len(data):
            n = data[i]
            if n == 0:
                return i + 1
            if n & 0xC0 == 0xC0:
                return i + 2
            i += n + 1
        raise ValueError("bad name")

    for _ in range(qd):
        i = skip_name(i) + 4
    out = []
    for _ in range(an):
        i = skip_name(i)
        if i + 10 > len(data):
            break
        rtype = int.from_bytes(data[i:i + 2], "big")
        rcls = int.from_bytes(data[i + 2:i + 4], "big")
        rdlen = int.from_bytes(data[i + 8:i + 10], "big")
        i += 10
        if rtype == 1 and rcls == 1 and rdlen == 4 and i + 4 <= len(data):
            ip = "%d.%d.%d.%d" % (data[i], data[i + 1], data[i + 2], data[i + 3])
            if ip not in out:
                out.append(ip)
        i += rdlen
    return out


def _connect(host, port, timeout_s):
    """A connected TCP socket to host:port, trying every known address of
    the host (see above). Raises the last connect error when none works."""
    ct = min(timeout_s, CONNECT_S)
    tried = []
    last = None
    asked_dns = False
    cands = _gai(host, port)
    for ip in _alt.get(host, ()):
        a = (ip, port)
        if a not in cands:
            cands.append(a)
    while True:
        # Addresses that failed recently go last.
        order = [a for a in cands if a not in tried and not _is_bad(a[0])]
        order += [a for a in cands if a not in tried and a not in order]
        for addr in order:
            tried.append(addr)
            raw = _socket.socket()
            t0 = _ticks()
            try:
                raw.settimeout(ct)
                raw.connect(addr)
                try:
                    raw.settimeout(timeout_s)
                except Exception:
                    pass
                _bad.pop(addr[0], None)
                _trace("connect", host, addr[0], _ticks_diff(_ticks(), t0))
                return raw
            except Exception as e:
                try:
                    raw.close()
                except Exception:
                    pass
                last = e
                _mark_bad(addr[0])
                _bc("connect %s (%s) failed: %s" % (host, addr[0], e))
                _trace("connect-fail", host, addr[0], _reason(e))
        if asked_dns:
            break
        asked_dns = True
        server = _dns_server()
        ips = _dns_query(host, server) if server else []
        if ips:
            _alt[host] = ips
        new = [(ip, port) for ip in ips if (ip, port) not in tried]
        if not new:
            break
        _bc("trying %d more address(es) for %s" % (len(new), host))
        cands = new
    if last is None:
        last = OSError("no address")
    raise last


def _with_query(path, query):
    """path with an extra query string appended (used for secrets that must
    not be part of a logged or redirected URL)."""
    if not query:
        return path
    return path + ("&" if "?" in path else "?") + query


def _bc(msg):
    try:
        print("[http] " + msg)
    except Exception:
        pass


def _progress(callback, phase, received=0):
    """Best-effort network progress pulse for synchronous UI callers."""
    if callback is None:
        return
    try:
        callback(phase, received)
    except Exception:
        pass


def _split_https_url(url):
    """Return (host, port, path) for an HTTPS URL, or None."""
    if not url.startswith("https://"):
        return None
    rest = url[len("https://"):]
    slash = rest.find("/")
    if slash < 0:
        host, path = rest, "/"
    else:
        host, path = rest[:slash], rest[slash:]
    port = 443
    if ":" in host:
        host, p = host.split(":", 1)
        try:
            port = int(p)
        except ValueError:
            return None
    if not host:
        return None
    return host, port, path


def _header_value(head, name):
    """Case-insensitive header lookup on the raw response-header bytes."""
    prefix = name.lower().encode() + b":"
    for line in head.split(b"\r\n")[1:]:
        if line.lower().startswith(prefix):
            try:
                return line[len(prefix):].strip().decode()
            except Exception:
                return None
    return None


def _redirect_url(current_url, location):
    """Resolve the HTTPS absolute/root-relative redirects GitHub emits."""
    if not location:
        return None
    if location.startswith("https://"):
        return location
    if location.startswith("/"):
        parsed = _split_https_url(current_url)
        if parsed is not None:
            return "https://" + parsed[0] + location
    return None


def get_url(url, accept=None, timeout_s=4, auth=None, on_progress=None,
            secret_query=None):
    """GET a URL and follow at most MAX_REDIRECTS HTTPS redirects.

    Authorization is deliberately dropped after a cross-host redirect. GitHub
    Release assets use signed CDN URLs and do not need the API token; keeping
    the token on the original host prevents credentials from being forwarded
    to an unrelated redirect target.

    `secret_query` (for example "appid=<key>") is appended to the request
    path only: it is never part of the URL that is logged or followed, and
    it is dropped after a cross-host redirect, like Authorization.
    """
    current = url
    request_auth = auth
    request_query = secret_query
    allow_auto_auth = True
    for redirect_count in range(MAX_REDIRECTS + 1):
        result = _get_once(current, accept, timeout_s,
                           request_auth, allow_auto_auth, on_progress,
                           request_query)
        if result is None:
            return None
        status, head, body = result
        if status == 200:
            if b"\r\ntransfer-encoding: chunked" in (b"\r\n" + head.lower()):
                body = _dechunk(body)
            else:
                cl = _header_value(head, "content-length")
                if cl is not None:
                    try:
                        want = int(cl)
                    except ValueError:
                        want = -1
                    if want >= 0 and len(body) < want:
                        # A body cut short (slow link, dropped connection)
                        # is not a result: a truncated JSON document or
                        # file would fail later with a confusing error.
                        parsed = _split_https_url(current)
                        _note("%s: incomplete response (%d of %d bytes)"
                              % (parsed[0] if parsed else "?", len(body), want))
                        return None
            return body
        if status not in (301, 302, 303, 307, 308):
            parsed = _split_https_url(current)
            _bc("HTTP %d %s" % (status, parsed[0] if parsed else "?"))
            _note("%s: HTTP %d" % (parsed[0] if parsed else "?", status))
            return None
        if redirect_count >= MAX_REDIRECTS:
            _bc("too many redirects")
            _note("too many redirects")
            return None
        location = _header_value(head, "location")
        next_url = _redirect_url(current, location)
        if next_url is None:
            _bc("invalid redirect")
            _note("invalid redirect")
            return None
        current_host = _split_https_url(current)
        next_host = _split_https_url(next_url)
        if current_host is None or next_host is None:
            return None
        if current_host[0] != next_host[0]:
            request_auth = None
            request_query = None
            allow_auto_auth = False
        _bc("redirect " + next_host[0])
        _trace("redirect", next_host[0])
        _progress(on_progress, "redirect")
        current = next_url
    return None


def _get_once(url, accept, timeout_s, auth, allow_auto_auth=True,
              on_progress=None, secret_query=None):
    if not _OK:
        return None
    parsed = _split_https_url(url)
    if parsed is None:
        return None
    host, port, path = parsed

    accept_hdr = accept or "*/*"

    # Auto-inject a GitHub token for *.github.com calls if one is
    # present in oreoOS.config. Bumps anonymous limit (60 / hr / IP)
    # to 5000 / hr — relevant only for sustained Store / OTA polling.
    # `auth` arg overrides if the caller wants something custom.
    github_host = (host == "github.com" or host == "api.github.com" or
                   host == "raw.githubusercontent.com" or
                   host.endswith(".githubusercontent.com"))
    if allow_auto_auth and auth is None and github_host:
        try:
            from oreoOS.config import GH_TOKEN as _TOK
            if _TOK:
                auth = "Bearer " + _TOK
        except Exception:
            pass
    auth_hdr = ("Authorization: " + auth + "\r\n") if auth else ""

    deadline = None
    s = None
    raw = None
    try:
        _bc("dns " + host)
        _progress(on_progress, "dns")
        _bc("connect " + host + ":" + str(port))
        _progress(on_progress, "connect")
        raw = _connect(host, port, timeout_s)
        # The budget starts once connected: trying a dead address first
        # (up to CONNECT_S each) must not eat the time for the response.
        deadline = time.ticks_add(time.ticks_ms(), int(timeout_s * 1000) + 500)
        _bc("ssl")
        _progress(on_progress, "tls")
        s = tls_wrap(raw, host)
        # SSLSocket wraps raw — settimeout on raw doesn't always
        # propagate. Set it again on the wrapper so .read() honours it.
        try:
            s.settimeout(timeout_s)
        except Exception:
            pass

        req = (
            "GET %s HTTP/1.1\r\n"
            "Host: %s\r\n"
            "User-Agent: %s\r\n"
            "Accept: %s\r\n"
            "Accept-Encoding: identity\r\n"
            "%s"
            "Connection: close\r\n\r\n"
        ) % (_with_query(path, secret_query), host, USER_AGENT, accept_hdr,
             auth_hdr)
        _progress(on_progress, "request")
        s.write(req.encode())

        _bc("read")
        buf = bytearray()
        while True:
            # Hard wallclock guard — even if settimeout misfires we
            # bail when the budget is blown.
            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                # An incomplete body is a failure, not a short result.
                _bc("deadline blown after %d bytes" % len(buf))
                _note("%s: too slow (%d bytes in %d s)"
                      % (host, len(buf), timeout_s))
                return None
            try:
                chunk = s.read(2048)
            except Exception as e:
                # Connection: close servers end the body with EOF, which
                # some stacks report as an error once the data is in;
                # get_url() checks Content-Length on what arrived.
                _bc("read err: " + str(e))
                break
            if not chunk:
                break
            buf.extend(chunk)
            _progress(on_progress, "read", len(buf))
            if len(buf) > MAX_RESPONSE_BYTES:
                _bc("response too large")
                _note("%s: response too large" % host)
                return None
    except Exception as e:
        _bc("FAIL " + host + ": " + str(e))
        _note("%s: %s" % (host, _reason(e)))
        return None
    finally:
        for h in (s, raw):
            try:
                if h is not None:
                    h.close()
            except Exception:
                pass

    # Slice headers / body. Status handling (including redirects) belongs to
    # get_url(), which may need to issue another request.
    head_end = buf.find(b"\r\n\r\n")
    if head_end < 0:
        _note("%s: no response" % host)
        return None
    head = bytes(buf[:head_end])
    body = bytes(buf[head_end + 4:])

    status = 0
    line0  = head.split(b"\r\n", 1)[0]
    parts  = line0.split(b" ", 2)
    if len(parts) >= 2:
        try: status = int(parts[1])
        except ValueError: status = 0
    return status, head, body


def _dechunk(body):
    out = bytearray()
    i = 0
    while i < len(body):
        nl = body.find(b"\r\n", i)
        if nl < 0:
            break
        try:
            n = int(body[i:nl].split(b";")[0], 16)
        except Exception:
            break
        i = nl + 2
        if n == 0:
            break
        out.extend(body[i:i + n])
        i += n + 2
    return bytes(out)


# ═════════════════════════════════════════════════════════════════════════
# Streaming downloads with connection reuse (OTA)
# ═════════════════════════════════════════════════════════════════════════
#
# get_url() buffers a whole response in a growing bytearray, then copies it
# twice (head/body slices) before the caller writes it out: ~3x the file
# size in RAM and a fresh TLS handshake per request. An OTA patch touches
# many files, and every release asset is a github.com 302 followed by a
# GET on release-assets.githubusercontent.com, so that was two handshakes
# (each hundreds of ms of ECDHE on the ESP32-S3) per file.
#
# download_to_file() instead:
#   * keeps one HTTP/1.1 keep-alive connection per host open across calls
#     (close_pool() when the batch is done), retrying once on a stale one;
#   * reads into one preallocated buffer and writes straight to flash,
#     hashing on the fly, so RAM use is flat regardless of file size;
#   * understands Content-Length and chunked bodies (and drains redirect
#     bodies so the connection stays reusable).

DL_BUF_BYTES = 16 * 1024
_REDIRECTS = (301, 302, 303, 307, 308)

_pool = {}          # (host, port) -> (raw_socket, tls_socket)
_dl_buf = None


def _buf():
    global _dl_buf
    if _dl_buf is None:
        _dl_buf = bytearray(DL_BUF_BYTES)
    return _dl_buf


def _sock_readinto(s, mv):
    try:
        return s.readinto(mv)
    except AttributeError:          # CPython socket (host tests)
        return s.recv_into(mv)


def _sock_write(s, data):
    try:
        w = s.write
    except AttributeError:
        s.sendall(data)
        return
    view = memoryview(data)
    while view:
        n = w(view)
        if n is None:
            n = len(view)
        if n <= 0:
            raise OSError("write failed")
        view = view[n:]


def _close_conn(conn):
    for h in (conn[1], conn[0]):
        try:
            if h is not None:
                h.close()
        except Exception:
            pass


def close_pool():
    """Close every kept-alive connection. Call after a download batch."""
    for k in list(_pool):
        _close_conn(_pool.pop(k))


def _open_conn(host, port, timeout_s):
    raw = _connect(host, port, timeout_s)
    try:
        s = tls_wrap(raw, host)
        try:
            s.settimeout(timeout_s)
        except Exception:
            pass
    except Exception:
        try:
            raw.close()
        except Exception:
            pass
        raise
    return (raw, s)


class _Reader:
    """Minimal buffered reader for one HTTP response on a socket."""

    def __init__(self, sock, buf, deadline):
        self.s = sock
        self.buf = buf
        self.mv = memoryview(buf)
        self.a = 0          # first unread byte
        self.b = 0          # end of valid data
        self.deadline = deadline

    def fill(self):
        if time.ticks_diff(self.deadline, time.ticks_ms()) <= 0:
            raise OSError("deadline")
        if self.a == self.b:
            self.a = self.b = 0
        elif self.b == len(self.buf):
            n = self.b - self.a
            self.buf[:n] = self.mv[self.a:self.b]
            self.a, self.b = 0, n
            if n == len(self.buf):
                raise OSError("line too long")
        n = _sock_readinto(self.s, self.mv[self.b:])
        if not n:
            raise OSError("eof")
        self.b += n

    def until(self, sep, limit):
        """Bytes before `sep` (consumed together with it)."""
        while True:
            i = self.buf.find(sep, self.a, self.b)
            if i >= 0:
                out = bytes(self.mv[self.a:i])
                self.a = i + len(sep)
                return out
            if self.b - self.a > limit:
                raise OSError("header too long")
            self.fill()

    def chunk(self, n):
        """A memoryview of 1..n buffered bytes (fills when empty)."""
        if self.a == self.b:
            self.fill()
        k = min(n, self.b - self.a)
        out = self.mv[self.a:self.a + k]
        self.a += k
        return out

    def leftover(self):
        return self.b - self.a


def _parse_head(head):
    """(status, {lower-case header: value}) from raw response-head bytes."""
    lines = head.split(b"\r\n")
    status = 0
    parts = lines[0].split(b" ", 2)
    if len(parts) >= 2:
        try:
            status = int(parts[1])
        except ValueError:
            status = 0
    hdrs = {}
    for ln in lines[1:]:
        k, sep, v = ln.partition(b":")
        if sep:
            hdrs[k.strip().lower().decode()] = v.strip().decode()
    return status, hdrs


def _stream_body(rd, hdrs, sink):
    """Feed the body to sink(memoryview). Returns True if the connection
    is still positioned at a message boundary (reusable)."""
    if "chunked" in hdrs.get("transfer-encoding", "").lower():
        while True:
            line = rd.until(b"\r\n", 1024)
            try:
                size = int(line.split(b";")[0].strip(), 16)
            except ValueError:
                raise OSError("bad chunk size")
            if size == 0:
                while rd.until(b"\r\n", 4096):   # trailers, if any
                    pass
                return True
            while size:
                mv = rd.chunk(size)
                sink(mv)
                size -= len(mv)
            if rd.until(b"\r\n", 2):
                raise OSError("bad chunk end")
    cl = hdrs.get("content-length")
    if cl is not None:
        left = int(cl)
        while left > 0:
            mv = rd.chunk(left)
            sink(mv)
            left -= len(mv)
        return True
    # Neither: body runs to EOF and the connection cannot be reused.
    try:
        while True:
            sink(rd.chunk(len(rd.buf)))
    except OSError:
        pass
    return False


def _hexdigest(h):
    import binascii
    return binascii.hexlify(h.digest()).decode()


def download_to_file(url, dest, expected_sha=None, timeout_s=25,
                     max_bytes=4 * 1024 * 1024, keep_alive=True,
                     total_s=None, on_data=None):
    """GET `url` (following HTTPS redirects) straight into file `dest`.

    Returns True only on HTTP 200 with a complete body whose SHA-256
    matches `expected_sha` (hex) when one is given; otherwise removes any
    partial file, records why (error_since / last_error) and returns False.
    Connections are kept for reuse by the next call unless keep_alive is
    False; call close_pool() when done.

    timeout_s bounds each connect and each wait for data (a stalled link);
    total_s (default: timeout_s) bounds one request from connect to the last
    byte, so a large file gets a budget that matches its size.
    on_data(received, expected) is called as the body arrives (expected is
    the Content-Length, or 0 when unknown).
    """
    if not _OK:
        _note("no network stack")
        return False
    try:
        import hashlib
    except ImportError:
        hashlib = None
    if total_s is None:
        total_s = timeout_s
    current = url
    auth = None
    allow_auto_auth = True
    location = None
    buf = _buf()
    for _hop in range(MAX_REDIRECTS + 1):
        parsed = _split_https_url(current)
        if parsed is None:
            _note("not an https URL")
            return False
        host, port, path = parsed
        req_auth = auth
        if allow_auto_auth and req_auth is None and (
                host in ("github.com", "api.github.com")
                or host.endswith(".githubusercontent.com")):
            try:
                from oreoOS.config import GH_TOKEN as _TOK
                if _TOK:
                    req_auth = "Bearer " + _TOK
            except Exception:
                pass
        req = ("GET %s HTTP/1.1\r\nHost: %s\r\nUser-Agent: %s\r\n"
               "Accept: */*\r\nAccept-Encoding: identity\r\n%s"
               "Connection: %s\r\n\r\n") % (
                   path, host, USER_AGENT,
                   ("Authorization: " + req_auth + "\r\n") if req_auth else "",
                   "keep-alive" if keep_alive else "close")
        key = (host, port)
        conn = rd = None
        status = 0
        hdrs = {}
        # attempt 0 may use a pooled connection; a failure there is the
        # server having dropped it while idle, so attempt 1 opens a fresh
        # one. A fresh connection that cannot be opened while others are
        # pooled is retried once with the pool closed: two TLS sessions at
        # once need more heap than one.
        attempt = 0
        freed = False
        while True:
            conn = _pool.pop(key, None)
            reused = conn is not None
            try:
                if conn is None:
                    _bc("connect " + host)
                    conn = _open_conn(host, port, timeout_s)
                # total_s runs from here: the connect (with address
                # fallback) is bounded on its own.
                deadline = time.ticks_add(time.ticks_ms(), int(total_s * 1000))
                _sock_write(conn[1], req.encode())
                rd = _Reader(conn[1], buf, deadline)
                status, hdrs = _parse_head(rd.until(b"\r\n\r\n", 8192))
                break
            except Exception as e:
                if conn is not None:
                    _close_conn(conn)
                conn = None
                attempt += 1
                if reused and attempt == 1:
                    continue        # server dropped the idle connection
                if _pool and not freed and not isinstance(e, TLSError):
                    freed = True
                    close_pool()
                    continue
                _bc("FAIL " + host + ": " + str(e))
                _note("%s: %s" % (host, _reason(e)))
                return False
        reusable = False
        try:
            if status in _REDIRECTS:
                reusable = _stream_body(rd, hdrs, lambda mv: None)
                location = hdrs.get("location")
            elif status == 200:
                h = hashlib.sha256() if (hashlib and expected_sha) else None
                total = [0]
                try:
                    expect = int(hdrs.get("content-length", "0") or 0)
                except ValueError:
                    expect = 0
                if expect > max_bytes:
                    raise OSError("file larger than expected (%d bytes)" % expect)
                f = open(dest, "wb")
                try:
                    def sink(mv):
                        total[0] += len(mv)
                        if total[0] > max_bytes:
                            raise OSError("file larger than expected")
                        f.write(mv)
                        if h is not None:
                            h.update(mv)
                        if on_data is not None:
                            try:
                                on_data(total[0], expect)
                            except Exception:
                                pass
                    reusable = _stream_body(rd, hdrs, sink)
                finally:
                    f.close()
                if h is not None and _hexdigest(h) != expected_sha:
                    raise OSError("checksum mismatch (%d bytes)" % total[0])
            else:
                _bc("HTTP %d %s" % (status, host))
                _note("%s: HTTP %d" % (host, status))
                return False
        except Exception as e:
            _bc("download failed: " + str(e))
            _note("%s: %s" % (host, _reason(e)))
            reusable = False
            if status == 200:
                try:
                    import os as _o
                    _o.remove(dest)
                except Exception:
                    pass
            return False
        finally:
            if (keep_alive and reusable and rd is not None
                    and rd.leftover() == 0 and
                    hdrs.get("connection", "").lower() != "close"):
                old = _pool.pop(key, None)
                if old is not None:
                    _close_conn(old)
                _pool[key] = conn
            elif conn is not None:
                _close_conn(conn)
        if status == 200:
            return True
        nxt = _redirect_url(current, location)
        if nxt is None:
            _note("%s: invalid redirect" % host)
            return False
        nh = _split_https_url(nxt)
        if nh is None:
            _note("%s: invalid redirect" % host)
            return False
        if nh[0] != host:
            auth = None
            allow_auto_auth = False
        _trace("redirect", nh[0])
        current = nxt
    _note("too many redirects")
    return False
