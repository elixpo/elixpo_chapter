import BoardViewerLazy from "@/components/BoardViewerLazy";
import PressStrip from "@/components/PressStrip";
import { LumiTip } from "@/components/Lumi";
import { Card, Fact, NextStep, PageHeader, Section, SectionHeader } from "@/components/ui";
import { FUND_URL, GITHUB } from "@/lib/links";

const CIRCUIT = `${GITHUB}/blob/main/circuit/elixpo`;

// Four specs sit beside the 3D board, four under it.
const SPECS_SIDE: [string, string][] = [
  ["MCU", "ESP32-S3-WROOM-1 · dual core @ 240 MHz"],
  ["Memory", "16 MB flash · 8 MB PSRAM · microSD"],
  ["Display", "2.8″ ILI9341 320×240 · resistive touch · landscape"],
  ["Radio", "Wi-Fi 2.4 GHz · Bluetooth LE 5 · IR transmit and receive"],
];
const SPECS_BELOW: [string, string][] = [
  ["Power", "LiPo · USB-C charging (BQ24074) · 3.3 V buck-boost"],
  ["I/O", "8 buttons · MPU-6050 · speaker · Qwiic · 4-GPIO header"],
  ["Dimensions", "88 × 133.5 mm portrait PCB"],
  ["Layers", "4-layer FR-4 · 1.6 mm · black mask"],
];

const STACK = [
  { lvl: "apps/",       body: "Userland — manifest.json + main.py per app." },
  { lvl: "oreoOS/",     body: "The OS: launcher, store, OTA, notifications, file transfer." },
  { lvl: "oreoWare/",   body: "HAL / Board Support: drivers for screen, buttons, IMU, BLE, WiFi, IR, battery." },
  { lvl: "MicroPython", body: "Runtime — we credit it loudly; we did not write it." },
];

// Flat tints, top to bottom: the app layer in red, the OS white, the
// drivers green, the runtime grey.
const LAYER_TINT = ["bg-red-tint", "bg-card", "bg-green-tint", "bg-card-sub"];

export default function BadgePage() {
  return (
    <>
      <PageHeader
        eyebrow="The badge · PCB v1 · first boards ordered"
        title={<>The hardware, <em>all open.</em></>}
        lede="A 2.8″ touch screen, eight buttons, IR for line-of-sight quests, an MPU-6050 for shake and tilt, a speaker, and LEDs around the frame. The KiCad design, the bill of materials and the build notes live in the repo, so you can fork them and make your own."
        aside={
          <a
            href="https://certification.oshwa.org/in000107.html"
            target="_blank" rel="noreferrer"
            className="card-link flex items-center gap-5 p-5"
            aria-label="Certified open source hardware, OSHWA UID IN000107"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/oshw_mark.png" alt="" className="h-10 w-auto" width={4000} height={1122} decoding="async" />
            <span className="text-sm leading-snug text-text-dim">
              Certified open source hardware by OSHWA
            </span>
          </a>
        }
      >
        <a href={FUND_URL} target="_blank" rel="noreferrer" className="btn-accent">Fund the badge</a>
        <a href={`${CIRCUIT}/README.md`} target="_blank" rel="noreferrer" className="btn-ghost">Board design notes</a>
        <a href={`${CIRCUIT}/BOM_COST.md`} target="_blank" rel="noreferrer" className="btn-ghost">Bill of materials</a>
        <a href={`${GITHUB}/tree/main/circuit/elixpo`} target="_blank" rel="noreferrer" className="btn-ghost">KiCad files</a>
        <a href={GITHUB} target="_blank" rel="noreferrer" className="btn-ghost">Repo</a>
      </PageHeader>

      {/* The board, with the specs around it. */}
      <Section label="The board in 3D" tone="ink">
        <p className="eyebrow mb-8">PCB v1 · drag to turn it</p>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
          <figure className="card-fill overflow-hidden">
            {/* Fixed height, so the page does not shift while the model loads. */}
            <div className="h-[400px] sm:h-[560px] lg:h-[620px]">
              <BoardViewerLazy />
            </div>
            <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1
                                   border-t border-border px-4 py-3 text-xs text-muted">
              <span className="font-mono uppercase tracking-[0.12em]">PCB v1 · black mask, white silkscreen, HASL</span>
              <span>
                Flat renders:{" "}
                <a href="/pcb_front.jpg" className="link">front</a>
                {" · "}
                <a href="/pcb_back.jpg" className="link">back</a>
                {" · "}
                <a href="/models/falera-badge.glb" download className="link">GLB model</a>
              </span>
            </figcaption>
          </figure>
          <div className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:content-center">
            {SPECS_SIDE.map(([k, v]) => <Fact key={k} k={k}>{v}</Fact>)}
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SPECS_BELOW.map(([k, v]) => <Fact key={k} k={k}>{v}</Fact>)}
        </div>
      </Section>

      <Section id="architecture">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <SectionHeader
            eyebrow="Software stack"
            title={<>Layered <em>architecture.</em></>}
            lede="Four layers, each can be rewritten without the others noticing."
          />
          {/* Drawn as a stack: apps on top, MicroPython at the bottom. */}
          <ol className="grid gap-2">
            {STACK.map((row, i) => (
              <li
                key={row.lvl}
                className={`reveal flex flex-col gap-1 rounded-card border border-border p-5 sm:flex-row sm:items-baseline sm:gap-6 ${LAYER_TINT[i]}`}
                style={{ marginInline: `${i * 0.75}rem` }}
              >
                <span className="w-8 shrink-0 font-mono text-sm font-bold text-primary-dim">L{STACK.length - i}</span>
                <code className="w-32 shrink-0 font-mono text-base font-bold text-text">{row.lvl}</code>
                <span className="text-sm leading-relaxed text-text-dim">{row.body}</span>
              </li>
            ))}
          </ol>
        </div>

        <Card fill className="mt-10 p-6 sm:p-8">
          <p className="eyebrow">Made by</p>
          <p className="mt-3 max-w-3xl leading-relaxed text-text-dim">
            Designed by{" "}
            <a href="https://github.com/Circuit-Overtime" target="_blank" rel="noreferrer" className="link">
              Ayushman Bhattacharya (@Circuit-Overtime)
            </a>{" "}
            with{" "}
            <a href="https://github.com/anwe-ch" target="_blank" rel="noreferrer" className="link">
              Anwesha Chakraborty (@anwe-ch)
            </a>
            , Elixpo core maintainer and co-author of the RV565 video format the badge plays.
          </p>
        </Card>
      </Section>

      <Section id="press">
        <PressStrip />
        <LumiTip pose="badge">This board is certified open hardware (OSHWA IN000107). Fork the KiCad files and make your own!</LumiTip>
      </Section>

      <NextStep
        title={<>Twenty apps <em>run on this board.</em></>}
        body="Ten come built in; the on-device App Store installs ten more from GitHub."
        href="/apps/"
        cta="See the apps"
      />
    </>
  );
}
