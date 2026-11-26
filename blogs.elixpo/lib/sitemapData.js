// Shared producer for the root sitemap and the article-only feed. The row
// object is cached in KV as one named entry so both surfaces read the same
// eligibility-filtered snapshot.

import { kvCache, PUBLIC_SITEMAP_CACHE_KEY } from './cache';
import { indexableBlogSql } from './indexability';

export const SITE_URL = 'https://blogs.elixpo.com';

// Room for substantially more individually indexed posts while the complete
// root sitemap stays under the protocol's 50,000 URL ceiling.
export const SITEMAP_ARTICLE_LIMIT = 38000;
export const SITEMAP_MAX_URLS = 50000;

const INDEXABLE_BLOG = indexableBlogSql();

// Every blog-derived selection applies the shared predicate. A dangling or
// unknown publication reference therefore never falls through as personal, and
// organization collections only appear under the organization the article was
// actually published to.
export async function fetchPublicSitemapRows(db) {
  const [blogs, users, orgs, collections, curatedCollections, tags, contests] = await Promise.all([
    db.prepare(`
      SELECT b.slug, b.updated_at, b.published_at, b.published_as,
             au.username AS author_username, o.slug AS org_slug, col.slug AS collection_slug
      FROM blogs b
      JOIN users au ON au.id = b.author_id
      LEFT JOIN orgs o ON b.published_as LIKE 'org:%' AND o.id = substr(b.published_as, 5)
      LEFT JOIN collections col ON col.id = b.collection_id AND col.org_id = o.id
      WHERE ${INDEXABLE_BLOG}
      ORDER BY b.published_at DESC, b.id DESC
      LIMIT ${SITEMAP_ARTICLE_LIMIT}
    `).all(),
    db.prepare(`
      SELECT u.username, u.updated_at FROM users u
      WHERE u.username IS NOT NULL AND EXISTS (
        SELECT 1 FROM blogs b
        LEFT JOIN orgs o ON b.published_as LIKE 'org:%' AND o.id = substr(b.published_as, 5)
        WHERE b.author_id = u.id AND ${INDEXABLE_BLOG}
      )
      ORDER BY u.username ASC LIMIT 4000
    `).all(),
    db.prepare(`
      SELECT o.slug, o.updated_at FROM orgs o
      WHERE LOWER(COALESCE(o.visibility, 'public')) != 'private' AND EXISTS (
        SELECT 1 FROM blogs b
        WHERE b.published_as = ('org:' || o.id) AND ${INDEXABLE_BLOG}
      )
      ORDER BY o.slug ASC LIMIT 2000
    `).all(),
    db.prepare(`
      SELECT c.slug AS cslug, o.slug AS oslug, MAX(b.updated_at) AS updated_at
      FROM collections c
      JOIN orgs o ON o.id = c.org_id
      JOIN blogs b ON b.collection_id = c.id
      WHERE LOWER(COALESCE(o.visibility, 'public')) != 'private'
        AND b.published_as = ('org:' || o.id) AND ${INDEXABLE_BLOG}
      GROUP BY c.id, c.slug, o.slug
      ORDER BY o.slug ASC, c.slug ASC LIMIT 2000
    `).all(),
    db.prepare(`
      SELECT bc.slug AS cslug, u.username, bc.updated_at
      FROM bookmark_collections bc
      JOIN users u ON u.id = bc.user_id
      JOIN curated_collection_entries ce ON ce.collection_id = bc.id
      JOIN blogs b ON b.id = ce.blog_id
      LEFT JOIN orgs o ON b.published_as LIKE 'org:%' AND o.id = substr(b.published_as, 5)
      WHERE bc.visibility = 'public' AND ${INDEXABLE_BLOG}
      GROUP BY bc.id, bc.slug, u.username, bc.updated_at
      ORDER BY LOWER(u.username) ASC, bc.slug ASC LIMIT 2000
    `).all(),
    db.prepare(`
      SELECT MIN(bt.tag) AS tag, MAX(b.updated_at) AS updated_at
      FROM blog_tags bt
      JOIN blogs b ON b.id = bt.blog_id
      LEFT JOIN orgs o ON b.published_as LIKE 'org:%' AND o.id = substr(b.published_as, 5)
      WHERE ${INDEXABLE_BLOG}
      GROUP BY LOWER(bt.tag)
      ORDER BY LOWER(bt.tag) ASC LIMIT 2000
    `).all(),
    db.prepare(`
      SELECT slug, status, updated_at FROM contests
      WHERE status != 'draft'
      ORDER BY starts_at DESC, slug ASC LIMIT 2000
    `).all(),
  ]);

  const results = { blogs, users, orgs, collections, curatedCollections, tags, contests };
  // A failed query must not become a cacheable empty sitemap snapshot.
  for (const result of Object.values(results)) {
    if (result?.success === false || !Array.isArray(result?.results)) {
      throw new Error('Sitemap query failed');
    }
  }
  return Object.fromEntries(Object.entries(results).map(([name, result]) => [name, result.results]));
}

// The D1 accessor is resolved inside the fetcher so a valid cache hit does not
// require a live database.
export function loadPublicSitemapRows() {
  return kvCache(PUBLIC_SITEMAP_CACHE_KEY, 300, async () => {
    const { getDB } = await import('./cloudflare');
    return fetchPublicSitemapRows(getDB());
  });
}

// Canonical encoded article path. Unknown publication targets return null rather
// than a personal URL, so an unresolved org reference can never be published as
// the author's own post.
export function publicBlogPath(row) {
  if (!row || !row.slug) return null;
  const publishedAs = row.published_as;
  const personal = publishedAs === null || publishedAs === undefined || publishedAs === 'personal';
  const organization = typeof publishedAs === 'string' && publishedAs.startsWith('org:');

  const parts = [];
  if (organization) {
    if (!row.org_slug) return null;
    parts.push(row.org_slug);
    if (row.collection_slug) parts.push(row.collection_slug);
  } else if (personal) {
    if (!row.author_username) return null;
    parts.push(row.author_username);
  } else {
    return null;
  }
  parts.push(row.slug);
  return `/${parts.map((part) => encodeURIComponent(part)).join('/')}`;
}

// Actual timestamp only. Absent, zero, negative, non-numeric and out-of-range
// values are omitted rather than replaced with a manufactured "now".
export function sitemapTimestamp(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime())) continue;
    return date;
  }
  return undefined;
}
