import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('public profiles render banner_r2_key and omit empty banner images', async () => {
  const page = await source('src/views/HandlePage.jsx');
  assert.match(page, /u\.banner_r2_key\s*\n\s*\?\s*`\/api\/media\/\$\{u\.banner_r2_key\}/);
  assert.match(page, /\{bannerSrc && \(/);
  assert.match(page, /aspectRatio: "16 \/ 5"/);
});

test('media proxy optimizes banner public IDs only', async () => {
  const route = await source('app/api/media/[...path]/route.js');
  assert.match(route, /publicId\.endsWith\('\/banner'\)/);
  assert.match(route, /getBannerUrl\(publicId\)/);
  assert.match(route, /getCloudinaryUrl\(publicId\)/);
});
