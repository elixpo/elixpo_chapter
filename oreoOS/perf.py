"""Boot and run-loop timing, readable from the REPL (#119, #118).

Always on, because it is cheap: one list append per boot milestone and a
few integer compares per frame. Nothing is printed until you ask:

    >>> from oreoOS import perf
    >>> perf.report()

What it keeps:
  * boot milestones: every launcher._bc() breadcrumb, with its ticks_ms
  * home_ms: when the first Home frame reached the panel (after the swipe)
  * first press: how long after Home appeared the first press was read,
    and an upper bound on how late it acted. A press is latched by the
    button IRQ at any point of the loop period before the frame that
    reads it (work plus sleep floor), and its result is on the panel by
    the end of that frame, so the bound is that full period plus the
    reading frame's own work.
  * the longest frame and the number of frames over SLOW_MS in the first
    WINDOW_MS after Home appeared
  * the longest time the network tail of a frame (netsvc
    tick + the OTA background probe) took since boot, and how many times it went over SLOW_MS.
"""

import time

WINDOW_MS = 10000     # "the first 10 s" after Home appears
SLOW_MS   = 50        # #118 acceptance: no network frame over ~50 ms
MAX_MARKS = 48

_marks = []           # [(ticks_ms, tag)]
_home_ms = None
_first_press = None   # (ms after home, previous frame ms)
_max_frame = 0
_max_frame_at = 0     # ms after home
_slow_frames = 0
_frames = 0
_max_net = 0
_slow_net = 0


def _now():
    return time.ticks_ms()


def reset():
    """Forget everything (host tests; never needed on the badge)."""
    global _home_ms, _first_press, _max_frame, _max_frame_at
    global _slow_frames, _frames, _max_net, _slow_net
    del _marks[:]
    _home_ms = None
    _first_press = None
    _max_frame = _max_frame_at = _slow_frames = _frames = 0
    _max_net = _slow_net = 0


def mark(tag, t=None):
    if len(_marks) < MAX_MARKS:
        _marks.append((_now() if t is None else t, tag))


def home_shown(t=None):
    """The first OS frame is on the panel. Only the first call counts."""
    global _home_ms
    if _home_ms is None:
        _home_ms = _now() if t is None else t
        mark("home shown", _home_ms)


def home_ms():
    return _home_ms


def frame(work_ms, net_ms=0, t=None):
    """One run-loop frame: work_ms is the frame's cost before its sleep,
    net_ms the part spent in the network tail."""
    global _max_frame, _max_frame_at, _slow_frames, _frames
    global _max_net, _slow_net
    if net_ms > _max_net:
        _max_net = net_ms
    if net_ms > SLOW_MS:
        _slow_net += 1
    if _home_ms is None:
        return
    since = time.ticks_diff(_now() if t is None else t, _home_ms)
    if since > WINDOW_MS:
        return
    _frames += 1
    if work_ms > _max_frame:
        _max_frame = work_ms
        _max_frame_at = since
    if work_ms > SLOW_MS:
        _slow_frames += 1


def press(bound_ms, t=None):
    """A button press reached an app or the OS. Records the first one.
    bound_ms: the loop period before the frame that read it plus that
    frame's work; t: when that frame started (it read the press)."""
    global _first_press
    if _first_press is not None or _home_ms is None:
        return
    since = time.ticks_diff(_now() if t is None else t, _home_ms)
    _first_press = (since, bound_ms)


def summary():
    return {
        "marks": list(_marks),
        "home_ms": _home_ms,
        "first_press_after_home_ms": _first_press[0] if _first_press else None,
        "first_press_bound_ms": _first_press[1] if _first_press else None,
        "max_frame_ms": _max_frame,
        "max_frame_at_ms": _max_frame_at,
        "slow_frames": _slow_frames,
        "frames": _frames,
        "max_net_ms": _max_net,
        "slow_net_frames": _slow_net,
    }


def report():
    s = summary()
    t0 = s["marks"][0][0] if s["marks"] else 0
    print("-- boot milestones (ms since first) --")
    for t, tag in s["marks"]:
        print("%6d  %s" % (time.ticks_diff(t, t0), tag))
    print("-- first %d s after Home --" % (WINDOW_MS // 1000))
    print("frames %d, longest %d ms at +%d ms, over %d ms: %d" % (
        s["frames"], s["max_frame_ms"], s["max_frame_at_ms"], SLOW_MS,
        s["slow_frames"]))
    if s["first_press_after_home_ms"] is None:
        print("first press: none yet")
    else:
        print("first press read at +%d ms, acted at most %d ms after "
              "the press (loop period + handling frame)" % (
            s["first_press_after_home_ms"], s["first_press_bound_ms"]))
    print("network tail: longest %d ms, over %d ms: %d" % (
        s["max_net_ms"], SLOW_MS, s["slow_net_frames"]))
    try:
        from oreoOS import netsvc
        print("netsvc:", netsvc.status_text())
    except Exception:
        pass
    return s
