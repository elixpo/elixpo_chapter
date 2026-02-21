# OAuth Client Registration - Quick Reference

## API Endpoints

All endpoints are relative to your Elixpo Accounts domain (e.g., `https://auth.elixpo.com`)

### 1. Register New Application
```
Method: POST
Path: /api/auth/oauth-clients
Authorization: None (public endpoint)

Request Body:
{
  "name": "My Application",
  "redirect_uris": ["https://myapp.com/callback", "https://myapp.com/auth/callback"],
  "scopes": ["openid", "profile", "email"]
}

Response (200 OK):
{
  "client_id": "cli_3f8e9c7d2a1b4c6f9e8d7c6b5a4f3e2d1c0b9a8f",
  "client_secret": "secret_7f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0",
  "name": "My Application",
  "redirect_uris": ["https://myapp.com/callback", "https://myapp.com/auth/callback"],
  "scopes": ["openid", "profile", "email"],
  "created_at": "2025-02-21T14:30:00Z",
  "note": "Store client_secret securely. It will not be retrievable after this response."
}
```

### 2. Get Application Details
```
Method: GET
Path: /api/auth/oauth-clients?client_id=cli_xxxxx
Authorization: None

Response (200 OK):
{
  "client_id": "cli_xxxxx",
  "name": "My Application",
  "redirect_uris": ["https://myapp.com/callback"],
  "scopes": ["openid", "profile", "email"],
  "created_at": "2025-02-21T14:30:00Z"
}

Response (404 Not Found):
{
  "error": "Application not found or inactive"
}
```

### 3. Update Application (Coming Soon)
```
Method: PUT
Path: /api/auth/oauth-clients/{client_id}
Authorization: Basic {base64(client_id:client_secret)}

Request Body:
{
  "name": "Updated Name",
  "redirect_uris": ["https://newuri.com/callback"],
  "scopes": ["openid", "profile"]
}

Response (200 OK):
{
  "message": "Application updated",
  "client_id": "cli_xxxxx"
}
```

### 4. Deactivate Application (Coming Soon)
```
Method: DELETE
Path: /api/auth/oauth-clients/{client_id}
Authorization: Basic {base64(client_id:client_secret)}

Response (200 OK):
{
  "message": "Application deactivated",
  "client_id": "cli_xxxxx"
}
```

## Client Credentials Specification

### client_id
- **Format:** `cli_` prefix + 32 random characters
- **Example:** `cli_3f8e9c7d2a1b4c6f9e8d7c6b5a4f3e2d`
- **Length:** 36 characters
- **Uniqueness:** Globally unique
- **Usage:** Included in auth URLs, can be public

### client_secret
- **Format:** `secret_` prefix + 64 random characters
- **Example:** `secret_7f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1...`
- **Length:** 71 characters
- **Uniqueness:** Globally unique
- **Usage:** NEVER share, use only for server-to-server communication
- **Storage in DB:** Only hashed (SHA-256)
- **Retrievability:** NO - cannot be recovered if lost

## OAuth Flow with Registered Applications

### Step 1: Request Authorization
```
User → OAuth Client:
"Sign in with Elixpo"

Client → Elixpo Auth:
GET /api/auth/authorize?provider=custom&client_id=cli_xxxxx&redirect_uri=https://myapp.com/callback

Response:
{
  "authUrl": "https://auth.elixpo.com/oauth/authorize?client_id=...",
  "state": "random_state_value",
  "nonce": "random_nonce_value",
  "pkceVerifier": "random_pkce_verifier"
}
```

### Step 2: User Grants Permission
```
User Redirected to:
https://auth.elixpo.com/oauth/authorize?client_id=...[lots of params]

User logs in and grants permissions

Elixpo redirects back to:
https://myapp.com/callback?code=auth_xxxxx&state=random_state_value
```

