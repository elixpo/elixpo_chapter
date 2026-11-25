import Link from "next/link";
import AppCard, { AppIcon } from "@/components/AppCard";
import { LumiTip } from "@/components/Lumi";
import { NextStep, PageHeader, Screen, Section, SectionHeader, Split } from "@/components/ui";
import { PRELOADED, ALL_APPS, STORE } from "@/data/apps";
import { GITHUB } from "@/lib/links";

/* /apps: the green area. A tinted header with the App Store on the badge's
 * screen, the preloaded apps beside the About screen, the system apps as
 * compact rows, and the App Store catalogue as cards. */

export default function AppsPage() {
  const more = ALL_APPS.filter((a) => !PRELOADED.find((p) => p.slug === a.slug));
  return (
    <>
      <PageHeader
        tone="green"
        eyebrow={`Apps · ${ALL_APPS.length + STORE.length} and counting`}
        title={<>Everything that ships, <em>and everything that streams in.</em></>}
        lede="The preloaded set lands on the badge at flash time. The store pulls fresh apps from GitHub at runtime — no laptop, no recompile, no developer mode toggle."
        aside={
          <Screen
            src="/screens/store.webp"
            alt="The App Store on the badge's screen, listing Patakha, Racer, Flappy Lumi and Snake with Install buttons"
            caption="The App Store, on the badge."
            className="hidden lg:block"
          />
        }
      >
        <Link href="/docs/apps/" className="btn-primary">Read the app-building docs</Link>
        <a href={`${GITHUB}/tree/main/apps_market`} target="_blank" rel="noreferrer" className="btn-ghost">
          Browse the catalogue on GitHub
        </a>
      </PageHeader>

      <Section id="preloaded">
        <Split
          flip
          media={
            <Screen
              src="/screens/about.webp"
              alt="The About app on the badge: FaleraOS v2.0.1, ESP32-S3, MicroPython 1.28 and free flash and memory"
              caption="About, one of the built-in apps."
              className="mx-auto w-full max-w-md"
            />
          }
        >
          <SectionHeader
            eyebrow="Preloaded"
            title={<>Built into <em>FaleraOS 2.0.</em></>}
            lede="Edit any of them locally."
          />
          <ul className="mt-8 grid gap-3">
            {PRELOADED.map((a) => <li key={a.slug} className="min-w-0"><AppCard app={a} /></li>)}
          </ul>
        </Split>
      </Section>

      <Section id="more" fill>
        <SectionHeader
          eyebrow="More on the badge"
          title={<>Settings, tools and games, <em>one drawer-tap away.</em></>}
        />
        <ul className="mt-10 grid gap-x-10 border-t border-border sm:grid-cols-2">
          {more.map((a) => (
            <li key={a.slug} className="min-w-0 border-b border-border">
              <Link href={`/apps/${a.urlSlug}/`} className="group flex items-center gap-4 py-4">
                <AppIcon app={a} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-text group-hover:text-primary">{a.name}</span>
                  <span className="block text-sm leading-snug text-text-dim">{a.blurb}</span>
                </span>
                <span aria-hidden="true" className="text-accent transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="store">
        <SectionHeader
          eyebrow="From the App Store"
          title={<>Install, update or remove, <em>on the badge.</em></>}
          lede={<>These live in <code className="code">apps_market/</code> on the repo; the badge&apos;s App Store installs them.</>}
        />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STORE.map((a) => <li key={a.slug} className="reveal min-w-0"><AppCard app={a} /></li>)}
        </ul>
        <LumiTip pose="pet">Psst, every app is one Python class: subclass oreoOS.App and the launcher finds it.</LumiTip>
      </Section>

      <NextStep
        title={<>Want one of these <em>on your own badge?</em></>}
        body="Set up a badge in about fifteen minutes with a USB-C cable and a computer."
        href="/get-started/"
        cta="Get started"
      />
    </>
  );
}
