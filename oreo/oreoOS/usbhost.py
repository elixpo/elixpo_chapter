"""Is a computer on the badge's USB port?

MicroPython 1.28 on the ESP32-S3 runs its console over the chip's native
USB with TinyUSB (shared/tinyusb), but gives Python no way to ask TinyUSB
about the host: tud_mounted(), tud_ready() and tud_cdc_connected() (DTR)
are only used inside the C stdio code, machine.USBDevice offers config(),
active(), submit_xfer(), stall() and remote_wakeup() (none of them report
the host, and reconfiguring it would drop the console), and sys.stdout
writes and select.poll() look the same with or without a host.

So this module reads the USB controller itself (the Synopsys DWC2 core at
0x60080000, ESP-IDF's USB_DWC) through machine.mem32. Reading these
registers has no side effects:

  DCFG (0x800)  DEVADDR, bits 4..10: the address the host gave the badge
                while enumerating it. TinyUSB clears it on every bus reset.
  DSTS (0x808)  SUSPSTS, bit 0: the bus has been idle for 3 ms (suspend).
                SOFFN, bits 8..21: number of the last start-of-frame
                packet. A host sends one every millisecond.

A computer is connected when the badge has an address, the bus is not
suspended, and the frame number moves within about 2 ms. That is the
same moment TinyUSB counts as "mounted" (enumerated and configured).

What it does not tell, and its limits:
- It cannot see whether a program on the computer has the serial port
  open (DTR); only that the computer enumerated the badge.
- A computer that is asleep, or that suspends the port to save power,
  suspends the bus and reads as unplugged. Data flowing keeps it awake.
- A charger or a power-only cable reads as unplugged (no host at all).
- The badge has no VBUS sense pin, so unplugging is seen as the bus
  going idle (suspend), which the controller flags within 3 ms.
- Only on an ESP32-S3 running the TinyUSB console (the Falera Badge
  firmware and ESP32_GENERIC_S3). Elsewhere connected() returns None:
  unknown, and callers keep their old behaviour.

Cost: two or three register reads and up to 2 ms of waiting. Probe
caches the answer and reads again at most once a second.
"""

import sys

try:
    import time
except ImportError:          # pragma: no cover
    time = None

USB_DWC = 0x60080000
DCFG = USB_DWC + 0x800
DSTS = USB_DWC + 0x808
POLL_MS = 1000
SOF_WAIT_US = 2000           # two SOF periods
SOF_STEP_US = 250

_mem = False                 # machine.mem32 once looked up; None = absent


def _mem32():
    global _mem
    if _mem is False:
        _mem = None
        try:
            impl = getattr(sys.implementation, "_machine", "") or ""
            if "ESP32S3" in impl.replace("-", "").upper():
                from machine import mem32
                _mem = mem32
        except Exception:
            _mem = None
    return _mem


def decode(dcfg, dsts):
    """(address, suspended, frame) from raw DCFG and DSTS values."""
    return (dcfg >> 4) & 0x7F, bool(dsts & 1), (dsts >> 8) & 0x3FFF


def _sleep_us(us):
    try:
        time.sleep_us(us)
    except AttributeError:
        time.sleep(us / 1e6)


def connected(mem=None):
    """True when a computer has enumerated the badge and is driving the
    bus, False when not, None when this chip cannot tell. Never raises."""
    if mem is None:
        mem = _mem32()
        if mem is None:
            return None
    try:
        addr, suspended, frame = decode(mem[DCFG], mem[DSTS])
        if not addr or suspended:
            return False
        waited = 0
        while waited < SOF_WAIT_US:
            _sleep_us(SOF_STEP_US)
            waited += SOF_STEP_US
            dsts = mem[DSTS]
            if dsts & 1:
                return False
            if (dsts >> 8) & 0x3FFF != frame:
                return True
        return False
    except Exception:
        return None


def _ticks():
    try:
        return time.ticks_ms()
    except AttributeError:
        return int(time.monotonic() * 1000)


def _diff(a, b):
    try:
        return time.ticks_diff(a, b)
    except AttributeError:
        return a - b


def _add(a, b):
    try:
        return time.ticks_add(a, b)
    except AttributeError:
        return a + b


class Probe:
    """connected(), read again at most every `every_ms`.

        probe = usbhost.Probe()
        state = probe.poll()      # in update(): cheap between reads

    `state` is True, False or None (unknown). `read` is True on a poll
    that read the hardware, `changed` on one that saw a new state.
    `check` and `clock` are injectable.
    """

    def __init__(self, every_ms=POLL_MS, check=None, clock=None):
        self.every_ms = every_ms
        self._check = check or connected
        self._clock = clock or _ticks
        self._next = None
        self.state = None
        self.read = False
        self.changed = False

    def poll(self, now=None):
        now = self._clock() if now is None else now
        self.read = self.changed = False
        if self._next is not None and _diff(now, self._next) < 0:
            return self.state
        self._next = _add(now, self.every_ms)
        self.read = True
        try:
            got = self._check()
        except Exception:
            got = None
        if got != self.state:
            self.state = got
            self.changed = True
        return self.state
