import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrgVisibility } from '../lib/orgVisibility.js';

test('accepts the supported visibility modes', () => {
  assert.equal(normalizeOrgVisibility('public'), 'public');
  assert.equal(normalizeOrgVisibility('private'), 'private');
  assert.equal(normalizeOrgVisibility(' PRIVATE '), 'private');
  assert.equal(normalizeOrgVisibility('Public'), 'public');
});

test('uses the fallback for missing values', () => {
  assert.equal(normalizeOrgVisibility(undefined), 'public');
  assert.equal(normalizeOrgVisibility(null), 'public');
  assert.equal(normalizeOrgVisibility(''), 'public');
  assert.equal(normalizeOrgVisibility(undefined, null), null);
});

test('rejects values that would bypass privacy checks', () => {
  for (const value of ['hidden', 'PRIVATE ', 'members', 'unlisted', '0', 1, {}, []]) {
    if (typeof value === 'string' && value.trim().toLowerCase() === 'private') continue;
    assert.equal(normalizeOrgVisibility(value), null, String(value));
  }
});
