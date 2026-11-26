import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const ROUTE = 'app/api/collab/status/route.js';

const split = (src) => {
  const i = src.lastIndexOf('catch');
  return [src.slice(0, i), src.slice(i)];
};

test('collab status answers 503 with an error body when the lookup throws', async () => {
  const [, errorPath] = split(await source(ROUTE));

  assert.match(errorPath, /error: 'Collaboration status unavailable'/);
  assert.match(errorPath, /status: 503/);
});

test('collab status never reports an unlocked state from the error path', async () => {
  const [, errorPath] = split(await source(ROUTE));

  assert.doesNotMatch(errorPath, /isLocked/);
  assert.doesNotMatch(errorPath, /hasCollaborators/);
});

test('collab status keeps its normal response shape and auth/permission codes', async () => {
  const [successPath] = split(await source(ROUTE));

  for (const field of ['isLocked', 'isMine', 'lockedBy', 'hasCollaborators', 'isAuthor']) {
    assert.match(successPath, new RegExp(`\\b${field}\\b`));
  }
  for (const code of [400, 401, 403, 404]) {
    assert.match(successPath, new RegExp(`\\b${code}\\b`));
  }
});