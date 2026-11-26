import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('profile discovery supports owner-selected top picks', async () => {
  const profileRoute = await source('app/api/users/me/route.js');
  const resolver = await source('app/api/resolve/route.js');
  const page = await source('src/views/HandlePage.jsx');

  assert.match(profileRoute, /top_pick_ids/);
  assert.match(profileRoute, /slice\(0, 3\)/);
  assert.match(profileRoute, /b\.secret = 0/);
  assert.match(resolver, /top_pick_ids/);
  assert.match(page, /Save picks/);
  assert.match(page, /aria-pressed=\{selected\}/);
  assert.match(page, /selectedPicks\.length/);
});
