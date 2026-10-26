'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { DOCS_GROUPS, DOCS_SECTIONS, docsHref } from '@/lib/docs-sections';

const SearchIcon = (
  <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

function SectionList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const inputId = useId();
  const q = query.trim().toLowerCase();

  const groups = useMemo(
    () =>
      DOCS_GROUPS.map(({ group, sections }) => ({
        group,
        sections: q
          ? sections.filter(
              (s) => s.label.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q),
            )
          : sections,
      })).filter((g) => g.sections.length > 0),
    [q],
  );

  return (
    <>
      <div className="docs-search" role="search">
        <label htmlFor={inputId} className="doc-sr-status">
          Filter documentation sections
        </label>
        {SearchIcon}
        <input
          id={inputId}
          type="search"
          placeholder="Filter sections"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>
      {groups.map(({ group, sections }) => (
        <div key={group} className="docs-nav-group">
          <p className="docs-label">{group}</p>
          <ul>
            {sections.map((s) => {
              const href = docsHref(s.slug);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={pathname === href ? 'page' : undefined}
                    className="docs-nav-link"
                  >
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {groups.length === 0 && <p className="docs-nav-empty">No sections match “{query}”.</p>}
    </>
  );
}

/** Desktop rail (≥1024px). */
export function DocsRail() {
  return (
    <nav aria-label="Documentation" className="docs-rail">
      <SectionList />
    </nav>
  );
}

/** Collapsible section picker shown above the article below 1024px. */
export function DocsMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = DOCS_SECTIONS.find((s) => docsHref(s.slug) === pathname);

  return (
    <details
      className="docs-mobile-nav"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <span>
          <small>Documentation</small>
          {current?.label ?? 'Browse sections'}
        </span>
        <svg className="docs-chevron" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <nav aria-label="Documentation" className="docs-mobile-nav-body">
        <SectionList onNavigate={() => setOpen(false)} />
      </nav>
    </details>
  );
}
