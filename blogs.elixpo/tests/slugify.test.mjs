import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSlug, validateSlug, SLUG_MIN, SLUG_MAX } from '../lib/slugify.js';

test('slugify constants are correctly configured', () => {
  assert.equal(SLUG_MIN, 6);
  assert.equal(SLUG_MAX, 48);
});

test('sanitizeSlug converts mixed case and spaces into lowercase hyphenated strings', () => {
  assert.equal(sanitizeSlug('Hello World'), 'hello-world');
  assert.equal(sanitizeSlug('  My Awesome Project  '), 'my-awesome-project');
  assert.equal(sanitizeSlug('LixBlogs Creator Community'), 'lixblogs-creator-community');
});

test('sanitizeSlug replaces special characters and collapses repeated separators', () => {
  assert.equal(sanitizeSlug('foo@bar#baz!qux'), 'foo-bar-baz-qux');
  assert.equal(sanitizeSlug('org / team (core)'), 'org-team-core');
  assert.equal(sanitizeSlug('hello---world__test..org'), 'hello-world-test-org');
  assert.equal(sanitizeSlug('a   b   c'), 'a-b-c');
});

test('sanitizeSlug trims leading and trailing hyphens and special characters', () => {
  assert.equal(sanitizeSlug('---hello-world---'), 'hello-world');
  assert.equal(sanitizeSlug('!@#hello-world!@#'), 'hello-world');
  assert.equal(sanitizeSlug('-leading-and-trailing-'), 'leading-and-trailing');
});

test('sanitizeSlug respects max length and trims trailing hyphens after slicing', () => {
  assert.equal(sanitizeSlug('1234567890', { max: 5 }), '12345');
  // Slicing "hello-world" to 6 characters produces "hello-", which must re-trim to "hello"
  assert.equal(sanitizeSlug('hello-world', { max: 6 }), 'hello');
  // Default max SLUG_MAX (48) length bounding
  const longInput = 'a'.repeat(60);
  const result = sanitizeSlug(longInput);
  assert.equal(result.length, SLUG_MAX);
  assert.equal(result, 'a'.repeat(SLUG_MAX));
});

test('sanitizeSlug gracefully handles empty and non-string inputs', () => {
  assert.equal(sanitizeSlug(''), '');
  assert.equal(sanitizeSlug(null), '');
  assert.equal(sanitizeSlug(undefined), '');
});

test('validateSlug accepts valid slugs meeting length requirements', () => {
  const res = validateSlug('valid-slug-name');
  assert.deepEqual(res, { ok: true, slug: 'valid-slug-name' });

  const customRes = validateSlug('custom-slug', { min: 5, max: 20 });
  assert.deepEqual(customRes, { ok: true, slug: 'custom-slug' });
});

test('validateSlug rejects slugs shorter than SLUG_MIN and returns label in error', () => {
  const shortRes = validateSlug('short');
  assert.equal(shortRes.ok, false);
  assert.equal(shortRes.slug, 'short');
  assert.equal(shortRes.error, `Name must be at least ${SLUG_MIN} characters (letters/numbers).`);

  const orgRes = validateSlug('tiny', { label: 'Organisation' });
  assert.equal(orgRes.ok, false);
  assert.equal(orgRes.slug, 'tiny');
  assert.equal(orgRes.error, `Organisation must be at least ${SLUG_MIN} characters (letters/numbers).`);

  const groupRes = validateSlug('abc', { label: 'Group' });
  assert.equal(groupRes.ok, false);
  assert.equal(groupRes.error, `Group must be at least ${SLUG_MIN} characters (letters/numbers).`);
});

test('validateSlug respects custom min, max, and label options', () => {
  // Custom min lower than default SLUG_MIN
  const resWithCustomMin = validateSlug('mini', { min: 4, label: 'Reading List' });
  assert.deepEqual(resWithCustomMin, { ok: true, slug: 'mini' });

  // Custom max truncates and validates
  const resWithCustomMax = validateSlug('abcdefghij', { min: 3, max: 6 });
  assert.deepEqual(resWithCustomMax, { ok: true, slug: 'abcdef' });

  // Custom min failure with custom label
  const customFail = validateSlug('hi', { min: 5, label: 'Collection' });
  assert.equal(customFail.ok, false);
  assert.equal(customFail.error, 'Collection must be at least 5 characters (letters/numbers).');
});

test('validateSlug rejects inputs containing no valid alphanumeric characters', () => {
  const emptyResult = validateSlug('!@#$%^&*()');
  assert.equal(emptyResult.ok, false);
  assert.equal(emptyResult.slug, '');
  assert.equal(emptyResult.error, `Name must be at least ${SLUG_MIN} characters (letters/numbers).`);
});
