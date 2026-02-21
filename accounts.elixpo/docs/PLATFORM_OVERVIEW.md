# Elixpo Accounts Platform - Complete Overview

## Current Platform Status ✅

Your Elixpo Accounts authentication platform is now fully operational with enterprise-grade features. Here's how everything works from start to end.

---

## 1. User Registration & Authentication Flow

### Registration Process
1. **User Visits Registration Page** (`/auth/register`)
   - Enters email, password, and optional profile information
   - Client-side validation with Zod schemas
   - Password hashed using bcrypt with salt rounds

2. **Account Creation**
   - New user record created in `users` table
   - Assigned default `role-user` role
   - Email verification token generated
   - OTP code sent to user's email

3. **Email Verification**
   - User receives email with verification link and OTP code
   - Clicking link or entering OTP code verifies email
   - `email_verified` flag set to true
   - Account becomes fully active

### Login Process
1. **User Submits Credentials** (`/api/auth/login`)
   - Email and password provided
   - Email existence checked in database
   - Password hash verified using bcrypt

2. **JWT Generation**
   - Access Token created (15 minutes, configurable)
   - Refresh Token created (30 days, configurable)
   - Refresh token hash stored in database
   - Tokens returned to user

3. **Session Management**
   - Tokens stored in HTTP-only cookies (secure)
   - Automatic refresh on expiration using refresh endpoint
   - Logout revokes refresh token
   - Last login timestamp updated

---

## 2. OAuth2/OIDC Integration

### Provider Configuration
Supported providers configured in `/src/lib/oauth-config.ts`:
- **Google** - OAuth2 with OpenID Connect
- **GitHub** - OAuth2
- **Microsoft** - Azure AD OAuth2
- **Discord** - OAuth2

### OAuth Flow
1. **Authorization Request** (`/auth/authorize`)
   - User clicks "Login with [Provider]"
   - PKCE state and nonce generated (security)
   - User redirected to provider's login page
   - `auth_requests` table tracks the request

2. **User Consent**
   - User authenticates with provider
   - Grants access to requested scopes
   - Provider redirects back to callback URL

3. **Callback Handling** (`/api/auth/callback/[provider]`)
   - Authorization code exchanged for tokens
   - User profile fetched from provider
   - Matching identity checked in `identities` table
   - New user created or existing user linked
   - JWT tokens issued

4. **Profile Linking**
   - User can link multiple identity providers
   - Stored in `identities` table with provider info
   - Allows single-click future logins

---

## 3. Role-Based Access Control (RBAC)

### System Roles (4 Built-in Roles)

```
1. Super Admin (role-super-admin)
   ├─ Full platform access
   ├─ User management (create, read, update, delete)
   ├─ Role and permission management
   ├─ Settings configuration
   ├─ Admin dashboard access
   └─ All 22 permissions granted

2. Admin (role-admin)
   ├─ Administrative access
   ├─ User management (except deletion)
   ├─ API app management
   ├─ Webhook management
   ├─ Cannot modify admin settings or roles
   └─ 18 permissions granted

3. Moderator (role-moderator)
   ├─ Moderate users and content
   ├─ View and update users/apps
   ├─ Cannot delete or manage system
   └─ Read/write permissions on users/apps

4. User (role-user)
   ├─ Standard end-user access
   ├─ Create and manage own resources
   ├─ View apps and webhooks
   └─ Cannot access admin features
```

### Permission Categories (22 Total)

| Resource | Actions | Permissions |
|----------|---------|-------------|
| **users** | read, write, delete, manage | 4 permissions |
| **apps** | read, write, delete, manage | 4 permissions |
| **admin** | read, write, manage | 3 permissions |
| **settings** | read, write | 2 permissions |
| **webhooks** | read, write, delete | 3 permissions |
| **api_keys** | read, write, delete | 3 permissions |
| **roles** | read, write, manage | 3 permissions |

### How RBAC Works
```
User → Role(s) → Permission(s) → API Access
```

1. User assigned role(s) in `user_roles` table
2. Role linked to permissions via `role_permissions` table
3. Route middleware checks permissions
4. API returns 403 Forbidden if unauthorized

---

## 4. API Key Management System

### Generating API Keys
1. User navigates to Admin Dashboard → API Keys
2. Clicks "Generate New Key"
3. Selects scopes (permissions) for the key
4. Sets expiration date (optional)
5. System generates:
   - 32-byte random key (hex encoded)
   - First 8 chars become visible prefix (e.g., `sk_live_abc123...`)
   - Hash stored in database (full key shown only once)

### API Key Usage
```bash
# Include in Authorization header
curl -X GET https://api.elixpo.com/auth/me \
  -H "Authorization: Bearer sk_live_xxxxxxxxxxxxxxxx"
```

