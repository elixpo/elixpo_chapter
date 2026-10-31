#!/usr/bin/env bash
set -euo pipefail

campaign_id="${1:-stage12-kernels-01}"
root="data/processed/stage12/${campaign_id}"
iterations="${QF_ITERATIONS:-2000}"
warmup="${QF_WARMUP:-100}"
load_workers="${QF_LOAD_WORKERS:-8}"
contention_workers="${QF_CONTENTION_WORKERS:-4}"
contention_load_pct="${QF_CONTENTION_LOAD_PCT:-50}"
contention_slice_ms="${QF_CONTENTION_SLICE_MS:-10}"
contention_prio="${QF_CONTENTION_PRIO:-80}"
measured_prio="${QF_MEASURED_PRIO:-50}"

command -v qf >/dev/null 2>&1 || {
  echo "qf is unavailable; activate the project virtual environment" >&2
  exit 1
}
for tool in chrt stress-ng; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "$tool is required for Stage 12" >&2
    exit 1
  }
done
if [[ "$(id -u)" != "0" ]]; then
  echo "run with sudo -E so SCHED_FIFO can be applied" >&2
  exit 1
fi
[[ -x build/stage12/linux/qf-stage12-linux ]] || {
  echo "build/stage12/linux/qf-stage12-linux is missing; copy the ARM64 artifact first" >&2
  exit 1
}

mkdir -p "$root"
load_pid=""
stop_load() {
  if [[ -n "$load_pid" ]] && kill -0 "$load_pid" 2>/dev/null; then
    kill -TERM "$load_pid" 2>/dev/null || true
    wait "$load_pid" 2>/dev/null || true
  fi
  load_pid=""
}
trap stop_load EXIT

start_load() {
  local load="$1"
  case "$load" in
    idle) return 0 ;;
    cpu)
      stress-ng --cpu "$load_workers" --cpu-method all --metrics-brief \
        >"$root/load-cpu.log" 2>&1 &
      ;;
    rt-contention)
      # A periodic higher-priority SCHED_FIFO co-runner that tuning the measured
      # task to priority $measured_prio cannot preempt.
      stress-ng --cpu "$contention_workers" --cpu-method all \
        --cpu-load "$contention_load_pct" --cpu-load-slice "$contention_slice_ms" \
        --sched fifo --sched-prio "$contention_prio" --metrics-brief \
        >"$root/load-rt-contention.log" 2>&1 &
      ;;
  esac
  load_pid=$!
  sleep 5
  kill -0 "$load_pid" 2>/dev/null || {
    echo "stress-ng stopped before the $load profiles" >&2
    exit 1
  }
}

for load in idle cpu rt-contention; do
  start_load "$load"
  for policy in other fifo; do
    for domain in linux rt; do
      output="$root/${load}-${policy}-${domain}.json"
      [[ -f "$output" ]] && continue
      prefix=()
      [[ "$policy" == "fifo" ]] && prefix=(chrt -f "$measured_prio")
      echo "== $load / $policy / $domain"
      "${prefix[@]}" qf workload profile \
        --domain "$domain" \
        --load "$load" \
        --policy "$policy" \
        --iterations "$iterations" \
        --warmup "$warmup" \
        --output "$output"
    done
  done
  stop_load
done

{
  echo "campaign_id=$campaign_id"
  echo "iterations=$iterations"
  echo "warmup=$warmup"
  echo "seed=12012026"
  echo "load_workers=$load_workers"
  echo "contention=workers:$contention_workers,load:$contention_load_pct%,slice:${contention_slice_ms}ms,SCHED_FIFO:$contention_prio"
  echo "measured_fifo_priority=$measured_prio"
  echo "router_policy=$(chrt -p "$(pgrep -o arduino-router)" 2>/dev/null | head -1 || echo unknown)"
  echo "governor=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo unknown)"
  echo "kernel=$(uname -r)"
  echo "architecture=$(uname -m)"
  echo "python=$(python --version 2>&1)"
  echo "git_commit=$(git rev-parse HEAD)"
  printf 'command=sudo -E env PATH="$PATH" bash scripts/run-stage12-campaign.sh %s\n' "$campaign_id"
} >"$root/campaign.txt"

owner="${SUDO_USER:-}"
if [[ -n "$owner" ]]; then
  chown -R "$owner":"$(id -gn "$owner")" "$root"
fi

echo "Stage 12 campaign complete"
echo "results: $root"
