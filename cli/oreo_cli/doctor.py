"""`falera doctor`: check the cable, port, permissions and firmware.

Host checks run first and never touch a port. Only when exactly one badge
is found and the port is accessible does doctor open it and read the
firmware banner (which stops FaleraOS briefly; it is restarted afterwards).
"""

import os
import shutil
import sys

from . import OREO_PID, OREO_VID, __version__
from . import discovery
from .errors import NoOreoOS, OreoError

OK, WARN, FAIL = "ok", "warn", "fail"


def _linux_groups():
    try:
        import grp
        names = set()
        for gid in os.getgroups():
            try:
                names.add(grp.getgrgid(gid).gr_name)
            except KeyError:
                pass
        return names
    except ImportError:
        return set()


def check_permissions(device, platform=None, access=None, groups=None):
    """(status, message, hint) for read/write access to a port."""
    platform = platform or sys.platform
    access = access or os.access
    if platform.startswith("win"):
        return OK, "Windows: no serial permissions needed", None
    if access(device, os.R_OK | os.W_OK):
        return OK, "can read and write %s" % device, None
    if platform.startswith("linux"):
        groups = _linux_groups() if groups is None else groups
        group = "uucp" if os.path.exists("/etc/arch-release") else "dialout"
        if group in groups:
            return FAIL, "no access to %s although you are in %s" % (device, group), \
                "log out and back in (or reboot) so the group change applies"
        return FAIL, "no access to %s" % device, \
            "sudo usermod -aG %s $USER, then log out and back in" % group
    return FAIL, "no access to %s" % device, "check the port's permissions"


def run_checks(port=None, comports=None, badge_factory=None, reset="soft"):
    """Yield (status, title, message, hint) rows."""
    yield OK, "falera", "falera-cli %s on Python %s, %s" % (
        __version__, sys.version.split()[0], sys.platform), None

    try:
        import serial  # noqa: F401
        yield OK, "pyserial", "installed", None
    except ImportError:
        yield FAIL, "pyserial", "not installed", "pip install pyserial"
        return
    try:
        from importlib.metadata import version
        mpv = version("mpremote")
        status = OK if mpv.startswith("1.28") else WARN
        yield status, "mpremote", mpv, None if status == OK else \
            "the badge runs MicroPython 1.28; install mpremote 1.28.x"
    except Exception:
        yield FAIL, "mpremote", "not installed", "pip install 'mpremote>=1.28,<1.29'"
        return

    if shutil.which("ffmpeg"):
        yield OK, "ffmpeg", "found (videos can be added)", None
    else:
        yield WARN, "ffmpeg", "not found: photos and documents work, videos do not", \
            "install ffmpeg to add videos: Linux `sudo apt install ffmpeg`, " \
            "macOS `brew install ffmpeg`, Windows `winget install ffmpeg`"

    ports = discovery.all_ports(comports)
    badges = [p for p in ports if p.is_badge]
    if port:
        target = port
        yield OK, "port", "using %s (--port)" % port, None
    elif len(badges) == 1:
        target = badges[0].device
        yield OK, "badge", "found %s (%04x:%04x)" % (target, OREO_VID, OREO_PID), None
    elif len(badges) > 1:
        yield WARN, "badge", "%d badges: %s" % (len(badges), ", ".join(b.device for b in badges)), \
            "pick one with --port"
        return
    else:
        others = [p for p in ports if p.known]
        if others:
            for o in others:
                yield WARN, "badge", "%s is %s: %s" % (o.device, o.usb_id, o.known), \
                    "this is not the Falera Badge firmware; flash it with " \
                    "`falera flash --repo <checkout>`, or use the native USB port"
        elif ports:
            yield FAIL, "badge", "no Falera Badge among %d USB serial port(s)" % len(ports), \
                "plug the badge into its native USB port (on the DevKitC-1, the one " \
                "labelled USB), and check it is switched on"
        else:
            yield FAIL, "cable", "no USB serial device at all", \
                "try another cable (many only charge) and another USB port"
        return

    status, msg, hint = check_permissions(target)
    yield status, "permissions", msg, hint
    if status == FAIL or badge_factory is None:
        return

    badge = badge_factory(target)
    try:
        info = badge.banner()
    except NoOreoOS as e:
        yield FAIL, "firmware", e.message, e.hint
        return
    except OreoError as e:
        yield FAIL, "connection", e.message, e.hint
        return
    finally:
        badge.finish(reset)
    mpy = info.get("mpy") or "?"
    yield (OK if mpy.startswith("1.28") else WARN), "firmware", \
        "MicroPython %s on %s" % (mpy, info.get("machine") or "?"), \
        None if mpy.startswith("1.28") else "FaleraOS needs MicroPython 1.28; reflash"
    if info.get("os"):
        yield OK, "FaleraOS", "%s (check for a newer one: `falera update --check`)" % info["os"], None
    else:
        yield FAIL, "FaleraOS", "not installed on this badge", \
            "install it with `falera flash --repo <checkout>` (see docs/CLI.md)"
