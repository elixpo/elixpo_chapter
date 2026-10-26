'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { User } from '@/lib/types';

function getAvatarUrl(user: User): string {
  if (user.avatar_url) return user.avatar_url;
  return `https://accounts.elixpo.com/api/avatar/${user.elixpo_id}`;
}

// SVG Icons
const Icons = {
  dashboard: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <rect x="2" y="2" width="7" height="8" rx="1.5" />
      <rect x="11" y="2" width="7" height="5" rx="1.5" />
      <rect x="2" y="12" width="7" height="6" rx="1.5" />
      <rect x="11" y="9" width="7" height="9" rx="1.5" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M8.5 11.5a4 4 0 005.5 0l2.5-2.5a4 4 0 00-5.5-5.5L9.5 5" />
      <path d="M11.5 8.5a4 4 0 00-5.5 0L3.5 11a4 4 0 005.5 5.5l1.5-1.5" />
    </svg>
  ),
  domain: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M2.5 10h15M10 2.5c2 2.1 3 4.6 3 7.5s-1 5.4-3 7.5M10 2.5C8 4.6 7 7.1 7 10s1 5.4 3 7.5" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-[18px] h-[18px]">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 7v6M7 10h6" />
    </svg>
  ),
  qr: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1" />
      <rect x="12" y="2.5" width="5.5" height="5.5" rx="1" />
      <rect x="2.5" y="12" width="5.5" height="5.5" rx="1" />
      <path d="M12 12h2v2h3.5M12 17.5v-2h2" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <circle cx="10" cy="7" r="3.5" />
      <path d="M3.5 17.5c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6" />
    </svg>
  ),
  key: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <circle cx="7.5" cy="12.5" r="3.5" />
      <path d="M10.2 9.8L16 4M14 4l2 2M12.5 6.5l2 2" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M7 17H4a1 1 0 01-1-1V4a1 1 0 011-1h3M13 14l4-4-4-4M17 10H7" />
    </svg>
  ),
  monitor: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <rect x="2" y="3" width="16" height="11" rx="2" />
      <path d="M7 17h6M10 14v3" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <circle cx="7" cy="7" r="3" />
      <circle cx="14" cy="8" r="2.5" />
      <path d="M1.5 17c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
      <path d="M13 12c2 0 4 1.5 4 4" />
    </svg>
  ),
  audit: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M5 3h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path d="M6 7h8M6 10h8M6 13h4" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <path d="M6 8l4 4 4-4" />
    </svg>
  ),
  billing: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <rect x="2" y="4.5" width="16" height="11" rx="2" />
      <path d="M2 8h16M5 12.5h3" />
    </svg>
  ),
  sparkle: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M10 2.5l1.6 4.3 4.4 1.7-4.4 1.7L10 14.5l-1.6-4.3L4 8.5l4.4-1.7L10 2.5z" />
    </svg>
  ),
  docs: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M5 3h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path d="M6 7h6M6 10h6M6 13h4" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M10 2.5l6 2.2v4.3c0 4-2.7 6.6-6 8-3.3-1.4-6-4-6-8V4.7l6-2.2z" />
    </svg>
  ),
};

const navItems = [
  { href: '/dashboard', label: 'Dashboard', short: 'Home', icon: Icons.dashboard },
  { href: '/dashboard/urls', label: 'My URLs', short: 'Links', icon: Icons.link },
  { href: '/dashboard/new', label: 'Shorten URL', short: 'New', icon: Icons.plus },
  { href: '/generate', label: 'QR Generator', short: 'QR', icon: Icons.qr },
  { href: '/dashboard/domains', label: 'Subdomains', short: 'Domains', icon: Icons.domain },
];

const accountItems = [
  { href: '/dashboard/subscription', label: 'Subscription & billing', icon: Icons.billing },
  { href: '/profile', label: 'Profile', icon: Icons.user },
  { href: '/profile/keys', label: 'API Keys', icon: Icons.key },
];

// Secondary links shown lower in the dropdown.
const resourceItems = [
  { href: '/generate', label: 'Generate QR code', icon: Icons.qr },
  { href: '/pricing', label: 'Plans & pricing', icon: Icons.sparkle },
  { href: '/docs', label: 'Docs', icon: Icons.docs },
];

