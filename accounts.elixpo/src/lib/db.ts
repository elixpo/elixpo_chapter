/**
 * Database utilities for D1
 * Import this in API routes to interact with the D1 database
 */

import type { D1Database } from '@cloudflare/workers-types';

export async function createUser(
  db: D1Database,
  { id, email, passwordHash }: { id: string; email: string; passwordHash?: string }
) {
  const stmt = db.prepare(
    'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET updated_at = CURRENT_TIMESTAMP'
  );
  return await stmt.bind(id, email, passwordHash || null).run();
}

export async function getUserById(db: D1Database, userId: string) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return await stmt.bind(userId).first();
}

export async function getUserByEmail(db: D1Database, email: string) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1');
  return await stmt.bind(email).first();
}

export async function getUserByEmailWithPassword(db: D1Database, email: string) {
  const stmt = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ? AND is_active = 1');
  return await stmt.bind(email).first();
}

export async function createIdentity(
  db: D1Database,
  {
    id,
    userId,
    provider,
    providerUserId,
    providerEmail,
    providerProfileUrl,
  }: {
    id: string;
    userId: string;
    provider: string;
    providerUserId: string;
    providerEmail?: string;
    providerProfileUrl?: string;
  }
) {
  const stmt = db.prepare(
    `INSERT INTO identities (id, user_id, provider, provider_user_id, provider_email, provider_profile_url)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, provider_user_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`
  );
  return await stmt.bind(
    id,
    userId,
    provider,
    providerUserId,
    providerEmail || null,
    providerProfileUrl || null
  ).run();
}

export async function getIdentityByProvider(
  db: D1Database,
  provider: string,
  providerUserId: string
) {
  const stmt = db.prepare(
    'SELECT * FROM identities WHERE provider = ? AND provider_user_id = ?'
  );
  return await stmt.bind(provider, providerUserId).first();
}

export async function createAuthRequest(
  db: D1Database,
  {
    id,
    state,
    nonce,
    pkceVerifier,
    provider,
    clientId,
    redirectUri,
    scopes,
    expiresAt,
  }: {
    id: string;
    state: string;
    nonce: string;
    pkceVerifier: string;
    provider: string;
    clientId: string;
    redirectUri: string;
    scopes?: string;
    expiresAt: Date;
  }
) {
  const stmt = db.prepare(
    `INSERT INTO auth_requests (id, state, nonce, pkce_verifier, provider, client_id, redirect_uri, scopes, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  return await stmt.bind(
    id,
    state,
    nonce,
    pkceVerifier,
    provider,
    clientId,
    redirectUri,
    scopes || null,
    expiresAt.toISOString()
  ).run();
}

export async function getAuthRequestByState(db: D1Database, state: string) {
  const stmt = db.prepare(
    'SELECT * FROM auth_requests WHERE state = ? AND expires_at > CURRENT_TIMESTAMP'
  );
  return await stmt.bind(state).first();
}

export async function deleteAuthRequest(db: D1Database, state: string) {
  const stmt = db.prepare('DELETE FROM auth_requests WHERE state = ?');
  return await stmt.bind(state).run();
}

export async function createRefreshToken(
  db: D1Database,
  {
    id,
    userId,
    tokenHash,
    clientId,
    expiresAt,
  }: {
    id: string;
    userId: string;
    tokenHash: string;
    clientId?: string;
    expiresAt: Date;
  }
) {
  const stmt = db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, client_id, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  return await stmt.bind(id, userId, tokenHash, clientId || null, expiresAt.toISOString()).run();
}

export async function getRefreshTokenByHash(db: D1Database, tokenHash: string) {
  const stmt = db.prepare(
    'SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP AND revoked = 0'
  );
  return await stmt.bind(tokenHash).first();
}

export async function revokeRefreshToken(db: D1Database, tokenHash: string) {
  const stmt = db.prepare(
    'UPDATE refresh_tokens SET revoked = 1, revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?'
  );
  return await stmt.bind(tokenHash).run();
}

export async function updateUserLastLogin(db: D1Database, userId: string) {
  const stmt = db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?');
  return await stmt.bind(userId).run();
}

export async function logAuditEvent(
  db: D1Database,
  {
    id,
    userId,
    eventType,
    provider,
    ipAddress,
    userAgent,
    status,
    errorMessage,
  }: {
    id: string;
    userId?: string;
    eventType: string;
    provider?: string;
    ipAddress?: string;
    userAgent?: string;
    status: 'success' | 'failure';
    errorMessage?: string;
  }
) {
  const stmt = db.prepare(
    `INSERT INTO audit_logs (id, user_id, event_type, provider, ip_address, user_agent, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  return await stmt.bind(
    id,
    userId || null,
    eventType,
    provider || null,
    ipAddress || null,
    userAgent || null,
    status,
    errorMessage || null
  ).run();
}
