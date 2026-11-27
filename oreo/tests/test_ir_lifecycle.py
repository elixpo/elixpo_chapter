"""Host tests for the IR RX/TX lifecycle (issue #48).

oreoWare/ir.py and the IR Quest app run against fakes of machine, esp32.RMT
and the native _oreo_ir receiver. The fakes share one model of the RMT
peripheral and fail the test if an RX and a TX channel are ever alive at the
same time, if a second RX channel is opened while one exists (a leak), or if
the native receiver is started while it already listens.

    python3 -m unittest tests.test_ir_lifecycle -v
"""

import importlib
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
INVALID_ARG = ("RMT RX arm failed: ESP_ERR_INVALID_ARG (0x102) "
               "[dma=0 filter=0ns gpio=18]; DMA path skipped: "
               "RMT RX channel failed: ESP_ERR_NOT_FOUND")


class Rmt:
    """Shared RMT peripheral model with an event log."""

    def __init__(self):
        self.rx_live = 0
        self.tx_live = 0
        self.max_rx = 0
        self.log = []

    def check(self, case):
        case.assertLessEqual(self.rx_live, 1, "RX channel leaked")
        case.assertFalse(self.rx_live and self.tx_live,
                         "RX and TX RMT channels alive together")


class FakeNative:
    """Stand-in for the _oreo_ir C module with the same state machine."""

    def __init__(self, rmt):
        self.rmt = rmt
        self.state = "stopped"
        self.fail_start = None     # OSError text for the next start()
        self.fail_stop = None
        self.fail_poll = None
        self.frame = None
        self.debug_flag = False
        self.opens = 0
        self.closes = 0
        self.starts = 0

    def start(self, pin):
        if self.state == "listening":
            return                          # idempotent, like the C side
        self.starts += 1
        if self.rmt.tx_live:
            raise OSError("RMT RX channel failed: TX still holds RMT")
        if self.fail_start:
            msg, self.fail_start = self.fail_start, None
            raise OSError(msg)
        self.opens += 1
        self.rmt.rx_live += 1
        self.rmt.max_rx = max(self.rmt.max_rx, self.rmt.rx_live)
        self.rmt.log.append("rx+")
        self.state = "listening"

    def stop(self):
        if self.state == "stopped":
            return
        if self.fail_stop:
            msg, self.fail_stop = self.fail_stop, None
            self.state = "stuck"
            raise OSError(msg)
        self.closes += 1
        self.rmt.rx_live -= 1
        self.rmt.log.append("rx-")
        self.state = "stopped"

    def poll(self):
        if self.state != "listening":
            return None
        if self.fail_poll:
            msg, self.fail_poll = self.fail_poll, None
            self.stop()
            raise OSError(msg)
        frame, self.frame = self.frame, None
        return frame

    def debug(self, *args):
        if args:
            self.debug_flag = bool(args[0])
        return self.debug_flag

    def info(self):
        return (self.state == "listening", 18, True, 3000, self.state,
                "ESP_OK", 3 if self.state == "listening" else -1,
                self.state, 0, None, None, self.opens, self.closes)


def make_machine(rmt):
    machine = types.ModuleType("machine")

    class Pin:
        IN, OUT, PULL_UP, IRQ_FALLING, IRQ_RISING = 1, 2, 3, 4, 8
        levels = {}

        def __init__(self, num, mode=None, pull=None, value=None):
            self.num = num
            if mode == Pin.OUT and value is not None:
                Pin.levels[num] = value

        def irq(self, handler=None, trigger=None):
            rmt.log.append("irq+" if handler else "irq-")

    machine.Pin = Pin
    machine.disable_irq = lambda: 0
    machine.enable_irq = lambda state: None
    return machine


def make_esp32(rmt):
    esp32 = types.ModuleType("esp32")

    class RMT:
        def __init__(self, channel, pin=None, clock_div=80, tx_carrier=None,
                     num_symbols=48):
            if rmt.rx_live:
                raise OSError("ESP_ERR_NOT_FOUND: RX still holds RMT")
            rmt.tx_live += 1
            rmt.log.append("tx+")
            self.alive = True
            self.sent = []

        def write_pulses(self, pulses, start):
            self.sent.append(list(pulses))
            rmt.log.append("send")

        def wait_done(self, timeout=0):
            return True

        def deinit(self):
            if self.alive:
                self.alive = False
                rmt.tx_live -= 1
                rmt.log.append("tx-")

    esp32.RMT = RMT
    return esp32


