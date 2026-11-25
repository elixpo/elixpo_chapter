#!/usr/bin/env bash
# Measure one RV565 standalone configuration end to end: encode a clip
# window, build and flash the benchmark in serial or overlap mode, collect
# repeated runs, and aggregate them.
#
# Usage: tools/run_rv565_matrix.sh <source-video> <start-seconds> <serial|overlap> [port] [runs]
# RV565_CODEC=mjpeg measures the MJPEG baseline instead, at RV565_JPEG_Q
# (FFmpeg -q:v, default 5) and RV565_JPEG_SUB (420 or 444, default 420).
# Requires ESP-IDF v5.5.1 exported in the shell and a clean tracked tree.
set -euo pipefail

source_video=$1
start=$2
mode=$3
port=${4:-/dev/ttyACM0}
runs=${5:-10}

repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo"

command -v idf.py >/dev/null ||
  { echo "Export ESP-IDF first: . ~/esp/esp-idf-v5.5.1/export.sh" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] ||
  { echo "Commit or stash tracked changes so runs record a clean revision." >&2; exit 1; }
case $mode in
  serial) overlap=0 ;;
  overlap) overlap=1 ;;
  *) echo "mode must be serial or overlap" >&2; exit 1 ;;
esac

label=$(printf 'bbb%03d-%s' "$start" "$mode")
case ${RV565_CODEC:-rv565} in
  rv565)
    codec=0
    python3 tools/encode_video_benchmark.py "$source_video" \
      benchmarks/esp32s3_video_dma/main/video.rv565 --start "$start" --seconds 10 --fps 24
    ;;
  mjpeg)
    codec=1
    q=${RV565_JPEG_Q:-5}
    sub=${RV565_JPEG_SUB:-420}
    label="$label-mjpeg-q$q-$sub"
    python3 tools/encode_mjpeg_benchmark.py "$source_video" \
      benchmarks/esp32s3_video_dma/main/video.mjpeg --start "$start" --seconds 10 --fps 24 \
      --q "$q" --subsampling "$sub"
    ;;
  *) echo "RV565_CODEC must be rv565 or mjpeg" >&2; exit 1 ;;
esac
(
  cd benchmarks/esp32s3_video_dma
  idf.py -DRV565_OVERLAP="$overlap" -DRV565_CODEC="$codec" -DRV565_BACKLIGHT="${RV565_BACKLIGHT:-60}" -DRV565_SELFTEST=0 build
  idf.py -p "$port" flash
)

for run in $(seq -w 1 "$runs"); do
  python3 tools/collect_video_benchmark.py --port "$port" \
    --label "$label-r$run"
done
if [ "$codec" = 1 ]; then
  cp benchmarks/esp32s3_video_dma/main/video.mjpeg.json \
    benchmarks/measurements/video-benchmark-"$label"-media.json
fi
python3 tools/summarize_video_benchmarks.py \
  benchmarks/measurements/video-benchmark-"$label"-r*.json --label "$label"
