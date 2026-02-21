# 🚀 Quick Start: How Your Platform Works

## The Complete Flow - From Start to End

### 1️⃣ User Signup
```
User visits /auth/register
    ↓
Enters email, password, name
    ↓
Client validates input
    ↓
POST /api/auth/register
    ↓
Server hashes password (bcrypt)
    ↓
Creates user in database
    ↓
Sends verification email with OTP
    ↓
User verifies email
    ↓
Account active ✅
```

### 2️⃣ User Login
```
User visits /auth/login
    ↓
Enters email & password
    ↓
POST /api/auth/login
    ↓
Server checks email exists
    ↓
Verifies password hash
    ↓
Generates JWT tokens:
  • Access Token (15 min)
  • Refresh Token (30 days)
    ↓
Returns tokens in secure HTTP-only cookies
    ↓
User logged in ✅
```

### 3️⃣ OAuth Social Login
```
User clicks "Login with Google"
    ↓
Redirected to Google login
    ↓
Google verifies identity
    ↓
Returns auth code
    ↓
Callback to /api/auth/callback/google
    ↓
Server exchanges code for Google tokens
    ↓
Fetches user profile from Google
    ↓
Checks if identity exists
    ↓
If new → Create user account
If existing → Link identity
    ↓
Issues JWT tokens
    ↓
User logged in ✅
```

### 4️⃣ API Key Generation (Admin)
```
Admin visits /admin/api-keys
    ↓
Clicks "Generate New Key"
    ↓
Fills form:
  - Name
  - Scopes (permissions)
  - Expiration date
    ↓
System generates 32-byte random key
    ↓
Creates prefix (first 8 chars visible)
    ↓
Hashes key (bcrypt)
    ↓
Stores in database
    ↓
KEY SHOWN ONLY ONCE ⚠️
    ↓
Admin copies: sk_live_abc123xyz...
    ↓
Key ready to use ✅
```

### 5️⃣ API Request with Key
```
Client sends API request:
  Authorization: Bearer sk_live_abc123xyz...
    ↓
Server extracts key from header
    ↓
Looks up key in database
    ↓
Validates key hasn't expired
    ↓
Checks if revoked
    ↓
Validates scopes match request
    ↓
Checks rate limit:
  • Count requests in 60-second window
  • If < 1000 → Allow ✅
  • If >= 1000 → Reject 429 ❌
    ↓
If allowed:
  • Process request
  • Log usage to api_key_usage table
  • Add rate limit headers:
    - X-RateLimit-Limit: 1000
    - X-RateLimit-Remaining: 987
    ↓
Return response ✅
```

### 6️⃣ Admin Dashboard Access
```
Admin visits https://yourdomain.com/admin
    ↓
Checks user is logged in
    ↓
Verifies user has Admin or Super Admin role
    ↓
If yes → Shows dashboard ✅
If no → 403 Forbidden ❌
    ↓
Admin sees:
  📊 Dashboard (stats)
  👥 Users (manage users)
  🔑 API Keys (generate/revoke)
  📱 OAuth Apps (register apps)
  📋 Logs (audit trail)
  ⚙️ Settings (system config)
```

---

## 📊 Database Schema (16 Tables)

### User Management (5 tables)
```
users
├─ id, email, password_hash
├─ created_at, last_login
├─ email_verified, role, is_admin

identities
├─ Stores OAuth provider links
├─ user_id → users

email_verification_tokens
├─ OTP codes
├─ verification tokens
├─ expires_at

auth_requests
├─ OAuth state tracking
├─ PKCE/nonce values

refresh_tokens
├─ Session tokens
├─ Expiration tracking
├─ Revocation support
```

### API Management (2 tables)
```
api_keys
├─ Key hash (bcrypt)
├─ Prefix (visible)
├─ Scopes (JSON)
├─ Rate limits
├─ Expiration
├─ Revoked status

api_key_usage
├─ Every API request logged
├─ Endpoint, method, status
├─ Response time, IP, user agent
├─ Timestamp
```

### OAuth Apps (2 tables)
```
oauth_clients
├─ App registration
├─ Client ID/secret
├─ Redirect URIs
├─ Scopes

app_stats
├─ Daily statistics
├─ Request counts
├─ Error tracking
```

### RBAC System (4 tables)
```
roles
├─ 4 system roles
├─ Super Admin, Admin, Moderator, User
├─ Cannot be deleted (system_role=1)

permissions
├─ 22 predefined permissions
├─ By resource (users, apps, admin, etc.)
├─ By action (read, write, delete, manage)

role_permissions
├─ Links roles to permissions
├─ Many-to-many mapping

user_roles
├─ Assigns roles to users
├─ Many-to-many mapping
├─ Tracks who assigned what role
```

### Auditing (3 tables)
```
audit_logs
├─ User activity log
├─ Login attempts
├─ Password changes

admin_logs
├─ Admin action log
├─ User creation/deletion
├─ Role assignments
├─ Settings changes

rate_limits
├─ IP-based rate limiting
├─ Tracks abuse attempts
├─ Blocking support
```

---

