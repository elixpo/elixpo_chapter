# 📚 FaleraOS docs

Everything in this folder is here for one of three audiences:

- **People who have a badge** → start with [`USB.md`](USB.md): connect it, open the REPL, copy files
- **People who want to build the badge** → start with [`HARDWARE.md`](HARDWARE.md)
- **People who want to copy the design** → start with [`DATASHEET.md`](DATASHEET.md)
- **People who want to read the dev journal** → the per-subsystem `.md` files (lcd, buttons, breadboard BOM, badge layout)

`CLI.md`, `USB.md` and `TRANSFER.md` are also published on the website,
rendered from these files when the site is built:
[falera.elixpo.com/docs/cli](https://falera.elixpo.com/docs/cli/),
[/docs/usb](https://falera.elixpo.com/docs/usb/) and
[/docs/transfer](https://falera.elixpo.com/docs/transfer/). Edit them here.

New here? Read the [preamble](../PREAMBLE.md) first: what FaleraOS is, the
rules it is built by and how it is put together. Then
[`LEARN.md`](LEARN.md) is a guided tour of the code. How the project is run:
[`GOVERNANCE.md`](GOVERNANCE.md); reporting a vulnerability:
[`SECURITY.md`](SECURITY.md).

If you're writing an app, start with [`APPS.md`](APPS.md). For the OS
itself, see the root [`CONTRIBUTING.md`](../CONTRIBUTING.md) and
[`AGENTS.md`](../AGENTS.md).

---

## 📑 What's in here

| File | What it covers | Audience |
|---|---|---|
| [`USB.md`](USB.md) | Using the badge from a computer: which USB-C port, ports and permissions, the falera CLI, raw `mpremote`, deploying, flashing, troubleshooting | Everyone with a badge |
| [`HARDWARE.md`](HARDWARE.md) | Narrative build guide — BOM, pinout, power, wake-from-sleep, soldering tips | Anyone building or repairing the badge |
| [`DATASHEET.md`](DATASHEET.md) | Formal specs — electrical, mechanical, communication interfaces, component reference | Someone designing a PCB or porting FaleraOS |
| [`BADGE_LAYOUT.md`](BADGE_LAYOUT.md) | Mechanical layout drawings + dimensions | PCB designers, case-makers |
| [`BREADBOARD_BOM.md`](BREADBOARD_BOM.md) | First-time-builder BOM with through-hole-friendly parts | Workshop teachers, beginner solderers |
| [`lcd.md`](lcd.md) | Display init, RAMWR strategy, refresh fps notes | Anyone touching `oreoWare/display.py` |
| [`buttons.md`](buttons.md) | Matrix wiring, debounce, wake-on-press details | Anyone touching `oreoWare/buttons.py` |
| [`VIDEO_ARCHITECTURE.md`](VIDEO_ARCHITECTURE.md) | Technical deep dive: RV565 v4, PSRAM preload, native Xtensa scaling, 24 FPS scheduling | Anyone extending Gallery or embedded media playback |
| [`RV565_KNOWLEDGE_DECK.md`](RV565_KNOWLEDGE_DECK.md) | Slide-form explanation of RV565 v6, the firmware boundary, DMA pipeline, measurements, and roadmap | Engineers, research collaborators, and presenters |
| [`../paper/`](../paper/) | Academic RV565 paper source, TikZ architecture, references, and blank evaluation tables | Researchers and artifact reviewers |
| [`APPS.md`](APPS.md) | Writing an app: layout, lifecycle, input, drawing, saving state, network, validation, PR checklist | App developers |
| [`PROFILE.md`](PROFILE.md) | Setting the owner's GitHub user, name, timezone and weather location (`/profile.json`, `.env.local`) | Badge owners, app developers |
| [`CLI.md`](CLI.md) | The `falera` command-line tool: talking to the badge over USB | Badge owners, app developers |
| [`TRANSFER.md`](TRANSFER.md) | The Transfer app: sending photos, videos and documents over USB with the code the badge shows, and its protocol | Badge owners, contributors |
| [`OS_ROADMAP.md`](OS_ROADMAP.md) | What the OS does today and what is planned | Contributors |
| [`MEDIA_INGESTION.md`](MEDIA_INGESTION.md) | Turning photos and videos into Gallery assets | Anyone adding media |
| [`BLUETOOTH.md`](BLUETOOTH.md) | The BLE transfer service (Bluetooth is the last feature on the roadmap, #124) | Contributors |
| [`images/`](images/) | Photos, screenshots, the banner, mockups | The README + sibling docs reference these |

---

## 🗺 Big-picture reading order

1. **[`../README.md`](../README.md)** — what the badge is, what it does
2. **[`HARDWARE.md`](HARDWARE.md)** — build it on a breadboard
3. **[`DATASHEET.md`](DATASHEET.md)** — every number you need to copy / extend it
4. **[`APPS.md`](APPS.md)** — write your first app
5. **[`../CONTRIBUTING.md`](../CONTRIBUTING.md)** — the PR checklist, cutting a release

---

## 🧪 Source of truth

When something disagrees:

- **Pin map** → [`../oreoWare/pins.py`](../oreoWare/pins.py)
- **OS version** → [`../oreoOS/config.py`](../oreoOS/config.py) (`VERSION` constant)
- **Theme colours** → [`../oreoOS/theme.py`](../oreoOS/theme.py)
- **OTA release manifest format** → [`../tools/build_release.py`](../tools/build_release.py)

This folder describes those files; it doesn't override them.

---

## 📨 Found a typo, a wrong pin, or a missing diagram?

Open an issue or PR — see [`../CONTRIBUTING.md`](../CONTRIBUTING.md).
Docs improvements have the same warm welcome as code changes.

Or email **hello@elixpo.com**.
