# ElixPo Auth Infrastructure Overview

Visual guide to all Cloudflare components and how they work together.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │   /login    │→ │  /register   │→ │  /api/auth/callback │   │
│  └─────────────┘  └──────────────┘  └─────────────────────┘   │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTP Requests
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│            Vercel / Next.js API Routes                          │
│ ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐  │
│ │POST /register│ │ POST /login  │ │ GET /callback/[prov]   │  │
│ └──────┬───────┘ └──────┬───────┘ └────────────┬───────────┘  │
│        │                 │                       │               │
│        └─────────────────┼───────────────────────┘               │
│                          ▼                                       │
│            Validates Turnstile (Captcha)                        │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────┐ ┌─────────────────┐
│  Cloudflare D1   │ │ Cloudflare   │ │  Cloudflare     │
│   (Database)     │ │  Secrets     │ │  KV (Cache)     │
│                  │ │              │ │                 │
│ ┌──────────────┐ │ ┌──────────────┐ │ ┌──────────────┐│
│ │ users        │ │ │JWT_SECRET    │ │ │OAuth State   ││
│ │ identities   │ │ │OAuth Secrets │ │ │PKCE Verifier ││
│ │ refresh_     │ │ │Keys          │ │ │Sessions      ││
│ │ tokens       │ │ └──────────────┘ │ └──────────────┘│
│ │ auth_        │ │                  │                 │
│ │ requests     │ │ Encrypted &      │ TTL Auto-       │
│ │ audit_logs   │ │ Secure           │ Expiry          │
│ └──────────────┘ │                  │                 │
│                  │                  │                 │
│ SQLite-based     │                  │                 │
│ Relational DB    │                  │                 │
└──────────────────┘ └──────────────────┘ └─────────────────┘
        ▲                  ▲                       ▲
        │                  │                       │
└───────┼──────────────────┼───────────────────────┘
        │ wrangler         │ wrangler              wrangler
        │ d1 execute       │ secret put            kv:key
        │                  │                       
        └──────────────────┴───────────────────────┘
```

---

## Component Breakdown

### 1. **Cloudflare D1** (SQLite Database)

**What it is:** Serverless SQL database, globally distributed.

**What's stored:**
```
users
├─ id (UUID)
├─ email (unique)
├─ password_hash (optional, for email provider)
├─ created_at
├─ last_login
└─ is_active

identities (links providers to users)
├─ user_id (FK→users)
├─ provider (google, github, email)
├─ provider_user_id (OAuth sub, GitHub id, or email)
└─ verified

refresh_tokens (token rotation & revocation)
├─ user_id (FK→users)
├─ token_hash (SHA256 of JWT)
├─ expires_at
├─ revoked
└─ revoked_at

auth_requests (OAuth session tracking)
├─ state (unique, 5-min expiry)
├─ nonce
├─ pkce_verifier
├─ provider
└─ expires_at

audit_logs (security trail)
├─ user_id
├─ event_type (login, registration, logout)
├─ status (success, failure)
├─ ip_address
├─ user_agent
└─ created_at
```

**Query Speed:** ~50-100ms (global latency, cached)

**Setup:**
```bash
wrangler d1 create elixpo_auth
wrangler d1 execute elixpo_auth --file src/workers/schema.sql
```

---

### 2. **Cloudflare Secrets** (Encrypted Config)

**What it is:** Securely stored environment variables, encrypted at rest.

**What's stored:**
- `JWT_SECRET` - Signing key for access/refresh tokens
- `JWT_PRIVATE_KEY` - Ed25519 private key (production)
- `GOOGLE_CLIENT_SECRET` - OAuth secret from Google
- `GITHUB_CLIENT_SECRET` - OAuth secret from GitHub
- `TURNSTILE_SECRET_KEY` - Captcha secret

**Access Control:** Only accessible to:
- Your Cloudflare account
- Workers during execution
- Never logged, never exposed in plaintext

**Setup:**
```bash
wrangler secret put JWT_SECRET --env development
wrangler secret put GOOGLE_CLIENT_SECRET --env development
wrangler secret put GITHUB_CLIENT_SECRET --env development
wrangler secret put TURNSTILE_SECRET_KEY --env development
```

---

### 3. **Cloudflare KV** (Key-Value Store)

**What it is:** Global, low-latency caching layer with TTL support.

**What's stored:**
- OAuth `state` parameters (5-minute TTL)
- PKCE `code_verifier` values (5-minute TTL)
- Session tokens (optional, for fast lookups)
- Rate limit counters

**Characteristics:**
- Read latency: <10ms globally
- Atomic operations
- Automatic TTL cleanup
- No extra cost (within free tier)

**Setup:**
```bash
wrangler kv:namespace create "AUTH_STATE_KV"
wrangler kv:namespace create "SESSION_KV"
```

**Use Case - OAuth Flow:**
```
User clicks "Login with Google"
  ↓
