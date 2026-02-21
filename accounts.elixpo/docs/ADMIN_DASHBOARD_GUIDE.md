# Admin Dashboard Quick Reference Guide

## 🚀 Quick Start

### Access Admin Dashboard
```
URL: https://yourdomain.com/admin
Alternative: https://yourdomain.com/admin/login (if not logged in)
```

### Login Requirements
- **Account Role**: Super Admin or Admin
- **Email**: Your admin email
- **Password**: Your admin password
- **MFA** (if enabled): Provide code from authenticator app

---

## 📊 Dashboard Overview

### Main Statistics Card
Located on home page (`/admin`):
```
┌─────────────────────────────────────┐
│ 📊 PLATFORM DASHBOARD               │
├─────────────────────────────────────┤
│ Total Users:        1,234           │
│ Active Sessions:    89              │
│ API Keys:           456             │
│ OAuth Apps:         12              │
│ Today's Logins:     234             │
│ Rate Limits Hit:    3               │
└─────────────────────────────────────┘
```

### Navigation Menu (Left Sidebar)
```
📊 Dashboard
├─ Overview Stats
├─ Activity Summary
└─ Quick Actions

👥 Users
├─ All Users (List/Search)
├─ Create User
├─ User Roles
└─ Inactive Accounts

🔑 API Keys
├─ Generate Key
├─ All Keys
├─ Usage Analytics
└─ Rate Limit Rules

📱 OAuth Apps
├─ Register App
├─ App List
├─ Credentials
└─ Consent Grants

📋 Logs
├─ Audit Trail
├─ User Activity
├─ API Usage
└─ Error Logs

⚙️ Settings
├─ System Config
├─ Email Settings
├─ OAuth Providers
└─ Security Policies
```

---

## 👥 Users Management

### View All Users
**Path**: `/admin/users`

**Actions Available**:
- 🔍 Search by email or name
- 📑 Pagination (20, 50, 100 per page)
- 🔄 Sort by: Name, Email, Created Date, Last Login
- 🎯 Filter by: Role, Status (Active/Inactive)
- 👤 View profile
- ✏️ Edit user
- 🔓 Reset password
- ❌ Delete/Deactivate

### Create New User
**Path**: `/admin/users` → "Create User" button

**Form Fields**:
```
Email:           (required, unique)
First Name:      (optional)
Last Name:       (optional)
Password:        (auto-generated, user can reset)
Role:            (select: User, Moderator, Admin, Super Admin)
Status:          (Active/Inactive)
Email Verified:  (checkbox)
```

**After Creation**:
- ✅ User record created
- 📧 Welcome email sent
- 🔗 Password reset link sent
- 🎯 Role assigned

### Edit User Profile
**Path**: `/admin/users/:id` → Edit button

**Editable Fields**:
- First Name / Last Name
- Email (if not primary identity provider)
- Phone Number
- Bio / Description
- Avatar URL
- Active Status

**Non-editable** (must use API):
- Email verification status
- Created/Updated dates
- OAuth identities

### Manage User Roles
**Path**: `/admin/users/:id` → Roles tab

**Current Actions**:
- ➕ Add Role to User
- ➖ Remove Role from User
- 👁️ View Role Permissions
- 📋 View All Assigned Roles

**Available Roles**:
```
1. User (Default)
   - Basic platform access
   - Create own resources

2. Moderator
   - Moderate users
   - View/update content
   - Cannot delete

3. Admin
   - Administrative access
   - Manage users & apps
   - Create roles
   - Cannot modify super-admin settings

4. Super Admin
   - Full platform access
   - All permissions
   - Can modify other admins
```

### Reset User Password
**Path**: `/admin/users/:id` → "Reset Password" button

**Process**:
1. Click "Reset Password"
2. System generates temporary password
3. Email sent to user with reset link
4. User logs in with temp password
5. Forced to create new password

### Deactivate/Delete User
**Path**: `/admin/users/:id` → "Delete" button

**Confirmation Dialog**:
```
⚠️ WARNING - Delete User?
   Email: user@example.com
   Will also delete:
   - All API keys
   - OAuth authorizations
   - Session tokens
   - Keep: Audit logs

   [Cancel] [Deactivate] [Permanently Delete]
```

---

## 🔑 API Keys Management

### View All API Keys
**Path**: `/admin/api-keys`

**Table Columns**:
- 🔑 Key Prefix (e.g., sk_live_abc123...)
- 👤 Owner (User email)
- 📅 Created (Date/Time)
- ⏰ Expires (Date or "Never")
- 📊 Usage (Requests in last 24h)
- ⚠️ Rate Limited (Times exceeded limit)
- 🔴 Revoked (Yes/No)
- 🎯 Actions (View, Revoke, Stats)

**Filtering & Sorting**:
- 🔍 Search by prefix or owner email
- 📅 Filter by date range
- ⚠️ Show only rate-limited keys
- 🔴 Show only revoked keys
- 🟢 Show only active keys

### Generate New API Key
**Path**: `/admin/api-keys` → "Generate New Key" button

**Step 1: Key Details**
```
Name:        (e.g., "Production API", required)
Description: (e.g., "For mobile app integration")
```

