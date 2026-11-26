"""Host tests for oreoOS/_http.download_to_file (OTA streaming downloads).

A local HTTP/1.1 server stands in for github.com and its release-asset CDN.
TLS is replaced with plain sockets; everything above the socket (redirects,
keep-alive reuse, chunked bodies, SHA-256 checks, partial-file cleanup) is
the real code.

    python3 -m unittest tests.test_ota_download -v
"""

import contextlib
import hashlib
import importlib.util
import io
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


class Server:
    """Keep-alive HTTP/1.1 server with scripted responses."""

    def __init__(self, files):
        self.files = files
        self.accepts = 0
        self.requests = []
        self.sock = socket.socket()
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen(8)
        self.port = self.sock.getsockname()[1]
        self.drop_next_idle = False
        threading.Thread(target=self.loop, daemon=True).start()

    def loop(self):
        while True:
            try:
                c, _ = self.sock.accept()
            except OSError:
                return
            self.accepts += 1
            threading.Thread(target=self.serve, args=(c,), daemon=True).start()

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
                host = [l.split(":", 1)[1].strip() for l in lines
                        if l.lower().startswith("host:")][0]
                self.requests.append((host, path))
                resp, close = self.respond(host, path)
                try:
                    c.sendall(resp)
                except OSError:
                    return
                if close:
                    return
                if self.drop_next_idle:
                    self.drop_next_idle = False
                    return

    def respond(self, host, path):
        if host == "github.com" and path.startswith("/dl/"):
            name = path[4:]
            body = b"<html>redirecting</html>"
            return (b"HTTP/1.1 302 Found\r\nLocation: https://assets.example/"
                    + name.encode() + b"?sig=1\r\nContent-Length: "
                    + str(len(body)).encode() + b"\r\n\r\n" + body), False
        name = path.split("?")[0].lstrip("/")
        if name == "chunked":
            data = self.files["chunked"]
            out = b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n"
            for i in range(0, len(data), 3000):
                part = data[i:i + 3000]
                out += b"%x;ext=1\r\n" % len(part) + part + b"\r\n"
            return out + b"0\r\nX-Trailer: y\r\n\r\n", False
        if name == "eof":
            return (b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n"
                    + self.files["eof"]), True
        if name in self.files:
            data = self.files[name]
            return (b"HTTP/1.1 200 OK\r\nContent-Length: "
                    + str(len(data)).encode() + b"\r\n\r\n" + data), False
        return b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n", False


def load_http(port):
    pkg = types.ModuleType("oreoOS")
    pkg.__path__ = []
    sys.modules["oreoOS"] = pkg
    spec = importlib.util.spec_from_file_location(
        "oreo_http_client_under_test", ROOT / "oreoOS/_http.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    t = types.SimpleNamespace(
        ticks_ms=lambda: int(time.monotonic() * 1000),
        ticks_diff=lambda a, b: a - b,
        ticks_add=lambda a, b: a + b)
    mod.time = t
    mod._open_conn = lambda host, p, timeout: (
        None, socket.create_connection(("127.0.0.1", port), timeout=timeout))
    return mod


def sha(b):
    return hashlib.sha256(b).hexdigest()


