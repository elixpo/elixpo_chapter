# Admin Dashboard Documentation

## Overview

The Elixpo Admin Dashboard is a secure, role-based administration panel for managing users, OAuth applications, and system-wide settings. Only users with admin privileges can access this panel.

## Features

### 🎯 Dashboard Overview
- Real-time system statistics and monitoring
- Key metrics: Total Users, Active Users, Applications, Requests
- Request trend visualization (7, 30, 90-day views)
- Top performing applications
- Average response time and error rate monitoring

### 👥 User Management
- View all registered users with detailed information
- Search and filter users by email
- User status management (Active/Inactive)
- Toggle admin privileges
- Suspend/Activate user accounts
- View user registration date and last login time
- Email verification status

### 📱 Application Management
- Monitor all registered OAuth applications
- View application owner and usage statistics
- Track requests per application
- Monitor user count per application
- Suspend or delete applications
- View application creation date and last used timestamp
- Search applications by name or owner email

### 📊 Activity Logs
- Complete audit trail of admin actions
- Filter by action type, admin, or resource
- View success/failure status
- Track changes and modifications
- Monitor admin activity over time
- Comprehensive statistics on admin actions

### ⚙️ System Settings
- **Rate Limiting**: Configure max requests and time windows
- **JWT Configuration**: Adjust token expiration times
- **Email Verification**: Customize OTP settings
- **Security**: Configure bcrypt rounds for password hashing
- **Feature Toggles**: 
  - Maintenance mode
  - New user registrations
  - Email verification requirements

## Access Control

### Admin Role Requirements
To access the admin panel, users must have:
- An active account with verified email
- Admin privileges granted by an existing admin
- Valid JWT authentication token

### Login Flow
1. Navigate to `/admin` or `/admin/login`
2. Enter admin credentials (email and password)
3. System verifies user has admin privileges
4. On success, redirect to dashboard
5. Session persists via secure JWT token

### Security Features
- Secure authentication middleware
- JWT token validation on every request
- Automatic logout on token expiration
- Protected API endpoints requiring admin role
- Activity logging for all admin actions

## Routes

### Protected Routes
- `/admin` - Main dashboard
- `/admin/apps` - Applications management
- `/admin/users` - Users management
- `/admin/logs` - Activity logs
- `/admin/settings` - System settings

### Authentication Routes
- `/admin/login` - Admin login page

## API Endpoints

### Dashboard
```
GET /api/admin/dashboard/stats?range=7d|30d|90d
```
Returns system statistics and metrics.

### Users
```
GET /api/admin/users?page=1&search=email&limit=20
PATCH /api/admin/users
```
Manage users and perform actions (toggle_admin, suspend, activate).

### Applications
```
GET /api/admin/apps?page=1&search=query&limit=20
```
List all registered OAuth applications.

### Logs
```
GET /api/admin/logs?page=1&limit=50
```
Retrieve admin activity logs.

## Database Schema

### New Tables for Admin Features

#### oauth_clients (Enhanced)
```sql
- Added: owner_id (Foreign Key to users)
- Added: description, logo_url
- Added: request_count, last_used
```

#### app_stats
```sql
- client_id: TEXT (Foreign Key)
- date: DATE
- requests: INTEGER
- users: INTEGER
- errors: INTEGER
- avg_response_time: INTEGER
```

#### admin_logs
```sql
- id: TEXT (Primary Key)
- admin_id: TEXT (Foreign Key to users)
- action: TEXT
- resource_type: TEXT
- resource_id: TEXT
- changes: TEXT
- ip_address: TEXT
- user_agent: TEXT
- status: TEXT
- created_at: DATETIME
```

#### users (Enhanced)
```sql
- Added: role TEXT (user/admin)
- Added: is_admin BOOLEAN
```

## Styling

### Color Scheme
- **Primary Green**: `#22c55e` - Active states, success
- **Dark Background**: `#0f0f0f` - Main background
- **Card Background**: `#1a1a1a` - Panels and cards
- **Border Color**: `#333` - Dividers and borders
- **Text Primary**: `#e5e7eb` - Main text
- **Text Secondary**: `#9ca3af` - Secondary text

### UI Components
- Material-UI (MUI) for consistent component design
- Custom dark theme with green accents
- Responsive grid layout
- Accessible form inputs and controls

## Deployment

### Environment Variables Required
```env
JWT_SECRET=your-jwt-secret
JWT_EXPIRATION_MINUTES=15
REFRESH_TOKEN_EXPIRATION_DAYS=30
```

### Database Migration
Run the updated schema with admin tables:
```bash
wrangler d1 execute elixpo_auth --file src/workers/migrations/0001_init_schema.sql
```

### Making First Admin User
Execute SQL to grant admin privileges:
```sql
UPDATE users SET is_admin = 1, role = 'admin' WHERE email = 'admin@example.com';
```

## Usage Examples

### Granting Admin Access
1. Go to `/admin/users`
2. Search for the user
3. Click the three-dot menu
4. Select "Toggle Admin"
5. Confirm the action

### Monitoring Application Usage
1. Navigate to `/admin`
2. View top applications in the chart
3. Click on `/admin/apps` for detailed stats
4. Sort by requests or users

### Reviewing Admin Actions
1. Go to `/admin/logs`
2. Search by admin email or action type
3. View detailed change information
4. Verify success/failure status

## Future Enhancements

- [ ] Integration with Prometheus for metrics
- [ ] Grafana dashboard embeds
- [ ] Email alerts for suspicious activities
- [ ] User export/import functionality
- [ ] Advanced analytics and reporting
- [ ] Two-factor authentication (2FA) for admins
- [ ] IP whitelist for admin access
- [ ] Webhook management interface
- [ ] API key management for integrations
- [ ] Custom permission levels

## Support

For issues or questions, contact the development team or create an issue in the repository.
