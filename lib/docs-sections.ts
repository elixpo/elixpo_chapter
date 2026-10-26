import type { Metadata } from 'next';
import { buildMetadata } from './seo';

/**
 * Single source of truth for the docs surface. The docs sidebar
 * (app/docs/layout.tsx), the sitemap (app/sitemap.ts), and each docs page's
 * metadata are all generated from this array — add a section here and it
 * shows up everywhere. Pure data, safe to import from client components.
 */
export type DocsGroup = 'Get started' | 'Build' | 'Reference';

export interface DocsSection {
  /** URL slug under /docs. Empty string is the /docs overview. */
  slug: string;
  /** Sidebar label. */
  label: string;
  /** Sidebar group heading. Sections in one group must stay contiguous. */
  group: DocsGroup;
  /** One-line blurb for overview cards and prev/next navigation. */
  summary: string;
  /** <title> (templated as `%s | Lixrl`). */
  title: string;
  description: string;
  keywords: string[];
  priority: number;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
}

export const DOCS_SECTIONS: DocsSection[] = [
  {
    slug: '',
    label: 'Overview',
    group: 'Get started',
    summary: 'What Lixrl is, how sign-in works, and the API conventions.',
    title: 'Lixrl Docs — URL Shortener API, CLI & Analytics',
    description:
      'Documentation for Lixrl, the open URL shortener: shorten links with the REST API or CLI, read click analytics, manage API keys, branded subdomains, and webhooks.',
    keywords: ['url shortener documentation', 'url shortener api', 'link shortener docs', 'short link api'],
    priority: 0.9,
    changeFrequency: 'weekly',
  },
  {
    slug: 'quickstart',
    label: 'Quickstart',
    group: 'Get started',
    summary: 'Sign in, mint a key, and shorten your first URL in minutes.',
    title: 'Quickstart — Shorten Your First URL with the API',
    description:
      'Create an API key and shorten your first URL with the Lixrl URL shortener API in under a minute.',
    keywords: ['url shortener quickstart', 'shorten url api example', 'link shortener tutorial'],
    priority: 0.8,
    changeFrequency: 'monthly',
  },
  {
    slug: 'cli',
    label: 'Developer CLI',
    group: 'Get started',
    summary: 'Shorten links, export analytics, and generate QR codes from a terminal.',
    title: 'URL Shortener CLI and QR Code Generator — @elixpo/lixrl-cli',
    description:
      'Shorten URLs, generate QR codes, manage branded links, and export click analytics from your terminal with the free Lixrl CLI. Install with npm and sign in securely.',
    keywords: [
      'url shortener cli',
      'qr code generator cli',
      'command line url shortener',
      'link shortener terminal',
      'short link automation',
      'link analytics cli',
    ],
    priority: 0.85,
    changeFrequency: 'weekly',
  },
  {
    slug: 'api',
    label: 'Shortening API',
    group: 'Build',
    summary: 'Create, list, update, and delete short links over REST.',
    title: 'URL Shortener API — Create and Manage Short Links',
    description:
      'REST API reference for creating, listing, updating, and deleting short links with custom slugs, expiry, and bulk operations on Lixrl.',
    keywords: ['url shortener api', 'link shortener api', 'free url shortener api', 'short link rest api'],
    priority: 0.85,
    changeFrequency: 'weekly',
  },
  {
    slug: 'keys',
    label: 'API Keys',
    group: 'Build',
    summary: 'Create, scope, rotate, and revoke keys for programmatic access.',
    title: 'API Keys — Scoped Access for the Lixrl API',
    description: 'Create, scope, rotate, and revoke API keys for the Lixrl URL shortener API.',
    keywords: ['url shortener api key', 'api key scopes'],
    priority: 0.6,
    changeFrequency: 'monthly',
  },
  {
    slug: 'analytics',
    label: 'Click Analytics',
    group: 'Build',
    summary: 'Pull clicks, countries, devices, and referrers for any window.',
    title: 'Link Analytics — Click Tracking for Short Links',
    description:
      'Track clicks on short links and QR codes: totals, countries, referrers, devices, and browsers, with CSV export and no third-party scripts.',
    keywords: ['link analytics', 'click tracking', 'short link analytics', 'qr code scan tracking'],
    priority: 0.75,
    changeFrequency: 'monthly',
  },
  {
    slug: 'subdomains',
    label: 'Branded Subdomains',
    group: 'Build',
    summary: 'Publish links under your own name at brand.lixrl.com.',
    title: 'Branded Short Links with Custom Subdomains',
    description:
      'Claim a branded lixrl.com subdomain and publish custom short links under your own name.',
    keywords: ['branded short links', 'custom short links', 'custom subdomain url shortener'],
    priority: 0.7,
    changeFrequency: 'monthly',
  },
  {
    slug: 'webhooks',
    label: 'Webhooks',
    group: 'Build',
    summary: 'HTTP callbacks for link events. Coming on the Growth tier.',
    title: 'Webhooks — Real-Time Link Events',
    description: 'Get HTTP callbacks from Lixrl when short links are created, updated, or clicked.',
    keywords: ['url shortener webhooks', 'link click webhook'],
    priority: 0.5,
    changeFrequency: 'monthly',
  },
  {
    slug: 'errors',
    label: 'Error Reference',
    group: 'Reference',
    summary: 'Status codes, error bodies, and retry guidance.',
    title: 'API Error Reference',
    description: 'Error codes, HTTP statuses, and fixes for the Lixrl URL shortener API.',
    keywords: ['url shortener api errors'],
    priority: 0.4,
    changeFrequency: 'monthly',
  },
  {
    slug: 'self-hosting',
    label: 'Self-Hosting',
    group: 'Reference',
    summary: 'Run your own instance on Cloudflare Pages, D1, and KV.',
    title: 'Self-Host an Open Source URL Shortener on Cloudflare',
    description:
      'Deploy your own Lixrl instance — an open source URL shortener on Cloudflare Pages, D1, and KV.',
    keywords: ['self hosted url shortener', 'open source url shortener', 'cloudflare url shortener'],
    priority: 0.6,
    changeFrequency: 'monthly',
  },
];

