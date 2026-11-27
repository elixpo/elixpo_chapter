import Link from "next/link";
import { LumiTip } from "@/components/Lumi";
import { Card, NextStep, PageHeader, Screen, Section, SectionHeader, Steps } from "@/components/ui";
import { GITHUB } from "@/lib/links";

const STEPS = [
  { n: "01", t: "Flash MicroPython",      b: "Download the ESP32-S3 build, hold the BOOT button, flash via esptool. Two-minute job." },
  { n: "02", t: "Clone the OS",            b: "`git clone https://github.com/elixpo/falera` and copy `.env.example` → `.env` with your WiFi credentials." },
  { n: "03", t: "Deploy",                  b: "`python tools/deploy.py` — pushes everything over USB, skips unchanged files, bumps the version." },
  { n: "04", t: "Install the falera CLI",  b: "Run the installer from the falera CLI docs (it checks the release's SHA-256 and installs with pipx or uv), then `falera` opens the full-screen view. To send photos and documents, open Tools > Transfer on the badge, run `falera send <files>` and type the code the badge shows." },
];

// `code` spans in the step text become <code>.
function withCode(text: string) {
  return text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith("`") ? <code key={i} className="code">{part.slice(1, -1)}</code> : part,
  );
}

const MORE = [
  { title: "falera CLI", body: "Install it, then every command: Transfer, Wi-Fi, apps, updates.", href: "/docs/cli/" },
  { title: "Connecting over USB", body: "Which port, permissions, and raw mpremote.", href: "/docs/usb/" },
  { title: "Repo", body: "Source, schematics, CHANGELOG.", href: GITHUB },
];

export default function GetStartedPage() {
  return (
    <>
      <PageHeader
        eyebrow="Get started · ~15 minutes · USB-C + a computer"
        title={<>From box to badge, <em>in four steps.</em></>}
        lede="The deploy script handles version bumps, hash-cache pruning, free-space guards, and secrets generation. You hold the BOOT button, you wait, you tap A."
      />

      <Section id="steps">
        <Steps steps={STEPS.map((st) => ({ title: st.t, body: <p>{withCode(st.b)}</p> }))} />
        <LumiTip pose="read" align="right">Stuck on a step? Run falera doctor first. It checks the cable, the port, the permissions and the firmware.</LumiTip>
      </Section>

      <Section id="first-boot" tone="green">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:gap-16">
          <div>
            <SectionHeader
              eyebrow="Then"
              title={<>Tap A, <em>and the home screen comes up.</em></>}
              lede="From there the falera CLI does the rest over the same cable: Wi-Fi, your profile, apps and FaleraOS updates."
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {MORE.map((m) => (
                <Card key={m.title} href={m.href} className="p-5">
                  <p className="h-card group-hover:text-primary">{m.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-text-dim">{m.body}</p>
                </Card>
              ))}
            </div>
          </div>
          <Screen
            src="/screens/home.webp"
            alt="The FaleraOS home screen on the badge: the time, 11:06, and the date, Sat 21 Nov 2026"
            caption="The FaleraOS home screen."
            className="mx-auto w-full max-w-md"
          />
        </div>
      </Section>

      <Section id="help" tone="red" tight>
        <div className="max-w-3xl">
          <p className="eyebrow">Need help?</p>
          <p className="mt-3 leading-relaxed text-text-body">
            Run <code className="code bg-card">falera doctor</code> first: it checks the cable, port, permissions and
            firmware and ends with next steps (see{" "}
            <Link href="/docs/cli/#troubleshooting" className="link">troubleshooting</Link>). Still stuck? Open an
            issue with its output and the console log from <code className="code bg-card">falera logs --restart</code>.
          </p>
        </div>
      </Section>

      <NextStep
        title={<>Now write <em>your own app.</em></>}
        body="Apps are plain Python packages: one manifest, one shim and a src/ tree."
        href="/docs/apps/"
        cta="Write an app"
      />
    </>
  );
}
