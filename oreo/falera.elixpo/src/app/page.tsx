import Link from "next/link";
import AppCard from "@/components/AppCard";
import { FUND_URL } from "@/lib/links";
import { AppIcon } from "@/components/AppCard";
import { LumiTip } from "@/components/Lumi";
import { Card, Eyebrow, NumberBand, Onward, Screen, Section, SectionHeader, Split, Stat, Steps } from "@/components/ui";
import { PRELOADED, STORE } from "@/data/apps";

/* The home page tells one story, top to bottom: what Falera is, the proof,
 * the badge, the apps, building for it, RV565, and supporting it. Every
 * section ends with one link onward to the page that goes deeper. */

const PROOF = [
  { value: "57", label: "FaleraOS releases since May 2026", href: "https://github.com/elixpo/falera/tags" },
  { value: "20", label: "apps: 10 built in, 10 in the App Store", href: "/apps/" },
  { value: <span className="font-mono text-[0.68em]">IN000107</span>, label: "OSHWA-certified open source hardware", href: "https://certification.oshwa.org/in000107.html" },
  { value: <span className="font-mono text-[0.68em]">303a:83ec</span>, label: "its own USB ID, assigned by Espressif", href: "https://github.com/espressif/usb-pids/pull/425" },
  { value: "Adafruit", label: "covered FaleraOS and RV565 on its blog", href: "https://blog.adafruit.com/2026/11/04/oreoos-a-micropython-based-operating-system/" },
];

const SPECS: [string, string][] = [
  ["MCU", "ESP32-S3, dual core at 240 MHz, 8 MB PSRAM"],
  ["Display", "2.8″ 320×240 touch screen, eight buttons"],
  ["Radio", "Wi-Fi, Bluetooth LE 5, IR send and receive"],
  ["Power", "LiPo with USB-C charging"],
];

const STORE_APP = PRELOADED.find((a) => a.slug === "store")!;
const SHOWCASE = [
  ...PRELOADED.filter((a) => ["gallery"].includes(a.slug)),
  ...STORE.filter((a) => ["quest"].includes(a.slug)),
  ...STORE.filter((a) => ["Lumi", "snake"].includes(a.slug)),
];

const BUILD = [
  { n: "01", title: "Set up the badge", body: "Flash MicroPython, deploy FaleraOS and install the falera CLI. About fifteen minutes with a USB-C cable.", href: "/get-started/" },
  { n: "02", title: "Drive it from your computer", body: "The falera CLI sends files to the Transfer app, sets up Wi-Fi and your profile, installs apps and updates FaleraOS.", href: "/docs/cli/" },
  { n: "03", title: "Write an app", body: "Subclass oreoOS.App, draw on a 320×240 screen, react to eight buttons. Start from falera new.", href: "/docs/apps/" },
];

