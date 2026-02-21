# OAuth Application Registration & Setup Guide

This guide walks you through setting up OAuth-based authentication for your Elixpo Accounts system with Google and GitHub.

## 1. Database Schema Verification ✓

All required tables are in place:

```sql
-- Users table
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ...
);

-- OAuth Client Registration table (NEW - for registering applications)
CREATE TABLE oauth_clients (
    client_id TEXT PRIMARY KEY,
    client_secret_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,  -- JSON array
    scopes TEXT NOT NULL,         -- JSON array
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1
);

-- OAuth state/request tracking
CREATE TABLE auth_requests (
    id TEXT PRIMARY KEY,
    state TEXT UNIQUE NOT NULL,
    nonce TEXT NOT NULL,
    pkce_verifier TEXT NOT NULL,
    provider TEXT NOT NULL,
    client_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    scopes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
);

-- Provider-specific user identities
CREATE TABLE identities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    ...
    UNIQUE(provider, provider_user_id)
);

-- Refresh token management
CREATE TABLE refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    client_id TEXT,
    expires_at DATETIME NOT NULL,
    revoked BOOLEAN DEFAULT 0,
    ...
);

-- Audit logging
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    event_type TEXT NOT NULL,
    provider TEXT,
    ip_address TEXT,
    user_agent TEXT,
    status TEXT,
    ...
);
```

## 2. New API Endpoints

### Register a New OAuth Application
```bash
POST /api/auth/oauth-clients
Content-Type: application/json

{
  "name": "My App",
  "redirect_uris": ["https://myapp.com/callback"],
  "scopes": ["openid", "profile", "email"]
}
```

**Response:**
```json
{
  "client_id": "cli_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "client_secret": "secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "name": "My App",
  "redirect_uris": ["https://myapp.com/callback"],
  "scopes": ["openid", "profile", "email"],
  "created_at": "2025-02-21T10:00:00Z",
  "note": "Store client_secret securely. It will not be retrievable after this response."
}
```

**IMPORTANT:** Save the `client_secret` immediately - it won't be shown again!

### Get Application Details
```bash
GET /api/auth/oauth-clients?client_id=cli_xxxxx
```

### Update Application
```bash
PUT /api/auth/oauth-clients/cli_xxxxx
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/json

{
  "name": "Updated Name",
  "redirect_uris": ["https://newuri.com/callback"],
  "scopes": ["openid", "profile"]
}
```

### Deactivate Application
```bash
DELETE /api/auth/oauth-clients/cli_xxxxx
Authorization: Basic base64(client_id:client_secret)
```

## 3. Setting up Google OAuth

### Step 1: Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project: `Elixpo Accounts`
3. Enable the following APIs:
   - Google+ API (or Google Identity)
   - OAuth 2.0

### Step 2: Create OAuth 2.0 Credentials
1. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client IDs**
2. Choose **Web application**
3. Add authorized redirect URIs:
   - Development: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://auth.elixpo.com/api/auth/callback/google`
4. Download and save: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

### Step 3: Add to .env.local
```dotenv
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

## 4. Setting up GitHub OAuth

### Step 1: Create GitHub OAuth Application
1. Go to [GitHub Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name:** Elixpo Accounts
   - **Homepage URL:** `https://auth.elixpo.com` (or `http://localhost:3000` for dev)
   - **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github` (dev)
     Or: `https://auth.elixpo.com/api/auth/callback/github` (production)

### Step 2: Copy Credentials
1. Copy `Client ID` and `Client Secret`
2. Store securely

### Step 3: Add to .env.local
```dotenv
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
NEXT_PUBLIC_GITHUB_CLIENT_ID=your-github-client-id
```

## 5. Environment Configuration

Complete `.env.local` should have:

```dotenv
# Cloudflare Account
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ZONE_ID=your-zone-id

# D1 Database
CLOUDFLARE_DATABASE_ID=your-d1-id
D1_DATABASE_NAME=elixpo_auth
D1_BINDING_NAME=DB

# Environment
ENVIRONMENT=development
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-jwt-secret-key-change-this-in-production
JWT_EXPIRATION_MINUTES=15
REFRESH_TOKEN_EXPIRATION_DAYS=30

# URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
NEXT_PUBLIC_GITHUB_CLIENT_ID=your-github-client-id

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM_EMAIL=noreply@elixpo.com
SMTP_FROM_NAME=Elixpo Accounts
```

## 6. Cloudflare Wrangler Setup

### Install Wrangler
```bash
npm install -g wrangler
# or locally
npm install wrangler --save-dev
```

