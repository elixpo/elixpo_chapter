import { NextRequest, NextResponse } from 'next/server';
import { hashString, generateUUID } from '@/lib/crypto';
import { verifyJWT, createAccessToken, createRefreshToken } from '@/lib/jwt';
import { getAuthRequestByState, getOAuthClientByIdWithSecret, validateOAuthClient, getRefreshTokenByHash, revokeRefreshToken, createRefreshToken as storeRefreshToken } from '@/lib/db';
import { getDatabase } from '@/lib/d1-client';

/**
 * POST /api/auth/token
 * 
 * SSO Token Endpoint
 * 
 * Supports:
 * 1. Authorization Code Flow: grant_type=authorization_code (for SSO clients)
 * 2. Refresh Token Flow: grant_type=refresh_token
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

      const db = await getDatabase();

      try {
        // 1. Fetch OAuth client and verify secret
        const client = await getOAuthClientByIdWithSecret(db, client_id);
        if (!client) {
          return NextResponse.json(
            {
              error: 'invalid_client',
              error_description: 'Client not found',
            },
            { status: 401 }
          );
        }

        // 2. Verify client_secret (compare hashes)
        const clientSecretHash = hashString(client_secret);
        const isValidSecret = await validateOAuthClient(db, client_id, clientSecretHash);
        if (!isValidSecret) {
          return NextResponse.json(
            {
              error: 'invalid_client',
              error_description: 'Invalid client credentials',
            },
            { status: 401 }
          );
        }

        // 3. Verify redirect_uri matches
        const redirectUris = JSON.parse((client as any).redirect_uris || '[]');
        if (!redirectUris.includes(redirect_uri)) {
          return NextResponse.json(
            {
              error: 'invalid_grant',
              error_description: 'redirect_uri does not match',
            },
            { status: 400 }
          );
        }

        // 4. For now, generate tokens with placeholder user info
        // In a full implementation, the authorization code would be stored with the user_id
        const userId = generateUUID(); // TODO: from auth request lookup
        const email = `user@${new URL(redirect_uri).hostname}`;
        const scopes = (scope || 'openid profile email').split(' ');

        const accessToken = await createAccessToken(userId, email, 'email');
        const refreshTokenJWT = await createRefreshToken(userId, 'email');

        // Store refresh token
        const refreshTokenHash = hashString(refreshTokenJWT);
        await storeRefreshToken(db, {
          id: generateUUID(),
          userId,
          tokenHash: refreshTokenHash,
          clientId: client_id,
          expiresAt: new Date(Date.now() + parseInt(process.env.REFRESH_TOKEN_EXPIRATION_DAYS || '30') * 24 * 60 * 60 * 1000),
        });

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
      } catch (error) {
        console.error('[Token] Authorization code flow error:', error);
        return NextResponse.json(
          {
            error: 'server_error',
            error_description: 'Failed to process token request',
          },
          { status: 500 }
        );
      }
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

      const db = await getDatabase();

      try {
        // 1. Verify refresh token JWT
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

        // 2. Verify refresh token in DB and not revoked
        const refreshTokenHash = hashString(refresh_token);
        const tokenRecord = await getRefreshTokenByHash(db, refreshTokenHash);
        if (!tokenRecord) {
          return NextResponse.json(
            {
              error: 'invalid_grant',
              error_description: 'Refresh token not found or revoked',
            },
            { status: 400 }
          );
        }

        // 3. Verify client_id matches if stored
        if ((tokenRecord as any).client_id && (tokenRecord as any).client_id !== client_id) {
          return NextResponse.json(
            {
              error: 'invalid_client',
              error_description: 'Client ID does not match token',
            },
            { status: 401 }
          );
        }

        // 4. Issue new access token
        const newAccessToken = await createAccessToken(payload.sub, payload.email, payload.provider);

        // 5. Optionally rotate refresh token
        const newRefreshToken = await createRefreshToken(payload.sub, payload.provider);
        const newRefreshTokenHash = hashString(newRefreshToken);

        // Revoke old token and store new one
        try {
          await revokeRefreshToken(db, refreshTokenHash);
          await storeRefreshToken(db, {
            id: generateUUID(),
            userId: payload.sub,
            tokenHash: newRefreshTokenHash,
            clientId: client_id,
            expiresAt: new Date(Date.now() + parseInt(process.env.REFRESH_TOKEN_EXPIRATION_DAYS || '30') * 24 * 60 * 60 * 1000),
          });
        } catch (storageError) {
          console.error('[Token] Token rotation error:', storageError);
          // Continue anyway - new access token is still valid
        }

        return NextResponse.json(
          {
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            token_type: 'Bearer',
            expires_in: parseInt(process.env.JWT_EXPIRATION_MINUTES || '15') * 60,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error('[Token] Refresh token flow error:', error);
        return NextResponse.json(
          {
            error: 'server_error',
            error_description: 'Failed to refresh token',
          },
          { status: 500 }
        );
      }
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
