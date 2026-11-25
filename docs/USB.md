# Using the badge from a computer

Everything you do with the badge from a computer goes over its USB-C cable,
using **falera-cli** (the `falera` command):

- sending photos, videos and documents;
- adding Wi-Fi networks;
- installing apps and updating FaleraOS;
- reading logs;
- opening a MicroPython shell.

Wi-Fi on the badge is used only for the internet: the App Store, FaleraOS
updates, GitHub data, weather and the clock. There is no file upload over
Wi-Fi any more; the old **Send Files** page is gone. Bluetooth sharing is
planned last.

The badge is built on an ESP32-S3-DevKitC-1 N16R8 (see
[`BREADBOARD_BOM.md`](BREADBOARD_BOM.md)). The PCB version keeps the same
native USB port.

| I want to... | Use | Guide |
|---|---|---|
| Put photos, videos or documents on the badge | **Transfer** app + `falera transfer send` | [below](#send-photos-videos-and-documents), [TRANSFER.md](TRANSFER.md) |
| Add a Wi-Fi network with a password | `falera wifi connect` | [CLI.md](CLI.md#wi-fi-setup) |
| Update FaleraOS | `falera update` (or Settings > Updates on the badge) | [CLI.md](CLI.md#falera-update-update-faleraos) |
| Install apps | `falera apps install` (or the App Store on the badge) | [CLI.md](CLI.md#falera-apps-the-app-store) |
| See what the badge prints | `falera logs` | [CLI.md](CLI.md#falera-logs-console-output) |
| Save what the screen shows as a PNG | `falera screenshot` | [CLI.md](CLI.md#falera-screenshot-the-screen-as-a-png) |
| Copy any file, write code, use the REPL | `falera push` / `pull` / `shell` / `dev` | [CLI.md](CLI.md#commands) |
| Drive it by hand without falera-cli | `mpremote` | [Advanced](#advanced-raw-mpremote) |

## Quick start

1. **Install falera-cli.** It needs Python 3.9+ and pipx or uv; other ways to
   install are in [CLI.md](CLI.md#install).

   ```sh
   # Linux, macOS
   curl --proto '=https' --tlsv1.2 -LsSf \
     https://raw.githubusercontent.com/elixpo/falera/main/cli/install.sh | sh
   ```

   ```powershell
   # Windows
   irm https://raw.githubusercontent.com/elixpo/falera/main/cli/install.ps1 | iex
   ```

2. **Plug in the badge** with a data cable. On the DevKitC-1 use the port
   labelled **USB** (see [Which USB-C port](#which-usb-c-port)).
3. **Check that the computer sees it:**

   ```sh
   falera devs          # lists the badge; never opens the port
   falera doctor        # if it is not there: cable, port, permissions, firmware
   ```

   On Linux you may first need serial permissions (see
   [Permissions on Linux](#permissions-on-linux)).
4. **Use it:**

   ```sh
   falera                              # the full-screen Falera view
   falera wifi connect "Home Net"      # put the badge online (password asked without echo)
   falera update                       # newest FaleraOS
   ```

## Send photos, videos and documents

1. On the badge, open the apps drawer, then **Tools > Transfer**. It shows a
   six-character code.
2. On the computer:

   ```sh
   falera transfer send holiday.jpg clip.mp4 talk-notes.md
   ```

3. Type the code the badge shows.

`falera` converts each file to the badge's own format and sends it. The badge
checks each file (SHA-256 and header) before saving it:

- photos and videos go to the **Gallery**;
- `.md` and `.txt` go to the **Reader**.

Videos need [ffmpeg](https://ffmpeg.org/) on the computer. FaleraOS keeps
running throughout.

- `falera transfer list` shows what is there, and `falera transfer rm <name>`
  removes a file.
- **Leave Transfer (HOME) before running other `falera` commands.** While it
  is open, those commands cannot pause FaleraOS, and they fail with "the badge
  did not answer".
- **Without the app:** `falera add <files>` does the same conversion. It
  pauses FaleraOS for the copy instead of asking for a code.

How the code exchange works, and the protocol: [TRANSFER.md](TRANSFER.md).

## Your profile

Badge, Commits, Weather and the clock read the owner's details
(GitHub user, name, timezone, weather location) from `/profile.json` on the
badge. To set them without rebuilding FaleraOS, write the file on the computer
and copy it over:

```sh
cat > profile.json <<'EOF'
{"GITHUB_USER": "octocat", "DISPLAY_NAME": "Mona Lisa",
 "TIMEZONE_OFFSET": 5.5, "WEATHER_LAT": 12.97, "WEATHER_LON": 77.59}
EOF
falera push profile.json /profile.json
```

The keys are listed in [PROFILE.md](PROFILE.md).

## Which USB-C port

The DevKit has two USB-C ports. Use the one labelled **USB**.

| Silkscreen | Connects to | Shows up as | Use it for |
|---|---|---|---|
| **USB** | the ESP32-S3's own USB (GPIO19/20) | `303a:83ec` **Elixpo Falera Badge** | `falera`, Transfer, `mpremote`, deploying and flashing |
| **UART** | a USB-to-serial bridge on UART0 (CH343, `1a86:55d3`, on the tested board) | the bridge's name, not the badge's | boot logs and recovery when the native port is not responding |

`0x303A` is Espressif's USB vendor ID. `0x83EC` is the product ID Espressif
allocated to this badge
([espressif/usb-pids#425](https://github.com/espressif/usb-pids/pull/425)).
The Falera Badge firmware reports it, so the badge appears by name, and `falera`
finds it without you naming a port:

```text
$ lsusb | grep 303a
… ID 303a:83ec … Elixpo Falera Badge
```

Some DevKitC-1 boards use a CP2102N bridge instead of the CH343. On Linux,
that one appears as `/dev/ttyUSB*` rather than `/dev/ttyACM*`.

### The CH343 bridge (UART port)

You normally never need the UART port. If you do, for example to read boot
messages while the native port is not responding:

- **Linux** has a driver for the CH343 built in (`cdc_acm`), and it shows
  up as `/dev/ttyACM*`. On Linux the native port is also `ttyACM*`; tell
  them apart by name in `/dev/serial/by-id/`.
- **macOS** 11 and later usually work with the built-in driver, and it shows
  up as `/dev/cu.usbmodem…` or `/dev/cu.wchusbserial…`.
- **Windows 10 and 11** usually install a driver automatically. If the
  device shows a warning in Device Manager, install WCH's CH343 driver.
- The bridge's baud rate is 115200.

`falera doctor` and `falera devs --all` recognise CH34x and CP210x bridges and
tell you to use the native port instead.

## Ports and names

`falera` finds the badge by its USB ID, so you rarely need a port name. When
several badges are connected, or for `mpremote` and other tools, look it up:

```sh
falera devs                       # badges, with their ports
falera devs --all                 # every USB serial device, with what it probably is
ls -l /dev/serial/by-id/        # Linux: names that include "Elixpo_Oreo_Badge"
```

| System | Typical name |
|---|---|
| Linux | `/dev/ttyACM0` |
| macOS | `/dev/cu.usbmodem…` |
| Windows | `COM3`, `COM4`, … |

The name is assigned by the computer, and it can change after a reset, a
replug or a FaleraOS update. To pick a port:

```sh
falera --port /dev/ttyACM1 info
export OREO_PORT=/dev/ttyACM1        # PowerShell: $env:OREO_PORT = "COM5"
```

On macOS, `falera` swaps a `/dev/tty.usbmodem…` name for its `/dev/cu.…` twin,
because the `tty` one can hang when opened. On Windows, `com5` works as well
as `COM5`.

### Permissions on Linux

If you get "permission denied", add yourself to the group that owns the
port, then log out and back in:

```sh
sudo usermod -aG dialout "$USER"     # Debian, Ubuntu, Fedora
sudo usermod -aG uucp "$USER"        # Arch
```

`falera doctor` checks this.

### One program at a time

Only one program can have the port open. Close other `falera` commands
(including `falera logs`), `mpremote`, Thonny, serial monitors and the Arduino
IDE before you start another.

## Files on the badge

| Path | What it holds |
|---|---|
| `/main.py` | Boot entry point: starts the launcher and reboots after a crash |
| `/oreoOS/` | The OS: launcher, home screen, App Store, OTA, network service |
| `/oreoWare/` | Hardware drivers: display, buttons, IMU, Wi-Fi, Bluetooth, IR |
| `/apps/<name>/` | Installed apps, built-in and from the App Store |
| `/apps/gallery/assets/optimized/` | Photos (`.rz565`) and videos (`.rv565`) shown in Gallery |
| `/documents/` | Documents for the Reader (`.mdz`, `.txtz`, `.md`, `.txt`) |
| `/profile.json` | Your profile (see [PROFILE.md](PROFILE.md)) |
| `/secrets.py`, `/wifi.json` | Settings written at deploy time, and saved Wi-Fi networks |

```sh
falera ls /documents
falera pull -r /apps/pet ./pet-backup
falera rm /documents/old.mdz
```

`falera rm` refuses FaleraOS's own files unless you add `--force`.

## Advanced: raw `mpremote`

falera-cli is built on `mpremote` and covers everything below with safer
defaults: it checks free space, copies files atomically, restarts FaleraOS
afterwards, and protects system files. Use `mpremote` directly when you want
full control, or when you are working on FaleraOS itself.

```sh
pip install "mpremote>=1.28,<1.29"     # matches the badge's MicroPython 1.28
mpremote devs
mpremote connect /dev/ttyACM0 repl     # Ctrl-] to leave
```

**Close Transfer first.** While the app is open, Ctrl-C is turned off on the
console, so `mpremote` cannot stop FaleraOS.

### The REPL

| Keys | Effect |
|---|---|
| **Ctrl-C** | Stops FaleraOS (the badge's `main.py`) and gives you the `>>>` prompt |
| **Ctrl-D** | Soft reset: restarts FaleraOS from `main.py` |
| **Ctrl-]** | Leaves `mpremote`; the badge stays where it was |

While you are at the prompt, FaleraOS is stopped and the screen and buttons do
not respond. Press **Ctrl-D**, or the board's **RST** button, to start it
again. (`falera shell` does the same and restarts FaleraOS when you leave.)

Some things to try at the prompt:

```python
from oreoOS import config, storage
config.VERSION                  # FaleraOS version
storage.usage()                 # free space, and what system, apps, gallery and documents use

from oreoOS import store        # the App Store, from code
store.refresh()
store.install("racer")          # returns (ok, message)
```

### Copying and running files

```sh
mpremote connect /dev/ttyACM0 fs ls :apps
mpremote connect /dev/ttyACM0 fs cp notes.md :documents/notes.md
mpremote connect /dev/ttyACM0 fs cp :apps/racer/main.py .     # badge → computer
mpremote connect /dev/ttyACM0 fs cp -r my_app :apps/          # a whole app folder
mpremote connect /dev/ttyACM0 run hello.py                    # run a file from the computer
mpremote connect /dev/ttyACM0 mount .                         # the computer's folder as /remote
mpremote connect /dev/ttyACM0 reset                           # restart FaleraOS
```

Unlike `falera`, most `mpremote` commands leave the badge at the prompt, so
finish with `reset`. `mpremote` does not convert media: a `.jpg` copied with
`fs cp` will not show in the Gallery. Use `falera transfer send` or `falera add`,
or convert with `python3 tools/media_ingest.py` from a checkout (see
[`MEDIA_INGESTION.md`](MEDIA_INGESTION.md)).

### Your own app

Copy its folder (`main.py`, `manifest.json`, `__init__.py`, `src/`,
`assets/`) to `/apps/<name>/` with `falera push -r my_app /apps/my_app` or
`mpremote fs cp -r`, then restart FaleraOS. To try it without copying, use
`falera dev ./my_app` or `mpremote mount .`. To start a new app, copy
[`app_templates/`](../app_templates/); [`CONTRIBUTING.md`](../CONTRIBUTING.md)
covers writing apps.

### Deploying and reflashing from a checkout

| Command | What it does |
|---|---|
| `./deploy --board` (or `falera update --repo .`) | Uploads changed OS files only (it remembers what it sent) |
| `./deploy --board --clean` | Wipes the badge's filesystem and reinstalls FaleraOS |
| `./deploy --full` (or `falera flash --repo .`) | Reflashes the MicroPython firmware, then installs FaleraOS clean |
| `./build-firmware --flash` | Rebuilds the firmware from source, then runs `./deploy --full` |

Notes:

- `./deploy --board` raises FaleraOS's patch version (`oreoOS/config.py`) on
  every run. Add `--no-bump` when you are only testing.
- `./deploy --board` uploads the OS modules (`oreoOS/`, `oreoWare/`, the
  built-in apps' `src/`) precompiled to `.mpy` when it finds MicroPython
  1.28.0's `mpy-cross` (`$MPY_CROSS`, `PATH`, or the firmware checkout in
  `~/esp`), and removes their `.py` from the badge, since MicroPython imports
  `x.py` before `x.mpy`. Add `--py` to upload plain `.py` while developing
  (it removes the `.mpy` again). `falera dev` runs your app from the computer
  as `.py` either way.
- Pass `--port <device>` if the badge is not `/dev/ttyACM0`.
- `--full` and `./build-firmware --flash` erase everything on the badge,
  including photos, documents and Store apps.

## Troubleshooting

Run `falera doctor` first. It checks the cable, the port, permissions, the
firmware and FaleraOS, and ends with numbered next steps. More cases are in
[CLI.md](CLI.md#troubleshooting).

| Problem | Fix |
|---|---|
| No `303a:83ec` in `falera devs` or `lsusb` | Use the port labelled **USB**, not **UART**, and a data cable (some are charge-only) |
| `falera devs --all` shows a CH343, CH340 or CP210x device | That is the UART bridge; move the cable to the **USB** port |
| A `303a:1001` or `303a:4001` device | The board has stock or generic MicroPython, not the Falera Badge firmware: flash it (`falera flash --repo <checkout>`) |
| A `303a:0002` device | Download mode (BOOT was held at reset); press **RST** without BOOT |
| "permission denied" on Linux | Join `dialout` (`uucp` on Arch), then log out and back in (see [Permissions on Linux](#permissions-on-linux)) |
| Port busy / "failed to access … (it may be in use)" | Another program has the port open: close `falera logs`, `mpremote`, serial monitors and the Arduino IDE |
| "the badge did not answer" while **Transfer** is open | Leave Transfer (HOME) and run the command again |
| `falera transfer` keeps waiting | Open **Tools > Transfer** on the badge; the CLI waits up to 60 s (`--wait`) |
| Screen frozen after using `mpremote` | FaleraOS is stopped at the prompt: `mpremote connect <port> reset`, `falera --reset hard info`, or press **RST** |
| The badge keeps showing **FALERA CRASHED** and rebooting | `falera logs --restart` shows the error. To reach the prompt, connect `mpremote` and press **Ctrl-C** during the restart. Reinstall with `falera update`, or `./deploy --board --clean --no-bump` from a checkout |
| `esptool` cannot connect when flashing | Hold **BOOT**, tap **RST** and release **BOOT**, then run the command again. The badge then waits in download mode until you reset it |
| The port name changed | Normal after a reset, a replug or an update; `falera` finds the badge again by itself |
