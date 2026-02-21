# Quick Start: ElixPo Auth Setup (5-10 minutes)

**TL;DR** - Fastest way to get authentication working.

## 1️⃣ Install Wrangler & Login

```bash
npm install -g wrangler
wrangler login
wrangler whoami  # Verify
```

## 2️⃣ Create D1 Database

```bash
wrangler d1 create elixpo_auth
```

Copy the **Database ID** from output. Then:

```bash
# Update wrangler.toml - replace "your-d1-id-here" with your ID
# Test database creation
wrangler d1 execute elixpo_auth --local --file src/workers/schema.sql
```

## 3️⃣ Create KV Namespaces

```bash
wrangler kv:namespace create "AUTH_STATE_KV"
wrangler kv:namespace create "SESSION_KV"
```

Copy both outputs. Paste into **wrangler.toml**:
- Replace `"your-kv-auth-state-id-here"` with AUTH_STATE_KV id
- Replace `"your-kv-session-id-here"` with SESSION_KV id

## 4️⃣ Get OAuth Credentials

### Google
1. [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 Client ID
3. Add redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Copy Client ID & Secret

### GitHub
1. [GitHub Settings](https://github.com/settings/developers)
2. Create OAuth App
3. Add callback: `http://localhost:3000/api/auth/callback/github`
4. Copy Client ID & Secret

### Turnstile (Captcha)
1. [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Turnstile → Create Site
3. Add domain: `localhost`
4. Copy Site Key & Secret

## 5️⃣ Setup Environment Variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:
```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
JWT_SECRET=your-32-character-secret-key-here12345
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-turnstile-site-key
TURNSTILE_SECRET_KEY=your-turnstile-secret-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 6️⃣ Set Wrangler Secrets

```bash
wrangler secret put JWT_SECRET --env development
# Paste your JWT_SECRET value

wrangler secret put GOOGLE_CLIENT_SECRET --env development
# Paste value

wrangler secret put GITHUB_CLIENT_SECRET --env development
# Paste value

wrangler secret put TURNSTILE_SECRET_KEY --env development
# Paste value
```

## 7️⃣ Update wrangler.toml Environment Variables

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
```

## 8️⃣ Test Locally

```bash
npm install
npm run dev
```

Visit: `http://localhost:3000`

## ✅ Checklist

```
✓ Wrangler installed & logged in
✓ D1 database created (ID in wrangler.toml)
✓ D1 schema initialized
✓ KV namespaces created (IDs in wrangler.toml)
✓ Google OAuth credentials added to .env.local
✓ GitHub OAuth credentials added to .env.local
✓ Turnstile credentials added to .env.local
✓ Wrangler secrets set
✓ wrangler.toml environment variables filled
✓ Local dev server running
```

## 🔧 Common Commands

```bash
# Check D1 data
wrangler d1 execute elixpo_auth --local --command "SELECT COUNT(*) FROM users;"

# View KV namespaces
wrangler kv:namespace list

# Check secrets are set
wrangler secret list --env development

# Real-time logs
wrangler tail --env development
```

## 📚 Full Guides

- **[CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md)** - Complete step-by-step guide
- **[D1_SETUP.md](D1_SETUP.md)** - Database schema & queries
- **[REGISTRATION_LOGIN_D1_SETUP.md](REGISTRATION_LOGIN_D1_SETUP.md)** - What to store in D1
- **[AUTH_README.md](AUTH_README.md)** - API endpoints reference

---

**Ready to test? Run `npm run dev` and go to http://localhost:3000/register** 🚀
