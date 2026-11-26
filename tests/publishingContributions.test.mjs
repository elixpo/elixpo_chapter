import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('contribution aggregate excludes hidden and private activity', async () => {
  const route = await source('app/api/users/[username]/contributions/route.js');
  assert.match(route, /COALESCE\(member_only, 0\) = 0/);
  assert.match(route, /deleted_at IS NULL/);
  assert.match(route, /secret = 0/);
  assert.match(route, /LOWER\(COALESCE\(o\.visibility, 'public'\)\) != 'private'/);
  assert.match(route, /SELECT published_at/);
  assert.doesNotMatch(route, /SELECT b\.id|SELECT \*|blog_id/);
});

test('graph exposes accessible labels for keyboard and screen-reader users', async () => {
  const graph = await source('src/components/ContributionGraph.jsx');
  assert.match(graph, /role="img"/);
  assert.match(graph, /aria-label="Activity intensity legend"/);
  assert.match(graph, /aria-label=\{label\}/);
  assert.match(graph, /onKeyDown/);
});

test('lifecycle invalidation includes the author contribution cache', async () => {
  const cache = await source('lib/api/v1/blogCache.js');
  assert.match(cache, /v1:contributions:\$\{name\}:\$\{zone\}/);
  assert.match(cache, /'UTC'/);
  // The route keys the cache by the canonical zone, so invalidation must too.
  assert.match(cache, /normalizeTimezone\(author\.timezone/);
});

test('a stored zone alias invalidates the same key the route caches under', async () => {
  const { normalizeTimezone } = await import('../lib/contributions.js');
  // Accounts can store an alias; the route canonicalises it before keying.
  assert.equal(normalizeTimezone('Asia/Kolkata'), normalizeTimezone('Asia/Calcutta'));
});
