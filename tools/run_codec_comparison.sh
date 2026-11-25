#!/usr/bin/env bash
# RV565 against the MJPEG baseline on the ESP32-S3 badge: every configuration
# goes through tools/run_rv565_matrix.sh (encode, build, flash, 10 runs,
# aggregate), then tools/compare_codecs.py prints the table.
#
# Usage: tools/run_codec_comparison.sh <source-video> [port] [runs]
# Both Big Buck Bunny windows (90 s, 360 s). Per window:
#   dual core: RV565, MJPEG q2/q5/q10 4:2:0
#   serial:    RV565 and MJPEG q5 4:2:0
# No 4:4:4: esp_new_jpeg 1.0.2 rejects it ("Not supported JPEG format"), so
# MJPEG's best-quality mode does not play on the S3 at all.
#
# RV565_RESUME=1 skips any configuration that already has an aggregate in
# benchmarks/measurements/, to pick a stopped run back up.
set -euo pipefail

source_video=$1
port=${2:-/dev/ttyACM0}
runs=${3:-10}
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo"

matrix() {
  local label
  label=$(printf 'bbb%03d-%s' "$1" "$2")
  [ "${RV565_CODEC}" = mjpeg ] && label="$label-mjpeg-q$RV565_JPEG_Q-$RV565_JPEG_SUB"
  if [ "${RV565_RESUME:-0}" = 1 ] &&
     ls benchmarks/measurements/video-benchmark-"$label"-aggregate-*.json >/dev/null 2>&1; then
    echo "== $label: already measured, skipping"
    return
  fi
  tools/run_rv565_matrix.sh "$source_video" "$1" "$2" "$port" "$runs"
}

for start in 90 360; do
  for mode in overlap serial; do
    RV565_CODEC=rv565 matrix "$start" "$mode"
    if [ "$mode" = overlap ]; then
      configs="2:420 5:420 10:420"
    else
      configs="5:420"
    fi
    for c in $configs; do
      RV565_CODEC=mjpeg RV565_JPEG_Q=${c%%:*} RV565_JPEG_SUB=${c##*:} matrix "$start" "$mode"
    done
  done
done

latest=()
for start in 090 360; do
  for label in overlap overlap-mjpeg-q2-420 overlap-mjpeg-q5-420 overlap-mjpeg-q10-420 \
               serial serial-mjpeg-q5-420; do
    latest+=("$(ls -t benchmarks/measurements/video-benchmark-bbb$start-$label-aggregate-*.json | head -1)")
  done
done
python3 tools/compare_codecs.py "${latest[@]}" \
  --json benchmarks/measurements/codec-comparison.json | tee benchmarks/measurements/codec-comparison.md
