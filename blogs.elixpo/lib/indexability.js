// Crawler indexability policy. The JS predicate and its SQL counterpart live
// here so the sitemaps, article metadata and public profiles share one owner.
//
// Eligible: status exactly 'published', secret exactly 0/false, not deleted,
// and either a personal publication (NULL/'personal') or a publication owned by
// an existing organization whose visibility is not private. An unknown
// published_as value (including '') is not personal and is excluded rather than
// falling through as a personal post.

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PERSONAL_PUBLICATION = 'personal';

function assertAlias(alias, name) {
  if (typeof alias !== 'string' || !IDENTIFIER.test(alias)) {
    throw new TypeError(`indexableBlogSql: unsafe ${name} alias ${JSON.stringify(alias)}`);
  }
}

export function isIndexableBlog(blog, { org = null, isRevision = false } = {}) {
  if (!blog || isRevision) return false;
  if (blog.status !== 'published') return false;
  if (blog.secret !== 0 && blog.secret !== false) return false;
  // D1/blog rows express "not deleted" as absent or NULL.
  if (blog.deleted_at !== null && blog.deleted_at !== undefined) return false;

  const publishedAs = blog.published_as;
  if (publishedAs === null || publishedAs === undefined || publishedAs === PERSONAL_PUBLICATION) {
    return true;
  }

  // Any other reference must resolve to the org row the caller actually loaded.
  if (!org || org.id === null || org.id === undefined) return false;
  if (publishedAs !== `org:${org.id}`) return false;
  return String(org.visibility || 'public').toLowerCase() !== 'private';
}

// Requires the blog alias to be LEFT JOINed to the org alias by organization id
// (e.g. `o.id = substr(b.published_as, 5)`), so the join can use the org primary
// key. Aliases are code-supplied identifiers, never user data.
export function indexableBlogSql({ blogAlias = 'b', orgAlias = 'o' } = {}) {
  assertAlias(blogAlias, 'blogAlias');
  assertAlias(orgAlias, 'orgAlias');
  const b = blogAlias;
  const o = orgAlias;
  return `(${b}.status = 'published' AND ${b}.secret = 0 AND ${b}.deleted_at IS NULL AND (${b}.published_as IS NULL OR ${b}.published_as = '${PERSONAL_PUBLICATION}' OR (${b}.published_as = ('org:' || ${o}.id) AND LOWER(COALESCE(${o}.visibility, 'public')) != 'private')))`;
}
