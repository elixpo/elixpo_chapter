export const runtime = 'edge';
// Must run in the edge runtime: the URL list comes from D1. The database rows are
// cached briefly in KV so crawler bursts do not repeat the same large queries.
// Publication mutations invalidate the shared key; five minutes is only the
// fallback window if a non-standard mutation path misses that invalidation.
export const dynamic = 'force-dynamic';

import { docsNavFlat } from '../src/config/docsNav';
import { PAID_PLANS_ENABLED } from '../lib/paidPlans';
import {
  loadPublicSitemapRows,
  publicBlogPath,
  sitemapTimestamp,
  SITEMAP_MAX_URLS,
  SITE_URL,
} from '../lib/sitemapData';

// Dynamic sitemap.
//
// This replaces a hand-written public/sitemap.xml that listed 5 static pages and no
// content at all, so no blog, profile or organization was ever discoverable through
// it. Search engines had to find posts by crawling links alone.
//
// Article eligibility (secret, private org, deleted, non-published) is owned by
// lib/indexability.js and applied to every blog-derived category in
// lib/sitemapData.js. Omit lastmod if the source has no timestamp; claiming "now"
// on every request makes the signal inaccurate and trains crawlers to ignore it.
function staticPages() {
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/explore`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.8 },
    ...(PAID_PLANS_ENABLED ? [{ url: `${SITE_URL}/pricing`, changeFrequency: 'monthly', priority: 0.8 }] : []),
    { url: `${SITE_URL}/docs`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/help`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/badges`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/contests`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    ...docsNavFlat.map((doc) => ({
      url: `${SITE_URL}/docs/${doc.slug}`,
      changeFrequency: 'monthly',
      priority: 0.5,
    })),
  ];
}

const enc = encodeURIComponent;

export default async function sitemap() {
  const staticEntries = staticPages();

  try {
    const rows = await loadPublicSitemapRows();

    const blogUrls = (rows.blogs || []).map((b) => {
      const path = publicBlogPath(b);
      if (!path) return null;
      return {
        url: `${SITE_URL}${path}`,
        lastModified: sitemapTimestamp(b.updated_at, b.published_at),
        changeFrequency: 'weekly',
        priority: 0.9,
      };
    }).filter(Boolean);

    const userUrls = (rows.users || []).map((u) => ({
      url: `${SITE_URL}/${enc(u.username)}`,
      lastModified: sitemapTimestamp(u.updated_at),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    const orgUrls = (rows.orgs || []).map((o) => ({
      url: `${SITE_URL}/${enc(o.slug)}`,
      lastModified: sitemapTimestamp(o.updated_at),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    const collectionUrls = (rows.collections || []).map((c) => ({
      url: `${SITE_URL}/${enc(c.oslug)}/${enc(c.cslug)}`,
      lastModified: sitemapTimestamp(c.updated_at),
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

    const curatedCollectionUrls = (rows.curatedCollections || []).map((c) => ({
      url: `${SITE_URL}/${enc(c.username)}/reads/${enc(c.cslug)}`,
      lastModified: sitemapTimestamp(c.updated_at),
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

    const tagUrls = (rows.tags || []).filter((row) => row.tag).map((row) => ({
      url: `${SITE_URL}/tag/${enc(row.tag.toLowerCase())}`,
      lastModified: sitemapTimestamp(row.updated_at),
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

    const contestUrls = (rows.contests || []).map((contest) => ({
      url: `${SITE_URL}/contests/${enc(contest.slug)}`,
      lastModified: sitemapTimestamp(contest.updated_at),
      changeFrequency: contest.status === 'completed' || contest.status === 'cancelled' ? 'monthly' : 'daily',
      priority: 0.7,
    }));

    // Concatenate in the existing category priority and keep the first 50,000
    // entries. At the ceiling the tail categories drop, never the reserved
    // article block.
    const seen = new Set();
    const entries = [];
    for (const entry of [
      ...staticEntries,
      ...blogUrls,
      ...userUrls,
      ...orgUrls,
      ...collectionUrls,
      ...curatedCollectionUrls,
      ...tagUrls,
      ...contestUrls,
    ]) {
      if (seen.has(entry.url)) continue;
      seen.add(entry.url);
      entries.push(entry);
    }
    return entries.slice(0, SITEMAP_MAX_URLS);
  } catch {
    // D1 unavailable (local dev, or a bad deploy): still serve the static pages
    // rather than a 500, which search engines treat as a broken sitemap.
    return staticEntries;
  }
}
