#!/usr/bin/env bash
# Measure one RV565 configuration on the Raspberry Pi Pico 2 end to end:
# encode a 4-second clip window, build the benchmark in serial or overlap mode,
# flash it with picotool, and collect repeated runs.
#
# Usage: tools/run_rv565_matrix_rp2350.sh <source-video> <start-seconds> <serial|overlap> [port] [runs]
# Requires PICO_SDK_PATH, picotool, and a clean tracked tree. The paper's
# 10-second windows do not fit in the Pico 2's 4 MB of flash; 4 s (96 frames)
# does, and the 30-second measurement loops it.
#
# RV565_CODEC=mjpeg measures the MJPEG baseline instead (JPEGDEC), with
# RV565_JPEG_Q (default 5) and RV565_JPEG_SUB (420; JPEGDEC also decodes 444).
# Each configuration ends with an aggregate for tools/compare_codecs.py.
set -euo pipefail

source_video=$1
start=$2
mode=$3
port=${4:-/dev/ttyACM0}
runs=${5:-10}
seconds=${RV565_SECONDS:-4}

repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo"

[ -n "${PICO_SDK_PATH:-}" ] || { echo "Set PICO_SDK_PATH to your pico-sdk checkout." >&2; exit 1; }
command -v picotool >/dev/null || { echo "Install picotool (or flash build/*.uf2 in BOOTSEL mode by hand)." >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] ||
  { echo "Commit or stash tracked changes so runs record a clean revision." >&2; exit 1; }
case $mode in
  serial) overlap=0 ;;
  overlap) overlap=1 ;;
  *) echo "mode must be serial or overlap" >&2; exit 1 ;;
esac

bench=benchmarks/rp2350_video_dma
label=$(printf 'rp2350-bbb%03d-%s' "$start" "$mode")
case ${RV565_CODEC:-rv565} in
  rv565)
    codec=0
    clip=$bench/video.rv565
    python3 tools/encode_video_benchmark.py "$source_video" "$clip" \
      --start "$start" --seconds "$seconds" --fps 24
    ;;
  mjpeg)
    codec=1
    q=${RV565_JPEG_Q:-5}
    sub=${RV565_JPEG_SUB:-420}
    label="$label-mjpeg-q$q-$sub"
    clip=$bench/video.mjpeg
    python3 tools/encode_mjpeg_benchmark.py "$source_video" "$clip" \
      --start "$start" --seconds "$seconds" --fps 24 --q "$q" --subsampling "$sub"
    ;;
  *) echo "RV565_CODEC must be rv565 or mjpeg" >&2; exit 1 ;;
esac

# The collector hashes build/rv565_rp2350_bench.uf2, so always build there; a
# fresh configure keeps a previous codec's cached settings out.
rm -rf "$bench/build"
cmake -S "$bench" -B "$bench/build" -DPICO_BOARD=pico2 -DRV565_OVERLAP="$overlap" \
  -DRV565_CODEC="$codec" -DRV565_VIDEO="$PWD/$clip"
cmake --build "$bench/build" -j
picotool load -f -x "$bench/build/rv565_rp2350_bench.uf2"
sleep 3   # let the board re-enumerate as USB serial

for run in $(seq -w 1 "$runs"); do
  python3 tools/collect_video_benchmark.py --platform rp2350 --port "$port" \
    --label "$label-r$run"
done
if [ "$codec" = 1 ]; then
  cp "$bench/video.mjpeg.json" benchmarks/measurements/video-benchmark-"$label"-media.json
fi
python3 tools/summarize_video_benchmarks.py \
  benchmarks/measurements/video-benchmark-"$label"-r*.json --label "$label"
