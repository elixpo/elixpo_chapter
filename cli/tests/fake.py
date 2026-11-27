"""FakeTransport: a pretend badge for host tests.

It implements the same interface as oreo_cli.transport.SerialLink, but
`exec()` runs the snippet in CPython against a fake MicroPython world: an
`os` module rooted in a temporary folder (ilistdir/stat/statvfs/...), a
`time` module with ticks, and fake FaleraOS modules (oreoOS.config/storage/
store, oreoWare.wifi/battery) that tests can replace with the real ones.
Every snippet the CLI sends is recorded in `.sent`, so tests can check
what would go over the wire (for example that a password is sent once
and never comes back).
"""

import binascii
import builtins
import hashlib
import io
import json
import os as _host_os
import shutil
import sys
import tempfile
import traceback
import types
from collections import namedtuple

HERE = _host_os.path.dirname(_host_os.path.abspath(__file__))
sys.path.insert(0, _host_os.path.dirname(HERE))

from oreo_cli import avatar as _avatar  # noqa: E402
from oreo_cli.errors import BadgeError  # noqa: E402


def _offline(url):
    """Tests never reach GitHub: `falera setup` sees the avatar download fail
    unless a test puts its own avatar._open in place."""
    raise OSError("no network in tests")


_avatar._open = _offline

Uname = namedtuple("Uname", "sysname nodename release version machine")


class FakeClock:
    def __init__(self):
        self.ms = 1000

    def ticks_ms(self):
        return self.ms

    def ticks_diff(self, a, b):
        return a - b

    def ticks_add(self, a, b):
        return a + b

    def sleep_ms(self, n):
        self.ms += n

    def sleep(self, s):
        self.ms += int(s * 1000)

    def time(self):
        return self.ms // 1000


