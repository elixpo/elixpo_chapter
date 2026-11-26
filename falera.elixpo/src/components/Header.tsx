"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FUND_URL, GITHUB } from "@/lib/links";
import { formatStars, useGithubStars } from "@/lib/useGithubStats";

const NAV: { href: string; label: string; love?: boolean }[] = [
  { href: "/badge/",       label: "Badge" },
  { href: "/apps/",        label: "Apps" },
  { href: "/get-started/", label: "Get started" },
  { href: "/rv565/",       label: "RV565" },
  { href: "/contribute/",  label: "Contribute" },
  { href: "/supporters/",  label: "Supporters", love: true },
];

// Everything else, in the "More" menu.
const MORE: { href: string; label: string; external?: boolean }[] = [
  { href: "/hacks/",                    label: "Badge hacks" },
  { href: "/docs/apps/",                label: "Write an app" },
  { href: "/docs/cli/",                 label: "falera CLI" },
  { href: "/docs/usb/",                 label: "Connect over USB" },
  { href: "/docs/transfer/",            label: "Transfer files" },
  { href: "/rv565/convert/",            label: "Video converter" },
  { href: "/docs/video-architecture/",  label: "Video architecture" },
  { href: "/paper/",                    label: "Research paper" },
  { href: "https://research.elixpo.com", label: "Elixpo Research", external: true },
];

// A small heart. In the header, the one on "Supporters" and the one on
// "Fund the badge" beat together when either is hovered or focused.
function Heart({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`love-heart h-3 w-3 shrink-0 ${className}`} aria-hidden="true">
      <path d="M8 14s-5.5-3.4-5.5-7.4A3 3 0 0 1 8 4.7a3 3 0 0 1 5.5 1.9C13.5 10.6 8 14 8 14z" fill="currentColor" />
    </svg>
  );
}

// Pages that live under another nav item.
const SECTION_OF: [string, string][] = [
  ["/hacks/", "/docs/"],
  ["/paper/", "/rv565/"],
  ["/docs/video-architecture/", "/rv565/"],
];

function GithubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

/* Sticky header: logo, the main routes, GitHub and "Fund the badge".
 * Below lg the routes fold into a <details> menu, which opens and closes
 * without JavaScript; the only script here marks the current page and
 * closes the menu after a navigation. */
