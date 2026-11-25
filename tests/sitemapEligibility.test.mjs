import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

import { memoryKV, sqliteD1, useRequestContext } from './support/d1.mjs';

register(new URL('./support/platformLoader.mjs', import.meta.url));

const { fetchPublicSitemapRows, loadPublicSitemapRows, publicBlogPath, SITE_URL } = await import('../lib/sitemapData.js');
const { PUBLIC_SITEMAP_CACHE_KEY } = await import('../lib/cache.js');
const { default: sitemap } = await import('../app/sitemap.js');
const { docsNavFlat } = await import('../src/config/docsNav.js');
const { PAID_PLANS_ENABLED } = await import('../lib/paidPlans.js');

const SCHEMA = `
  CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL, updated_at INTEGER);
  CREATE TABLE orgs (id TEXT PRIMARY KEY, slug TEXT NOT NULL, name TEXT NOT NULL, visibility TEXT, updated_at INTEGER);
  CREATE TABLE collections (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, slug TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER);
  CREATE TABLE blogs (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL, author_id TEXT NOT NULL,
    published_as TEXT, collection_id TEXT, status TEXT NOT NULL DEFAULT 'draft',
    secret INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER, member_only INTEGER NOT NULL DEFAULT 0,
    published_at INTEGER, updated_at INTEGER
  );
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

function insertBlog(sqlite, id, fields = {}) {
  const row = {
    published_as: 'personal',
    collection_id: null,
    status: 'published',
    secret: 0,
    deleted_at: null,
    member_only: 0,
    published_at: 100,
    updated_at: 500,
    ...fields,
  };
  sqlite.prepare(`
    INSERT INTO blogs (id, slug, author_id, published_as, collection_id, status, secret, deleted_at, member_only, published_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    fields.slug ?? id,
    fields.author_id ?? 'u-alice',
    row.published_as,
    row.collection_id,
    row.status,
    row.secret,
    row.deleted_at,
    row.member_only,
    row.published_at,
    row.updated_at,
  );
}

function setupSmall() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  sqlite.exec(`
    INSERT INTO users (id, username, updated_at) VALUES
      ('u-alice', 'alice', 10), ('u-bob', 'bob', 20), ('u-dave', 'dave', 30),
      ('u-erin', 'erin', 40), ('u-frank', 'frank', 50);
    INSERT INTO orgs (id, slug, name, visibility, updated_at) VALUES
      ('org-acme', 'acme', 'Acme', 'public', 100),
      ('org-legacy', 'legacy-hq', 'Legacy', NULL, 110),
      ('org-private', 'private-hq', 'Private', 'PRIVATE', 120),
      ('org-other', 'other-org', 'Other', 'public', 130);
    INSERT INTO collections (id, org_id, slug, name, created_at) VALUES
      ('col-acme', 'org-acme', 'series', 'Series', 100),
      ('col-other', 'org-other', 'other-series', 'Other series', 100);
  `);

  insertBlog(sqlite, 'personal-post', { published_at: 100 });
  insertBlog(sqlite, 'legacy-null', { author_id: 'u-bob', published_as: null, published_at: 90 });
  insertBlog(sqlite, 'org-public-post', { published_as: 'org:org-acme', collection_id: 'col-acme', published_at: 80 });
  insertBlog(sqlite, 'second-series-post', { published_as: 'org:org-acme', collection_id: 'col-acme', published_at: 70 });
  // A collection owned by a different org must not leak into this article's URL.
  insertBlog(sqlite, 'cross-org-post', { published_as: 'org:org-acme', collection_id: 'col-other', published_at: 60 });
  insertBlog(sqlite, 'org-legacy-post', { author_id: 'u-bob', published_as: 'org:org-legacy', published_at: 50 });
  insertBlog(sqlite, 'member-only-post', { author_id: 'u-dave', member_only: 1, published_at: 40 });
  // Excluded rows are newer than every eligible row.
  insertBlog(sqlite, 'private-org-post', { author_id: 'u-erin', published_as: 'org:org-private', published_at: 110 });
  insertBlog(sqlite, 'dangling-org-post', { author_id: 'u-frank', published_as: 'org:missing', published_at: 120 });
  insertBlog(sqlite, 'secret-post', { secret: 1, published_at: 130 });
  insertBlog(sqlite, 'unlisted-post', { status: 'unlisted', published_at: 140 });
  insertBlog(sqlite, 'draft-post', { status: 'draft', published_at: 150 });
  insertBlog(sqlite, 'under-review-post', { status: 'under_review', published_at: 160 });
  insertBlog(sqlite, 'archived-post', { status: 'archived', published_at: 170 });
  insertBlog(sqlite, 'trashed-post', { status: 'trashed', deleted_at: 1700000000, published_at: 180 });
  insertBlog(sqlite, 'deleted-published-post', { deleted_at: 1700000000, published_at: 190 });
  insertBlog(sqlite, 'unknown-publication', { published_as: 'team:1', published_at: 200 });

  sqlite.exec(`
    INSERT INTO blog_tags (blog_id, tag) VALUES
      ('personal-post', 'shared'), ('org-public-post', 'shared'),
      ('private-org-post', 'shared'), ('secret-post', 'shared'),
      ('private-org-post', 'private-only'), ('secret-post', 'private-only'),
      ('member-only-post', 'member');
    INSERT INTO bookmark_collections (id, user_id, name, slug, visibility, updated_at) VALUES
      ('bc-public', 'u-alice', 'Reads', 'reads-one', 'public', 100),
      ('bc-private', 'u-bob', 'Private', 'private-reads', 'private', 90),
      ('bc-excluded', 'u-dave', 'Hidden', 'hidden-reads', 'public', 80);
    INSERT INTO curated_collection_entries (collection_id, blog_id, added_by) VALUES
      ('bc-public', 'personal-post', 'u-alice'),
      ('bc-private', 'personal-post', 'u-bob'),
      ('bc-excluded', 'private-org-post', 'u-dave');
    INSERT INTO contests (id, slug, status, starts_at, updated_at) VALUES
      ('c-draft', 'draft-contest', 'draft', 300, 300),
      ('c-live', 'live-contest', 'live', 200, 200),
      ('c-done', 'done-contest', 'completed', 100, 100);
  `);

  return { sqlite, db: sqliteD1(sqlite) };
}

