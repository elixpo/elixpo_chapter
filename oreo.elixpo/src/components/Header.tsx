"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Github, Menu, Star, X } from "lucide-react";
import { useGithubStats } from "@/lib/useGithubStats";

const NAV = [
  { href: "/",             label: "Home" },
  { href: "/get-started/", label: "Get Started" },
  { href: "/badge/",       label: "Badge" },
  { href: "/apps/",        label: "Apps" },
  { href: "/docs/",        label: "Docs" },
  { href: "/paper/",       label: "Paper" },
  { href: "/rv565/convert/", label: "Convert" },
  { href: "/hacks/",       label: "Hacks" },
  { href: "/contribute/",  label: "Contribute" },
];

function fmtCount(n: number | null): string {
  if (n === null) return "–";
  if (n >= 10_000) return (n / 1000).toFixed(1) + "k";
  if (n >= 1000)   return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

// Floating pill header, following the Elixpo Research site: brand on the
// left, plain text navigation, and an ink GitHub pill on the right.
export default function Header() {
  const pathname = usePathname();
  const { stars } = useGithubStats();
  const [open, setOpen] = useState(false);

  // Close the mobile menu after navigating.
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  return (
    <header className="sticky top-3 z-40 mx-auto mt-3 w-[min(calc(100%-1.5rem),1510px)]">
      <div className="flex min-h-[64px] items-center justify-between gap-4 rounded-pill
                      border border-text/15 bg-bg/90 py-2 pl-4 pr-2
                      shadow-[0_18px_48px_rgba(20,32,24,0.09)] backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.ico" alt="" className="h-8 w-8 object-contain" loading="eager" decoding="async" />
          <span className="flex items-baseline gap-2">
            <b className="text-base">Oreo</b>
            <small className="hidden text-xs text-muted sm:inline">OreoOS · Elixpo</small>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-xs font-semibold lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={`transition-opacity hover:opacity-55 ${
                isActive(n.href) ? "underline decoration-primary decoration-2 underline-offset-[6px]" : ""
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="https://github.com/elixpo/oreo"
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-pill bg-text px-4 py-3
                       text-xs font-bold text-bg transition-opacity hover:opacity-85"
            title={stars !== null ? `${stars} stars` : "GitHub"}
          >
            <Github className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
            <span className="inline-flex items-center gap-1 opacity-75">
              <Star className="h-3 w-3" /> {fmtCount(stars)}
            </span>
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex h-11 w-11 items-center justify-center rounded-pill
                       border border-border lg:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="mt-2 grid gap-1 rounded-[1.4rem] border border-text/15 bg-bg/95 p-3
                        text-sm font-semibold shadow-[0_18px_48px_rgba(20,32,24,0.09)]
                        backdrop-blur-xl lg:hidden">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={`rounded-pill px-4 py-2.5 ${isActive(n.href) ? "bg-bg-raised" : "hover:bg-bg-raised"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
