# Elixpo Accounts - D1 Database Setup Guide

## Quick Start

This guide walks you through setting up the Cloudflare D1 database for the Elixpo Accounts OAuth SSO system.

---

## Prerequisites

Before you begin, ensure you have:

- Node.js 18+ installed
- Wrangler CLI installed globally
- Cloudflare account with Workers enabled
- Appropriate billing/subscription level

### Install Wrangler (if not already installed)

```bash
npm install -g wrangler@latest
```

Or install locally in the project:

```bash
npm install wrangler --save-dev
```

### Verify Wrangler Installation

```bash
wrangler --version
```

---

## Step 1: Authenticate with Cloudflare

```bash
wrangler login
```

This will open your browser to authenticate. Follow the prompts and authorize the Wrangler CLI.

---

## Step 2: Create D1 Database

Create a new D1 database named `elixpo_auth`:

```bash
wrangler d1 create elixpo_auth
```

**Output Example:**
```
✓ Successfully created DB 'elixpo_auth' in region WNAM
Created your new D1 database.

To start using your D1 database via Wrangler, you need to update your wrangler.toml:

[[d1_databases]]
binding = "DB"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
database_name = "elixpo_auth"
```

### Store Your Database ID

Copy the `database_id` value - you'll need it next.

---

## Step 3: Update wrangler.toml

Edit `wrangler.toml` in the project root and update the D1 binding:

```toml
[[d1_databases]]
binding = "DB"
database_name = "elixpo_auth"
database_id = "your-database-id-here"  # Paste your ID from Step 2
```

**Example:**
```toml
name = "elixpo-accounts-workers"
main = "src/workers/index.ts"
type = "service"
compatibility_date = "2025-12-16"

[[d1_databases]]
binding = "DB"
database_name = "elixpo_auth"
database_id = "a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6"
```

---

## Step 4: Create Migration Files

Create a migrations directory if it doesn't exist:

```bash
mkdir -p src/workers/migrations
```

### Create Initial Schema Migration

Create `src/workers/migrations/0001_init_schema.sql`:

```bash
touch src/workers/migrations/0001_init_schema.sql
```

Copy the complete schema from `src/workers/schema.sql` into this migration file.

---

## Step 5: Execute Schema Migration

Apply the database schema:

```bash
wrangler d1 execute elixpo_auth --file=src/workers/schema.sql
```

**Expected Output:**
```
✓ Executed command on remote database elixpo_auth
```

### Verify Schema Creation

Check if tables were created:

```bash
wrangler d1 execute elixpo_auth --command="SELECT name FROM sqlite_master WHERE type='table';"
```

**Expected Output:**
```
┌──────────────────────────┐
│ name                     │
├──────────────────────────┤
│ users                    │
│ identities               │
│ oauth_clients            │
│ auth_requests            │
│ refresh_tokens           │
│ email_verification_tokens│
│ audit_logs               │
│ privileges               │
│ user_privileges          │
└──────────────────────────┘
```

---

## Step 6: Seed Default Data

### Create Seed Script

Create `scripts/seed-privileges.sql`:

```sql
-- Seed default privileges
INSERT INTO privileges (id, code, name, description, is_system, created_at, updated_at)
VALUES 
  ('priv_user_' || randomblob(12), 'user', 'User', 'Basic user access', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('priv_dev_' || randomblob(12), 'app_developer', 'Application Developer', 'Can create and manage OAuth applications', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('priv_admin_' || randomblob(12), 'admin', 'Administrator', 'Full system access', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('priv_audit_' || randomblob(12), 'audit_viewer', 'Audit Log Viewer', 'Can view audit logs and security events', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('priv_user_mgr_' || randomblob(12), 'user_manager', 'User Manager', 'Can manage users and grant privileges', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
```

### Execute Seed Script

```bash
wrangler d1 execute elixpo_auth --file=scripts/seed-privileges.sql
```

**Verify Privileges Created:**

```bash
wrangler d1 execute elixpo_auth --command="SELECT code, name FROM privileges;"
```

---

## Step 7: Configure Environment Variables

Create `.env.local` in the project root:

```bash
cp .env.example .env.local
```

Update with your Cloudflare settings:

```dotenv
# Cloudflare Account
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ZONE_ID=your-zone-id

# D1 Database
CLOUDFLARE_DATABASE_ID=your-database-id
D1_DATABASE_NAME=elixpo_auth
D1_BINDING_NAME=DB

# Environment
ENVIRONMENT=development
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-jwt-secret-32-chars-minimum
JWT_EXPIRATION_MINUTES=15
REFRESH_TOKEN_EXPIRATION_DAYS=30

# URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# OAuth - Google
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# OAuth - GitHub
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
NEXT_PUBLIC_GITHUB_CLIENT_ID=your-github-client-id
```

---

## Step 8: Test D1 Connection

Run a test query to verify everything is working:

