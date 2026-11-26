import test from 'node:test';
import assert from 'node:assert/strict';
import { publicBlogVisibilityWhere, redactSecretBlogAuthor } from '../lib/readAccess.js';

test('public blog visibility requires an active row outside private organisations', () => {
  assert.equal(
    publicBlogVisibilityWhere(),
    "b.deleted_at IS NULL AND (b.published_as IS NULL OR b.published_as = 'personal' OR (o.id IS NOT NULL AND LOWER(COALESCE(o.visibility, 'public')) != 'private'))",
  );
});

test('member-only posts stay publicly listed, consistent with indexability', () => {
  // Paywalled posts are public teasers (lib/indexability.js keeps them indexable).
  assert.doesNotMatch(publicBlogVisibilityWhere(), /member_only/);
});

test('visibility SQL validates aliases before interpolating them', () => {
  assert.throws(
    () => publicBlogVisibilityWhere({ blogAlias: 'b; DROP TABLE blogs' }),
    /simple identifiers/,
  );
});

test('secret blog rows redact every author identity field', () => {
  assert.deepEqual(redactSecretBlogAuthor({
    id: 'blog-1',
    secret: 1,
    author_id: 'user-1',
    author_username: 'writer',
    author_name: 'Writer',
    author_avatar: 'avatar.webp',
    title: 'Anonymous post',
  }), {
    id: 'blog-1',
    secret: 1,
    title: 'Anonymous post',
  });
});