class FakeTime:
    now = 0

    @classmethod
    def ticks_us(cls):
        return cls.now

    @classmethod
    def ticks_ms(cls):
        return cls.now // 1000

    @staticmethod
    def ticks_diff(a, b):
        return a - b


def load_ir(rmt, native):
    """Load oreoWare/ir.py with the fakes; returns (ir, modules)."""
    oreo_ware = types.ModuleType("oreoWare")
    oreo_ware.__path__ = []
    spec = importlib.util.spec_from_file_location("oreoWare.pins",
                                                  ROOT / "oreoWare/pins.py")
    pins = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pins)
    oreo_ware.pins = pins
    modules = {
        "machine": make_machine(rmt),
        "esp32": make_esp32(rmt),
        "_oreo_ir": native,
        "micropython": types.ModuleType("micropython"),
        "oreoWare": oreo_ware,
        "oreoWare.pins": pins,
    }
    with mock.patch.dict(sys.modules, modules):
        spec = importlib.util.spec_from_file_location(
            "ir_under_test", ROOT / "oreoWare/ir.py")
        ir = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ir)
    ir.time = FakeTime
    oreo_ware.ir = ir
    modules["oreoWare.ir"] = ir
    return ir, modules


class IrDriverTest(unittest.TestCase):
    def setUp(self):
        self.rmt = Rmt()
        self.native = FakeNative(self.rmt)
        self.ir, _ = load_ir(self.rmt, self.native)
        self.got = []
        self.addCleanup(self._close)

    def _close(self):
        try:
            self.ir.close()
        except Exception:
            pass

    def on_packet(self, code, info):
        self.got.append((code, info["protocol"]))

    def test_start_twice_and_mode_swaps_open_one_channel(self):
        self.ir.start_receive(self.on_packet, mode="focus")
        for mode in ("beacon", "focus", "beacon", "focus") * 25:
            self.ir.start_receive(self.on_packet, mode=mode)
            self.rmt.check(self)
        self.assertEqual(self.native.starts, 1)
        self.assertEqual(self.ir.rx_status()["backend"], "rmt")

    def test_stop_is_idempotent(self):
        self.ir.stop_receive()
        self.ir.start_receive(self.on_packet)
        self.ir.stop_receive()
        self.ir.stop_receive()
        self.assertEqual(self.native.closes, 1)
        self.assertEqual(self.rmt.rx_live, 0)
        self.assertIsNone(self.ir.rx_status()["backend"])

    def test_send_never_overlaps_rx_and_tx_and_resumes_rx(self):
        self.ir.start_receive(self.on_packet, mode="beacon")
        for i in range(100):
            self.ir.transmit_nec(0xCAFEBABE + i)
            self.rmt.check(self)
            self.ir.start_receive(self.on_packet, mode="focus")
            self.rmt.check(self)
        st = self.ir.rx_status()
        self.assertEqual(st["backend"], "rmt")
        self.assertEqual(st["live_channels"], 1)
        self.assertEqual(self.ir._rx_mode, "focus")
        # Each send: RX down, TX up, send, TX down, RX up again.
        self.assertEqual(self.rmt.log[:6], ["rx+", "rx-", "tx+", "send",
                                            "tx-", "rx+"])
        self.assertEqual(self.native.opens - self.native.closes, 1)

    def test_tx_is_released_and_pin_parked_low_on_close(self):
        self.ir.transmit_nec(0x12345678)          # RX not running
        self.assertEqual(self.rmt.tx_live, 1)     # kept for the next send
        self.ir.close()
        self.assertEqual(self.rmt.tx_live, 0)
        self.assertEqual(self.ir.Pin.levels.get(self.ir.pins.IR_TX), 0)

    def test_native_failure_falls_back_with_full_error(self):
        self.native.fail_start = INVALID_ARG
        self.ir.start_receive(self.on_packet)
        st = self.ir.rx_status()
        self.assertEqual(st["backend"], "irq")
        self.assertEqual(st["warning"], "RMT RX: " + INVALID_ARG)
        self.assertIn("ESP_ERR_INVALID_ARG", st["warning"])
        self.assertIn("ESP_ERR_NOT_FOUND", st["warning"])
        self.assertEqual(self.rmt.rx_live, 0)
        # A restart tries the native receiver again and clears the warning.
        self.ir.stop_receive()
        self.ir.start_receive(self.on_packet)
        st = self.ir.rx_status()
        self.assertEqual(st["backend"], "rmt")
        self.assertIsNone(st["warning"])

    def test_rearm_failure_stops_and_reports(self):
        self.ir.start_receive(self.on_packet)
        self.native.fail_poll = "RMT RX rearm failed: ESP_ERR_INVALID_STATE (0x103)"
        with self.assertRaises(OSError):
            self.ir.poll()
        self.assertIsNone(self.ir.rx_status()["backend"])
        self.assertIn("ESP_ERR_INVALID_STATE", self.ir.last_error())
        self.assertEqual(self.rmt.rx_live, 0)

    def test_stop_failure_is_raised_but_driver_state_is_cleared(self):
        self.ir.start_receive(self.on_packet)
        self.native.fail_stop = "RMT RX stop failed: ESP_ERR_INVALID_STATE"
        with self.assertRaises(OSError):
            self.ir.stop_receive()
        self.assertIsNone(self.ir.rx_status()["backend"])

    def test_send_does_not_transmit_when_rx_cannot_be_released(self):
        self.ir.start_receive(self.on_packet)
        self.native.fail_stop = "RMT RX stop failed: ESP_ERR_INVALID_STATE"
        with self.assertRaises(OSError):
            self.ir.transmit_nec(1)
        self.assertNotIn("tx+", self.rmt.log)
        self.assertIn("TX: RMT RX stop failed", self.ir.last_error())

    def test_nec_frame_is_decoded_and_raw_replayed(self):
        self.ir.start_receive(self.on_packet)
        self.native.frame = tuple(self.ir.nec_pulses(0xDEADBEEF))
        self.ir.poll()
        self.native.frame = (900, 450, 300, 300, 600)
        self.ir.poll()
        self.assertEqual(self.got, [(0xDEADBEEF, "nec"), (None, "raw")])
        self.ir.transmit_capture()
        self.rmt.check(self)
        self.assertEqual(self.ir.rx_status()["backend"], "rmt")

    def test_debug_reaches_the_native_module(self):
        self.assertTrue(self.ir.debug(True))
        self.assertTrue(self.native.debug_flag)
        self.ir.debug(False)
        self.assertFalse(self.native.debug_flag)


