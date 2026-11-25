"""Streaming downloads for the App Store's app files.

`oreoOS._http.get_url` buffers a whole response in RAM, which is fine for
a catalogue or an icon but not for a large app asset. This module streams
a response body in fixed 4 KiB pieces into a sink, so memory use stays
flat whatever the download size:

    stream(url, sink, on_progress=None) -> bytes received, or None
    download_file(url, path, size, on_progress=None) -> True / False
"""

import gc

try:
    import socket as _socket
    from oreoOS._http import tls_wrap as _tls_wrap
    _NET = True
except ImportError:
    _NET = False


USER_AGENT = "FaleraBadge-AppStore"
MAX_REDIRECTS = 4
CHUNK = 4096


def _bc(msg):
    try:
        print("[store_io] " + msg)
    except Exception:
        pass


def _split(url):
    if not url.startswith("https://"):
        return None
    rest = url[8:]
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


def _token_for(host):
    if not (host == "api.github.com" or host == "raw.githubusercontent.com"):
        return ""
    try:
        from oreoOS.config import GH_TOKEN as _TOK
        if _TOK:
            return "Authorization: Bearer " + _TOK + "\r\n"
    except Exception:
        pass
    return ""


def _open(host, port, path, timeout_s, auth):
    addr = _socket.getaddrinfo(host, port)[0][-1]
    raw = _socket.socket()
    try:
        raw.settimeout(timeout_s)
        raw.connect(addr)
        s = _tls_wrap(raw, host)
    except Exception:
        try:
            raw.close()
        except Exception:
            pass
        raise
    try:
        s.settimeout(timeout_s)
    except Exception:
        pass
    s.write(((
        "GET %s HTTP/1.1\r\n"
        "Host: %s\r\n"
        "User-Agent: %s\r\n"
        "Accept: */*\r\n"
        "Accept-Encoding: identity\r\n"
        "%s"
        "Connection: close\r\n\r\n"
    ) % (path, host, USER_AGENT, auth)).encode())
    return s, raw


def read_head(s):
    """Read the status line and headers. Returns (status, length, chunked,
    location) with length -1 when no Content-Length was sent."""
    line = s.readline()
    if not line:
        return 0, -1, False, None
    parts = line.split(None, 2)
    try:
        status = int(parts[1])
    except Exception:
        status = 0
    length = -1
    chunked = False
    location = None
    while True:
        line = s.readline()
        if not line or line in (b"\r\n", b"\n"):
            break
        colon = line.find(b":")
        if colon < 0:
            continue
        key = line[:colon].strip().lower()
        val = line[colon + 1:].strip()
        if key == b"content-length":
            try:
                length = int(val)
            except ValueError:
                length = -1
        elif key == b"transfer-encoding":
            chunked = b"chunked" in val.lower()
        elif key == b"location":
            try:
                location = val.decode()
            except Exception:
                location = None
    return status, length, chunked, location


def _read_exact(s, mv, n, sink, state, on_progress):
    """Read exactly n body bytes through the shared buffer into sink."""
    while n > 0:
        want = n if n < len(mv) else len(mv)
        got = s.readinto(mv[:want])
        if not got:
            return False
        if sink(mv[:got]) is False:
            return False
        n -= got
        state[0] += got
        if on_progress is not None:
            try:
                on_progress(state[0], state[1])
            except Exception:
                pass
    return True


def read_body(s, length, chunked, sink, on_progress=None, buf=None):
    """Stream a response body into sink(memoryview). Returns the byte count
    or None if the body was cut short or sink returned False."""
    mv = memoryview(buf if buf is not None else bytearray(CHUNK))
    state = [0, length if length >= 0 else 0]
    if chunked:
        while True:
            line = s.readline()
            if not line:
                return None
            try:
                n = int(line.split(b";")[0].strip(), 16)
            except ValueError:
                return None
            if n == 0:
                break
            if not _read_exact(s, mv, n, sink, state, on_progress):
                return None
            s.readline()
        return state[0]
    if length >= 0:
        if not _read_exact(s, mv, length, sink, state, on_progress):
            return None
        return state[0]
    # No length and not chunked: read until the server closes.
    while True:
        got = s.readinto(mv)
        if not got:
            break
        if sink(mv[:got]) is False:
            return None
        state[0] += got
    return state[0]


def stream(url, sink, on_progress=None, timeout_s=15, buf=None):
    """GET url (following HTTPS redirects) and stream the body to sink.

    on_progress(received, total) is called as bytes arrive. Returns the
    number of body bytes, or None on any failure."""
    if not _NET:
        return None
    current = url
    auth_allowed = True
    for _ in range(MAX_REDIRECTS + 1):
        parsed = _split(current)
        if parsed is None:
            return None
        host, port, path = parsed
        auth = _token_for(host) if auth_allowed else ""
        s = raw = None
        try:
            s, raw = _open(host, port, path, timeout_s, auth)
            status, length, chunked, location = read_head(s)
            if status == 200:
                return read_body(s, length, chunked, sink, on_progress, buf)
            if status in (301, 302, 303, 307, 308) and location:
                if location.startswith("/"):
                    location = "https://" + host + location
                nxt = _split(location)
                if nxt is None:
                    return None
                if nxt[0] != host:
                    # Never forward a token to a CDN or another host.
                    auth_allowed = False
                current = location
                continue
            _bc("HTTP %d %s" % (status, host))
            return None
        except Exception as e:
            _bc("fail %s: %s" % (host, e))
            return None
        finally:
            for h in (s, raw):
                try:
                    if h is not None:
                        h.close()
                except Exception:
                    pass
            gc.collect()
    return None


def download_file(url, path, size, on_progress=None, buf=None):
    """Stream url into path. True only when exactly `size` bytes landed
    (size < 0 skips the check). A failed download removes the file."""
    try:
        f = open(path, "wb")
    except OSError:
        return False
    try:
        n = stream(url, f.write, on_progress, buf=buf)
    finally:
        f.close()
    if n is None or (size >= 0 and n != size):
        _bc("download %s: got %s of %d bytes" % (path, n, size))
        try:
            import os
            os.remove(path)
        except Exception:
            pass
        return False
    return True

