import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PUBLIC_SITEMAP_CACHE_KEY } from '../lib/cache.js';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the shared sitemap cache is versioned for the named eligible-row shape', async () => {
  const producer = await source('lib/sitemapData.js');

  assert.equal(PUBLIC_SITEMAP_CACHE_KEY, 'v3:public-sitemap-rows');
  // Behavior coverage for the key, TTL and row shape lives in
  // tests/sitemapEligibility.test.mjs; this keeps producer wiring visible.
  assert.match(producer, /kvCache\(PUBLIC_SITEMAP_CACHE_KEY, 300,/);
});

test('blog lifecycle invalidation also refreshes crawler discovery', async () => {
  const lifecycle = await source('lib/api/v1/blogCache.js');
  const webPublish = await source('app/api/blogs/publish/route.js');
  const webDelete = await source('app/api/blogs/[slugid]/route.js');

  assert.match(lifecycle, /PUBLIC_SITEMAP_CACHE_KEY/);
  assert.match(webPublish, /invalidateBlogLifecycleCaches\(slugid\b/);
  assert.match(webDelete, /invalidateBlogLifecycleCaches\(slugid\b/);
});
