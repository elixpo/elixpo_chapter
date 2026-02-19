# Cloudflare Setup Guide for ElixPo Auth

Complete step-by-step guide to set up Cloudflare infrastructure for the OAuth/SSO authentication system.

## Prerequisites

- Cloudflare account (free tier works)
- Wrangler CLI installed
- Git configured

## Step 1: Install & Configure Wrangler

### 1.1 Install Wrangler CLI

```bash
npm install -g wrangler
# or if using yarn
yarn global add wrangler
```

### 1.2 Login to Cloudflare

```bash
wrangler login
```

This will:
- Open a browser window
- Ask you to authorize Cloudflare access
- Save your credentials locally in `~/.wrangler/config.toml`

```bash
# Verify login
wrangler whoami
```

---

## Step 2: Create D1 Database

D1 is Cloudflare's serverless SQL database (SQLite-compatible).

### 2.1 Create Database

```bash
wrangler d1 create elixpo_auth
```

**Output:**
```
✓ Created database elixpo_auth
✓ Database ID: 12345678-abcd-1234-abcd-123456789012
```

**IMPORTANT:** Copy the Database ID!

### 2.2 Update wrangler.toml

```bash
# Open wrangler.toml and replace:
# database_id = "your-d1-id-here"
# with your actual ID

nano wrangler.toml
# or edit in VS Code
```

```toml
[[d1_databases]]
binding = "DB"
database_name = "elixpo_auth"
database_id = "12345678-abcd-1234-abcd-123456789012"  # <- YOUR ID HERE
```

### 2.3 Initialize Database Schema

```bash
# Apply schema to local D1
wrangler d1 execute elixpo_auth --local --file src/workers/schema.sql

# Verify tables created
wrangler d1 execute elixpo_auth --local --command "SELECT name FROM sqlite_master WHERE type='table';"
```

**Expected Output:**
```
users
identities
auth_requests
refresh_tokens
oauth_clients
audit_logs
```

---

## Step 3: Create KV Namespaces

KV is Cloudflare's key-value store (fast, global, TTL-native).

### 3.1 Create AUTH_STATE_KV

```bash
wrangler kv:namespace create "AUTH_STATE_KV"
```

**Output:**
```
✓ Add the following to your wrangler.toml:

[[kv_namespaces]]
binding = "AUTH_STATE_KV"
id = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
preview_id = "z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4"
```

### 3.2 Create SESSION_KV

```bash
wrangler kv:namespace create "SESSION_KV"
```

**Output:**
```
✓ Add the following to your wrangler.toml:

[[kv_namespaces]]
binding = "SESSION_KV"
id = "9a8b7c6d5e4f3g2h1i0j9k8l7m6n5o4p"
preview_id = "1q2r3s4t5u6v7w8x9y0z1a2b3c4d5e6f"
```

### 3.3 Update wrangler.toml

Copy both outputs into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "AUTH_STATE_KV"
id = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
preview_id = "z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4"

[[kv_namespaces]]
binding = "SESSION_KV"
id = "9a8b7c6d5e4f3g2h1i0j9k8l7m6n5o4p"
preview_id = "1q2r3s4t5u6v7w8x9y0z1a2b3c4d5e6f"
```

---

## Step 4: Set Up Cloudflare Secrets

Secrets store sensitive data securely (OAuth secrets, JWT keys).

### 4.1 Get Your Secrets Ready

```bash
# Copy .env.local.example to .env.local
cp .env.local.example .env.local

# Fill in the values:
# - GOOGLE_CLIENT_SECRET
# - GITHUB_CLIENT_SECRET
# - JWT_SECRET (or JWT_PRIVATE_KEY for production)
# - TURNSTILE_SECRET_KEY
```

### 4.2 Set Secrets with Wrangler

```bash
# Development environment
wrangler secret put JWT_SECRET --env development
# Paste your JWT_SECRET value
# Press Ctrl+D or Cmd+D when done

