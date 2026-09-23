import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BLOG_LICENSES,
  COLLECTION_VISIBILITIES,
  collectionSlug,
  publicBlogHref,
  serializeCuratedEntry,
} from '../lib/curatedCollections.js';

test('curated collections expose bounded visibility and license values', () => {
  assert.deepEqual([...COLLECTION_VISIBILITIES], ['private', 'unlisted', 'public']);
  assert.equal(BLOG_LICENSES.has('all-rights-reserved'), true);
  assert.equal(BLOG_LICENSES.has('cc-by-4.0'), true);
});

test('collection slugs are stable and URL safe', () => {
  assert.equal(collectionSlug('  Systems & Society  '), 'systems-society');
});

test('canonical blog links preserve the original publication target', () => {
  assert.equal(publicBlogHref({ author_username: 'ada', slug: 'notes' }), '/ada/notes');
  assert.equal(publicBlogHref({ org_slug: 'labs', slug: 'notes' }), '/labs/notes');
  assert.equal(
    publicBlogHref({ org_slug: 'labs', publication_collection_slug: 'research', slug: 'notes' }),
    '/labs/research/notes',
  );
});

test('serialized entries retain attribution and license', () => {
  const entry = serializeCuratedEntry({
    blog_id: 'blog-1',
    slug: 'a-post',
    title: 'A post',
    author_id: 'user-1',
    author_username: 'writer',
    author_name: 'Writer',
    license: 'cc-by-4.0',
    position: 2,
  });
  assert.equal(entry.author.username, 'writer');
  assert.equal(entry.license, 'cc-by-4.0');
  assert.equal(entry.canonicalUrl, '/writer/a-post');
  assert.equal(entry.position, 2);
});
