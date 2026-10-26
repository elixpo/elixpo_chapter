'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const REPO_URL = 'https://github.com/elixpo/elixpourl';

const Icons = {
  qr: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1" />
      <rect x="12" y="2.5" width="5.5" height="5.5" rx="1" />
      <rect x="2.5" y="12" width="5.5" height="5.5" rx="1" />
      <path d="M12 12h2v2h3.5M12 17.5v-2h2" />
    </svg>
  ),
  about: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v5M10 6.25h.01" />
    </svg>
  ),
  pricing: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
      <path d="M3 7.5L9 2.5a2 2 0 012.6 0l5.4 4.5a2 2 0 01.7 1.5V16a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 011-1.5z" />
      <circle cx="10" cy="9" r="1.5" />
    </svg>
  ),
  docs: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
      <path d="M5 3h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path d="M6 7h6M6 10h6M6 13h4" />
    </svg>
  ),
  dashboard: (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
      <rect x="2.5" y="2.5" width="6.5" height="7.5" rx="1.5" />
      <rect x="11" y="2.5" width="6.5" height="4.5" rx="1.5" />
      <rect x="2.5" y="12.5" width="6.5" height="5" rx="1.5" />
      <rect x="11" y="9.5" width="6.5" height="8" rx="1.5" />
    </svg>
  ),
  menu: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
  close: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  github: (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  ),
};

const NAV = [
  { href: '/about', label: 'About', icon: Icons.about },
  { href: '/generate', label: 'QR Generator', icon: Icons.qr },
  { href: '/pricing', label: 'Pricing', icon: Icons.pricing },
  { href: '/docs', label: 'Docs', icon: Icons.docs },
];

export default function Navbar() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => setIsLoggedIn(res.ok))
      .catch(() => setIsLoggedIn(false));
  }, []);

  // Close the mobile menu on route change.
  useEffect(() => setMenuOpen(false), [pathname]);

  const links = [...NAV, ...(isLoggedIn ? [{ href: '/dashboard', label: 'Dashboard', icon: Icons.dashboard }] : [])];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const ctaHref = isLoggedIn ? '/dashboard' : '/api/auth/login';

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="sticky top-2 z-50 mx-auto mt-2 w-[min(calc(100%-1rem),1450px)] sm:top-3.5 sm:mt-3.5 sm:w-[min(calc(100%-2rem),1450px)]">
        <div className="flex min-h-[60px] items-center gap-3 rounded-full border border-[rgba(20,32,24,0.14)] bg-[rgba(251,251,248,0.9)] py-2 pl-4 pr-2 shadow-header backdrop-blur-[18px] sm:min-h-[72px] sm:pl-5 sm:pr-3">
          <Link href="/?noredirect=1" className="flex shrink-0 items-center gap-3 text-ink no-underline" aria-label="Lixrl home">
            <img src="/base_logo.png" alt="" width={34} height={34} className="h-[34px] w-[34px] rounded-full object-contain" />
            <span className="flex items-baseline gap-1.5">
              <b className="text-base tracking-tight">Lixrl</b>
              <small className="hidden text-[0.72rem] text-[#5f6962] sm:inline">by Elixpo</small>
            </span>
          </Link>

          <div className="flex-1" />

          <nav aria-label="Primary" className="hidden items-center gap-6 text-[0.78rem] font-semibold md:flex lg:gap-8">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href) ? 'page' : undefined}
                className={`relative py-2 no-underline transition-opacity hover:opacity-60 ${
                  isActive(l.href) ? 'text-ink after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:bg-ink' : 'text-ink/80'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-2 flex items-center gap-2">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View source on GitHub (opens in a new tab)"
              className="hidden h-11 w-11 items-center justify-center rounded-full border border-line text-ink no-underline transition-colors hover:bg-paper-deep sm:inline-flex"
            >
              {Icons.github}
            </a>

            <Link href={ctaHref} className="btn-primary hidden px-5 text-[0.78rem] sm:inline-flex">
              {isLoggedIn ? 'Dashboard' : 'Sign in'}
            </Link>

            <button
              type="button"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-line bg-white text-ink md:hidden"
            >
              {menuOpen ? Icons.close : Icons.menu}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav
            id="mobile-menu"
            aria-label="Mobile"
            className="mt-2 flex flex-col gap-1 rounded-[1.4rem] border border-line bg-[rgba(251,251,248,0.98)] p-3 shadow-header backdrop-blur-[18px] md:hidden"
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href) ? 'page' : undefined}
                className={`inline-flex min-h-[44px] items-center gap-3 rounded-full px-4 text-sm font-semibold no-underline transition-colors ${
                  isActive(l.href) ? 'bg-paper-deep text-ink' : 'text-ink hover:bg-paper-deep'
                }`}
              >
                <span aria-hidden="true" className={isActive(l.href) ? 'text-accent-deep' : 'text-[#5f6962]'}>
                  {l.icon}
                </span>
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center gap-2">
              <Link href={ctaHref} className="btn-primary flex-1">
                {isLoggedIn ? 'Open dashboard' : 'Sign in with Elixpo'}
              </Link>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View source on GitHub (opens in a new tab)"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink"
              >
                {Icons.github}
              </a>
            </div>
          </nav>
        )}
      </header>
    </>
  );
}
