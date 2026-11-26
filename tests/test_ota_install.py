"""Host tests for OTA installs: the failure badges hit, and its fix.

The failure: GitHub serves release assets from four anycast addresses
(185.199.108-111.133) and a network may black-hole one of them. The badge's
resolver (lwIP) returns ONE address and caches it, so a badge that drew the
dead one timed out on the manifest and every file. oreoOS._http now tries
other addresses, asking the DNS server directly for every A record.

Here a local HTTP server stands in for github.com and its CDN, a local UDP
server for the DNS resolver, and a fake socket layer black-holes one address
the way the network does. TLS is replaced with the plain socket; the HTTP,
redirect, retry, hashing, staging and sealing code is the real one.

    python3 -m unittest tests.test_ota_install -v
"""

import contextlib
import hashlib
import importlib.util
import io
import json
import os
import socket
import sys
import tempfile
import threading
import time
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_ota_download import Server as _KeepAliveServer  # noqa: E402


class Server(_KeepAliveServer):
    """test_ota_download's server, also honouring "Connection: close"
    (get_url() sends it; GitHub then ends the response with EOF)."""

    def serve(self, c):
        buf = b""
        with c:
            while True:
                while b"\r\n\r\n" not in buf:
                    try:
                        d = c.recv(4096)
                    except OSError:
                        return
                    if not d:
                        return
                    buf += d
                head, _, buf = buf.partition(b"\r\n\r\n")
                lines = head.decode().split("\r\n")
                path = lines[0].split(" ")[1]
                hdrs = {l.split(":", 1)[0].strip().lower(): l.split(":", 1)[1].strip()
                        for l in lines[1:] if ":" in l}
                self.requests.append((hdrs["host"], path))
                resp, close = self.respond(hdrs["host"], path)
                try:
                    c.sendall(resp)
                except OSError:
                    return
                if close or hdrs.get("connection", "").lower() == "close":
                    return

DEAD = "185.199.109.133"
CDN_IPS = ["185.199.108.133", DEAD, "185.199.110.133", "185.199.111.133"]


def sha(b):
    return hashlib.sha256(b).hexdigest()


# ── a DNS server that answers every A query with CDN_IPS ──────────────────

def dns_reply(query, ips):
    qid = query[:2]
    # question ends after the name's zero byte + QTYPE + QCLASS
    end = query.index(b"\x00", 12) + 5
    question = query[12:end]
    out = bytearray(qid + b"\x81\x80" + b"\x00\x01"
                    + len(ips).to_bytes(2, "big") + b"\x00\x00\x00\x00")
    out += question
    for ip in ips:
        out += b"\xc0\x0c\x00\x01\x00\x01\x00\x00\x00\x3c\x00\x04"
        out += bytes(int(x) for x in ip.split("."))
    return bytes(out)


class DNSServer:
    def __init__(self, ips):
        self.ips = ips
        self.queries = 0
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(("127.0.0.1", 0))
        self.port = self.sock.getsockname()[1]
        threading.Thread(target=self.loop, daemon=True).start()

    def loop(self):
        while True:
            try:
                q, addr = self.sock.recvfrom(512)
            except OSError:
                return
            self.queries += 1
            self.sock.sendto(dns_reply(q, self.ips), addr)


# ── the badge's socket layer, with one black-holed address ───────────────

class Net:
    """Stands in for MicroPython's socket module inside oreoOS._http."""

    AF_INET = socket.AF_INET
    SOCK_DGRAM = socket.SOCK_DGRAM

    def __init__(self, http_port, dns_port):
        self.http_port = http_port
        self.dns_port = dns_port
        self.resolve = {"github.com": "140.82.112.3",
                        "assets.example": DEAD}      # lwIP's one cached answer
        self.dead = {DEAD}
        self.connects = []

    def getaddrinfo(self, host, port):
        if host == "dns.test":
            return [(2, 2, 17, "", ("127.0.0.1", self.dns_port))]
        return [(2, 1, 6, "", (self.resolve[host], port))]

    def socket(self, *args):
        if len(args) > 1 and args[1] == socket.SOCK_DGRAM:
            return socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        return TCP(self)


class TCP:
    def __init__(self, net):
        self.net = net
        self.s = None

    def settimeout(self, t):
        if self.s is not None:
            self.s.settimeout(t)

    def connect(self, addr):
        self.net.connects.append(addr[0])
        if addr[0] in self.net.dead:
            raise OSError(116, "ETIMEDOUT")
        self.s = socket.create_connection(("127.0.0.1", self.net.http_port),
                                          timeout=5)

    # MicroPython stream methods, used by get_url() and download_to_file().
    def write(self, data):
        self.s.sendall(bytes(data))
        return len(data)

    def read(self, n):
        return self.s.recv(n)

    def readinto(self, mv):
        return self.s.recv_into(mv)

    def close(self):
        if self.s is not None:
            self.s.close()


