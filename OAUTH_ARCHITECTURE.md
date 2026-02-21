# Elixpo OAuth Architecture & Integration Checklist

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    User/Third-Party App                          │
│                                                                   │
│  ┌─────────────────┐       ┌─────────────────┐                 │
│  │  Web Browser    │       │   OAuth Client   │                 │
│  │   (User)        │       │    App           │                 │
│  └────────┬────────┘       └────────┬─────────┘                 │
└───────────┼──────────────────────────┼──────────────────────────┘
            │                          │
            │ 1. User clicks login     │ 1. User clicks "Sign in with Elixpo"
            │                          │
            ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Elixpo Auth Server                            │
│                   (Next.js on Cloudflare)                       │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  GET /api/auth/authorize?provider=google|github         │   │
│  │  ↓                                                        │   │
│  │  [Validate client_id, redirect_uri]                     │   │
│  │  [Generate state, nonce, PKCE verifier]                 │   │
│  │  ↓                                                        │   │
│  │  Return authUrl + tokens                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          │                                        │
│                          ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Redirect to Google/GitHub Authorization Endpoint       │   │
│  │  (https://accounts.google.com/o/oauth2/v2/auth)        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ [User grants/denies permission at Google/GitHub]        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          │                                        │
│                          ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  GET /api/auth/callback/[provider]?code=...&state=...   │   │
│  │  ↓                                                        │   │
│  │  [Validate state from cookie]                           │   │
│  │  ↓                                                        │   │
│  │  [Exchange code for tokens via provider endpoint]        │   │
│  │  ↓                                                        │   │
│  │  [Fetch user profile from provider]                     │   │
│  │  ↓                                                        │   │
│  │  [Upsert user + identity in D1 database]                │   │
│  │  ↓                                                        │   │
│  │  [Create JWT access token + refresh token]              │   │
│  │  ↓                                                        │   │
│  │  [Set secure httpOnly cookies]                          │   │
│  │  ↓                                                        │   │
│  │  Redirect to /dashboard                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  POST /api/sso/verify                                   │   │
│  │  Authorization: Bearer {access_token}                   │   │
│  │  ↓                                                        │   │
│  │  [Verify JWT signature]                                 │   │
│  │  [Extract claims]                                       │   │
│  │  ↓                                                        │   │
│  │  Return { authenticated: true, user: {...} }           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Database Layer (Cloudflare D1)                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │ users                                           │   │   │
│  │  │ ├─ id (PK)                                      │   │   │
│  │  │ ├─ email (unique)                               │   │   │
│  │  │ ├─ password_hash (optional)                     │   │   │
│  │  │ ├─ created_at, updated_at, last_login          │   │   │
│  │  │ └─ ...profile data                              │   │   │
│  │  ├─────────────────────────────────────────────────┤   │   │
│  │  │ oauth_clients ← [NEW in this update]            │   │   │
│  │  │ ├─ client_id (PK)  [cli_xxxxx]                 │   │   │
│  │  │ ├─ client_secret_hash                           │   │   │
│  │  │ ├─ name                                         │   │   │
│  │  │ ├─ redirect_uris (JSON array)                   │   │   │
│  │  │ ├─ scopes (JSON array)                          │   │   │
│  │  │ ├─ is_active (boolean)                          │   │   │
│  │  │ └─ created_at                                   │   │   │
│  │  ├─────────────────────────────────────────────────┤   │   │
│  │  │ identities                                      │   │   │
│  │  │ ├─ id (PK)                                      │   │   │
│  │  │ ├─ user_id (FK → users)                        │   │   │
│  │  │ ├─ provider (google|github|email|custom)       │   │   │
│  │  │ ├─ provider_user_id (unique per provider)      │   │   │
│  │  │ └─ ...provider_specific_data                    │   │   │
│  │  ├─────────────────────────────────────────────────┤   │   │
│  │  │ auth_requests                                   │   │   │
│  │  │ ├─ id, state (unique), nonce                   │   │   │
│  │  │ ├─ pkce_verifier                                │   │   │
│  │  │ ├─ provider, client_id, redirect_uri           │   │   │
│  │  │ └─ expires_at (5 min expiry)                    │   │   │
│  │  ├─────────────────────────────────────────────────┤   │   │
│  │  │ refresh_tokens                                  │   │   │
│  │  │ ├─ id, user_id (FK), token_hash                │   │   │
│  │  │ ├─ client_id (FK), expires_at, revoked         │   │   │
│  │  │ └─ 30 day expiry                                │   │   │
│  │  ├─────────────────────────────────────────────────┤   │   │
│  │  │ audit_logs                                      │   │   │
│  │  │ ├─ id, user_id, event_type (login|register)   │   │   │
│  │  │ ├─ provider, ip_address, user_agent            │   │   │
│  │  │ ├─ status (success|failure)                     │   │   │
│  │  │ └─ created_at                                   │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
            │                          │
            │ 2. Redirects with JWT    │ 2. OAuth code + state
            │                          │
            ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        OAuth Providers                           │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Google (accounts.google.com/o/oauth2/v2/auth)         │   │
│  │  ├─ Issues authorization codes                         │   │
│  │  ├─ Provides ID tokens + profile data                  │   │
│  │  └─ Returns: sub, email, name, picture                 │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  GitHub (github.com/login/oauth/authorize)             │   │
│  │  ├─ Issues authorization codes                         │   │
│  │  ├─ Provides access tokens                             │   │
│  │  └─ Returns: id, email, name, avatar_url               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Sequences

### 1. Built-in Provider Login (Google/GitHub)

```
User                      Frontend         Elixpo Auth            Google
 |                            |                  |                  |
 |--Click "Google Login"---→   |                  |                  |
 |                            |                  |                  |
 |                        GET /api/auth/authorize|client=builtin     |
 |                            |──────────────────→|                  |
 |                            |     authUrl       |                  |
 |--Google login form←---------|←─────────────────|                  |
 |                            |                  |                  |
 |--Grant permission----------|──────────────────→|                  |
 |                            |                  |──request token──→|
 |                            |                  |←──access_token──|
 |                            |                  |──user info────→|
 |                            |←───access_token──|←──profile────--|
 |                            |                  |                  |
 |←Set-Cookie: access_token───|                  |                  |
 |←Set-Cookie: refresh_token──|                  |                  |
 |←Redirect to /dashboard-----|                  |                  |
 |                            |                  |                  |
```

### 2. Third-Party App OAuth (Custom Client)

```
End User         Third-Party App         Elixpo Auth           OAuth Provider
    |                   |                      |                     |
    |--Sign in-------→  |                      |                     |
    |                   |                      |                     |
    |                POST /oauth/authorize    |                     |
    |                   |─────client_id────→  |                     |
    |                   |←─authUrl + state──--|                     |
    |                   |                      |                     |
    |           Redirect to Elixpo Auth       |                     |
    |──────────→ Elixpo Auth UI              |                     |
    |                   |                 GET /authorize             |
    |                   |                      |─────────code+state→|
    |                   |                      |←───authorization───|
    |                   |                      |                     |
    | Grant Permission  |                      |                     |
    |──────────────────→| Redirect to App      |                     |
    |                   | with code            |                     |
    |                   |←─code + state────────|                     |
    |                   |                      |                     |
    |                   | POST exchange code   |                     |
    |                   | for token            |                     |
    |                   |──code + secret──────→|                     |
    |                   |←─access_token────────|                     |
    |                   |                      |                     |
    |←Logged in─────────| Fetch user data      |                     |
    |                   |──Bearer token───────→|                     |
    |                   |←─user profile────────|                     |
    |                   |                      |                     |
```

## Token Lifecycle

### Access Token (JWT)
```
Created: At successful auth
Payload: { sub, email, provider, type: 'access', iat, exp }
Lifetime: 15 minutes (configurable)
Storage: HttpOnly secure cookie (browser) or Authorization header (API)
Use: Authenticate API requests
Signing: Ed25519 (prod) or HS256 (dev)
```

### Refresh Token (JWT)
```
Created: At successful auth
Payload: { sub, type: 'refresh', iat, exp }
Lifetime: 30 days (configurable)
Storage: HttpOnly secure cookie (browser only)
Use: Obtain new access token when expired
Signing: Ed25519 (prod) or HS256 (dev)
Hash: SHA-256 hash stored in DB for validation
```

## Implementation Checklist

### Phase 1: Database & Core Setup ✅
- [x] Verify D1 schema is complete with all tables
- [x] Create `oauth_clients` table for app registration
- [x] Add database functions for CRUD operations on oauth_clients
- [x] Implement client secret hashing (SHA-256)

### Phase 2: API Endpoints ✅
- [x] Create `POST /api/auth/oauth-clients` endpoint
- [x] Implement client_id generation (cli_xxxxx format)
- [x] Implement client_secret generation (secret_xxxxx format)
- [x] Create `GET /api/auth/oauth-clients?client_id=cli_xxx` endpoint (public info)
- [x] Design client authentication for future endpoints (PUT/DELETE)

### Phase 3: OAuth Config Enhancement ✅
- [x] Add `getOAuthClientFromDB()` function
- [x] Add `validateOAuthClientCredentials()` function
- [x] Support both env vars (Google, GitHub) and DB registration

### Phase 4: Callback Enhancement (Next)
- [ ] Update callback to lookup client from oauth_clients table
- [ ] Validate client_secret_hash in callback
- [ ] Support custom OAuth providers (not just Google/GitHub)
- [ ] Add client_id to auth_requests table

### Phase 5: Google OAuth Setup (Next)
- [ ] Create Google Cloud project
- [ ] Create OAuth 2.0 credentials
- [ ] Copy GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
- [ ] Add to .env.local

### Phase 6: GitHub OAuth Setup (Next)
- [ ] Create GitHub OAuth app
- [ ] Copy GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET
- [ ] Add to .env.local

### Phase 7: Cloudflare Wrangler Setup (Next)
- [ ] Install Wrangler CLI
- [ ] Run `wrangler login`
- [ ] Create D1 database
- [ ] Apply schema migrations
- [ ] Configure KV namespaces
- [ ] Add to wrangler.toml

### Phase 8: Testing & Documentation ✅
- [x] Document OAuth flow with code examples
- [x] Create API reference documentation
- [x] Document Google/GitHub setup steps
- [x] Create troubleshooting guide
- [x] Create security checklist

### Phase 9: Security & Monitoring (Future)
- [ ] Implement rate limiting
- [ ] Add CORS policy
- [ ] Set up audit log queries
- [ ] Configure alerts for suspicious activity
- [ ] Implement token rotation

## Environment Variables Required

```dotenv
# Cloudflare
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID=
CLOUDFLARE_DATABASE_ID=

# D1 Database
D1_DATABASE_NAME=elixpo_auth
D1_BINDING_NAME=DB

# Environment
ENVIRONMENT=development
NODE_ENV=development

# JWT
JWT_SECRET=your-secret-key-32-chars-minimum
JWT_EXPIRATION_MINUTES=15
REFRESH_TOKEN_EXPIRATION_DAYS=30

# URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Google OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret-here
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com

# GitHub OAuth (from GitHub Settings)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-secret
NEXT_PUBLIC_GITHUB_CLIENT_ID=your-github-client-id
```

## Key Files Created/Modified

```
✅ Created: app/api/auth/oauth-clients/route.ts
   - POST: Register new OAuth application
   - GET: Get application details
   - PUT: Update application (stub)
   - DELETE: Deactivate application (stub)

✅ Modified: src/lib/db.ts
   - createOAuthClient()
   - getOAuthClientById()
   - getOAuthClientByIdWithSecret()
   - validateOAuthClient()
   - updateOAuthClient()
   - listOAuthClients()

✅ Modified: src/lib/oauth-config.ts
   - getOAuthClientFromDB()
   - validateOAuthClientCredentials()

✅ Created: OAUTH_SETUP.md
   - Complete setup guide for Google/GitHub
   - Wrangler configuration
   - Testing procedures

✅ Created: OAUTH_CLIENT_REFERENCE.md
   - API endpoint reference
   - Client credential specification
   - OAuth flow examples
   - Code samples (Node.js, Python, cURL)
   - Security checklist
   - Troubleshooting guide
```

## Next Immediate Steps

1. **Get Google OAuth Credentials**
   ```
   1. Go to console.cloud.google.com
   2. Create project "Elixpo Accounts"
   3. Enable Google Identity API
   4. Create OAuth 2.0 Web credentials
   5. Add redirect URIs:
      - http://localhost:3000/api/auth/callback/google
      - https://auth.elixpo.com/api/auth/callback/google
   ```

2. **Get GitHub OAuth Credentials**
   ```
   1. Go to github.com/settings/developers
   2. Create New OAuth App
   3. Set Homepage: https://auth.elixpo.com (or localhost for dev)
   4. Set Callback URL: https://auth.elixpo.com/api/auth/callback/github
   ```

3. **Update .env.local**
   ```
   Add the credentials from Google and GitHub
   ```

4. **Setup Wrangler**
   ```
   npm install -g wrangler
   wrangler login
   wrangler d1 create elixpo_auth
   wrangler d1 execute elixpo_auth --file src/workers/schema.sql
   ```

5. **Test**
   ```
   npm run dev
   Visit http://localhost:3000
   Test Google/GitHub login flow
   ```
