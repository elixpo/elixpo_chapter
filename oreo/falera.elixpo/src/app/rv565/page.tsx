import Link from "next/link";
import { LumiTip } from "@/components/Lumi";
import { Card, ListRow, NextStep, NumberBand, PageHeader, Screen, Section, SectionHeader, Steps } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

/* /rv565/ — the overview of RV565, linking the converter, the paper and the
 * architecture notes. Every fact here is from those pages and from
 * src/data/press.ts. */

export const metadata = pageMetadata({
  title: "RV565: frame-independent video for microcontroller displays",
  description:
    "RV565 is Elixpo's frame-independent video format and library for SPI displays on ESP32-S3, other ESP32 chips and (experimentally) the Raspberry Pi Pico 2: frames decode straight to the panel's native pixels. 24 FPS with zero missed deadlines on ESP32-S3; paper on arXiv; Arduino, ESP-IDF and PyPI packages.",
  path: "/rv565/",
  keywords: ["RV565", "RGB565 video", "ESP32-S3 video", "microcontroller video format", "SPI display video", "Arduino video"],
});

const PARTS = [
  { n: "01", title: "Video converter", body: "Turn an MP4 or WebM into an RV565 clip or an Arduino clip.h in your display's own pixel format. Runs in your browser: no upload, no account.", href: "/rv565/convert/" },
  { n: "02", title: "Research paper", body: "Cross-layer co-design for frame-independent video on ESP32-S3: the dual-core pipeline, the decode-cost model and the measurements. arXiv 2610.35935.", href: "/paper/" },
  { n: "03", title: "Video architecture", body: "Independent RGB565 frames, firmware inflation, SPI2 GDMA stripes, and the measured path from 0.5 to 24 FPS inside FaleraOS.", href: "/docs/video-architecture/" },
];

const SHIPS: [string, string, string][] = [
  ["Arduino", "RV565 in the Library Manager", "https://www.arduinolibraries.info/libraries/rv565"],
  ["Espressif", "RV565 in the component registry", "https://components.espressif.com/components/elixpo/rv565"],
  ["PyPI", "The rv565 encoder and tools", "https://pypi.org/project/rv565/"],
  ["Adafruit", "RV565 ships in the CircuitPython Community Bundle", "https://github.com/adafruit/CircuitPython_Community_Bundle/pull/292"],
  ["Arduino_GFX", "Includes an RV565 video example", "https://github.com/moononournation/Arduino_GFX/pull/823"],
  ["The file command", "Recognises RV565 videos", "https://bugs.astron.com/view.php?id=822"],
];

export default function Rv565Page() {
  return (
    <>
      <PageHeader
        tone="red"
        aside={
          <Screen
            src="/screens/bbb-frame.webp"
            alt="A frame of Big Buck Bunny as RV565 plays it: the big white rabbit in a green meadow"
            caption="Big Buck Bunny (CC BY 3.0, Blender Foundation), the paper's test film."
            className="hidden lg:block"
          />
        }
        eyebrow="RV565 · video for microcontrollers"
        title={<>Video in your display&apos;s <em>own pixels.</em></>}
        lede="RV565 is a small video container for microcontrollers whose frames decode straight to the display's native pixels, so the board runs no colour conversion. It plays FaleraOS's Gallery videos, and runs on ESP32-S3 and other ESP32 chips, and experimentally on the Raspberry Pi Pico 2."
      >
        <Link href="/rv565/convert/" className="btn-primary">Convert a video</Link>
        <a href="https://github.com/elixpo/rv565" target="_blank" rel="noreferrer" className="btn-ghost">RV565 on GitHub ↗</a>
        <a href="https://pypi.org/project/rv565/" target="_blank" rel="noreferrer" className="btn-ghost">pip install rv565 ↗</a>
      </PageHeader>

      <Section label="Measured on ESP32-S3" tone="ink">
        <p className="eyebrow mb-10">Measured on ESP32-S3</p>
        <NumberBand items={[
          { value: "24 FPS", label: "on both workloads, zero deadline misses (dual-core)" },
          { value: "10.3 ms", label: "worst-frame slack, against a 41.7 ms period" },
          { value: "98.1%", label: "of the 40 MHz SPI wire-time bound" },
          { value: "9", label: "pixel formats in format version 7, RGB565 to 1-bit" },
        ]} />
      </Section>

      <Section id="parts">
        <SectionHeader
          eyebrow="Tools and research"
          title={<>Convert, read, <em>and see how it works.</em></>}
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <Card href={PARTS[0].href} className="flex flex-col justify-between gap-8 p-6 sm:p-8 lg:col-span-2 lg:row-span-2">
            <div>
              <span className="font-mono text-sm font-bold text-primary">{PARTS[0].n}</span>
              <h3 className="mt-4 font-display text-title text-text group-hover:text-primary">{PARTS[0].title}</h3>
              <p className="mt-3 max-w-prose-site leading-relaxed text-text-dim">{PARTS[0].body}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {["RGB565", "RGB666", "RGB444", "4-bit grey", "1-bit", "clip.h"].map((f) => <span key={f} className="chip">{f}</span>)}
            </div>
            <span className="link-onward">Open the converter <span aria-hidden="true">→</span></span>
          </Card>
          {PARTS.slice(1).map((p) => (
            <Card key={p.href} href={p.href} className="flex h-full flex-col p-6">
              <span className="font-mono text-sm font-bold text-primary">{p.n}</span>
              <h3 className="h-card mt-4 group-hover:text-primary">{p.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-text-dim">{p.body}</p>
              <span className="link-onward mt-6">Open <span aria-hidden="true">→</span></span>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="formats" fill>
        <SectionHeader
          eyebrow="The format"
          title={<>Three versions, <em>one container.</em></>}
          lede="Version 6, the format the paper measured, is RGB565 with zlib and every frame a keyframe. Each later version keeps the container and adds to it."
        />
        <Steps
          className="mt-12"
          steps={[
            { title: "Version 6 · RV565 1.x", body: "RGB565 + zlib, every frame a keyframe. Measured at 24 FPS with zero missed frames on ESP32-S3." },
            { title: "Version 7 · RV565 2.0", body: "Nine pixel formats for TFT, OLED and e-paper panels; stored or zlib frames; XOR deltas, repeats and partial deltas." },
            { title: "Version 8 · RV565 3.0", body: "Region deltas: each changed band also carries the columns that changed, so a player decodes and sends only that rectangle." },
          ]}
        />
      </Section>

      <Section id="ships">
        <SectionHeader eyebrow="Where it ships" title={<>Packaged, <em>and recognised upstream.</em></>} />
        <ul className="mt-10">
          {SHIPS.map(([who, what, href], i) => (
            <ListRow key={href} n={String(i + 1).padStart(2, "0")} href={href} title={<>{who} <span aria-hidden="true" className="text-muted">↗</span></>} body={what} />
          ))}
        </ul>
        <LumiTip pose="badge">RV565 frames decode straight to the screen&apos;s own pixels, so the board does no colour conversion at all.</LumiTip>
      </Section>

      <NextStep
        title={<>Try it on <em>your own clip.</em></>}
        body="Pick the frame size, the pixel format your display takes and the frame rate."
        href="/rv565/convert/"
        cta="Open the converter"
      />
    </>
  );
}