# ── IR Quest app ────────────────────────────────────────────────────────────

class FakeDisplay:
    def __init__(self):
        self.texts = []

    def clear(self, *a):
        self.texts = []

    def rect(self, *a, **k):
        pass

    def text(self, s, x, y, *a, **k):
        self.texts.append(s)


class FakeOS:
    def __init__(self):
        self.settings = {}

    def settings_get(self, key, default=None):
        return self.settings.get(key, default)

    def settings_set(self, key, value):
        self.settings[key] = value


def load_quest(ir_modules):
    """Import apps_market/quest/src as a package against fake oreoOS."""
    oreo_os = types.ModuleType("oreoOS")
    oreo_os.__path__ = []
    api = importlib.util.module_from_spec(
        importlib.util.spec_from_file_location("oreoOS.api",
                                               ROOT / "oreoOS/api.py"))
    api.__spec__.loader.exec_module(api)

    class App:
        pass

    class Theme:
        def __getattr__(self, name):
            return 0

    widgets = types.ModuleType("oreoOS.widgets")
    widgets.HEADER_H = 28
    widgets.HINT_H = 16
    widgets.draw_hint = lambda d, text, color=None: d.text(text, 0, 0)
    oreo_os.App = App
    oreo_os.api = api
    oreo_os.theme = Theme()
    oreo_os.widgets = widgets
    pkg = types.ModuleType("quest_under_test")
    pkg.__path__ = [str(ROOT / "apps_market/quest/src")]
    modules = dict(ir_modules)
    modules.update({"oreoOS": oreo_os, "oreoOS.api": api,
                    "oreoOS.widgets": widgets, "quest_under_test": pkg})
    return modules