### Rate Limiting
Each API key has configurable limits:
- **Default**: 1000 requests per 60 seconds
- **Customizable** per key
- **Sliding window** algorithm
- **Headers included** in all responses:
  - `X-RateLimit-Limit`: Max requests
  - `X-RateLimit-Window`: Time window in seconds
  - `X-RateLimit-Remaining`: Requests left
  - `Retry-After`: Seconds to wait (on 429)

### Request Tracking
Every API request logged to `api_key_usage` table:
- Endpoint and HTTP method
- Response status code
- Response time (milliseconds)
- Client IP address
- User agent
- Timestamp

---

## 5. Email System

### Email Triggers
1. **Welcome Email** - On account creation
2. **Verification Email** - With OTP and confirmation link
3. **Password Reset** - With reset token and link
4. **Login Notification** - Optional suspicious activity alert
5. **Alert Emails** - Rate limit exceeded, permission changes

### Email Configuration
Provider: Configured via environment variables
- `SMTP_HOST`, `SMTP_PORT`
- `SMTP_USER`, `SMTP_PASSWORD`
- `EMAIL_FROM` - Sender address

---

## 6. Admin Dashboard

### Access & Authentication
- **URL**: `/admin`
- **Access Control**: Super Admin or Admin role required
- **Protection**: RBAC middleware enforces permissions
- **Session**: JWT tokens with refresh mechanism

### Dashboard Features

#### Users Management
- **List all users** - Paginated, sortable by email/date
- **Create user** - Admin creates new user account
- **View profile** - See user details, roles, permissions
- **Edit user** - Update name, email, roles
- **Delete user** - Soft delete (account disabled)
- **Reset password** - Force password change
- **Assign roles** - Add/remove roles dynamically

**Endpoint**: `GET/POST/PUT/DELETE /api/admin/users`

#### API Keys Management
- **List API keys** - All keys for organization
- **Create key** - Generate with custom scopes/limits
- **View key details** - Stats, usage, expiration
- **Rotate key** - Generate new key, deprecate old
- **Revoke key** - Disable immediately
- **View usage stats** - Requests, success rate, endpoints
- **View request logs** - Recent requests with details

**Endpoint**: `GET/POST/DELETE /api/admin/api-keys`

#### OAuth Applications
- **Register app** - Create OAuth client
- **Configure scopes** - Define permissions needed
- **Set redirect URIs** - For callback handling
- **Generate credentials** - Client ID and secret
- **Manage consents** - See user approvals

**Endpoint**: `GET/POST/PUT/DELETE /api/admin/apps`

#### Audit & Activity Logs
- **View audit trail** - All admin actions logged
- **Filter by type** - User management, settings, etc.
- **Filter by date** - Date range queries
- **View details** - What changed, who did it, when
- **Export logs** - CSV export capability

**Endpoint**: `GET /api/admin/logs`

#### Dashboard Statistics
- **Total users** - Active and inactive count
- **API keys** - Generated and revoked count
- **OAuth apps** - Total registered applications
- **Rate limits** - Exceeded limits (last 24h)
- **Login attempts** - Success and failure metrics
- **System health** - Database size, response times

**Endpoint**: `GET /api/admin/dashboard/stats`

---

## 7. Monitoring & Metrics

### Prometheus Metrics Endpoint
**URL**: `GET /api/metrics`
**Format**: Prometheus text format (compatible with Grafana)

### Key Metrics Collected
- **HTTP Requests** - Total requests by method/status
- **Request Latency** - Response time histograms
- **API Key Usage** - Per-key request counts
- **Rate Limit Events** - Exceeded limits counter
- **Authentication** - Login attempts, success/failure
- **Token Operations** - JWT issued, refreshed, revoked

### Usage in Monitoring
```bash
# Scrape metrics every 15 seconds
curl http://localhost:3000/api/metrics | grep -E "http_requests_total|api_key_requests"
```

### Integration with Grafana
1. Add Prometheus datasource pointing to `/api/metrics`
2. Create dashboards using metrics
3. Set up alerts on thresholds
4. Monitor in real-time

---

## 8. Admin Dashboard Access Guide

### Step 1: Login to Admin Panel
```
1. Navigate to: https://yourdomain.com/admin/login
2. Enter admin credentials (Super Admin or Admin role required)
3. Click "Sign In"
4. If 2FA enabled, complete verification
```

### Step 2: Access Different Sections

#### Users Section (`/admin/users`)
```
Dashboard → Users
├─ Search users by email or name
├─ View user profile (roles, created date, last login)
├─ Edit user details
├─ Assign/remove roles
├─ Reset password
└─ Delete account
```

#### API Keys Section (`/admin/api-keys`)
```
Dashboard → API Keys
├─ View all API keys
├─ Create new key with scopes
├─ View key usage statistics
├─ Monitor rate limiting
├─ Revoke compromised keys
└─ Export key usage reports
```

