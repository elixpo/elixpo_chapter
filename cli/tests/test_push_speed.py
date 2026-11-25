"""Push speed: what goes over the wire, counted on the fake transport.

There is no badge in CI, so this measures what can be measured without one
-- execs (round trips) and bytes of code sent per byte of file -- and turns
them into a time estimate with a simple, stated model of the USB link:

  * every exec costs 2 round trips (raw-paste handshake, then the end of
    the paste and the reply) plus the badge compiling the snippet;
  * raw paste is flow controlled: one ack per WINDOW bytes of code, and
    only one window is in flight, so every WINDOW bytes is a round trip;
  * the badge's flash writes run at FLASH_BPS whatever the scheme.

The constants are assumptions (USB full speed, MicroPython's default
256-byte raw-paste window), not measurements; run this file directly for
the table quoted in docs/CLI.md, and replace them with numbers from the
badge once measured (`falera -v push` with a stopwatch).
"""

import os
import unittest

from fake import FakeTransport

from oreo_cli.badge import Badge

RTT = 0.0015            # s, one USB full-speed round trip through the CDC stack
WINDOW = 256            # bytes of code per raw-paste flow-control ack
COMPILE_BPS = 2.0e6     # bytes of source the badge lexes/compiles per second
FLASH_BPS = 150e3       # bytes per second LittleFS writes (and re-reads to hash)


def model(sent, payload):
    execs = len(sent)
    code = sum(len(c) for c in sent)
    windows = sum(-(-len(c) // WINDOW) for c in sent)
    t = execs * 2 * RTT + windows * RTT + code / COMPILE_BPS + 2 * payload / FLASH_BPS
    return {"execs": execs, "code": code, "overhead": code / max(1, payload),
            "seconds": t, "kbps": payload / t / 1024}


def push(files, chunk, fresh_dirs=False):
    fake = FakeTransport(total=64 * 1024 * 1024)
    try:
        b = Badge(fake)
        for name, data in files:
            if fresh_dirs:
                b._dirs.clear()
            b.write_file(data, name, chunk=chunk, check_space=False)
        return model(fake.sent, sum(len(d) for _, d in files))
    finally:
        fake.cleanup()


ONE_MB = [("/documents/big.bin", os.urandom(1024 * 1024))]
SMALL = [("/apps/myapp/f%02d.py" % i, os.urandom(1500)) for i in range(40)]


class PushSpeedTest(unittest.TestCase):
    def test_bigger_chunks_halve_the_execs(self):
        a, b = push(ONE_MB, 4096), push(ONE_MB, 8192)
        self.assertLessEqual(b["execs"], a["execs"] // 2 + 1)
        self.assertLess(b["seconds"], a["seconds"])
        # base64 plus the call around it: about 4/3 of the file size
        self.assertLess(b["overhead"], 1.36)

    def test_small_files_cost_two_execs_each(self):
        r = push(SMALL, 8192)
        self.assertEqual(r["execs"], 2 * len(SMALL) + 1)   # + one mkdir for the folder


def table():
    rows = [("1 MiB file, 4 KiB chunks (0.1.0)", push(ONE_MB, 4096)),
            ("1 MiB file, 8 KiB chunks (1.0.0)", push(ONE_MB, 8192)),
            ("1 MiB file, 16 KiB chunks", push(ONE_MB, 16384)),
            ("40 x 1.5 KiB files (1.0.0)", push(SMALL, 8192))]
    print("%-36s %6s %9s %8s %8s" % ("case", "execs", "code/B", "est. s", "KiB/s"))
    for name, r in rows:
        print("%-36s %6d %9.3f %8.2f %8.1f" % (name, r["execs"], r["overhead"],
                                                r["seconds"], r["kbps"]))
    print("0.1.0 used 5 extra execs per file (space check, mkdir, open, close, hash):"
          " 40 small files = %d execs" % (40 * 6))


if __name__ == "__main__":
    table()
