import test from 'node:test';
import assert from 'node:assert/strict';

let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  // handled by the skip flag below
}
const skip = !DatabaseSync && 'node:sqlite is not available on this runtime';

const { isIndexableBlog, indexableBlogSql } = await import('../lib/indexability.js');

const BASE = {
  status: 'published',
  secret: 0,
  deleted_at: null,
  published_as: 'personal',
};

const PUBLIC_ORG = { id: 'org-public', visibility: 'public' };
const PRIVATE_ORG = { id: 'org-private', visibility: 'PRIVATE' };

const JS_CASES = [
  // Publication shapes that remain eligible.
  ['published personal row', BASE, null, true],
  ['published personal row with NULL published_as', { ...BASE, published_as: null }, null, true],
  ['published personal row with absent published_as', { ...BASE, published_as: undefined }, null, true],
  ['published row owned by a public org', { ...BASE, published_as: 'org:org-public' }, PUBLIC_ORG, true],
  ['published row owned by an org with legacy NULL visibility', { ...BASE, published_as: 'org:org-legacy' }, { id: 'org-legacy', visibility: null }, true],
  ['published row owned by an org with absent visibility', { ...BASE, published_as: 'org:org-legacy' }, { id: 'org-legacy' }, true],
  // Organization references that must not fall through as personal.
  ['uppercase PRIVATE org', { ...BASE, published_as: 'org:org-private' }, PRIVATE_ORG, false],
  ['mixed-case Private org', { ...BASE, published_as: 'org:org-private' }, { id: 'org-private', visibility: 'Private' }, false],
  ['dangling org reference', { ...BASE, published_as: 'org:missing' }, null, false],
  ['org row that does not match the reference', { ...BASE, published_as: 'org:org-public' }, { id: 'org-other', visibility: 'public' }, false],
  ['unknown publication kind', { ...BASE, published_as: 'team:1' }, null, false],
  ['unknown publication kind with an org present', { ...BASE, published_as: 'team:1' }, PUBLIC_ORG, false],
  ['empty publication reference', { ...BASE, published_as: '' }, null, false],
  // Every existing status plus one unknown value.
  ['draft', { ...BASE, status: 'draft' }, null, false],
  ['published', { ...BASE, status: 'published' }, null, true],
  ['unlisted', { ...BASE, status: 'unlisted' }, null, false],
  ['archived', { ...BASE, status: 'archived' }, null, false],
  ['under_review', { ...BASE, status: 'under_review' }, null, false],
  ['trashed', { ...BASE, status: 'trashed' }, null, false],
  ['unknown status', { ...BASE, status: 'scheduled' }, null, false],
  ['NULL status', { ...BASE, status: null }, null, false],
  ['case-variant status', { ...BASE, status: 'Published' }, null, false],
  // Secret flags in both representations produced by the app and D1.
  ['secret 0', { ...BASE, secret: 0 }, null, true],
  ['secret false', { ...BASE, secret: false }, null, true],
  ['secret 1', { ...BASE, secret: 1 }, null, false],
  ['secret true', { ...BASE, secret: true }, null, false],
  ['secret NULL', { ...BASE, secret: null }, null, false],
  ['secret undefined', { ...BASE, secret: undefined }, null, false],
  ['secret string "0"', { ...BASE, secret: '0' }, null, false],
  // Deletion and revision views.
  ['deleted row', { ...BASE, deleted_at: 1700000000 }, null, false],
  ['deleted_at zero is still a deletion marker', { ...BASE, deleted_at: 0 }, null, false],
  ['historical revision view', BASE, null, false, true],
  ['historical revision of an eligible org post', { ...BASE, published_as: 'org:org-public' }, PUBLIC_ORG, false, true],
  // Existing behaviour that must not become new policy inputs.
  ['member_only published post stays indexable', { ...BASE, member_only: 1 }, null, true],
  ['author account_status=disabled does not remove the post', { ...BASE, account_status: 'disabled' }, null, true],
  ['a below-threshold report does not remove the post', { ...BASE, report_count: 1 }, null, true],
  // Defensive.
  ['missing blog row', null, null, false],
  ['undefined blog row', undefined, null, false],
];

test('isIndexableBlog applies the approved policy matrix', () => {
  for (const [name, blog, org, expected, isRevision = false] of JS_CASES) {
    assert.equal(
      isIndexableBlog(blog, { org, isRevision }),
      expected,
      `${name}: expected ${expected}`,
    );
  }
});

test('indexableBlogSql accepts only conservative alias identifiers', () => {
  assert.match(indexableBlogSql(), /b\.status = 'published'/);
  assert.match(indexableBlogSql({ blogAlias: 'bb', orgAlias: 'oo' }), /bb\.status = 'published'/);
  assert.match(indexableBlogSql({ blogAlias: 'bb', orgAlias: 'oo' }), /oo\.id/);
  for (const alias of ['b; DROP TABLE blogs', '1b', 'b.c', '', 'b --', 'b-b', null, 42]) {
    assert.throws(
      () => indexableBlogSql({ blogAlias: alias }),
      /alias/i,
      `alias ${JSON.stringify(alias)} must be rejected`,
    );
  }
  assert.throws(() => indexableBlogSql({ orgAlias: 'o OR 1=1' }), /alias/i);
});

