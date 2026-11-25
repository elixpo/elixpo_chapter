// Public coverage and recognition of FaleraOS and RV565. The README's
// "In the press" section lists the same items: keep the two in step.
// Only accepted or merged items go here, never pending submissions.

export type PressItem = { who: string; what: string; href: string; date?: string };

export const COVERAGE: PressItem[] = [
  {
    who: "Adafruit",
    what: "OreoOS, a MicroPython-based operating system",
    href: "https://blog.adafruit.com/2026/11/04/oreoos-a-micropython-based-operating-system/",
    date: "4 Nov 2026",
  },
  {
    who: "MA-NO",
    what: "OreoOS turns an ESP32-S3 board into a badge with apps and video",
    href: "https://www.ma-no.org/en/software/operating-systems/oreoos-turns-an-esp32-s3-board-into-a-badge-with-apps-and-video",
    date: "4 Nov 2026",
  },
  {
    who: "Adafruit",
    what: "RV565, frame-independent RGB565 video for ESP32-S3 and RP2350",
    href: "https://blog.adafruit.com/2026/11/10/rv565-frame-independent-rgb565-video-for-esp32-s3-and-rp2350-spi-displays/",
    date: "10 Nov 2026",
  },
  {
    who: "HardLabs",
    what: "Oreo by elixpo: open source PCB, KiCad files and BOM",
    href: "https://www.hardlabs.io/boards/elixpo--oreo",
  },
];

export const UPSTREAM: PressItem[] = [
  {
    who: "Espressif",
    what: "Assigned the badge its own USB ID, 303a:83ec",
    href: "https://github.com/espressif/usb-pids/pull/425",
  },
  {
    who: "OSHWA",
    what: "Certified open source hardware, IN000107",
    href: "https://certification.oshwa.org/in000107.html",
  },
  {
    who: "The file command",
    what: "Recognises RV565 videos",
    href: "https://bugs.astron.com/view.php?id=822",
  },
  {
    who: "Adafruit",
    what: "RV565 ships in the CircuitPython Community Bundle",
    href: "https://github.com/adafruit/CircuitPython_Community_Bundle/pull/292",
  },
  {
    who: "Arduino_GFX",
    what: "Includes an RV565 video example",
    href: "https://github.com/moononournation/Arduino_GFX/pull/823",
  },
  {
    who: "Awesome lists",
    what: "Listed in Awesome CircuitPython and Awesome Raspberry Pi",
    href: "https://github.com/adafruit/awesome-circuitpython/pull/63",
  },
  {
    who: "Awesome MicroPython",
    what: "Lists FaleraOS and RV565",
    href: "https://github.com/mcauser/awesome-micropython",
    date: "20 Nov 2026",
  },
  {
    who: "OpenSSF",
    what: "Best Practices badge, passing (100%)",
    href: "https://www.bestpractices.dev/projects/16187",
  },
];

/** Posts by the team on blogs.elixpo.com. */
export const BLOG: PressItem[] = [
  {
    who: "From 0.5 FPS to native video",
    what: "How video on the badge started, in FaleraOS's Gallery",
    href: "https://blogs.elixpo.com/elixpohere/esp32s3-spiderman",
  },
  {
    who: "The screen was blank",
    what: "Porting RV565 to the Raspberry Pi Pico 2",
    href: "https://blogs.elixpo.com/elixpohere/rv565-pico-2-tweak",
  },
];

export const PUBLISHED: PressItem[] = [
  { who: "arXiv", what: "The RV565 paper, 2610.35935", href: "https://arxiv.org/abs/2610.35935" },
  { who: "Arduino", what: "RV565 in the Library Manager", href: "https://www.arduinolibraries.info/libraries/rv565" },
  { who: "Espressif", what: "RV565 in the component registry", href: "https://components.espressif.com/components/elixpo/rv565" },
  { who: "PyPI", what: "The rv565 encoder and tools", href: "https://pypi.org/project/rv565/" },
  { who: "Wikidata", what: "FaleraOS, Q141968869", href: "https://www.wikidata.org/wiki/Q141968869" },
  { who: "MicroPython", what: "The FaleraOS announcement", href: "https://github.com/orgs/micropython/discussions/19847" },
];
