# AGENTS.md

Guide for coding agents, and for people, working in this repository. Read it
before changing anything. The binding rules every contribution follows,
licensing included, are in [PREAMBLE.md](PREAMBLE.md).

## What Falera is

The Falera Badge is an open conference badge, and FaleraOS is its operating system: a
MicroPython 1.28 OS for an ESP32-S3 with a 320x240 ST7789 screen, eight
buttons, an IMU, IR, Wi-Fi and Bluetooth. Apps are Python packages the OS
loads at runtime. A computer talks to the badge through **falera-cli**, the
`falera` command in `cli/`. Video on the badge uses **RV565**, a separate
library and file format (github.com/elixpo/rv565).

## How we build it

1. **The badge works on its own.** Nothing on the badge waits on the
   network or blocks the screen: slow work runs on a worker, and the user
   sees a loading state (`oreoOS.busy`, `oreoOS.cache.Refresh`).
2. **Wi-Fi is for the internet only:** App Store, OTA updates, GitHub data,
   weather and time. Nothing listens on the LAN.
3. **A computer reaches the badge over USB, through the `falera` CLI:**
   files go through the Transfer app (a code on the badge, typed on the
   computer), and setup (Wi-Fi, profile, apps, updates) is a CLI command.
4. **Bluetooth comes last,** with the mobile app (#101, #103, #124). Don't
   start Bluetooth features before then.
5. **The OS and the CLI ship together and must agree.** A change on one side
   of a contract (below) changes the other side, its tests and its docs in
   the same pull request.
6. **No personal data in the code.** The owner's name, GitHub user and
   location come from `oreoOS.profile` (`.env.local` at deploy, or
   `/profile.json` written by `falera setup`), and their avatar from
   `/avatar.bin` (also `falera setup`). Nothing personal is committed or
   shipped in a release.
7. **Every change is tested without hardware.** Host tests stand in for the
   badge; anything that can only be checked on a real badge is written down
   in the pull request as a test step.

## Map

| Path | What |
|---|---|
| `oreoOS/` | The OS: launcher and run loop, home screen, notification panel, App Store, OTA, network service (`netsvc`), and shared helpers (`api`, `theme`, `widgets`, `state`, `profile`, `crashlog`, `cache`, `busy`, `hostui`, `usbhost`, `geo`, `github`, `timeutil`). |
| `oreoWare/` | Hardware drivers (display, buttons, Wi-Fi, BT, IMU, IR) and `os.py`, the object passed to apps. |
| `apps/` | Built-in apps, installed on every badge (listed in `oreoOS/store.py` `DEFAULT_APPS`). |
| `apps_market/` | Optional apps the on-device App Store installs; `index.json` is the catalogue. |
| `app_templates/` | The starting point for a new app (also shipped inside the CLI for `falera new`). |
| `cli/` | falera-cli: the `falera` command, released on its own (`cli-v*` tags). |
| `tools/` | Host scripts: deploy, release, asset conversion, `validate_app.py`, `app_icon.py`, `build_store_index.py`. |
| `tests/` | Hardware-free OS and app tests (standard library only). |
| `firmware/` | The MicroPython firmware build for the `OREO_BADGE` board. |
| `docs/` | [APPS](docs/APPS.md), [CLI](docs/CLI.md), [USB](docs/USB.md), [TRANSFER](docs/TRANSFER.md), [PROFILE](docs/PROFILE.md), [HARDWARE](docs/HARDWARE.md), [TLS](docs/TLS.md). |
| `falera.elixpo/` | The website (static Next.js on Cloudflare Pages), including the CLI docs pages. |

## Contracts between the OS and the CLI

Keep both sides, their tests and their docs in step:

| Contract | Badge side | CLI side | Guard |
|---|---|---|---|
| Owner profile keys (`GITHUB_USER`, `DISPLAY_NAME`, `DISPLAY_DESIGNATION`, `TIMEZONE_OFFSET`, `WEATHER_*`, `OWM_API_KEY`) and the `DESIGNATION` alias | `oreoOS/profile.py` | `cli/oreo_cli/owner.py` | CLI contract test against `profile.py` |
| Owner avatar `/avatar.bin`: `OAV1`, size, the GitHub user it was made for, RGB565 pixels | `oreoOS/profile.py` `avatar()` (Badge app) | `cli/oreo_cli/avatar.py`, written by `falera setup` (`tools/fetch_avatar.py` loads the same module) | CLI contract and round-trip test against `profile.py` |
| Built-in app list | `oreoOS/store.py` `DEFAULT_APPS` | `cli/oreo_cli/commands.py` `DEFAULT_APPS` | CLI contract test |
| App checks | `tools/validate_app.py` | `cli/oreo_cli/appcheck.py` | drift test |
| App template | `app_templates/` | `cli/oreo_cli/app_template/` | CLI test |
| Transfer protocol (`VERSION`) | `apps/transfer/src/proto.py` | `cli/oreo_cli/transfer.py` | protocol tests on both sides; bump `VERSION` on any wire change |
| "Connected to computer" screen: `show(title, detail, progress)`, `clear()` | `oreoOS/hostui.py` | `cli/oreo_cli/badge.py` and callers | CLI hostui tests; the CLI must keep working on an OS without it |
| Launcher loading `/remote/apps` for `falera dev` | `oreoOS/launcher.py` | `cli/oreo_cli/commands.py` `dev_notes` | CLI test |
| Screenshot: `display.current()` returns the newest Display; its `_buf` is the 320x240 frame as big-endian RGB565 | `oreoWare/display.py`; fallback for older FaleraOS: `oreoOS/busy.py` `_display` (bound by `launcher.py`) | `cli/oreo_cli/screenshot.py` (`falera screenshot`) | `tests/test_display_current.py`; CLI contract tests against `display.py` and `busy.py` |
| USB identity `303a:83ec` "Elixpo Falera Badge" | `firmware/boards/OREO_BADGE` | CLI discovery and `doctor` | CLI tests |

A newer CLI must still work with the previous FaleraOS release: feature-check
on the badge (`try: from oreoOS import x`) instead of assuming.

## Building an app

Read [docs/APPS.md](docs/APPS.md). In short:

```bash
falera new my_app                 # or: cp -r app_templates apps_market/my_app
python3 tools/app_icon.py apps_market/my_app
python3 tools/validate_app.py apps_market/my_app
python3 tools/build_store_index.py   # App Store apps only
```

Rules that matter on the badge:

- Subclass `oreoOS.App`; implement `on_enter`, `update(dt)`, `draw(d)`,
  `on_button_press(btn)`, `on_exit`. Never call `d.present()`.
- Nothing in `update`/`draw` may block. Network calls go through
  `oreoOS._http` with a timeout, on a worker (`oreoOS.cache.Refresh`); show
  long blocking work with `oreoOS.busy`.
- A selects, B goes back, HOME belongs to the OS. C opens the notification
  panel; an app that uses C as a control sets `CAPTURES_C = True`, and a
  double-tap of C then opens the panel.
- Persist with `oreoOS.state.load/save`, not files in the app folder. Read
  the owner's details with `oreoOS.profile.get`, not `secrets`.
- Prefer the `os` object over importing `oreoWare` or `machine` (#67).
- MicroPython 1.28: no `abc`, `typing`, `dataclasses`, `pathlib`; small
  heap, so avoid large lists and module-level buffers.
- A new module in `oreoOS/` or `oreoWare/` goes into `tools/deploy.py`
  `DEPLOY` and `tools/build_release.py` `SHIP_PATTERNS` (a test checks).
- A retired built-in app goes into `RETIRED_APPS` in `tools/deploy.py`, so
  deploys remove it from badges.
- OS modules, drivers and built-in apps' `src/` ship precompiled as `.mpy`
  (`tools/mpy_build.py` decides; entry points, `__init__.py` and
  `oreoOS/config.py` stay `.py`). Don't rely on `__file__` or a module's
  source text. MicroPython imports `x.py` before `x.mpy`, so anything that
  installs an `.mpy` removes the `.py` (OTA and deploy do).

## Checks

```bash
python3 -m unittest discover -s tests          # OS and apps
python3 -m unittest discover -s cli/tests      # falera-cli (pip install ./cli for the full-screen view tests)
python3 tools/validate_app.py                  # every app
```

Compile-check changed badge files with MicroPython's `mpy-cross` v1.28 when
you have it. Add a host test for logic you change; load modules by path
(see `tests/test_app_platform.py`) so the hardware imports in
`oreoOS/__init__.py` aren't needed.

## Workflow

- One folder per repository. Work on a branch, open a pull request, and
  squash-merge. `main` is protected.
- Pull requests say what changed, what was tested on the host, and what
  still has to be checked on a badge.
- Commits carry no AI attribution trailers.
- The CLI has its own changelog (`cli/CHANGELOG.md`, `## [Unreleased]`) and
  release (`cli-v<version>` tag → `.github/workflows/cli-release.yml`). The
  OS is released with `tools/release.py` (`stable/` and `beta/` tags, which
  badges update from).

## Do not

- Commit secrets. `.env` is SOPS-encrypted; personal values go in the
  git-ignored `.env.local` or on the badge in `/profile.json`. Do not read
  or print `.env`, `.env.local` or `secrets.py`.
- Hardcode a person's GitHub user, name, location or timezone.
- Use Wi-Fi for anything but the internet, or start Bluetooth features.
- Run the deploy, flashing or release tools, or the website deploy, unless
  the maintainer asked.
- Claim that Elixpo has been accepted into Google Summer of Code: Elixpo is
  *applying* to be a mentoring organisation for 2027.
