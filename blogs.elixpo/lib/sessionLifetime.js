// How long a LixBlogs sign-in lasts. This is the session's own lifetime and is
// independent of the Accounts access token, which expires within the hour and
// is only used for best-effort profile resync in /api/auth/me.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

export function sessionExpiresAtFrom(now = Date.now()) {
  return now + SESSION_MAX_AGE * 1000;
}

// Sessions signed before sessionExpiresAt existed carried only the access
// token's `expiresAt`. Treating that as the session expiry signed people out
// as soon as the token lapsed, so legacy cookies are bounded by the cookie's
// own max-age instead.
export function isSessionExpired(session, now = Date.now()) {
  if (!session) return true;
  return Number.isFinite(session.sessionExpiresAt) && now > session.sessionExpiresAt;
}
