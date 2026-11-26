export const runtime = 'edge';

import { getDB } from '../../lib/cloudflare';
import { indexableBlogSql } from '../../lib/indexability';
import {
  SITE_URL,
  feedUrl,
  normalizeFeedAuthor,
  normalizeFeedTag,
  renderRssFeed,
} from '../../lib/rssFeed';

// GET /feed.xml                       — recent stories across LixBlogs
// GET /feed.xml?author=<username>     — one writer's stories (e.g. for Planet Debian)
// GET /feed.xml?tag=<tag>             — stories with a tag
// GET /feed.xml?author=<u>&tag=<t>    — one writer's stories with a tag
//
// Only posts that are publicly indexable are listed (lib/indexability.js):
// never drafts, unlisted, trashed, private-org or secret posts. Secret posts are
// anonymous, so they must never appear in a per-author feed.
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const rawAuthor = params.get('author');
  const rawTag = params.get('tag');
  const author = rawAuthor === null ? null : normalizeFeedAuthor(rawAuthor);
  const tag = rawTag === null ? null : normalizeFeedTag(rawTag);
  if ((rawAuthor !== null && !author) || (rawTag !== null && !tag)) {
    return text('Invalid feed filter', 400);
  }

  try {
    const db = getDB();

    let user = null;
    if (author) {
      user = await db.prepare(
        'SELECT id, username, display_name, account_status FROM users WHERE LOWER(username) = ?',
      ).bind(author).first();
      const status = String(user?.account_status || 'active').toLowerCase();
      if (!user || status === 'disabled' || status === 'removed') {
        return text('Feed not found', 404);
      }
    }

    const where = [indexableBlogSql({ blogAlias: 'b', orgAlias: 'o' })];
    const binds = [];
    if (user) {
      where.push('b.author_id = ?');
      binds.push(user.id);
    }
    if (tag) {
      where.push('EXISTS (SELECT 1 FROM blog_tags bt WHERE bt.blog_id = b.id AND LOWER(bt.tag) = ?)');
      binds.push(tag);
    }

    const result = await db.prepare(`
      SELECT b.id, b.slug, b.title, b.subtitle, b.excerpt, b.published_at, b.updated_at,
        u.username AS author_username, u.display_name AS author_name,
        o.slug AS org_slug, c.slug AS collection_slug
      FROM blogs b JOIN users u ON u.id = b.author_id
      LEFT JOIN orgs o ON o.id = substr(b.published_as, 5)
      LEFT JOIN collections c ON c.id = b.collection_id
      WHERE ${where.join(' AND ')}
      ORDER BY b.published_at DESC LIMIT ?
    `).bind(...binds, user ? 50 : 100).all();

    const name = user ? (user.display_name || user.username) : null;
    const channel = user
      ? {
          title: `${name} on LixBlogs${tag ? ` — #${tag}` : ''}`,
          link: `${SITE_URL}/${encodeURIComponent(user.username)}`,
          description: tag
            ? `Stories tagged #${tag} by ${name} on LixBlogs.`
            : `Stories by ${name} on LixBlogs.`,
        }
      : {
          title: tag ? `LixBlogs — #${tag}` : 'LixBlogs — recent stories',
          link: tag ? `${SITE_URL}/tag/${encodeURIComponent(tag)}` : SITE_URL,
          description: tag
            ? `Recent stories tagged #${tag} on LixBlogs.`
            : 'Recent stories published by writers and organizations on LixBlogs.',
        };
    channel.selfUrl = feedUrl({ author: user ? user.username.toLowerCase() : null, tag });

    return new Response(renderRssFeed(channel, result?.results || []), {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        // WebSub hubs fetch immediately after a publish notification. Revalidation
        // prevents the edge from handing the hub a feed that predates the post.
        'Cache-Control': 'public, max-age=0, s-maxage=0, must-revalidate',
      },
    });
  } catch {
    return text('Feed temporarily unavailable', 503);
  }
}

function text(body, status) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