export default function Home() {
  return (
    <>
      {/* 1 · What Falera is */}
      <div className="border-b border-border">
        <div className="container-page grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16 lg:py-24">
          <div>
            <Eyebrow className="mb-6">FaleraOS by Elixpo · open hardware</Eyebrow>
            <h1 className="h-display max-w-[17ch]">
              <span className="sr-only">FaleraOS: </span>
              A Python operating system, <em>in a pocket-sized badge.</em>
            </h1>
            <p className="lede mt-6 max-w-prose-site">
              FaleraOS runs 20 apps on the ESP32-S3 Falera Badge: a launcher, an on-device App Store,
              OTA updates over Wi-Fi, file transfer over USB, IR-quest peer pairing, and a virtual pet
              panda that judges you for skipping meals.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/get-started/" className="btn-primary">Get started</Link>
              <a href={FUND_URL} target="_blank" rel="noreferrer" className="btn-accent">Fund the badge</a>
              <a href="https://github.com/elixpo/falera" target="_blank" rel="noreferrer" className="btn-ghost">
                Source on GitHub
              </a>
            </div>
          </div>
          <figure className="card-fill overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/badge-angle.webp"
              alt="The Falera Badge PCB: black solder mask, white silkscreen with Lumi the panda, eight buttons along the bottom"
              width={900}
              height={750}
              fetchPriority="high"
              decoding="async"
              className="aspect-[6/5] h-auto w-full object-cover"
            />
          </figure>
        </div>
      </div>

      {/* 2 · Proof: the one dark band on the page */}
      <Section label="Proof" tone="ink">
        <p className="eyebrow mb-10">The record so far</p>
        <NumberBand items={PROOF} />
      </Section>

      {/* 3 · The badge: image left, text right */}
      <Section id="badge">
        <Split
          flip
          media={
            <figure className="card-fill mx-auto w-full max-w-sm p-6 sm:p-8 lg:max-w-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/pcb_back_card.webp"
                alt="Back of the Falera Badge PCB, a KiCad render: the ESP32-S3 module, the OSHW mark, the microSD slot and USB-C"
                width={808}
                height={1218}
                loading="lazy"
                decoding="async"
                className="mx-auto h-auto max-h-[22rem] w-auto sm:max-h-[32rem]"
              />
            </figure>
          }
        >
          <SectionHeader
            eyebrow="The badge"
            title={<>The hardware, <em>all open.</em></>}
            lede="A 2.8″ touch screen, eight buttons, IR for line-of-sight quests, a motion sensor for shake and tilt, and a speaker, on a 4-layer board. The KiCad design, the bill of materials and the build notes are in the repo, so you can fork them and make your own."
          />
          <dl className="mt-10 border-t border-border">
            {SPECS.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-4 border-b border-border py-3.5">
                <dt className="label pt-0.5">{k}</dt>
                <dd className="text-[0.95rem] text-text">{v}</dd>
              </div>
            ))}
          </dl>
          <Onward href="/badge/">See the board in 3D</Onward>
        </Split>
      </Section>

      {/* 4 · Apps and the App Store: Lumi green, a bento of apps */}
      <Section id="apps" tone="green">
        <SectionHeader
          eyebrow="Apps and the App Store"
          title={<>Everything that ships, <em>and everything that streams in.</em></>}
          lede="Ten apps come on every badge. The on-device App Store installs ten more from GitHub at runtime: no laptop, no recompile."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href={`/apps/${STORE_APP.urlSlug}/`}
            className="card-link group flex flex-col gap-6 p-6 sm:col-span-2 lg:row-span-2"
          >
            <Screen src="/screens/store.webp" alt="The App Store on the badge's screen, listing Patakha, Racer, Flappy Lumi and Snake with Install buttons" />
            <span>
              <span className="label text-accent">Built in</span>
              <span className="mt-2 block font-display text-2xl leading-tight text-text group-hover:text-primary">{STORE_APP.name}</span>
              <span className="mt-2 block text-sm leading-relaxed text-text-dim">{STORE_APP.blurb}</span>
            </span>
          </Link>
          {SHOWCASE.map((app) => (
            <Link key={app.slug} href={`/apps/${app.urlSlug}/`} className="card-link group flex flex-col gap-4 p-5">
              <AppIcon app={app} />
              <span>
                <span className="block font-bold text-text group-hover:text-primary">{app.name}</span>
                <span className="mt-1 block text-sm leading-snug text-text-dim">{app.blurb}</span>
              </span>
            </Link>
          ))}
        </div>
        <Onward href="/apps/">See all 20 apps</Onward>
      </Section>

      {/* A press line */}
      <Section label="In the press" tight>
        <figure className="mx-auto max-w-4xl text-center">
          <blockquote className="font-serif text-[clamp(1.5rem,1.1rem+1.8vw,2.5rem)] italic leading-snug text-text">
            “OreoOS, a MicroPython-based operating system”
          </blockquote>
          <figcaption className="label mt-5">
            <a href="https://blog.adafruit.com/2026/11/04/oreoos-a-micropython-based-operating-system/" target="_blank" rel="noreferrer" className="hover:text-primary">
              Adafruit blog, 4 Nov 2026 <span aria-hidden="true">↗</span>
            </a>
            <span className="mx-2" aria-hidden="true">·</span>FaleraOS was called OreoOS until November 2026
          </figcaption>
        </figure>
      </Section>

      {/* 5 · Build for it: steps on a line */}
      <Section id="build">
        <SectionHeader
          eyebrow="Build for it"
          title={<>Build your own apps. <em>It&apos;s a manifest and a main.py.</em></>}
          lede={<>Apps are plain Python packages that FaleraOS loads at runtime. Fork the repo, drop your app in <code className="code">apps_market/</code> and open a pull request: the next person to refresh the store will see it.</>}
        />
        <Steps
          className="mt-12"
          steps={BUILD.map((b) => ({
            title: <Link href={b.href} className="hover:text-primary">{b.title} <span aria-hidden="true" className="text-accent">→</span></Link>,
            body: b.body,
          }))}
        />
        <Onward href="/docs/">Read the docs</Onward>
        <LumiTip align="right">The whole OS is MicroPython. Every line of it is on GitHub, so you can read how I work.</LumiTip>
      </Section>

      {/* 6 · RV565: the red area, with a video frame */}
      <Section id="rv565" tone="red">
        <Split
          media={
            <Screen
              src="/screens/bbb-frame.webp"
              alt="A frame of Big Buck Bunny as RV565 plays it: the big white rabbit in a green meadow"
              caption="Big Buck Bunny (CC BY 3.0, Blender Foundation), the paper's test film."
              className="mx-auto w-full max-w-lg"
            />
          }
        >
          <SectionHeader
            eyebrow="RV565 video"
            title={<>Video, <em>built for the hardware.</em></>}
            lede="RV565 is Elixpo's frame-independent video format for microcontroller displays: frames decode straight to the panel's own pixels. It plays the Gallery's videos on the badge, and ships for Arduino, ESP-IDF and Python."
          />
          <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4">
            <Stat value="24 FPS" label="on ESP32-S3, zero missed deadlines" />
            <Stat value="arXiv" label="the paper, 2610.35935 (cs.AR)" href="/paper/" />
          </div>
          <Onward href="/rv565/">Explore RV565</Onward>
        </Split>
      </Section>

      {/* 7 · Support */}
      <Section id="support">
        <Split
          flip
          media={
            <div className="grid gap-4">
              <div className="card-fill flex items-center gap-6 p-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/lumi-badge.webp" alt="Lumi the panda holding a Falera Badge" width={374} height={384}
                     loading="lazy" decoding="async" className="h-28 w-auto [image-rendering:pixelated]" />
                <p className="text-sm leading-relaxed text-text-dim">
                  Lumi, FaleraOS's panda, lives on the badge: feed her, play, put her to bed. The fundraiser builds the boards she runs on.
                </p>
              </div>
              <Card className="p-6 sm:p-8">
                <p className="eyebrow">Sponsors</p>
                <p className="h-card mt-3">Become a founding sponsor</p>
                <p className="mt-2 text-sm leading-relaxed text-text-dim">
                  Hardware makers, chip companies and developer-tool teams: help take Falera from five
                  hand-built boards to a factory batch. Write to{" "}
                  <span className="select-all font-mono text-text">hello@elixpo.com</span>.
                </p>
              </Card>
            </div>
          }
        >
          <SectionHeader
            eyebrow="Support"
            title={<>The first Falera PCBs <em>are being made now.</em></>}
            lede="Falera has no investor behind it. The first five boards were paid for out of pocket, and the community is funding the rest. Even ₹10 helps build them, and everyone who chips in is thanked by name."
          >
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={FUND_URL} target="_blank" rel="noreferrer" className="btn-accent">Fund the badge</a>
            </div>
          </SectionHeader>
          <Onward href="/supporters/">Meet our supporters</Onward>
        </Split>
      </Section>
    </>
  );
}
