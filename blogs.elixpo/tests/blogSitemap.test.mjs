import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

import { memoryKV, sqliteD1, useRequestContext } from './support/d1.mjs';

register(new URL('./support/platformLoader.mjs', import.meta.url));

const { GET } = await import('../app/blog-sitemap.xml/route.js');
const { default: robots } = await import('../app/robots.js');
const { middleware } = await import('../middleware.js');
const { NextRequest } = await import('next/server.js');

const SITE_URL = 'https://blogs.elixpo.com';

const SCHEMA = `
  CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL, updated_at INTEGER);
  CREATE TABLE orgs (id TEXT PRIMARY KEY, slug TEXT NOT NULL, name TEXT NOT NULL, visibility TEXT, updated_at INTEGER);
  CREATE TABLE blogs (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL, author_id TEXT NOT NULL,
    published_as TEXT, collection_id TEXT, status TEXT NOT NULL DEFAULT 'draft',
    secret INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER, member_only INTEGER NOT NULL DEFAULT 0,
    published_at INTEGER, updated_at INTEGER
  );
  CREATE TABLE collections (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, slug TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER);
  CREATE TABLE blog_tags (blog_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (blog_id, tag));
  CREATE TABLE bookmark_collections (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, slug TEXT,
    visibility TEXT NOT NULL DEFAULT 'private', updated_at INTEGER
  );
  CREATE TABLE curated_collection_entries (
    collection_id TEXT NOT NULL, blog_id TEXT NOT NULL, added_by TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0, added_at INTEGER,
    PRIMARY KEY (collection_id, blog_id)
  );
  CREATE TABLE contests (id TEXT PRIMARY KEY, slug TEXT NOT NULL, status TEXT NOT NULL, starts_at INTEGER, updated_at INTEGER);
`;

const SPECIAL_SLUG = 'a&b<c>"d\'é';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  sqlite.exec(`
    INSERT INTO users (id, username, updated_at) VALUES ('u-alice', 'alice', 10);
    INSERT INTO orgs (id, slug, name, visibility, updated_at) VALUES
      ('org-acme', 'acme', 'Acme', 'public', 20),
      ('org-private', 'private-hq', 'Private', 'private', 30);
  `);
  const insert = sqlite.prepare(`
    INSERT INTO blogs (id, slug, author_id, published_as, status, secret, deleted_at, published_at, updated_at)
    VALUES (?, ?, 'u-alice', ?, ?, ?, NULL, ?, ?)
  `);
  insert.run('fallback-date', 'fallback-date', 'personal', 'published', 0, 1234567890, null);
  insert.run('personal-post', 'personal-post', 'personal', 'published', 0, 100, 100);
  insert.run('org-post', 'org-post', 'org:org-acme', 'published', 0, 90, 90);
  insert.run('special-post', SPECIAL_SLUG, 'personal', 'published', 0, 80, 80);
  insert.run('no-dates', 'no-dates', 'personal', 'published', 0, null, null);
  insert.run('private-org-post', 'private-org-post', 'org:org-private', 'published', 0, 110, 110);
  insert.run('unlisted-post', 'unlisted-post', 'personal', 'unlisted', 0, 120, 120);
  insert.run('secret-post', 'secret-post', 'personal', 'published', 1, 130, 130);
  return sqlite;
}

function withContext(env, fn) {
  const context = useRequestContext(env);
  return Promise.resolve()
    .then(fn)
    .finally(async () => {
      await context.settle();
      context.restore();
    });
}

