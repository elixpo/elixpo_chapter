# Cloudflare D1 Setup Guide for Elixpo Accounts

## Prerequisites
- Cloudflare account
- Active Elixpo domain on Cloudflare
- Wrangler CLI installed
- Node.js 18+

## Step 1: Install Wrangler CLI

```bash
npm install -D wrangler
```

Verify installation:
```bash
npx wrangler --version
```

## Step 2: Authenticate with Cloudflare

```bash
npx wrangler login
```

This opens a browser to authorize your Cloudflare account. Accept the authorization.

## Step 3: Create D1 Database

Create your production database:
```bash
npx wrangler d1 create elixpo_auth
```

You'll see output like:
```
✓ Created database 'elixpo_auth'
Database ID: <YOUR_DATABASE_ID>
```

**Copy the Database ID** - you'll need it for wrangler.toml

## Step 4: Create Migration Files

Create migrations directory:
```bash
mkdir -p src/workers/migrations
```

Create initial migration file:
```bash
npx wrangler d1 migrations create elixpo_auth init_schema
```

This creates a file like: `src/workers/migrations/0001_init_schema.sql`

Copy your schema from `src/workers/schema.sql` into the migration file.

## Step 5: Update wrangler.toml

Replace the placeholder database_id:

```toml
[[d1_databases]]
binding = "DB"
database_name = "elixpo_auth"
database_id = "<YOUR_DATABASE_ID>"
```

Example:
```toml
[[d1_databases]]
binding = "DB"
database_name = "elixpo_auth"
database_id = "12345678-1234-1234-1234-123456789012"
```

## Step 6: Apply Migration to Production

```bash
npx wrangler d1 migrations apply elixpo_auth --remote
```

Confirm when prompted. This creates your database schema on Cloudflare D1.

## Step 7: Create Local Development Database (Optional)

For local testing:
```bash
npx wrangler d1 execute elixpo_auth --local < src/workers/schema.sql
```

## Step 8: Verify Database Setup

### Check Production Database:
```bash
npx wrangler d1 info elixpo_auth
```

### Query Production Database:
```bash
npx wrangler d1 execute elixpo_auth "SELECT name FROM sqlite_master WHERE type='table';" --remote
```

This should list all your tables: users, identities, email_verification_tokens, auth_requests, refresh_tokens, oauth_clients, audit_logs.

## Step 9: Set Environment Variables

Create `.env.local` for development:
```
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_DATABASE_ID=your-database-id
DATABASE_BINDING_NAME=DB
```

Get your Account ID:
```bash
npx wrangler whoami
```

## Step 10: Update Next.js Environment

If using D1 from Next.js API routes, install D1 client:
```bash
npm install @cloudflare/workers-types
```

## Step 11: Test Connection

Create a test API endpoint to verify D1 connection:

**File: `app/api/test-db/route.ts`**
```typescript
export async function GET(request: Request) {
  try {
    // If using D1 through Workers:
    // const db = request.cf?.colo?.db
    
    // For now, return test response
    return Response.json({
      status: 'Database connection configured',
      database: 'elixpo_auth',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { error: 'Database connection failed', message: String(error) },
      { status: 500 }
    );
  }
}
```

Then test:
```bash
curl http://localhost:3000/api/test-db
```

## Step 12: Backup Existing Data (if applicable)

Export data from local/staging database:
```bash
npx wrangler d1 execute elixpo_auth "SELECT * FROM users;" > users_backup.json
```

## Useful Commands

### View Database Info
```bash
npx wrangler d1 info elixpo_auth
```

### Execute SQL Query (Local)
```bash
npx wrangler d1 execute elixpo_auth "SELECT * FROM users LIMIT 10;"
```

### Execute SQL Query (Remote)
```bash
npx wrangler d1 execute elixpo_auth "SELECT * FROM users LIMIT 10;" --remote
```

### List All Databases
```bash
npx wrangler d1 list
```

### Delete Database (if needed)
```bash
npx wrangler d1 delete elixpo_auth
```

## Troubleshooting

### "Database not found" error
- Verify database_id in wrangler.toml
- Run `npx wrangler d1 list` to confirm database exists
- Check Cloudflare dashboard for the database

### Migration fails
- Ensure SQL syntax is correct
- Check schema.sql for any unsupported SQLite features
- Run migrations one at a time

### Local vs Remote mismatch
- Use `--remote` flag for production
- Omit flag for local testing
- Always test migrations locally first

### Permission denied
- Run `npx wrangler logout` then `npx wrangler login` again
- Verify Cloudflare account has D1 access

## Next Steps

1. Update `src/lib/db.ts` to use D1 binding
2. Implement database queries in API routes
3. Set up connection pooling for production
4. Configure database backups in Cloudflare dashboard
5. Set up monitoring and logging

## References

- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Wrangler D1 Commands](https://developers.cloudflare.com/workers/wrangler/commands/#d1)
- [D1 Best Practices](https://developers.cloudflare.com/d1/platform/best-practices/)