test('sitemap rows apply the shared eligibility to every blog-derived category', async () => {
  const { db } = setupSmall();
  const rows = await fetchPublicSitemapRows(db);

  assert.deepEqual(
    rows.blogs.map(publicBlogPath),
    [
      '/alice/personal-post',
      '/bob/legacy-null',
      '/acme/series/org-public-post',
      '/acme/series/second-series-post',
      '/acme/cross-org-post',
      '/legacy-hq/org-legacy-post',
      '/dave/member-only-post',
    ],
  );
  assert.deepEqual(rows.users.map((u) => u.username), ['alice', 'bob', 'dave']);
  assert.deepEqual(rows.orgs.map((o) => o.slug), ['acme', 'legacy-hq']);
  assert.deepEqual(rows.collections.map((c) => `${c.oslug}/${c.cslug}`), ['acme/series']);
  assert.deepEqual(rows.curatedCollections.map((c) => `${c.username}/reads/${c.cslug}`), ['alice/reads/reads-one']);
  assert.deepEqual(rows.tags.map((t) => t.tag), ['member', 'shared']);
  assert.deepEqual(rows.contests.map((c) => c.slug), ['live-contest', 'done-contest']);
});

test('publicBlogPath fails closed for unknown and unresolved publication targets', () => {
  assert.equal(publicBlogPath({ published_as: 'org:missing', author_username: 'alice', slug: 'p' }), null);
  assert.equal(publicBlogPath({ published_as: 'team:1', author_username: 'alice', slug: 'p' }), null);
  assert.equal(publicBlogPath({ published_as: 'personal', author_username: 'alice', slug: 'a&b c' }), '/alice/a%26b%20c');
  assert.equal(publicBlogPath({ published_as: 'personal', slug: 'p' }), null);
});

test('the sitemap cache is a fresh v3 named-row entry with the 300 second TTL', async () => {
  const { db } = setupSmall();
  const kv = memoryKV();
  const context = useRequestContext({ DB: db, KV: kv });
  try {
    const rows = await loadPublicSitemapRows();
    await context.settle();
    assert.deepEqual(Object.keys(rows).sort(), [
      'blogs', 'collections', 'contests', 'curatedCollections', 'orgs', 'tags', 'users',
    ]);
    assert.equal(PUBLIC_SITEMAP_CACHE_KEY, 'v3:public-sitemap-rows');
    assert.equal(kv.puts.length, 1);
    assert.equal(kv.puts[0].key, 'v3:public-sitemap-rows');
    assert.equal(kv.puts[0].options.expirationTtl, 300);
  } finally {
    context.restore();
  }
});

