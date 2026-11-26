import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('unavailable author accounts resolve as public 404s', async () => {
  const resolve = await source('app/api/resolve/route.js');
  assert.match(resolve, /account_status/);
  assert.match(resolve, /\["disabled", "removed"\]/);
  assert.match(resolve, /status: 404/);
});

test('author cards omit the banner strip when no banner is resolved', async () => {
  const card = await source('app/api/og/route.js');
  assert.match(card, /const bannerSrc = hasBanner \? banner : ""/);
  assert.match(card, /\{bannerSrc \? \(/);
  assert.doesNotMatch(card, /Banner strip — always present/);
});

test('Person structured data uses absolute public media URLs', async () => {
  const page = await source('app/[...path]/page.jsx');
  assert.match(page, /seoMediaUrl\(u\.avatar_url \|\| u\.avatar_r2_key/);
  assert.match(page, /seoMediaUrl\(u\.banner_r2_key/);
  assert.doesNotMatch(page, /img\(\/api\/media\/\$\{u\.banner_r2_key\}\)/);
});
