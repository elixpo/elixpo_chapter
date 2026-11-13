# OreoOS status roadmap

Goal: OreoOS is recognised as *the* operating system of the Oreo Badge, by
the computers it is plugged into and by the places the ESP32 and MicroPython
communities trust, not only on our own site.

What "official" can mean for a microcontroller OS:

- **Identity:** what a computer shows when the badge is plugged in (USB
  manufacturer and product names, serial-port names, the boot banner).
- **Installation:** installable in one click from trusted tools.
- **Listing:** present in the registries and indexes people search.
- **Adoption:** shipped on badges at events, used and cited by others.

Legend: 🤖 Claude prepares it (code, PR, draft) · 🙋 needs Ayushman (account,
hardware, build/flash, or a decision).

---

## Level 1: identity and installation

### 1.1 The badge introduces itself as "Oreo Badge"

- [x] 🤖 MicroPython board definition `firmware/boards/OREO_BADGE`: the exact
      ESP32_GENERIC_S3 + SPIRAM_OCT configuration (flash layout and behaviour
      unchanged) plus USB manufacturer "Elixpo", product "Oreo Badge", board
      name "Oreo Badge" (boot banner, `os.uname()`) and hostname `oreo`.
- [x] 🤖 `./build-firmware` builds it and checks the identity is in the image;
      the deployable image is now `oreoWare/firmware/OREO_BADGE-v1.28.0.bin`.
- [ ] 🙋 Build (`./build-firmware --clean`), flash (`./deploy --full`), and
      confirm: `ls /dev/serial/by-id/` shows `usb-Elixpo_Oreo_Badge_…`, and the
      REPL banner ends `Oreo Badge with ESP32S3`. Commit the new image.

### 1.2 One-click install from the browser

- [ ] 🤖 "Install OreoOS" button on oreo.elixpo.com using ESP Web Tools (Chrome
      and Edge, Web Serial): flashes the firmware, then the OS files.
- [ ] 🤖 Decide the image: a full flash image with the filesystem included, or
      firmware plus first-boot download of the OS through the existing OTA path.
- [ ] 🙋 Test on a wiped badge.

### 1.3 Release assets people and tools can trust

- [ ] 🤖 Each GitHub release carries the firmware image, the full flash image
      and SHA-256 checksums, built by CI from the tagged commit.
- [ ] 🤖 Release notes generated from the changelog.

---

## Level 1.5: a GitHub Universe–class badge

The badge was conceived in the spirit of GitHub Universe's conference badges:
your GitHub identity on your chest, working all day at a venue with patchy
WiFi, and fun to hack. These items close the gap.

- [x] 🤖 **Offline-first GitHub apps:** Badge and Commits open instantly from
      flash and sync in the background only when WiFi is up; Commits' graph
      now matches GitHub's calendar
      ([oreo#71](https://github.com/elixpo/oreo/pull/71)).
- [ ] 🙋 Test #71 on the badge (open both apps with and without WiFi).
- [ ] 🤖 **Prefill at deploy:** `./deploy` fetches the profile and graph on
      the laptop and writes the caches, so the very first open at a venue
      shows real data with no WiFi at all.
- [ ] 🤖 **QR code to your GitHub profile** on the Badge card (scan to
      follow), generated on the badge from `GITHUB_USER`.
- [ ] 🤖 **Name-badge idle screen:** after inactivity, show name, handle and
      QR at low brightness instead of sleeping to black.
- [ ] 🤖 **Swap handles over IR:** the IR link already pairs badges; exchange
      GitHub handles and keep a "people I met" list with their QR codes.
- [ ] 🤖 **Event pack:** an offline agenda app (now / next / my sessions)
      loaded from a JSON file at deploy, for organisers to ship per event.
- [ ] 🤖 **Set up without a laptop:** enter GitHub username and WiFi from the
      on-badge web page, not only `.env` + deploy.
- [ ] 🤖 **"Hack your badge" guide:** a 10-minute first-app walkthrough on
      oreo.elixpo.com using `app_templates/`.

## Level 2: listed where people look

- [x] 🤖 **awesome-esp**, *Firmware* section
      ([agucova/awesome-esp#68](https://github.com/agucova/awesome-esp/pull/68)),
      and **awesome-micropython**, *Frameworks* section next to micrOS
      ([mcauser/awesome-micropython#233](https://github.com/mcauser/awesome-micropython/pull/233)).
      One-line PRs, disclosed as our own (2026-11-02).
- [x] 🙋 **Wikidata** item [OreoOS (Q141968869)](https://www.wikidata.org/wiki/Q141968869),
      created by hand (new accounts can't run QuickStatements): embedded
      operating system and free software, based on MicroPython, platform
      ESP32-S3, Python, MIT, inception, version, website, repository, and
      described by arXiv:2610.35935, with sourced statements (2026-11-02).
- [x] 🤖 **Hackaday.io** page text drafted (name, summary, description,
      details, components, links, tags, image list).
- [ ] 🙋 Post it on hackaday.io with photos and the badge video.
- [x] 🤖 **Own USB PID** under Espressif's VID: requested 0x83E9 in
      [espressif/usb-pids#425](https://github.com/espressif/usb-pids/pull/425)
      (2026-11-02). Espressif grants PIDs to MicroPython boards routinely
      (64 MicroPython entries in their list).
- [ ] 🤖 When the PID is merged: set `MICROPY_HW_USB_VID 0x303A` and
      `MICROPY_HW_USB_PID` in `firmware/boards/OREO_BADGE/mpconfigboard.h`.
- [ ] 🤖 Submit "Elixpo Oreo Badge" to the Linux USB ID database (`usb.ids`,
      linux-usb.org), so plain `lsusb` and systemd's hwdb name the badge.
- [ ] 🙋 A good photo of the badge (JPEG, plain background) for MicroPython's
      board page.
- [ ] 🤖 **MicroPython upstream board** (`micropython/micropython`,
      `ports/esp32/boards/ELIXPO_OREO_BADGE`, with the PID) plus the photo in
      `micropython/micropython-media`, so the badge appears on
      micropython.org/download with automatically built firmware. Commit
      messages follow MicroPython's conventions with `Signed-off-by`. Review
      is slow and favours boards people can obtain, so the PR points to the
      open hardware files and build instructions.

## Level 3: adoption

- [ ] 🙋 Ship OreoOS on badges at an event (the way EMF Camp's Tildagon and
      the Hackaday Supercon badges became known).
- [ ] 🤖 Systems paper on OreoOS (app model, OTA, on-badge security, RV565
      integration), cross-cited with the RV565 paper.
- [ ] 🙋 Talks: MicroPython meetups, Hackaday Supercon, PyCon.

---

## What does not apply

- **A Linux kernel or "OS registry" PR.** OreoOS runs on MicroPython over
  ESP-IDF/FreeRTOS on the ESP32-S3, not on Linux, and there is no central
  list of operating systems for microcontrollers. The upstream that matters
  is MicroPython (board definition) and Espressif's programmes (USB PID).
- **Espressif's ESP-IDF repository.** It does not list third-party operating
  systems; the Espressif routes are the Developer Portal (articles) and the
  ESP Component Registry (libraries, where RV565 already is).
