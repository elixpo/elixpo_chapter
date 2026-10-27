#!/bin/bash
# autoscale.sh — CPU-based autoscaler for lixsearch-app
# Runs as a daemon alongside docker compose.
# Usage: ./autoscale.sh [--min N] [--max N] [--up-threshold N] [--down-threshold N]
#
# Defaults: min=1, max=5, scale-up when avg CPU >70%, scale-down when <25%

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
MIN_REPLICAS=${MIN_REPLICAS:-1}
MAX_REPLICAS=${MAX_REPLICAS:-5}
CPU_UP_THRESHOLD=${CPU_UP_THRESHOLD:-70}     # scale up  when avg CPU% > this
CPU_DOWN_THRESHOLD=${CPU_DOWN_THRESHOLD:-25} # scale down when avg CPU% < this
CHECK_INTERVAL=${CHECK_INTERVAL:-30}         # seconds between checks
COOLDOWN=${COOLDOWN:-120}                    # seconds to wait after a scale event
SERVICE=lixsearch-app

# ── Arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --min)  MIN_REPLICAS=$2; shift 2 ;;
    --max)  MAX_REPLICAS=$2; shift 2 ;;
    --up-threshold)   CPU_UP_THRESHOLD=$2;   shift 2 ;;
    --down-threshold) CPU_DOWN_THRESHOLD=$2; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

log() { echo "[autoscale $(date '+%H:%M:%S')] $*"; }

# ── Helpers ───────────────────────────────────────────────────────────────────

get_replica_count() {
  docker compose ps -q "$SERVICE" 2>/dev/null | wc -l | tr -d ' '
}

get_avg_cpu() {
  local ids
  ids=$(docker compose ps -q "$SERVICE" 2>/dev/null)
  if [[ -z "$ids" ]]; then echo 0; return; fi

  # docker stats returns e.g. "3.14%", strip % and average
  # shellcheck disable=SC2086
  docker stats --no-stream --format "{{.CPUPerc}}" $ids 2>/dev/null \
    | tr -d '%' \
    | awk 'NF{s+=$1; c++} END{if(c>0) printf "%.0f", s/c; else print 0}'
}

scale_to() {
  local target=$1
  log "Scaling $SERVICE to $target replicas..."
  docker compose up -d --scale "$SERVICE=$target" --no-recreate
  log "Scale complete → $target replicas"
}

# ── Main loop ─────────────────────────────────────────────────────────────────
log "Starting autoscaler: service=$SERVICE min=$MIN_REPLICAS max=$MAX_REPLICAS"
log "  scale-up  when avg CPU > ${CPU_UP_THRESHOLD}%"
log "  scale-down when avg CPU < ${CPU_DOWN_THRESHOLD}%"
log "  check every ${CHECK_INTERVAL}s, cooldown ${COOLDOWN}s after scale event"

last_scale=0

while true; do
  sleep "$CHECK_INTERVAL"

  current=$(get_replica_count)
  avg_cpu=$(get_avg_cpu)
  now=$(date +%s)
  since_last=$((now - last_scale))

  log "Replicas: $current | Avg CPU: ${avg_cpu}% | Cooldown left: $((COOLDOWN - since_last > 0 ? COOLDOWN - since_last : 0))s"

  # Respect cooldown window
  if [[ $since_last -lt $COOLDOWN ]]; then
    continue
  fi

  if [[ $avg_cpu -gt $CPU_UP_THRESHOLD && $current -lt $MAX_REPLICAS ]]; then
    new=$((current + 1))
    log "CPU ${avg_cpu}% > ${CPU_UP_THRESHOLD}% → scaling UP $current → $new"
    scale_to "$new"
    last_scale=$(date +%s)

  elif [[ $avg_cpu -lt $CPU_DOWN_THRESHOLD && $current -gt $MIN_REPLICAS ]]; then
    new=$((current - 1))
    log "CPU ${avg_cpu}% < ${CPU_DOWN_THRESHOLD}% → scaling DOWN $current → $new"
    scale_to "$new"
    last_scale=$(date +%s)
  fi
done