test('a v2 array in KV is never consumed by the named-row loader', async () => {
  const { db } = setupSmall();
  const kv = memoryKV({ 'v2:public-sitemap-rows': [{ slug: 'stale' }] });
  const context = useRequestContext({ DB: db, KV: kv });
  try {
    const rows = await loadPublicSitemapRows();
    assert.equal(Array.isArray(rows), false);
    assert.equal(rows.blogs.some((blog) => blog.slug === 'stale'), false);
    assert.ok(rows.blogs.length > 0);
  } finally {
    context.restore();
  }
});

test('a valid cache hit needs no live database', async () => {
  const cached = {
    blogs: [{ slug: 'cached', published_as: 'personal', author_username: 'alice' }],
    users: [], orgs: [], collections: [], curatedCollections: [], tags: [], contests: [],
  };
  const context = useRequestContext({
    KV: memoryKV({ 'v3:public-sitemap-rows': cached }),
  });
  try {
    const rows = await loadPublicSitemapRows();
    assert.deepEqual(rows, cached);
  } finally {
    context.restore();
  }
});

test('a KV-only failure falls back to direct D1 rows', async () => {
  const { db } = setupSmall();
  const brokenKV = {
    async get() { throw new Error('kv down'); },
    async put() {},
    async delete() {},
  };
  const context = useRequestContext({ DB: db, KV: brokenKV });
  try {
    const rows = await loadPublicSitemapRows();
    assert.equal(rows.blogs.length, 7);
  } finally {
    context.restore();
  }
});

test('a D1 failure rejects instead of returning an empty fallback', async () => {
  const context = useRequestContext({
    DB: { prepare() { throw new Error('D1 down'); } },
    KV: memoryKV(),
  });
  try {
    await assert.rejects(loadPublicSitemapRows(), /D1 down/);
  } finally {
    context.restore();
  }
});

function pad(value, width = 4) {
  return String(value).padStart(width, '0');
}

