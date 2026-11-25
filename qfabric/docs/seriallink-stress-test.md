# Stress test of the reliable serial link (arduino-router #73)

Follow-up to [`seriallink-hardware-test.md`](seriallink-hardware-test.md), at the
maintainer's invitation to "hammer the router". Same build: arduino-router #73
(`45dfb7f`), Arduino_RouterBridge #81 (`505acc2`), Arduino_RPClite #45 (`163990c`),
UNO Q, Debian 13. The MCU runs the PR's own stress sketch
(`internal/stresstest/server_test`), which provides `echo`, `set_payload_rate`,
`stats` and `link_stats`. Scripts: `scripts/run-seriallink-stress.sh` and
`scripts/seriallink_stress.py`; data: `data/processed/stress/stress-01`.

## Bursts

Concurrent callers, one router connection each, calling `echo` back to back with
200-byte payloads for 20 s; every reply is checked byte for byte. "MCU traffic"
adds the sketch's own 250-byte notifications to Linux at 100 per second.

| Max rate | Callers | Throughput | p95 | Failures or mismatches |
|---|---|---|---|---|
| 460800 | 1 | 55.3 calls/s | 23.8 ms | 0 / 1,101 |
| 460800 | 4 | 152.1 calls/s | 40.6 ms | 0 / 3,032 |
| 460800 | 8 | 155.3 calls/s | 68.3 ms | 0 / 3,101 |
| 460800 | 8 + MCU traffic | 133.3 calls/s | 70.3 ms | 0 / 2,664 |
| 1,000,000 | 1 | 77.2 calls/s | 15.2 ms | 0 / 1,538 |
| 1,000,000 | 4 | 172.4 calls/s | 24.6 ms | 0 / 3,436 |
| 1,000,000 | 8 | 171.7 calls/s | 48.0 ms | 0 / 3,426 |
| 1,000,000 | 8 + MCU traffic | 171.5 calls/s | 48.2 ms | 0 / 3,419 |

Link counters for the 8-caller runs with MCU traffic (router side, session totals):

| Max rate | Data frames | Retransmits | Retransmit timeouts | NAKs | MCU rx errors |
|---|---|---|---|---|---|
| 460800 | 10,501 | 0 | 0 | 0 | 22 |
| 1,000,000 | 12,189 | 133 | 3 | 126 | 129 |

## Recovery

One caller calls `echo` (100 bytes, 1 s timeout) continuously for 60 s and
reconnects after any failure, while the MCU is reset (pulsing the reset line the
router unit itself uses, `gpiochip1` line 38) or the router is restarted.

| Event | Calls lost | How they ended | First successful call after the event |
|---|---|---|---|
| MCU reset ×3 | 3 each | timed out at the 1 s client timeout; none exceeded it | 3.17, 3.17, 3.17 s |
| Router restart ×2 | 1 each | `ConnectionError` within 7 ms | 3.11, 3.10 s |

After every reset and restart the sketch re-registered `echo` on the new session
and calls resumed without intervention.

## Findings

1. No failed or corrupted call in about 21,700 burst calls, including 8 concurrent
   callers with near-maximum payloads and simultaneous MCU-to-Linux traffic.
2. Throughput saturates at about 155 calls/s (460800) and 172 calls/s (1 Mbaud)
   with 200-byte echoes. 1 Mbaud lowers single-caller p95 from 23.8 to 15.2 ms.
3. MCU notification traffic cut 460800 throughput by 14% but had no measurable
   effect at 1 Mbaud.
4. At 1 Mbaud about 1% of frames are retransmitted under full bidirectional load,
   all recovered.
5. Session recovery works: about 3.1–3.2 s after an MCU reset or router restart,
   with automatic re-registration.
6. During an MCU reboot, in-flight and new calls wait for the caller's timeout
   rather than failing fast, because the router only learns of the reset when the
   rebooted MCU opens a new session.
