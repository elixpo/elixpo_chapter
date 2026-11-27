# SPDX-License-Identifier: MIT
"""Precompiled .mpy for FaleraOS: which files, and the pinned compiler.

Shared by tools/build_release.py (OTA releases) and tools/deploy.py (USB).

Why: a .py module is compiled on the badge at every import (time and heap);
a .mpy made on the computer by mpy-cross is loaded as bytecode.

The catch: MicroPython 1.28 looks for `x.py` before `x.mpy`
(py/builtinimport.c, stat_file_py_or_mpy), so wherever an .mpy is
installed the .py next to it must be removed, or the old .py keeps
winning. The other way round is harmless: a .py installed over a stale
.mpy wins, and the .mpy is only dead weight (installs remove it).

What is compiled (should_compile): modules that are imported by name,
under oreoOS/, oreoWare/ and built-in apps' src/. Never:
  * entry points run by path or found by name before import: /main.py
    (oreoOS/entry.py), apps/<name>/main.py, boot.py;
  * package markers (__init__.py);
  * oreoOS/config.py: CI stamps VERSION into its text and falera-cli checks
    for the file by name.

The compiler is pinned: mpy-cross from MicroPython 1.28.0, the firmware's
version, whose output starts with MPY_HEADER (format 6, bytecode only,
31-bit small ints, as the ESP32-S3 port loads it). check() refuses any
other mpy-cross.
"""

import os
import shutil
import subprocess
from pathlib import Path

MICROPYTHON_VERSION = "1.28.0"
MICROPYTHON_COMMIT = "e0e9fbb17ed6fd06bb76e266ae554784c9c80804"   # v1.28.0
MPY_ABI = "6.3"                        # `mpy-cross --version`: "mpy v6.3"
MPY_HEADER = b"M\x06\x00\x1f"          # 'M', version 6, no arch, 31-bit ints

NEVER_COMPILE = frozenset((
    "oreoOS/config.py",
    "oreoOS/entry.py",
    "main.py",
    "boot.py",
))


class MpyError(RuntimeError):
    pass


def should_compile(remote):
    """True for a device path whose .py is shipped as .mpy."""
    if not remote.endswith(".py") or remote in NEVER_COMPILE:
        return False
    parts = remote.split("/")
    if parts[-1] == "__init__.py":
        return False
    if len(parts) == 2 and parts[0] in ("oreoOS", "oreoWare"):
        return True
    # apps/<name>/src/**/*.py (not apps/<name>/main.py)
    return len(parts) >= 4 and parts[0] == "apps" and parts[2] == "src"


def mpy_path(remote):
    return remote[:-3] + ".mpy"


def find_mpy_cross():
    """The mpy-cross to use: $MPY_CROSS, then PATH, then the firmware
    checkout tools/build_firmware.sh uses. None when not found."""
    env = os.environ.get("MPY_CROSS")
    if env:
        return env
    p = shutil.which("mpy-cross")
    if p:
        return p
    esp = Path(os.environ.get("ESP_ROOT", str(Path.home() / "esp")))
    cand = esp / "micropython-v1.28" / "mpy-cross" / "build" / "mpy-cross"
    return str(cand) if cand.exists() else None


def check(mpy_cross):
    """Raise MpyError unless `mpy_cross` is MicroPython 1.28.0's and makes
    files the firmware loads. Returns its version line."""
    if not mpy_cross:
        raise MpyError("mpy-cross not found (set MPY_CROSS, or build it from "
                       "MicroPython v%s: make -C mpy-cross)"
                       % MICROPYTHON_VERSION)
    try:
        out = subprocess.run([mpy_cross, "--version"], capture_output=True,
                             text=True, timeout=30).stdout.strip()
    except (OSError, subprocess.SubprocessError) as e:
        raise MpyError("mpy-cross failed to run: %s" % e)
    # Built from a tag it reports "v1.28.0"; built from the pinned commit
    # without tags (as CI does) it reports the commit's short hash instead.
    named = ("v%s" % MICROPYTHON_VERSION) in out or MICROPYTHON_COMMIT[:10] in out
    if not named or ("mpy v%s" % MPY_ABI) not in out:
        raise MpyError("mpy-cross is %r; the firmware needs MicroPython v%s "
                       "(mpy v%s)" % (out, MICROPYTHON_VERSION, MPY_ABI))
    return out


def compile_file(mpy_cross, src, dst, source_name):
    """Compile `src` to `dst`; tracebacks name `source_name`."""
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run([mpy_cross, "-o", str(dst), "-s", source_name, str(src)],
                       capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise MpyError("mpy-cross %s: %s" % (src, (r.stderr or r.stdout).strip()))
    head = dst.read_bytes()[:4]
    if head != MPY_HEADER:
        raise MpyError("%s: header %r is not %r (wrong mpy-cross options?)"
                       % (dst, head, MPY_HEADER))
    return dst