export function docsHref(slug: string): string {
  return slug ? `/docs/${slug}` : '/docs';
}

/** Sidebar entries derived from DOCS_SECTIONS. */
export const DOCS_NAV = DOCS_SECTIONS.map((section) => ({
  label: section.label,
  href: docsHref(section.slug),
}));

/** Sidebar groups in DOCS_SECTIONS order. */
export const DOCS_GROUPS: Array<{ group: DocsGroup; sections: DocsSection[] }> =
  DOCS_SECTIONS.reduce<Array<{ group: DocsGroup; sections: DocsSection[] }>>((groups, section) => {
    const last = groups[groups.length - 1];
    if (last && last.group === section.group) last.sections.push(section);
    else groups.push({ group: section.group, sections: [section] });
    return groups;
  }, []);

/** Previous/next sections around `slug`, following DOCS_SECTIONS order. */
export function docsNeighbours(slug: string): { prev: DocsSection | null; next: DocsSection | null } {
  const index = DOCS_SECTIONS.findIndex((s) => s.slug === slug);
  if (index === -1) return { prev: null, next: null };
  return {
    prev: index > 0 ? DOCS_SECTIONS[index - 1] : null,
    next: index < DOCS_SECTIONS.length - 1 ? DOCS_SECTIONS[index + 1] : null,
  };
}

export function getDocsSection(slug: string): DocsSection {
  const section = DOCS_SECTIONS.find((s) => s.slug === slug);
  if (!section) throw new Error(`Unknown docs section: ${slug}`);
  return section;
}

/** Metadata for a docs page, generated from DOCS_SECTIONS. */
export function docsMetadata(slug: string): Metadata {
  const section = getDocsSection(slug);
  return buildMetadata({
    title: section.title,
    description: section.description,
    path: docsHref(section.slug),
    keywords: section.keywords,
    ogType: 'article',
  });
}
