"""Contract tests: the CLI's badge snippets against the real FaleraOS modules.

When the CLI runs inside a FaleraOS checkout, load the real oreoWare/wifi.py
(with a fake `network` driver, as tests/test_wifi_logic.py does) and the
real oreoOS/storage.py into the FakeTransport, so a renamed or changed
badge API breaks these tests instead of the badge. Skipped when the CLI is
tested on its own.
"""

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

from fake import FakeTransport

from oreo_cli.badge import Badge

REPO = Path(__file__).resolve().parents[2]
WIFI = REPO / "oreoWare" / "wifi.py"
STORAGE = REPO / "oreoOS" / "storage.py"
STORE = REPO / "oreoOS" / "store.py"
DISPLAY = REPO / "oreoWare" / "display.py"
API = REPO / "oreoOS" / "api.py"


class FakeWLAN:
    def __init__(self, air):
        self.air = air                 # ssid -> (password, rssi)
        self._active = False
        self.connected = False
        self.status_code = 1001        # STAT_CONNECTING
        self.target = None

    def active(self, on=None):
        if on is None:
            return self._active
        self._active = bool(on)

    def disconnect(self):
        self.connected = False

    def connect(self, ssid, pw):
        self.target = ssid
        if ssid not in self.air:
            self.status_code = 201     # NO_AP_FOUND
        elif self.air[ssid][0] != pw:
            self.status_code = 202     # AUTH_FAIL
        else:
            self.connected = True
            self.status_code = 1010    # GOT_IP

    def isconnected(self):
        return self.connected

    def status(self, *a):
        if a == ("rssi",):
            return -50
        return self.status_code

    def config(self, *a, **k):
        if a == ("essid",):
            return self.target or ""
        return None

    def ifconfig(self):
        return ("10.0.0.7", "255.255.255.0", "10.0.0.1", "10.0.0.1")

    def scan(self):
        return [(s.encode(), b"\x00" * 6, 6, rssi, 3 if pw else 0, False)
                for s, (pw, rssi) in self.air.items()]


def load_module(path, name, **patch):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for k, v in patch.items():
        setattr(mod, k, v)
    return mod


@unittest.skipUnless(WIFI.exists(), "not inside a FaleraOS checkout")
class RealWifiContractTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)
        self.wlan = FakeWLAN({"Home": ("hunter2!", -48), "Cafe": ("", -71)})
        net = types.ModuleType("network")
        net.STA_IF = 0
        net.WLAN = lambda _if: self.wlan
        net.hostname = lambda *_: None
        patcher = mock.patch.dict(sys.modules, {"network": net, "_thread": None})
        patcher.start()
        self.addCleanup(patcher.stop)
        root = Path(self.fake.root)
        wifi = load_module(WIFI, "oreo_wifi_contract",
                           time=self.fake.clock,
                           _SAVED_PATH=str(root / "wifi.json"),
                           _SEEN_PATH=str(root / "wifi_seen.json"),
                           print=lambda *a, **k: None)
        wifi._secrets_networks = lambda: []
        self.wifi = wifi
        self.fake.wifi = wifi
        self.badge = Badge(self.fake)

    def test_scan(self):
        nets = self.badge.wifi_scan()
        self.assertEqual([n["ssid"] for n in nets], ["Home", "Cafe"])
        self.assertTrue(nets[0]["secure"])
        self.assertFalse(nets[1]["secure"])
        self.assertFalse(nets[0]["saved"])

    def test_connect_save_list_forget(self):
        r = self.badge.wifi_connect("Home", "hunter2!")
        self.assertEqual(r["result"], "ok")
        self.assertEqual(r["ip"], "10.0.0.7")
        self.assertTrue(r["saved"])
        saved = self.badge.wifi_saved()
        self.assertEqual([n["ssid"] for n in saved], ["Home"])
        self.assertNotIn("password", saved[0])
        self.assertTrue(saved[0]["last"])
        for out in self.fake.outputs:
            self.assertNotIn(b"hunter2!", out)
        self.assertEqual(self.badge.wifi_forget("Home"), (True, False))
        self.assertEqual(self.badge.wifi_forget("Home"), (False, False))

    def test_wrong_password_and_missing_network(self):
        self.assertEqual(self.badge.wifi_connect("Home", "nope")["result"], "bad_password")
        self.assertEqual(self.badge.wifi_connect("Gone", "x")["result"], "not_found")
        self.assertEqual(self.wifi.list_saved(), [])

    def test_save_only_and_online(self):
        self.assertTrue(self.badge.wifi_save("Cafe", ""))
        r = self.badge.wifi_online()
        self.assertTrue(r["online"])
        self.assertEqual(r["ip"], "10.0.0.7")

    def test_forgetting_a_deploy_network_is_flagged(self):
        # Networks from the deploy-time .env are merged back into the saved
        # list by the badge, so `falera wifi forget` warns about them.
        self.wifi._secrets_networks = lambda: [{"ssid": "Office", "password": "pw"}]
        self.assertTrue(self.badge.wifi_save("Cafe", ""))
        self.assertEqual(self.badge.wifi_forget("Office"), (True, True))
        self.assertEqual(self.badge.wifi_forget("Cafe"), (True, False))