wrangler secret put GOOGLE_CLIENT_SECRET --env development
# Paste your Google client secret

wrangler secret put GITHUB_CLIENT_SECRET --env development
# Paste your GitHub client secret

wrangler secret put TURNSTILE_SECRET_KEY --env development
# Paste your Turnstile secret key
```

#### For Production:
```bash
# Same as above but with --env production
wrangler secret put JWT_SECRET --env production

wrangler secret put GOOGLE_CLIENT_SECRET --env production
wrangler secret put GITHUB_CLIENT_SECRET --env production
wrangler secret put TURNSTILE_SECRET_KEY --env production
```

### 4.3 Verify Secrets

```bash
# List secrets (values are masked for security)
wrangler secret list --env development
```

---

## Step 5: Configure Environment Variables

Environment variables (unlike secrets) are visible in logs - use only for non-sensitive data.

### 5.1 Update wrangler.toml

```toml
[env.development]
vars = { 
  ENVIRONMENT = "development",
  NODE_ENV = "development",
  JWT_EXPIRATION_MINUTES = "15",
  REFRESH_TOKEN_EXPIRATION_DAYS = "30",
  NEXT_PUBLIC_APP_URL = "http://localhost:3000",
  GOOGLE_CLIENT_ID = "your-google-client-id",
  GITHUB_CLIENT_ID = "your-github-client-id",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY = "your-turnstile-site-key"
}

[env.production]
vars = {
  ENVIRONMENT = "production",
  NODE_ENV = "production",
  JWT_EXPIRATION_MINUTES = "15",
  REFRESH_TOKEN_EXPIRATION_DAYS = "30",
  NEXT_PUBLIC_APP_URL = "https://auth.elixpo.com",
  GOOGLE_CLIENT_ID = "your-production-google-client-id",
  GITHUB_CLIENT_ID = "your-production-github-client-id",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY = "your-production-turnstile-site-key"
}
```

**Note:** `NEXT_PUBLIC_*` vars are accessible in frontend; others are backend-only.

---

## Step 6: Get OAuth Provider Credentials

### 6.1 Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project: "ElixPo Auth"
3. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
4. Choose **Web application**
5. Authorized redirect URIs:
   ```
   http://localhost:3000/api/auth/callback/google
   https://auth.elixpo.com/api/auth/callback/google
   ```
6. Copy **Client ID** and **Client Secret**

```bash
# Add to .env.local
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret

# Also add to wrangler.toml
```

### 6.2 GitHub OAuth

1. Go to [GitHub Settings → Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: ElixPo Auth
   - **Homepage URL**: http://localhost:3000
   - **Authorization callback URL**: http://localhost:3000/api/auth/callback/github
4. For production, create another app with:
   - **Authorization callback URL**: https://auth.elixpo.com/api/auth/callback/github
5. Copy **Client ID** and **Client Secret**

```bash
# Add to .env.local
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-secret
```

### 6.3 Cloudflare Turnstile (Captcha)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Turnstile** → **Create Site**
3. Fill in:
   - **Site name**: ElixPo Auth
   - **Domain**: localhost (for dev)
   - **Mode**: Managed
4. Click **Create**
5. Copy **Site Key** and **Secret Key**

```bash
# Add to .env.local
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-site-key
TURNSTILE_SECRET_KEY=your-secret-key
```

---

## Step 7: Test Locally

### 7.1 Install Dependencies

```bash
npm install
```

### 7.2 Start Development Server

```bash
npm run dev
```

**Expected output:**
```
▲ Next.js 16.1.6
- Local:        http://localhost:3000
```

### 7.3 Test D1 Connection

```bash
# In another terminal, verify D1 works
wrangler d1 execute elixpo_auth --local --command "SELECT COUNT(*) as user_count FROM users;"
```

### 7.4 Test API Endpoints

```bash
# Test registration endpoint
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpass123",
    "provider": "email",
    "turnstile_token": "test-token"
  }'

