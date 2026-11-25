import Link from 'next/link';
import type { ReactNode } from 'react';

// Small presentational building blocks for the logged-in app shell
// (dashboard, profile, admin). Styles live in app/styles/app-shell.css.

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  back,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <>
      {back && (
        <Link href={back.href} className="back-link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {back.label}
        </Link>
      )}
      <header className="page-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="app-title">{title}</h1>
          {lede && <p className="page-header__lede">{lede}</p>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </header>
    </>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        {icon ?? <Icon.link />}
      </span>
      <p className="empty-state__title">{title}</p>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

const svgProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const Icon = {
  plus: () => (
    <svg {...svgProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  arrow: () => (
    <svg {...svgProps}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  ),
  download: () => (
    <svg {...svgProps}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  ),
  search: () => (
    <svg {...svgProps}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  link: () => (
    <svg {...svgProps} width={22} height={22}>
      <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" />
    </svg>
  ),
  key: () => (
    <svg {...svgProps} width={22} height={22}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M17 3l3 3M15 6l2 2" />
    </svg>
  ),
  globe: () => (
    <svg {...svgProps} width={22} height={22}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.6 5.6 3.6 9s-1.1 6.4-3.6 9M12 3C9.5 5.6 8.4 8.6 8.4 12s1.1 6.4 3.6 9" />
    </svg>
  ),
  shield: () => (
    <svg {...svgProps} width={22} height={22}>
      <path d="M12 3l7 2.6v5.2c0 4.7-3.1 7.8-7 9.2-3.9-1.4-7-4.5-7-9.2V5.6L12 3z" />
    </svg>
  ),
  copy: () => (
    <svg {...svgProps} width={14} height={14}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  ),
  check: () => (
    <svg {...svgProps} width={14} height={14}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  trash: () => (
    <svg {...svgProps} width={14} height={14}>
      <path d="M3 6h18M19 6l-1.4 14a2 2 0 01-2 2H8.4a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  ),
  external: () => (
    <svg {...svgProps} width={14} height={14}>
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
    </svg>
  ),
  info: () => (
    <svg {...svgProps} width={18} height={18}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </svg>
  ),
  alert: () => (
    <svg {...svgProps} width={18} height={18}>
      <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
};

/** Format a stored ISO timestamp as a short, locale-aware date. */
export function shortDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}