@unittest.skipUnless(STORAGE.exists(), "not inside a FaleraOS checkout")
class RealStorageContractTest(unittest.TestCase):
    def test_info_uses_storage_usage(self):
        fake = FakeTransport()
        self.addCleanup(fake.cleanup)
        fake.put("/apps/gallery/assets/optimized/a.rz565", b"x" * 1000)
        fake.put("/documents/b.mdz", b"y" * 300)
        storage = load_module(STORAGE, "oreo_storage_contract", os=fake.os)
        fake.storage = storage
        info = Badge(fake).info()
        buckets = info["storage"]["buckets"]
        self.assertEqual(buckets["gallery"]["bytes"], 1000)
        self.assertEqual(buckets["documents"]["bytes"], 300)
        self.assertGreater(info["storage"]["stats"]["free"], 0)


@unittest.skipUnless(STORE.exists(), "not inside a FaleraOS checkout")
class DefaultAppsContractTest(unittest.TestCase):
    def test_rm_protects_exactly_the_built_in_apps(self):
        import ast
        from oreo_cli import commands
        tree = ast.parse(STORE.read_text(encoding="utf-8"))
        found = None
        for node in tree.body:
            if isinstance(node, ast.Assign) and any(
                    isinstance(t, ast.Name) and t.id == "DEFAULT_APPS" for t in node.targets):
                found = ast.literal_eval(node.value)
        self.assertIsNotNone(found, "DEFAULT_APPS not found in oreoOS/store.py")
        self.assertEqual(sorted(commands.DEFAULT_APPS), sorted(found))
        self.assertEqual(len(set(commands.DEFAULT_APPS)), len(commands.DEFAULT_APPS))


class _Pin:
    OUT = 1

    def __init__(self, *a, **k):
        pass

    def __call__(self, v=None):
        return 0


class _Panel:
    def __init__(self, spi, dc, cs, rst, bl):
        self.spi, self.dc, self.cs, self.bl = spi, dc, cs, bl
        self._ramwr_cmd = b"\x2c"

    def init(self):
        pass


