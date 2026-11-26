import Link from "next/link";
import { Bow } from "@/components/ui";
import { LumiWave } from "@/components/Lumi";

type FooterLink = { label: string; href: string; external?: boolean };
type FooterColumn = { title: string; links: FooterLink[] };

const COLUMNS: FooterColumn[] = [
  {
    title: "Falera",
    links: [
      { label: "Badge",       href: "/badge/" },
      { label: "Apps",        href: "/apps/" },
      { label: "Get started", href: "/get-started/" },
      { label: "Hacks",       href: "/hacks/" },
      { label: "Supporters",  href: "/supporters/" },
    ],
  },
  {
    title: "Build",
    links: [
      { label: "Docs",            href: "/docs/" },
      { label: "falera CLI",      href: "/docs/cli/" },
      { label: "Write an app",    href: "/docs/apps/" },
      { label: "Transfer files",  href: "/docs/transfer/" },
      { label: "Connect over USB", href: "/docs/usb/" },
      { label: "Contribute",      href: "/contribute/" },
    ],
  },
  {
    title: "RV565",
    links: [
      { label: "Overview",           href: "/rv565/" },
      { label: "Video converter",    href: "/rv565/convert/" },
      { label: "Research paper",     href: "/paper/" },
      { label: "Video architecture", href: "/docs/video-architecture/" },
      { label: "Artifact (Zenodo)",  href: "https://doi.org/10.5281/zenodo.23543367", external: true },
      { label: "Elixpo Research",    href: "https://research.elixpo.com", external: true },
    ],
  },
  {
    title: "Source",
    links: [
      { label: "Fund the badge",  href: "https://payouts.elixpo.com/f/falera-badge", external: true },
      { label: "GitHub",          href: "https://github.com/elixpo/falera", external: true },
      { label: "Issues",          href: "https://github.com/elixpo/falera/issues", external: true },
      { label: "Changelog",       href: "https://github.com/elixpo/falera/blob/main/CHANGELOG.md", external: true },
      { label: "Code of Conduct", href: "https://github.com/elixpo/falera/blob/main/CODE_OF_CONDUCT.md", external: true },
      { label: "License",         href: "https://github.com/elixpo/falera/blob/main/LICENSE", external: true },
    ],
  },
];

const linkClass = "text-text-dim transition-colors hover:text-primary";

// Research-style footer: brand on the left, plain link columns, a rule,
// then the legal lines. Text only: no logos besides the Falera mark.
export default function Footer() {
  return (
    <footer className="border-t border-border bg-bg">
      <div className="container-page grid gap-12 py-14 sm:py-16 lg:grid-cols-[1fr_2.4fr]">
        <div className="max-w-xs">
          <Link href="/" className="inline-flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon-48x48.png" alt="" width={32} height={32} className="h-8 w-8" loading="lazy" decoding="async" />
            <strong className="text-base">FaleraOS</strong>
          </Link>
          <p className="mt-4 text-sm leading-relaxed text-text-dim">
            An open-source operating system for a pocket-sized badge.
            Open hardware, open firmware, open research.
          </p>
          <div className="mt-6"><LumiWave /></div>
          <p className="mt-5">
            <a href="https://certification.oshwa.org/in000107.html" target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-2 text-sm font-semibold text-text hover:text-primary">
              <Bow className="h-2.5 w-4" />
              <span>OSHWA certified · <span className="font-mono">IN000107</span> <span aria-hidden="true">↗</span></span>
            </a>
          </p>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="label mb-4">{col.title}</p>
              <ul className="space-y-2.5 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {l.external ? (
                      <a href={l.href} target="_blank" rel="noreferrer" className={linkClass}>
                        {l.label} <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <Link href={l.href} className={linkClass}>{l.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-2 py-6 text-xs leading-relaxed text-muted md:flex-row md:justify-between">
          <p>© 2026 Elixpo · Udyam-registered MSME · UDYAM-WB-07-0152337</p>
          <p>Code MIT · hardware CERN-OHL-P-2.0 · built on MicroPython and ESP-IDF</p>
        </div>
        <p className="container-page pb-8 text-xs leading-relaxed text-muted">
          FaleraOS is an open-source MicroPython operating system for the Elixpo Falera Badge. It is not
          related to Android 8.0 Oreo or to OREO® cookies, a trademark of Mondelēz International.
        </p>
      </div>
    </footer>
  );
}
