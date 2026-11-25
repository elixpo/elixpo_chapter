#!/usr/bin/env bash
# Build, flash and measure one clip on the Falera Badge.
#   benchmarks/esp32s3_v7_player/run.sh CLIP.rv565 [OVERLAP=1] [PORT=/dev/ttyACM0] [PASSES=4]
# Writes measurements/<clip>-<overlap|serial>.log next to this script and
# prints the pass lines. Needs ESP-IDF 5.5 (IDF_PATH, or ~/esp/esp-idf-v5.5.1).
set -eo pipefail
[ -f "${1:-}" ] || { echo "usage: $0 CLIP.rv565 [OVERLAP=1] [PORT] [PASSES]" >&2; exit 2; }
clip=$(realpath "$1")
overlap=${2:-1}
port=${3:-/dev/ttyACM0}
passes=${4:-4}
here=$(cd "$(dirname "$0")" && pwd)
name=$(basename "$clip" .rv565)-$([ "$overlap" = 1 ] && echo overlap || echo serial)
build="$here/build/$name"

if ! command -v idf.py >/dev/null 2>&1; then
    export IDF_PATH=${IDF_PATH:-$HOME/esp/esp-idf-v5.5.1}
    # Use the ESP-IDF Python 3.11 environment even when another python3 is first on PATH.
    for env in "$HOME"/.espressif/python_env/idf5.5_py3.1[0-3]_env; do
        [ -x "$env/bin/python" ] && export IDF_PYTHON_ENV_PATH="$env"
    done
    . "$IDF_PATH/export.sh" >/dev/null || { echo "ESP-IDF export failed" >&2; exit 1; }
fi

cd "$here"
log="$build.log"
mkdir -p "$(dirname "$log")"
echo "== $name: building"
idf.py -B "$build" -DRV565_CLIP="$clip" -DRV565_OVERLAP="$overlap" build >"$log" 2>&1 \
    || { tail -30 "$log"; echo "build failed, full log: $log" >&2; exit 1; }
echo "== $name: flashing $port"
idf.py -B "$build" -p "$port" flash >>"$log" 2>&1 \
    || { tail -30 "$log"; echo "flash failed, full log: $log" >&2; exit 1; }
echo "== $name: measuring"
mkdir -p measurements
python - "$port" "$passes" "measurements/$name.log" <<'PY'
import sys, time
import serial
port, passes, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
lines, seen = [], 0
with serial.Serial(port, 115200, timeout=1) as s:
    s.dtr = False; s.rts = True; time.sleep(0.1); s.rts = False  # reset into the app
    deadline = time.time() + 30 + 15 * passes
    while seen < passes and time.time() < deadline:
        line = s.readline().decode(errors="replace").rstrip()
        if not line:
            continue
        if line.startswith(("clip ", "pass ")) or "rv565-v7" in line:
            print(line, flush=True)
            lines.append(line)
            seen += line.startswith("pass ")
open(out, "w").write("\n".join(lines) + "\n")
if seen < passes:
    sys.exit("only %d of %d passes seen; see %s" % (seen, passes, out))
PY