function locs(body) {
  return [...body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'"));
}

test('blog-sitemap.xml returns only eligible article URLs as a no-store XML urlset', async () => {
  const sqlite = setup();
  await withContext({ DB: sqliteD1(sqlite), KV: memoryKV() }, async () => {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/xml; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-store');

    const body = await response.text();
    assert.ok(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.match(body, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.deepEqual(locs(body), [
      `${SITE_URL}/alice/fallback-date`,
      `${SITE_URL}/alice/personal-post`,
      `${SITE_URL}/acme/org-post`,
      `${SITE_URL}/alice/${encodeURIComponent(SPECIAL_SLUG)}`,
      `${SITE_URL}/alice/no-dates`,
    ]);

    // Encoded path segments are emitted once, not double-encoded.
    assert.match(body, /%26/);
    assert.match(body, /%3C/);
    assert.doesNotMatch(body, /%2526|%253C/);
  });
});

test('blog-sitemap.xml emits real timestamps and omits absent ones', async () => {
  const sqlite = setup();
  await withContext({ DB: sqliteD1(sqlite), KV: memoryKV() }, async () => {
    const body = await (await GET()).text();
    const blocks = [...body.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => match[1]);
    assert.equal(blocks.length, 5);
    assert.match(blocks[0], /<lastmod>2009-02-13T23:31:30\.000Z<\/lastmod>/);
    assert.match(blocks[1], /<lastmod>1970-01-01T00:01:40\.000Z<\/lastmod>/);
    assert.doesNotMatch(blocks[4], /<lastmod>/);
  });
});

test('a successful empty result is a 200 empty urlset, not an error', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  await withContext({ DB: sqliteD1(sqlite), KV: memoryKV() }, async () => {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.text();
    assert.match(body, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"><\/urlset>/);
    assert.doesNotMatch(body, /<url>/);
  });
});

test('a D1 failure is a sanitized 503 with retry guidance and no cache', async () => {
  await withContext({
    DB: { prepare() { throw new Error('D1 exploded at secret-host'); } },
    KV: memoryKV(),
  }, async () => {
    const response = await GET();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '30');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.text();
    assert.equal(body, 'Sitemap temporarily unavailable');
    assert.doesNotMatch(body, /D1|secret-host|exploded/);
  });
});

test('a KV-only failure still serves the D1 feed', async () => {
  const sqlite = setup();
  const brokenKV = {
    async get() { throw new Error('kv down'); },
    async put() {},
    async delete() {},
  };
  await withContext({ DB: sqliteD1(sqlite), KV: brokenKV }, async () => {
    const response = await GET();
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.equal(locs(body).length, 5);
  });
});

test('unsuccessful or malformed D1 results return 503 without poisoning the cache', async () => {
  for (const result of [
    { success: false, error: 'secret query error', results: [] },
    { success: true },
    { success: true, results: {} },
    null,
  ]) {
    for (let failedQuery = 0; failedQuery < 7; failedQuery += 1) {
      const sqlite = setup();
      const kv = memoryKV();
      const db = sqliteD1(sqlite);
      let queryCount = 0;
      try {
        await withContext({
          DB: { prepare(sql) {
            const statement = db.prepare(sql);
            const query = queryCount++ % 7;
            return { async all() { return query === failedQuery ? result : statement.all(); } };
          } }, KV: kv,
        }, async () => {
          const response = await GET();
          assert.equal(response.status, 503);
          assert.equal(response.headers.get('retry-after'), '30');
          assert.equal(response.headers.get('cache-control'), 'no-store');
          assert.equal(await response.text(), 'Sitemap temporarily unavailable');
          assert.equal(kv.puts.length, 0);
        });
      } finally {
        sqlite.close();
      }
    }
  }
});

test('a failed request does not poison the cache or the next request', async () => {
  const sqlite = setup();
  const kv = memoryKV();
  const broken = useRequestContext({
    DB: { prepare() { throw new Error('D1 down'); } },
    KV: kv,
  });
  try {
    assert.equal((await GET()).status, 503);
    assert.equal(kv.store.size, 0);
  } finally {
    broken.restore();
  }

  await withContext({ DB: sqliteD1(sqlite), KV: kv }, async () => {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(locs(await response.text()).length, 5);
  });
});

test('robots advertises both the root and article sitemaps', () => {
  const { rules, sitemap } = robots();
  assert.deepEqual(sitemap, [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/blog-sitemap.xml`]);
  assert.ok(rules.disallow.includes('/api/'));
  assert.ok(rules.allow.includes('/api/og'));
});

test('middleware classifies blog-sitemap.xml instead of treating it as a handle page', () => {
  const sitemapResponse = middleware(new NextRequest(`${SITE_URL}/blog-sitemap.xml`));
  assert.equal(sitemapResponse.status, 200);
  assert.equal(sitemapResponse.headers.get('cache-control'), null);

  const handleResponse = middleware(new NextRequest(`${SITE_URL}/alice/personal-post`));
  assert.equal(handleResponse.status, 200);
  assert.match(handleResponse.headers.get('cache-control') || '', /no-store/);

  const protectedResponse = middleware(new NextRequest(`${SITE_URL}/settings`));
  assert.equal(protectedResponse.status, 307);
  assert.equal(protectedResponse.headers.get('x-robots-tag'), 'noindex, nofollow');
});
