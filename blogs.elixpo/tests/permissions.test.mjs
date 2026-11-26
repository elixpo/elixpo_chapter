import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditBlog } from '../lib/permissions.js';

const blog = { id: 'blog-1', author_id: 'author-1', published_as: 'personal' };

// Candidate rows are filtered by the role/status predicates found in the SQL,
// so a changed role list or status literal changes the result instead of being
// masked by canned rows.
function fakeDb({ blogs = [], members = [], coAuthors = [] } = {}) {
  const queries = [];
  return {
    queries,
    prepare(sql) {
      return {
        bind(...values) {
          queries.push({ sql, values });
          const roles = sql.match(/role IN \(([^)]*)\)/)?.[1]
            .split(',')
            .map((role) => role.trim().replaceAll("'", ''));
          const status = sql.match(/status = '([^']+)'/)?.[1];
          return {
            async first() {
              if (sql.includes('FROM blogs')) {
                return blogs.find((row) => row.id === values[0]) ?? null;
              }
              const rows = sql.includes('FROM org_members')
                ? members
                : sql.includes('FROM blog_co_authors')
                  ? coAuthors
                  : null;
              if (!rows) throw new Error(`unexpected query: ${sql}`);
              const [scopeId, userId] = values;
              const row = rows.find(
                (candidate) =>
                  candidate.user_id === userId &&
                  (candidate.org_id ?? candidate.blog_id) === scopeId &&
                  (!roles || roles.includes(candidate.role)) &&
                  (!status || candidate.status === status),
              );
              return row ? { ok: 1 } : null;
            },
          };
        },
      };
    },
  };
}

test('refuses a request with no user', async () => {
  const db = fakeDb({ blogs: [blog] });
  assert.deepEqual(await canEditBlog(db, blog.id, null), { ok: false });
  assert.equal(db.queries.length, 0);
});

test('reports an unknown blog as not found', async () => {
  const db = fakeDb();
  assert.deepEqual(await canEditBlog(db, 'blog-404', 'author-1'), { ok: false, notFound: true });
  assert.deepEqual(db.queries.map(({ values }) => values), [['blog-404']]);
});

test('allows the author', async () => {
  const db = fakeDb({ blogs: [blog] });
  assert.deepEqual(await canEditBlog(db, blog.id, blog.author_id), { ok: true });
  assert.deepEqual(db.queries.map(({ values }) => values), [['blog-1']]);
});

test('allows an org member with write access', async () => {
  const orgBlog = { id: 'blog-2', author_id: 'author-1', published_as: 'org:org-1' };
  const db = fakeDb({
    blogs: [orgBlog],
    members: [{ org_id: 'org-1', user_id: 'member-1', role: 'write' }],
  });
  assert.deepEqual(await canEditBlog(db, orgBlog.id, 'member-1'), { ok: true });
  assert.deepEqual(db.queries.map(({ values }) => values), [['blog-2'], ['org-1', 'member-1']]);
});

test('allows an accepted editor co-author', async () => {
  const db = fakeDb({
    blogs: [blog],
    coAuthors: [{ blog_id: 'blog-1', user_id: 'editor-1', status: 'accepted', role: 'editor' }],
  });
  assert.deepEqual(await canEditBlog(db, blog.id, 'editor-1'), { ok: true });
  assert.deepEqual(db.queries.map(({ values }) => values), [['blog-1'], ['blog-1', 'editor-1']]);
});

test('refuses a viewer co-author', async () => {
  const db = fakeDb({
    blogs: [blog],
    coAuthors: [{ blog_id: 'blog-1', user_id: 'viewer-1', status: 'accepted', role: 'viewer' }],
  });
  assert.deepEqual(await canEditBlog(db, blog.id, 'viewer-1'), { ok: false });
  assert.deepEqual(db.queries.map(({ values }) => values), [['blog-1'], ['blog-1', 'viewer-1']]);
});