export default function Sidebar({ user }: { user: User }) {
  const pathname = usePathname();
  const avatarUrl = getAvatarUrl(user);
  const [accountOpen, setAccountOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const isActive = (href: string) => {
    if (href === '/dashboard' || href === '/profile') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  };

  // Close dropdown on outside click or Escape.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAccountOpen((open) => {
          if (open) triggerRef.current?.focus();
          return false;
        });
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // Icon + text on lg; icon-only (with a native tooltip) from 900px to lg.
  const NavPill = ({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) => (
    <Link
      href={href}
      title={label}
      aria-current={isActive(href) ? 'page' : undefined}
      className={`group flex h-10 min-w-10 items-center justify-center gap-2 rounded-full px-2.5 no-underline transition-colors duration-200 lg:px-3.5 ${
        isActive(href)
          ? 'bg-paper-deep font-semibold text-ink'
          : 'text-[#3d4842] hover:bg-paper-deep hover:text-ink'
      }`}
    >
      <span aria-hidden="true" className={isActive(href) ? 'text-accent-deep' : 'opacity-70 group-hover:opacity-100'}>
        {icon}
      </span>
      <span className="sr-only lg:not-sr-only lg:text-[0.8rem] lg:font-semibold">{label}</span>
    </Link>
  );

  const close = () => setAccountOpen(false);

  return (
    <>
      <header className="fixed left-1/2 top-2 z-30 flex h-[60px] w-[min(calc(100%-1rem),1450px)] -translate-x-1/2 items-center justify-between gap-2 rounded-full border border-[rgba(20,32,24,0.14)] bg-[rgba(251,251,248,0.92)] pl-4 pr-2 shadow-header backdrop-blur-[18px] sm:top-3.5 sm:h-[68px] sm:w-[min(calc(100%-2rem),1450px)] sm:pl-5 sm:pr-3">
        <Link href="/?noredirect=1" aria-label="Lixrl home" className="flex shrink-0 items-center gap-3 text-ink no-underline">
          <Image src="/base_logo.png" alt="" width={32} height={32} className="h-8 w-8 rounded-full object-contain" />
          <span className="flex items-baseline gap-1.5">
            <b className="text-base tracking-tight">Lixrl</b>
            <small className="hidden font-mono text-[0.62rem] uppercase tracking-[0.16em] text-[#5f6962] sm:inline">App</small>
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {/* Primary nav — on phones and tablets this moves to the bottom tab bar. */}
          <nav aria-label="Dashboard" className="hidden items-center gap-1 min-[900px]:flex">
            {navItems.map((item) => (
              <NavPill key={item.href} href={item.href} label={item.label} icon={item.icon} />
            ))}
            <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
            <NavPill href="/docs" label="Docs" icon={Icons.docs} />
            <span aria-hidden="true" className="ml-1 h-6 w-px bg-line sm:ml-2" />
          </nav>

          <div className="relative" ref={dropdownRef}>
            <button
              ref={triggerRef}
              type="button"
              aria-label={`Account menu for ${user.display_name}`}
              aria-haspopup="true"
              aria-expanded={accountOpen}
              aria-controls="account-menu"
              onClick={() => setAccountOpen(!accountOpen)}
              className="group flex cursor-pointer items-center gap-2.5 rounded-full border-none bg-transparent p-1 transition-colors duration-200 hover:bg-paper-deep lg:pl-1.5 lg:pr-2.5"
            >
              <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-line">
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              </span>
              <span className="hidden min-w-0 max-w-[160px] flex-col items-start leading-tight lg:flex">
                <span className="w-full truncate text-sm font-semibold text-ink">{user.display_name}</span>
                <span className="w-full truncate text-[0.68rem] text-[#5f6962]">{user.email}</span>
              </span>
              <span aria-hidden="true" className={`hidden text-[#5f6962] transition-transform duration-200 lg:block ${accountOpen ? 'rotate-180' : ''}`}>
                {Icons.chevron}
              </span>
            </button>

            {accountOpen && (
              <div id="account-menu" className="app-menu">
                {/* Identity + current plan */}
                <div className="border-b border-line bg-paper-soft px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-line">
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{user.display_name}</span>
                      <span className="block truncate text-[0.72rem] text-[#5f6962]">{user.email}</span>
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="kicker">Current plan</span>
                    <span className="pill pill--blue">{user.tier}</span>
                  </div>
                </div>

                {/* Upgrade CTA — only when there's headroom to sell into. */}
                {user.tier === 'free' && (
                  <div className="border-b border-line p-2">
                    <Link
                      href="/pricing"
                      onClick={close}
                      className="menu-cta"
                    >
                      <span aria-hidden="true">{Icons.sparkle}</span>
                      Upgrade to Pro
                    </Link>
                  </div>
                )}

                <nav aria-label="Account" className="py-1.5">
                  {accountItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={close}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                    >
                      <span aria-hidden="true">{item.icon}</span>
                      {item.label}
                    </Link>
                  ))}
                </nav>

                <nav aria-label="Resources" className="border-t border-line py-1.5">
                  {resourceItems.map((item) => (
                    <Link key={item.href + item.label} href={item.href} onClick={close}>
                      <span aria-hidden="true">{item.icon}</span>
                      {item.label}
                    </Link>
                  ))}
                </nav>

                <div className="border-t border-line py-1.5">
                  <button type="button" onClick={handleLogout} className="menu-item menu-item--danger">
                    <span aria-hidden="true">{Icons.logout}</span>
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile / tablet primary navigation. */}
      <nav aria-label="Dashboard" className="app-tabbar">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? 'page' : undefined}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.short}
          </Link>
        ))}
      </nav>
    </>
  );
}
