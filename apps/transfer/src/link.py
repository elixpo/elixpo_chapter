"""USB serial line reader for the Transfer app.

While FaleraOS runs nothing else reads sys.stdin (the REPL is not active),
so the app can poll it. Reading never blocks: select.poll() says at least
one byte is waiting before each one-byte readinto(), and a frame stops
reading after `budget_ms` so buttons and the screen stay responsive.
MicroPython's stdin offers no "how many bytes are waiting", so bytes are
taken one at a time; the USB stack holds the rest back (the computer's
writes simply wait) until the app catches up, so nothing is lost.

open() turns off Ctrl-C (micropython.kbd_intr(-1)) so no byte on the
stream can raise KeyboardInterrupt inside FaleraOS; close() turns it back
on. The protocol is ASCII-only anyway.

`stream`/`poller`/`writer` are injectable for the host tests.
"""

import time

try:
    import micropython
except ImportError:
    micropython = None

INTR_CHAR = 3


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


class UsbLink:
    def __init__(self, max_line, stream=None, poller=None, writer=None):
        self.max_line = max_line
        if stream is None:
            import sys
            import select
            stream = getattr(sys.stdin, "buffer", sys.stdin)
            poller = select.poll()
            poller.register(sys.stdin, select.POLLIN)
            writer = sys.stdout.write
        self._stream = stream
        self._poller = poller
        self._write = writer
        self._one = bytearray(1)
        self._buf = bytearray()
        self._skip = False           # dropping the rest of an over-long line
        self.rx_bytes = 0
        self.opened = False

    def _ready(self):
        for _ in self._poller.ipoll(0):
            return True
        return False

    def open(self):
        if micropython is not None:
            try:
                micropython.kbd_intr(-1)
            except Exception:
                pass
        self.opened = True
        self.drain()

    def close(self):
        if micropython is not None and self.opened:
            try:
                micropython.kbd_intr(INTR_CHAR)
            except Exception:
                pass
        self.opened = False

    def drain(self, limit=8192):
        """Throw away what was queued before the app opened (a computer
        that tried earlier, or bytes left from a cancelled transfer)."""
        n = 0
        while n < limit and self._ready():
            if not self._stream.readinto(self._one):
                break
            n += 1
        self._buf = bytearray()
        self._skip = False
        return n

    def write_line(self, text):
        self._write(text + "\n")

    def read_lines(self, budget_ms=20, max_lines=8):
        """Complete lines (bytes, no newline) that arrived. A line longer
        than max_line comes back as None once its end is seen."""
        lines = []
        buf = self._buf
        one = self._one
        rd = self._stream.readinto
        ready = self._ready
        limit = self.max_line
        t0 = _ticks()
        n = 0
        while ready():
            if not rd(one):
                break
            n += 1
            c = one[0]
            if c == 10:
                if self._skip:
                    self._skip = False
                    lines.append(None)
                else:
                    if buf and buf[-1] == 13:
                        buf = buf[:-1]
                    lines.append(bytes(buf))
                buf = bytearray()
                if len(lines) >= max_lines:
                    break
            elif not self._skip:
                if len(buf) >= limit:
                    self._skip = True
                    buf = bytearray()
                else:
                    buf.append(c)
            if not (n & 63) and _diff(_ticks(), t0) >= budget_ms:
                break
        self._buf = buf
        self.rx_bytes += n
        return lines