function setupSqlite() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      account_status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE orgs (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      visibility TEXT
    );
    CREATE TABLE blogs (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      author_id TEXT NOT NULL,
      published_as TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      secret INTEGER,
      deleted_at INTEGER,
      member_only INTEGER NOT NULL DEFAULT 0,
      published_at INTEGER
    );
    CREATE TABLE reports (
      id TEXT PRIMARY KEY,
      blog_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
    );
  `);

  sqlite.exec(`
    INSERT INTO users (id, username, account_status) VALUES
      ('u', 'alice', 'active'),
      ('u-disabled', 'bob', 'disabled');
    INSERT INTO orgs (id, slug, name, visibility) VALUES
      ('org-public', 'acme', 'Acme', 'public'),
      ('org-legacy', 'legacy', 'Legacy', NULL),
      ('org-private', 'secret-hq', 'Secret HQ', 'PRIVATE'),
      ('org-other', 'other', 'Other', 'public');
  `);

  const insert = sqlite.prepare(`
    INSERT INTO blogs (id, slug, author_id, published_as, status, secret, deleted_at, member_only, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const add = (id, overrides = {}) => {
    const row = { ...BASE, ...overrides };
    insert.run(
      id,
      id,
      row.account_status === 'disabled' ? 'u-disabled' : 'u',
      row.published_as === undefined ? null : row.published_as,
      row.status === null ? null : row.status,
      row.secret === undefined || row.secret === null || row.secret === '0' ? null : Number(row.secret),
      row.deleted_at === undefined ? null : row.deleted_at,
      row.member_only ? 1 : 0,
      100,
    );
  };

  add('published-personal');
  add('published-null-publication', { published_as: null });
  add('published-public-org', { published_as: 'org:org-public' });
  add('published-legacy-org', { published_as: 'org:org-legacy' });
  add('published-private-org', { published_as: 'org:org-private' });
  add('published-dangling-org', { published_as: 'org:missing' });
  add('published-unknown-kind', { published_as: 'team:1' });
  add('published-empty-reference', { published_as: '' });
  add('draft', { status: 'draft' });
  add('unlisted', { status: 'unlisted' });
  add('archived', { status: 'archived' });
  add('under-review', { status: 'under_review' });
  add('trashed', { status: 'trashed' });
  add('unknown-status', { status: 'scheduled' });
  add('secret-1', { secret: 1 });
  add('secret-null', { secret: null });
  add('deleted', { deleted_at: 1700000000 });
  add('member-only', { member_only: 1 });
  add('disabled-author', { account_status: 'disabled' });
  add('reported-below-threshold', { report_count: 1 });

  sqlite.prepare("INSERT INTO reports (id, blog_id, status) VALUES ('r1', 'reported-below-threshold', 'open')").run();
  return sqlite;
}

test('production SQL agrees with the JS predicate across the same matrix', { skip }, () => {
  const sqlite = setupSqlite();
  const predicate = indexableBlogSql();
  const rows = sqlite.prepare(`
    SELECT b.id, (${predicate}) AS indexable,
           b.status, b.secret, b.deleted_at, b.published_as,
           b.member_only, u.account_status,
           o.id AS org_id, o.visibility AS org_visibility
    FROM blogs b
    JOIN users u ON u.id = b.author_id
    LEFT JOIN orgs o ON ('org:' || o.id) = b.published_as
    ORDER BY b.id
  `).all();

  const seen = new Set();
  for (const row of rows) {
    seen.add(row.id);
    if (row.id === 'secret-null') {
      assert.equal(row.secret, null, 'the parity fixture must preserve NULL secrets');
      assert.equal(Number(row.indexable), 0, 'a NULL secret must be excluded');
    }
    const org = row.org_id ? { id: row.org_id, visibility: row.org_visibility } : null;
    const js = isIndexableBlog(
      {
        status: row.status,
        secret: row.secret,
        deleted_at: row.deleted_at,
        published_as: row.published_as,
        member_only: row.member_only,
        account_status: row.account_status,
      },
      { org },
    );
    assert.equal(Number(row.indexable), js ? 1 : 0, `SQL/JS disagree for ${row.id}`);
  }
  assert.equal(seen.size, 20);
});

test('SQL excludes an org reference that does not match the joined org row', { skip }, () => {
  const sqlite = setupSqlite();
  const predicate = indexableBlogSql({ blogAlias: 'bb', orgAlias: 'oo' });
  const row = sqlite.prepare(`
    SELECT (${predicate}) AS indexable
    FROM blogs bb
    JOIN orgs oo ON oo.id = 'org-other'
    WHERE bb.id = 'published-public-org'
  `).get();
  assert.equal(Number(row.indexable), 0);
});

test('JS and SQL resolve legacy NULL org visibility as public', { skip }, () => {
  const sqlite = setupSqlite();
  const predicate = indexableBlogSql();
  const row = sqlite.prepare(`
    SELECT (${predicate}) AS indexable
    FROM blogs b LEFT JOIN orgs o ON ('org:' || o.id) = b.published_as
    WHERE b.id = 'published-legacy-org'
  `).get();
  assert.equal(Number(row.indexable), 1);
});
