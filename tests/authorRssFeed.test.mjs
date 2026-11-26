import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

import { memoryKV, sqliteD1, useRequestContext } from './support/d1.mjs';
import {
  feedUrl,
  normalizeFeedAuthor,
  normalizeFeedTag,
  renderRssFeed,
} from '../lib/rssFeed.js';

register(new URL('./support/platformLoader.mjs', import.meta.url));

const { GET } = await import('../app/feed.xml/route.js');

const SITE_URL = 'https://blogs.elixpo.com';

const SCHEMA = `
  CREATE TABLE users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL, display_name TEXT,
    account_status TEXT NOT NULL DEFAULT 'active'
  );
  CREATE TABLE orgs (id TEXT PRIMARY KEY, slug TEXT NOT NULL, visibility TEXT);
  CREATE TABLE collections (id TEXT PRIMARY KEY, org_id TEXT, slug TEXT);
  CREATE TABLE blogs (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL, title TEXT, subtitle TEXT, excerpt TEXT,
    author_id TEXT NOT NULL, published_as TEXT, collection_id TEXT,
    status TEXT NOT NULL, secret INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER,
    published_at INTEGER, updated_at INTEGER
  );
  CREATE TABLE blog_tags (blog_id TEXT NOT NULL, tag TEXT NOT NULL);
`;

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  sqlite.exec(`
    INSERT INTO users (id, username, display_name, account_status) VALUES
      ('u-ana', 'ana', 'Ana Debian', 'active'),
      ('u-bob', 'bob', 'Bob', 'active'),
      ('u-gone', 'gone', 'Gone', 'removed');
    INSERT INTO orgs (id, slug, visibility) VALUES ('o-pub', 'acme', 'public'), ('o-priv', 'hidden', 'private');
  `);
  const post = sqlite.prepare(`
    INSERT INTO blogs (id, slug, title, excerpt, author_id, published_as, status, secret, deleted_at, published_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  post.run('a1', 'debian-notes', 'Debian notes', 'Packaging <b>tips</b> & tricks', 'u-ana', 'personal', 'published', 0, null, 300, 300);
  post.run('a2', 'cooking', 'Cooking', 'Soup', 'u-ana', 'personal', 'published', 0, null, 200, 200);
  post.run('a3', 'org-post', 'Org post', 'From Acme', 'u-ana', 'org:o-pub', 'published', 0, null, 100, 100);
  post.run('a-secret', 'secret', 'Secret', 'Anonymous', 'u-ana', 'personal', 'published', 1, null, 400, 400);
  post.run('a-draft', 'draft', 'Draft', 'WIP', 'u-ana', 'personal', 'draft', 0, null, 410, 410);
  post.run('a-unlisted', 'unlisted', 'Unlisted', 'Hidden', 'u-ana', 'personal', 'unlisted', 0, null, 420, 420);
  post.run('a-trash', 'trash', 'Trash', 'Gone', 'u-ana', 'personal', 'published', 0, 999, 430, 430);
  post.run('a-private', 'private-org', 'Private org', 'Members', 'u-ana', 'org:o-priv', 'published', 0, null, 440, 440);
  post.run('b1', 'bob-post', 'Bob post', 'Hi', 'u-bob', 'personal', 'published', 0, null, 500, 500);
  sqlite.exec(`
    INSERT INTO blog_tags (blog_id, tag) VALUES
      ('a1', 'debian'), ('a3', 'debian'), ('a-secret', 'debian'), ('b1', 'debian'), ('a2', 'food');
  `);
  return sqlite;
}

async function fetchFeed(query) {
  const sqlite = setup();
  const context = useRequestContext({ DB: sqliteD1(sqlite), KV: memoryKV() });
  try {
    return await GET(new Request(`${SITE_URL}/feed.xml${query}`));
  } finally {
    await context.settle();
    context.restore();
  }
}

const links = (body) => [...body.matchAll(/<item>[\s\S]*?<link>([^<]*)<\/link>/g)].map((m) => m[1]);

test('?author= lists only that writer\'s public posts, never secret or hidden ones', async () => {
  const response = await fetchFeed('?author=ana');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/rss+xml; charset=utf-8');
  const body = await response.text();
  assert.deepEqual(links(body), [
    `${SITE_URL}/ana/debian-notes`,
    `${SITE_URL}/ana/cooking`,
    `${SITE_URL}/acme/org-post`,
  ]);
  // Secret posts are anonymous: listing them under a name would unmask the author.
  assert.doesNotMatch(body, /secret|Anonymous/);
  assert.match(body, /<title>Ana Debian on LixBlogs<\/title>/);
  assert.match(body, /<link>https:\/\/blogs\.elixpo\.com\/ana<\/link>/);
  assert.match(body, /href="https:\/\/blogs\.elixpo\.com\/feed\.xml\?author=ana" rel="self"/);
});

test('?author=&tag= narrows to one writer\'s tagged posts (Planet Debian style)', async () => {
  const body = await (await fetchFeed('?author=ANA&tag=%23Debian')).text();
  assert.deepEqual(links(body), [`${SITE_URL}/ana/debian-notes`, `${SITE_URL}/acme/org-post`]);
  assert.match(body, /<title>Ana Debian on LixBlogs — #debian<\/title>/);
  assert.match(body, /feed\.xml\?author=ana&amp;tag=debian" rel="self"/);
});

test('?tag= alone lists every writer\'s public posts with that tag', async () => {
  const body = await (await fetchFeed('?tag=debian')).text();
  assert.deepEqual(links(body), [
    `${SITE_URL}/bob/bob-post`,
    `${SITE_URL}/ana/debian-notes`,
    `${SITE_URL}/acme/org-post`,
  ]);
});

test('the unfiltered feed uses the same indexability rule', async () => {
  const body = await (await fetchFeed('')).text();
  assert.deepEqual(links(body), [
    `${SITE_URL}/bob/bob-post`,
    `${SITE_URL}/ana/debian-notes`,
    `${SITE_URL}/ana/cooking`,
    `${SITE_URL}/acme/org-post`,
  ]);
});

test('unknown or removed authors are 404 and malformed filters are 400', async () => {
  assert.equal((await fetchFeed('?author=nobody')).status, 404);
  assert.equal((await fetchFeed('?author=gone')).status, 404);
  assert.equal((await fetchFeed('?author=a%20b')).status, 400);
  assert.equal((await fetchFeed('?author=')).status, 400);
  assert.equal((await fetchFeed(`?tag=${'x'.repeat(51)}`)).status, 400);
});

test('entries are plain text only: no images, iframes, scripts or markup', async () => {
  const body = await (await fetchFeed('?author=ana')).text();
  // HTML in a summary is escaped as text, never emitted as markup.
  assert.match(body, /Packaging &lt;b&gt;tips&lt;\/b&gt; &amp; tricks/);
  assert.doesNotMatch(body, /<(img|iframe|script|object|embed|picture|video|audio|link rel="stylesheet")\b/i);
  assert.doesNotMatch(body, /<content:encoded|<enclosure|<media:/);
});

test('filter normalisation and canonical feed URLs', () => {
  assert.equal(normalizeFeedAuthor(' @Ana '), 'ana');
  assert.equal(normalizeFeedAuthor('legacy_name-'), 'legacy_name-');
  assert.equal(normalizeFeedAuthor('a b'), null);
  assert.equal(normalizeFeedAuthor(42), null);
  assert.equal(normalizeFeedTag('#Debian'), 'debian');
  assert.equal(normalizeFeedTag('c++'), 'c++');
  assert.equal(normalizeFeedTag('<x>'), null);
  assert.equal(feedUrl({ tag: 'debian', author: 'ana' }), `${SITE_URL}/feed.xml?author=ana&tag=debian`);
  assert.equal(feedUrl(), `${SITE_URL}/feed.xml`);
});

test('renderRssFeed escapes channel text and falls back for empty feeds', () => {
  const body = renderRssFeed(
    { title: 'A & B', link: SITE_URL, description: '<x>', selfUrl: feedUrl({ author: 'ana' }) },
    [],
  );
  assert.match(body, /<title>A &amp; B<\/title>/);
  assert.match(body, /<description>&lt;x&gt;<\/description>/);
  assert.doesNotMatch(body, /<item>/);
});
