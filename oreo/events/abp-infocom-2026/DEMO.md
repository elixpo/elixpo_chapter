# The stall demo: one run, about 3 minutes

One focused demo, the same every time. The poster is on the table; the
laptop shows the stall screen; the badge does the talking.

## Set up the laptop before people arrive

1. **Keep open on the laptop**, in this order (browser full screen with F11):

   | # | What | Open | Needs internet? |
   | --- | --- | --- | --- |
   | Tab 1 | **The stall screen**: keys **1** overview (leave it on between demos), **2** the three layers, **3** what it does (updates, infrared, RV565), **4** the paper, **5** star and back it | `file:///home/elixpo/elixpo_projects/oreoOS/events/abp-infocom-2026/stall-screen.html` | No (all local) |
   | Tab 2 | **The paper, as a PDF** (14 pages) | `file:///home/elixpo/Documents/falera-pitch/demo/rv565-arxiv-2610.35935.pdf` | No |
   | Tab 3 | The paper's arXiv page (shows it's public) | https://arxiv.org/abs/2610.35935 | Yes |
   | Tab 4 | **The repo**, for "star it": the star button, the README | https://github.com/elixpo/falera | Yes |
   | Tab 5 | The 3D board, as a backup if the badge misbehaves | https://falera.elixpo.com/badge/ | Yes |
   | Tab 6 | The fundraiser, to show the live total | https://payouts.elixpo.com/f/falera-badge | Yes |
   | Window | **The terminal**, split in two (step 3 below) | | No |

   Open only if needed, from `~/Documents/falera-pitch/`:

   | What | File |
   | --- | --- |
   | The poster, full size (if someone asks for a closer look) | `poster/falera-poster-a3.pdf` |
   | The funding card | `poster/falera-funding-card-a5.pdf` |
   | The Star Falera card (if the transfer fails and you want to show it) | `demo/star-falera-card.png` |
   | The demo video recorded the night before (if the hardware fails) | wherever you save it, e.g. `demo/` |

   If the venue has no internet, tabs 1 and 2 and the terminal are all you
   need: the stall screen and the paper are local files.
2. **USB: use the board's UART port** (the CH343 chip; it shows as
   `/dev/ttyACM0`). Not the port marked USB: that one didn't answer as
   MicroPython. In every terminal: `export OREO_PORT=/dev/ttyACM0` (after a
   replug, check the name with `ls /dev/ttyACM*`). `falera doctor` will say
   "no Falera Badge found" on this port: that's expected (it looks for the
   native port's USB ID); every other command works.
3. **Terminal, big font (Ctrl + several times)**, split in two:
   - left: `export OREO_PORT=/dev/ttyACM0` then `falera logs` (a live console;
     it only listens, the badge keeps running);
   - right: `export OREO_PORT=/dev/ttyACM0`, with this typed and ready:
     `falera transfer send ~/Documents/falera-pitch/demo/star-falera-live.png --photo-max 320`
     (a 320×240 "Star Falera" card with a QR code people can scan straight
     off the badge; `--photo-max 320` keeps it full screen).
4. **Badge:** on the home screen, Wi-Fi connected. Preloaded the night
   before, as backups that are already on the badge if anything fails:
   ```bash
   falera add ~/Documents/falera-pitch/demo/star-falera-card.png --photo-max 320
   falera add ~/Videos/bbb-90.mp4 --seconds 10
   ```
   The live send uses a second copy (`star-falera-live.png`), so it never
   clashes with the preloaded one.

Use only `falera transfer` and `falera logs` at the stall: every other
command restarts the badge for a few seconds.

## The run

| # | Say | Badge | Laptop |
| --- | --- | --- | --- |
| 1 | "This is a **computer you can wear round your neck**." | Hand it over, on the home screen | Tab 1, view **1** |
| 2 | **Why:** "Every event gives you a badge, and you throw it away in two days. We wanted one you keep, that does something, and that anyone can build for." | | view 1 |
| 3 | **Three parts:** "It's built like a real computer. At the bottom, **a kernel**: MicroPython firmware on the ESP32-S3, with our drivers. On top, **FaleraOS**, the operating system I wrote: the home screen, an App Store, updates over the air. And on top of that, **apps anyone can write** in Python." | | press **2** |
| 4 | **Examples:** "Here's the App Store… a game… and your GitHub card. It also updates itself over the air, like your phone, and talks infrared, to other badges and like a TV remote." | Open the App Store, then a game (Racer or Flappy Lumi), then the Badge app | press **3** |
| 5 | **Remote control:** "And your computer talks to it over USB, while it keeps running. Watch: I'll send it a picture." | Open **Transfer**; read the code on the screen aloud | Terminal: run the transfer, type the code; point at the live log on the left |
| 6 | "…and there it is. Scan it, it takes you to the code." | The "Star Falera" card arrives; open it in the Gallery and let them scan its QR | |
| 7 | **The paper:** "Video was the hard part: this chip managed half a frame a second. So I invented a format, RV565, that sends only what changed. It's a research paper now." | | press **4** |
| 8 | **The video:** "And here it is, on the badge." | Gallery → play the Big Buck Bunny clip | press **3** (the 0.5 → 24 card) |
| 9 | **The ask:** "If you like it, **star the repo**: it helps more than you'd think. And if you want to help build the first boards, ₹100 buys the buttons for one badge." | | press **5** (the two QR codes) |