#### OAuth Apps Section (`/admin/apps`)
```
Dashboard → OAuth Apps
├─ Register new OAuth application
├─ Configure redirect URIs
├─ Manage client secrets
├─ View consent grants
└─ Analyze app usage
```

#### Logs Section (`/admin/logs`)
```
Dashboard → Activity Logs
├─ View all admin actions
├─ Filter by action type
├─ Filter by date range
├─ View detailed change information
└─ Export audit trail
```

#### Settings Section (`/admin/settings`)
```
Dashboard → Settings
├─ Configure email settings
├─ Set rate limit defaults
├─ Manage OAuth providers
├─ Configure security policies
└─ View system information
```

### Step 3: Manage Users from Dashboard

**Create New User**:
```
1. Click "Create User" button
2. Enter email address
3. Set temporary password
4. Assign role(s)
5. Click "Create"
6. User receives welcome email with reset link
```

**Edit User**:
```
1. Click user in list
2. Update name/email/phone
3. Assign/remove roles
4. Save changes
5. User roles take effect immediately
```

**Delete User**:
```
1. Click "Delete" on user row
2. Confirm action
3. User account disabled
4. All user data marked as deleted
5. API access revoked
```

### Step 4: Generate & Manage API Keys

**Generate New API Key**:
```
1. Navigate to API Keys section
2. Click "Generate New Key"
3. Enter key name and description
4. Select required scopes (permissions)
5. Set expiration (optional)
6. Click "Generate"
7. KEY DISPLAYED ONLY ONCE - Copy immediately!
8. Key added to database
```

**Configure Rate Limits**:
```
1. Click on API key in list
2. Edit rate limit settings:
   - Max requests: Default 1000
   - Time window: Default 60 seconds
3. Save configuration
4. Limits apply to next request
```

**Monitor Usage**:
```
1. Click API key to view details
2. See statistics panel:
   - Total requests (24h)
   - Success rate
   - Average response time
   - Top endpoints
   - Top methods (GET, POST, etc.)
3. View request log:
   - Recent 50 requests
   - Status codes
   - Response times
   - Client IPs
```

**Revoke Key**:
```
1. Click "Revoke" on API key row
2. Confirm revocation
3. Key immediately disabled
4. All API requests with key get 401 Unauthorized
5. Historical data retained for audit
```

---

## 9. Database Schema Overview

### Core Tables (16 Total)

```
users (Core user accounts)
├─ id, email, password_hash
├─ created_at, updated_at, last_login
├─ email_verified, email_verified_at
├─ device info (browser, os, location)
└─ role: user, is_admin

identities (OAuth provider links)
├─ user_id (FK)
├─ provider, provider_user_id
├─ provider_email, provider_profile_url
└─ verified

email_verification_tokens
├─ user_id (FK)
├─ otp_code, verification_token
├─ is_verified, expires_at

auth_requests (OAuth state tracking)
├─ state, nonce, pkce_verifier
├─ provider, client_id, redirect_uri
└─ expires_at

refresh_tokens
├─ user_id (FK)
├─ token_hash (unique)
├─ client_id, expires_at
└─ revoked

oauth_clients (OAuth app registration)
├─ client_id (PK)
├─ client_secret_hash, redirect_uris
├─ scopes, owner_id (FK to users)
└─ name, description, logo_url

api_keys (API authentication)
├─ id (PK)
├─ user_id (FK)
├─ key_hash (unique, bcrypt)
├─ prefix (first 8 chars, visible)
├─ scopes (JSON array)
├─ rate_limit_requests, rate_limit_window
└─ expires_at, revoked

api_key_usage (Request tracking)
├─ api_key_id (FK)
├─ endpoint, method, status_code
├─ response_time, ip_address, user_agent
└─ created_at

roles (RBAC system)
├─ id (PK)
├─ name (Super Admin, Admin, etc.)
├─ description
└─ system_role (immutable if true)

permissions (22 predefined)
├─ id (PK)
├─ name, description
├─ resource (users, apps, admin, etc.)
└─ action (read, write, delete, manage)

role_permissions (Many-to-many)
├─ role_id (FK)
└─ permission_id (FK)

user_roles (User-role assignment)
├─ user_id (FK)
├─ role_id (FK)
└─ assigned_at, assigned_by (FK)

audit_logs (Admin actions)
├─ user_id (FK)
├─ event_type, status
├─ ip_address, user_agent
└─ created_at

admin_logs (Admin-specific actions)
├─ admin_id (FK)
├─ action, resource_type, resource_id
├─ changes (JSON)
└─ created_at

app_stats (OAuth app statistics)
├─ client_id (FK)
├─ date, requests, users, errors
└─ avg_response_time

rate_limits (IP-based rate limiting)
├─ ip_address, endpoint (composite unique)
├─ attempt_count, window_reset_at
├─ is_blocked, blocked_until
└─ created_at
```