### Step 3: Exchange Code for Token
```
Your App's Backend:
POST https://auth.elixpo.com/api/auth/callback/custom

Authorization: Basic {base64(cli_xxxxx:secret_xxxxx)}
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=auth_xxxxx
&client_id=cli_xxxxx
&client_secret=secret_xxxxx
&redirect_uri=https://myapp.com/callback

Response (200 OK):
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 900,
  "id_token": "eyJhbGc..."
}
```

### Step 4: Verify Token (On Subsequent Requests)
```
Your App's Backend OR Frontend:
POST https://auth.elixpo.com/api/sso/verify

Authorization: Bearer {access_token}
X-Client-Id: cli_xxxxx

Response (200 OK):
{
  "authenticated": true,
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "tokenType": "access"
  },
  "expiresAt": "2025-02-21T14:45:00Z",
  "issuedAt": "2025-02-21T14:30:00Z"
}

Response (401 Unauthorized):
{
  "authenticated": false,
  "error": "Invalid or expired token"
}
```

## Security Checklist

✅ **Before Going Live:**

- [ ] Store `client_secret` in a secure vault (HashiCorp Vault, AWS Secrets Manager, etc.)
- [ ] Use HTTPS only (not HTTP) for all redirect_uri values
- [ ] Validate redirect_uri before redirecting (prevent open redirect)
- [ ] Implement CSRF token in your auth flow
- [ ] Log all authentication attempts
- [ ] Set up rate limiting (e.g., 10 failed login attempts → lockout)
- [ ] Monitor for suspicious patterns (IP changes, geographic anomalies)
- [ ] Enable audit logging
- [ ] Test token expiration and refresh flow
- [ ] Implement token rotation
- [ ] Use strong random state/nonce values (not predictable)
- [ ] Validate JWT signature before using claims
- [ ] Never log credentials or tokens
- [ ] Set up alerting for failed auth attempts

## Configuration Examples

### Node.js with Express

```javascript
const axios = require('axios');

async function exchangeAuthCode(code, clientId, clientSecret, redirectUri) {
  const response = await axios.post(
    'https://auth.elixpo.com/api/auth/callback/custom',
    {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    },
    {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
    }
  );

  return response.data;
}
```

### Python with Requests

```python
import requests
import base64

def exchange_auth_code(code, client_id, client_secret, redirect_uri):
    auth_str = f"{client_id}:{client_secret}"
    auth_header = f"Basic {base64.b64encode(auth_str.encode()).decode()}"
    
    response = requests.post(
        'https://auth.elixpo.com/api/auth/callback/custom',
        data={
            'grant_type': 'authorization_code',
            'code': code,
            'client_id': client_id,
            'client_secret': client_secret,
            'redirect_uri': redirect_uri,
        },
        headers={
            'Authorization': auth_header,
        }
    )
    
    return response.json()
```

### cURL Example

```bash
curl -X POST https://auth.elixpo.com/api/auth/callback/custom \
  -H "Authorization: Basic Y2xpXzMzZjhlOWM3ZDJhMWI0YzZmOWU4ZDdjNmI1YTRmM2UyZDpzZWNyZXRfN2Y5ZThkN2M2YjVhNGYzZTJkMWMwYjlhOGY3ZTZkNWM0YjNhMmYxZTA=" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=auth_xxxxx&client_id=cli_xxxxx&client_secret=secret_xxxxx&redirect_uri=https://myapp.com/callback"
```

## Troubleshooting

### "client_id not found"
- Verify client_id is correct (starts with `cli_`)
- Check application is active
- Confirm application was created using this instance

### "client_secret invalid"
- Double-check the exact secret value (case-sensitive)
- Verify it wasn't modified when stored
- If lost, you'll need to register a new application

### "redirect_uri mismatch"
- Ensure redirect_uri in callback request exactly matches registered URI
- Trailing slashes matter: `example.com/callback` ≠ `example.com/callback/`
- URL must be HTTPS in production

### "state mismatch"
- State value changed or expired
- ensure state is validated within 5 minutes
- Don't modify state between request and callback

---

**Support:** For issues, contact: support@elixpo.com
