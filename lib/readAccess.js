const BLOG_ALIAS_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function validateAlias(alias) {
  if (!BLOG_ALIAS_PATTERN.test(alias)) {
    throw new TypeError('SQL aliases must be simple identifiers.');
  }
  return alias;
}

/**
 * Visibility shared by public blog reads. Private-org posts must be handled by
 * an authenticated policy before a route returns them. Member-only posts stay
 * listed: they are public teasers behind a paywall and remain indexable (see
 * lib/indexability.js), so search keeps returning them as before.
 */
export function publicBlogVisibilityWhere({ blogAlias = 'b', orgAlias = 'o' } = {}) {
  const blog = validateAlias(blogAlias);
  const org = validateAlias(orgAlias);
  return [
    `${blog}.deleted_at IS NULL`,
    `(${blog}.published_as IS NULL OR ${blog}.published_as = 'personal' OR (${org}.id IS NOT NULL AND LOWER(COALESCE(${org}.visibility, 'public')) != 'private'))`,
  ].join(' AND ');
}

/**
 * Secret posts remain publicly readable, but their author fields are never
 * exposed. Keep this redaction at the shared policy boundary.
 */
export function redactSecretBlogAuthor(row) {
  if (!row || !row.secret) return row;
  const {
    author_id: _authorId,
    author_username: _authorUsername,
    author_name: _authorName,
    author_avatar: _authorAvatar,
    ...safe
  } = row;
  return safe;
}