---

## 10. Security Features

### Password Security
- ✅ Bcrypt hashing with salt
- ✅ Configurable cost factor
- ✅ No plaintext storage
- ✅ Password reset via email token

### Token Security
- ✅ JWT with HS256 algorithm
- ✅ Access token (short-lived, 15 min)
- ✅ Refresh token (long-lived, 30 days)
- ✅ HTTP-only secure cookies
- ✅ CSRF protection on forms

### API Key Security
- ✅ 32-byte random generation
- ✅ Bcrypt hashing in database
- ✅ Full key shown only on creation
- ✅ Prefix visible for identification
- ✅ Expiration support
- ✅ Revocation mechanism

### OAuth Security
- ✅ PKCE flow (Proof Key for Code Exchange)
- ✅ State parameter validation
- ✅ Nonce verification
- ✅ Provider certificate validation
- ✅ Secure redirect URI whitelist

### Request Security
- ✅ Rate limiting per API key
- ✅ IP-based rate limiting
- ✅ Request logging for audit trail
- ✅ RBAC on all endpoints
- ✅ Permission-based access control

---

## 11. Environment Configuration

### Required Environment Variables

```bash
# Database
NEXT_PUBLIC_D1_DATABASE_ID=f7455042-ed14-466a-9461-5fd36f628746

# JWT Tokens
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRATION_MINUTES=15
REFRESH_TOKEN_EXPIRATION_DAYS=30

# OAuth Providers
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-secret
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-secret
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-secret

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-specific-password
EMAIL_FROM=noreply@elixpo.com

# API Configuration
API_BASE_URL=https://api.elixpo.com
NEXT_PUBLIC_APP_URL=https://elixpo.com

# Metrics
PROMETHEUS_ENABLED=true
METRICS_RETENTION_DAYS=90
```

---

## 12. Deployment Checklist

- [ ] Apply all 4 database migrations
- [ ] Create first admin user
- [ ] Configure OAuth providers
- [ ] Set up email service
- [ ] Generate JWT secret
- [ ] Deploy to Cloudflare Workers
- [ ] Enable HTTPS
- [ ] Configure DNS
- [ ] Set up monitoring/alerts
- [ ] Test OAuth flow
- [ ] Test API key generation
- [ ] Access admin dashboard
- [ ] Create admin roles
- [ ] Set up backups

---

## 13. Quick Start: Admin Dashboard First Login

### Access Admin Dashboard
```
URL: https://yourdomain.com/admin/login
```

### Login
1. Email: your-admin@elixpo.com
2. Password: Your admin password
3. Click "Sign In"

### Navigate Dashboard
Left sidebar menu:
- 📊 Dashboard - Overview stats
- 👥 Users - Manage users and roles
- 🔑 API Keys - Create and manage keys
- 📱 OAuth Apps - Register applications
- 📋 Activity Logs - View audit trail
- ⚙️ Settings - System configuration

### First Actions
1. **Create additional admin accounts**
   - Users → Create User → Assign Admin Role

2. **Configure OAuth apps**
   - OAuth Apps → Register App → Set redirect URIs

3. **Generate API keys for integrations**
   - API Keys → Generate New Key → Copy key

4. **Monitor system health**
   - Dashboard → View stats and metrics

---

## 14. Support & Documentation

### Internal Documentation
- `/docs/API_RATE_LIMITING.md` - Rate limiting guide
- `/docs/IMPLEMENTATION_GUIDE.md` - Feature status
- `/docs/RBAC.md` - Role-based access control

### API Documentation
- **Authentication**: `/api/auth/` endpoints
- **Admin**: `/api/admin/` endpoints (admin only)
- **Metrics**: `/api/metrics` (Prometheus format)
- **OAuth**: `/api/auth/authorize`, `/api/auth/callback/*`

### Key Files
- Database migrations: `/src/workers/migrations/`
- API services: `/src/lib/`
- Route handlers: `/app/api/`
- Admin pages: `/app/admin/`

---

## Summary

Your Elixpo Accounts platform is now production-ready with:

✅ **User Management** - Registration, email verification, roles
✅ **OAuth2/OIDC** - Multi-provider social authentication
✅ **API Key Management** - Secure key generation and rate limiting
✅ **RBAC System** - Fine-grained permission control
✅ **Admin Dashboard** - Full management interface
✅ **Monitoring** - Prometheus metrics and analytics
✅ **Security** - Industry-standard encryption and protocols
✅ **Audit Logging** - Complete activity trail

**Start using**: Visit https://yourdomain.com/admin to access the admin dashboard!
