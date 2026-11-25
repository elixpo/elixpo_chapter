# Stage 12 — Matched-Load Evaluation

Stage 12 replaces the Stage 11 comparison. It measures five workloads in both
domains under matched load conditions and replays the recovery protocol over
the measured traces in order.

## Why Stage 11 was superseded

- The Stage 4/11 Linux runner was a new process per invocation, so Linux
  latency was dominated by process creation.
- The Stage 11 replay paired loaded Linux traces with idle MCU traces, although
  every MCU call is dispatched through Linux userspace and the Bridge router.

## Workloads and executors

| Workload | Work |
| --- | --- |
| `add` | signed 32-bit addition |
| `crc32` | bitwise CRC-32 over a 64-byte block |
| `fir-x1`, `fir-x64`, `fir-x512` | 16-tap Q15 FIR over 32 samples, repeated 1/64/512 times |

Kernels live in `qtasks/kernels.qtask.h`. The Linux executor
(`runtime/stage12/linux`) is a persistent process reached over a pipe; the MCU
executor (`runtime/stage12/rt`) answers each request in one Bridge call that
returns the result and its cycle-counter compute time. Requests carry a 64-byte
block in base64 (at most 96 characters), inside the 128-byte payload envelope
verified in Stage 1. Every result is checked against a Python reference.

## Build, flash, and run

```bash
aarch64-linux-gnu-g++ -std=c++20 -O2 -Wall -Wextra -Werror -pedantic \
  runtime/stage12/linux/qf_stage12_linux.cpp -o build/stage12/linux/qf-stage12-linux
arduino-cli compile --fqbn arduino:zephyr:unoq --build-path build/stage12/rt \
  --build-property "compiler.cpp.extra_flags=-I$PWD" runtime/stage12/rt/qf_stage12_kernels
arduino-cli upload --fqbn arduino:zephyr:unoq --port /dev/ttyACM0 --input-dir build/stage12/rt
```

On the board, with the ARM64 executor copied to `build/stage12/linux/`:

```bash
sudo -E env PATH="$PATH" bash scripts/run-stage12-campaign.sh stage12-kernels-01
qf workload evaluate --campaign data/processed/stage12/stage12-kernels-01 \
  --output data/processed/stage12/stage12-kernels-01/evaluation.json
```

The campaign profiles 3 loads (idle; 8 `stress-ng` CPU workers; 4 workers at
`SCHED_FIFO` 80, 50% duty, 10-ms slices) x 2 callers (`SCHED_OTHER`,
`SCHED_FIFO` 50) x 2 domains, 2,000 samples after 100 warm-up per workload.

## Pre-declared rules

Fixed in `src/qfabric/stage12.py` and committed before data collection:

- Per-task deadline: 1.25x the slower domain's idle ordinary-caller p99,
  rounded up to 1 ms; the chain deadline is four times that.
- Protocol: 20-invocation windows, 1% tolerance, 3 consecutive violating
  windows, 6 probation windows, one switch attempt per trace.
- Replay walks each trace in measured order, 500 chain observations per cell.

## Findings

- Idle per-call p95: Linux 0.075 ms vs MCU 18.81 ms for `add`; the MCU
  residual stays near 19 ms for every workload, and it computes `fir-x512` 34x
  slower.
- Under RT contention, MCU p99 reaches about 400 ms against at most 17 ms for
  Linux.
- Linux meets every chain contract (worst miss rate 0.8%) and the controller
  makes no switches in 30 cells. With `k = 1` it switches in 7 cells, raising
  p95 by up to 177x; probation rolls back 5.

Paper assets: `python3 scripts/generate-stage12-assets.py`.
