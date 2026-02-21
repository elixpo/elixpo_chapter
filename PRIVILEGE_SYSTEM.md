# Privilege/Role System Documentation

## Overview

The Elixpo Accounts system now includes a privilege-based access control system that allows fine-grained permission management. Users can have multiple privileges, which can be managed through the monitoring dashboard.

## Database Schema

### `privileges` Table
Stores all available privileges/roles in the system.

```sql
CREATE TABLE privileges (
  id TEXT PRIMARY KEY,                    -- Unique identifier (priv_xxxxx)
  code TEXT UNIQUE NOT NULL,              -- e.g., 'admin', 'app_developer', 'user'
  name TEXT NOT NULL,                     -- Display name
  description TEXT,                       -- Human readable description
  is_system BOOLEAN DEFAULT 0,            -- System privileges cannot be deleted
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `user_privileges` Table
Maps users to privileges (many-to-many relationship).

```sql
CREATE TABLE user_privileges (
  id TEXT PRIMARY KEY,                    -- Unique identifier
  user_id TEXT NOT NULL,                  -- FK to users
  privilege_id TEXT NOT NULL,             -- FK to privileges
  granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  granted_by TEXT,                        -- Admin user_id who granted this
  expiry_date DATETIME,                   -- Optional: When privilege expires
  reason TEXT,                            -- Why this privilege was granted
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (privilege_id) REFERENCES privileges(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(user_id, privilege_id)           -- Cannot grant same privilege twice
);
```

## Database Functions

All privilege operations are available in [src/lib/db.ts](src/lib/db.ts):

### Creating Privileges
```typescript
import { createPrivilege, getPrivilegeByCode } from '@/lib/db';

await createPrivilege(db, {
  id: generateUUID(),
  code: 'app_developer',
  name: 'Application Developer',
  description: 'Can create and manage OAuth applications',
  isSystem: false,
});
```

### Granting Privileges to Users
```typescript
import { grantPrivilegeToUser } from '@/lib/db';

await grantPrivilegeToUser(db, {
  id: generateUUID(),
  userId: 'user_123',
  privilegeId: 'priv_456',
  grantedBy: 'admin_user_id',
  expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  reason: 'Developer team onboarding',
});
```

### Checking User Privileges
```typescript
import { hasPrivilege, getUserPrivileges } from '@/lib/db';

// Check single privilege
const canCreateApps = await hasPrivilege(db, userId, 'app_developer');

// Get all user privileges
const privileges = await getUserPrivileges(db, userId);
// Returns: [{ id, code, name, description, granted_at, expiry_date }, ...]
```

### Revoking Privileges
```typescript
import { revokePrivilegeFromUser } from '@/lib/db';

await revokePrivilegeFromUser(db, userId, privilegeId);
```

## Default Privileges (To Create)

These should be seeded into the database during initial setup:

```typescript
const DEFAULT_PRIVILEGES = [
  {
    code: 'user',
    name: 'User',
    description: 'Basic user access',
    isSystem: true,
  },
  {
    code: 'app_developer',
    name: 'Application Developer',
    description: 'Can create and manage OAuth applications',
    isSystem: false,
  },
  {
    code: 'admin',
    name: 'Administrator',
    description: 'Full system access',
    isSystem: true,
  },
  {
    code: 'audit_viewer',
    name: 'Audit Log Viewer',
    description: 'Can view audit logs and security events',
    isSystem: false,
  },
  {
    code: 'user_manager',
    name: 'User Manager',
    description: 'Can manage users and grant privileges',
    isSystem: false,
  },
];
```

## Implementation Guide

### Step 1: Seed Default Privileges
Create a migration or initialization script:

```typescript
// scripts/seed-privileges.ts
import { D1Database } from '@cloudflare/workers-types';
import { createPrivilege } from '@/lib/db';
import { generateUUID } from '@/lib/crypto';

export async function seedPrivileges(db: D1Database) {
  const privileges = [
    { code: 'user', name: 'User', isSystem: true },
    { code: 'app_developer', name: 'Application Developer', isSystem: false },
    { code: 'admin', name: 'Administrator', isSystem: true },
    { code: 'audit_viewer', name: 'Audit Log Viewer', isSystem: false },
    { code: 'user_manager', name: 'User Manager', isSystem: false },
  ];

  for (const priv of privileges) {
    await createPrivilege(db, {
      id: `priv_${generateUUID()}`,
      code: priv.code,
      name: priv.name,
      description: `${priv.name} privilege`,
      isSystem: priv.isSystem,
    });
  }
}
```

Run via:
```bash
wrangler d1 execute elixpo_auth --file scripts/seed-privileges.ts
```

### Step 2: Integrate with Monitoring Dashboard

The monitoring dashboard should provide:

#### List All Users with Their Privileges
```typescript
// GET /api/admin/users
// Returns all users with their assigned privileges
```

#### Grant Privilege to User
```typescript
// POST /api/admin/users/{userId}/privileges
// {
//   "privilege_code": "app_developer",
//   "expiry_date": "2025-12-31",
//   "reason": "Team lead for OAuth project"
// }
```

#### Revoke Privilege from User
```typescript
// DELETE /api/admin/users/{userId}/privileges/{privilege_id}
```

#### List All Privileges
```typescript
// GET /api/admin/privileges
// Returns all available privileges
```

### Step 3: Protect API Routes with Privilege Checks

```typescript
// app/api/auth/oauth-clients/route.ts
import { verifyJWT } from '@/lib/jwt';
import { hasPrivilege } from '@/lib/db';

export async function POST(request: NextRequest) {
  // Get user from token
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.substring(7);
  const payload = await verifyJWT(token);
  
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check privilege
  const canCreateApps = await hasPrivilege(db, payload.sub, 'app_developer');
  
  if (!canCreateApps) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // Proceed with creating OAuth application
  // ...
}
```

### Step 4: UI Integration

#### Dashboard UI Component
```typescript
// app/dashboard/privileges/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { Box, Table, Button, Dialog } from '@mui/material';

type Privilege = {
  id: string;
  code: string;
  name: string;
  description: string;
};

const PrivilegesPage = () => {
  const [privileges, setPrivileges] = useState<Privilege[]>([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);

  // Fetch users and their privileges
  const fetchUsersAndPrivileges = async () => {
    const response = await fetch('/api/admin/users');
    const data = await response.json();
    setUsers(data.users);
  };

  // Grant privilege
  const grantPrivilege = async (userId: string, privilegeCode: string) => {
    const response = await fetch(`/api/admin/users/${userId}/privileges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        privilege_code: privilegeCode,
        reason: 'Granted via dashboard',
      }),
    });

    if (response.ok) {
      fetchUsersAndPrivileges();
    }
  };

  // Revoke privilege
  const revokePrivilege = async (userId: string, privilegeId: string) => {
    const response = await fetch(
      `/api/admin/users/${userId}/privileges/${privilegeId}`,
      { method: 'DELETE' }
    );

    if (response.ok) {
      fetchUsersAndPrivileges();
    }
  };

  useEffect(() => {
    fetchUsersAndPrivileges();
  }, []);

  // Render users table with privilege management
  return (
    <Box>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>User</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Privileges</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user.privileges.map(p => p.name).join(', ')}</TableCell>
              <TableCell>
                <Button onClick={() => {
                  setSelectedUser(user);
                  setOpenDialog(true);
                }}>
                  Manage
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
};
```

## Security Considerations

✅ **Implemented:**
- Privilege expiry dates (auto-revocation)
- Audit trail (granted_by, reason, granted_at)
- Unique constraint on (user_id, privilege_id)
- System privileges cannot be deleted
- Cascading deletes (removing user removes privileges)

⚠️ **To Implement:**
- Rate limiting on privilege operations
- Activity logging when privileges change
- Approval workflow for sensitive privileges (e.g., admin)
- Privilege escalation detection
- Regular audit reports of privilege assignments

## API Endpoints (To Create)

### For Users
```
GET /api/auth/me/privileges
  - Get current user's privileges
  - Returns: [{ code, name, granted_at, expiry_date }, ...]

GET /api/auth/me/privileges/{privilege_code}
  - Check if user has specific privilege
  - Returns: { has_privilege: boolean, expiry_date?: string }
```

### For Admins (Monitoring Dashboard)
```
GET /api/admin/privileges
  - List all privileges

GET /api/admin/users
  - List all users with their privileges

GET /api/admin/users/{userId}/privileges
  - Get user's privileges with details

POST /api/admin/users/{userId}/privileges
  - Grant privilege to user
  - Body: { privilege_code, expiry_date?, reason? }

DELETE /api/admin/users/{userId}/privileges/{privilegeId}
  - Revoke privilege from user

GET /api/admin/privileges-audit
  - Get audit log of privilege changes
  - Returns: [{ user_id, event, timestamp, changed_by }, ...]
```

## Example: Using Privileges in OAuth App Registration

```typescript
// When user tries to register a new OAuth app
export async function POST(request: NextRequest) {
  const payload = await verifyJWT(token);
  
  // Check if user has privilege to create apps
  const canCreate = await hasPrivilege(db, payload.sub, 'app_developer');
  
  if (!canCreate) {
    // Check if they have admin privilege
    const isAdmin = await hasPrivilege(db, payload.sub, 'admin');
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'You do not have permission to register applications. Contact an administrator.' },
        { status: 403 }
      );
    }
  }

  // Proceed with registration
  const clientId = `cli_${generateRandomString(32)}`;
  const clientSecret = `secret_${generateRandomString(64)}`;
  
  await createOAuthClient(db, {
    clientId,
    clientSecretHash: hashString(clientSecret),
    name: body.name,
    redirectUris: JSON.stringify(body.redirect_uris),
    scopes: JSON.stringify(body.scopes),
  });

  return NextResponse.json({ client_id: clientId, client_secret: clientSecret });
}
```

## Files Modified/Created

```
✅ src/workers/schema.sql
   - Added: privileges table
   - Added: user_privileges table
   - Added: 4 new indices for performance

✅ src/lib/db.ts
   - Added: createPrivilege()
   - Added: getPrivilegeByCode()
   - Added: grantPrivilegeToUser()
   - Added: revokePrivilegeFromUser()
   - Added: getUserPrivileges()
   - Added: hasPrivilege()
   - Added: listPrivileges()

🔜 TO CREATE:
   - app/api/admin/users/route.ts
   - app/api/admin/users/[userId]/privileges/route.ts
   - app/dashboard/privileges/page.tsx
   - scripts/seed-privileges.ts
```

## Next Steps

1. **Seed Initial Privileges**
   ```bash
   npm run seed:privileges
   ```

2. **Grant Admin Privilege to First User**
   ```sql
   INSERT INTO user_privileges 
   VALUES (uuid(), 'user_123', 'priv_admin_id', NOW(), NULL, NULL, 'Initial admin grant');
   ```

3. **Create Admin Dashboard for Privilege Management**
   - User list with current privileges
   - Grant/revoke buttons
   - Privilege expiry management
   - Audit log viewer

4. **Integrate with Monitoring Dashboard**
   - Add privileges section
   - User management interface
   - Privilege assignment workflow

---

**Note:** The privilege system is fully implemented at the database level. Integration with the monitoring dashboard and API endpoints can be added incrementally as needed.
