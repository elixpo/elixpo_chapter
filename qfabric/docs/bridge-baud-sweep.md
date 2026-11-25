# Bridge serial baud-rate sweep

The UNO Q Bridge runs its Linux–MCU serial link (`/dev/ttyHS1` ↔ `Serial1`) at
115200 baud: `arduino-router` is started with `--serial-baudrate 115200` by its
packaged `10-imola.conf`, and `Arduino_RouterBridge` defaults
`DEFAULT_SERIAL_BAUD` to 115200. This sweep measures how much of the Bridge's
per-call cost is serial transfer time.

## Method

`scripts/run-baud-sweep.sh` runs on the board. For each rate it flashes a Stage 12
sketch built with `-DQF_BRIDGE_BAUD=<rate>` (`Bridge.begin(rate)`), restarts the
router at the same rate through a systemd drop-in, waits until a call succeeds,
profiles the five Stage 12 workloads at idle with an ordinary caller, and finally
restores 115200. Requests are at most 96 characters (64-byte blocks in base64).

- Campaign `baud-sweep-01`: 115200, 230400, 460800; 1,000 calls per workload after 50 warm-up.
- Campaign `baud-probe-01`: 921600, 2000000; 100 calls per workload after 10 warm-up, 0.5 s timeout.
- Board software: Debian 13, `arduino-router` 0.10.0, `Arduino_RouterBridge` 0.4.3, `arduino:zephyr` 1.0.0.

## Results

| Baud | add p50 / p95 (ms) | crc32 p95 | fir-x64 p95 | fir-x512 p95 | Failures |
|---|---|---|---|---|---|
| 115200 | 18.07 / 19.04 | 19.80 | 23.07 | 45.96 | 0 / 5,000 |
| 230400 | 11.33 / 12.96 | 13.61 | 16.03 | 38.94 | 0 / 5,000 |
| 460800 | 8.32 / 8.88 | 9.45 | 12.40 | 35.37 | 0 / 5,000 |
| 921600 | 5.58 / 6.43 (14 successes) | — | — | — | 486 / 500 |
| 2000000 | — | — | — | — | 500 / 500 |

Every failure at 921600 and 2000000 is a timeout, and at 921600 they grow with
message length (86% for the shortest request, 100% for the rest). The router
logged `decoding packet: invalid packet, expected array` while those calls were
lost, consistent with bytes dropped on a link without flow control
([arduino/arduino-router#16](https://github.com/arduino/arduino-router/issues/16)).

## Reading

- From 115200 to 460800 the `add` median falls from 18.07 to 8.32 ms. If the
  saving is all serial transfer, about 13 ms of the 115200 call (roughly 70%) is
  wire time, and the remaining ~5 ms is fixed software overhead.
- 460800 is the fastest rate tested with zero failures: about 2.1× lower per-call
  latency for small requests. `fir-x512` gains less because about 26 ms of it is
  MCU compute.
- The 115200 result reproduces the Stage 12 idle measurement (19.04 vs 18.81 ms
  p95 for `add`).

Raising the rate is not a drop-in change: the router and every deployed sketch
must agree on it, so a sketch built with the old default would lose the Bridge
if only the router changed.