Then hand over a QR card and go back to view 1.

## Hard facts (for questions)

**The kernel layer**

- **Chip:** ESP32-S3 (Espressif): dual-core Xtensa LX7 at 240 MHz, 512 KB
  on-chip SRAM, plus **16 MB flash and 8 MB PSRAM** on the module
  (ESP32-S3-WROOM-1-N16R8 on the PCB; the DevKitC-1-N16R8 on the table).
- **What really runs underneath:** ESP-IDF **v5.5.1**, Espressif's SDK, and
  its **FreeRTOS** scheduler. **MicroPython 1.28** runs on top as a FreeRTOS
  task. If someone asks "is it a real kernel?": the RTOS kernel is FreeRTOS;
  our "kernel" layer is MicroPython plus our drivers on top of it.
- **Our own firmware build:** board `OREO_BADGE`, with **its own USB ID,
  303a:83ec, assigned by Espressif**. It has native C modules of ours:
  `oreo_rv565` (video decoding), `oreo_ir` (infrared receive, on the RMT
  peripheral) and `oreo_audio` (MP3 decoding and I2S, for the PCB's speaker).
- **Drivers (`oreoWare/`, ~5,000 lines of Python):** display, buttons,
  motion sensor, infrared, Wi-Fi, Bluetooth, audio. The same code runs on
  the breadboard and the PCB: at boot it looks for the PCB's I/O expander
  and picks the right pins.
- **Memory:** about **7.4 MB of RAM free** with FaleraOS running (it lives in
  the PSRAM). Python threads with a lock (MicroPython's GIL).

**The OS layer: FaleraOS**

- **~13,000 lines of Python** (`oreoOS/`), precompiled to bytecode (`.mpy`)
  on the badge.
- **59 stable releases** so far; updates go to every badge over the air.
- **Apps:** a Python class (`on_enter`, `update`, `draw`,
  `on_button_press`, `on_exit`) plus a `manifest.json`. **13 built in**,
  **14 in the App Store** (four of them need the PCB's speaker). About
  13.7 MB of the flash is free for apps and media.
- **App Store:** one catalogue file; the badge downloads apps itself, over
  its own Wi-Fi.
- **Updates over the air:** a release manifest on GitHub lists every file
  with its **SHA-256**; files download into a staging folder, are checked,
  and are installed at the next boot. Small patches (under 80 KB) download
  on their own.
- **Network rule:** Wi-Fi is for the internet only; nothing on the badge
  listens on the local network. Bluetooth features come later.
- **The CLI:** `falera` (falera-cli 1.1.0, ~8,000 lines of Python): files,
  apps, setup, screenshots, and the Transfer app (you type the code the
  badge shows). A version where every command runs while FaleraOS keeps
  running is merged and coming in the next release; it isn't on this badge.
- **Tested without hardware:** over **750 automated tests** run on a
  computer, standing in for the badge.
- **Licences:** code **MIT**, hardware **CERN-OHL-P** (certified by OSHWA,
  **IN000107**), docs and art **CC BY 4.0**.

**The hardware**

- **On the table (breadboard):** ESP32-S3 DevKitC, a 2.0" ST7789 screen
  (320×240), 8 buttons, an MPU-6050 motion sensor, a TSOP38238 IR receiver
  and an IR LED, a WS2812 status LED.
- **The PCB (arriving):** a 2.8" ILI9341 touch screen (320×240), 8 buttons on
  an AW9523B expander, a MAX98357A amplifier and speaker, microSD, a LiPo
  cell (about 1000 mAh) charged over USB-C; 4 layers, 1.6 mm. About
  **₹4,172 in parts** per badge (about $44).

**RV565 (the video format)**

- Frames stored in the **display's own pixel format**; a player only
  decompresses and sends them. Version 8 sends only the **changed
  rectangle** of each frame.
- **0.5 → 24 FPS** on the ESP32-S3 (the firmware path); **about 12 FPS
  inside FaleraOS** (MicroPython). On the badge, version 8 cut a UI clip's
  display transfer from 14.8 to 6.2 ms per frame.
- Paper: **arXiv 2610.35935** (a preprint). In the Arduino Library Manager,
  the Espressif registry and PyPI; **featured on the Adafruit blog**.

## Words to keep right

- Video: "half a frame a second to 24 frames a second" is the firmware path;
  inside FaleraOS it's about 12. Say "smooth video", or give both numbers if
  asked.
- The paper is a **preprint** on arXiv; Adafruit **featured** RV565.
- OSHWA certified the **board design**.
- It's **Falera** and **FaleraOS**; the panda is **Lumi**.

## If something goes wrong

| Problem | Do |
| --- | --- |
| Transfer says the badge didn't answer | Is the Transfer app open with a code on screen? Leave it (HOME), open it again, retry. If it still fails, open the **preloaded** "Star Falera" card in the Gallery instead and carry on. |
| The badge hangs | Press RESET; it boots in a few seconds. Keep talking over view 2. |
| No Wi-Fi at the venue | Skip the App Store install; everything else works offline. Phone hotspot is saved. |
| The badge won't start | Switch to tab 3 (the 3D board) and do the demo from the poster. |
