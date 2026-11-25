# Changelog

All notable changes to the `falera` CLI (`falera-cli`, in `cli/`) are recorded
here. FaleraOS itself is versioned and released separately (`stable/v*` tags).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the CLI uses [semantic versioning](https://semver.org/). Releases are
tagged `cli-v<version>`; the release workflow takes the notes for a release
from its `## [<version>]` section below, so every release needs one.

## [Unreleased]

### Added

- **`falera screenshot [FILE] [--scale N]`**: saves the badge's screen as a
  PNG, pixel for pixel. It reads the frame FaleraOS last drew from its
  framebuffer (`oreoWare.display.current()`, big-endian RGB565), checks it
  with SHA-256, widens it to 8-bit RGB exactly and writes the PNG with the
  standard library; `--scale` enlarges it by an integer without smoothing.
  FaleraOS restarts afterwards. On a FaleraOS without `display.current()`
  (stable/v2.0.18 and earlier) it reads the display the launcher binds to
  `oreoOS.busy` at boot, so released badges work as they are; only a
  FaleraOS with neither asks to be updated.

### Changed

- **Renamed to `falera`** (#186), with the OS (OreoOS is now FaleraOS). The package is `falera-cli`, the command `falera` (and `falera-cli`); **`oreo` and `oreo-cli` still work** as aliases for a few releases. Release files are `falera_cli-<version>-py3-none-any.whl` and `.tar.gz`; the installers fall back to the `oreo_cli-` files of releases made before the rename. The `OREO_*` environment variables keep their names.

### Fixed

- `falera push -r ..` could write outside the destination: from `myapp/src`,
  `falera push -r .. /apps` wrote `myapp/main.py` over the badge's own
  `/main.py`. A folder given as `.` or `..` now stands for its contents
  (like `cp -r . dest`), so its files land inside the destination.
- `falera push -r . <new path>` failed with "unexpected error: IndexError"
  and copied nothing; the folder's contents now land in the new path.
- Photos sent with `falera add` or `falera transfer send` are turned upright
  from their EXIF Orientation tag, so portrait phone photos no longer
  arrive in the Gallery sideways.

## [1.1.0] - 2026-11-12

### Added

- `falera setup` puts the owner's GitHub avatar on the badge for the Badge
  app (#133): it downloads the avatar of GITHUB_USER on this computer,
  converts it with Pillow (already a dependency) to a 72x72 circular RGB565
  tile that fills the Badge app's disc (FaleraOS v2.0.10 and later read up to
  72 px), and copies it to `/avatar.bin` with the user it was made for. It is fetched only when missing or made for another user;
  `--avatar` fetches it again (alone, it does only that) and `--no-avatar`
  skips it. A failed download never fails setup, and an avatar made for
  someone else is removed rather than left behind. `--show` names whose
  avatar is on the badge.

### Changed

- `falera update` says why a download failed: the file, host and reason the badge reports (for example `Downloading oreoOS/splash.rv565: release-assets.githubusercontent.com: timed out`), and the same for a failed check or manifest read. The time allowed for the download now grows with its size and file count (was a flat 120 s). FaleraOS releases without the error report keep the old messages.

## [1.0.0] - 2026-11-11

First stable release. Commands, options, output and exit codes are now
stable: later 1.x releases add to them but do not change them. Like 0.1.0,
it is tested against a simulated badge; the on-badge checks are listed in
docs/CLI.md ("Testing on a badge").

### Added

- A full-screen view: `falera` with no command (and the new `oreo ui`)
  switches the terminal to an Oreo app on the alternate screen, built with
  Textual. A header shows the badge, port, FaleraOS version and whether
  FaleraOS is paused; a sidebar has Status, Files (browse, upload, download,
  add media, delete), Apps (App Store fetch, install, update, remove),
  Wi-Fi (scan, connect, forget), Transfer (with the code the badge shows),
  Profile (`falera setup`, also from an `.env`-style file), Install app (from
  a folder) and Update FaleraOS, and **s** opens the REPL and comes back.
  Every badge operation runs in the background with a spinner or progress
  bar, one command on the serial port at a time; Esc cancels copies,
  downloads, installs and Transfer between two chunks (removing a half
  copy), and interrupts scans on the badge. It waits for a badge to be
  plugged in and asks which one when there are several. The log under
  the section is three lines; **l** makes it about half the height, and it
  grows by itself when an operation fails, until the next action. Under the
  menu are the links to the source (github.com/elixpo/falera) and the docs
  (falera.elixpo.com/docs/cli), clickable in terminals that support links.
  FaleraOS stays paused while the view is open and restarts when it closes,
  also on Ctrl-C and on errors. It reuses the commands' own code, so
  behaviour matches them.
- `oreo menu`: the numbered menu (the interactive view of 0.1.0). `falera`
  falls back to it where the full-screen view cannot run (no terminal,
  `TERM=dumb`, Textual missing) or when `OREO_UI=menu` is set; `oreo ui`
  explains instead. New in it: **t** sends files to the Transfer app (the
  `falera transfer send` flow), **p** edits the owner profile, **i** installs
  an app from a folder and **u** updates FaleraOS; the file view uploads a
  file into the folder shown (`u <path>`) and asks before overwriting a
  local file on download; Ctrl-C stops the current action and returns to
  the menu.
- `falera transfer send <files>` (alias `falera send`), `falera transfer list` and
  `falera transfer rm`: send files to the badge's new Transfer app over USB,
  authorised by the six-character code the badge shows. FaleraOS keeps
  running; files are converted like `falera add` and checked on the badge
  with SHA-256 before they are saved.
- `falera update` works without a checkout. The badge downloads the newest
  FaleraOS release from GitHub over its own Wi-Fi, through its own updater
  (`oreoOS.ota`, the same code as its Updates page). The CLI shows the
  installed and new versions and the download size, asks, checks the free
  space, shows download progress, installs, restarts the badge, waits for
  it to come back on USB (also under a new port name) and reports the
  version it booted. `--check` only reports; `--channel beta` follows the
  beta channel. An update the badge already downloaded is offered for
  installing. Ctrl-C is held while files are moved into place.
  `--repo <checkout>` remains for developers.
- `falera setup`: the owner profile (GitHub user, name, title, timezone,
  weather place and OpenWeatherMap key) in `/profile.json` on the badge, the
  file `oreoOS/profile.py` reads (docs/PROFILE.md). It shows the current
  values and where they come from, prompts for each one (or takes them as
  options), checks the ranges before touching the badge, never echoes or
  prints the key (the badge only reports whether one is set), merges and
  writes atomically through `/profile.json.tmp` (the backup the badge falls
  back to), and restarts FaleraOS. `falera setup --show` prints the profile
  with the key hidden; `--owm-key-stdin` reads the key from standard input.
  `--from-file FILE` takes the profile keys from an `.env`-style file such
  as `.env.local` (other keys are left alone and only named), and
  `--set KEY=VALUE` sets one key at a time by its `.env` name. The title is
  `DISPLAY_DESIGNATION`, as in `.env.local`; `DESIGNATION` is still
  accepted.
- `falera new <name>`: a new app folder from the app template, which now ships
  inside falera-cli, with the id, display name, author and icon module filled
  in.
- `falera app install <folder>`: checks an app folder with the same rules as
  `tools/validate_app.py` (vendored; a test keeps them identical), refuses
  built-in apps without `--force`, copies only the files that belong on the
  badge to `/apps/<id>/` with the verified push, removes files left from an
  earlier install and restarts FaleraOS. `falera app list` and
  `falera app remove <id>` too.
- The badge's screen shows long operations: `push`, `pull`, `add`,
  `app install`, `apps install`/`update` and `update` (and the same in the
  full-screen view) call `oreoOS/hostui.py` (`show(title, detail,
  progress)`, `clear()`) on FaleraOS versions that have it. The calls ride
  along with execs the CLI sends anyway, so a push costs no extra round
  trips; an FaleraOS without it, or a failure inside it, changes nothing.
- Exit status 4 (the badge could not be reached: port busy or missing, no
  answer, connection lost) and 5 (FaleraOS missing on the badge, or too old
  for the command); usage errors such as a missing app or network name now
  exit with 2. All codes are listed in `oreo --help` and docs/CLI.md.
- `falera doctor` ends with numbered next steps (failures first), checks for
  ffmpeg, and says when the badge answers but has no FaleraOS.
- `falera logs` keeps following across a badge restart or replug, and decodes
  the console as UTF-8 for any terminal.
- `falera-cli` is installed as a second name for the `falera` command.
- Dependency: `textual >= 8.2, < 9` (imported only when the full-screen
  view opens).

### Changed

- Pushes are verified before they replace anything: the badge checks the
  size and SHA-256 of the `.part` file and only then renames it into place,
  so a damaged copy leaves the old file untouched (0.1.0 checked after the
  rename).
- Pushes need fewer round trips: the first chunk rides with the open and
  the last with the check-and-rename, folders are created once per session
  and free space is checked once per command. A small file now costs 2
  execs instead of 6; 40 small files go from 240 execs to 81. Chunks are
  8 KiB instead of 4 KiB. Measurements and the model are in docs/CLI.md
  ("Transfer speed").
- `falera dev` explains how live editing relates to FaleraOS: the REPL imports
  from `/remote`, modules are imported once, FaleraOS does not run meanwhile,
  and its drawer lists apps from `/apps`, so apps are tried with
  `falera app install`.
- `falera wifi connect` checks the network name (1 to 32 bytes) and the
  password (8 to 63 characters, or 64 hex digits) before touching the badge,
  and refuses an empty `--password-stdin`.

### Fixed

- Unplugging the badge (or it rebooting) during a command printed a Python
  traceback; it is now "lost the connection to the badge" with a hint and
  exit status 4. Any other unexpected error is one line plus a link to
  report it (the traceback with `-v`).
- A badge busy with something that delays Ctrl-C is retried once before it
  is reported, with a hint, and mpremote's raw debugging output no longer
  leaks into ours.
- Blocking reads while sending code are bounded, so a badge that stops
  answering in the middle of a command cannot hang `falera` forever.
- `falera logs` could not be stopped with Ctrl-C on Windows while the badge
  was quiet.
- `falera shell` and `falera dev` without a terminal crashed inside mpremote;
  they now say they need one, before touching the badge.
- Port names: `com5` works on Windows, `/dev/tty.usbmodem*` is replaced by
  its `/dev/cu.*` twin on macOS (the tty one can hang on open), and a bare
  `ttyACM0` means `/dev/ttyACM0`.
- Badge paths rewritten by Git Bash (`/documents` becoming
  `C:/Program Files/Git/documents`) are refused with a hint to write
  `:documents` instead.
- `falera pull <file> newdir/` created a file called `newdir`; it now creates
  the folder.
- The Wi-Fi signal bars and header separator fall back to ASCII on a
  terminal that is not UTF-8.
- A second Ctrl-C while FaleraOS is being restarted no longer leaves the
  badge at the MicroPython prompt: the restart starts over and the port is
  closed only after the reboot request has been sent.
- `falera logs` on a port that is busy in another program, or that you have
  no permission to open, says so (exit status 4) instead of waiting for
  the badge to "come back" forever.
- A file on this computer that cannot be read or written (`falera push` of an
  unreadable file, `falera pull` into a folder that cannot be created) is
  reported as "<path>: <reason>" with exit status 1, not as a lost badge
  connection.

### Known limitations

- `falera flash` still needs an FaleraOS checkout (`--repo`).
- File transfer over Bluetooth is not available yet (#103); Bluetooth comes
  last, with the mobile app.

## [0.1.0] - 2026-11-10

First release (#117). Not yet tested against a real badge; please report
problems with `falera doctor` output attached.

### Added

- `falera` finds the badge by its USB ID `303a:83ec` and picks it when exactly
  one is connected; `--port` or `$OREO_PORT` overrides this.
- `oreo devs [--all]` lists badges (and other USB serial devices) without
  opening a port.
- `falera info`: FaleraOS and MicroPython versions, board, space by category,
  Wi-Fi, Bluetooth boot setting, battery and free RAM.
- Files: `falera ls`, `push` (folders with `-r`), `pull` and `rm`. Pushes go
  to a temporary `.part` file, are renamed into place and checked by size
  and SHA-256; free space is checked first. `rm` refuses FaleraOS's own files
  and anything inside its folders (`/oreoOS`, `/oreoWare`, `/assets`, the
  built-in apps) without `--force`, and `rm -r` asks first.
- `falera add`: photos and videos into the Gallery (`.rz565` / `.rv565`),
  `.md` / `.txt` into the Reader (`.mdz` / `.txtz`), after a space check.
  Videos need `ffmpeg`.
- `falera apps [list|refresh|install|update|remove]` through the badge's App
  Store, over the badge's Wi-Fi.
- `falera wifi [scan|connect|saved|forget]`. Passwords are read without echo
  (or with `--password-stdin`), sent to the badge once, and never printed,
  logged or stored on the computer.
- `falera shell`, `falera run <file>`, `falera dev <folder> [--run FILE]` and
  `falera logs [--restart]`.
- `falera doctor`: pyserial and mpremote versions, the badge's USB ID, other
  known IDs (stock ESP32-S3 JTAG port, download mode, CP210x / CH340),
  Linux `dialout` / `uucp` membership and the firmware banner.
- `falera update --repo <checkout>` and `falera flash --repo <checkout>` run the
  checkout's `./deploy`; erasing always asks first.
- The interactive view (`falera` with no command): status, files, apps,
  Wi-Fi, media and shell.
- FaleraOS is restarted after every command (`--reset soft|hard|none`),
  also when the command is stopped with Ctrl-C.
- Output falls back to ASCII marks on a console or pipe that is not UTF-8
  (for example a redirect on Windows) instead of crashing.
- Release packaging: wheel and sdist on GitHub Releases with SHA-256
  checksums and build-provenance attestations, and `install.sh` /
  `install.ps1`, which verify the checksum and install with pipx or uv.

### Known limitations

- `falera update` and `falera flash` need an FaleraOS checkout (`--repo`);
  updating from GitHub releases is future work.
- No Bluetooth transfers yet (#103).

[Unreleased]: https://github.com/elixpo/falera/compare/cli-v1.1.0...HEAD
[1.1.0]: https://github.com/elixpo/falera/releases/tag/cli-v1.1.0
[1.0.0]: https://github.com/elixpo/falera/releases/tag/cli-v1.0.0
[0.1.0]: https://github.com/elixpo/falera/pull/117
