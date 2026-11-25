"""Find badges by USB ID on Linux, macOS and Windows.

Only enumerates ports (pyserial's list_ports); nothing here opens a port,
so `falera devs` and `falera doctor`'s first checks never disturb a badge.
"""

import os
import re
import sys

from . import OREO_PID, OREO_VID
from .errors import ManyBadges, NoBadge

# Other USB IDs a badge (or a bare devkit) can show up as, and what that
# means. Used by `falera devs --all` and `falera doctor` to explain why no
# 303a:83ec port was found.
KNOWN_IDS = {
    (0x303A, 0x1001): "ESP32-S3 USB-Serial/JTAG: stock firmware, or the ROM bootloader",
    (0x303A, 0x0002): "ESP32-S3 in download mode (BOOT held at reset)",
    (0x303A, 0x4001): "Espressif TinyUSB default ID: generic MicroPython, not the Falera Badge build",
    (0x10C4, 0xEA60): "CP210x USB-UART bridge (devkit UART port, not native USB)",
    (0x1A86, 0x7523): "CH340 USB-UART bridge (devkit UART port, not native USB)",
    (0x1A86, 0x55D4): "CH9102 USB-UART bridge (devkit UART port, not native USB)",
}


class Port:
    __slots__ = ("device", "vid", "pid", "serial", "description", "location",
                 "manufacturer", "product")

    def __init__(self, device, vid=None, pid=None, serial=None, description="",
                 location=None, manufacturer=None, product=None):
        self.device = device
        self.vid = vid
        self.pid = pid
        self.serial = serial
        self.description = description or ""
        self.location = location
        self.manufacturer = manufacturer
        self.product = product

    @property
    def usb_id(self):
        if self.vid is None or self.pid is None:
            return ""
        return "%04x:%04x" % (self.vid, self.pid)

    @property
    def is_badge(self):
        return self.vid == OREO_VID and self.pid == OREO_PID

    @property
    def known(self):
        return KNOWN_IDS.get((self.vid, self.pid))

    def __repr__(self):
        return "Port(%r, %s)" % (self.device, self.usb_id)


def _default_comports():
    try:
        from serial.tools import list_ports
    except ImportError:
        from .errors import OreoError
        raise OreoError("pyserial is not installed",
                        hint="pip install pyserial (or reinstall falera-cli)")
    return list_ports.comports()


def all_ports(comports=None):
    """Every USB serial port, as Port objects. `comports` is injectable."""
    raw = comports() if callable(comports) else (
        comports if comports is not None else _default_comports())
    out = []
    for p in raw:
        vid = getattr(p, "vid", None)
        if vid is None:
            continue  # not USB (legacy COM/ttyS ports)
        out.append(Port(p.device, vid, getattr(p, "pid", None),
                        getattr(p, "serial_number", None),
                        getattr(p, "description", ""),
                        getattr(p, "location", None),
                        getattr(p, "manufacturer", None),
                        getattr(p, "product", None)))
    out.sort(key=lambda x: x.device)
    return out


def find_badges(comports=None):
    return [p for p in all_ports(comports) if p.is_badge]


def normalize_port(port, platform=None, exists=None):
    """Tidy a port name typed by a person. Never opens anything.

    - Windows: `com5` -> `COM5` (pyserial handles COM10+ itself).
    - macOS: `/dev/tty.usbmodem*` -> `/dev/cu.usbmodem*` when that exists;
      opening the tty.* twin waits for carrier detect and can hang.
    - Linux/macOS: a bare `ttyACM0` -> `/dev/ttyACM0` when that exists.
    """
    if not port:
        return port
    platform = platform or sys.platform
    exists = exists or os.path.exists
    port = port.strip()
    if platform.startswith("win"):
        m = re.match(r"^(?:\\\\\.\\)?com(\d+)$", port, re.I)
        return ("COM%s" % m.group(1)) if m else port
    if platform == "darwin" and port.startswith("/dev/tty."):
        cu = "/dev/cu." + port[len("/dev/tty."):]
        if exists(cu):
            return cu
    if "/" not in port and exists("/dev/" + port):
        return "/dev/" + port
    return port


def pick(port=None, comports=None, env=None):
    """The port to use: --port, else $OREO_PORT, else the one badge found.

    Raises NoBadge / ManyBadges with a hint. Never opens anything.
    """
    env = os.environ if env is None else env
    if port:
        return normalize_port(port)
    if env.get("OREO_PORT"):
        return normalize_port(env["OREO_PORT"])
    badges = find_badges(comports)
    if len(badges) == 1:
        return badges[0].device
    if not badges:
        others = [p for p in all_ports(comports) if p.known]
        hint = "check the cable (it must carry data) and run `falera doctor`"
        if others:
            o = others[0]
            hint = "%s is %s: %s. Run `falera doctor`" % (o.device, o.usb_id, o.known)
        raise NoBadge("no Falera Badge found (USB %04x:%04x)" % (OREO_VID, OREO_PID),
                      hint=hint)
    raise ManyBadges("%d badges connected: %s" % (
        len(badges), ", ".join(b.device for b in badges)),
        hint="choose one with --port <device> (see `falera devs`)")


def find_again(device, serial=None, comports=None):
    """After a reboot: the badge's port now, or None while it is away.

    USB re-enumeration can give the badge a new name (ttyACM0 -> ttyACM1,
    another COM number), so a known serial number wins over the old name."""
    badges = find_badges(comports)
    if serial:
        for b in badges:
            if b.serial == serial:
                return b.device
    for b in badges:
        if b.device == device:
            return b.device
    if not serial and len(badges) == 1:
        return badges[0].device
    return None
