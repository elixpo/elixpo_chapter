// RSS 2.0 rendering for /feed.xml. Pure and edge-safe so it can be tested
// without D1.
//
// Items are deliberately text-only: title, link, plain-text summary, author and
// date. No HTML, images, iframes or scripts are ever emitted, so a feed reader
// or aggregator (e.g. Planet Debian) loads nothing from us or any third party
// when it shows an entry: no tracking pixels by construction.

export const SITE_URL = 'https://blogs.elixpo.com';

// Accounts usernames plus legacy LixBlogs handles generated from display names,
// which may end in - or _. Only ever bound as a SQL parameter.
const AUTHOR_RE = /^[a-z0-9_-]{1,40}$/;
// Tags are stored lower-cased and free-form; bound the length and reject
// control characters. The value is only ever bound as a SQL parameter.
const TAG_INVALID_RE = /[\u0000-\u001f\u007f<>]/;

export function xml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Lower-cased username, or null when it cannot be a LixBlogs handle. */
export function normalizeFeedAuthor(value) {
  if (typeof value !== 'string') return null;
  const author = value.trim().replace(/^@/, '').toLowerCase();
  return AUTHOR_RE.test(author) ? author : null;
}

/** Lower-cased tag (optional leading #), or null when unusable. */
export function normalizeFeedTag(value) {
  if (typeof value !== 'string') return null;
  const tag = value.trim().replace(/^#/, '').toLowerCase();
  if (!tag || tag.length > 50 || TAG_INVALID_RE.test(tag)) return null;
  return tag;
}

/** Canonical feed URL: author before tag, so one filter has one URL. */
export function feedUrl({ author = null, tag = null } = {}) {
  const params = new URLSearchParams();
  if (author) params.set('author', author);
  if (tag) params.set('tag', tag);
  const query = params.toString();
  return `${SITE_URL}/feed.xml${query ? `?${query}` : ''}`;
}

export function blogUrl(blog) {
  const enc = encodeURIComponent;
  if (blog.collection_slug && blog.org_slug) {
    return `${SITE_URL}/${enc(blog.org_slug)}/${enc(blog.collection_slug)}/${enc(blog.slug)}`;
  }
  return `${SITE_URL}/${enc(blog.org_slug || blog.author_username)}/${enc(blog.slug)}`;
}

/**
 * @param {object} channel  { title, link, description, selfUrl }
 * @param {object[]} blogs  rows with slug, title, subtitle, excerpt, published_at,
 *   updated_at, author_username, author_name, org_slug, collection_slug
 */
export function renderRssFeed(channel, blogs) {
  const latest = blogs.reduce(
    (value, blog) => Math.max(value, Number(blog.updated_at || blog.published_at || 0)),
    0,
  ) || Math.floor(Date.now() / 1000);
  const items = blogs.map((blog) => {
    const url = blogUrl(blog);
    const author = blog.author_name || blog.author_username;
    return `<item>
  <title>${xml(blog.title || 'Untitled')}</title>
  <link>${xml(url)}</link>
  <guid isPermaLink="true">${xml(url)}</guid>
  <description>${xml(blog.subtitle || blog.excerpt || `A story by ${author} on LixBlogs.`)}</description>
  <dc:creator>${xml(author)}</dc:creator>
  <pubDate>${new Date((blog.published_at || latest) * 1000).toUTCString()}</pubDate>
</item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>${xml(channel.title)}</title>
  <link>${xml(channel.link)}</link>
  <description>${xml(channel.description)}</description>
  <language>en</language>
  <lastBuildDate>${new Date(latest * 1000).toUTCString()}</lastBuildDate>
  <atom:link href="${xml(channel.selfUrl)}" rel="self" type="application/rss+xml" />
  <atom:link href="https://pubsubhubbub.appspot.com/" rel="hub" />
${items}
</channel>
</rss>`;
}