class _FrameBuffer:
    """framebuf.FrameBuffer(RGB565) for fill/fill_rect: stores each value
    little-endian, as the real one does."""

    def __init__(self, buf, w, h, fmt):
        self.buf, self.w = buf, w

    def fill_rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                o = (yy * self.w + xx) * 2
                self.buf[o], self.buf[o + 1] = c & 0xFF, c >> 8

    def fill(self, c):
        self.fill_rect(0, 0, self.w, len(self.buf) // (2 * self.w), c)


@unittest.skipUnless(DISPLAY.exists(), "not inside a FaleraOS checkout")
class RealDisplayContractTest(unittest.TestCase):
    """`falera screenshot` against the real oreoWare/display.py: current()
    and the big-endian RGB565 framebuffer it reads."""

    def _load(self, path, name):
        spec = importlib.util.spec_from_file_location(name, path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules[name] = mod
        spec.loader.exec_module(mod)
        return mod

    def setUp(self):
        names = ("framebuf", "machine", "oreoOS", "oreoOS.api", "oreoWare",
                 "oreoWare.pins", "oreoWare._st7789", "oreoWare.display")
        saved = {k: sys.modules.get(k) for k in names}

        def restore():
            for k, v in saved.items():
                if v is None:
                    sys.modules.pop(k, None)
                else:
                    sys.modules[k] = v
        self.addCleanup(restore)
        import time
        if not hasattr(time, "sleep_us"):
            time.sleep_us = lambda us: None
            self.addCleanup(delattr, time, "sleep_us")
        fb = types.ModuleType("framebuf")
        fb.RGB565, fb.MONO_HLSB, fb.FrameBuffer = 1, 2, _FrameBuffer
        machine = types.ModuleType("machine")
        machine.Pin = _Pin
        machine.SPI = lambda *a, **k: types.SimpleNamespace(write=lambda d: None)
        sys.modules.update(framebuf=fb, machine=machine)
        pkg = types.ModuleType("oreoOS")
        pkg.__path__ = [str(REPO / "oreoOS")]
        sys.modules["oreoOS"] = pkg
        self.api = pkg.api = self._load(API, "oreoOS.api")
        ware = types.ModuleType("oreoWare")
        ware.__path__ = [str(REPO / "oreoWare")]
        sys.modules["oreoWare"] = ware
        ware.pins = self._load(REPO / "oreoWare" / "pins.py", "oreoWare.pins")
        st = types.ModuleType("oreoWare._st7789")
        st.ST7789 = _Panel
        sys.modules["oreoWare._st7789"] = st
        self.display = self._load(DISPLAY, "oreoWare.display")
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)
        self.fake.modules["oreoWare.display"] = self.display
        self.fake.modules["oreoOS.api"] = self.api

    def test_screenshot_reads_what_faleraos_drew(self):
        from oreo_cli import screenshot
        d = self.display.Display()
        d.clear(0x001F)                                  # blue
        d.rect(0, 0, 2, 1, 0xF800, fill=True)            # red, top left
        d.rect(319, 239, 1, 1, 0x07E0, fill=True)        # green, bottom right
        d.present()                                      # nothing half drawn
        w, h, data, dirty = screenshot.capture(Badge(self.fake))
        self.assertEqual((w, h, dirty), (self.api.SCREEN_W, self.api.SCREEN_H, False))
        rgb = screenshot.rgb565_to_rgb888(data)
        self.assertEqual(rgb[0:6], b"\xff\x00\x00" * 2)
        self.assertEqual(rgb[6:9], b"\x00\x00\xff")
        self.assertEqual(rgb[-3:], b"\x00\xff\x00")


@unittest.skipUnless((REPO / "oreoOS" / "busy.py").exists(), "not inside a FaleraOS checkout")
class BusyDisplayFallbackContractTest(unittest.TestCase):
    """`falera screenshot` on a FaleraOS without display.current() reads
    oreoOS.busy._display, which the launcher binds at boot."""

    def test_busy_keeps_the_display_the_launcher_binds(self):
        import ast
        tree = ast.parse((REPO / "oreoOS" / "busy.py").read_text(encoding="utf-8"))
        names = {t.id for n in tree.body if isinstance(n, ast.Assign)
                 for t in n.targets if isinstance(t, ast.Name)}
        self.assertIn("_display", names)
        bind = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "bind")
        self.assertTrue(any(isinstance(n, ast.Global) and "_display" in n.names
                            for n in ast.walk(bind)))
        launcher = (REPO / "oreoOS" / "launcher.py").read_text(encoding="utf-8")
        self.assertIn("busy.bind(os_obj.display)", launcher)


if __name__ == "__main__":
    unittest.main()
