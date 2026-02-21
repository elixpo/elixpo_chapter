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

/**
 * OAuth Client Management
 * For registering and managing OAuth applications
 */

export async function createOAuthClient(
  db: D1Database,
  {
    clientId,
    clientSecretHash,
    name,
    redirectUris,
    scopes,
  }: {
    clientId: string;
    clientSecretHash: string;
    name: string;
    redirectUris: string; // JSON stringified array
    scopes: string; // JSON stringified array
  }
) {
  const stmt = db.prepare(
    `INSERT INTO oauth_clients (client_id, client_secret_hash, name, redirect_uris, scopes)
     VALUES (?, ?, ?, ?, ?)`
  );
  return await stmt.bind(clientId, clientSecretHash, name, redirectUris, scopes).run();
}

export async function getOAuthClientById(db: D1Database, clientId: string) {
  const stmt = db.prepare(
    'SELECT client_id, name, redirect_uris, scopes, created_at, is_active FROM oauth_clients WHERE client_id = ?'
  );
  return await stmt.bind(clientId).first();
}

export async function getOAuthClientByIdWithSecret(db: D1Database, clientId: string) {
  const stmt = db.prepare(
    'SELECT * FROM oauth_clients WHERE client_id = ?'
  );
  return await stmt.bind(clientId).first();
}

export async function validateOAuthClient(
  db: D1Database,
  clientId: string,
  clientSecretHash: string
): Promise<boolean> {
  const stmt = db.prepare(
    'SELECT 1 FROM oauth_clients WHERE client_id = ? AND client_secret_hash = ? AND is_active = 1'
  );
  const result = await stmt.bind(clientId, clientSecretHash).first();
  return !!result;
}

export async function updateOAuthClient(
  db: D1Database,
  clientId: string,
  updates: {
    name?: string;
    redirectUris?: string;
    scopes?: string;
    isActive?: boolean;
  }
) {
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    values.push(updates.name);
  }
  if (updates.redirectUris !== undefined) {
    setClauses.push('redirect_uris = ?');
    values.push(updates.redirectUris);
  }
  if (updates.scopes !== undefined) {
    setClauses.push('scopes = ?');
    values.push(updates.scopes);
  }
  if (updates.isActive !== undefined) {
    setClauses.push('is_active = ?');
    values.push(updates.isActive ? 1 : 0);
  }

  if (setClauses.length === 0) {
    return null;
  }

  values.push(clientId);

  const stmt = db.prepare(
    `UPDATE oauth_clients SET ${setClauses.join(', ')} WHERE client_id = ?`
  );
  return await stmt.bind(...(values as (string | number)[])).run();
}

export async function listOAuthClients(db: D1Database, limit: number = 50, offset: number = 0) {
  const stmt = db.prepare(
    'SELECT client_id, name, created_at, is_active FROM oauth_clients ORDER BY created_at DESC LIMIT ? OFFSET ?'
  );
  return await stmt.bind(limit, offset).all();
}

/**
 * Privilege/Role Management
 * For fine-grained access control
 */

export async function createPrivilege(
  db: D1Database,
  {
    id,
    code,
    name,
    description,
    isSystem,
  }: {
    id: string;
    code: string;
    name: string;
    description?: string;
    isSystem?: boolean;
  }
) {
  const stmt = db.prepare(
    `INSERT INTO privileges (id, code, name, description, is_system)
     VALUES (?, ?, ?, ?, ?)`
  );
  return await stmt.bind(id, code, name, description || null, isSystem ? 1 : 0).run();
}

export async function getPrivilegeByCode(db: D1Database, code: string) {
  const stmt = db.prepare('SELECT * FROM privileges WHERE code = ?');
  return await stmt.bind(code).first();
}

export async function grantPrivilegeToUser(
  db: D1Database,
  {
    id,
    userId,
    privilegeId,
    grantedBy,
    expiryDate,
    reason,
  }: {
    id: string;
    userId: string;
    privilegeId: string;
    grantedBy?: string;
    expiryDate?: Date;
    reason?: string;
  }
) {
  const stmt = db.prepare(
    `INSERT INTO user_privileges (id, user_id, privilege_id, granted_by, expiry_date, reason)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  return await stmt.bind(
    id,
    userId,
    privilegeId,
    grantedBy || null,
    expiryDate ? expiryDate.toISOString() : null,
    reason || null
  ).run();
}

export async function revokePrivilegeFromUser(db: D1Database, userId: string, privilegeId: string) {
  const stmt = db.prepare(
    'DELETE FROM user_privileges WHERE user_id = ? AND privilege_id = ?'
  );
  return await stmt.bind(userId, privilegeId).run();
}

export async function getUserPrivileges(db: D1Database, userId: string) {
  const stmt = db.prepare(
    `SELECT p.id, p.code, p.name, p.description, up.granted_at, up.expiry_date
     FROM user_privileges up
     JOIN privileges p ON up.privilege_id = p.id
     WHERE up.user_id = ? AND (up.expiry_date IS NULL OR up.expiry_date > CURRENT_TIMESTAMP)`
  );
  return await stmt.bind(userId).all();
}

export async function hasPrivilege(db: D1Database, userId: string, privilegeCode: string): Promise<boolean> {
  const stmt = db.prepare(
    `SELECT 1 FROM user_privileges up
     JOIN privileges p ON up.privilege_id = p.id
     WHERE up.user_id = ? AND p.code = ? AND (up.expiry_date IS NULL OR up.expiry_date > CURRENT_TIMESTAMP)`
  );
  const result = await stmt.bind(userId, privilegeCode).first();
  return !!result;
}

export async function listPrivileges(db: D1Database) {
  const stmt = db.prepare('SELECT * FROM privileges ORDER BY name');
  return await stmt.all();
}
