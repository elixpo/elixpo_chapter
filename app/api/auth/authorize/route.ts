import { NextRequest, NextResponse } from 'next/server';
import { generateRandomString, generatePKCE, generateNonce, generateUUID } from '@/lib/crypto';
import { getOAuthConfig } from '@/lib/oauth-config';

// Trusted domains for client authorization
const TRUSTED_DOMAINS = ['elixpo.com', 'www.elixpo.com'];

/**
 * GET /api/auth/authorize
 * 
 * OAuth 2.0 Authorization Endpoint
 * 
 * Query Parameters:
 * - response_type: 'code' (required)
 * - client_id: OAuth client ID (required)
 * - redirect_uri: Where to send the authorization code (required)
 * - scope: Space-separated scopes (optional, defaults to 'openid profile email')
 * - state: CSRF token passed back in redirect (required)
 * - nonce: For OpenID Connect (optional)
 * - code_challenge: PKCE code challenge (optional)
 * - code_challenge_method: 'S256' or 'plain' (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const responseType = searchParams.get('response_type');
    const clientId = searchParams.get('client_id');
    const redirectUri = searchParams.get('redirect_uri');
    const scope = searchParams.get('scope') || 'openid profile email';
    const state = searchParams.get('state');
    const nonce = searchParams.get('nonce');
    const codeChallenge = searchParams.get('code_challenge');
    const codeChallengeMethod = searchParams.get('code_challenge_method');

    // OAuth2 required parameters validation
    if (!responseType || !clientId || !redirectUri || !state) {
      return NextResponse.json(
        { 
          error: 'invalid_request',
          error_description: 'Missing required parameters: response_type, client_id, redirect_uri, state'
        },
        { status: 400 }
      );
    }

    if (responseType !== 'code') {
      return NextResponse.json(
        { 
          error: 'unsupported_response_type',
          error_description: 'Only response_type=code is supported'
        },
        { status: 400 }
      );
    }

    // Validate redirect_uri format
    let redirectUrl: URL;
    try {
      redirectUrl = new URL(redirectUri);
      // Ensure HTTPS in production
      if (process.env.NODE_ENV === 'production' && redirectUrl.protocol !== 'https:') {
        throw new Error('Must use HTTPS');
      }
    } catch {
      return NextResponse.json(
        { 
          error: 'invalid_request',
          error_description: 'Invalid redirect_uri format'
        },
        { status: 400 }
      );
    }

    // TODO: When D1 is integrated:
    // 1. Fetch OAuth client from database using clientId
    // 2. Verify clientId is registered
    // 3. Verify redirect_uri matches one of client's registered URIs
    // 4. Verify requested scopes are allowed
    // 5. Get current user from session/JWT
    // 6. Generate authorization code
    // 7. Store auth_request in D1 with expiry (10 minutes)
    // 8. Redirect user to consent screen if needed

    // For now, generate state for PKCE flow
    const authState = {
      clientId,
      redirectUri,
      scope,
      state,
      nonce,
      codeChallenge,
      codeChallengeMethod,
      createdAt: Date.now(),
    };

    // Store state in secure cookie
    const response = NextResponse.json({
      message: 'Authorization request received',
      clientId,
      scopes: scope.split(' '),
      state,
    });

    response.cookies.set('oauth_auth_state', JSON.stringify(authState), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60, // 10 minutes
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[OAuth Authorize] Error:', error);
    return NextResponse.json(
      { 
        error: 'server_error',
        error_description: 'Failed to process authorization request'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/authorize
 * 
 * Handle authorization code generation after user consent
 * 
 * Request Body:
 * {
 *   "clientId": "cli_xxxxx",
 *   "redirectUri": "https://app.example.com/callback",
 *   "state": "random_state_value",
 *   "approved": true/false
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientId, redirectUri, state, approved } = body;

    if (!clientId || !redirectUri || !state || approved === undefined) {
      return NextResponse.json(
        { 
          error: 'invalid_request',
          error_description: 'Missing required fields'
        },
        { status: 400 }
      );
    }

    // Validate redirect URI
    let redirectUrl: URL;
    try {
      redirectUrl = new URL(redirectUri);
      if (process.env.NODE_ENV === 'production' && redirectUrl.protocol !== 'https:') {
        throw new Error('Must use HTTPS');
      }
    } catch {
      return NextResponse.json(
        { 
          error: 'invalid_request',
          error_description: 'Invalid redirect_uri'
        },
        { status: 400 }
      );
    }

    // If user denied access
    if (!approved) {
      redirectUrl.searchParams.append('error', 'access_denied');
      redirectUrl.searchParams.append('error_description', 'User denied access');
      redirectUrl.searchParams.append('state', state);
      
      return NextResponse.json({
        redirect_uri: redirectUrl.toString(),
      });
    }

    // TODO: When D1 is integrated:
    // 1. Get current authenticated user from session
    // 2. Validate clientId is registered
    // 3. Validate redirect_uri matches registered URIs
    // 4. Generate authorization code
    // 5. Store in auth_requests table with:
    //    - code
    //    - client_id
    //    - user_id
    //    - redirect_uri
    //    - scope
    //    - expires_at (10 minutes)
    // 6. Return authorization code with state

    const authorizationCode = `code_${generateRandomString(32)}`;

    redirectUrl.searchParams.append('code', authorizationCode);
    redirectUrl.searchParams.append('state', state);

    return NextResponse.json({
      redirect_uri: redirectUrl.toString(),
      code: authorizationCode,
    });

  } catch (error) {
    console.error('[OAuth Authorize POST] Error:', error);
    return NextResponse.json(
      { 
        error: 'server_error',
        error_description: 'Failed to generate authorization code'
      },
      { status: 500 }
    );
  }
}
