import { NextRequest, NextResponse } from 'next/server';
import { hashString, generateRandomString } from '@/lib/crypto';
import { verifyJWT, createAccessToken, createRefreshToken } from '@/lib/jwt';

/**
 * POST /api/auth/token
 * 
 * OAuth 2.0 Token Endpoint
 * 
 * Supports:
 * 1. Authorization Code Flow: grant_type=authorization_code
 * 2. Refresh Token Flow: grant_type=refresh_token
 * 3. Client Credentials Flow: grant_type=client_credentials
 * 
 * Request Body (Authorization Code):
 * {
 *   "grant_type": "authorization_code",
 *   "code": "code_xxxxx",
 *   "client_id": "cli_xxxxx",
 *   "client_secret": "secret_xxxxx",
 *   "redirect_uri": "https://app.example.com/callback"
 * }
 * 
 * Response:
 * {
 *   "access_token": "eyJ...",
 *   "token_type": "Bearer",
 *   "expires_in": 900,
 *   "refresh_token": "eyJ...",
 *   "scope": "openid profile email"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { grant_type, code, client_id, client_secret, redirect_uri, refresh_token, scope } = body;

    if (!grant_type) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'grant_type is required',
        },
        { status: 400 }
      );
    }

    // Authorization Code Flow (RFC 6749 Section 4.1)
    if (grant_type === 'authorization_code') {
      if (!code || !client_id || !client_secret || !redirect_uri) {
        return NextResponse.json(
          {
            error: 'invalid_request',
            error_description: 'Missing required parameters: code, client_id, client_secret, redirect_uri',
          },
          { status: 400 }
        );
      }

      // TODO: When D1 is integrated:
      // 1. Fetch auth_request from DB using code
      // 2. Verify code hasn't expired (10 minutes)
      // 3. Verify code hasn't been used before
      // 4. Fetch OAuth client from DB using client_id
      // 5. Verify client_secret matches (use hashString to compare hashes)
      // 6. Verify redirect_uri matches
      // 7. Get user_id from auth_request
      // 8. Mark auth_request as used
      // 9. Issue access_token and refresh_token

      const userId = 'user_xxx'; // TODO: from DB
      const email = 'user@example.com'; // TODO: from DB
      const scopes = (scope || 'openid profile email').split(' ');

      const accessToken = await createAccessToken(userId, email, 'email');
      const refreshTokenJWT = await createRefreshToken(userId, 'email');

      return NextResponse.json(
        {
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: parseInt(process.env.JWT_EXPIRATION_MINUTES || '15') * 60,
          refresh_token: refreshTokenJWT,
          scope: scopes.join(' '),
        },
        { status: 200 }
      );
    }

    // Refresh Token Flow (RFC 6749 Section 6)
    if (grant_type === 'refresh_token') {
      if (!refresh_token || !client_id) {
        return NextResponse.json(
          {
            error: 'invalid_request',
            error_description: 'Missing required parameters: refresh_token, client_id',
          },
          { status: 400 }
        );
      }

      // Verify refresh token JWT
      const payload = await verifyJWT(refresh_token);
      if (!payload || payload.type !== 'refresh') {
        return NextResponse.json(
          {
            error: 'invalid_grant',
            error_description: 'Invalid or expired refresh token',
          },
          { status: 400 }
        );
      }

      // TODO: When D1 is integrated:
      // 1. Verify client_id exists
      // 2. Verify refresh_token_hash in DB and not revoked
      // 3. Issue new access_token
      // 4. Optionally issue new refresh_token (rotation)

      const newAccessToken = await createAccessToken(payload.sub, payload.email, payload.provider);

      return NextResponse.json(
        {
          access_token: newAccessToken,
          token_type: 'Bearer',
          expires_in: parseInt(process.env.JWT_EXPIRATION_MINUTES || '15') * 60,
        },
        { status: 200 }
      );
    }

    // Client Credentials Flow (RFC 6749 Section 4.4)
    if (grant_type === 'client_credentials') {
      if (!client_id || !client_secret) {
        return NextResponse.json(
          {
            error: 'invalid_request',
            error_description: 'Missing required parameters: client_id, client_secret',
          },
          { status: 400 }
        );
      }

      // TODO: Implement service-to-service authentication
      // This allows backend services to call APIs on behalf of themselves

      return NextResponse.json(
        {
          error: 'unsupported_grant_type',
          error_description: 'client_credentials not yet implemented',
        },
        { status: 501 }
      );
    }

    // Unsupported grant type
    return NextResponse.json(
      {
        error: 'unsupported_grant_type',
        error_description: `grant_type '${grant_type}' is not supported`,
      },
      { status: 400 }
    );

  } catch (error) {
    console.error('[Token Endpoint] Error:', error);
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Failed to process token request',
      },
      { status: 500 }
    );
  }
}