class DownloadTest(unittest.TestCase):
    def setUp(self):
        self.files = {"a.py": os.urandom(70_000), "b.py": os.urandom(5),
                      "chunked": os.urandom(40_000), "eof": os.urandom(9000)}
        self.srv = Server(self.files)
        self.h = load_http(self.srv.port)
        self.tmp = tempfile.TemporaryDirectory()
        self.quiet = contextlib.redirect_stdout(io.StringIO())
        self.quiet.__enter__()

    def tearDown(self):
        self.quiet.__exit__(None, None, None)
        self.h.close_pool()
        self.tmp.cleanup()

    def path(self, n):
        return os.path.join(self.tmp.name, n)

    def get(self, name, url=None, want=None, **kw):
        url = url or "https://github.com/dl/" + name
        return self.h.download_to_file(url, self.path(name),
                                       want if want is not None else
                                       sha(self.files[name]), **kw)

    def test_redirect_and_reuse(self):
        for _ in range(3):
            self.assertTrue(self.get("a.py"))
            self.assertTrue(self.get("b.py"))
        self.assertEqual(Path(self.path("a.py")).read_bytes(), self.files["a.py"])
        self.assertEqual(Path(self.path("b.py")).read_bytes(), self.files["b.py"])
        # 12 requests (6 redirects + 6 assets) over 2 connections, one
        # per host, instead of 12 fresh TLS handshakes.
        self.assertEqual(len(self.srv.requests), 12)
        self.assertEqual(self.srv.accepts, 2)

    def test_without_keep_alive_opens_per_request(self):
        self.assertTrue(self.get("a.py", keep_alive=False))
        self.assertTrue(self.get("b.py", keep_alive=False))
        self.assertEqual(self.srv.accepts, 4)

    def test_chunked(self):
        self.assertTrue(self.get("chunked", url="https://assets.example/chunked"))
        self.assertEqual(Path(self.path("chunked")).read_bytes(),
                         self.files["chunked"])
        self.assertTrue(self.get("b.py", url="https://assets.example/b.py"))
        self.assertEqual(self.srv.accepts, 1)

    def test_body_to_eof(self):
        self.assertTrue(self.get("eof", url="https://assets.example/eof"))
        self.assertEqual(Path(self.path("eof")).read_bytes(), self.files["eof"])

    def test_sha_mismatch_removes_file(self):
        self.assertFalse(self.get("a.py", want="0" * 64))
        self.assertFalse(os.path.exists(self.path("a.py")))
        # The next download still works.
        self.assertTrue(self.get("b.py"))

    def test_stale_pooled_connection_is_retried(self):
        self.assertTrue(self.get("b.py", url="https://assets.example/b.py"))
        self.srv.drop_next_idle = True
        self.assertTrue(self.get("b.py", url="https://assets.example/b.py"))
        time.sleep(0.05)
        self.assertTrue(self.get("a.py", url="https://assets.example/a.py"))
        self.assertEqual(Path(self.path("a.py")).read_bytes(), self.files["a.py"])

    def test_404_and_size_cap(self):
        self.assertFalse(self.h.download_to_file(
            "https://assets.example/missing", self.path("m")))
        self.assertFalse(self.get("a.py", max_bytes=1000))
        self.assertFalse(os.path.exists(self.path("a.py")))


class ApplyTest(unittest.TestCase):
    """ota.apply_pending moves staged files into place (rename, no copy)."""

    def test_apply_moves_files_and_is_restartable(self):
        import json
        pkg = types.ModuleType("oreoOS")
        pkg.__path__ = []
        sys.modules["oreoOS"] = pkg
        spec = importlib.util.spec_from_file_location(
            "oreo_ota_under_test", ROOT / "oreoOS/ota.py")
        ota = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ota)
        with tempfile.TemporaryDirectory() as tmp:
            cwd = os.getcwd()
            os.chdir(tmp)
            try:
                ota.STAGE_DIR = "_ota"
                os.makedirs("_ota/oreoOS")
                os.makedirs("oreoOS")
                Path("oreoOS/a.py").write_text("old")
                Path("_ota/oreoOS/a.py").write_text("new a")
                Path("_ota/oreoOS/b.py").write_text("new b")
                files = [{"path": "oreoOS/a.py"}, {"path": "oreoOS/b.py"},
                         {"path": "oreoOS/unchanged.py"}]
                Path("_ota/manifest.json").write_text(
                    json.dumps({"version": "v9.9.9", "files": files}))
                self.assertEqual(ota.apply_pending(), "v9.9.9")
                self.assertEqual(Path("oreoOS/a.py").read_text(), "new a")
                self.assertEqual(Path("oreoOS/b.py").read_text(), "new b")
                self.assertFalse(os.path.exists("_ota"))
                self.assertIsNone(ota.apply_pending())
                self.assertEqual(ota._sha256_file("oreoOS/a.py"),
                                 sha(b"new a"))
            finally:
                os.chdir(cwd)


if __name__ == "__main__":
    unittest.main()
