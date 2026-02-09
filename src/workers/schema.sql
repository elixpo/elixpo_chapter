-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  is_active BOOLEAN DEFAULT 1
);

-- Identities (provider-specific user data)
CREATE TABLE IF NOT EXISTS identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL, -- 'google', 'github', etc.
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  provider_profile_url TEXT,
  verified BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(provider, provider_user_id)
);

-- Auth requests (OAuth sessions - state, nonce, PKCE)
CREATE TABLE IF NOT EXISTS auth_requests (
  id TEXT PRIMARY KEY,
  state TEXT UNIQUE NOT NULL,
  nonce TEXT NOT NULL,
  pkce_verifier TEXT NOT NULL,
  provider TEXT NOT NULL,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scopes TEXT, -- comma-separated
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

-- Refresh tokens (hashed)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL, -- sha256(token)
  client_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked BOOLEAN DEFAULT 0,
  revoked_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- OAuth client applications (for multi-tenant SSO)
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL, -- JSON array
  scopes TEXT NOT NULL, -- comma-separated allowed scopes
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT 1
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event_type TEXT NOT NULL, -- 'login', 'logout', 'token_refresh', 'mfa_created', etc.
  provider TEXT,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT, -- 'success', 'failure'
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_identities_user_id ON identities(user_id);
CREATE INDEX IF NOT EXISTS idx_identities_provider_id ON identities(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_auth_requests_state ON auth_requests(state);
CREATE INDEX IF NOT EXISTS idx_auth_requests_expires ON auth_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
