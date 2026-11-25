import test from 'node:test';
import assert from 'node:assert/strict';
import { isSessionExpired, SESSION_MAX_AGE, sessionExpiresAtFrom } from '../lib/sessionLifetime.js';

const DAY = 24 * 60 * 60 * 1000;
const t0 = Date.UTC(2026, 9, 1);

test('a sign-in lasts 30 days', () => {
  assert.equal(SESSION_MAX_AGE, 30 * 24 * 60 * 60);
  const session = { userId: 'u1', sessionExpiresAt: sessionExpiresAtFrom(t0) };
  assert.equal(isSessionExpired(session, t0 + 29 * DAY), false);
  assert.equal(isSessionExpired(session, t0 + 31 * DAY), true);
});

test('an expired Accounts access token does not end the session', () => {
  // The bug: the access token lapses within the hour and its expiry was
  // treated as the session expiry, signing people out.
  const session = {
    userId: 'u1',
    accessTokenExpiresAt: t0 + 60 * 60 * 1000,
    sessionExpiresAt: sessionExpiresAtFrom(t0),
  };
  assert.equal(isSessionExpired(session, t0 + 2 * DAY), false);
});

test('legacy cookies with only the access-token expiresAt stay signed in', () => {
  const legacy = { userId: 'u1', expiresAt: t0 + 60 * 60 * 1000 };
  assert.equal(isSessionExpired(legacy, t0 + 2 * DAY), false);
});

test('a missing session counts as expired', () => {
  assert.equal(isSessionExpired(null, t0), true);
});