class QuestLifecycleTest(unittest.TestCase):
    def setUp(self):
        self.rmt = Rmt()
        self.native = FakeNative(self.rmt)
        self.ir, ir_modules = load_ir(self.rmt, self.native)
        modules = load_quest(ir_modules)
        patcher = mock.patch.dict(sys.modules, modules)
        patcher.start()
        self.addCleanup(patcher.stop)
        sys.modules.pop("quest_under_test.app", None)
        sys.modules.pop("quest_under_test.text", None)
        self.mod = importlib.import_module("quest_under_test.app")
        self.mod.time = FakeTime
        self.api = modules["oreoOS.api"]
        self.os = FakeOS()
        self.app = self.mod.App()
        self.d = FakeDisplay()

    def press(self, btn):
        self.app.on_button_press(btn)
        self.app.update(0.02)
        self.app.draw(self.d)
        self.rmt.check(self)

    def test_cold_start_listens_on_focus(self):
        self.app.on_enter(self.os)
        self.app.update(0.02)
        self.app.draw(self.d)
        self.assertIsNone(self.app._error)
        self.assertEqual(self.app._tab, self.mod.TAB_FOCUS)
        self.assertIn("listening...", self.d.texts)
        self.assertEqual(self.rmt.rx_live, 1)

    def test_hundred_tab_cycles_with_sends_leak_nothing(self):
        api = self.api
        self.app.on_enter(self.os)
        self.app._send_sel = 1                    # a predefined NEC code
        for _ in range(100):
            for _tab in range(self.mod.N_TABS):
                if self.app._tab == self.mod.TAB_SEND:
                    self.press(api.BTN_A)         # fire
                self.press(api.BTN_B)
            self.assertEqual(self.app._tab, self.mod.TAB_FOCUS)
            self.assertIsNone(self.app._error)
        self.assertEqual(self.rmt.max_rx, 1)
        self.assertEqual(self.native.opens - self.native.closes, 1)
        # Tab switches never touched the channel: one open per send + 1.
        self.assertEqual(self.native.opens, 101)
        self.app.on_exit()
        self.assertEqual(self.rmt.rx_live, 0)
        self.assertEqual(self.rmt.tx_live, 0)

    def test_send_then_receive_and_replay(self):
        api = self.api
        self.app.on_enter(self.os)
        self.native.frame = tuple(self.ir.nec_pulses(0xC0FFEE00))
        self.app.update(0.02)
        self.assertEqual(self.app._last_code, 0xC0FFEE00)
        for _ in range(2):
            self.press(api.BTN_B)                 # to SEND
        self.assertEqual(self.app._send_sel, self.mod.SEND_RECORDED)
        for _ in range(20):
            self.press(api.BTN_A)                 # replay the capture
            self.assertIsNone(self.app._error)
        self.assertEqual(self.ir.rx_status()["backend"], "rmt")
        self.native.frame = (900, 450, 300, 300, 600)
        self.app.update(0.02)
        self.assertEqual(self.app._last_kind, "raw")

    def test_native_failure_text_is_complete_in_diag(self):
        api = self.api
        self.native.fail_start = INVALID_ARG
        self.app.on_enter(self.os)
        self.assertEqual(self.ir.rx_status()["backend"], "irq")
        for _ in range(3):
            self.press(api.BTN_B)                 # to DIAG
        self.assertEqual(self.app._tab, self.mod.TAB_DIAG)
        shown = []
        for _ in range(10):
            shown.extend(t for t in self.d.texts if t not in shown)
            self.press(api.BTN_DOWN)
        joined = "".join(shown).replace(" ", "")
        self.assertIn(("RMT RX: " + INVALID_ARG).replace(" ", ""), joined)

    def test_poll_error_is_shown_whole_and_scrolls(self):
        api = self.api
        self.app.on_enter(self.os)
        long_msg = "RMT RX rearm failed: ESP_ERR_INVALID_STATE (0x103) " * 6
        self.native.fail_poll = long_msg.strip()
        self.app.update(0.02)
        self.assertIsNotNone(self.app._error)
        lines = self.app._error_lines
        self.assertGreater(len(lines), self.mod.ERROR_LINES)
        self.assertEqual("".join(lines).replace(" ", ""),
                         ("RX: " + long_msg).replace(" ", ""))
        for _ in range(len(lines)):
            self.press(api.BTN_DOWN)
        self.assertEqual(self.app._scroll, len(lines) - self.mod.ERROR_LINES)
        self.press(api.BTN_A)                     # retry
        self.assertIsNone(self.app._error)
        self.assertEqual(self.ir.rx_status()["backend"], "rmt")

    def test_debug_toggle_is_persisted(self):
        api = self.api
        self.app.on_enter(self.os)
        for _ in range(3):
            self.press(api.BTN_B)
        self.press(api.BTN_RIGHT)
        self.assertTrue(self.native.debug_flag)
        self.assertTrue(self.os.settings["ir_debug"])
        self.press(api.BTN_RIGHT)
        self.assertFalse(self.native.debug_flag)


if __name__ == "__main__":
    unittest.main()