def load_stack(net, dns=True):
    """oreoOS._http and oreoOS.ota, wired to `net` (TLS off: plain socket)."""
    pkg = types.ModuleType("oreoOS")
    pkg.__path__ = []
    sys.modules["oreoOS"] = pkg
    cfg = types.ModuleType("oreoOS.config")
    cfg.VERSION = "v2.0.12"
    cfg.GH_TOKEN = ""
    sys.modules["oreoOS.config"] = cfg
    pkg.config = cfg

    def load(name, path):
        spec = importlib.util.spec_from_file_location(name, ROOT / path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules[name] = mod
        spec.loader.exec_module(mod)
        return mod

    h = load("oreoOS._http", "oreoOS/_http.py")
    h.time = types.SimpleNamespace(
        ticks_ms=lambda: int(time.monotonic() * 1000),
        ticks_diff=lambda a, b: a - b,
        ticks_add=lambda a, b: a + b)
    h._socket = net
    h._OK = True
    h.tls_wrap = lambda raw, host: raw
    h._dns_server = (lambda: "dns.test") if dns else (lambda: None)
    pkg._http = h
    ota = load("oreoOS.ota", "oreoOS/ota.py")
    pkg.ota = ota
    return h, ota


class Release:
    """Files + manifest served by Server, as a GitHub release would be."""

    def __init__(self, files):
        self.files = files
        self.entries = [{"path": p, "url": "https://github.com/dl/" + p.replace("/", "_"),
                         "size": len(b), "sha256": sha(b)}
                        for p, b in sorted(files.items())]
        self.manifest = {"version": "v2.0.13", "files": self.entries,
                         "notes": "What changed\n- a fix"}

    def served(self):
        out = {p.replace("/", "_"): b for p, b in self.files.items()}
        out["manifest.json"] = json.dumps(self.manifest).encode()
        return out


class _Case(unittest.TestCase):
    def setUp(self):
        self.rel = Release({
            "oreoOS/a.py": os.urandom(30_000),
            "oreoOS/splash.rv565": os.urandom(200_000),
            "apps/x/src/app.py": os.urandom(4_000),
        })
        self.srv = Server(self.rel.served())
        self.dns = DNSServer(CDN_IPS)
        self.net = Net(self.srv.port, self.dns.port)
        self.tmp = tempfile.TemporaryDirectory()
        self.cwd = os.getcwd()
        os.chdir(self.tmp.name)
        self.quiet = contextlib.redirect_stdout(io.StringIO())
        self.quiet.__enter__()

    def tearDown(self):
        self.quiet.__exit__(None, None, None)
        os.chdir(self.cwd)
        self.tmp.cleanup()

    def release(self):
        return {"version": "v2.0.13",
                "manifest_url": "https://github.com/dl/manifest.json"}


class BlackHoledAddressTest(_Case):
    def test_reproduces_failure_without_fallback(self):
        # The old behaviour: one address, no alternatives -> the manifest
        # fetch fails ("manifest fetch failed" on the badge), every time.
        h, ota = load_stack(self.net, dns=False)
        self.assertIsNone(ota.peek(self.release()))
        self.assertIn("assets.example", ota.error_text())
        self.assertIn("timed out", ota.error_text())
        self.assertTrue(ota.error_text().startswith("Reading the release"))

    def test_install_succeeds_through_another_address(self):
        h, ota = load_stack(self.net)
        ota.STAGE_DIR = "_ota"
        peeked = ota.peek(self.release())
        self.assertIsNotNone(peeked, ota.error_text())
        self.assertEqual(len(peeked["changed"]), 3)
        self.assertEqual(peeked["notes"], "What changed\n- a fix")
        seen = []
        self.assertTrue(ota.download(
            peeked, on_bytes=lambda d, t, p: seen.append((d, t))),
            ota.error_text())
        for p, b in self.rel.files.items():
            self.assertEqual(Path("_ota", p).read_bytes(), b)
        self.assertTrue(ota.is_pending())
        self.assertFalse(Path("_ota/manifest.json.tmp").exists())
        # Byte progress rises to the total.
        self.assertEqual(seen[-1][0], seen[-1][1])
        self.assertEqual(seen[-1][1], sum(len(b) for b in self.rel.files.values()))
        # The dead address was tried once, then remembered and skipped.
        self.assertEqual(self.net.connects.count(DEAD), 1)
        self.assertEqual(self.dns.queries, 1)
        # And apply puts the files in place.
        self.assertEqual(ota.apply_pending(), "v2.0.13")
        for p, b in self.rel.files.items():
            self.assertEqual(Path(p).read_bytes(), b)

    def test_every_address_dead_names_file_host_and_reason(self):
        self.net.dead = set(CDN_IPS)
        h, ota = load_stack(self.net)
        ota.STAGE_DIR = "_ota"
        peeked = {"manifest": self.rel.manifest,
                  "changed": self.rel.entries,
                  "bytes": sum(e["size"] for e in self.rel.entries)}
        self.assertFalse(ota.download(peeked))
        err = ota.last_error()
        self.assertEqual(err["step"], "download")
        self.assertEqual(err["path"], "apps/x/src/app.py")
        self.assertIn("assets.example", err["reason"])
        self.assertIn("timed out", err["reason"])
        self.assertFalse(ota.is_pending())


class InstallSafetyTest(_Case):
    def test_not_enough_space_stops_before_downloading(self):
        h, ota = load_stack(self.net)
        ota.STAGE_DIR = "_ota"
        ota._free_bytes = lambda path="/": 100 * 1024
        peeked = {"manifest": self.rel.manifest, "changed": self.rel.entries,
                  "bytes": 234_000}
        self.assertFalse(ota.download(peeked))
        self.assertEqual(ota.last_error()["step"], "space")
        self.assertIn("KB free", ota.error_text())
        self.assertEqual(self.srv.requests, [])
        self.assertFalse(ota.is_pending())

    def test_a_failing_file_is_retried(self):
        h, ota = load_stack(self.net)
        ota.STAGE_DIR = "_ota"
        respond = self.srv.respond
        fails = {"n": 1}

        def flaky(host, path):
            if "a.py" in path and host == "assets.example" and fails["n"]:
                fails["n"] -= 1
                return b"HTTP/1.1 500 Oops\r\nContent-Length: 0\r\n\r\n", True
            return respond(host, path)
        self.srv.respond = flaky
        peeked = {"manifest": self.rel.manifest, "changed": self.rel.entries,
                  "bytes": 234_000}
        self.assertTrue(ota.download(peeked), ota.error_text())
        self.assertEqual(fails["n"], 0)

    def test_checksum_mismatch_is_reported_and_nothing_sealed(self):
        h, ota = load_stack(self.net)
        ota.STAGE_DIR = "_ota"
        entries = [dict(e) for e in self.rel.entries]
        entries[0]["sha256"] = "0" * 64
        peeked = {"manifest": self.rel.manifest, "changed": entries,
                  "bytes": 234_000}
        self.assertFalse(ota.download(peeked))
        self.assertIn("checksum mismatch", ota.error_text())
        self.assertFalse(ota.is_pending())

    def test_large_file_gets_a_size_based_budget(self):
        h, ota = load_stack(self.net)
        calls = []
        h.download_to_file = lambda *a, **k: calls.append(k) or False
        ota._download_file("https://x/y", "oreoOS/splash.rv565", None,
                           404006, "_probe")
        self.assertEqual(calls[0]["timeout_s"], ota.T_FILE)
        self.assertGreaterEqual(calls[0]["total_s"], 404006 // 4096)


class GetUrlTruncationTest(unittest.TestCase):
    def test_short_body_is_a_failure_not_a_result(self):
        srv = Server({})
        srv.respond = lambda host, path: (
            b"HTTP/1.1 200 OK\r\nContent-Length: 1000\r\n"
            b"Connection: close\r\n\r\n" + b"x" * 400, True)
        net = Net(srv.port, 0)
        net.resolve["api.example"] = "1.2.3.4"
        h, ota = load_stack(net, dns=False)
        with contextlib.redirect_stdout(io.StringIO()):
            mark = h.error_mark()
            self.assertIsNone(h.get_url("https://api.example/x"))
        self.assertIn("incomplete", h.error_since(mark))


class DnsParseTest(unittest.TestCase):
    def test_parse_answers(self):
        net = Net(0, 0)
        h, _ = load_stack(net, dns=False)
        q = (b"\x12\x34\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00"
             b"\x0erelease-assets\x11githubusercontent\x03com\x00\x00\x01\x00\x01")
        r = dns_reply(q, CDN_IPS)
        self.assertEqual(h._parse_dns(r, 0x1234), CDN_IPS)
        self.assertEqual(h._parse_dns(r, 0x9999), [])
        self.assertEqual(h._parse_dns(b"\x00" * 5), [])


class LatestVersionTest(unittest.TestCase):
    def test_picks_the_highest_version_not_the_first(self):
        net = Net(0, 0)
        h, ota = load_stack(net, dns=False)
        tags = [{"name": "stable/v2.0.9"}, {"name": "stable/v2.0.13"},
                {"name": "beta/v3.0.0"}, {"name": "cli-v1.0.0"},
                {"name": "stable/v2.0.10"}]
        h.get_url = lambda *a, **k: json.dumps(tags).encode()
        ver, rel = ota.latest_version("stable")
        self.assertEqual(ver, "v2.0.13")
        self.assertTrue(rel["manifest_url"].endswith("/stable/v2.0.13/manifest.json"))

    def test_no_answer_is_explained(self):
        net = Net(0, 0)
        h, ota = load_stack(net, dns=False)

        def fail(*a, **k):
            h._note("api.github.com: timed out")
            return None
        h.get_url = fail
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(ota.latest_version("stable"), (None, None))
        self.assertEqual(ota.error_text(),
                         "Checking for updates: api.github.com: timed out")


if __name__ == "__main__":
    unittest.main()
