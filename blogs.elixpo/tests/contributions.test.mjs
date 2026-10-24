import test from 'node:test';
import assert from 'node:assert/strict';
import { contributionDateKey } from '../lib/contributions.js';

const epoch = (iso) => Math.floor(new Date(iso).getTime() / 1000);

test('formats a UTC epoch as YYYY-MM-DD', () => {
  assert.equal(contributionDateKey(epoch('2026-03-15T12:00:00Z'), 'UTC'), '2026-03-15');
});

test('crosses the midnight boundary in a fixed positive offset', () => {
  assert.equal(contributionDateKey(epoch('2025-12-31T23:59:00Z'), 'Asia/Tokyo'), '2026-01-01');
  assert.equal(contributionDateKey(epoch('2026-06-15T10:00:00Z'), 'Asia/Kolkata'), '2026-06-15');
});

test('uses the offset in effect on each date across DST', () => {
  // 23:30 on June 30 in New York (EDT, UTC-4).
  assert.equal(contributionDateKey(epoch('2026-07-01T03:30:00Z'), 'America/New_York'), '2026-06-30');
  // 23:30 on December 31 in New York (EST, UTC-5).
  assert.equal(contributionDateKey(epoch('2026-01-01T04:30:00Z'), 'America/New_York'), '2025-12-31');
});

test('handles both sides of the spring DST transition', () => {
  assert.equal(contributionDateKey(epoch('2026-03-08T04:30:00Z'), 'America/New_York'), '2026-03-07');
  assert.equal(contributionDateKey(epoch('2026-03-08T07:30:00Z'), 'America/New_York'), '2026-03-08');
});

test('handles leap day and negative offsets', () => {
  assert.equal(contributionDateKey(epoch('2028-02-29T15:00:00Z'), 'UTC'), '2028-02-29');
  assert.equal(contributionDateKey(epoch('2026-01-01T03:00:00Z'), 'America/New_York'), '2025-12-31');
});

test('invalid input and unknown zones fall back safely', () => {
  assert.equal(contributionDateKey(null), null);
  assert.equal(contributionDateKey(undefined), null);
  assert.equal(contributionDateKey(epoch('2026-03-15T12:00:00Z'), 'Invalid/Zone'), '2026-03-15');
});
