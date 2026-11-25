import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('all three public surfaces exclude private org posts in their SQL queries', async () => {
  const feedXml = await source('app/feed.xml/route.js');
  const tagPage = await source('app/tag/[tag]/page.jsx');
  const searchBlogs = await source('app/api/search/blogs/route.js');

  const predicate = /\(o\.id IS NULL OR LOWER\(COALESCE\(o\.visibility, 'public'\)\) != 'private'\)/;

  assert.match(feedXml, predicate, 'feed.xml must exclude private orgs');
  assert.match(tagPage, predicate, 'tag page must exclude private orgs');
  assert.match(searchBlogs, predicate, 'search blogs must exclude private orgs');
});

let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  // handled by the skip flag below
}
const skip = !DatabaseSync && 'node:sqlite is not available on this runtime';

function setupDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT
    );

    CREATE TABLE orgs (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      visibility TEXT
    );

    CREATE TABLE collections (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE blogs (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT,
      excerpt TEXT,
      cover_image_r2_key TEXT,
      page_emoji TEXT,
      published_at INTEGER NOT NULL,
      updated_at INTEGER,
      read_time_minutes INTEGER,
      published_as TEXT,
      author_id TEXT NOT NULL,
      collection_id TEXT,
      status TEXT NOT NULL,
      secret INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE blog_tags (
      blog_id TEXT NOT NULL,
      tag TEXT NOT NULL
    );
  `);

  sqlite.exec(`
    INSERT INTO users (id, username, display_name) VALUES ('u1', 'alice', 'Alice');

    INSERT INTO orgs (id, slug, name, visibility) VALUES
      ('org-pub', 'acme-pub', 'Acme Public', 'public'),
      ('org-def', 'acme-def', 'Acme Default', NULL),
      ('org-priv', 'acme-priv', 'Acme Private', 'private'),
      ('org-priv-cap', 'acme-priv-cap', 'Acme Private Upper', 'PRIVATE');

    INSERT INTO blogs (id, slug, title, subtitle, excerpt, published_at, published_as, author_id, status, secret) VALUES
      ('b-personal', 'post-1', 'Personal Post', 'sub', 'exc', 100, NULL, 'u1', 'published', 0),
      ('b-public-org', 'post-2', 'Public Org Post', 'sub', 'exc', 200, 'org:org-pub', 'u1', 'published', 0),
      ('b-default-org', 'post-3', 'Default Org Post', 'sub', 'exc', 300, 'org:org-def', 'u1', 'published', 0),
      ('b-private-org', 'post-4', 'Private Org Post', 'sub', 'exc', 400, 'org:org-priv', 'u1', 'published', 0),
      ('b-private-org-cap', 'post-5', 'Private Org Post Upper', 'sub', 'exc', 500, 'org:org-priv-cap', 'u1', 'published', 0);

    INSERT INTO blog_tags (blog_id, tag) VALUES
      ('b-personal', 'javascript'),
      ('b-public-org', 'javascript'),
      ('b-default-org', 'javascript'),
      ('b-private-org', 'javascript'),
      ('b-private-org-cap', 'javascript');
  `);

  return sqlite;
}

test('feed.xml query excludes private-org posts while keeping personal and public-org posts', { skip }, () => {
  const sqlite = setupDb();
  const rows = sqlite.prepare(`
    SELECT b.id, b.slug, b.title, b.subtitle, b.excerpt, b.published_at, b.updated_at,
      b.published_as, u.username AS author_username, u.display_name AS author_name,
      o.slug AS org_slug, c.slug AS collection_slug
    FROM blogs b JOIN users u ON u.id = b.author_id
    LEFT JOIN orgs o ON ('org:' || o.id) = b.published_as
    LEFT JOIN collections c ON c.id = b.collection_id
    WHERE b.status = 'published' AND b.secret = 0
      AND (o.id IS NULL OR LOWER(COALESCE(o.visibility, 'public')) != 'private')
    ORDER BY b.published_at DESC LIMIT 100
  `).all();

  const ids = rows.map((r) => r.id);
  assert.deepEqual(ids.sort(), ['b-default-org', 'b-personal', 'b-public-org']);
});

test('tag page query excludes private-org posts while keeping personal and public-org posts', { skip }, () => {
  const sqlite = setupDb();
  const rows = sqlite.prepare(`
    SELECT b.id, b.slug, b.title, b.subtitle, b.excerpt, b.cover_image_r2_key,
      b.published_at, b.updated_at, b.read_time_minutes, b.published_as,
      u.username AS author_username, u.display_name AS author_name,
      o.slug AS org_slug, o.name AS org_name, c.slug AS collection_slug
    FROM blog_tags bt
    JOIN blogs b ON b.id = bt.blog_id
    JOIN users u ON u.id = b.author_id
    LEFT JOIN orgs o ON ('org:' || o.id) = b.published_as
    LEFT JOIN collections c ON c.id = b.collection_id
    WHERE LOWER(bt.tag) = ? AND b.status = 'published' AND b.secret = 0
      AND (o.id IS NULL OR LOWER(COALESCE(o.visibility, 'public')) != 'private')
    ORDER BY b.published_at DESC
    LIMIT 50
  `).all('javascript');

  const ids = rows.map((r) => r.id);
  assert.deepEqual(ids.sort(), ['b-default-org', 'b-personal', 'b-public-org']);
});

test('blog search query excludes private-org posts while keeping personal and public-org posts', { skip }, () => {
  const sqlite = setupDb();
  const rows = sqlite.prepare(`
    SELECT b.id as slugid, b.slug, b.title, b.subtitle, b.page_emoji, b.cover_image_r2_key, b.secret,
      b.read_time_minutes, b.published_at, b.author_id, b.status,
      au.username as author_username, au.display_name as author_name,
      o.slug as org_slug, o.name as org_name
    FROM blogs b
    JOIN users au ON au.id = b.author_id
    LEFT JOIN orgs o ON ('org:' || o.id) = b.published_as
    WHERE b.status IN ('published', 'unlisted')
      AND (o.id IS NULL OR LOWER(COALESCE(o.visibility, 'public')) != 'private')
    ORDER BY b.published_at DESC
    LIMIT 10
  `).all();

  const ids = rows.map((r) => r.slugid);
  assert.deepEqual(ids.sort(), ['b-default-org', 'b-personal', 'b-public-org']);
});
