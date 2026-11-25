#!/usr/bin/env bash
set -euo pipefail

# Stress the arduino-router reliable serial link (#73) on the UNO Q with the
# PR's stress sketch: concurrent bursts, MCU resets mid-call, and router
# restarts mid-call. Restores the stock router and sketch on exit.

campaign_id="${1:-stress-01}"
root="data/processed/stress/${campaign_id}"
router_bin="${QF_ROUTER_BIN:?set QF_ROUTER_BIN to the router built from #73}"
stress_image="${QF_STRESS_IMAGE:-/home/arduino/seriallink-stress}"
restore_image="${QF_RESTORE_IMAGE:-build/baud/115200}"
dropin_dir=/etc/systemd/system/arduino-router.service.d
dropin="$dropin_dir/zz-qfabric-baud.conf"

if [[ "$(id -u)" != "0" || -z "${SUDO_USER:-}" ]]; then
  echo "run with sudo -E env PATH=\"\$PATH\"" >&2
  exit 1
fi

as_user() { sudo -u "$SUDO_USER" env PATH="$PATH" HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)" "$@"; }
flash() { as_user arduino-cli upload --fqbn arduino:zephyr:unoq --input-dir "$1" >/dev/null; }
stress() { as_user python scripts/seriallink_stress.py "$@"; }

set_router() {
  mkdir -p "$dropin_dir"
  cat >"$dropin" <<EOF
[Service]
ExecStart=
ExecStart=$router_bin --unix-port /var/run/arduino-router.sock --serial-port /dev/ttyHS1 --serial-baudrate 115200 --serial-max-baudrate $1 --serial-protocol auto --after-ready '/usr/bin/gpioset -c /dev/gpiochip1 -t0 70=1'
EOF
  systemctl daemon-reload
  systemctl restart arduino-router
}

wait_for_echo() {
  as_user python - <<'PYEOF'
import sys, time
from qfabric.runtime import _connect_bridge
deadline = time.monotonic() + 40
while time.monotonic() < deadline:
    try:
        bridge = _connect_bridge("unix:///var/run/arduino-router.sock")
        try:
            if bridge.call("echo", "ping", timeout=1.0) == "ping":
                sys.exit(0)
        finally:
            bridge.disconnect()
    except Exception:
        pass
    time.sleep(0.5)
sys.exit(1)
PYEOF
}

# Pulse the MCU reset line, as the router unit itself does on stop.
reset_mcu() {
  /usr/bin/gpioset -c /dev/gpiochip1 -t0 38=0
  sleep 0.05
  /usr/bin/gpioset -c /dev/gpiochip1 -t0 38=1
}

restore() {
  echo "== restoring stock router and sketch"
  rm -f "$dropin"
  systemctl daemon-reload
  flash "$restore_image" || echo "warning: could not re-flash $restore_image" >&2
  systemctl restart arduino-router
  sleep 8
  echo "restored: $(ps -eo args | grep -oE 'arduino-router[^ ]* .*serial-baudrate [0-9]+' | head -1)"
}
trap restore EXIT

as_user mkdir -p "$root"
flash "$stress_image"

for rate in 460800 1000000; do
  echo "== bursts at max $rate baud"
  set_router "$rate"
  wait_for_echo || { echo "$rate: echo unreachable"; continue; }
  for c in 1 4 8; do
    stress burst --concurrency "$c" --duration 20 --size 200 --output "$root/burst-$rate-c$c.json" | sed "s/^/$rate /"
  done
  stress burst --concurrency 8 --duration 20 --size 200 --mcu-payload-rate 100 --output "$root/burst-$rate-c8-mcu100.json" | sed "s/^/$rate /"
  stress burst --concurrency 1 --duration 2 --size 10 --mcu-payload-rate 10 --output "$root/rate-reset-$rate.json" >/dev/null
done

echo "== MCU reset mid-call (3 resets, 1 Mbaud)"
set_router 1000000
wait_for_echo || echo "echo unreachable before reset test"
stress loop --duration 60 --size 100 --timeout 1.0 --output "$root/mcu-reset-loop.json" &
loop_pid=$!
: >"$root/mcu-reset-events.txt"
for at in 10 15 15; do
  sleep "$at"
  date +%s.%N >>"$root/mcu-reset-events.txt"
  reset_mcu
done
wait "$loop_pid"

echo "== router restart mid-call (2 restarts, 1 Mbaud)"
stress loop --duration 60 --size 100 --timeout 1.0 --output "$root/router-restart-loop.json" &
loop_pid=$!
: >"$root/router-restart-events.txt"
for at in 10 25; do
  sleep "$at"
  date +%s.%N >>"$root/router-restart-events.txt"
  systemctl restart arduino-router
done
wait "$loop_pid"

{
  echo "campaign_id=$campaign_id"
  echo "router_bin=$router_bin"
  echo "stress_image=$stress_image"
  echo "kernel=$(uname -r)"
  echo "git_commit=$(git rev-parse HEAD)"
} | as_user tee "$root/campaign.txt" >/dev/null
chown -R "$SUDO_USER" "$root"
echo "results: $root"
