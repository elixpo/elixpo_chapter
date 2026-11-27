"""Weather's automatic location (oreoOS.geo) and the DISPLAY_DESIGNATION alias."""

import importlib.util
import json
import shutil
import sys
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(relative_path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _Env(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.state = load("oreoOS/state.py", "oreo_state_geo_test")
        self.state.STATE_DIR = self.tmp + "/state"
        self.http = types.ModuleType("oreoOS._http")
        self.http.calls = []
        self.http.replies = {}

        def get_url(url, **kw):
            self.http.calls.append(url)
            r = self.http.replies.get(url.split("?")[0])
            if isinstance(r, Exception):
                raise r
            return r
        self.http.get_url = get_url
        pkg = types.ModuleType("oreoOS")
        pkg.state = self.state
        pkg._http = self.http
        self.secrets = types.ModuleType("secrets")
        mods = {"oreoOS": pkg, "oreoOS.state": self.state, "oreoOS._http": self.http,
                "secrets": self.secrets}
        saved = {k: sys.modules.get(k) for k in mods}
        sys.modules.update(mods)

        def restore():
            for k, v in saved.items():
                if v is None:
                    sys.modules.pop(k, None)
                else:
                    sys.modules[k] = v
        self.addCleanup(restore)
        self.geo = load("oreoOS/geo.py", "oreo_geo_under_test")
        pkg.geo = self.geo
        sys.modules["oreoOS.geo"] = self.geo
        self.addCleanup(sys.modules.pop, "oreoOS.geo", None)


IPWHO = "https://ipwho.is/"
IPAPI = "https://ipapi.co/json/"


class GeoTest(_Env):
    def test_parses_both_services(self):
        g = self.geo
        got = g.parse(b'{"success":true,"latitude":22.57,"longitude":88.36,"city":"Kolkata"}',
                      g._parse_ipwho)
        self.assertEqual(got, {"lat": 22.57, "lon": 88.36, "name": "Kolkata"})
        got = g.parse('{"latitude":12.97,"longitude":77.59,"city":"Bengaluru"}', g._parse_ipapi)
        self.assertEqual(got["name"], "Bengaluru")

    def test_rejects_failures_and_nonsense(self):
        g = self.geo
        self.assertIsNone(g.parse(b'{"success":false}', g._parse_ipwho))
        self.assertIsNone(g.parse(b'{"error":true,"reason":"RateLimited"}', g._parse_ipapi))
        self.assertIsNone(g.parse(b'{"success":true,"latitude":0,"longitude":0}', g._parse_ipwho))
        self.assertIsNone(g.parse(b'{"success":true,"latitude":95,"longitude":10}', g._parse_ipwho))
        self.assertIsNone(g.parse(b"not json", g._parse_ipwho))

    def test_falls_back_to_the_second_service_and_remembers(self):
        self.http.replies[IPWHO] = None
        self.http.replies[IPAPI] = b'{"latitude":12.97,"longitude":77.59,"city":"Bengaluru"}'
        got = self.geo.lookup()
        self.assertEqual((got["lat"], got["lon"]), (12.97, 77.59))
        self.assertEqual(self.state.load("geo", {})["name"], "Bengaluru")
        # Once per boot: a second lookup does not go to the network again.
        n = len(self.http.calls)
        self.assertEqual(self.geo.lookup()["name"], "Bengaluru")
        self.assertEqual(len(self.http.calls), n)

    def test_unreachable_services_give_the_last_known_place(self):
        self.state.save("geo", {"lat": 22.57, "lon": 88.36, "name": "Kolkata"})
        self.http.replies[IPWHO] = OSError("no route")
        self.http.replies[IPAPI] = None
        self.assertEqual(self.geo.lookup()["name"], "Kolkata")

    def test_nothing_known_gives_none(self):
        self.assertIsNone(self.geo.lookup())
        self.assertIsNone(self.geo.location())

    def test_a_failed_lookup_is_retried_after_the_backoff(self):
        now = [1000]
        self.geo._ticks = lambda: now[0]
        self.http.replies[IPWHO] = OSError("captive portal")
        self.http.replies[IPAPI] = None
        self.assertIsNone(self.geo.lookup())
        self.assertEqual(len(self.http.calls), 2)
        # The network comes back; once the backoff has passed, the next
        # lookup asks again and keeps the answer.
        self.http.replies[IPWHO] = b'{"success":true,"latitude":22.57,"longitude":88.36,"city":"Kolkata"}'
        now[0] += self.geo.RETRY_MS
        self.assertEqual(self.geo.lookup()["name"], "Kolkata")
        self.assertEqual(self.geo.location()["name"], "Kolkata")
        n = len(self.http.calls)
        self.geo.lookup()
        self.assertEqual(len(self.http.calls), n)

    def test_a_failed_lookup_is_not_repeated_within_the_backoff(self):
        now = [1000]
        self.geo._ticks = lambda: now[0]
        self.http.replies[IPWHO] = None
        self.http.replies[IPAPI] = None
        self.assertIsNone(self.geo.lookup())
        n = len(self.http.calls)
        self.http.replies[IPWHO] = b'{"success":true,"latitude":22.57,"longitude":88.36,"city":"Kolkata"}'
        now[0] += self.geo.RETRY_MS - 1
        self.assertIsNone(self.geo.lookup())
        self.assertEqual(len(self.http.calls), n)
        # force=True skips the backoff.
        self.assertEqual(self.geo.lookup(force=True)["name"], "Kolkata")


class WeatherAutoLocationTest(_Env):
    def setUp(self):
        super().setUp()
        for name in ("oreoOS.api", "oreoOS.theme", "oreoOS.widgets", "oreoOS.cache"):
            if name not in sys.modules:
                stub = types.ModuleType(name)
                stub.SCREEN_W, stub.SCREEN_H, stub.HEADER_H, stub.HINT_H = 320, 240, 22, 22
                sys.modules[name] = stub
                setattr(sys.modules["oreoOS"], name.split(".")[1], stub)
                self.addCleanup(sys.modules.pop, name, None)
        sys.modules["oreoOS"].App = object
        self.w = load("apps_market/weather/src/app.py", "weather_geo_test")
        self.fetched = []
        self.w._fetch_owm = lambda lat, lon, key: self.fetched.append((lat, lon, key)) or {"ok": 1}

    def test_unpinned_location_uses_the_badge_location(self):
        self.http.replies[IPWHO] = b'{"success":true,"latitude":22.57,"longitude":88.36,"city":"Kolkata"}'
        self.w._cfg = (None, None, "k")
        self.assertEqual(self.w._fetch_cfg(), {"ok": 1})
        self.assertEqual(self.fetched, [(22.57, 88.36, "k")])

    def test_pinned_location_never_asks_the_network(self):
        self.w._cfg = (12.97, 77.59, "k")
        self.w._fetch_cfg()
        self.assertEqual(self.http.calls, [])
        self.assertEqual(self.fetched, [(12.97, 77.59, "k")])

    def test_no_location_found_fetches_nothing(self):
        self.w._cfg = (None, None, "k")
        self.assertIsNone(self.w._fetch_cfg())
        self.assertEqual(self.fetched, [])


class DesignationAliasTest(_Env):
    def setUp(self):
        super().setUp()
        self.profile = load("oreoOS/profile.py", "oreo_profile_alias_test")
        self.profile.PATH = self.tmp + "/profile.json"

    def test_either_name_reads_the_same_value(self):
        self.secrets.DESIGNATION = "from secrets.py"
        self.assertEqual(self.profile.get("DISPLAY_DESIGNATION"), "from secrets.py")
        Path(self.profile.PATH).write_text(json.dumps({"DISPLAY_DESIGNATION": "from json"}))
        self.profile.reload()
        # profile.json wins over secrets.py even under the other name.
        self.assertEqual(self.profile.get("DESIGNATION"), "from json")
        self.assertEqual(self.profile.get("DISPLAY_DESIGNATION"), "from json")

    def test_set_with_the_old_name_stores_the_new_one(self):
        Path(self.profile.PATH).write_text(json.dumps({"DESIGNATION": "old"}))
        self.profile.reload()
        data = self.profile.save({"DESIGNATION": "new"})
        self.assertEqual(data, {"DISPLAY_DESIGNATION": "new"})
        self.assertEqual(self.profile.get("DESIGNATION"), "new")


if __name__ == "__main__":
    unittest.main()