function setupCapacity() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  sqlite.exec(`
    CREATE INDEX idx_blogs_author ON blogs(author_id);
    CREATE INDEX idx_blogs_published_as ON blogs(published_as);
    CREATE INDEX idx_blogs_collection ON blogs(collection_id);
    CREATE INDEX idx_collections_org ON collections(org_id);
    CREATE INDEX idx_blogs_status_published ON blogs(status, published_at DESC);
  `);

  const insertUser = sqlite.prepare('INSERT INTO users (id, username, updated_at) VALUES (?, ?, ?)');
  const insertOrg = sqlite.prepare('INSERT INTO orgs (id, slug, name, visibility, updated_at) VALUES (?, ?, ?, ?, ?)');
  const insertCollection = sqlite.prepare('INSERT INTO collections (id, org_id, slug, name, created_at) VALUES (?, ?, ?, ?, ?)');
  const insertBlogRow = sqlite.prepare(`
    INSERT INTO blogs (id, slug, author_id, published_as, collection_id, status, secret, deleted_at, member_only, published_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'published', 0, NULL, 0, ?, ?)
  `);
  const insertTag = sqlite.prepare('INSERT INTO blog_tags (blog_id, tag) VALUES (?, ?)');
  const insertCurated = sqlite.prepare('INSERT INTO bookmark_collections (id, user_id, name, slug, visibility, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  const insertEntry = sqlite.prepare('INSERT INTO curated_collection_entries (collection_id, blog_id, added_by) VALUES (?, ?, ?)');
  const insertContest = sqlite.prepare('INSERT INTO contests (id, slug, status, starts_at, updated_at) VALUES (?, ?, ?, ?, ?)');

  sqlite.exec('BEGIN');
  try {
    for (let i = 0; i < 4000; i += 1) {
      insertUser.run(`u${pad(i)}`, `user${pad(i)}`, 1000 + i);
    }
    for (let i = 0; i < 2000; i += 1) {
      insertOrg.run(`org${pad(i)}`, `org${pad(i)}`, `Org ${i}`, 'public', 1000 + i);
      insertCollection.run(`col${pad(i)}`, `org${pad(i)}`, `col${pad(i)}`, `Collection ${i}`, 1000 + i);
      insertBlogRow.run(`org-post-${pad(i)}`, `org-post-${pad(i)}`, `u${pad(1)}`, `org:org${pad(i)}`, `col${pad(i)}`, 1000 + i, 1000 + i);
    }
    for (let i = 0; i < 3999; i += 1) {
      insertBlogRow.run(`user-post-${pad(i)}`, `user-post-${pad(i)}`, `u${pad(i + 1)}`, 'personal', null, 3000 + i, 3000 + i);
    }
    for (let i = 0; i < 31999; i += 1) {
      insertBlogRow.run(`extra-post-${pad(i)}`, `extra-post-${pad(i)}`, 'u0000', 'personal', null, 7000 + i, 7000 + i);
    }
    for (let i = 0; i < 7; i += 1) {
      insertBlogRow.run(`tie-${pad(i, 2)}`, `tie-${pad(i, 2)}`, 'u0000', 'personal', null, 1, 1);
    }
    for (let i = 0; i < 2000; i += 1) {
      insertTag.run(`user-post-${pad(i)}`, `tag-${pad(i)}`);
      insertCurated.run(`bc${pad(i)}`, `u${pad(i + 1)}`, `Reads ${i}`, `reads-${pad(i)}`, 'public', 1000 + i);
      insertEntry.run(`bc${pad(i)}`, `user-post-${pad(i)}`, `u${pad(i + 1)}`);
      insertContest.run(`c${pad(i)}`, `contest-${pad(i)}`, 'completed', 1000 + i, 1000 + i);
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }

  return { sqlite, db: sqliteD1(sqlite) };
}

let capacityFixture;
function getCapacityFixture() {
  capacityFixture ??= setupCapacity();
  return capacityFixture;
}

test('article ordering keeps the newest 38,000 with an id tie-breaker at the cap', async () => {
  const { db } = getCapacityFixture();
  const rows = await fetchPublicSitemapRows(db);
  const paths = rows.blogs.map(publicBlogPath);

  assert.equal(paths.length, 38000);
  // The seven oldest rows share published_at; only the two highest ids survive.
  assert.ok(paths.includes('/user0000/tie-06'));
  assert.ok(paths.includes('/user0000/tie-05'));
  assert.ok(!paths.includes('/user0000/tie-04'));
  assert.ok(!paths.includes('/user0000/tie-00'));
  assert.equal(paths[0], `/user0000/extra-post-${pad(31998)}`);
  assert.equal(new Set(paths).size, paths.length);
});

test('root sitemap keeps the reserved articles and truncates at 50,000', async () => {
  const { db, sqlite } = getCapacityFixture();
  const rows = await fetchPublicSitemapRows(db);
  const articleUrls = rows.blogs.map((blog) => `${SITE_URL}${publicBlogPath(blog)}`);
  const staticCount = 9 + docsNavFlat.length + (PAID_PLANS_ENABLED ? 1 : 0);

  const context = useRequestContext({ DB: db, KV: memoryKV() });
  try {
    const urls = await sitemap();
    await context.settle();

    assert.equal(urls.length, 50000);
    assert.equal(new Set(urls.map((entry) => entry.url)).size, urls.length);
    assert.equal(urls[0].url, `${SITE_URL}/`);
    assert.equal(urls.filter((entry) => entry.url === `${SITE_URL}/`).length, 1);

    const articles = new Set(articleUrls);
    assert.equal(articles.size, 38000);
    const firstArticle = urls.slice(staticCount, staticCount + 38000);
    assert.equal(firstArticle.length, 38000);
    assert.ok(firstArticle.every((entry) => articles.has(entry.url)));
    assert.ok(urls.slice(0, staticCount).every((entry) => !articles.has(entry.url)));
    assert.equal(articles.size, firstArticle.filter((entry) => articles.has(entry.url)).length);

    // Categories after the reserved articles: users, orgs, collections, curated.
    assert.equal(urls.slice(staticCount + 38000, staticCount + 42000).length, 4000);
    assert.equal(urls.slice(staticCount + 42000, staticCount + 44000).length, 2000);
    assert.equal(urls.slice(staticCount + 44000, staticCount + 46000).length, 2000);
    assert.equal(urls.slice(staticCount + 46000, staticCount + 48000).length, 2000);

    // The tail is what the ceiling drops: the tag category is capped at 2,000
    // and contests are never reached.
    assert.equal(urls.length - (staticCount + 48000), 2000 - staticCount);
    const tags = urls.slice(staticCount + 48000);
    assert.ok(tags.every((entry) => entry.url.startsWith(`${SITE_URL}/tag/`)));
    assert.equal(urls.some((entry) => entry.url.includes('/contests/')), false);

    // Sanity: the fixture really had contests available for a lower ceiling.
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM contests WHERE status != 'draft'").get().n, 2000);
  } finally {
    context.restore();
  }
});

test('root sitemap keeps its static-only fallback when D1 is unavailable', async () => {
  const staticCount = 9 + docsNavFlat.length + (PAID_PLANS_ENABLED ? 1 : 0);
  const context = useRequestContext({
    DB: { prepare() { throw new Error('D1 down'); } },
    KV: memoryKV(),
  });
  try {
    const urls = await sitemap();
    assert.equal(urls.length, staticCount);
    assert.equal(urls[0].url, `${SITE_URL}/`);
  } finally {
    context.restore();
  }
});
