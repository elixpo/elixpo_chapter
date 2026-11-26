import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

import { sqliteD1, useRequestContext } from './support/d1.mjs';

register(new URL('./support/platformLoader.mjs', import.meta.url));

const { GET: resolveGET } = await import('../app/api/resolve/route.js');
const pageModule = await import('../app/[...path]/page.jsx');

const RESOLVE_HANDLER = Symbol.for('lixblogs.test.resolveHandler');

const SCHEMA = `
  CREATE TABLE users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL, display_name TEXT, designation TEXT, bio TEXT,
    avatar_url TEXT, banner_r2_key TEXT, location TEXT, timezone TEXT, pronouns TEXT,
    website TEXT, company TEXT, links TEXT, tier TEXT,
    account_status TEXT NOT NULL DEFAULT 'active', top_pick_ids TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER, updated_at INTEGER
  );
  CREATE TABLE orgs (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL, name TEXT, tagline TEXT, description TEXT, bio TEXT,
    website TEXT, links TEXT, visibility TEXT, logo_url TEXT, logo_r2_key TEXT,
    banner_url TEXT, banner_r2_key TEXT, featured_blog_ids TEXT, timezone TEXT, location TEXT,
    contact_email TEXT, owner_id TEXT, created_at INTEGER, updated_at INTEGER
  );
  CREATE TABLE collections (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, slug TEXT NOT NULL, name TEXT, description TEXT, created_at INTEGER);
  CREATE TABLE blogs (
    id TEXT PRIMARY KEY, slugid TEXT, slug TEXT NOT NULL, title TEXT, subtitle TEXT, excerpt TEXT,
    content TEXT, cover_image_r2_key TEXT, cover_pos_x INTEGER, cover_pos_y INTEGER, cover_zoom INTEGER,
    member_only INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft', published_as TEXT,
    page_emoji TEXT, read_time_minutes INTEGER, published_at INTEGER, created_at INTEGER, updated_at INTEGER,
    author_id TEXT NOT NULL, secret INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER, collection_id TEXT,
    like_count INTEGER, comment_count INTEGER
  );
  CREATE TABLE blog_tags (blog_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (blog_id, tag));
  CREATE TABLE blog_co_authors (
    blog_id TEXT NOT NULL, user_id TEXT NOT NULL, added_at INTEGER,
    status TEXT NOT NULL DEFAULT 'pending', show_on_profile INTEGER NOT NULL DEFAULT 1, role TEXT,
    PRIMARY KEY (blog_id, user_id)
  );
  CREATE TABLE namespaces (name TEXT PRIMARY KEY, owner_type TEXT, owner_id TEXT);
`;

