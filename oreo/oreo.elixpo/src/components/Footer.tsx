import Link from "next/link";

// One column row. `external` is optional; absent → internal Link.
type FooterLink = { label: string; href: string; external?: boolean };
type FooterColumn = { title: string; links: FooterLink[] };

const COLUMNS: FooterColumn[] = [
  {
    title: "Project",
    links: [
      { label: "Get Started", href: "/get-started/" },
      { label: "Badge",       href: "/badge/" },
      { label: "Apps",        href: "/apps/" },
      { label: "Docs",        href: "/docs/" },
      { label: "Hacks",       href: "/hacks/" },
      { label: "Contribute",  href: "/contribute/" },
      { label: "Upload",      href: "/upload/" },
    ],
  },
  {
    title: "Research",
    links: [
      { label: "RV565 Paper",        href: "/paper/" },
      { label: "Video Architecture", href: "/docs/video-architecture/" },
      { label: "Artifact (Zenodo)",  href: "https://doi.org/10.5281/zenodo.23543367", external: true },
      { label: "Elixpo Research",    href: "https://research.elixpo.com", external: true },
    ],
  },
  {
    title: "Source",
    links: [
      { label: "GitHub",          href: "https://github.com/elixpo/oreo", external: true },
      { label: "Issues",          href: "https://github.com/elixpo/oreo/issues", external: true },
      { label: "Changelog",       href: "https://github.com/elixpo/oreo/blob/main/CHANGELOG.md", external: true },
      { label: "Code of Conduct", href: "https://github.com/elixpo/oreo/blob/main/CODE_OF_CONDUCT.md", external: true },
      { label: "License",         href: "https://github.com/elixpo/oreo/blob/main/LICENSE", external: true },
    ],
  },
];

// Editorial footer in the Elixpo Research style: brand and tagline on the
// left, plain link columns on the right, one rule above.
export default function Footer() {
  return (
    <footer className="mt-32 border-t border-border">
      <div className="container-page grid gap-12 py-14 lg:grid-cols-[1.2fr_2fr]">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.ico" alt="" className="h-11 w-11 object-contain" loading="lazy" decoding="async" />
          <div>
            <strong className="text-base">OreoOS</strong>
            <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted">
              An open-source operating system for a pocket-sized badge.
              Open hardware, open firmware, open research.
            </p>
          </div>
        </div>

        <div className="grid gap-10 sm:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="eyebrow mb-4">{col.title}</p>
              <ul className="space-y-2.5 text-sm font-semibold">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {l.external ? (
                      <a href={l.href} target="_blank" rel="noreferrer" className="transition-opacity hover:opacity-55">
                        {l.label} ↗
                      </a>
                    ) : (
                      <Link href={l.href} className="transition-opacity hover:opacity-55">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="container-page flex flex-col justify-between gap-2 border-t border-border py-6
                      text-xs text-muted sm:flex-row">
        <p>© 2026 Elixpo · MIT (code) + trademark carve-out</p>
        <p>Built on MicroPython and ESP-IDF.</p>
      </div>
    </footer>
  );
}