# Test login endpoint
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpass123",
    "provider": "email",
    "turnstile_token": "test-token"
  }'
```

---

## Step 8: Deploy to Production

### 8.1 Push to Git

```bash
git add .
git commit -m "Add Cloudflare D1 and auth infrastructure"
git push origin main
```

### 8.2 Initialize Remote D1 Database

```bash
# Create the same schema in production database
wrangler d1 execute elixpo_auth --remote --file src/workers/schema.sql
```

### 8.3 Deploy Next.js to Vercel

```bash
# If not already set up
npm install -g vercel
vercel login

# Deploy
vercel
```

### 8.4 Set Production Environment Variables in Vercel

Go to **Vercel Dashboard** → **Your Project** → **Settings** → **Environment Variables**

Add:
```
GOOGLE_CLIENT_ID = your-production-id
GOOGLE_CLIENT_SECRET = your-production-secret
GITHUB_CLIENT_ID = your-production-id
GITHUB_CLIENT_SECRET = your-production-secret
JWT_SECRET = your-production-secret
TURNSTILE_SECRET_KEY = your-production-secret
NEXT_PUBLIC_APP_URL = https://auth.elixpo.com
NEXT_PUBLIC_TURNSTILE_SITE_KEY = your-production-site-key
```

### 8.5 Update OAuth Redirect URIs

In Google Cloud & GitHub, add production redirect URI:
```
https://auth.elixpo.com/api/auth/callback/google
https://auth.elixpo.com/api/auth/callback/github
```

---

## Step 9: Monitor & Manage

### 9.1 View D1 Data

```bash
# List all users
wrangler d1 execute elixpo_auth --remote --command "SELECT * FROM users;"

# Count registrations
wrangler d1 execute elixpo_auth --remote --command "SELECT COUNT(*) FROM users WHERE created_at > datetime('now', '-7 days');"

# View audit logs
wrangler d1 execute elixpo_auth --remote --command "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20;"
```

### 9.2 Check KV Namespaces

```bash
# List KV keys (careful - can be large)
wrangler kv:key list --namespace-id=your-kv-id

# Get specific key
wrangler kv:key get "key_name" --namespace-id=your-kv-id

# Delete expired keys manually
wrangler kv:key delete "oauth_state_expired" --namespace-id=your-kv-id
```

### 9.3 View Logs

```bash
# Real-time logs from Workers
wrangler tail --env production

# Cloudflare Dashboard → Workers → Logs
```

---

## Complete wrangler.toml Reference

```toml
name = "elixpo-accounts-workers"
main = "src/workers/index.ts"
type = "service"
compatibility_date = "2025-12-16"

# D1 DATABASE
[[d1_databases]]
binding = "DB"
database_name = "elixpo_auth"
database_id = "12345678-abcd-1234-abcd-123456789012"

# KV NAMESPACES
[[kv_namespaces]]
binding = "AUTH_STATE_KV"
id = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
preview_id = "z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4"

[[kv_namespaces]]
binding = "SESSION_KV"
id = "9a8b7c6d5e4f3g2h1i0j9k8l7m6n5o4p"
preview_id = "1q2r3s4t5u6v7w8x9y0z1a2b3c4d5e6f"

# QUEUES (FOR FUTURE USE - ASYNC AUDIT LOGGING)
[[queues.consumers]]
queue = "auth-events"
max_batch_timeout = 30
max_batch_size = 100
max_retries = 3
dead_letter_queue = "auth-events-dlq"

# DEVELOPMENT ENVIRONMENT
[env.development]
vars = {
  ENVIRONMENT = "development",
  NODE_ENV = "development",
  JWT_EXPIRATION_MINUTES = "15",
  REFRESH_TOKEN_EXPIRATION_DAYS = "30",
  NEXT_PUBLIC_APP_URL = "http://localhost:3000",
  GOOGLE_CLIENT_ID = "your-dev-google-client-id",
  GITHUB_CLIENT_ID = "your-dev-github-client-id",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY = "your-dev-turnstile-site-key"
}