**Step 2: Select Permissions (Scopes)**
```
☑ auth:read       - Read auth info
☑ auth:write      - Perform auth operations
☐ users:read      - Read user data
☐ users:write     - Modify user data
☐ apps:read       - Read app info
☐ apps:write      - Modify apps
☐ analytics:read  - View analytics
☐ webhooks:read   - Read webhooks
☐ webhooks:write  - Manage webhooks
☐ admin:read      - Access admin panel
☐ admin:write     - Modify admin settings
```

**Step 3: Configure Limits**
```
Max Requests:  1000  (per time window)
Time Window:   60    (seconds)
Expiration:    [Never] [30 days] [90 days] [Custom date]
```

**Step 4: Generate**
```
⚠️ KEY DISPLAYED ONLY ONCE!
   sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxx
   
   [Copy to Clipboard] [Download] [Next]
```

### View API Key Details
**Path**: `/admin/api-keys/:id`

**Information Tabs**:

**Overview Tab**:
```
Prefix:           sk_live_abc123...
Owner:            john@example.com
Created:          2026-02-21 14:23 UTC
Expires:          2027-02-21 14:23 UTC
Status:           Active ✅
Scopes:           auth:read, auth:write
```

**Statistics Tab**:
```
Last 24 Hours:
  Total Requests:     1,234
  Successful (2xx):   1,200 (97%)
  Client Errors (4xx):  20 (2%)
  Server Errors (5xx):  14 (1%)
  Avg Response Time:   145ms

Top Endpoints:
  1. /api/auth/me           - 456 requests
  2. /api/users/profile     - 389 requests
  3. /api/apps              - 201 requests

Top Methods:
  GET     - 789 requests
  POST    - 345 requests
  PUT     - 100 requests
```

**Request Log Tab**:
```
Recent Requests (Last 50):
┌─────────────────────────────────┐
│ Time      | Method | Endpoint    │
├─────────────────────────────────┤
│ 14:32:15  | GET    | /api/me     │
│ 14:32:12  | POST   | /api/users  │
│ 14:32:09  | GET    | /api/apps   │
│ ...       | ...    | ...         │
└─────────────────────────────────┘
```

### Rotate API Key
**Path**: `/admin/api-keys/:id` → "Rotate Key" button

**Process**:
1. Click "Rotate Key"
2. New key generated with same permissions/limits
3. Old key marked for deprecation (7-day grace period)
4. Clients receive new key
5. Old key access revoked after grace period

### Revoke API Key
**Path**: `/admin/api-keys/:id` → "Revoke" button

**Confirmation**:
```
Revoke API Key?
Prefix: sk_live_abc123...
Owner: john@example.com

This will immediately disable the key.
All requests using this key will get 401 Unauthorized.

[Cancel] [Revoke Anyway]
```

**After Revocation**:
- ✅ Key marked as revoked in database
- ✅ All future requests fail
- ✅ Historical data retained for audit
- ✅ Cannot be re-activated
- ✅ User can generate new key

---

## 📱 OAuth Applications

### Register New OAuth App
**Path**: `/admin/oauth-apps` → "Register App" button

**Application Details**:
```
App Name:        (e.g., "Mobile App", required)
Description:     (Purpose of app)
Website URL:     (Homepage)
Logo URL:        (https://...)
```

**OAuth Configuration**:
```
Redirect URIs:   (One per line)
  https://mobile.app/callback
  https://mobile.app/auth/callback
  
Allowed Scopes:  (Check required scopes)
  ☑ openid
  ☑ profile
  ☑ email
  ☑ offline_access
```

**Auto-Generated**:
```
Client ID:       e7a3f5c2b1d9e4a6
Client Secret:   sk_oauth_xxxxxxxxxxxxxxxxxxxx (shown once!)
```

### Manage OAuth App
**Path**: `/admin/oauth-apps/:id`

**Credentials Tab**:
```
Client ID:       e7a3f5c2b1d9e4a6
Client Secret:   ••••••••••••••••• [Reveal] [Regenerate]
```

**Settings Tab**:
```
App Name:        (editable)
Website URL:     (editable)
Logo URL:        (editable)
Redirect URIs:   (editable list)
```

**Usage Tab**:
```
Total Authorizations:     234
Active Sessions:          89
Total API Calls:          5,678
Last Used:                2 minutes ago
```

### Manage User Consents
**Path**: `/admin/oauth-apps/:id` → "User Consents" tab

```
Users who authorized app:

Name          | Email              | Authorized | Revoke
──────────────────────────────────────────────────────
John Doe      | john@example.com   | Feb 20     | [X]
Jane Smith    | jane@example.com   | Feb 18     | [X]
Bob Johnson   | bob@example.com    | Feb 15     | [X]
```

---

## 📋 Audit Logs & Activity

### View Audit Trail
**Path**: `/admin/logs`

**Log Entries Include**:
```
Admin:        jane@example.com
Action:       Created User
Timestamp:    2026-02-21 14:23 UTC
IP Address:   192.168.1.100
User Agent:   Mozilla/5.0...
Status:       Success ✅
Details:      
  - Email: newuser@example.com
  - Role: Admin
```

