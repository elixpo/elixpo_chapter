"""IR receiver self-test for issue #48. Runs ON the badge (MicroPython):

    falera run tools/ir_selftest.py

`falera run` pauses FaleraOS, runs this file and streams what it prints;
Ctrl-C stops it and FaleraOS starts again. Needs firmware with the hardened
_oreo_ir module (info() returns 13 fields, debug() exists) and IR Quest
installed from the App Store (it lives in /apps/quest).

Phases (each prints PASS/FAIL lines; the last line is "IR48 RESULT ..."):

  1. cold   the native receiver arms on GPIO 18 (run it straight after a
            power-on to cover the cold-boot case: it reports "cold" when
            no RX channel was created since boot)
  2. cycles IR Quest, headless, CYCLES times FOCUS > BEACON > SEND (fire a
            predefined NEC code) > DIAG > FOCUS; after every cycle RX must
            be listening on the same channel, DMA unchanged, exactly one
            live RX channel and no app error; on exit no RX or TX channel
            may remain
  3. driver stop/start idempotence and GPIO 18 idle level
  4. live   (needs a remote, optional) capture an NEC frame and a raw
            frame, retransmit both, and check RX still works afterwards.
            Point a second badge running IR Quest (FOCUS) at this one to
            see the retransmissions arrive.

Edit the constants below to change the run.
"""

import gc
import sys
import time

CYCLES = 100        # phase 2 tab cycles
WAIT_S = 20         # phase 4: seconds to wait for each remote press
LIVE = True         # run phase 4
DEBUG = False       # print the driver's lifecycle log ([ir] lines) too

if "/" not in sys.path:
    sys.path.append("/")

_passed = 0
_failed = 0


def check(ok, what, detail=""):
    global _passed, _failed
    if ok:
        _passed += 1
        print("PASS  %s%s" % (what, ("  " + detail) if detail else ""))
    else:
        _failed += 1
        print("FAIL  %s%s" % (what, ("  " + detail) if detail else ""))
    return ok


def heap():
    gc.collect()
    idf = None
    try:
        import esp32
        # (total, free, largest_free, min_free) per ESP-IDF heap region. A
        # leaked RX channel costs ~2.5 KiB (struct, DMA nodes, 2 KiB buffer).
        idf = sum(r[1] for r in esp32.idf_heap_info(esp32.HEAP_DATA))
    except Exception:
        pass
    return gc.mem_free(), idf


def status_line(st):
    keys = ("backend", "channel", "dma", "filter_ns", "state", "stage",
            "esp_err", "live_channels", "tx_open", "frames", "dma_skipped",
            "warning")
    return " ".join("%s=%s" % (k, st.get(k)) for k in keys if k in st)


class FakeOS:
    """The bits of the os object IR Quest uses."""

    def __init__(self):
        self.s = {}

    def settings_get(self, key, default=None):
        return self.s.get(key, default)

    def settings_set(self, key, value):
        self.s[key] = value


class NullDisplay:
    def clear(self, *a):
        pass

    def rect(self, *a, **k):
        pass

    def text(self, *a, **k):
        pass


def phase_cold(ir, nat):
    print("\n== 1. cold start ==")
    info = nat.info()
    fresh = len(info) >= 13 and info[11] == 0
    print("RX channels created since boot: %s (%s)" % (
        info[11] if len(info) >= 13 else "?", "cold" if fresh else "warm"))
    ir.start_receive(lambda code, info: None, mode="focus")
    st = ir.rx_status()
    print(status_line(st))
    check(st.get("backend") == "rmt", "native RMT RX armed on GPIO 18",
          "" if st.get("backend") == "rmt" else st.get("warning") or "")
    check(st.get("live_channels") == 1, "exactly one live RX channel",
          "live=%s" % st.get("live_channels"))
    ir.close()
    st = ir.rx_status()
    check(st.get("live_channels") == 0 and not st.get("tx_open"),
          "close() leaves no RMT channel", status_line(st))


def load_quest():
    last = None
    for name in ("apps.quest.src.app", "remote.apps.quest.src.app"):
        try:
            return __import__(name, None, None, ["App"])
        except ImportError as exc:
            last = exc
    raise last


def phase_cycles(ir):
    print("\n== 2. IR Quest: %d tab cycles with a send each ==" % CYCLES)
    try:
        quest = load_quest()
    except Exception as exc:
        check(False, "import IR Quest (install it from the App Store)", str(exc))
        return
    from oreoOS import api
    app = quest.App()
    d = NullDisplay()
    app.on_enter(FakeOS())
    app.update(0.02)
    app.draw(d)
    st = ir.rx_status()
    base_ch, base_dma = st.get("channel"), st.get("dma")
    print("baseline: " + status_line(st))
    ok = check(app._error is None and st.get("backend") == "rmt",
               "FOCUS listening on enter", app._error or "")
    heap0 = heap()
    t0 = time.ticks_ms()
    cycle = 0
    while ok and cycle < CYCLES:
        cycle += 1
        for _ in range(quest.N_TABS):
            if app._tab == quest.TAB_SEND:
                app._send_sel = 1                 # "Booth A" NEC code
                app.on_button_press(api.BTN_A)
            app.on_button_press(api.BTN_B)
            app.update(0.02)
            app.draw(d)
        st = ir.rx_status()
        problems = []
        if app._error:
            problems.append("app error: %s" % app._error)
        if app._tab != quest.TAB_FOCUS:
            problems.append("tab %d" % app._tab)
        if st.get("backend") != "rmt":
            problems.append("backend %s (%s)" % (st.get("backend"),
                                                 st.get("warning")))
        if st.get("live_channels") != 1:
            problems.append("live RX channels %s" % st.get("live_channels"))
        if st.get("channel") != base_ch or st.get("dma") != base_dma:
            problems.append("channel/DMA changed: ch%s dma=%s" % (
                st.get("channel"), st.get("dma")))
        if problems:
            ok = check(False, "cycle %d" % cycle, "; ".join(problems))
            print(status_line(st))
        elif cycle % 10 == 0:
            print("  cycle %3d ok  %s" % (cycle, status_line(st)))
    if ok:
        check(True, "%d cycles FOCUS>BEACON>SEND>DIAG>FOCUS" % CYCLES,
              "%d ms" % time.ticks_diff(time.ticks_ms(), t0))
    heap1 = heap()
    print("heap: gc %s -> %s, ESP-IDF %s -> %s" % (
        heap0[0], heap1[0], heap0[1], heap1[1]))
    if heap0[1] is not None and heap1[1] is not None:
        check(heap0[1] - heap1[1] < 4096, "no ESP-IDF heap leak over the cycles",
              "delta=%d bytes" % (heap0[1] - heap1[1]))
    app.on_exit()
    st = ir.rx_status()
    check(st.get("live_channels") == 0 and not st.get("tx_open")
          and st.get("backend") is None,
          "on_exit releases RX and TX", status_line(st))


