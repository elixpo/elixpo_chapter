# Hardware test of the reliable serial link (arduino-router #73)

Test of [arduino/arduino-router#73](https://github.com/arduino/arduino-router/pull/73)
(reliable `seriallink` protocol with baud-rate negotiation) on a real Arduino UNO Q,
using the harness from [`bridge-baud-sweep.md`](bridge-baud-sweep.md).

## Setup

- Board: Arduino UNO Q, Debian 13, stock `arduino-router` 0.10.0 package.
- Router: PR #73 head `45dfb7f`, cross-built for ARM64 (`CGO_ENABLED=0`), run in place of
  `/usr/bin/arduino-router` through a systemd drop-in with
  `--serial-baudrate 115200 --serial-max-baudrate <rate> --serial-protocol auto`.
- Sketch libraries: `Arduino_RouterBridge` PR #81 (`505acc2`) and `Arduino_RPClite`
  PR #45 (`163990c`), `arduino:zephyr` 1.0.0. The Stage 12 sketch calls
  `Bridge.begin(<rate>)`, which with the reliable protocol is the maximum rate to negotiate.
- Workload: the five Stage 12 workloads at idle, ordinary caller, 1,000 calls each after
  50 warm-up, requests of at most 96 characters. Link counters from `$/serial/stats`.
- Campaign: `data/processed/baud/seriallink-03`. Raw-link baseline: `baud-sweep-01`.

## Results

p95 latency per call, reliable link (PR #73/#81) vs raw link (stock router and library):

| Rate | add | crc32 | fir-x64 | fir-x512 | Failed calls |
|---|---|---|---|---|---|
| 115200 | 20.93 (raw 19.04) | 22.23 (raw 19.80) | 25.11 (raw 23.07) | 48.25 (raw 45.96) | 0 / 5,000 |
| 460800 | 9.65 (raw 8.88) | 10.15 (raw 9.45) | 13.14 (raw 12.40) | 36.30 (raw 35.37) | 0 / 5,000 |
| 1,000,000 | 8.81 | 7.76 | 10.86 | 34.13 | 0 / 5,000 |
| 2,000,000 | stalled, see below | | | | |

On the raw link, 921600 lost 486 of 500 calls and 2,000,000 lost all 500.

Link counters for each session (`current` in `$/serial/stats`):

| Rate | Data frames sent | Acked | Retransmits | Retransmit timeouts | NAKs | CRC errors | Framing errors |
|---|---|---|---|---|---|---|---|
| 115200 | 5,257 | 5,257 | 0 | 0 | 0 | 0 | 0 |
| 460800 | 5,257 | 5,257 | 0 | 0 | 0 | 0 | 1 |
| 1,000,000 | 5,394 | 5,257 | 137 | 6 | 137 | 0 | 1 |
| 2,000,000 | 4,864 | 1,034 | 3,828 | 1,506 | 1,818 | 0 | 1 |

## Findings

1. **The reliable link works on the UNO Q.** Protocol auto-detection picked `reliable`,
   the session negotiated the requested rate, and RPC methods registered and answered.
   Forcing `--serial-protocol reliable` behaved the same as `auto`.
2. **The protocol costs about 0.7–2.4 ms per call at the same rate** (about 8–12% at
   115200 and 460800), with no failures.
3. **1,000,000 baud is usable only because of the protocol.** About 2.6% of frames were
   NAKed and retransmitted, with zero failed calls, where the raw link failed 97% of
   calls at 921600. Its latency gain over 460800 is modest (add p95 8.81 vs 9.65 ms).
4. **2,000,000 baud negotiates but does not work.** Only 21% of data frames were
   acknowledged and calls stalled for minutes. The link stayed at 2 Mbaud for the whole
   session, which matches the protocol's documented behaviour ("the rate is not
   lowered automatically"). Any sketch built with a 2 Mbaud maximum would degrade the
   same way.
5. **Deployment note.** On a board with the stock 0.10.0 package there is no
   `arduino-router` group, so the newer router sets its socket to `0660 root:root`
   (from `main`, #65) and non-root clients cannot connect until the group exists and
   the user is in it. Newer packages create the group.