**Filter Options**:
```
Action Type:
  ☑ Create User
  ☑ Update User
  ☑ Delete User
  ☑ Create API Key
  ☑ Revoke API Key
  ☑ Assign Role
  ☑ Change Settings

Date Range:   [Last 7 days ▼]
Admin:        [All admins ▼]
Status:       [All ▼] Success / Failed
```

### Export Logs
**Path**: `/admin/logs` → "Export" button

**Formats**:
- 📄 CSV (Excel compatible)
- 📋 JSON
- 📑 PDF Report

**Includes**:
- All filtered log entries
- Timestamp
- Admin info
- Action details
- IP addresses
- User agents

---

## ⚙️ Settings & Configuration

### Email Configuration
**Path**: `/admin/settings` → Email tab

```
SMTP Host:       smtp.gmail.com
SMTP Port:       587 (TLS) or 465 (SSL)
Username:        your-email@gmail.com
Password:        •••••••••• (masked)
From Email:      noreply@elixpo.com
From Name:       Elixpo Accounts
```

**Test Email**:
- Click "Send Test Email"
- Enter recipient
- Receive test email to confirm settings

### OAuth Providers
**Path**: `/admin/settings` → OAuth Providers tab

```
Enable/Disable Providers:
☑ Google
☑ GitHub
☑ Microsoft
☑ Discord

Provider Configuration:
Provider: Google
  Client ID:       ••••••••
  Client Secret:   ••••••••
  [Edit] [Test]
```

### System Settings
**Path**: `/admin/settings` → General tab

```
App Name:                  Elixpo Accounts
API URL:                   https://api.elixpo.com
JWT Token Expiration:      15 minutes
Refresh Token Expiration:  30 days
Max Login Attempts:        5
Lockout Duration:          15 minutes
```

---

## 📊 Dashboard Widgets

### Quick Stats
```
┌──────────────────┐  ┌──────────────────┐
│ 👥 Total Users   │  │ 🔑 API Keys      │
│    1,234         │  │    456           │
└──────────────────┘  └──────────────────┘

┌──────────────────┐  ┌──────────────────┐
│ 📱 OAuth Apps    │  │ ⚠️ Alerts        │
│    12            │  │    3             │
└──────────────────┘  └──────────────────┘
```

### Activity Timeline
```
Recent Actions:
14:32 UTC - John created user bob@example.com
14:28 UTC - Sarah rotated API key sk_live_abc...
14:15 UTC - Admin assigned Admin role to jane@example.com
13:42 UTC - System rate-limited key sk_live_xyz...
```

### System Health
```
Database Status:     🟢 Online (348 MB)
API Response Time:   🟢 145ms avg
Failed Requests:     🟡 2 in last hour
Rate Limits Hit:     🟢 0 in last hour
```

---

## 🔒 Security Best Practices

### API Key Security
1. ✅ **Never share API keys** in version control
2. ✅ **Rotate keys** regularly (monthly recommended)
3. ✅ **Revoke immediately** if compromised
4. ✅ **Use different keys** for different environments
5. ✅ **Set expiration dates** for temporary access
6. ✅ **Monitor usage** in activity logs

### Admin Account Security
1. ✅ **Use strong passwords** (16+ chars, mixed case, numbers, symbols)
2. ✅ **Enable 2FA** on admin accounts
3. ✅ **Audit admin actions** regularly
4. ✅ **Limit admin accounts** to necessary personnel
5. ✅ **Review access logs** frequently
6. ✅ **Revoke access** for inactive admins

### Rate Limiting
1. ✅ **Set appropriate limits** based on usage patterns
2. ✅ **Monitor exceeded limits** for abuse
3. ✅ **Investigate spikes** in API usage
4. ✅ **Rotate keys** showing unusual activity

---

## 🆘 Troubleshooting

### Cannot Access Admin Dashboard
```
Issue:  "403 Forbidden" error
Cause:  User lacks Admin/Super Admin role

Solution:
1. Check user roles in `/admin/users`
2. Assign Admin or Super Admin role
3. Clear browser cache
4. Log out and log back in
```

### API Key Not Working
```
Issue:  "401 Unauthorized" with API key
Cause:  Key expired, revoked, or rate limited

Solution:
1. Check key status in `/admin/api-keys`
2. Verify key hasn't expired
3. Check for rate limit headers
4. Generate new key if needed
```

### Email Not Sending
```
Issue:  Email configuration not working
Cause:  SMTP credentials incorrect or service down

Solution:
1. Go to Settings → Email
2. Verify SMTP credentials
3. Click "Send Test Email"
4. Check email service status
5. Review email logs
```

---

## 📞 Support Contacts

- **Documentation**: `/docs/` folder in repository
- **API Reference**: `/docs/API.md`
- **Rate Limiting**: `/docs/API_RATE_LIMITING.md`
- **RBAC Guide**: `/docs/RBAC.md`

---

**Ready to manage your platform? Access the dashboard now!**
🔗 **https://yourdomain.com/admin**