### Authenticate with Cloudflare
```bash
wrangler login
# Follow the browser prompts to authorize
```

### Create D1 Database
```bash
wrangler d1 create elixpo_auth
```

### Update wrangler.toml
```toml
name = "elixpo-accounts-workers"
main = "src/workers/index.ts"
type = "service"
compatibility_date = "2025-12-16"

# Cloudflare D1 Database
[[d1_databases]]
binding = "DB"
database_name = "elixpo_auth"
database_id = "your-d1-id-from-create-command"

# KV Namespaces (for session storage)
[[kv_namespaces]]
binding = "AUTH_STATE_KV"
id = "your-kv-id"
preview_id = "your-kv-preview-id"
```

### Get D1 Database ID
```bash
wrangler d1 list
# Copy the database ID
```

### Apply Database Schema
```bash
wrangler d1 execute elixpo_auth --file src/workers/schema.sql
```

### Run Migrations
```bash
wrangler d1 execute elixpo_auth --file src/workers/migrations/0001_init_schema.sql
```

## 7. Development Server Setup

### Start Development Server
```bash
npm run dev
```

Server runs on `http://localhost:3000`

### Test SSL in Development
If you need HTTPS in development:
```bash
npm install -g mkcert
mkcert localhost
# Use the generated certificates with a proxy like nginx
```

## 8. Full OAuth Flow Workflow

### For Built-in Google/GitHub Login:

```
User clicks "Login with Google"
    ↓
GET /api/auth/authorize?provider=google
    ↓
Response contains authUrl with state/nonce/PKCE
    ↓
User redirected to Google
    ↓
User grants permission
    ↓
Google redirects to GET /api/auth/callback/google?code=...&state=...
    ↓
Callback handler:
  1. Validates state parameter
  2. Exchanges code for tokens (with PKCE)
  3. Fetches user info from Google
  4. Creates/updates user in DB
  5. Creates JWT tokens
  6. Sets secure cookies
  7. Redirects to /dashboard
```

### For Third-Party App OAuth Integration:

```
1. Admin registers app: POST /api/auth/oauth-clients
   Gets: client_id, client_secret
   
2. Third-party app stores client_secret securely
   
3. User clicks "Sign in with Elixpo"
   Third-party app → GET /api/auth/authorize?provider=custom&client_id=cli_xxx
   
4. Get authorization code from Elixpo
   
5. Exchange code for token:
   POST /api/auth/callback/[provider]
   With: client_id, client_secret (validated in DB)
   
6. Receive JWT token for user
   
7. Use token for subsequent API calls:
   POST /api/sso/verify
   Authorization: Bearer {token}
```

## 9. Security Considerations

✅ **Implemented:**
- PKCE (Proof Key for Code Exchange) for mobile/SPA safety
- State parameter validation
- Secure, httpOnly cookies for tokens
- JWT signing (Ed25519 in production, HS256 in dev)
- Client secret hashing in database
- Audit logging of all auth events
- Email verification before account access

✅ **To Implement:**
- Rate limiting on auth endpoints
- CORS policy for third-party apps
- Client IP validation
- Unusual activity detection
- Token rotation strategy

## 10. Testing OAuth Flow Locally

### Test Google Login
```bash
# 1. Start dev server
npm run dev

# 2. Navigate to http://localhost:3000/login

# 3. Click "Google Login"

# 4. Should be redirected to Google consent screen

# 5. After approval, should be redirected to /dashboard
#    with access_token and refresh_token in cookies
```

### Test SSO Verification
```bash
# After login, test the SSO endpoint
curl -H "Authorization: Bearer {access_token}" \
     http://localhost:3000/api/sso/verify

# Should return user info or 401 if token is invalid
```

## Troubleshooting

### "Provider not configured" Error
- Check `.env.local` has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- Verify values match Google Cloud Console

### "State mismatch" Error
- Cookies may have been cleared
- Try logging out and back in
- Check that redirect_uri in Google Console matches

### D1 Database Connection Issues
```bash
# Test D1 connection
wrangler d1 execute elixpo_auth --command "SELECT 1"

# Verify binding in wrangler.toml is correct
```

### HTTPS Certificate Issues
- Use `mkcert` or similar for self-signed certs in dev
- Production uses Cloudflare SSL automatically

---

**Next Steps:**
1. ✅ Create Google OAuth credentials
2. ✅ Create GitHub OAuth credentials  
3. ✅ Add to `.env.local`
4. ✅ Run `wrangler d1 execute` for schema
5. ✅ Start dev server
6. ✅ Test OAuth flow