Generate state + PKCE
  ↓
Store in KV: auth_state_${state} = { nonce, pkce_verifier, ... } [TTL: 5m]
  ↓
User redirected to Google
  ↓
Google redirects to /callback?state=...&code=...
  ↓
Retrieve from KV (sub-10ms)
  ↓
Validate state matches
  ↓
Delete from KV
  ↓
User logged in ✓
```

---

### 4. **Environment Variables** (wrangler.toml)

**Non-sensitive values** (safe to be in config):

```toml
[env.development]
vars = {
  ENVIRONMENT = "development",
  JWT_EXPIRATION_MINUTES = "15",
  NODE_ENV = "development",
  NEXT_PUBLIC_APP_URL = "http://localhost:3000",
  GOOGLE_CLIENT_ID = "your-public-id",
  GITHUB_CLIENT_ID = "your-public-id",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY = "public-key"
}
```

---

## Data Flow Examples

### Registration Flow

```
User submits form (email, password, provider)
  ↓
Verify Turnstile token
  ↓
Hash password (PBKDF2)
  ↓
Generate UUID
  ↓
D1: Insert user { id, email, password_hash }
D1: Insert identity { user_id, provider, provider_user_id }
D1: Insert refresh_token { user_id, token_hash }
  ↓
JWT Token: { sub: user_id, email, provider: 'email' }
  ↓
D1: Insert audit_log { user_id, event: 'registration', status: 'success' }
  ↓
Response: Set cookies (access_token, refresh_token, user_id)
  ↓
Redirect to dashboard ✓
```

---

### Login Flow (Email/Password)

```
User enters email + password
  ↓
Verify Turnstile token
  ↓
D1 Query: SELECT identities WHERE provider='email' AND provider_user_id=email
  ↓
D1 Query: SELECT users WHERE id=identity.user_id
  ↓
Verify password: hashPassword(input) vs user.password_hash
  ↓
Password matches? → Continue
Password wrong? → Log failure, return 401
  ↓
D1: UPDATE users SET last_login=now() WHERE id=user_id
D1: INSERT refresh_token { user_id, token_hash, expires_at }
  ↓
Issue JWT: { sub: user_id, email, provider: 'email' }
  ↓
D1: INSERT audit_log { user_id, event: 'login', provider: 'email', status: 'success' }
  ↓
Response: Set cookies + tokens
  ↓
Redirect to dashboard ✓
```

---

### Login Flow (OAuth - Google)

```
User clicks "Login with Google"
  ↓
Generate state + nonce + PKCE
  ↓
KV: Store auth_state_${state} = { nonce, pkce_verifier, provider }  [TTL: 5m]
  ↓
Redirect to Google auth endpoint
  ↓
Google: User authorizes
  ↓
Google: Redirect to /api/auth/callback/google?code=...&state=...
  ↓
Validate state from KV (from cookie)
  ↓
KV: DELETE auth_state_${state}
  ↓
Exchange code for token
  ↓
Fetch user info from Google
  ↓
D1 Query: SELECT identities WHERE provider='google' AND provider_user_id=${google_sub}
  ↓
Identity exists? → Login existing user
Identity NOT found? → Create new user + identity
  ↓
D1: INSERT/UPDATE user, identity
D1: INSERT refresh_token
  ↓
Issue JWT: { sub: user_id, email, provider: 'google' }
  ↓
D1: INSERT audit_log
  ↓
Set cookies + redirect to dashboard ✓
```

---

### Token Refresh Flow

```
Client has expired access_token + valid refresh_token
  ↓
POST /api/auth/refresh with refresh_token cookie
  ↓
Verify JWT signature: refresh_token
  ↓
Check it's type='refresh'
  ↓
D1: SELECT refresh_tokens WHERE token_hash=hash(token) AND revoked=0 AND expires_at > now()
  ↓
Token found and valid? → Continue
Token revoked/expired? → Return 401
  ↓
Generate new access_token: { sub, email, provider, exp: +15min }
  ↓
Optional: Rotate refresh_token (revoke old, generate new)
  ↓