def make_os(root, total=8 * 1024 * 1024):
    """A MicroPython-flavoured `os` module whose '/' is `root`."""
    m = types.ModuleType("os")

    def real(path):
        path = path or "/"
        if not path.startswith("/"):
            path = "/" + path
        parts = [p for p in path.split("/") if p not in ("", ".")]
        if ".." in parts:
            raise OSError(2)
        return _host_os.path.join(root, *parts)

    def wrap(fn):
        def inner(*a):
            try:
                return fn(*a)
            except FileNotFoundError:
                raise OSError(2)
            except FileExistsError:
                raise OSError(17)
            except NotADirectoryError:
                raise OSError(20)
            except IsADirectoryError:
                raise OSError(21)
        return inner

    def used():
        n = 0
        for d, _, files in _host_os.walk(root):
            for f in files:
                n += _host_os.path.getsize(_host_os.path.join(d, f))
        return n

    @wrap
    def ilistdir(path=""):
        for name in sorted(_host_os.listdir(real(path))):
            full = _host_os.path.join(real(path), name)
            isdir = _host_os.path.isdir(full)
            yield (name, 0x4000 if isdir else 0x8000, 0,
                   0 if isdir else _host_os.path.getsize(full))

    @wrap
    def listdir(path=""):
        return sorted(_host_os.listdir(real(path)))

    @wrap
    def stat(path):
        full = real(path)
        st = _host_os.stat(full)
        mode = 0x4000 if _host_os.path.isdir(full) else 0x8000
        return (mode, 0, 0, 0, 0, 0, 0 if mode == 0x4000 else st.st_size, 0, 0, 0)

    def statvfs(path):
        bs = 4096
        blocks = total // bs
        free = max(0, (total - used()) // bs)
        return (bs, bs, blocks, free, free, 0, 0, 0, 0, 255)

    m.ilistdir = ilistdir
    m.listdir = listdir
    m.stat = stat
    m.statvfs = statvfs
    m.mkdir = wrap(lambda p: _host_os.mkdir(real(p)))
    m.rmdir = wrap(lambda p: _host_os.rmdir(real(p)))

    @wrap
    def remove(p):
        if _host_os.path.isdir(real(p)):
            raise OSError(21)
        _host_os.remove(real(p))
    m.remove = remove
    m.rename = wrap(lambda a, b: _host_os.replace(real(a), real(b)))
    m.uname = lambda: Uname("esp32", "esp32", "1.28.0", "v1.28.0 on 2026-11-10",
                            "Elixpo Falera Badge with ESP32S3")
    m._real = real
    return m


class FakeWifi(types.ModuleType):
    """Stand-in for oreoWare.wifi with the API the CLI calls."""

    CONN_IDLE, CONN_BUSY, CONN_OK = "idle", "connecting", "ok"
    CONN_BAD_PW, CONN_NO_AP, CONN_TIMEOUT, CONN_FAIL = "bad_password", "not_found", "timeout", "failed"

    def __init__(self):
        super().__init__("oreoWare.wifi")
        self.air = {"Home": ("hunter2!", -50), "Cafe": ("", -70)}   # ssid -> (password, rssi)
        self.saved = []
        self.deploy = []
        self.connected = None
        self._polls = 0
        self._target = None
        self.scan_fails = None
        self.scan_polls = 0
        self.can_connect_saved = True

    def auto_stop(self):
        pass

    def scan_start(self):
        self.scan_polls = 0
        return self.scan_fails != "start"

    def scan_poll(self):
        self.scan_polls += 1
        if self.scan_polls < 3:
            return "busy"
        return "error" if self.scan_fails else "done"

    def scan_error(self):
        return "scan timed out" if self.scan_fails else None

    def nearby(self):
        return sorted([{"ssid": s, "rssi": r, "secure": bool(p), "ch": 6}
                       for s, (p, r) in self.air.items()], key=lambda n: -n["rssi"])

    def saved_ssids(self):
        return {n["ssid"]: True for n in self.saved}

    def connect_begin(self, ssid, password, timeout_ms=12000):
        self._target = (ssid, password)
        self._polls = 0
        return True

    def connect_poll(self):
        if self._target is None:
            return self.CONN_IDLE
        self._polls += 1
        if self._polls < 3:
            return self.CONN_BUSY
        ssid, pw = self._target
        self._target = None
        if ssid not in self.air:
            return self.CONN_NO_AP
        if self.air[ssid][0] != pw:
            return self.CONN_BAD_PW
        self.connected = ssid
        return self.CONN_OK

    def is_connected(self):
        return self.connected is not None

    def ip(self):
        return "192.168.1.42" if self.connected else None

    def list_saved(self):
        return sorted([dict(n) for n in self.saved], key=lambda n: n.get("priority", 999))

    def add_saved(self, ssid, password, priority=10, metered=False):
        self.saved = [n for n in self.saved if n["ssid"] != ssid]
        self.saved.append({"ssid": ssid, "password": password, "priority": priority,
                           "metered": metered})
        return True

    def remove_saved(self, ssid):
        before = len(self.saved)
        self.saved = [n for n in self.saved if n["ssid"] != ssid]
        return len(self.saved) != before

    def _secrets_networks(self):
        return [{"ssid": s} for s in self.deploy]

    def connect_from_config(self, pump_cb=None):
        if self.saved and self.can_connect_saved:
            self.connected = self.saved[0]["ssid"]
            return True
        return False


class FakeStore(types.ModuleType):
    HIDDEN_INSTALLED = ("launcher",)
    DEFAULT_APPS = ("settings", "gallery", "launcher")

    def __init__(self, osmod):
        super().__init__("oreoOS.store")
        self.os = osmod
        self.index = []
        self.remote = [{"id": "snake", "name": "Snake", "version": "1.1", "size": 3000,
                        "tagline": "Eat", "category": "Games"},
                       {"id": "pet", "name": "Pet", "version": "2.0", "size": 5000,
                        "tagline": "Feed", "category": "Games"}]
        self.online = lambda: False

    def _manifest(self, app_id):
        try:
            with open(self.os._real("/apps/%s/manifest.json" % app_id)) as f:
                return json.loads(f.read())
        except (OSError, ValueError):
            return None

    def installed_manifest(self, app_id):
        if not _host_os.path.exists(self.os._real("/apps/%s/main.py" % app_id)):
            return None
        return self._manifest(app_id)

    def installed_version(self, app_id):
        m = self.installed_manifest(app_id)
        return str(m.get("version", "0")) if m else None

    def is_default(self, app_id):
        return app_id in self.DEFAULT_APPS

    def catalogue(self):
        return self.index, []

    def app_state(self, e):
        v = self.installed_version(e["id"])
        if v is None:
            return "install"
        return "update" if e["version"] > v else "open"

    def refresh(self):
        if not self.online():
            self._err = "offline"
            return False
        self.index = [dict(e) for e in self.remote]
        self._err = ""
        return True

    def last_error(self):
        return getattr(self, "_err", "")

    def install(self, app_id, cb=None):
        e = next((x for x in self.index if x["id"] == app_id), None)
        if e is None:
            return False, "not in catalogue"
        if not self.online():
            return False, "no WiFi"
        for done in (1000, 2000, e["size"]):
            if cb:
                cb(done, e["size"], "Downloading")
        d = self.os._real("/apps/" + app_id)
        _host_os.makedirs(d, exist_ok=True)
        with open(_host_os.path.join(d, "main.py"), "w") as f:
            f.write("pass\n")
        with open(_host_os.path.join(d, "manifest.json"), "w") as f:
            f.write(json.dumps({"name": e["name"], "version": e["version"], "type": "app"}))
        return True, "installed"

    def uninstall(self, app_id):
        if self.is_default(app_id):
            return False, "built-in app"
        shutil.rmtree(self.os._real("/apps/" + app_id), ignore_errors=True)
        return True, "removed"


class FakeTransport:
    """Pretend SerialLink. One instance == one plugged-in badge."""

    def __init__(self, root=None, total=8 * 1024 * 1024):
        self._tmp = None
        if root is None:
            self._tmp = tempfile.TemporaryDirectory(prefix="fakebadge-")
            root = self._tmp.name
        self.root = root
        self.os = make_os(root, total)
        self.clock = FakeClock()
        self.sent = []          # every snippet, as text
        self.outputs = []       # every output, as bytes
        self.enters = 0
        self.soft_resets = []   # soft_reset of each enter()
        self.restarts = []
        self.closed = False
        self.t = None
        self.fail_on = None     # substring: exec raises when the code contains it
        self.wifi = FakeWifi()
        self.store = FakeStore(self.os)
        self.store.online = self.wifi.is_connected
        self.battery = types.ModuleType("oreoWare.battery")
        self.battery.read_percent = lambda: 87
        self.battery.read_voltage = lambda: 4.01
        self.config = types.ModuleType("oreoOS.config")
        self.config.VERSION = "v2.0.0"
        self.config.RELEASE_DATE = "2026-11-07"
        self.config.BT_AUTO_ENABLE = False
        self.storage = types.ModuleType("oreoOS.storage")
        self.storage.usage = self._usage
        self.modules = {}
        self._globals = None
        self.seed_layout()

    # ── fake world ───────────────────────────────────────────────────
    def seed_layout(self):
        for d in ("oreoOS", "oreoWare", "apps/settings", "apps/launcher", "documents"):
            _host_os.makedirs(_host_os.path.join(self.root, d), exist_ok=True)
        self.put("/main.py", b"from oreoOS import entry\n")
        self.put("/oreoOS/config.py", b"VERSION = 'v2.0.0'\n")
        self.put("/apps/settings/main.py", b"pass\n")
        self.put("/apps/settings/manifest.json",
                 json.dumps({"name": "Settings", "version": "2.0", "type": "app"}).encode())

    def put(self, path, data):
        full = self.os._real(path)
        _host_os.makedirs(_host_os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(data)

    def get(self, path):
        with open(self.os._real(path), "rb") as f:
            return f.read()

    def exists(self, path):
        return _host_os.path.exists(self.os._real(path))

    def _usage(self):
        st = self.os.statvfs("/")
        total, free = st[1] * st[2], st[1] * st[4]
        return {"stats": {"total": total, "free": free, "used": total - free},
                "buckets": {b: {"bytes": 0, "count": 0}
                            for b in ("system", "apps", "gallery", "documents", "misc")}}

    def _modules(self):
        sysmod = types.ModuleType("sys")
        sysmod.implementation = types.SimpleNamespace(name="micropython", version=(1, 28, 0, ""))
        gc = types.ModuleType("gc")
        gc.collect = lambda: None
        gc.mem_free = lambda: 7 * 1024 * 1024
        timemod = types.ModuleType("time")
        for n in ("ticks_ms", "ticks_diff", "ticks_add", "sleep_ms", "sleep", "time"):
            setattr(timemod, n, getattr(self.clock, n))
        oreo_os = types.ModuleType("oreoOS")
        oreo_os.config, oreo_os.storage, oreo_os.store = self.config, self.storage, self.store
        oreo_ware = types.ModuleType("oreoWare")
        oreo_ware.wifi, oreo_ware.battery = self.wifi, self.battery
        mods = {"os": self.os, "sys": sysmod, "gc": gc, "time": timemod, "json": json,
                "binascii": binascii, "hashlib": hashlib, "oreoOS": oreo_os,
                "oreoWare": oreo_ware, "oreoOS.config": self.config,
                "oreoOS.storage": self.storage, "oreoOS.store": self.store,
                "oreoWare.wifi": self.wifi, "oreoWare.battery": self.battery}
        mods.update(self.modules)
        return mods

    # ── SerialLink interface ─────────────────────────────────────────
    def open(self):
        return self

    def enter(self, soft_reset=True):
        self.enters += 1
        self.soft_resets.append(soft_reset)
        self.closed = False
        self._globals = None

    def _builtins(self, out):
        mods = self._modules()
        real_import = builtins.__import__
        osmod = self.os

        def _import(name, globals=None, locals=None, fromlist=(), level=0):
            if name in mods:
                top = mods[name] if fromlist else mods[name.split(".")[0]]
                if fromlist:
                    for f in fromlist:
                        key = name + "." + f
                        if key in mods and mods[key] is None:
                            # MicroPython's wording for a missing submodule
                            raise ImportError("can't import name %s (%s)" % (f, key))
                        if mods.get(key) is not None:
                            setattr(top, f, mods[key])
                return top
            if name in ("ubinascii", "network", "machine", "_thread"):
                raise ImportError(name)
            return real_import(name, globals, locals, fromlist, level)

        def _open(path, mode="r", *a, **k):
            return open(osmod._real(path), mode, *a, **k)

        def _print(*args, sep=" ", end="\n", file=None):
            out.write((sep.join(str(a) for a in args) + end).encode("utf-8"))

        b = dict(vars(builtins))
        b.update(__import__=_import, open=_open, print=_print)
        return b

    def exec(self, code, timeout=15, consumer=None):
        if isinstance(code, bytes):
            code = code.decode("utf-8")
        self.sent.append(code)
        out = io.BytesIO()
        if self._globals is None:
            self._globals = {"__name__": "__main__"}
        self._globals["__builtins__"] = self._builtins(out)
        try:
            if self.fail_on and self.fail_on in code:
                raise OSError(28)
            exec(compile(code, "<stdin>", "exec"), self._globals)
        except Exception as e:
            data = out.getvalue()
            self.outputs.append(data)
            if consumer and data:
                consumer(data)
            tb = "Traceback (most recent call last):\n  File \"<stdin>\"\n%s: %s\n" % (
                type(e).__name__, e)
            raise BadgeError("the badge raised %s: %s" % (type(e).__name__, e),
                             detail=tb + traceback.format_exc(limit=0))
        data = out.getvalue()
        self.outputs.append(data)
        if consumer and data:
            consumer(data)
        return data

    def restart(self, mode="soft"):
        self.restarts.append(mode)
        self.closed = True

    def close(self):
        self.closed = True

    def interrupt(self):
        pass

    def cleanup(self):
        if self._tmp:
            self._tmp.cleanup()


class FakePort:
    def __init__(self, device, vid=None, pid=None, serial_number=None, description=""):
        self.device = device
        self.vid = vid
        self.pid = pid
        self.serial_number = serial_number
        self.description = description
        self.location = None
        self.manufacturer = None
        self.product = None


def badge_port(device="/dev/ttyACM0", serial="OREO01"):
    return FakePort(device, 0x303A, 0x83EC, serial, "Elixpo Falera Badge")


class ScriptedInput:
    """input() replacement that replays answers and records prompts."""

    def __init__(self, *answers):
        self.answers = list(answers)
        self.calls = 0

    def __call__(self, prompt=""):
        self.calls += 1
        if not self.answers:
            raise EOFError
        return self.answers.pop(0)
