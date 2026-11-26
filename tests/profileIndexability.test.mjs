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
  CREATE TABLE follows (follower_id TEXT NOT NULL, following_id TEXT NOT NULL, following_type TEXT NOT NULL);
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
    like_count: 0,
    comment_count: 0,
    ...fields,
  };
  sqlite.prepare(`
    INSERT INTO blogs (id, slugid, slug, title, subtitle, excerpt, content, cover_image_r2_key,
      page_emoji, read_time_minutes, published_at, created_at, updated_at, author_id, published_as,
      collection_id, status, secret, deleted_at, member_only, like_count, comment_count)
    VALUES (?, ?, ?, ?, '', '', ?, NULL, NULL, 3, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
  `).run(
    id,
    id,
    row.slug,
    `Title ${id}`,
    row.content,
    row.published_at,
    row.published_at,
    row.updated_at,
    row.author_id,
    row.published_as,
    row.collection_id,
    row.status,
    row.secret,
    row.deleted_at,
    row.member_only,
  );
}

function setupProfile() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  sqlite.exec(`
    INSERT INTO users (id, username, display_name, updated_at, created_at) VALUES
      ('u-alice', 'alice', 'Alice', 1, 1),
      ('u-bob', 'bob', 'Bob', 1, 1);
    INSERT INTO orgs (id, slug, name, visibility, owner_id, updated_at, created_at) VALUES
      ('org-acme', 'acme', 'Acme', 'public', 'u-alice', 1, 1),
      ('org-legacy', 'legacy', 'Legacy', NULL, 'u-alice', 1, 1),
      ('org-private', 'private-hq', 'Private HQ', 'private', 'u-alice', 1, 1);
    INSERT INTO collections (id, org_id, slug, name, created_at) VALUES
      ('col-acme', 'org-acme', 'series', 'Series', 1);
    INSERT INTO namespaces (name, owner_type, owner_id) VALUES ('alice', 'user', 'u-alice');
    INSERT INTO blog_co_authors (blog_id, user_id, added_at, status, show_on_profile) VALUES
      ('ac-1', 'u-alice', 1, 'accepted', 1),
      ('ah-1', 'u-alice', 2, 'accepted', 0),
      ('ap-1', 'u-alice', 3, 'pending', 1);
  `);

  // Newest 26 rows are all excluded by eligibility and must not consume the LIMIT 20.
  for (let i = 0; i < 21; i += 1) {
    addBlog(sqlite, `private-${i}`, { published_as: 'org:org-private', published_at: 1000 + i });
  }
  for (let i = 0; i < 3; i += 1) {
    addBlog(sqlite, `dangling-${i}`, { published_as: 'org:missing', published_at: 900 + i });
  }
  addBlog(sqlite, 'deleted-1', { deleted_at: 1700000000, published_at: 800 });
  addBlog(sqlite, 'review-1', { status: 'under_review', published_at: 850 });
  addBlog(sqlite, 'secret-1', { secret: 1, published_at: 700 });

  // Eligible rows, newest first after the exclusions.
  addBlog(sqlite, 'mo-1', { member_only: 1, published_at: 600 });
  addBlog(sqlite, 'nv-1', { published_as: 'org:org-legacy', published_at: 500 });
  addBlog(sqlite, 'po-1', { published_as: 'org:org-acme', collection_id: 'col-acme', published_at: 450 });
  addBlog(sqlite, 'ac-1', { author_id: 'u-bob', published_at: 400 });
  addBlog(sqlite, 'ah-1', { author_id: 'u-bob', published_at: 401 });
  addBlog(sqlite, 'ap-1', { author_id: 'u-bob', published_at: 402 });
  for (let i = 0; i < 20; i += 1) {
    addBlog(sqlite, `e${i}`, { published_at: 100 + i });
  }
  return sqlite;
}

const EXPECTED_IDS = [
  'mo-1', 'nv-1', 'po-1', 'ac-1',
  ...Array.from({ length: 16 }, (_, i) => `e${19 - i}`),
];

const EXPECTED_PATHS = [
  '/alice/mo-1', '/legacy/nv-1', '/acme/series/po-1', '/bob/ac-1',
  ...Array.from({ length: 16 }, (_, i) => `/alice/e${19 - i}`),
];

const fixture = { context: null };

test.beforeEach(() => {
  fixture.context = useRequestContext({ DB: sqliteD1(setupProfile()) });
  globalThis[RESOLVE_HANDLER] = (request) => resolveGET(request);
});

test.afterEach(() => {
  delete globalThis[RESOLVE_HANDLER];
  fixture.context.restore();
});

async function profile() {
  const response = await resolveGET(new Request('https://blogs.elixpo.com/api/resolve?name=alice'));
  assert.equal(response.status, 200);
  return response.json();
}

test('public profile filters exclusions before LIMIT 20 and fills the list with eligible rows', async () => {
  const data = await profile();
  assert.equal(data.type, 'user');
  assert.equal(data.blogs.length, 20);
  assert.deepEqual(data.blogs.map((blog) => blog.id), EXPECTED_IDS);
  assert.ok(data.blogs.every((blog) => !blog.id.startsWith('private-')));
  assert.ok(data.blogs.every((blog) => !blog.id.startsWith('dangling-')));

  const coauthored = data.blogs.find((blog) => blog.id === 'ac-1');
  assert.equal(coauthored.author_username, 'bob');
  assert.equal(coauthored.is_owner, 0);
  assert.equal(data.blogs.find((blog) => blog.id === 'po-1').org_slug, 'acme');
});

test('profile hasPart advertises exactly the selected eligible article URLs', async () => {
  const element = await pageModule.default({
    params: Promise.resolve({ path: ['alice'] }),
    searchParams: Promise.resolve({}),
  });
  const children = Array.isArray(element.props.children)
    ? element.props.children
    : [element.props.children];
  const script = children.find((child) => child && child.props?.dangerouslySetInnerHTML);
  assert.ok(script);
  const json = JSON.parse(script.props.dangerouslySetInnerHTML.__html);
  const profilePage = json['@graph'].find((node) => node['@type'] === 'ProfilePage');
  const urls = profilePage.hasPart.map((node) => node.url.replace('https://blogs.elixpo.com', ''));

  assert.deepEqual(urls, EXPECTED_PATHS);
  assert.equal(new Set(urls).size, 20);
});
