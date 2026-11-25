import type { MetadataRoute } from 'next';
import { DOCS_SECTIONS, docsHref } from '@/lib/docs-sections';
import { absoluteUrl } from '@/lib/seo';

/**
 * Sitemap covers the public marketing + docs surface only. Dashboard,
 * profile, admin, login, and short-link redirects are intentionally NOT
 * listed — they require auth, vary per user, or exist only to redirect.
 *
 * Docs entries are generated from lib/docs-sections.ts, the same source the
 * docs sidebar and per-page metadata use.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const pages: {
    path: string;
    priority: number;
    changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;
  }[] = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' },
    { path: '/generate', priority: 0.95, changeFrequency: 'weekly' },
    { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/about', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  ];

  const staticRoutes: MetadataRoute.Sitemap = pages.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  const docsRoutes: MetadataRoute.Sitemap = DOCS_SECTIONS.map((section) => ({
    url: absoluteUrl(docsHref(section.slug)),
    lastModified: now,
    changeFrequency: section.changeFrequency,
    priority: section.priority,
  }));

  return [...staticRoutes, ...docsRoutes];
}
