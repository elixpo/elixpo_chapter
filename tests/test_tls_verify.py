"""Certificate verification for every HTTPS connection on the badge (#110).

oreoOS._http.tls_wrap() must verify the chain against oreoOS/tls_roots.py
and the server's name, refuse when the clock is not set, and never fall
back to an unverified connection. The ssl module is faked (MicroPython's
tls semantics), so no network or hardware is needed.

    python3 -m unittest tests.test_tls_verify -v
"""

import hashlib
import importlib.util
import re
import socket
import ssl
import sys
import time
import types
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent


def load(relative_path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


roots_mod = load("oreoOS/tls_roots.py", "oreo_tls_roots_under_test")
gen = load("tools/gen_ca_bundle.py", "oreo_gen_ca_bundle_under_test")


# ── a fake of MicroPython's ssl / tls module ───────────────────────────

class FakeSSL:
    PROTOCOL_TLS_CLIENT = 0
    CERT_NONE = 0
    CERT_OPTIONAL = 1
    CERT_REQUIRED = 2

    def __init__(self, wrap_error=None, load_error=None):
        self.wrap_error = wrap_error
        self.load_error = load_error
        self.contexts = []
        ssl_mod = self

        class SSLContext:
            def __init__(self, protocol):
                self.protocol = protocol
                # MicroPython's ssl.SSLContext starts at CERT_NONE.
                self.verify_mode = FakeSSL.CERT_NONE
                self.cadata = []
                self.wraps = []
                ssl_mod.contexts.append(self)

            def load_verify_locations(self, cafile=None, cadata=None):
                if ssl_mod.load_error is not None:
                    raise ssl_mod.load_error
                self.cadata.append(cadata)

            def wrap_socket(self, sock, server_side=False,
                            do_handshake_on_connect=True,
                            server_hostname=None):
                # Snapshot of the security settings at handshake time.
                self.wraps.append((self.verify_mode, server_hostname,
                                   len(self.cadata)))
                if ssl_mod.wrap_error is not None:
                    raise ssl_mod.wrap_error
                return ("tls", sock, server_hostname)

        self.SSLContext = SSLContext


class FakeTimeutil:
    def __init__(self, clock, sets_clock=True, busy_polls=0):
        self.clock = clock
        self.sets_clock = sets_clock
        self.busy_polls = busy_polls
        self.syncs = 0

    def sync_busy(self):
        if self.busy_polls > 0:
            self.busy_polls -= 1
            if self.busy_polls == 0 and self.sets_clock:
                self.clock[0] = 2026     # the netsvc sync finished
            return True
        return False

    def sync_from_ntp(self, timezone_offset_h=None):
        self.syncs += 1
        if self.sets_clock:
            self.clock[0] = 2026
            return True, "synced"
        return False, "ntp timeout"


class _Case(unittest.TestCase):
    def setUp(self):
        self.http = load("oreoOS/_http.py", "oreo_http_tls_under_test")
        self.ssl = FakeSSL()
        self.http._ssl = self.ssl
        self.clock = [2026]
        self.timeutil = FakeTimeutil(self.clock)
        pkg = types.ModuleType("oreoOS")
        pkg.__path__ = []
        pkg.tls_roots = roots_mod
        pkg.timeutil = self.timeutil
        patcher = mock.patch.dict(sys.modules, {"oreoOS": pkg})
        patcher.start()
        self.addCleanup(patcher.stop)
        clock = self.clock
        self.http.time = types.SimpleNamespace(
            localtime=lambda *a: (clock[0], 11, 11, 0, 0, 0, 0, 0),
            ticks_ms=lambda: int(time.monotonic() * 1000),
            ticks_diff=lambda a, b: a - b,
            ticks_add=lambda a, b: a + b,
            sleep_ms=lambda ms: None)
        self.http._bc = lambda msg: None


class VerifiedContextTest(_Case):
    def test_every_connection_requires_a_verified_chain_and_name(self):
        out = self.http.tls_wrap("raw", "api.github.com")
        self.assertEqual(out, ("tls", "raw", "api.github.com"))
        ctx = self.ssl.contexts[-1]
        self.assertEqual(ctx.protocol, FakeSSL.PROTOCOL_TLS_CLIENT)
        mode, hostname, n_roots = ctx.wraps[0]
        self.assertEqual(mode, FakeSSL.CERT_REQUIRED)
        self.assertEqual(hostname, "api.github.com")    # SNI + name check
        self.assertEqual(n_roots, len(roots_mod.ROOTS))

    def test_roots_are_loaded_one_der_certificate_per_call(self):
        # MicroPython's mbedTLS parses a single DER certificate per call
        # and rejects trailing bytes.
        self.http.tls_wrap("raw", "github.com")
        ctx = self.ssl.contexts[-1]
        self.assertEqual(ctx.cadata, list(roots_mod.ROOTS))
        for der in ctx.cadata:
            self.assertIsInstance(der, bytes)
            self.assertEqual(der[0], 0x30)              # DER SEQUENCE

    def test_roots_module_is_imported_lazily_and_once(self):
        self.assertIsNone(self.http._roots)
        self.http.tls_wrap("raw", "github.com")
        first = self.http._roots
        self.http.tls_wrap("raw", "github.com")
        self.assertIs(self.http._roots, first)

    def test_http_module_does_not_import_the_roots_at_import_time(self):
        src = (ROOT / "oreoOS" / "_http.py").read_text()
        top = [ln for ln in src.splitlines()
               if ln.startswith(("import ", "from "))]
        self.assertFalse([ln for ln in top if "tls_roots" in ln])


class RefusalTest(_Case):
    def _refused(self, error, reason):
        self.ssl.wrap_error = error
        mark = self.http.tls_mark()
        with self.assertRaises(self.http.TLSError) as cm:
            self.http.tls_wrap("raw", "api.github.com")
        self.assertEqual(cm.exception.reason, reason)
        self.assertEqual(cm.exception.host, "api.github.com")
        self.assertIsInstance(cm.exception, OSError)
        # One handshake, verified: no second attempt with CERT_NONE.
        wraps = [w for c in self.ssl.contexts for w in c.wraps]
        self.assertEqual(len(wraps), 1)
        self.assertEqual(wraps[0][0], FakeSSL.CERT_REQUIRED)
        self.assertEqual(self.http.tls_error_since(mark), "TLS: " + reason)
        self.assertLessEqual(len("TLS: " + reason), 34)  # Updates screen

    def test_untrusted_chain_mbedtls(self):
        self._refused(ValueError(
            "The certificate is not correctly signed by the trusted CA"),
            self.http.UNTRUSTED)

    def test_expired_or_future_certificate(self):
        self._refused(ValueError("The certificate validity has expired"),
                      self.http.DATE)

    def test_future_certificate(self):
        self._refused(ValueError(
            "The certificate validity starts in the future"), self.http.DATE)

    def test_name_mismatch(self):
        self._refused(ValueError(
            "The certificate Common Name (CN) does not match with the "
            "expected CN"), self.http.NAME)

    def test_mbedtls_error_code_without_text(self):
        self._refused(OSError(-9984, "X509 - Certificate verification failed,"
                              " e.g. CRL, CA or signature check failed"),
                      self.http.REJECTED)     # no detail: say no more

    def test_cpython_verification_errors(self):
        self._refused(ssl.SSLCertVerificationError(
            1, "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: "
               "unable to get local issuer certificate"),
            self.http.UNTRUSTED)

    def test_cpython_hostname_mismatch(self):
        self._refused(ssl.SSLCertVerificationError(
            1, "certificate verify failed: Hostname mismatch, certificate is "
               "not valid for 'evil.example'"), self.http.NAME)

    def test_network_errors_pass_through_unchanged(self):
        self.ssl.wrap_error = OSError(104, "ECONNRESET")
        mark = self.http.tls_mark()
        with self.assertRaises(OSError) as cm:
            self.http.tls_wrap("raw", "api.github.com")
        self.assertNotIsInstance(cm.exception, self.http.TLSError)
        self.assertIsNone(self.http.tls_error_since(mark))

    def test_broken_bundle_refuses(self):
        self.ssl.load_error = ValueError("invalid cert")
        with self.assertRaises(self.http.TLSError) as cm:
            self.http.tls_wrap("raw", "github.com")
        self.assertEqual(cm.exception.reason, self.http.BUNDLE)
        self.assertEqual([c.wraps for c in self.ssl.contexts], [[]])

    def test_error_mark_is_per_caller(self):
        mark = self.http.tls_mark()
        self.assertIsNone(self.http.tls_error_since(mark))
        self.ssl.wrap_error = ValueError("The certificate validity has expired")
        with self.assertRaises(self.http.TLSError):
            self.http.tls_wrap("raw", "github.com")
        later = self.http.tls_mark()
        self.assertTrue(self.http.tls_error_since(mark))
        self.assertIsNone(self.http.tls_error_since(later))
        seq, reason, host = self.http.last_tls_error()
        self.assertEqual((reason, host), (self.http.DATE, "github.com"))


class ClockTest(_Case):
    def test_unset_clock_runs_ntp_first(self):
        self.clock[0] = 2000
        self.http.tls_wrap("raw", "github.com")
        self.assertEqual(self.timeutil.syncs, 1)
        self.assertEqual(self.ssl.contexts[-1].wraps[0][0],
                         FakeSSL.CERT_REQUIRED)

    def test_clock_that_cannot_be_set_refuses_without_a_handshake(self):
        self.clock[0] = 2000
        self.timeutil.sets_clock = False
        mark = self.http.tls_mark()
        with self.assertRaises(self.http.TLSError) as cm:
            self.http.tls_wrap("raw", "github.com")
        self.assertEqual(cm.exception.reason, self.http.CLOCK)
        self.assertEqual(self.http.tls_error_since(mark), "TLS: clock not set")
        self.assertEqual([c.wraps for c in self.ssl.contexts], [[]])

    def test_failed_ntp_is_not_retried_on_every_request(self):
        self.clock[0] = 2000
        self.timeutil.sets_clock = False
        for _ in range(3):
            with self.assertRaises(self.http.TLSError):
                self.http.tls_wrap("raw", "github.com")
        self.assertEqual(self.timeutil.syncs, 1)
        self.http._ntp_try_ms -= self.http.CLOCK_RETRY_MS
        with self.assertRaises(self.http.TLSError):
            self.http.tls_wrap("raw", "github.com")
        self.assertEqual(self.timeutil.syncs, 2)

    def test_waits_for_a_sync_already_running(self):
        self.clock[0] = 2000
        self.timeutil.busy_polls = 3
        self.http.tls_wrap("raw", "github.com")
        self.assertEqual(self.timeutil.syncs, 0)    # netsvc's sync was used

    def test_set_clock_needs_no_sync(self):
        self.http.tls_wrap("raw", "github.com")
        self.assertEqual(self.timeutil.syncs, 0)


class EscapeHatchTest(_Case):
    def test_insecure_debug_is_off_by_default(self):
        self.assertFalse(self.http.INSECURE_DEBUG)

    def test_insecure_debug_skips_verification_only_when_set(self):
        self.http.INSECURE_DEBUG = True
        self.clock[0] = 2000
        self.http.tls_wrap("raw", "github.com")
        self.assertEqual(self.ssl.contexts[-1].wraps[0][0], FakeSSL.CERT_NONE)

    def test_no_other_cert_none_path(self):
        src = (ROOT / "oreoOS" / "_http.py").read_text()
        self.assertEqual(src.count("CERT_NONE"), 1)
        for rel in ("oreoOS", "oreoWare", "apps", "apps_market"):
            for p in (ROOT / rel).rglob("*.py"):
                if p.name == "_http.py":
                    continue
                text = p.read_text(errors="replace")
                self.assertNotIn("CERT_NONE", text, p)
                self.assertNotIn("wrap_socket", text, p)


class FakeSock:
    def settimeout(self, t):
        pass

    def connect(self, addr):
        pass

    def close(self):
        pass


class GetUrlTest(_Case):
    def test_refused_certificate_fails_the_request_and_is_reported(self):
        self.http._socket = types.SimpleNamespace(
            getaddrinfo=lambda h, p: [(0, 0, 0, "", (h, p))],
            socket=FakeSock)
        self.ssl.wrap_error = ValueError(
            "The certificate is not correctly signed by the trusted CA")
        mark = self.http.tls_mark()
        self.assertIsNone(self.http.get_url("https://api.github.com/x"))
        self.assertEqual(self.http.tls_error_since(mark),
                         "TLS: untrusted certificate")
        self.assertFalse(self.http.download_to_file(
            "https://github.com/a", "/nonexistent/x", keep_alive=False))


class RealSSLTest(unittest.TestCase):
    """The same calls against CPython's real ssl module: the bundle loads
    one DER root at a time and the context is set up for verification."""

    def test_context_with_real_ssl(self):
        http = load("oreoOS/_http.py", "oreo_http_real_ssl_under_test")
        http._bc = lambda msg: None
        http.ensure_clock = lambda: True
        http._roots = roots_mod.ROOTS
        a, b = socket.socketpair()
        b.close()                       # the handshake hits EOF at once
        try:
            with self.assertRaises(OSError) as cm:
                http.tls_wrap(a, "api.github.com")
            # A dead peer is a network error, not a certificate refusal.
            self.assertNotIsInstance(cm.exception, http.TLSError)
        finally:
            a.close()

    def test_every_root_parses(self):
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        for der in roots_mod.ROOTS:
            ctx.load_verify_locations(cadata=der)
        self.assertEqual(ctx.cert_store_stats()["x509_ca"],
                         len(roots_mod.ROOTS))


class BundleTest(unittest.TestCase):
    SRC = (ROOT / "oreoOS" / "tls_roots.py").read_text()

    def test_comments_match_the_der(self):
        fps = re.findall(r"#    sha256: ([0-9A-F:]+)", self.SRC)
        self.assertEqual(len(fps), len(roots_mod.ROOTS))
        for fp, der in zip(fps, roots_mod.ROOTS):
            self.assertEqual(fp.replace(":", "").lower(),
                             hashlib.sha256(der).hexdigest())

    def test_docs_list_every_root(self):
        doc = (ROOT / "docs" / "TLS.md").read_text()
        for der in roots_mod.ROOTS:
            self.assertIn(hashlib.sha256(der).hexdigest().upper(), doc)

    def test_roots_outlive_the_badge_for_years(self):
        for exp in re.findall(r"#    expires: (.+)", self.SRC):
            year = int(exp.split()[-2])
            self.assertGreaterEqual(year, 2035, exp)

    def test_bundle_stays_small(self):
        # Kept on the heap once the first TLS connection imports it.
        self.assertLess(sum(len(d) for d in roots_mod.ROOTS), 12 * 1024)

    def test_generator_matches_the_module(self):
        names = [stem for stem, _why in gen.ROOTS]
        self.assertEqual(len(names), len(roots_mod.ROOTS))

    def test_every_https_host_in_the_code_is_covered(self):
        hosts = set()
        pat = re.compile(r"https://([a-z0-9.-]+\.[a-z]{2,})[/\"'?]")
        for rel in ("oreoOS", "oreoWare", "apps", "apps_market"):
            for p in (ROOT / rel).rglob("*.py"):
                for m in pat.finditer(p.read_text(errors="replace")):
                    hosts.add(m.group(1))
        # Hosts written without a scheme.
        wifi = (ROOT / "oreoWare" / "wifi.py").read_text()
        hosts.update(re.findall(r'host = "([a-z0-9.-]+)"', wifi))
        missing = sorted(h for h in hosts if h not in gen.HOSTS)
        self.assertEqual(missing, [], "add to tools/gen_ca_bundle.py HOSTS "
                         "and run --check-hosts")

    def test_shipped_by_deploy_and_ota(self):
        self.assertIn("oreoOS/tls_roots.py",
                      (ROOT / "tools" / "deploy.py").read_text())
        self.assertIn('"oreoOS/tls_roots.py"',
                      (ROOT / "tools" / "build_release.py").read_text())


class ScreensTest(unittest.TestCase):
    """The Updates, App Store, Commits and Weather screens name a TLS
    failure instead of a generic one."""

    def _fake_http(self, msg):
        return types.SimpleNamespace(tls_mark=lambda: 1,
                                     tls_error_since=lambda m: msg)

    def test_store_reports_tls_errors(self):
        store = load("oreoOS/store.py", "oreo_store_tls_under_test")
        pkg = types.ModuleType("oreoOS")
        pkg.__path__ = []
        pkg._http = self._fake_http("TLS: untrusted certificate")
        with mock.patch.dict(sys.modules, {"oreoOS": pkg}):
            self.assertEqual(store._tls_error(store._tls_mark(), "x"),
                             "TLS: untrusted certificate")
            self.assertTrue(store.is_tls_error("TLS: clock not set"))
            pkg._http = self._fake_http(None)
            self.assertEqual(store._tls_error(1, "download failed"),
                             "download failed")
        # An OS without verified TLS: no mark, the old message.
        self.assertEqual(store._tls_error(None, "download failed"),
                         "download failed")

    def test_store_fetch_index_reports_tls(self):
        store = load("oreoOS/store.py", "oreo_store_tls2_under_test")
        pkg = types.ModuleType("oreoOS")
        pkg.__path__ = []
        pkg._http = types.SimpleNamespace(
            tls_mark=lambda: 0,
            tls_error_since=lambda m: "TLS: certificate date invalid",
            get_url=lambda *a, **k: None)
        store.wifi_up = lambda: True
        with mock.patch.dict(sys.modules, {"oreoOS": pkg}):
            self.assertEqual(store.fetch_index(),
                             (None, "TLS: certificate date invalid"))

    def test_apps_use_the_tls_helpers(self):
        for rel in ("apps/updates/src/app.py", "apps/store/src/app.py",
                    "apps/commits/src/app.py",
                    "apps_market/weather/src/app.py"):
            text = (ROOT / rel).read_text()
            if "updates/src" in rel:
                # Updates shows oreoOS.ota.error_text(), which carries the
                # TLS reason ("TLS: untrusted certificate") from _http.
                self.assertIn("error_text", text, rel)
                self.assertIn("TLS: ", (ROOT / "oreoOS" / "_http.py").read_text())
                continue
            self.assertIn("tls_error_since", text if "store/src" not in rel
                          else (ROOT / "oreoOS" / "store.py").read_text(), rel)


if __name__ == "__main__":
    unittest.main()