## 🔐 Security Features

| Feature | Implementation |
|---------|-----------------|
| **Password Hashing** | bcrypt (12 rounds) |
| **API Key Storage** | bcrypt hashed in DB |
| **Tokens** | JWT (HS256) |
| **Cookie Security** | HTTP-only, Secure, SameSite |
| **Rate Limiting** | Sliding window per API key |
| **OAuth** | PKCE + State + Nonce |
| **Access Control** | RBAC with 22 permissions |
| **Audit Trail** | Complete logging |
| **Key Expiration** | Configurable per key |
| **Key Revocation** | Immediate disabling |

---

## 📋 Roles & Permissions

### 4 System Roles
```
Super Admin (role-super-admin)
  └─ 22/22 permissions ✅
  └─ Full platform access

Admin (role-admin)
  └─ 18/22 permissions
  └─ User & app management

Moderator (role-moderator)
  └─ 8/22 permissions
  └─ Content moderation

User (role-user)
  └─ 4/22 permissions
  └─ Personal resource management
```

### 22 Permissions by Resource
```
users:      read, write, delete, manage    (4)
apps:       read, write, delete, manage    (4)
admin:      read, write, manage            (3)
settings:   read, write                    (2)
webhooks:   read, write, delete            (3)
api_keys:   read, write, delete            (3)
roles:      read, write, manage            (3)
```

---

## 🎯 Admin Dashboard Sections

### 1. Users (`/admin/users`)
```
✅ List all users
✅ Create new user
✅ Edit user profile
✅ Assign roles
✅ Reset password
✅ Delete account
```

### 2. API Keys (`/admin/api-keys`)
```
✅ Generate new key
✅ View all keys
✅ See usage statistics
✅ Monitor rate limits
✅ Revoke key
✅ View request logs
```

### 3. OAuth Apps (`/admin/apps`)
```
✅ Register OAuth app
✅ Configure scopes
✅ Manage redirect URIs
✅ View credentials
✅ Track usage
```

### 4. Activity Logs (`/admin/logs`)
```
✅ View audit trail
✅ Filter by action
✅ Filter by date
✅ View details
✅ Export CSV/JSON
```

### 5. Settings (`/admin/settings`)
```
✅ Email configuration
✅ OAuth provider setup
✅ System settings
✅ Security policies
```

---

## 📊 Monitoring & Metrics

### Metrics Endpoint
```
GET /api/metrics
```

### Tracked Metrics
```
HTTP Requests
  ├─ Total by method & status
  ├─ Response time (histogram)
  └─ Error rates

API Key Usage
  ├─ Requests per key
  ├─ Rate limit hits
  └─ Success/failure rates

Authentication
  ├─ Login attempts
  ├─ Success/failure counts
  └─ Token operations

System Health
  ├─ Database size
  ├─ Response times
  └─ Error rates
```

---

## 🗄️ Database Current State

```
✅ Migration 0001: Basic schema (users, identities, etc.)
✅ Migration 0002: Extended columns (role, is_admin)
✅ Migration 0003: API Keys (api_keys, api_key_usage)
✅ Migration 0004: RBAC (roles, permissions, role_permissions, user_roles)

Total: 16 tables
Total: 45+ indexes
Total: 4 system roles
Total: 22 permissions
Status: ✅ Ready for Production
```

---

## 🚀 Get Started Now

### Step 1: Access Admin Dashboard
```
URL: https://yourdomain.com/admin/login
```

### Step 2: Login as Admin
```
Email: your-admin@example.com
Password: your-admin-password
```

### Step 3: Create Users
```
Admin → Users → Create User
```

### Step 4: Generate API Keys
```
Admin → API Keys → Generate New Key
```

### Step 5: Use API
```bash
curl -X GET https://api.elixpo.com/auth/me \
  -H "Authorization: Bearer sk_live_xxxxx"
```

---

## 📚 Documentation Files

```
/docs/
├─ PLATFORM_OVERVIEW.md          Complete platform guide
├─ ADMIN_DASHBOARD_GUIDE.md       Dashboard reference
├─ DATABASE_STATUS.md             Database schema details
├─ API_RATE_LIMITING.md           Rate limiting implementation
├─ IMPLEMENTATION_GUIDE.md        Feature status tracking
├─ RBAC.md                        Role-based access control
└─ QUICK_START.md                 This file!
```

---

## ✅ Current Status

- ✅ User authentication (email/password + OAuth)
- ✅ Email verification
- ✅ JWT token management
- ✅ API key generation & validation
- ✅ Rate limiting (1000 req/60sec per key)
- ✅ RBAC system (4 roles, 22 permissions)
- ✅ Admin dashboard
- ✅ Prometheus metrics
- ✅ Audit logging
- ✅ Database (16 tables, fully optimized)
- ⏳ Webhooks (planned)
- ⏳ Advanced analytics (planned)
- ⏳ Email alerts (planned)

---

**🎉 Your platform is ready to use!**

Start managing users, API keys, and OAuth apps from the admin dashboard.

**Questions?** Check `/docs/` for detailed guides.