D1: INSERT new refresh_token
D1: MARK old token as revoked (optional)
  ↓
Response: New access_token + (optional) new refresh_token
  ↓
Client updates cookies ✓
```

---

### SSO Verification (Other Services)

```
Service A calls: GET /api/sso/verify
  Header: Authorization: Bearer ${jwt_token}
         X-Client-Id: service-a
  ↓
Verify JWT signature using JWT_PUBLIC_KEY
  ↓
JWT valid? Return { authenticated: true, userId, email }
JWT invalid? Return { authenticated: false }, 401
  ↓
Service A checks authentication → grants access ✓
```

---

## Performance Characteristics

| Component | Latency | Use Case |
|-----------|---------|----------|
| D1 | 50-100ms | User lookups, token storage |
| KV | <10ms | OAuth state, PKCE, sessions |
| Secrets | <10ms | Crypto operations |
| JWT Verify | <5ms | All requests |

**Total auth request time:** ~100-150ms (including OAuth callback)

---

## Scaling Limits (Free Tier)

| Component | Limit | Notes |
|-----------|-------|-------|
| D1 | 1M rows | SQLite: No query limit |
| D1 Queries | Unlimited | Aggregate: 1M/day |
| KV | 1GB storage | 1,000 ns, 100k writes/day |
| KV Reads | Unlimited | Free globally |
| Secrets | 100 | Per environment |

**Suitable for:** 10K-100K daily users

**Beyond that:** Upgrade to Paid or use dedicated database.

---

## Costs Breakdown (Monthly)

| Service | Free Tier | Paid |
|---------|-----------|------|
| D1 | Included | $0.75 per 1M rows |
| KV | 100k writes/day | $0.50 per 1M writes |
| Workers | 100k requests/day | $0.50 per 1M requests |
| Secrets | Free | Free |
| Turnstile | Free | Free |

**Typical cost for 100K users:** $5-15/month

---

## Security Checklist

```
✓ Passwords hashed (PBKDF2, 100k iterations)
✓ Refresh tokens hashed before storage (SHA-256)
✓ JWTs signed with HS256 (dev) or Ed25519 (prod)
✓ OAuth secrets in Cloudflare Secrets (encrypted)
✓ State validation (CSRF protection)
✓ PKCE code_challenge validation
✓ Cookies: HttpOnly, Secure, SameSite=Lax
✓ Audit logging (all events)
✓ Rate limiting (optional via Workers)
✓ Captcha on login/registration (Turnstile)
```

---

## File Structure

```
elixpoaccopunts/
├── wrangler.toml                          ← D1, KV, Secrets config
├── .env.local                              ← OAuth credentials (dev)
├── src/
│   ├── lib/
│   │   ├── jwt.ts                         ← Sign/verify tokens
│   │   ├── password.ts                    ← Hash/verify passwords
│   │   ├── crypto.ts                      ← PKCE, state generation
│   │   ├── captcha.ts                     ← Turnstile verification
│   │   ├── db.ts                          ← D1 query helpers
│   │   └── oauth-config.ts                ← OAuth provider config
│   └── workers/
│       └── schema.sql                     ← D1 schema
├── app/api/auth/
│   ├── register/
│   │   └── route.ts                       ← POST /api/auth/register
│   ├── login/
│   │   └── route.ts                       ← POST /api/auth/login
│   ├── logout/
│   │   └── route.ts                       ← POST /api/auth/logout
│   ├── refresh/
│   │   └── route.ts                       ← POST /api/auth/refresh
│   ├── me/
│   │   └── route.ts                       ← GET /api/auth/me
│   ├── authorize/
│   │   └── route.ts                       ← GET /api/auth/authorize
│   └── callback/
│       └── [provider]/
│           └── route.ts                   ← GET /api/auth/callback/[provider]
└── app/api/sso/
    └── verify/
        └── route.ts                       ← POST /api/sso/verify
```

---

## Getting Started

1. **[QUICK_START.md](QUICK_START.md)** - 5-minute setup
2. **[CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md)** - Detailed Cloudflare config
3. **[D1_SETUP.md](D1_SETUP.md)** - Database schema & queries
4. **[REGISTRATION_LOGIN_D1_SETUP.md](REGISTRATION_LOGIN_D1_SETUP.md)** - What to store in D1
5. **[AUTH_README.md](AUTH_README.md)** - API endpoints reference

---

**Ready to deploy? Follow [QUICK_START.md](QUICK_START.md) →**
