# Complete Setup Checklist

Step-by-step instructions for setting up ElixPo Auth from scratch.

---

## Phase 1: Local Development Setup (20 minutes)

### Step 1.1: Install Prerequisites ✓

```bash
# Node.js 18+ should already be installed
node --version

# Install Wrangler globally
npm install -g wrangler

# Verify installation
wrangler --version
```

### Step 1.2: Authenticate with Cloudflare

```bash
wrangler login
```

**Note:** This will open a browser. Authorize access and return to terminal.

```bash
# Verify login
wrangler whoami
```

**Expected output:** Your Cloudflare email

### Step 1.3: Create Cloudflare D1 Database

```bash
wrangler d1 create elixpo_auth
```

**Output:**
```
✓ Created database elixpo_auth
✓ Database ID: <copy-this-id>
```

**Action:** Copy the Database ID

### Step 1.4: Update wrangler.toml

Open `wrangler.toml` and replace:

```toml
# OLD:
database_id = "your-d1-id-here"

# NEW:
database_id = "12345678-abcd-1234-abcd-123456789012"  # <-- PASTE YOUR ID HERE
```

### Step 1.5: Initialize D1 Schema

```bash
wrangler d1 execute elixpo_auth --local --file src/workers/schema.sql
```

**Expected output:**
```
✓ Executed 1 query
```

Verify tables created:

```bash
wrangler d1 execute elixpo_auth --local --command "SELECT name FROM sqlite_master WHERE type='table';"
```

**Expected output:**
```
users
identities
auth_requests
refresh_tokens
oauth_clients
audit_logs
```

### Step 1.6: Create KV Namespaces

```bash
wrangler kv:namespace create "AUTH_STATE_KV"
```

**Output:**
```
[[kv_namespaces]]
binding = "AUTH_STATE_KV"
id = "a1b2c3d4..."
preview_id = "z9y8x7w6..."
```

**Action:** Copy these 3 lines

Open `wrangler.toml` and replace:

```toml
# OLD:
[[kv_namespaces]]
binding = "AUTH_STATE_KV"
id = "your-kv-auth-state-id-here"
preview_id = "your-kv-auth-state-preview-id-here"

# NEW: PASTE THE COPIED LINES
```

Now create SESSION_KV:

```bash
wrangler kv:namespace create "SESSION_KV"
```

**Action:** Repeat the paste process for SESSION_KV

---

## Phase 2: OAuth & Captcha Setup (15 minutes)

### Step 2.1: Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project: "ElixPo Auth"
3. Enable OAuth 2.0
4. Create OAuth 2.0 Client ID (Web Application)
5. Authorized redirect URIs:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
6. Copy **Client ID** and **Client Secret**

### Step 2.2: Get GitHub OAuth Credentials

1. Go to [GitHub Settings](https://github.com/settings/developers)
2. OAuth Apps → New OAuth App
3. Application name: `ElixPo Auth (Dev)`
4. Homepage URL: `http://localhost:3000`
5. Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
6. Copy **Client ID** and **Client Secret**

### Step 2.3: Get Turnstile (Captcha) Credentials

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Turnstile → Create Site
3. Site name: `ElixPo Auth`
4. Domain: `localhost`
5. Mode: `Managed`
6. Copy **Site Key** and **Secret Key**

---

## Phase 3: Environment Configuration (10 minutes)

### Step 3.1: Create .env.local

```bash
cp .env.local.example .env.local
```

### Step 3.2: Fill .env.local

Open `.env.local` and fill in your credentials:

```env
# OAuth
GOOGLE_CLIENT_ID=<paste-from-step-2.1>
GOOGLE_CLIENT_SECRET=<paste-from-step-2.1>
GITHUB_CLIENT_ID=<paste-from-step-2.2>
GITHUB_CLIENT_SECRET=<paste-from-step-2.2>

# Captcha
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<paste-from-step-2.3>
TURNSTILE_SECRET_KEY=<paste-from-step-2.3>

# JWT (use a random 32+ character string)
JWT_SECRET=your-super-secret-key-minimum-32-characters-long-here123456789

# URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 3.3: Update wrangler.toml Environment Variables

```toml
[env.development]
vars = {
  ENVIRONMENT = "development",
  NODE_ENV = "development",
  JWT_EXPIRATION_MINUTES = "15",
  REFRESH_TOKEN_EXPIRATION_DAYS = "30",
  NEXT_PUBLIC_APP_URL = "http://localhost:3000",
  GOOGLE_CLIENT_ID = "<paste-from-step-2.1>",
  GITHUB_CLIENT_ID = "<paste-from-step-2.2>",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY = "<paste-from-step-2.3>"
}
```

### Step 3.4: Set Wrangler Secrets

```bash
# Set each secret one by one
wrangler secret put JWT_SECRET --env development
# Paste: your-super-secret-key-minimum-32-characters-long-here123456789
# Press Ctrl+D

wrangler secret put GOOGLE_CLIENT_SECRET --env development
# Paste: <from-step-2.1>
# Press Ctrl+D

wrangler secret put GITHUB_CLIENT_SECRET --env development
# Paste: <from-step-2.2>
# Press Ctrl+D

wrangler secret put TURNSTILE_SECRET_KEY --env development
# Paste: <from-step-2.3>
# Press Ctrl+D
```

Verify secrets are set:

```bash
wrangler secret list --env development
```

**Expected output:**
```
GOOGLE_CLIENT_SECRET
GITHUB_CLIENT_SECRET
JWT_SECRET
TURNSTILE_SECRET_KEY
```

---

## Phase 4: Local Testing (10 minutes)

### Step 4.1: Install Dependencies

```bash
npm install
```

### Step 4.2: Start Development Server

```bash
npm run dev
```

**Expected output:**
```
▲ Next.js 16.1.6
- Local:        http://localhost:3000
- Ready in 1234ms
```

### Step 4.3: Test Database Connection

In another terminal:

```bash
wrangler d1 execute elixpo_auth --local --command "SELECT COUNT(*) FROM users;"
```

**Expected output:**
```
Count
0
```

### Step 4.4: Test Registration Endpoint

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpass123",
    "provider": "email",
    "turnstile_token": "test-token"
  }'
```

**Expected response:**
```json
{
  "user": {
    "id": "uuid-...",
    "email": "test@example.com",
    "provider": "email"
  },
  "tokens": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ..."
  }
}
```

### Step 4.5: Test Login Endpoint

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpass123",
    "provider": "email",
    "turnstile_token": "test-token"
  }'
