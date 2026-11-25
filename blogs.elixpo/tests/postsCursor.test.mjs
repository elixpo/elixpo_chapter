import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPostsCursor, parsePostsCursor } from '../lib/postsCursor.js';

test('builds score cursors for popular posts', () => {
  const cursor = buildPostsCursor({ id: 'post-1', published_at: 1700000000, like_count: 4, comment_count: 2 }, 'popular');
  assert.equal(cursor, '6:1700000000:post-1');
  assert.deepEqual(parsePostsCursor(cursor, 'popular'), { score: 6, at: 1700000000, id: 'post-1' });
});

test('builds date cursors for other filters', () => {
  assert.equal(buildPostsCursor({ id: 'post-1', published_at: 1700000000 }, 'newest'), '1700000000:post-1');
  assert.deepEqual(parsePostsCursor('1700000000:post-1', 'newest'), { at: 1700000000, id: 'post-1' });
});

test('accepts a legacy two-part popular cursor', () => {
  assert.deepEqual(parsePostsCursor('1700000000:post-1', 'popular'), {
    at: 1700000000, id: 'post-1', legacy: true,
  });
});

test('rejects malformed and non-numeric cursors', () => {
  for (const raw of ['abc:def', '1:2:3:4', 'NaN:post-1', '-1:post-1', '1:', '1:2:']) {
    assert.equal(parsePostsCursor(raw, 'popular')?.error, true, raw);
    assert.equal(parsePostsCursor(raw, 'newest')?.error, true, raw);
  }
});

test('skips cursor construction when the post has no publish date', () => {
  assert.equal(buildPostsCursor({ id: 'post-1', published_at: null }, 'newest'), null);
  assert.equal(buildPostsCursor({ id: 'post-1', published_at: 'x' }, 'popular'), null);
});
