import Link from 'next/link';
import type { ReactNode } from 'react';
import { DOCS_SECTIONS, docsHref, docsNeighbours, getDocsSection } from '@/lib/docs-sections';
import CopyButton from './CopyButton';
import CopyLlmButton from './CopyLlmButton';

/*
 * Server-rendered building blocks for docs pages. Styling lives in
 * app/styles/docs.css; only CopyButton/CopyLlmButton hydrate.
 */

const REPO_URL = 'https://github.com/elixpo/elixpourl';

function sectionNumber(slug: string): string {
  return String(DOCS_SECTIONS.findIndex((s) => s.slug === slug) + 1).padStart(2, '0');
}

/** Article frame: header, body, prev/next built from lib/docs-sections.ts. */
export function DocPage({
  slug,
  title,
  lede,
  actions,
  children,
}: {
  slug: string;
  title: ReactNode;
  lede: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const section = getDocsSection(slug);
  const { prev, next } = docsNeighbours(slug);
  const source = `${REPO_URL}/blob/main/app/docs${slug ? `/${slug}` : ''}/page.tsx`;

  return (
    <article id="docs-content" className="doc-body">
      <header className="doc-header">
        <p className="doc-crumbs">
          {slug ? <Link href="/docs">Docs</Link> : <span>Docs</span>}
          <span aria-hidden="true">/</span>
          <span>{section.group}</span>
          <span aria-hidden="true">·</span>
          <span>{sectionNumber(slug)}</span>
        </p>
        <h1 className="doc-title">{title}</h1>
        <p className="doc-lede">{lede}</p>
        {actions && <div className="doc-header-actions">{actions}</div>}
      </header>

      {children}

      <nav className="doc-pager" aria-label="Previous and next sections">
        {prev && (
          <Link href={docsHref(prev.slug)} className="doc-card" data-dir="prev" rel="prev">
            <small>← Previous</small>
            <b>{prev.label}</b>
            {prev.summary}
          </Link>
        )}
        {next && (
          <Link href={docsHref(next.slug)} className="doc-card" data-dir="next" rel="next">
            <small>Next →</small>
            <b>{next.label}</b>
            {next.summary}
          </Link>
        )}
      </nav>

      <div className="doc-page-foot">
        <a href={source} target="_blank" rel="noopener noreferrer">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          Edit this page on GitHub<span className="doc-sr-status"> (opens in a new tab)</span>
        </a>
        <CopyLlmButton />
      </div>
    </article>
  );
}

/** Dark code sample with a caption bar and copy button. */
export function CodeBlock({ children, label = 'Example' }: { children: string; label?: string }) {
  return (
    <figure className="doc-code">
      <div className="doc-code-head">
        <figcaption>{label}</figcaption>
        <CopyButton text={children} srLabel={`Copy ${label}`} />
      </div>
      {/* tabIndex lets keyboard users scroll long lines horizontally. */}
      <pre tabIndex={0}>
        <code>{children}</code>
      </pre>
    </figure>
  );
}

const CALLOUT_ICON = {
  note: (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 11v6M12 7h.01" />
    </svg>
  ),
  warning: (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 7v6M12 17h.01" />
    </svg>
  ),
  soon: (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="12" cy="12" r="6" />
      <path d="M12 9v3l2 1" />
    </svg>
  ),
};

export function Callout({
  tone = 'note',
  title,
  children,
}: {
  tone?: 'note' | 'warning' | 'soon';
  title?: string;
  children: ReactNode;
}) {
  const heading = title ?? (tone === 'warning' ? 'Important' : tone === 'soon' ? 'Coming soon' : 'Note');
  return (
    <div className="doc-callout" data-tone={tone} role="note">
      <span className="doc-callout-icon">{CALLOUT_ICON[tone]}</span>
      <div>
        <p className="doc-callout-title">{heading}</p>
        <div>{children}</div>
      </div>
    </div>
  );
}

/**
 * Accessible table in a horizontally scrollable, focusable region.
 * `keyColumn` renders the first column in mono accent; `monoColumns` in mono ink.
 */
export function DocTable({
  caption,
  head,
  rows,
  keyColumn = true,
  monoColumns = [],
}: {
  caption: string;
  head: string[];
  rows: ReactNode[][];
  keyColumn?: boolean;
  monoColumns?: number[];
}) {
  return (
    <div className="doc-table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table className="doc-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={
                    c === 0 && keyColumn ? 'doc-cell-key' : monoColumns.includes(c) ? 'doc-cell-mono' : undefined
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Request/response field table used by the API reference. */
export function FieldTable({ caption, rows }: { caption: string; rows: Array<[string, string, string, ReactNode]> }) {
  return (
    <DocTable caption={caption} head={['Field', 'Type', 'Required', 'Description']} rows={rows} monoColumns={[1]} />
  );
}

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export function Endpoint({ method, path }: { method: Method; path: string }) {
  return (
    <p className="doc-endpoint">
      <span className="doc-method" data-method={method}>
        {method}
      </span>
      <code>{path}</code>
    </p>
  );
}

export function Facts({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="doc-facts">
      {items.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="doc-steps">{children}</ol>;
}

export function DocCards({ items }: { items: Array<{ href: string; title: string; body: ReactNode; kicker?: string }> }) {
  return (
    <ul className="doc-cards">
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="doc-card">
            {item.kicker && <small>{item.kicker}</small>}
            <b>
              {item.title}
              <span aria-hidden="true">→</span>
            </b>
            {item.body}
          </Link>
        </li>
      ))}
    </ul>
  );
}