export default function Header() {
  const pathname = usePathname() ?? "/";
  const stars = useGithubStars();
  const menu = useRef<HTMLDetailsElement>(null);
  const more = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (menu.current) menu.current.open = false;
    if (more.current) more.current.open = false;
  }, [pathname]);

  const section = SECTION_OF.find(([p]) => pathname.startsWith(p))?.[1];
  const current = (href: string) => pathname.startsWith(href) || section === href;

  return (
    <header className="site-header sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/85">
      <div className="container-page flex h-[var(--header-h)] items-center justify-between gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Falera, home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon-48x48.png" alt="" width={28} height={28} className="h-7 w-7" />
          <span className="flex items-baseline gap-2">
            <b className="text-[0.95rem] tracking-tight">Falera</b>
            <small className="hidden text-xs text-muted xl:inline">FaleraOS · Elixpo</small>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden xl:block">
          <ul className="flex items-center gap-6 text-[0.8125rem] font-semibold">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={current(n.href) ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 py-2 transition-colors hover:text-primary ${
                    current(n.href) ? "text-primary" : "text-text"
                  } ${n.love ? "love-link" : ""}`}
                >
                  {n.love && <Heart className="text-primary" />}
                  {n.label}
                </Link>
              </li>
            ))}
            <li>
              <details ref={more} className="group relative">
                <summary className="flex cursor-pointer list-none items-center gap-1 py-2 text-text hover:text-primary
                                    [&::-webkit-details-marker]:hidden">
                  More
                  <svg viewBox="0 0 12 12" className="h-3 w-3 transition-transform group-open:rotate-180" aria-hidden="true">
                    <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <ul className="card absolute right-0 top-full z-50 mt-2 w-60 p-2 text-[0.8125rem]">
                  {MORE.map((m) => (
                    <li key={m.href}>
                      {m.external ? (
                        <a href={m.href} target="_blank" rel="noreferrer"
                           className="flex items-center justify-between rounded-inner px-3 py-2 hover:bg-bg-raised hover:text-primary">
                          {m.label} <span aria-hidden="true">↗</span>
                        </a>
                      ) : (
                        <Link href={m.href} aria-current={pathname.startsWith(m.href) ? "page" : undefined}
                              className={`block rounded-inner px-3 py-2 hover:bg-bg-raised hover:text-primary ${
                                pathname.startsWith(m.href) ? "text-primary" : ""}`}>
                          {m.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
            aria-label={stars !== null ? `FaleraOS on GitHub, ${stars} stars` : "FaleraOS on GitHub"}
            className="hidden h-10 min-w-[6.75rem] items-center justify-center gap-2 rounded-pill bg-text px-4 text-[0.8125rem] font-bold text-bg transition-colors hover:bg-text/85 md:inline-flex"
          >
            <GithubIcon />
            {stars !== null ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true"><path d="M8 1.5l1.9 4 4.4.5-3.3 3 .9 4.3L8 11.2 4.1 13.3 5 9 1.7 6l4.4-.5z" fill="currentColor" /></svg>
                {formatStars(stars)}
              </span>
            ) : (
              <span>GitHub</span>
            )}
          </a>
          <Link
            href="/docs/"
            aria-current={pathname.startsWith("/docs/") && !section ? "page" : undefined}
            className={`hidden h-10 items-center rounded-pill border px-4 text-[0.8125rem] font-bold transition-colors hover:border-text sm:inline-flex ${
              current("/docs/") ? "border-primary text-primary" : "border-text/60 text-text"
            }`}
          >
            Docs
          </Link>
          <a
            href={FUND_URL}
            target="_blank"
            rel="noreferrer"
            className="love-link btn-accent min-h-[44px] flex-col gap-0 px-4 py-1 leading-tight"
            aria-label="Fund the badge, from $0.11"
          >
            <span className="inline-flex items-center gap-1.5 text-[0.8125rem]"><Heart /> Fund the badge</span>
            <span className="text-[0.6875rem] font-semibold opacity-90">from $0.11 (₹10)</span>
          </a>

          <details ref={menu} className="group relative xl:hidden">
            <summary
              className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-pill border border-border
                         [&::-webkit-details-marker]:hidden"
              aria-label="Menu"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4 group-open:hidden" aria-hidden="true">
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
              <svg viewBox="0 0 20 20" className="hidden h-4 w-4 group-open:block" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </summary>
            <nav
              aria-label="Main"
              className="fixed inset-x-0 top-[var(--header-h)] max-h-[calc(100dvh-var(--header-h))] overflow-y-auto
                         border-b border-border bg-bg"
            >
              <ul className="container-page grid gap-1 py-4 text-base font-semibold">
                <li>
                  <Link href="/" aria-current={pathname === "/" ? "page" : undefined}
                        className={`block rounded-inner px-3 py-3 hover:bg-bg-raised ${pathname === "/" ? "text-primary" : ""}`}>
                    Home
                  </Link>
                </li>
                {[...NAV.slice(0, 3), { href: "/docs/", label: "Docs" }, ...NAV.slice(3)].map((n) => (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      aria-current={current(n.href) ? "page" : undefined}
                      className={`flex items-center gap-2 rounded-inner px-3 py-3 hover:bg-bg-raised ${current(n.href) ? "text-primary" : ""}`}
                    >
                      {"love" in n && n.love && <Heart className="text-primary" />}
                      {n.label}
                    </Link>
                  </li>
                ))}
                <li className="mt-2 border-t border-border px-3 pb-1 pt-4 font-mono text-xs uppercase tracking-[0.12em] text-muted">More</li>
                {MORE.map((m) => (
                  <li key={m.href}>
                    {m.external ? (
                      <a href={m.href} target="_blank" rel="noreferrer"
                         className="flex items-center gap-2 rounded-inner px-3 py-3 hover:bg-bg-raised">
                        {m.label} <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <Link href={m.href} className={`block rounded-inner px-3 py-3 hover:bg-bg-raised ${
                        pathname.startsWith(m.href) ? "text-primary" : ""}`}>
                        {m.label}
                      </Link>
                    )}
                  </li>
                ))}
                <li className="mt-2 border-t border-border pt-3">
                  <a href={GITHUB} target="_blank" rel="noreferrer"
                     className="flex items-center gap-2 rounded-inner px-3 py-3 hover:bg-bg-raised">
                    <GithubIcon /> GitHub <span aria-hidden="true">↗</span>
                  </a>
                </li>
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
