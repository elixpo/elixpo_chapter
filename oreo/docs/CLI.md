# falera-cli: the Falera Badge command-line tool

**falera-cli** controls the Elixpo Falera Badge from a computer over USB. The
command it installs is `falera`. It was called `oreo` until November 2026; `oreo`
still works as an alias for a few releases. With it you can:

- see the badge's status
- send photos, videos and documents to the **Transfer** app
- work with files and apps
- set up Wi-Fi
- follow the badge's logs
- open a MicroPython shell
- update FaleraOS

It finds the badge by its USB ID (`303a:83ec`), so you never have to guess
`/dev/ttyACM0` or `COM5`.

The code lives in [`cli/`](../cli). The Python package is `falera-cli` and the
command is `falera`; the package also installs `falera-cli` as a second name for
the same command. The CLI is released separately from FaleraOS, with tags
`cli-v<version>`. See [cli/CHANGELOG.md](../cli/CHANGELOG.md) for what each
release changed.

> **Status: 1.1.0, stable.** Commands, options, output and exit codes are
> stable. Later 1.x releases may add to them but will not change them. Every
> command is tested against a simulated badge, and the checks to run by hand
> are listed in [Testing on a badge](#testing-on-a-badge). If something goes
> wrong, run `falera doctor` and attach its output to an
> [issue](https://github.com/elixpo/falera/issues).

Related guides:

- [USB.md](USB.md): using the badge from a computer (ports, drivers,
  permissions, and raw `mpremote` for advanced use).
- [TRANSFER.md](TRANSFER.md): how the Transfer app and its code exchange
  work.

Contents: [Install](#install) · [First run](#first-run) ·
[Interactive UI](#interactive-ui) ·
[Commands](#commands) · [Sending files: `falera transfer`](#falera-transfer-send-files-to-the-transfer-app) ·
[Wi-Fi setup](#wi-fi-setup) · [Updating FaleraOS](#falera-update-update-faleraos) ·
[Exit status](#exit-status) · [Troubleshooting](#troubleshooting) ·
[FAQ](#faq) · [Transfer speed](#transfer-speed) ·
[Testing on a badge](#testing-on-a-badge) · [Releasing](#releasing)

## Install

You need Python 3.9 or newer and either [pipx](https://pipx.pypa.io/) or
[uv](https://docs.astral.sh/uv/). The installer:

1. picks pipx if you have it, and uv otherwise;
2. downloads the release wheel and its `.sha256` file;
3. checks the SHA-256;
4. installs `falera` as an isolated tool.

If you have neither pipx nor uv, it tells you how to get one and stops.

**Linux and macOS**

```sh
curl --proto '=https' --tlsv1.2 -LsSf \
  https://raw.githubusercontent.com/elixpo/falera/main/cli/install.sh | sh
```

**Windows (PowerShell)**

```powershell
irm https://raw.githubusercontent.com/elixpo/falera/main/cli/install.ps1 | iex
```

To upgrade, run the same command again. It replaces the installed version.
Check what you have with `falera --version`.

### Installer options

| Variable | Meaning |
|---|---|
| `OREO_CLI_VERSION` | Release to install: `latest` (the default), or a version written as `cli-v1.0.0`, `v1.0.0` or `1.0.0` |
| `OREO_CLI_INSTALLER` | `pipx` or `uv` (default: pipx if present, otherwise uv) |
| `OREO_CLI_REPOSITORY` | GitHub repository to install from (default `elixpo/falera`) |
| `OREO_CLI_DOWNLOAD_BASE` | Download the wheel from this URL instead of the release. For testing; needs a pinned version |

To install a specific version:

```sh
curl --proto '=https' --tlsv1.2 -LsSf \
  https://raw.githubusercontent.com/elixpo/falera/main/cli/install.sh |
  OREO_CLI_VERSION=cli-v1.1.0 sh
```

```powershell
$env:OREO_CLI_VERSION = "cli-v1.1.0"
irm https://raw.githubusercontent.com/elixpo/falera/main/cli/install.ps1 | iex
```

The repository's "Latest" GitHub release is always FaleraOS, not the CLI. So
for `latest`, the installers ask the GitHub API for the newest `cli-vX.Y.Z`
tag. The API allows 60 requests an hour without a token. Pre-releases such as
`1.1.0rc1` are installed only when you name them. Pinning a version skips the
API call.

### Install with pipx or uv directly

Every release has assets with fixed names:

| Asset | What it is |
|---|---|
| `oreo_cli-<version>-py3-none-any.whl` (+ `.sha256`) | The package |
| `oreo_cli-<version>.tar.gz` (+ `.sha256`) | Source distribution, with the tests |
| `SHA256SUMS` | Both checksums in one file |

pipx and uv can install the wheel straight from its release URL:

```sh
pipx install https://github.com/elixpo/falera/releases/download/cli-v1.1.0/oreo_cli-1.1.0-py3-none-any.whl
# or
uv tool install https://github.com/elixpo/falera/releases/download/cli-v1.1.0/oreo_cli-1.1.0-py3-none-any.whl
```

To check the file before you install it:

```sh
V=1.1.0
curl -LO https://github.com/elixpo/falera/releases/download/cli-v$V/oreo_cli-$V-py3-none-any.whl
curl -LO https://github.com/elixpo/falera/releases/download/cli-v$V/SHA256SUMS
sha256sum --check --ignore-missing SHA256SUMS      # macOS: shasum -a 256 -c --ignore-missing SHA256SUMS
gh attestation verify oreo_cli-$V-py3-none-any.whl -R elixpo/falera
pipx install oreo_cli-$V-py3-none-any.whl          # or: uv tool install oreo_cli-$V-py3-none-any.whl
```

`gh attestation verify` checks the GitHub build-provenance attestation. It
confirms that the file was built by this repository's `cli-release` workflow
from the tagged commit.

falera-cli is not on PyPI; install it from the GitHub release.

### From a checkout

```sh
pipx install ./cli          # or, for development: pip install -e cli/
```

### Dependencies

These are installed with the CLI:

- `rich`
- `pyserial`
- `mpremote` 1.28.x, which must match the badge's MicroPython 1.28
- `Pillow`, for photos and for your GitHub avatar (`falera setup`)
- `textual` 8.x, for the [full-screen view](#interactive-ui)

Converting **videos** also needs [ffmpeg](https://ffmpeg.org/) on your PATH
(for `falera transfer send` and `falera add`). Photos and documents do not.

| System | Command |
|---|---|
| Debian / Ubuntu | `sudo apt install ffmpeg` |
| macOS | `brew install ffmpeg` |
| Windows | `winget install ffmpeg` |

### Linux serial permissions

To open the badge's port you need to be in the `dialout` group (`uucp` on
Arch):

```sh
sudo usermod -aG dialout "$USER"     # then log out and back in
```

`falera doctor` checks this. macOS and Windows need no setup.

### Uninstall

```sh
pipx uninstall falera-cli      # or: uv tool uninstall falera-cli
```

The CLI stores nothing else on the computer.

## First run

1. Plug the badge into a USB port with a data cable. On the breadboard build
   (ESP32-S3-DevKitC-1), use the port labelled **USB**, not **UART** (see
   [USB.md](USB.md#which-usb-c-port)).
2. Run:

   ```sh
   falera devs        # is the badge there? (never opens the port)
   falera             # the full-screen Falera view
   ```

3. If no badge is found, run `falera doctor`.

## Interactive UI

`falera` with no command (or `falera ui`) switches the terminal to a full-screen
Falera view that handles everything about the badge. It opens at once, waits
for a badge to be plugged in if there is none, and asks which one to use if
there are several. Leaving it puts your terminal back as it was.

```
 Falera Badge OREO01 — FaleraOS v2.0.0 · /dev/ttyACM0 · FaleraOS paused
╭──────────────────────────╮╭────────────────────────────────────────────────────────╮
│ 1  Status                ││ ╭─ Falera Badge ─────────────────────────────────────╮   │
│ 2  Files                 ││ │    FaleraOS  v2.0.0 (2026-11-07)                   │   │
│ 3  Apps                  ││ │  firmware  MicroPython 1.28.0                    │   │
│ 4  Wi-Fi                 ││ │      port  /dev/ttyACM0                          │   │
│ 5  Transfer              ││ │     Wi-Fi  connected 192.168.1.42, 2 saved       │   │
│ 6  Profile               ││ │   battery  87% (4.01 V)                          │   │
│ 7  Install app           ││ ╰──────────────────────────────────────────────────╯   │
│ 8  Update FaleraOS         ││ storage  1.2 MiB used of 8.0 MiB, 6.8 MiB free         │
│ ──────────────────────── ││  Category    Size   Files                              │
│ s  Shell (REPL)          ││  system   812.0 KiB    96   ...                        │
│ q  Quit                  ││                                                        │
│ ──────────────────────── │╰────────────────────────────────────────────────────────╯
│ source                   │ ⠹ copying to /documents: song.mp3  1.1 MiB / 3.0 MiB ━━━━── 37%  Esc cancel
│ github.com/elixpo/falera   │╭────────────────────────────────────────────────────────╮
│ docs                     ││ badge on /dev/ttyACM0; pausing FaleraOS while this view  │
│ falera.elixpo.com/docs/cli ││ ✓ notes.md  1.2 KiB                                    │
│                          ││                                                        │
╰──────────────────────────╯╰────────────────────────────────────────────────────────╯
 s Shell  r Refresh  esc Cancel  l Log  q Quit  d Download  u Upload here  x Delete
```

The header shows the badge, its port, the FaleraOS version and whether FaleraOS
is paused. The sidebar lists the sections, and under them the links to the
source code and to this guide (clickable in terminals that support links).
The bar under the section shows what is running (with a progress bar and
Esc to cancel), or "ready" when nothing is. The log under it keeps what
each operation reported: three lines, which **l** makes about half the
height and back. When an operation fails the log grows by itself, and
shrinks again at the next action. The footer always shows the keys for the
section you are in. The mouse works too, but every action has a key.

| Key | Section or action |
|---|---|
| **1** | Status: versions, storage, Wi-Fi, battery (`falera info`) |
| **2** | Files: Enter opens a folder, Backspace goes up, **d** downloads, **u** uploads files or folders into the folder shown, **a** adds photos, videos or documents (`falera add`), **x** deletes (asks first; FaleraOS's own files are refused) |
| **3** | Apps: installed apps and the App Store; **f** fetches the catalogue, **i** installs, **u** updates all, **x** removes |
| **4** | Wi-Fi: saved networks; **n** scans, **c** connects (password asked without echo), **x** forgets |
| **5** | Transfer: type the files, Enter; FaleraOS restarts, open Transfer on the badge and type the code it shows (`falera transfer send`) |
| **6** | Profile: **e** edits it field by field, **f** loads the keys from an `.env`-style file (`falera setup`) |
| **7** | Install app: an app folder from this computer (`falera app install`) |
| **8** | Update FaleraOS: **c** checks, **u** updates (`falera update`) |
| **s** | Shell: the badge's MicroPython REPL in this terminal; Ctrl-] or Ctrl-X comes back to the view |
| **r** | Refresh the section shown |
| **l** | A bigger log, or back to three lines |
| **Esc** | Cancel the running operation (in a text field with nothing running: back to the sidebar) |
| **q**, **Ctrl-C** | Quit; FaleraOS starts again |

How it behaves:

- **It never freezes.** Every badge operation runs in the background, with a
  spinner or a progress bar. There is only ever one command on the serial
  port: something asked for while another operation runs waits its turn
  (the bar shows "+1 waiting").
- **Cancel** stops copies, downloads, App Store installs and Transfer between
  two chunks, and a half-copied file is removed, as with Ctrl-C in the plain
  commands. Scans and Wi-Fi joins are interrupted on the badge. Once an
  FaleraOS update starts it cannot be cancelled (quitting waits for it).
- **Questions are dialogs.** Confirmations, the Transfer code and passwords
  appear in a box; Esc cancels the operation that asked.
- **FaleraOS is paused while the view is open**, so the badge's screen shows
  what the computer is doing during long operations (with a FaleraOS that has
  `oreoOS/hostui.py`). It restarts when you quit: with **q**, with Ctrl-C,
  and if anything fails. `--reset hard|none` works as for the commands. The
  Transfer section is the exception: the Transfer app runs inside FaleraOS, so
  it restarts FaleraOS first, and the next section that needs the badge pauses
  it again. A profile saved or an app installed takes effect when FaleraOS
  restarts, which happens when you quit.
- **Unplugged?** The view goes back to waiting and picks the badge up again
  when it returns.

The view is built with [Textual](https://textual.textualize.io/), which is
installed with the CLI. Where it cannot run, `falera` falls back to the
numbered menu below: when standard input or output is not a terminal, with
`TERM=dumb`, or when Textual is missing. `falera ui` says why instead of falling
back. To always get the menu, run `falera menu` or set `OREO_UI=menu`.

### The numbered menu

`falera menu` (and `falera` where the full-screen view cannot run) shows the
badge's status and then a menu:

| Key | Action |
|---|---|
| **1** | status |
| **2** | files |
| **3** | apps |
| **4** | Wi-Fi |
| **5** | add a photo, video or document |
| **t** | send files to Transfer (the same flow as `falera transfer send`) |
| **p** | owner profile (the same flow as `falera setup`) |
| **i** | install an app from a folder (the same checks as `falera app install`) |
| **u** | update FaleraOS |
| **s** | shell |
| **q** | quit |

In the file view, `u <path>` uploads a file from the computer into the folder
shown, and `p` downloads one. Ctrl-C stops the current action and goes back
to the menu. FaleraOS stays paused while the menu is open and starts again when
you quit. Without a terminal (in a script, for example), `falera` prints the
status and exits.

**t** is the one entry that needs FaleraOS running: it checks and converts the
files first, then restarts FaleraOS and asks for the code the Transfer app shows
(apps drawer -> Tools -> Transfer). FaleraOS keeps running afterwards; the next
entry that needs the badge pauses it again. A profile saved with **p** and an
app installed with **i** take effect when FaleraOS restarts, which happens when
you quit the menu.

To send photos and documents while FaleraOS keeps running, use the Transfer app
instead (see [`falera transfer`](#falera-transfer-send-files-to-the-transfer-app)).

### How `falera` uses the badge

- **The badge is only touched when a command needs it.** `--help`,
  `falera help`, `falera devs`, mistyped arguments and "no badge found" never
  open the serial port.
- **One badge is picked automatically.** If several are connected, choose
  one with `--port` or `$OREO_PORT` (see `falera devs`).
- **Most commands pause FaleraOS and then restart it.** Such a command stops
  FaleraOS, does its work and then soft-resets the badge so FaleraOS starts
  again. `--reset hard` does a hardware reset instead, and `--reset none`
  leaves the badge at the MicroPython prompt.
- **Some commands do not stop FaleraOS.** `falera transfer` talks to the Transfer
  app while it runs, and `falera logs` only listens.
- **The badge's screen shows long operations.** While FaleraOS is paused for
  `push`, `pull`, `add`, `app install`, `apps install`/`update` and
  `update`, the badge shows what is happening and how far it has got
  (through `oreoOS/hostui.py`, in FaleraOS versions that have it), and clears
  the screen at the end. The updates ride along with the commands the CLI
  sends anyway, so they cost no extra time; a FaleraOS without it works as
  before. (`falera transfer` needs none: the Transfer app shows its own
  progress.)
- **Destructive actions ask first.** These are `rm -r`, `apps remove`, `app remove`,
  `transfer rm`, `update`, `update --clean` and `flash`. Without a terminal,
  the answer is "no" unless you pass `--yes`.

### Global options

Put these before the command, for example `falera --port /dev/ttyACM1 info`.

| Option | Meaning |
|---|---|
| `-p`, `--port PORT` | Serial port to use (default: the one badge found; also `$OREO_PORT`) |
| `--reset soft\|hard\|none` | How FaleraOS is restarted after a command (default `soft`) |
| `-y`, `--yes` | Answer yes to confirmations |
| `--no-color` | Plain output |
| `-v`, `--verbose` | Show the badge's log lines and full tracebacks |
| `--version` | Print the CLI version |

## Commands

| Command | What it does | Stops FaleraOS? |
|---|---|---|
| [`falera`](#interactive-ui) / `falera ui` | The full-screen Falera view | while it is open |
| [`falera menu`](#the-numbered-menu) | The numbered menu, for simple terminals | while it is open |
| [`falera devs`](#falera-devs-list-badges) | List badges | no (never opens a port) |
| [`falera info`](#falera-info-status) | Versions, storage, Wi-Fi, battery | briefly |
| [`falera transfer`](#falera-transfer-send-files-to-the-transfer-app) / `falera send` | Send files to the Transfer app, using the code on the badge | **no** |
| [`falera add`](#falera-add-photos-videos-and-documents-without-the-transfer-app) | Send photos, videos and documents without opening an app | briefly |
| [`falera ls` / `push` / `pull` / `rm`](#falera-ls--push--pull--rm-files) | Any file on the badge | briefly |
| [`falera screenshot`](#falera-screenshot-the-screen-as-a-png) | Save the badge's screen as a PNG | briefly, then restarts |
| [`falera apps`](#falera-apps-the-app-store) | App Store: list, install, update, remove | briefly |
| [`falera setup`](#falera-setup-owner-profile) | Owner profile: GitHub user, name, timezone, weather | briefly, then restarts |
| [`falera new`](#falera-new-start-an-app) | Make a new app folder from the app template | no (never opens a port) |
| [`falera app`](#falera-app-install-an-app-from-a-folder) | Install, list or remove an app from a folder on this computer | briefly, then restarts |
| [`falera wifi`](#wi-fi-setup) | Scan, connect, list and forget networks | briefly |
| [`falera update`](#falera-update-update-faleraos) | Update FaleraOS (downloaded by the badge) | yes, then restarts |
| [`falera logs`](#falera-logs-console-output) | Follow the console | no |
| [`falera shell`](#falera-shell-micropython-repl) / [`run`](#falera-run-run-a-script) / [`dev`](#falera-dev-live-editing) | MicroPython prompt, scripts, live editing | while it runs |
| [`falera flash`](#falera-flash-firmware) | Reflash the firmware (developers) | yes |
| [`falera doctor`](#falera-doctor-diagnose-the-connection) | Diagnose cable, port, permissions, firmware | briefly |

`falera help <command>` (or `falera <command> --help`) shows each command's
options and examples.

### `falera devs`: list badges

```sh
falera devs           # badges, by USB ID 303a:83ec
falera devs --all     # also other USB serial devices, with what they probably are
```

This never opens a port. It exits with status 3 when no badge is connected.

### `falera info`: status

```sh
falera info
```

Shows:

- the FaleraOS version and date, and the MicroPython version;
- the board and port;
- space used by the system, apps, gallery, documents and other files;
- Wi-Fi status and the Bluetooth boot setting;
- battery and free RAM.

### `falera transfer`: send files to the Transfer app

The easiest way to put photos, videos and documents on the badge. FaleraOS keeps
running the whole time, and you prove you are at the right badge by typing
the code it shows. How it works inside is in [TRANSFER.md](TRANSFER.md).

1. On the badge, open the apps drawer, go to **Tools** and open
   **Transfer**. It shows a six-character code, for example `K7M2QX`.
2. On the computer, run:

   ```sh
   falera transfer send holiday.jpg clip.mp4 talk-notes.md
   ```

3. When asked, type the code from the badge. Case does not matter, and you
   can include spaces or dashes (`k7m-2qx` is fine).
4. Each file is converted, sent, checked on the badge and saved. Photos and
   videos appear in the **Gallery**, documents in the **Reader**, and the
   badge shows a notification for each file.

```text
$ falera transfer send holiday.jpg talk-notes.md
holiday.jpg -> holiday.rz565  41.2 KB (6% of the original)
talk-notes.md -> talk-notes.mdz  2.1 KB (38% of the original)
✓ Transfer is open on the badge (FaleraOS 2.x.y), 9.8 MB free
Code shown on the badge: K7M2QX
✓ code accepted
✓ holiday.rz565 is in the Gallery (/apps/gallery/assets/optimized/holiday.rz565, SHA-256 checked)
✓ talk-notes.mdz is in the Reader (/documents/talk-notes.mdz, SHA-256 checked)
✓ 2 file(s) sent
```

(The output above is an illustration; the exact wording and sizes vary.)

Other actions, in the same session style (open Transfer, type the code):

```sh
falera transfer list                    # photos, videos and documents on the badge, and free space
falera transfer rm holiday.rz565        # remove one (asks first; names from `transfer list`)
falera send holiday.jpg                 # short for `falera transfer send`
```

`falera transfer` with no action means `send`.

| Option | Meaning |
|---|---|
| `--code CODE` | The code shown on the badge. Without it, `falera` asks. A script with no terminal must pass it |
| `--wait SECONDS` | How long to wait for the Transfer app to be open (default 60) |
| `--kind image\|video\|document` | Override the file type detection |
| `--seconds N` | Video length to keep (default 10) |
| `--photo-max N` | Longest side of a photo in pixels (default 240) |

What gets sent:

| Input | Sent as | Lands in |
|---|---|---|
| Photos (`.jpg`, `.png`, ...) | `.rz565` | Gallery (`/apps/gallery/assets/optimized`) |
| Videos (`.mp4`, `.mov`, ...; needs ffmpeg) | `.rv565`, 180×135 at 24 fps | Gallery |
| `.md` / `.txt` | `.mdz` / `.txtz` | Reader (`/documents`) |
| Files already in a badge format (`.rz565`, `.r565`, `.rv565`, `.mdz`, `.txtz`) | as they are | Gallery or Reader |

Anything else is refused before the badge is touched. Every file is converted
and checked before the badge is contacted, so a bad file never leaves a
session half done.

Things to know:

- **The code changes.** Every session gets a new code: when the CLI says
  goodbye, when the session is cancelled, and after a lockout. **RIGHT** on
  the badge draws a new one while no computer is connected.
- **Wrong codes.** In a terminal, `falera` tells you how many tries are left
  and asks again. After 5 wrong codes, the badge locks for 60 seconds and
  then shows a new code. With `--code`, or without a terminal, one wrong
  code ends the command.
- **Waiting for the app.** If Transfer is not open, `falera` waits. After a
  couple of seconds it tells you to open it, and it gives up after `--wait`
  seconds. It sends nothing to the badge until the app has announced
  itself, so a closed app is never sent bytes it cannot read.
- **Cancelling.** **B** on the badge cancels the session and Ctrl-C on the
  computer stops it. A half-sent file is always thrown away; the old file
  with the same name, if any, is kept.
- **Same name.** A file with the same name replaces the old one, and `falera`
  says "replaced the old one".
- **Limits.** One file can be up to 8 MiB, and the badge keeps 256 KiB free
  for FaleraOS. A file that does not fit fails on its own and the others still
  go through. The command then exits with status 1 and lists what was not
  sent.
- **Timeouts.** The badge drops a computer that stays silent: after 5 minutes
  while waiting for the code, after 2 minutes once the code is accepted, and
  after 20 seconds in the middle of a file.
- **While Transfer is open, close it before using other `falera` commands.**
  The app turns off Ctrl-C on the USB console so that no byte can interrupt
  FaleraOS. Commands that pause FaleraOS (`info`, `add`, `push`, `shell`,
  `update`, ...) therefore cannot stop it, and they fail with "the badge did
  not answer" (exit 4). Press **HOME** or **B** on the badge to leave
  Transfer, then run the command again.
- **Only one program can have the port open.** Stop `falera logs`, `mpremote`
  or a serial monitor before running `falera transfer`.

### `falera add`: photos, videos and documents without the Transfer app

```sh
falera add holiday.jpg                  # Gallery
falera add clip.mp4 --seconds 8         # Gallery (needs ffmpeg)
falera add talk-notes.md reading.txt    # Reader
```

Same conversion and destinations as `falera transfer send`. The difference is
that `add` needs no app and no code: it pauses FaleraOS and copies the files
over the MicroPython REPL, then restarts FaleraOS. Use it in scripts, or when
you have the badge to yourself; use `falera transfer` when you want FaleraOS to
stay up, or want the person holding the badge to approve the transfer.

Before anything is copied, the converted size is checked against the media
budget (5 MiB for photos and videos) and the badge's free space.

| Option | Meaning |
|---|---|
| `--kind image\|video\|document` | Override detection |
| `--seconds N` | Video length (default 10) |
| `--fps N` | Video frame rate (default 24) |
| `--width N`, `--height N` | Video size (default 180×135) |
| `--photo-max N` | Longest side of a photo (default 240) |
| `--save DIR` | Also keep the converted files on the computer |

### `falera ls` / `push` / `pull` / `rm`: files

```sh
falera ls                              # the badge's root folder
falera ls /apps
falera push notes.txt /documents/
falera push -r myapp /apps/myapp       # a whole folder
falera pull /wifi_seen.json            # into the current folder
falera pull -r /apps/pet ./pet-backup
falera rm /documents/old.mdz
falera rm -r /apps/myapp               # asks first
```

- `push` checks free space before writing anything. Each file is written to
  a temporary `.part` file. The badge checks its size and SHA-256 and only
  then renames it into place, so a damaged copy leaves the old file
  untouched. `--no-verify` skips the hash.
- `push` copies files as they are. To make a photo or video viewable, use
  `falera transfer send` or `falera add`, which convert it first.
- `rm` refuses FaleraOS's own files (`/oreoOS`, `/oreoWare`, `/assets`, the
  built-in apps, `/main.py`, `/secrets.py`, `/wifi.json`, ...) and anything
  inside those folders unless you add `--force`. Removing them can stop the
  badge from booting.
- A badge path can be written with a leading `:` (`:documents/`). In Git Bash
  on Windows you need it (see [Troubleshooting](#troubleshooting)).

### `falera screenshot`: the screen as a PNG

```sh
falera screenshot                      # falera-screenshot-<date>-<time>.png here
falera screenshot home.png
falera screenshot docs/ --scale 2      # 640x480, into docs/
```

| Option | Meaning |
|---|---|
| `FILE` | The PNG to write, or a folder to put the default name in (default: `falera-screenshot-YYYYmmdd-HHMMSS.png` in the current folder) |
| `--scale N` | Enlarge N times (1 to 8, default 1) without smoothing, so every badge pixel stays a sharp square |

- The picture is exactly what FaleraOS last drew: the CLI reads FaleraOS's
  320×240 framebuffer (big-endian RGB565, as sent to the panel) and widens
  each pixel to 8-bit RGB exactly (`r = r5 << 3 | r5 >> 2`, and so on).
  The PNG is written with the standard library only.
- To keep that frame, the command stops FaleraOS with Ctrl-C but without the
  usual soft reset (which would clear the framebuffer). The transfer is
  checked with SHA-256 and sent again once if it was damaged. FaleraOS
  restarts afterwards like after any other command.
- If FaleraOS was stopped halfway through drawing a frame, the command says
  so; run it again.
- It finds the framebuffer through `oreoWare.display.current()`. A FaleraOS
  without it (stable/v2.0.18 and earlier) is read through
  `oreoOS.busy._display` instead, the same display the launcher binds at
  boot, so released badges need no update. Only a FaleraOS with neither
  is asked to update (`falera update`).
- Video playing in the Gallery and the loading spinner are drawn straight to
  the panel, not into the framebuffer, so they do not show in a screenshot.

### `falera apps`: the App Store

```sh
falera apps                    # installed apps and the catalogue
falera apps refresh            # fetch the latest catalogue
falera apps install snake
falera apps update             # every app with a newer version
falera apps update snake
falera apps remove snake       # asks first
```

The badge downloads apps itself, over its own Wi-Fi, so set up Wi-Fi first
(see [Wi-Fi setup](#wi-fi-setup)). Before `refresh`, `install` and `update`,
`falera` brings Wi-Fi up from the badge's saved networks and then shows the
download progress. Built-in apps (including Transfer) cannot be removed.

### `falera setup`: owner profile

```sh
falera setup                                     # show the profile, ask for each value
falera setup --show                              # only print it (the key is hidden)
falera setup --github-user octocat --name "Mona Lisa" --timezone 5.5
falera setup --lat 12.97 --lon 77.59 --weather-name Bengaluru
falera setup --owm-key-stdin < owm-key.txt       # the OpenWeatherMap key, kept out of history
falera setup --designation ""                    # remove a value
falera setup --from-file .env.local              # the profile keys from an .env-style file
falera setup --set DISPLAY_NAME="Mona Lisa" --set TIMEZONE_OFFSET=5.5   # one key at a time
falera setup --avatar                            # fetch your GitHub avatar again
falera setup --github-user octocat --no-avatar   # leave the avatar alone
```

Keys use the `.env.local` names: `GITHUB_USER`, `DISPLAY_NAME`,
`DISPLAY_DESIGNATION` (or the older `DESIGNATION`), `TIMEZONE_OFFSET`,
`OWM_API_KEY`, and optionally `WEATHER_LAT`, `WEATHER_LON`, `WEATHER_NAME`.
Without a pinned latitude and longitude, Weather finds the badge's own
location from its network ([PROFILE.md](PROFILE.md#weathers-location)).

- `--from-file FILE` reads an `.env`-style file (comments, `export` and
  quotes are fine). It takes only the profile keys, skips empty ones, and
  leaves everything else in the file alone: it prints which keys it took
  and the names of the others, never a value.
- `--set KEY=VALUE` sets one key (repeatable); `KEY=` removes it.
- When several are given, later ones win: the file, then `--set`, then the
  named options such as `--name`.

Writes `/profile.json` on the badge, which Badge, Commits, Weather and the
clock read through `oreoOS/profile.py` (see [PROFILE.md](PROFILE.md)).
No checkout or `.env.local` is needed.

- It first shows what the badge has now and where each value comes from
  (`profile.json` or `secrets.py`, which `tools/deploy.py` writes).
- Asked interactively, **Enter** keeps the value shown and `-` removes it, so
  the `secrets.py` value (if any) shows through again. Values given as options
  are saved without prompting; an empty option value removes the key.
- Values are checked before the badge is touched: the timezone is hours from
  UTC between -12 and +14 in quarter hours (`5.5`, `-4`, `+05:30`,
  `UTC+5:45`), latitude -90 to 90, longitude -180 to 180, GitHub user names
  as GitHub allows them, and short plain-ASCII names that fit the screen
  (the badge font has no other characters).
- The OpenWeatherMap key is read without echo and never printed. The badge
  only reports whether one is set, so the key never comes back to the
  computer. `--owm-key KEY` works but warns that the key may land in your
  shell history; prefer the prompt or `--owm-key-stdin`.
- The new file is merged on the badge, written to `/profile.json.tmp`, read
  back and then renamed over `/profile.json`, so a cut-off save never leaves
  a half-written profile. If the power goes between removing the old file
  and the rename, FaleraOS reads the `.tmp` copy, and the next save repairs it.
- FaleraOS restarts afterwards so the apps read the new profile (`--reset none`
  leaves it at the MicroPython prompt). A new timezone applies at the next
  time sync, which happens as FaleraOS starts.

**Your avatar.** After the profile, `falera setup` puts the GitHub avatar of
`GITHUB_USER` on the badge for the Badge app. This computer downloads it
(`https://github.com/<user>.png`, not the rate-limited API), crops it to a
72x72 circle in RGB565 with Pillow, and copies it over USB to
`/avatar.bin`, together with the user it was made for. The badge itself
downloads and decodes nothing.

- It is fetched only when `/avatar.bin` is missing or was made for another
  user. `--avatar` fetches it again (after you change your GitHub picture);
  given alone, it does only that. `--no-avatar` leaves the file alone.
- The Badge app shows it only while its user is the profile's
  `GITHUB_USER`; otherwise it draws your initials. Without a GitHub user,
  setup removes `/avatar.bin`.
- If the download fails (offline, unknown user), the profile is still saved
  and setup says so; an avatar made for someone else is removed, never left
  behind. Run `falera setup --avatar` later.
- `/avatar.bin` sits next to `/profile.json`, outside every app folder, so
  FaleraOS updates and deploys keep it (`tools/deploy.py --clean` wipes both).
- `--show` names whose avatar is on the badge.

### `falera new`: start an app

```sh
falera new my_game                               # ./my_game, shown as "My Game"
falera new "My Game" --author octocat --dir ~/oreo-apps
```

Copies the app template (a counter: **A** adds, **B** takes one away; the same
files as `app_templates/` in the FaleraOS repo, shipped inside falera-cli) into a
new folder, and fills in the app id, the name shown on the badge, the author
(from `--author`, else `git config github.user` or `user.name`) and the icon
module. The id comes from the name: `My Game` -> `my_game`. Edit
`src/app.py`, then `falera app install ./my_game`. The app guide is
[APPS.md](APPS.md).

### `falera app`: install an app from a folder

```sh
falera app install ./my_game      # check, copy to /apps/my_game/, restart FaleraOS
falera app install ./badge --force   # over a built-in app (working on FaleraOS itself)
falera app list                   # installed apps
falera app remove my_game         # asks first
```

`install`:

1. checks the folder with the same rules as `tools/validate_app.py` (a copy
   ships in falera-cli, and a test keeps them the same). Errors stop it before
   the badge is touched; warnings are shown;
2. refuses to replace a built-in app unless you add `--force`;
3. checks free space, then copies only the files that belong on the badge
   (`manifest.json`, `main.py`, `__init__.py`, `src/`, `assets/optimized/`)
   to `/apps/<id>/`, each one through a `.part` file checked with SHA-256
   (`--no-verify` skips the hash);
4. removes files an earlier install left that are no longer in the folder.
   Saved data in `/state/<id>.json` stays;
5. restarts FaleraOS, so the app is in the Apps drawer.

FaleraOS imports an app once per boot, so to try a change run
`falera app install` again: FaleraOS restarts and loads the new code.

`list` and `remove` are the same as `falera apps list` and `falera apps remove`.

### `falera wifi`: Wi-Fi

```sh
falera wifi scan
falera wifi connect "Home Net"
falera wifi saved
falera wifi forget "Old Net"
```

See [Wi-Fi setup](#wi-fi-setup).

### `falera update`: update FaleraOS

```sh
falera update                    # newest stable release
falera update --check            # only say whether there is a newer one
falera update --channel beta     # newest beta release
```

The badge updates itself with the same code its **Settings > Updates** page
uses (`oreoOS/ota.py`). `falera` steers it and shows each step:

1. Reads the FaleraOS version on the badge.
2. Brings up the badge's Wi-Fi from its saved networks. Set up a network
   first (see [Wi-Fi setup](#wi-fi-setup)).
3. Asks GitHub, from the badge, for the newest release on the channel.
4. Compares the badge's files with the release and shows how many change
   and how much will be downloaded.
5. Asks you, checks the free space, and has the badge download the changed
   files into `/_ota`, checking each file's SHA-256.
6. Moves the files into place, as the badge does when it boots with an
   update waiting.
7. Restarts the badge, waits for it to come back on USB (it may come back
   under another port name) and reports the version it booted.

Apps, photos, documents, saved Wi-Fi and your profile are kept.

- **Ctrl-C** works until step 6. During step 6 it is held until the files
  are in place.
- **Power loss** during step 6 is safe: the badge finishes the update the
  next time it starts.
- **An update the badge already downloaded** by itself is offered for
  installing.
- **Without a terminal**, `falera update` answers "no" unless you pass
  `--yes`.
- **GitHub limit:** the badge asks GitHub without a token, which allows 60
  requests an hour per network.

**Developers:** `--repo` deploys from a FaleraOS checkout instead of a
release:

```sh
falera update --repo ~/src/oreo            # ./deploy --board from that checkout
falera update --repo ~/src/oreo --clean    # wipe the badge's files first (asks)
```

With `--repo`, `update` also takes:

- `--force`: upload every file;
- `--no-bump`: keep the FaleraOS version;
- `--override APPS`: replace these app folders.

### `falera logs`: console output

```sh
falera logs              # follow what FaleraOS prints; Ctrl-C to stop
falera logs --restart    # restart FaleraOS first, to see the boot log
```

`logs` does not stop FaleraOS. It keeps following when the badge restarts, or
is unplugged and plugged back in, even under a new port name. While the
Transfer app is open you will see its `@OTB ...` protocol lines in the log;
that is normal.

### `falera shell`: MicroPython REPL

```sh
falera shell
```

Pauses FaleraOS and opens the badge's MicroPython prompt. Leave with
**Ctrl-]** or **Ctrl-X**, and FaleraOS starts again.

### `falera run`: run a script

```sh
falera run blink.py
```

Runs a file from the computer on the badge and streams its output.
**Ctrl-C** stops the script on the badge.

### `falera dev`: live editing

```sh
falera dev ./scripts                 # mount ./scripts at /remote, open the REPL
falera dev ./scripts --run blink.py  # and run blink.py from it
```

FaleraOS stops, the folder on the computer appears on the badge at `/remote`,
and the REPL opens there. `import mymodule` loads your local copy, so edits
need no copying. MicroPython imports a module once: after an edit, run
`import sys; del sys.modules['mymodule']` and import it again. To reach
FaleraOS's own modules, `import sys; sys.path.append('/')`.

FaleraOS does not run while you are in the REPL. To edit an app live, mount a
folder that contains `apps/<id>/` and start FaleraOS from the REPL:

```sh
falera dev ~/work                    # ~/work/apps/my_app/{manifest.json,main.py,...}
```

```python
>>> import os; os.chdir("/"); exec(open("/main.py").read())
```

Apps under `/remote/apps` load from the computer instead of `/apps` (the
console prints `[dev] my_app from /remote/apps`), and FaleraOS re-reads an
app's files every time it opens, so save on the computer, press HOME and
reopen the app. Leaving `falera dev` resets the badge and the installed apps
are used again. To copy an app onto the badge instead, use
[`falera app install`](#falera-app-install-an-app-from-a-folder). Details:
[docs/APPS.md](APPS.md#live-editing-with-oreo-dev).

Leave with Ctrl-] or Ctrl-X. Ctrl-D soft-resets the badge, which starts
FaleraOS and ends live editing.

### `falera flash`: firmware

```sh
falera flash --repo ~/src/oreo            # erase, write firmware, install FaleraOS (asks)
falera flash --repo ~/src/oreo --build    # run ./build-firmware first
```

Needs a FaleraOS checkout. Erasing always asks first, and it removes
everything on the badge, including photos, documents and Store apps.

### `falera doctor`: diagnose the connection

```sh
falera doctor
```

Checks, in this order:

1. the computer: Python, pyserial, mpremote, ffmpeg;
2. the badge's USB ID, and what any other USB IDs it finds probably are;
3. on Linux, membership of `dialout` / `uucp`;
4. only then, it opens the port to read the firmware and FaleraOS versions.

It ends with numbered **next steps**, failures first. It exits with `0` when
nothing failed (warnings are fine) and `1` otherwise.

### `falera help`

```sh
falera help            # list commands
falera help transfer   # one command, with examples
```

## Wi-Fi setup

The badge uses Wi-Fi **only for the internet**: the App Store, FaleraOS
updates, GitHub data (Badge, Commits), weather and the clock. Files never go
over Wi-Fi; they go over USB with `falera transfer`. The badge joins 2.4 GHz
networks only.

The badge has no keyboard, so networks with a password are added from the
computer:

```sh
falera wifi scan                     # networks the badge can see, with signal and security
falera wifi connect "Home Net"       # asks for the password without echo
falera wifi saved                    # names of saved networks
falera wifi forget "Old Net"
```

`connect` joins the network and saves it, so FaleraOS joins it by itself from
then on. Open networks can also be joined on the badge, from
**Settings > WiFi**.

| Option | Meaning |
|---|---|
| `--open` | The network has no password |
| `--no-save` | Join now, but do not save it |
| `--save-only` | Save it without trying it now (for a network that is not in range) |
| `--password-stdin` | Read the password from standard input, for scripts |
| `--timeout SECONDS` | How long to wait for the network (default 15) |

```sh
# In a script, so the password never appears on the command line:
printf '%s\n' "$WIFI_PASSWORD" | falera wifi connect "Home Net" --password-stdin
```

Before touching the badge, `connect` checks that the network name is 1 to 32
bytes and that the password is 8 to 63 characters (or 64 hex digits).

**The password stays private.** It is read before the badge is touched and
sent to the badge once. It is never printed, logged, returned or stored on
the computer, and it is removed from error messages. `falera wifi saved` lists
names only.

Results are reported plainly:

- **wrong password**;
- **not in range**: the badge sees only 2.4 GHz networks; check
  `falera wifi scan`;
- **did not answer in time**: move closer, or try `--timeout 30`.

Networks written into the deploy-time `.env` file come back at the next boot
even after `forget`, and `falera` warns about that. To forget them for good,
remove them from `.env` and deploy again.

## Exit status

These are stable across 1.x, so scripts can rely on them:

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | The command failed; the message says why |
| `2` | Usage error: a missing or invalid argument (checked before the badge is touched) |
| `3` | No badge found, or several and no `--port` |
| `4` | The badge could not be reached: port missing or busy, no answer, connection lost |
| `5` | The badge answers but has no FaleraOS, or one too old for the command |
| `130` | Cancelled: Ctrl-C, or "no" at a confirmation |

Special cases:

- `falera devs` exits `3` when no badge is connected.
- `falera doctor` exits `1` when a check failed.
- `falera transfer` exits `1` when the Transfer app is not open, the code is
  wrong, the badge is locked, or a file was refused. A failure to open the
  port is `4`, as for other commands. With no code typed, it exits `130`.

## Troubleshooting

Start with `falera doctor`. [USB.md](USB.md#troubleshooting) has more on
cables, ports and drivers.

**Connection**

| Symptom | What to do |
|---|---|
| `no Falera Badge found (USB 303a:83ec)` | Use a data cable (some are charge-only) and, on the DevKitC-1, the **USB** port. `falera devs --all` shows what is connected. |
| A `303a:1001` device | Stock ESP32-S3 USB-Serial/JTAG: the board has no FaleraOS firmware yet, or it is in the bootloader. Flash it with `falera flash --repo <checkout>`. |
| A `303a:0002` device | Download mode (BOOT was held at reset). Press RESET without BOOT. |
| A `303a:4001` device | Generic MicroPython, not the Falera Badge build. Flash the badge firmware. |
| A CP210x, CH340, CH343 or CH9102 device | That is the devkit's UART bridge. Plug into the native **USB** port instead. |
| `2 badges connected` | Pick one: `falera --port /dev/ttyACM1 info` or `export OREO_PORT=/dev/ttyACM1`. |
| `Permission denied` on Linux | Join `dialout` (`uucp` on Arch), then log out and back in. |
| Port busy | Close other programs using it: another `falera`, `falera logs`, `mpremote`, Thonny, a serial monitor, the Arduino IDE. |
| `the badge did not answer` (exit 4) | Is the **Transfer** app open? Leave it (HOME) and try again. Otherwise FaleraOS is busy with something that delays Ctrl-C (a download, an app): wait a few seconds and retry. If it stays stuck, press RESET or replug. |
| `lost the connection to the badge` (exit 4) | It was unplugged or restarted. Plug it back in, check with `falera devs`, and run the command again. |
| `this needs FaleraOS` (exit 5) | The badge has MicroPython but no FaleraOS: `falera flash --repo <checkout>`. |
| The badge stays at the `>>>` prompt | A command ran with `--reset none`, or FaleraOS failed to start. Try `falera --reset hard info`, then `falera logs --restart`. |
| Git Bash: `looks like a path on this computer` | Git Bash rewrote `/documents` into a Windows path. Write `:documents/`, or set `MSYS_NO_PATHCONV=1`. |

**Transfer**

| Symptom | What to do |
|---|---|
| `open Transfer on the badge`, then `the Transfer app is not open on the badge` | Open the apps drawer, then **Tools > Transfer**, and run the command again. Give a slow start more time with `--wait 120`. |
| `wrong code` | Type the code exactly as the badge shows it. The characters 0, O, 1, I and L are never used, so what looks like `0` is not one. |
| `too many wrong codes` / `wait 60s` | The badge locked after 5 wrong codes. Wait for the countdown; it then shows a new code. |
| `the session was cancelled on the badge` | Someone pressed **B** on the badge. Run the command again. |
| `the Transfer app was closed` | The app was left in the middle of a session. Open it and run the command again. |
| `the badge waited too long` | The session timed out (5 min without the code, 2 min idle, 20 s mid-file). Run the command again. |
| `not enough free space` | Free space with `falera transfer list` and `falera transfer rm`, or `falera info` / `falera rm`. |
| `larger than 8192 KB` | Shorten the video with `--seconds`. To make it smaller still, use `falera add` with `--width` / `--height`. |
| `the badge only takes ...` | Send photos, videos, `.md` or `.txt`; other files cannot be shown on the badge. |
| `SHA-256 mismatch` / `damaged chunk` | The copy was damaged on the way and dropped. Run it again; if it repeats, try another cable or USB port. |
| `speaks Transfer protocol v...` | The CLI and FaleraOS are from different generations. Update both: rerun the installer, then `falera update`. |
| `no code given` | No terminal to ask in. Pass `--code ABC123`. |

**Updates, apps and media**

| Symptom | What to do |
|---|---|
| `falera update`: `could not get online` | Set up Wi-Fi first: `falera wifi scan`, `falera wifi connect <name>`. |
| `falera update`: `could not reach GitHub` | Check the network. GitHub allows 60 requests an hour per network without a token. |
| `falera update`: `did not come back on USB` | It may still be installing. Wait, then run `falera info`. If the screen stays dark, press RESET. |
| `falera update`: `too old to be updated from the CLI` | Update once from the badge (Settings > Updates) or with `falera update --repo`. |
| `apps install` fails | Check Wi-Fi first: `falera wifi saved`, `falera wifi connect <name>`. |
| Wi-Fi: not in range | The badge sees 2.4 GHz only. Check `falera wifi scan`. |
| `not enough space on the badge` | See what uses it with `falera info`; free some with `falera rm` or `falera apps remove`. |
| `ffmpeg was not found` | Install ffmpeg (see [Dependencies](#dependencies)). Only videos need it. |
| `checksum mismatch after copy` | Run it again. If it repeats, try another cable or USB port. |
| An installer says `pipx or uv ... neither was found` | Install one of them (the message has the command), then run the installer again. |
| Something else | Re-run with `-v`, and include the `falera doctor` output in an issue. |

## FAQ

**Is it `falera` or `falera-cli`?**
The package is **falera-cli**. The command is **falera**; `falera-cli` also works
and runs the same thing.

**Do I need to clone the FaleraOS repository?**
No. Everything except `falera flash` and the `--repo` developer options works
from the installed CLI alone.

**Can I send files over Wi-Fi?**
No. The old Send Files page and the upload web page are gone. Wi-Fi on the
badge is for the internet only; files go over USB with `falera transfer` or
`falera add`.

**Why do I have to type a code?**
The code is shown only on the badge's screen, so typing it proves you can see
the badge you are sending to. Nothing is written until the code is accepted.
See [TRANSFER.md](TRANSFER.md).

**`falera transfer` or `falera add`?**
Both convert files the same way and put them in the same places.
`falera transfer` keeps FaleraOS running and needs the Transfer app open and the
code. `falera add` needs neither, but pauses FaleraOS while it copies. It also
has the video size options (`--fps`, `--width`, `--height`) and `--save`.

**Can I send any file with `falera transfer`?**
Only things the badge can show: photos, videos and Markdown or text
documents. For anything else (app files, your `profile.json`), use
`falera push`.

**Does the CLI need the internet?**
Only to install it. `falera update`, `falera apps install` and `falera apps refresh`
need the *badge* to be online, because the badge does the downloading.

**Does `falera update` touch my photos, apps or Wi-Fi?**
No. Only FaleraOS's own files change.

**What about Bluetooth?**
Bluetooth file sharing is not available yet. It is planned last, together
with the mobile app (issues #101, #103, #124).

**Several badges on one computer?**
`falera devs` lists them. Pick one with `--port` or `$OREO_PORT`.

**Windows and macOS?**
Both are supported. On Windows the port is a `COM` name (`--port com5` works).
On macOS, `falera` uses the `/dev/cu.*` name even if you give the
`/dev/tty.*` one.

**Where are my settings stored on the computer?**
Nowhere. The CLI keeps no configuration and no history.

## Transfer speed

`falera push`, `falera add` and the interactive upload send files as base64
inside short MicroPython snippets over the raw REPL ("raw paste" mode):

- Each file goes to a `.part` file in 8 KiB chunks.
- The first chunk rides along with the command that opens the file. The last
  rides with the step that checks the size and SHA-256 on the badge and
  only then renames the file into place.
- Free space is checked once per command, and each folder is created once
  per session.

The numbers below were measured on the simulated badge (execs and bytes of
code; `python3 cli/tests/test_push_speed.py`). They were turned into time
with a model of the USB link: a 1.5 ms round trip, MicroPython's 256-byte
raw-paste window, and 150 KB/s flash writes. So the times are estimates until
they are measured on a badge.

| Case | Execs | Code per file byte | Estimate |
|---|---|---|---|
| 1 MiB file, 4 KiB chunks (0.1.0) | 257 | 1.34 | ~43 KiB/s |
| 1 MiB file, 8 KiB chunks (1.0.0) | 129 | 1.34 | ~44 KiB/s |
| 40 files of 1.5 KiB, 0.1.0 | 240 | | |
| 40 files of 1.5 KiB, 1.0.0 | 81 | 1.99 | ~32 KiB/s |

For big files, the chunk size hardly matters. The time goes to raw-paste flow
control (one round trip per 256 bytes of code) and to flash writes. For many
small files, what counts is fewer execs per file (2 instead of 6).

`falera transfer` uses a different path: a line protocol to the Transfer app,
with 3 KiB chunks and up to 4 chunks in flight before it waits for an
acknowledgement (see [TRANSFER.md](TRANSFER.md#the-protocol)). Its speed has
not been measured on a badge yet.

## Testing on a badge

CI has no badge. These are the checks to run by hand on one; please attach
the output when you report a problem.

1. `falera doctor`: all checks pass, ending in "all good".
2. `falera info`, then `falera` (the menu): status, files (open a folder, `u` an
   upload, `p` a download), the apps list, saved Wi-Fi, and **q** restarts
   FaleraOS.
3. `falera push` a 1 MiB file and a folder of small files. Note the time and
   speed shown, `falera pull` them back and compare them (`sha256sum`).
4. Pull the cable during a large `falera push`. Expect "lost the connection"
   (exit 4) and no traceback. After replugging, the old file at the
   destination is intact, and no `.part` file is left after the next push.
5. `falera wifi scan`, `falera wifi connect <name>`, `falera apps install <app>`.
6. `falera update --check`, then `falera update` on a badge one release behind:
   versions shown, progress, restart, "installed and running". Also try it
   with the badge offline (expect the Wi-Fi hint) and when it is up to date.
7. `falera logs`, then press RESET on the badge: logging carries on after the
   restart. Ctrl-C stops it (also on Windows).
8. `falera shell`, and `falera run` a script that prints. Ctrl-C stops it and
   FaleraOS restarts.
9. Transfer: open **Tools > Transfer**, then `falera transfer send` a photo, a
   10-second video and a `.md` file. Each appears in the Gallery or Reader,
   with a notification. Also check:
   - a wrong code: the tries left are shown;
   - five wrong codes: a 60 s lockout, then a new code;
   - **B** on the badge mid-file: no half file is left;
   - Ctrl-C mid-file;
   - `falera transfer list` and `falera transfer rm`;
   - running the command with Transfer closed, then opening it while
     `falera` waits;
   - afterwards, with Transfer closed, `falera info` still works;
   - with Transfer open, `falera info` fails with exit 4 and the hint.
10. On Windows (PowerShell and Git Bash) and macOS: `falera devs`, `falera info`,
    `falera push notes.txt :documents/`, `falera transfer send photo.jpg`, and
    `falera --port com5 info` / `falera --port /dev/tty.usbmodem* info`.
11. The full-screen view (`falera`), on Linux, macOS and Windows Terminal:
    - started with no badge: the waiting screen; plug it in and it opens;
      with two badges, the chooser;
    - every section loads; switching sections quickly never errors (one
      command on the port at a time);
    - Files: upload a 1 MiB file and press Esc half way (no `.part` left),
      download a folder, delete a file;
    - Wi-Fi scan and connect; App Store fetch and install; profile edit;
      app install from a folder; Transfer with the code; update check;
    - **s** opens the REPL and Ctrl-] comes back to the view;
    - **q**, Ctrl-C, and pulling the cable: the terminal is restored, and
      FaleraOS starts again (or the view waits for the badge to come back).
12. `falera setup --github-user <you>`: "saved /avatar.bin"; open **Badge**
    and your avatar is in the ring. `falera setup --github-user octocat`
    replaces it; offline, `falera setup --github-user <someone>` keeps the
    profile, warns, and Badge shows initials (never the previous face).
    `falera setup --avatar` fetches it again; `--show` names its user.
13. With a FaleraOS that has `oreoOS/hostui.py`: the badge's screen shows the
    progress of `falera push`/`pull` of a large file, `falera add`,
    `falera app install`, `falera apps install` and `falera update`, and is cleared
    when each finishes; with an older FaleraOS, the same commands work as
    before.

## Releasing

Maintainers only. CLI releases are independent of FaleraOS releases and do not
touch them:

- the `cli-release` workflow runs only for `cli-v*` tags (on pull requests
  that change `cli/`, it builds and tests without releasing);
- its tags do not match the badge's OTA prefixes (`stable/`, `beta/`);
- the release is created with `--latest=false`, so the repository's "Latest"
  release stays FaleraOS.

Steps:

1. In a pull request, set `__version__` in `cli/oreo_cli/__init__.py`, move
   the `Unreleased` notes in `cli/CHANGELOG.md` under a new
   `## [<version>] - <date>` heading, and merge it.
2. Tag the merge commit and push the tag:

   ```sh
   git tag cli-v1.0.0 <commit-on-main>
   git push origin cli-v1.0.0
   ```

3. The workflow then:
   - runs the CLI tests on Linux (Python 3.9 and 3.13) and macOS;
   - checks that the tag matches `__version__` and that `CHANGELOG.md` has a
     section for it;
   - builds the wheel and sdist from `cli/` (with timestamps from the
     commit), writes the `.sha256` files and `SHA256SUMS`, and smoke-tests
     the wheel and both installers on Linux and Windows;
   - adds a build-provenance attestation for both packages;
   - waits for the `cli-release` environment, then publishes the GitHub
     release with the changelog section as its notes. To make releases
     need an approval, add required reviewers to that environment in the
     repository settings. Versions with `a`, `b` or `rc` are marked as
     pre-releases.

If a release run fails after the tag was pushed, fix the problem, delete the
tag (`git push origin :refs/tags/cli-v1.0.0`), and tag again. The installers
skip a tag that has no published release.