# PRODUCTION ENVIRONMENT
[env.production]
vars = {
  ENVIRONMENT = "production",
  NODE_ENV = "production",
  JWT_EXPIRATION_MINUTES = "15",
  REFRESH_TOKEN_EXPIRATION_DAYS = "30",
  NEXT_PUBLIC_APP_URL = "https://auth.elixpo.com",
  GOOGLE_CLIENT_ID = "your-prod-google-client-id",
  GITHUB_CLIENT_ID = "your-prod-github-client-id",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY = "your-prod-turnstile-site-key"
}

# ROUTES (if deploying Workers directly)
routes = [
  { pattern = "api.elixpo.com/auth/*", zone_name = "elixpo.com" }
]
```

---

## Credentials Checklist

```
[ ] Cloudflare Account Created
[ ] Wrangler Installed & Logged In
[ ] D1 Database Created (ID in wrangler.toml)
[ ] D1 Schema Initialized (npm run init-db)
[ ] AUTH_STATE_KV Namespace Created (IDs in wrangler.toml)
[ ] SESSION_KV Namespace Created (IDs in wrangler.toml)
[ ] Google OAuth App Created (Client ID & Secret)
[ ] GitHub OAuth App Created (Client ID & Secret)
[ ] Turnstile Site Created (Site Key & Secret)
[ ] .env.local Created with all credentials
[ ] wrangler.toml Updated with all IDs
[ ] Development Environment Tested (npm run dev)
[ ] Vercel Account Created & Configured
[ ] Production Environment Variables Set
[ ] Production OAuth Redirect URIs Added
[ ] Initial Deploy Successful
```

---

## Troubleshooting

### "Authentication Error" when running wrangler

```bash
# Re-login
wrangler logout
wrangler login
```

### "Database not found"

```bash
# List your databases
wrangler d1 list

# If not listed, it wasn't created in your account region
# Create it in the correct region
wrangler d1 create elixpo_auth --preview false
```

### "Error: No KV Namespace binding"

Check wrangler.toml:
- Verify `binding` matches code
- Verify `id` and `preview_id` are set
- Run `wrangler kv:namespace list` to see all namespaces

### "Secrets not accessible"

```bash
# Verify secret exists
wrangler secret list

# If not listed, set it again
wrangler secret put SECRET_NAME --env production
```

### "D1 migration failed"

```bash
# Run schema locally first to verify syntax
wrangler d1 execute elixpo_auth --local --file src/workers/schema.sql

# Then run on remote
wrangler d1 execute elixpo_auth --remote --file src/workers/schema.sql
```

---

## Quick Commands Summary

```bash
# Development
wrangler login                                    # Authenticate
wrangler d1 create elixpo_auth                   # Create DB
wrangler d1 execute elixpo_auth --local --file src/workers/schema.sql  # Init DB
wrangler kv:namespace create "AUTH_STATE_KV"     # Create KV
wrangler secret put JWT_SECRET --env development # Set secrets
npm run dev                                       # Start dev server

# Production
wrangler d1 execute elixpo_auth --remote --file src/workers/schema.sql # Init prod DB
wrangler secret put JWT_SECRET --env production  # Set prod secrets
vercel deploy                                    # Deploy to Vercel

# Monitoring
wrangler d1 execute elixpo_auth --remote --command "SELECT * FROM users;"
wrangler tail --env production
```

---

## Next Steps

1. ✅ Set up wrangler locally
2. ✅ Create D1 database
3. ✅ Create KV namespaces  
4. ✅ Get OAuth credentials
5. ✅ Get Turnstile credentials
6. ✅ Fill in wrangler.toml and .env.local
7. ✅ Initialize database schema
8. ✅ Test locally (npm run dev)
9. ✅ Deploy to production (vercel deploy)
10. ✅ Monitor with wrangler tail

---

**You're all set! 🚀 Your Cloudflare infrastructure is ready to handle millions of auth requests.**
