"""Host tests for the BLE file-receive reassembler in oreoWare/bt.py:
framing as produced by tools/bt_send.py, and the stall reset (#23)."""

import binascii
import importlib.util
import struct
import sys
import time
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_bt():
    spec = importlib.util.spec_from_file_location(
        "oreo_bt_under_test", ROOT / "oreoWare/bt.py")
    bt = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bt)
    clock = types.SimpleNamespace(ms=0)
    fake_time = types.ModuleType("time")
    fake_time.ticks_ms = lambda: clock.ms
    fake_time.ticks_diff = lambda a, b: a - b
    fake_time.time = lambda: 1234
    sys.modules["time"] = fake_time
    bt.notified = []
    bt._notify = lambda b: bt.notified.append(b)
    bt._post_notification = lambda *a, **k: None
    bt.written = []
    bt._write_text = lambda buf, ext="txt": bt.written.append((ext, bytes(buf))) or True
    return bt, clock


def frame(type_byte, body):
    return (type_byte + struct.pack(">I", len(body)) + body
            + struct.pack(">I", binascii.crc32(body) & 0xFFFFFFFF))


class BtRxTest(unittest.TestCase):
    def setUp(self):
        self.real_time = sys.modules["time"]
        self.bt, self.clock = load_bt()
        self.bt._conn = 1
        self.bt._rx_state = self.bt._RxState()

    def tearDown(self):
        sys.modules["time"] = self.real_time

    def test_frame_in_small_writes(self):
        data = frame(b"M", b"# hello badge\n" * 50)
        for i in range(0, len(data), 180):
            self.bt._feed(data[i:i + 180])
        self.assertEqual(self.bt.written, [("md", b"# hello badge\n" * 50)])
        self.assertEqual(self.bt.notified, [b"\x01", b"\x02"])

    def test_progress_and_stall_reset(self):
        bt = self.bt
        data = frame(b"T", b"x" * 2000)
        bt._rx_last_ms = self.clock.ms = 1000
        bt._feed(data[:900])
        self.assertEqual(bt.rx_progress(), (895, 2000, "text"))
        self.clock.ms = 1000 + bt.RX_STALL_MS - 1
        bt._check_rx_stall(self.clock.ms)
        self.assertIsNotNone(bt.rx_progress())
        self.clock.ms = 1000 + bt.RX_STALL_MS + 1
        bt._check_rx_stall(self.clock.ms)
        self.assertIsNone(bt.rx_progress())
        self.assertEqual(bt.notified[-1], b"\xE6")
        # A fresh send after the reset goes through.
        bt._feed(frame(b"T", b"again"))
        self.assertEqual(bt.written, [("txt", b"again")])


if __name__ == "__main__":
    unittest.main()