def phase_driver(ir, nat):
    print("\n== 3. driver idempotence and GPIO 18 ==")
    from machine import Pin
    from oreoWare import pins
    opens = nat.info()[11]
    ir.stop_receive()
    ir.stop_receive()
    ir.start_receive(lambda c, i: None)
    ir.start_receive(lambda c, i: None, mode="beacon")
    nat.start(pins.IR_RX)                  # native start while listening
    check(nat.info()[11] - opens == 1, "repeated start opens one channel",
          "opened=%d" % (nat.info()[11] - opens))
    idle = Pin(pins.IR_RX).value()         # no re-init: reads the level only
    check(idle == 1, "GPIO 18 idles high (input, pull-up) while listening",
          "level=%d" % idle)
    ir.transmit_nec(0xCAFEBABE)
    st = ir.rx_status()
    check(st.get("backend") == "rmt" and st.get("live_channels") == 1
          and not st.get("tx_open"), "RX back after a send, TX released",
          status_line(st))
    idle = Pin(pins.IR_RX).value()
    check(idle == 1, "GPIO 18 still idles high after TX", "level=%d" % idle)
    ir.close()
    ir.close()
    nat.stop()
    check(nat.info()[11] == nat.info()[12], "stop/close twice is harmless",
          "opened=%d closed=%d" % (nat.info()[11], nat.info()[12]))


def wait_frame(ir, prompt):
    got = []
    ir.start_receive(lambda code, info: got.append((code, info)))
    print(prompt + " (%d s)" % WAIT_S)
    t0 = time.ticks_ms()
    while not got and time.ticks_diff(time.ticks_ms(), t0) < WAIT_S * 1000:
        ir.poll()
        time.sleep_ms(10)
    return got[0] if got else (None, None)


def describe(code, info):
    pulses = info["pulses"]
    return "%s code=%s pulses=%d first=%s" % (
        info["protocol"], ("0x%08X" % code) if code is not None else "-",
        info["pulse_count"], list(pulses[:8]))


def phase_live(ir):
    print("\n== 4. live capture and retransmit ==")
    captures = []
    for kind in ("NEC", "raw (a non-NEC remote: TV/AC of another brand)"):
        code, info = wait_frame(ir, "Press a button on a %s remote aimed at "
                                    "the badge" % kind)
        if info is None:
            check(False, "%s capture" % kind.split()[0], "nothing received")
            continue
        check(True, "%s capture" % kind.split()[0], describe(code, info))
        if kind == "NEC" and code is None:
            print("      (decoded as raw: that remote is not NEC)")
        captures.append((code, info))
    for code, info in captures:
        for _ in range(3):
            ir.transmit_capture(info)
            time.sleep_ms(150)
        if code is not None:
            ir.transmit_nec(code)
        st = ir.rx_status()
        check(st.get("backend") == "rmt" and st.get("live_channels") == 1,
              "retransmitted %s; RX listening again" % info["protocol"],
              "a second badge on FOCUS should show %s" % (
                  ("0x%08X" % code) if code is not None else "raw / unknown"))
    if captures:
        code, info = wait_frame(ir, "Press any remote button once more "
                                    "(receive after send)")
        check(info is not None, "receive after send",
              describe(code, info) if info else "nothing received")
    ir.close()


def main():
    print("IR48 self-test: %d cycles, live=%s, debug=%s" % (CYCLES, LIVE, DEBUG))
    try:
        import _oreo_ir as nat
    except ImportError:
        print("FAIL  firmware has no _oreo_ir module")
        return
    if len(nat.info()) < 13 or not hasattr(nat, "debug"):
        print("FAIL  firmware predates the issue #48 fixes; flash the new build")
        return
    from oreoWare import ir
    ir.debug(DEBUG)
    try:
        phase_cold(ir, nat)
        phase_cycles(ir)
        phase_driver(ir, nat)
        if LIVE:
            phase_live(ir)
    except Exception as exc:
        check(False, "unexpected exception", "%s: %s" % (type(exc).__name__, exc))
        sys.print_exception(exc)
    finally:
        try:
            ir.close()
        except Exception as exc:
            print("close: %s" % exc)
        ir.debug(False)
        print("final: " + status_line(ir.rx_status()))
        print("IR48 RESULT: %d passed, %d failed" % (_passed, _failed))


main()