function addBlog(sqlite, id, fields = {}) {
  const row = {
    slug: id,
    author_id: 'u-alice',
    published_as: 'personal',
    status: 'published',
    secret: 0,
    deleted_at: null,
    member_only: 0,
    published_at: 100,
    updated_at: 100,
    collection_id: null,
    content: '[]',
    ...fields,
  };
  sqlite.prepare(`
    INSERT INTO blogs (id, slugid, slug, title, subtitle, excerpt, content, member_only, status,
      published_as, read_time_minutes, published_at, created_at, updated_at, author_id, secret,
      deleted_at, collection_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 4, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    fields.slugid ?? id,
    row.slug,
    fields.title ?? `Title ${id}`,
    'Subtitle',
    'Excerpt',
    row.content,
    row.member_only,
    row.status,
    row.published_as,
    row.published_at,
    row.created_at ?? row.published_at,
    row.updated_at,
    row.author_id,
    row.secret,
    row.deleted_at,
    row.collection_id,
  );
}

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  sqlite.exec(`
    INSERT INTO users (id, username, display_name, updated_at, created_at) VALUES
      ('u-alice', 'alice', 'Alice', 1, 1),
      ('u-bob', 'bob', 'Bob', 1, 1);
    INSERT INTO orgs (id, slug, name, visibility, owner_id, updated_at, created_at) VALUES
      ('org-acme', 'acme', 'Acme', 'public', 'u-alice', 1, 1),
      ('org-private', 'secret-hq', 'Secret HQ', 'private', 'u-alice', 1, 1),
      ('org-legacy', 'legacy', 'Legacy', NULL, 'u-alice', 1, 1);
    INSERT INTO collections (id, org_id, slug, name, created_at) VALUES
      ('col-acme', 'org-acme', 'series', 'Series', 1);
    INSERT INTO namespaces (name, owner_type, owner_id) VALUES
      ('alice', 'user', 'u-alice'),
      ('acme', 'org', 'org-acme'),
      ('secret-hq', 'org', 'org-private');
  `);

  addBlog(sqlite, 'personal-post');
  addBlog(sqlite, 'member-post', { member_only: 1 });
  addBlog(sqlite, 'unlisted-post', { status: 'unlisted' });
  addBlog(sqlite, 'deleted-post', { deleted_at: 1700000000 });
  addBlog(sqlite, 'org-post', { published_as: 'org:org-acme', collection_id: 'col-acme' });
  addBlog(sqlite, 'private-post', { published_as: 'org:org-private' });
  addBlog(sqlite, 'ghost-post', { published_as: 'org:missing' });
  addBlog(sqlite, 'anon-post', { slug: 'anon', secret: 1 });
  return sqlite;
}

const fixture = { sqlite: setup(), context: null };

test.beforeEach(() => {
  fixture.context = useRequestContext({ DB: sqliteD1(fixture.sqlite) });
  globalThis[RESOLVE_HANDLER] = (request) => resolveGET(request);
});

test.afterEach(() => {
  delete globalThis[RESOLVE_HANDLER];
  fixture.context.restore();
});

function stubResolve(body) {
  globalThis[RESOLVE_HANDLER] = async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const origin = 'https://blogs.elixpo.com';

async function metadataFor(path, searchParams = {}) {
  return pageModule.generateMetadata({
    params: Promise.resolve({ path }),
    searchParams: Promise.resolve(searchParams),
  });
}

async function jsonLdFor(path, searchParams = {}) {
  const element = await pageModule.default({
    params: Promise.resolve({ path }),
    searchParams: Promise.resolve(searchParams),
  });
  const children = Array.isArray(element.props.children)
    ? element.props.children
    : [element.props.children];
  const script = children.find((child) => child && child.props?.dangerouslySetInnerHTML);
  if (!script) return null;
  return JSON.parse(script.props.dangerouslySetInnerHTML.__html);
}

function blogPosting(json) {
  const nodes = json?.['@graph'] || [json];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return null;
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    if (types.includes('BlogPosting')) return node;
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') {
        const found = walk(value);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(json);
}

test('an eligible personal article keeps its canonical metadata and BlogPosting', async () => {
  const metadata = await metadataFor(['alice', 'personal-post']);
  assert.equal(metadata.alternates.canonical, `${origin}/alice/personal-post`);
  assert.equal(metadata.robots, undefined);

  const json = await jsonLdFor(['alice', 'personal-post']);
  const posting = blogPosting(json);
  assert.ok(posting);
  assert.equal(posting.url, `${origin}/alice/personal-post`);
});

test('an eligible member_only article keeps paywall markup', async () => {
  const metadata = await metadataFor(['alice', 'member-post']);
  assert.equal(metadata.robots, undefined);

  const json = await jsonLdFor(['alice', 'member-post']);
  const posting = blogPosting(json);
  assert.ok(posting);
  assert.equal(posting.isAccessibleForFree, false);
  assert.equal(posting.hasPart.cssSelector, '.blog-preview-content');
});

test('an eligible public-org article receives the actual org publisher', async () => {
  const json = await jsonLdFor(['acme', 'org-post']);
  const posting = blogPosting(json);
  assert.ok(posting);
  assert.equal(posting.publisher['@type'], 'Organization');
  assert.equal(posting.publisher.name, 'Acme');
});

test('a private-org article is noindex and emits no BlogPosting', async () => {
  const metadata = await metadataFor(['secret-hq', 'private-post']);
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.equal(await jsonLdFor(['secret-hq', 'private-post']), null);
});

test('a dangling org reference is noindex and emits no BlogPosting', async () => {
  const metadata = await metadataFor(['ghost-post']);
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.equal(await jsonLdFor(['ghost-post']), null);
});

test('a secret article is noindex, emits no BlogPosting and no author', async () => {
  const metadata = await metadataFor(['anon-post']);
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.equal(metadata.authors, undefined);
  assert.equal(await jsonLdFor(['anon-post']), null);
});

test('an unlisted article is noindex and emits no BlogPosting', async () => {
  const metadata = await metadataFor(['alice', 'unlisted-post']);
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.equal(await jsonLdFor(['alice', 'unlisted-post']), null);
});

test('a published row carrying deleted_at is noindex from the resolver row', async () => {
  const metadata = await metadataFor(['alice', 'deleted-post']);
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.equal(await jsonLdFor(['alice', 'deleted-post']), null);
});

test('a historical revision view is noindex and emits no BlogPosting', async () => {
  const metadata = await metadataFor(['alice', 'personal-post'], { rev: '2' });
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.equal(await jsonLdFor(['alice', 'personal-post'], { rev: '2' }), null);
});

for (const status of ['under_review', 'trashed']) {
  test(`a ${status} row is noindex and emits no BlogPosting`, async () => {
    stubResolve({
      type: 'blog',
      owner: { type: 'user', username: 'alice' },
      blog: {
        id: `stub-${status}`,
        slug: 'stub-post',
        title: 'Stub',
        status,
        secret: 0,
        deleted_at: null,
        published_as: 'personal',
        author_username: 'alice',
        published_at: 100,
        updated_at: 100,
      },
    });
    const metadata = await metadataFor(['alice', 'stub-post']);
    assert.deepEqual(metadata.robots, { index: false, follow: false });
    assert.equal(await jsonLdFor(['alice', 'stub-post']), null);
  });
}
