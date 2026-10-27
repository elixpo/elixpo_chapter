// Keyset cursors for the public profile post list. Popular posts are ordered by
// engagement, not by publish time, so their cursor carries the score too.
export function parsePostsCursor(raw, filter) {
  if (!raw) return null;
  const parts = String(raw).split(':');
  const isId = (value) => typeof value === 'string' && value.length > 0;

  if (filter === 'popular') {
    if (parts.length === 3) {
      const score = Number(parts[0]);
      const at = Number(parts[1]);
      if (!Number.isInteger(score) || score < 0) return { error: true };
      if (!Number.isInteger(at) || at < 0 || !isId(parts[2])) return { error: true };
      return { score, at, id: parts[2] };
    }
    // Cursors issued before the score was added only carried the timestamp.
    if (parts.length === 2) {
      const at = Number(parts[0]);
      if (!Number.isInteger(at) || at < 0 || !isId(parts[1])) return { error: true };
      return { at, id: parts[1], legacy: true };
    }
    return { error: true };
  }

  if (parts.length !== 2) return { error: true };
  const at = Number(parts[0]);
  if (!Number.isInteger(at) || at < 0 || !isId(parts[1])) return { error: true };
  return { at, id: parts[1] };
}

export function buildPostsCursor(post, filter) {
  if (post?.published_at == null || post?.published_at === '') return null;
  const at = Number(post.published_at);
  if (!Number.isInteger(at) || at < 0 || !post?.id) return null;
  if (filter === 'popular') {
    const score = Number(post.like_count || 0) + Number(post.comment_count || 0);
    return `${score}:${at}:${post.id}`;
  }
  return `${at}:${post.id}`;
}
