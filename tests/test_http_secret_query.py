"""oreoOS._http keeps a secret query parameter out of logged/redirected URLs."""
import importlib.util
import pathlib
import sys
import types
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


def _load():
    spec = importlib.util.spec_from_file_location("http_under_test",
                                                  ROOT / "oreoOS" / "_http.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class SecretQueryTest(unittest.TestCase):
    def setUp(self):
        self.h = _load()

    def test_with_query_appends(self):
        self.assertEqual(self.h._with_query("/a?x=1", "k=s"), "/a?x=1&k=s")
        self.assertEqual(self.h._with_query("/a", "k=s"), "/a?k=s")
        self.assertEqual(self.h._with_query("/a", None), "/a")

    def test_query_reaches_request_but_not_logs_and_drops_cross_host(self):
        h = self.h
        calls, logs = [], []
        h._bc = logs.append
        replies = [
            (302, b"HTTP/1.1 302 Found\r\nLocation: https://cdn.example.org/x", b""),
            (200, b"HTTP/1.1 200 OK", b"ok"),
        ]

        def fake_once(url, accept, timeout_s, auth, allow_auto_auth=True,
                      on_progress=None, secret_query=None):
            calls.append((url, secret_query))
            return replies.pop(0)
        h._get_once = fake_once
        h._header_value = lambda head, name: "https://cdn.example.org/x"
        body = h.get_url("https://api.example.org/w?lat=1", secret_query="appid=SECRET")
        self.assertEqual(body, b"ok")
        self.assertEqual(calls[0], ("https://api.example.org/w?lat=1", "appid=SECRET"))
        self.assertEqual(calls[1][1], None)          # dropped after cross-host redirect
        self.assertFalse(any("SECRET" in m for m in logs))
        self.assertFalse(any("SECRET" in u for u, _ in calls))


if __name__ == "__main__":
    unittest.main()