```

### Step 4.6: Test Me Endpoint

If local testing works, you now have a working auth system! 🎉

---

## Phase 5: Production Setup (Optional - 20 minutes)

### Step 5.1: Create OAuth Apps for Production

Repeat steps 2.1-2.3 but with production domain:
- Google: Add `https://auth.elixpo.com/api/auth/callback/google`
- GitHub: Create new app for production
- Turnstile: Create new site for `auth.elixpo.com`

### Step 5.2: Create D1 Backup for Production

```bash
wrangler d1 execute elixpo_auth --remote --file src/workers/schema.sql
```

### Step 5.3: Set Production Secrets

```bash
wrangler secret put JWT_SECRET --env production
wrangler secret put GOOGLE_CLIENT_SECRET --env production
wrangler secret put GITHUB_CLIENT_SECRET --env production
wrangler secret put TURNSTILE_SECRET_KEY --env production
```

### Step 5.4: Deploy to Vercel

```bash
npm install -g vercel
vercel login
vercel deploy --prod
```

### Step 5.5: Set Production Environment Variables in Vercel

Go to Vercel Dashboard → Project Settings → Environment Variables

Add:
```
GOOGLE_CLIENT_ID = (production value)
GOOGLE_CLIENT_SECRET = (production value)
GITHUB_CLIENT_ID = (production value)
GITHUB_CLIENT_SECRET = (production value)
JWT_SECRET = (production value)
TURNSTILE_SECRET_KEY = (production value)
NEXT_PUBLIC_APP_URL = https://auth.elixpo.com
NEXT_PUBLIC_TURNSTILE_SITE_KEY = (production value)
```

---

## Final Checklist

```
WRANGLER & CLOUDFLARE
☐ Wrangler installed globally
☐ Wrangler logged in (wrangler whoami works)
☐ D1 database created
☐ D1 Database ID in wrangler.toml
☐ D1 schema initialized (6 tables visible)
☐ AUTH_STATE_KV created & ID in wrangler.toml
☐ SESSION_KV created & ID in wrangler.toml

OAUTH PROVIDERS
☐ Google OAuth Client ID & Secret obtained
☐ GitHub OAuth Client ID & Secret obtained
☐ Turnstile Site Key & Secret Key obtained

ENVIRONMENT SETUP
☐ .env.local created with all credentials
☐ wrangler.toml [env.development] vars filled
☐ JWT_SECRET set as Wrangler secret
☐ GOOGLE_CLIENT_SECRET set as Wrangler secret
☐ GITHUB_CLIENT_SECRET set as Wrangler secret
☐ TURNSTILE_SECRET_KEY set as Wrangler secret

LOCAL TESTING
☐ npm install completed
☐ npm run dev starts without errors
☐ D1 query works (SELECT COUNT(*) FROM users)
☐ Registration endpoint returns tokens
☐ Login endpoint works
☐ Cookies set in browser

PRODUCTION (OPTIONAL)
☐ Production OAuth apps created
☐ Production D1 schema initialized
☐ Production Wrangler secrets set
☐ Vercel account setup
☐ Production environment variables set
☐ Production deployment successful
```

---

## Troubleshooting

### Issue: "Cannot find module '@/lib/crypto'"

**Fix:** Check `tsconfig.json`:
```json
"paths": {
  "@/*": ["./src/*"]
}
```

### Issue: "D1 database not found"

**Fix:** 
```bash
wrangler d1 list
wrangler d1 create elixpo_auth
```

### Issue: "Secrets not found in environment"

**Fix:**
```bash
wrangler secret list --env development
wrangler secret put JWT_SECRET --env development
```

### Issue: "OAuth provider returns error_uri mismatch"

**Fix:** Check that redirect URI exactly matches:
- In OAuth provider settings
- In code: `NEXT_PUBLIC_APP_URL/api/auth/callback/[provider]`

### Issue: "npm install fails with typescript errors"

**Fix:**
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

---

## Next Steps

1. ✅ Follow Phase 1-4 above
2. ⏭️ Test registration at `http://localhost:3000/register`
3. ⏭️ Test login at `http://localhost:3000/login`
4. ⏭️ Build frontend UI for login/register pages
5. ⏭️ (Optional) Deploy to production

---

## Documentation Links

- **[QUICK_START.md](QUICK_START.md)** - 5-minute overview
- **[CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md)** - Detailed Cloudflare guide
- **[INFRASTRUCTURE.md](INFRASTRUCTURE.md)** - Architecture & data flows
- **[D1_SETUP.md](D1_SETUP.md)** - Database schema reference
- **[AUTH_README.md](AUTH_README.md)** - API endpoints

---

**You're ready! Start with Phase 1 above. 🚀**
