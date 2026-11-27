# Version 7 playback on the Falera Badge

Measures RV565 version 7 clips on the Falera Badge (ESP32-S3 N16R8, 2.0"
320x240 ST7789 on SPI at 40 MHz, the badge's pins). It plays one embedded clip
through the library's player, dual-core (inflate on core 1) or serial, and
prints one line per pass through the clip:

```
pass 2: 240 presented, 0 late, 0 skipped | work mean 31.40 max 31.52 ms | transfer mean 31.30 max 31.40 ms | decode mean 9.10 ms | rows sent 100.0% | period 41.67 ms
```

- **late**: frames finished after their deadline; **skipped**: frames the
  pacer dropped to catch up (never decoded for display).
- **work**: the frame's critical path; **transfer**: display writes.
- **rows sent**: the share of the panel's 240 rows written per frame.
  Partial deltas send only the rows of their changed bands, repeats nothing.

The benchmark uses the badge's partition table, so it overwrites only the app
partition: the FaleraOS files in `vfs` stay. Afterwards, flash the FaleraOS
firmware again to get the badge back. The app, clip included, must fit in
2.25 MiB, which holds about 15 seconds of 180x135 film.

## Run

ESP-IDF 5.5 and the badge on `/dev/ttyACM0`:

```bash
cd ~/elixpo_projects/rv565
SRC=big_buck_bunny_480p_h264.mov
python3 tools/rv565.py encode $SRC w90.rv565 --start 90 --seconds 10
python3 tools/rv565.py encode $SRC w90_full.rv565 --start 90 --seconds 10 --band-lines 0
python3 tools/make_ui_clip.py ui.mkv
python3 tools/rv565.py encode ui.mkv ui.rv565
python3 tools/rv565.py encode ui.mkv ui_full.rv565 --band-lines 0

for clip in w90 w90_full ui ui_full; do
    benchmarks/esp32s3_v7_player/run.sh $clip.rv565 1      # dual-core
    benchmarks/esp32s3_v7_player/run.sh $clip.rv565 0      # serial
done
```

`run.sh CLIP [OVERLAP] [PORT] [PASSES]` builds, flashes, resets the board and
records `PASSES` (default 4) pass lines in `measurements/<clip>-<mode>.log`.
Ignore pass 1, which includes start-up. To watch by hand instead:
`idf.py -DRV565_CLIP=$PWD/ui.rv565 -DRV565_OVERLAP=1 -p /dev/ttyACM0 flash monitor`
in this folder.

`--band-lines 0` turns partial deltas off, so the `_full` clips send every row
of every changed frame. Without partial deltas there are no band shifts
either, so `ui_full` is also a larger file: compare frame work and rows sent,
and look at the image for artefacts (partial row windows that leave stale
rows, or a wrong window after the next whole frame).