```bash
wrangler d1 execute elixpo_auth --command="SELECT 'Elixpo Accounts D1 Database Connected!' as status;"
```

**Expected Output:**
```
✓ Executed command on remote database elixpo_auth

┌────────────────────────────────────────────────┐
│ status                                         │
├────────────────────────────────────────────────┤
│ Elixpo Accounts D1 Database Connected!        │
└────────────────────────────────────────────────┘
```

---

## Step 9: Start Development Server

```bash
npm run dev
```

The application should now be running with D1 database connectivity.

---

## Common Commands

### Query the Database

```bash
# List all users
wrangler d1 execute elixpo_auth --command="SELECT id, email, created_at FROM users;"

# Count tables
wrangler d1 execute elixpo_auth --command="SELECT COUNT(*) as table_count FROM sqlite_master WHERE type='table';"

# View privileges
wrangler d1 execute elixpo_auth --command="SELECT code, name, is_system FROM privileges;"

# View user privileges
wrangler d1 execute elixpo_auth --command="SELECT u.code, p.name FROM user_privileges up JOIN privileges p ON up.privilege_id = p.id JOIN users u ON up.user_id = u.id;"
```

### Execute SQL Files

```bash
# Execute a migration
wrangler d1 execute elixpo_auth --file=src/workers/migrations/0001_init_schema.sql

# Execute a seed script
wrangler d1 execute elixpo_auth --file=scripts/seed-privileges.sql
```

### Manage Database

```bash
# List all D1 databases
wrangler d1 list

# Delete database (careful!)
wrangler d1 delete elixpo_auth
```

---

## Data Population Examples

### Create a Test User

```bash
wrangler d1 execute elixpo_auth --command="
INSERT INTO users (id, email, created_at) 
VALUES ('user_test_001', 'test@example.com', CURRENT_TIMESTAMP);
"
```

### Grant User a Privilege

```bash
wrangler d1 execute elixpo_auth --command="
INSERT INTO user_privileges (id, user_id, privilege_id, granted_at, reason)
SELECT 
  'upriv_' || randomblob(12),
  'user_test_001',
  id,
  CURRENT_TIMESTAMP,
  'Test grant'
FROM privileges 
WHERE code = 'app_developer' 
LIMIT 1;
"
```

### Create OAuth Application

```bash
wrangler d1 execute elixpo_auth --command="
INSERT INTO oauth_clients (client_id, client_secret_hash, name, redirect_uris, scopes, created_at, is_active)
VALUES (
  'cli_test_001',
  'hash_of_secret',
  'Test Application',
  '[\"https://example.com/callback\"]',
  '[\"openid\", \"profile\", \"email\"]',
  CURRENT_TIMESTAMP,
  1
);
"
```

---

## Troubleshooting

### Database ID Not Found

**Error:** `Error: No binding found for "DB"`

**Solution:** Ensure `wrangler.toml` has the correct `database_id`:

```bash
wrangler d1 list
```

Copy the ID and update `wrangler.toml`.

### Authentication Failed

**Error:** `Error: Unauthorized`

**Solution:** Re-authenticate with Wrangler:

```bash
wrangler logout
wrangler login
```

### Table Already Exists

**Error:** `Error: table users already exists`

**Solution:** The schema has already been applied. To reset:

```bash
# Delete and recreate database
wrangler d1 delete elixpo_auth
wrangler d1 create elixpo_auth
# Update wrangler.toml with new ID
```

### Connection Timeout

**Error:** `Error: Timeout connecting to D1`

**Solution:** 
- Check your internet connection
- Verify Cloudflare account status
- Try again in a few moments

---

## Database Backup

### Export Data

```bash
wrangler d1 execute elixpo_auth --command=".dump" > backup.sql
```

### Restore from Backup

```bash
wrangler d1 execute elixpo_auth --file=backup.sql
```

---

## Production Deployment

### Update Wrangler Configuration for Production

Create `wrangler.production.toml`:

```toml
name = "elixpo-accounts-workers-prod"

[[d1_databases]]
binding = "DB"
database_name = "elixpo_auth_prod"
database_id = "production-database-id"
```

### Deploy to Production

```bash
wrangler deploy --config wrangler.production.toml
```

---

## Next Steps

1. ✅ D1 Database Setup Complete
2. [Setup OAuth Apps UI](app/dashboard/oauth-apps/page.tsx)
3. [Configure Google OAuth](OAUTH_SETUP.md)
4. [Configure GitHub OAuth](OAUTH_SETUP.md)
5. Test OAuth flow
6. Deploy to Cloudflare Workers

---

## Resources

- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- [SQLite Documentation](https://www.sqlite.org/lang.html)
- [Elixpo Accounts README](README.md)

---

## Support

For issues or questions:
- Check [troubleshooting section](#troubleshooting) above
- Review Cloudflare D1 logs
- Contact Elixpo support team

**Status: ✅ D1 Setup Complete**
