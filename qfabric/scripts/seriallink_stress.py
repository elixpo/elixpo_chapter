#!/usr/bin/env python3
"""Stress client for the arduino-router reliable serial link (arduino-router #73).

Runs against the router's Unix socket with the PR's stress sketch
(internal/stresstest/server_test), which provides "echo", "set_payload_rate",
"stats" and "link_stats".

  burst  N threads, each on its own connection, call "echo" back to back with
         near-maximum payloads; every reply is checked against the request.
  loop   one caller calls "echo" continuously and logs every call with its
         start time, duration and outcome, reconnecting after errors, so an
         outside script can reset the MCU or restart the router meanwhile.
"""

from __future__ import annotations

import argparse
import json
import threading
import time
from pathlib import Path

from qfabric.runtime import _connect_bridge

ADDRESS = "unix:///var/run/arduino-router.sock"


def payload(size: int, seq: int) -> str:
    return "".join(chr(33 + (seq + index) % 94) for index in range(size))


def connect(deadline: float):
    while time.monotonic() < deadline:
        try:
            return _connect_bridge(ADDRESS)
        except Exception:
            time.sleep(0.2)
    return None


def call_logged(bridge, size: int, seq: int, timeout: float) -> tuple[str, float]:
    data = payload(size, seq)
    started = time.monotonic()
    try:
        reply = bridge.call("echo", data, timeout=timeout)
        outcome = "ok" if reply == data else "mismatch"
    except TimeoutError:
        outcome = "timeout"
    except Exception as error:
        outcome = f"error:{type(error).__name__}"
    return outcome, time.monotonic() - started


def try_call(method: str, *args, timeout: float = 2.0):
    try:
        bridge = _connect_bridge(ADDRESS)
        try:
            return bridge.call(method, *args, timeout=timeout)
        finally:
            bridge.disconnect()
    except Exception as error:
        return {"error": repr(error)}


def burst(args: argparse.Namespace) -> dict:
    results: list[list[tuple[str, float]]] = [[] for _ in range(args.concurrency)]
    stop_at = time.monotonic() + args.duration

    def worker(index: int) -> None:
        bridge = connect(time.monotonic() + 10)
        if bridge is None:
            results[index].append(("error:connect", 0.0))
            return
        seq = index * 1_000_000
        try:
            while time.monotonic() < stop_at:
                outcome, elapsed = call_logged(bridge, args.size, seq, args.timeout)
                results[index].append((outcome, elapsed))
                seq += 1
                if outcome.startswith("error"):
                    bridge.disconnect()
                    bridge = connect(time.monotonic() + 5)
                    if bridge is None:
                        return
        finally:
            if bridge is not None:
                bridge.disconnect()

    router_before = try_call("$/serial/stats")
    if args.mcu_payload_rate is not None:
        try_call("set_payload_rate", args.mcu_payload_rate)
    threads = [threading.Thread(target=worker, args=(i,)) for i in range(args.concurrency)]
    started = time.monotonic()
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    wall = time.monotonic() - started
    calls = [item for result in results for item in result]
    ok = sorted(elapsed for outcome, elapsed in calls if outcome == "ok")
    outcomes: dict[str, int] = {}
    for outcome, _ in calls:
        outcomes[outcome] = outcomes.get(outcome, 0) + 1

    def pct(q: float) -> float | None:
        return ok[min(len(ok) - 1, int(q * len(ok)))] * 1000 if ok else None

    return {
        "mode": "burst",
        "concurrency": args.concurrency,
        "payload_bytes": args.size,
        "mcu_payload_rate": args.mcu_payload_rate,
        "duration_s": round(wall, 2),
        "calls": len(calls),
        "outcomes": outcomes,
        "ok_per_s": round(len(ok) / wall, 1) if wall else None,
        "echo_bytes_per_s": round(2 * args.size * len(ok) / wall) if wall else None,
        "p50_ms": pct(0.50),
        "p95_ms": pct(0.95),
        "p99_ms": pct(0.99),
        "max_ms": ok[-1] * 1000 if ok else None,
        "router_stats_before": router_before,
        "router_stats_after": try_call("$/serial/stats"),
        "mcu_link_stats": try_call("link_stats"),
        "mcu_stats": try_call("stats"),
    }


def loop(args: argparse.Namespace) -> dict:
    events: list[dict] = []
    origin_wall = time.time()
    origin = time.monotonic()
    stop_at = origin + args.duration
    bridge = connect(stop_at)
    seq = 0
    while time.monotonic() < stop_at:
        if bridge is None:
            bridge = connect(min(stop_at, time.monotonic() + 2))
            if bridge is None:
                events.append(
                    {
                        "t": round(time.monotonic() - origin, 3),
                        "outcome": "error:connect",
                        "elapsed": 0.0,
                    }
                )
                continue
        at = time.monotonic() - origin
        outcome, elapsed = call_logged(bridge, args.size, seq, args.timeout)
        events.append({"t": round(at, 3), "outcome": outcome, "elapsed": round(elapsed, 4)})
        seq += 1
        if outcome != "ok":
            try:
                bridge.disconnect()
            except Exception:
                pass
            bridge = None
            time.sleep(0.05)
    if bridge is not None:
        bridge.disconnect()
    return {
        "mode": "loop",
        "origin_wall": origin_wall,
        "payload_bytes": args.size,
        "timeout_s": args.timeout,
        "events": events,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="mode", required=True)
    b = sub.add_parser("burst")
    b.add_argument("--concurrency", type=int, required=True)
    b.add_argument("--duration", type=float, default=20.0)
    b.add_argument("--size", type=int, default=200)
    b.add_argument("--timeout", type=float, default=2.0)
    b.add_argument("--mcu-payload-rate", type=int)
    b.add_argument("--output", type=Path, required=True)
    lo = sub.add_parser("loop")
    lo.add_argument("--duration", type=float, required=True)
    lo.add_argument("--size", type=int, default=100)
    lo.add_argument("--timeout", type=float, default=1.0)
    lo.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = burst(args) if args.mode == "burst" else loop(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")
    if report["mode"] == "burst":
        print(
            f"burst c={report['concurrency']} rate={report['mcu_payload_rate']}: "
            f"{report['ok_per_s']} ok/s, p95 {report['p95_ms']} ms, outcomes {report['outcomes']}"
        )
    else:
        bad = sum(1 for e in report["events"] if e["outcome"] != "ok")
        print(f"loop: {len(report['events'])} calls, {bad} not ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
