# Changelog

Each release of OreoOS gets its own section here. The CI release
workflow lifts the **top section** verbatim into the GitHub release's
`body` field — that's exactly what the Updates app surfaces as the
in-device changelog when an upgrade is available.

Format for a new entry (add to the top, push, CI does the rest):

```
## vX.Y.Z — YYYY-MM-DD
- Short bullets, present tense (e.g. "Fix Store hang at LOADING").
- Group bullets loosely by surface: OS, Apps, Drivers, Tooling, Docs.
- Keep technical, no marketing language.
```

---

## Unreleased

- **OreoOS is now FaleraOS** (#186): the OS, the badge and the project are renamed after the *phalera*, the badge of honour Roman soldiers wore on the chest, and the panda mascot is now **Lumi**. Names on screen, the crash screen ("FALERA CRASHED"), Bluetooth's advertised name ("Falera") and the App Store's panda app (**Lumi**, was Elixpo Pet; same app and saved state) follow. Updates and the App Store now come from `elixpo/falera`; GitHub redirects the old repository, so badges on an older release keep updating. The CLI command is `falera`; `oreo` still works.
- **Radio controls answer the press at once**: turning Wi-Fi or Bluetooth on or off holds the badge for up to a second inside the radio driver, so nothing could animate. The notification panel's WiFi and BT tiles now switch to "starting" / "stopping" with a spinner (and "Turning WiFi on..." in the hint band) before the call runs; the WiFi app's Status and Power rows show "turning on..." / "setting Eco...", its connect screen is up with "Starting the radio..." before the join begins and then counts "Joining: N of M s", and Nearby says "starting the radio..." before a scan powers it up. A radio that does not change says so ("failed", "WiFi didn't turn on. A = retry") instead of snapping back, and a second tap made during the call no longer toggles it back.
- **App Store and Settings do less on a press**: the Store loads the installed-apps list once, in an idle frame, and reloads it only after an install or uninstall (not on every B); app sizes are measured by update(), one app per frame, instead of stat-ing every file inside draw(). The Sleep After slider changes the timer at once but writes flash once it rests (1.5 s) or when Settings closes, not on every step.
- **Precompiled OS modules**: releases now also publish `manifest-mpy.json`, the same release with the modules of `oreoOS/`, `oreoWare/` and the built-in apps' `src/` compiled by MicroPython 1.28.0's `mpy-cross` (pinned to the firmware's commit, built in CI; the build fails on any other version or header). Imports skip compiling on the badge, and the download is about a quarter smaller (2.2 MB instead of 2.9 MB for a full install). Entry points (`/main.py`, `apps/*/main.py`), package markers and `oreoOS/config.py` stay `.py`. MicroPython imports `x.py` before `x.mpy`, so an install removes the `.py` each `.mpy` replaces, after every new file is in place and before the update is marked done (a power cut repeats it), and a later `.py` install removes the stale `.mpy`. Only FaleraOS with this change asks for the `.mpy` manifest, on firmware that loads it; older badges keep installing `manifest.json` and get this OTA client first. `./deploy --board` uploads `.mpy` the same way, with `--py` for development.
- **Updates app, redone**: the installed version, channel and when the badge last checked sit at the top; the check and the download run on a worker, so the screen never freezes (a spinner while checking). An available update shows its version, how many files and how much it downloads, and the start of its release notes, with NOTES for the full, scrollable notes. INSTALL asks first (what it downloads; the badge restarts; apps, files and Wi-Fi stay), then shows a real progress bar: percent, files done of total, bytes, and the current file. Failures say what failed in plain words, one line each for the step and file, the host and the reason, and A tries the same thing again. "You're up to date", "Ahead of stable" and a downloaded-but-not-installed update ("Restart the badge to install it") have their own screens. A selects, B goes back; leaving with HOME stops a download after its current file.
- **OTA updates install again**: GitHub's asset CDN answers on four addresses and some networks black-hole one of them (185.199.109.133 on the network the failure was seen on); the badge's resolver returns a single address and caches it, so a badge that drew it timed out on the release manifest and every file ("manifest fetch failed", "download failed"). Connections now try every address, remember the dead one, and ask DNS for the others. The manifest fetch gets 20 s instead of 4 s and a body cut short counts as a failure, not a result; each file gets a time budget that grows with its size (the 400-490 KB assets needed 16-20 KB/s in a flat 25 s) and three attempts on fresh connections; free flash is checked before downloading; the ready marker is written by rename. The newest release is picked by version number. Errors say what failed in plain words: step, file, host and reason (`ota.error_text()`), in the Updates app and in `falera update`. `falera run tools/ota_probe.py` dry-runs an update on the badge without installing it.
- **Native boot splash**: on new firmware the "hello" roll plays from C, as an RV565 clip (`oreoOS/splash.rv565`, made by `tools/build_splash_clip.py` from the Python splash's own frames) on the core MicroPython does not use, with the loader bar, so it no longer stutters while boot imports modules and starts Wi-Fi and Bluetooth. It shares the display's SPI bus and hands the last frame back for the swipe into Home. On firmware without the player (OTA never updates the firmware) the splash animates in Python as before. Firmware: the `_oreo_rv565` module gains `splash_load`/`splash_start`/`splash_progress`/`splash_stop`/`splash_state` on a vendored RV565 2.0.0 core; `inflate_frame` is unchanged.
- **tools/release.py publishes to the repository badges update from** (#134): the repository comes from `OTA_REPO` in oreoOS/ota.py, or `--repo owner/name`, and is used for the manifest's download URLs and every `gh release` command; `--dry-run` shows it. A fork no longer edits release.py. A release stops when `origin`, where the tag is pushed, is another repository.
- **Badge shows its owner's avatar, not the maintainer's** (#133): no avatar ships with FaleraOS any more. `falera setup` fetches the avatar of the profile's GITHUB_USER on the computer and copies it over USB to /avatar.bin (outside the app folders, so updates keep it), and Badge shows it only while that user is GITHUB_USER; otherwise it draws the owner's initials. Badge deletes the old shipped avatar module, deploys remove it, and deploy and release builds never include it. tools/fetch_avatar.py now writes the same /avatar.bin file, sharing the CLI's code.
- **Verified HTTPS** (#110): every TLS connection (OTA, App Store, GitHub data, location, weather, speed test) now checks the server's certificate chain, host name and dates against 10 bundled root CAs (`oreoOS/tls_roots.py`, loaded on the first secure request). The clock is synced over NTP first; a connection whose certificate or clock can't be checked is refused, never retried unverified. Updates, App Store, Commits and Weather show the reason (`TLS: untrusted certificate`, `TLS: clock not set`, ...). Docs: docs/TLS.md; badge check: `falera run tools/tls_probe.py`.
- **Tooling**: `tools/gen_ca_bundle.py` regenerates the root bundle and `--check-hosts` verifies every host against it.

## v2.0.0 — 2026-11-07

Diwali release: the App Store, a smoother shell, Wi-Fi handoff and Patakha.

- **App Store** (was Store): Discover page with a featured card, icons, taglines, categories, sizes and Install / Open / Update; app pages; B opens Installed, where apps uninstall after a confirm step and reinstall from Discover. The catalogue is one file (apps_market/index.json), cached on the badge and refreshed in the background. Installs stream into a staging folder and swap in only when complete; updates keep an app's saved files.
- **Smaller default image**: About, Badge, Commits, Gallery, Gamepad, Identity, Reader, Settings, App Store and Storage (plus Launcher, Updates and Wi-Fi). Bluetooth, Flappy, Gestures, IR Quest, Racer, Snake, Weather, Pet and Colors install from the App Store.
- **Doom removed**: the engine is gone from the firmware and the game from the App Store, and its 7 MB flash partition now belongs to the filesystem (about 13.7 MB, was 6.7 MB). This takes effect after a full flash: `./deploy --full` erases the badge, while OTA updates keep the old partition table.
- **Patakha** (new, App Store): Diwali firecracker shooter with firework bursts, speed-ups every 100 points, rocket barrages at 250/500/1000 and a UFO power-up (#97).
- **New look**: dark wallpaper on the splash and a light liquid-glass wallpaper on Home (full 320x240). The splash shows the logo top left, "hello" rolling through 16 languages three times a second in their own scripts (anti-aliased Inter / Noto Sans) and a loader, runs on its own thread so it never freezes while the OS loads, and hands over to Home with a swipe of big chevrons in the light wallpaper's colours.
- **Shell**: eased scrolling and partial redraws in the apps grid, home and lists; full-height notification panel with Torch (white screen, Home returns) and Update tiles.
- **Wi-Fi**: boot connects in the background and never blocks the splash; the Wi-Fi page scans live with progress, signal bars and lock icons, shows connect progress with clear failure reasons, and lists Saved networks to join or forget. A paired phone or laptop can send the badge a new network's password from the Send Files page.
- **Faster transfers**: larger buffers and fewer flash writes for LAN uploads; OTA patches stream to flash over a reused connection; deploys batch flash writes.
- **Bluetooth**: status page and stalled-transfer reset; docs/BLUETOOTH.md documents what works today and the next steps.
- **Notification panel over apps that use C** (Wi-Fi's nearby rescan, Pet, Bluetooth): single C goes to the app, double-tap C opens the panel.
- **Fixes**: App Store apps show their own icon in the launcher after install; Patakha has a dimmer sky, a bigger launcher, tilt steering by default and a harder curve; Racer traffic can spawn kerb to kerb, so hugging the edge no longer avoids crashes; IR Quest arms RMT RX on the ESP32-S3 (glitch filter within the S3 limit, #48), every tab shares one receive lifecycle, errors show in full, new DIAG tab (needs the new firmware); Gamepad's C no longer opens the notification panel; About and Badge open instantly from cache and refresh in the background.
- **Tooling**: OTA releases now ship apps' src/ code; tools/build_store_index.py builds and checks the catalogue.

## v1.4.19 — 2026-05-16

- **Fix**: Updates page no longer hangs forever — OTA's `check`,
  `peek`, and `download` now use the raw-socket helper instead of
  `urequests`, with `settimeout` correctly applied after the SSL
  wrap and a hard wallclock backstop.
- **Fix**: Time-sync no longer freezes the device for 15+ seconds —
  `timeutil.sync_from_ntp()` is now a 30-line raw UDP exchange with a
  2.5 s socket timeout (replaces `ntptime.settime()`).
- **Refactor**: Pulled the HTTP helper into `oreoOS/_http.py` so OTA
  + Store share one implementation (single place to fix bugs).
- **Updates UX**: New layout — `OREO OS <version>` header, animated
  "CHECKING …" loader, two side-by-side buttons (`INSTALL` +
  `CHANGELOG`) when an update is found, "Up to date — LTS YYYY-MM-DD"
  card otherwise. The changelog button opens a scrollable sub-page
  showing the GitHub release's body verbatim.

## v1.4.x — earlier patches

See the git log; this CHANGELOG was started at v1.4.19.
