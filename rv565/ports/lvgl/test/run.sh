#!/bin/sh
# Build lv_rv565 against real LVGL releases and run its host test.
#
#   ports/lvgl/test/run.sh [v9.2.2 v9.4.0 ...]
#
# Each LVGL release is cloned once into ports/lvgl/test/build/ and built with
# a generated lv_conf.h (16-bit colour, the stdio file system on letter A,
# 512 KB heap); later runs reuse it.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
BUILD="$HERE/build"
CC=${CC:-cc}
VERSIONS=${*:-"v9.2.2 v9.4.0"}
DATA="$ROOT/tests/data"

# Every valid conformance clip of format versions 7 and 8: the supported
# formats are checked frame by frame, the others must be refused. Plus
# larger region-delta clips written by make_clips.py (more rectangles than
# LV_RV565_MAX_RECTS, and bands shifted sideways).
mkdir -p "$BUILD"
python3 -I "$HERE/make_clips.py" "$BUILD/clips"
CLIPS=$(ls "$DATA"/v7/*.rv565 "$DATA"/v8/*.rv565 "$BUILD"/clips/*.rv565 | grep -v '/invalid_' | tr '\n' ' ')

for v in $VERSIONS; do
    L="$BUILD/lvgl-$v"
    if [ ! -d "$L" ]; then
        git -c advice.detachedHead=false clone -q --depth 1 --branch "$v" https://github.com/lvgl/lvgl.git "$L"
    fi
    CONF="$BUILD/conf-$v"
    mkdir -p "$CONF"
    sed -e 's/^#if 0 .*enable content.*/#if 1/' \
        -e 's/^#define LV_COLOR_DEPTH .*/#define LV_COLOR_DEPTH 16/' \
        -e 's/^\( *\)#define LV_MEM_SIZE .*/\1#define LV_MEM_SIZE (512 * 1024U)/' \
        -e 's/^#define LV_USE_FS_STDIO .*/#define LV_USE_FS_STDIO 1/' \
        -e "s/^\( *\)#define LV_FS_STDIO_LETTER .*/\1#define LV_FS_STDIO_LETTER 'A'/" \
        "$L/lv_conf_template.h" > "$CONF/lv_conf.h"
    grep -q '^#if 1' "$CONF/lv_conf.h" || { echo "lv_conf.h for $v not enabled"; exit 1; }

    FLAGS="-std=gnu99 -O1 -DLV_CONF_INCLUDE_SIMPLE -DLV_LVGL_H_INCLUDE_SIMPLE -I$CONF -I$L"
    LIB="$BUILD/liblvgl-$v.a"
    if [ ! -f "$LIB" ]; then
        echo "building LVGL $v ..."
        OBJ="$BUILD/obj-$v"
        mkdir -p "$OBJ"
        find "$L/src" -name '*.c' | while read -r c; do
            o="$OBJ/$(echo "${c#$L/}" | tr '/' '_' | sed 's/\.c$/.o/')"
            $CC $FLAGS -w -c "$c" -o "$o"
        done
        ar rcs "$LIB" "$OBJ"/*.o
    fi

    T="$BUILD/test_lv_rv565-$v"
    $CC $FLAGS -Wall -Wextra -Werror -I"$HERE/.." -I"$ROOT/src" \
        "$HERE/test_lv_rv565.c" "$HERE/../lv_rv565.c" \
        "$ROOT/src/rv565.c" "$ROOT/src/third_party/miniz_tinfl.c" \
        "$LIB" -lm -o "$T"
    echo "== LVGL $v"
    "$T" "$DATA" $CLIPS
done
