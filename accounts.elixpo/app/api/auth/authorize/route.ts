import { NextRequest, NextResponse } from 'next/server';
import { generateRandomString, generateUUID } from '@/lib/crypto';
import { getOAuthClientById, createAuthRequest } from '@/lib/db';
import { getDatabase } from '@/lib/d1-client';

// Built-in/trusted domains auto-whitelisted
const BUILTIN_DOMAINS = ['elixpo.com', 'www.elixpo.com'];

/**
 * GET /api/auth/authorize
 * 
 * SSO Authorization Endpoint
 * Third-party services redirect users here to authenticate
 * 
 * Query Parameters:
 * - response_type: 'code' (required)
 * - client_id: SSO client ID (required)
 * - redirect_uri: Where to redirect after auth (required)
 * - scope: Space-separated scopes (optional, defaults to 'openid profile email')
 * - state: CSRF token passed back in redirect (required)
 * - nonce: For OpenID Connect (optional)
 * 
 * Flow:
 * 1. Validate client_id and redirect_uri
 * 2. Check if user is already authenticated
 * 3. If not, show login page
 * 4. After auth, generate authorization_code
 * 5. Redirect to redirect_uri with code
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

    // Validate required parameters
    if (!responseType || !clientId || !redirectUri || !state) {
      return NextResponse.json(
        { 
          error: 'invalid_request',
          error_description: 'Missing required: response_type, client_id, redirect_uri, state'
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
          error_description: 'Invalid redirect_uri: must be valid URL with HTTPS'
        },
        { status: 400 }
      );
    }

    // Check if client_id is built-in Elixpo domain or needs D1 lookup
    const isBuiltinClient = BUILTIN_DOMAINS.includes(redirectUrl.hostname);
    
    const db = await getDatabase();

    if (!isBuiltinClient) {
      // For external clients: validate against D1
      try {
        const client = await getOAuthClientById(db, clientId);
        if (!client) {
          return NextResponse.json(
            { 
              error: 'invalid_client',
              error_description: 'Client not found or not active'
            },
            { status: 401 }
          );
        }

        const redirectUris = JSON.parse((client as any).redirect_uris || '[]');
        if (!redirectUris.includes(redirectUri)) {
          return NextResponse.json(
            { 
              error: 'invalid_request',
              error_description: 'redirect_uri not whitelisted for this client'
            },
            { status: 400 }
          );
        }

        if (!(client as any).is_active) {
          return NextResponse.json(
            { 
              error: 'invalid_client',
              error_description: 'Client is not active'
            },
            { status: 401 }
          );
        }

        console.log(`[SSO Authorize] External client validated: ${clientId}`);
      } catch (error) {
        console.error('[SSO Authorize] Client validation error:', error);
        return NextResponse.json(
          { 
            error: 'server_error',
            error_description: 'Failed to validate client'
          },
          { status: 500 }
        );
      }
    } else {
      console.log(`[SSO Authorize] Built-in client: ${clientId} (${redirectUrl.hostname})`);
    }

    // Generate authorization code (valid for 10 minutes, single-use)
    const authCode = `code_${generateRandomString(64)}`;
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes
    const pkceVerifier = generateRandomString(128);

    // Store auth request in D1
    try {
      await createAuthRequest(db, {
        id: generateUUID(),
        state: state,
        nonce: nonce || '',
        pkceVerifier,
        provider: 'sso',
        clientId,
        redirectUri,
        scopes: scope,
        expiresAt: new Date(expiresAt),
      });
      console.log(`[SSO Authorize] Auth request stored for client: ${clientId}`);
    } catch (error) {
      console.error('[SSO Authorize] Failed to store auth request:', error);
      return NextResponse.json(
        { 
          error: 'server_error',
          error_description: 'Failed to process authorization request'
        },
        { status: 500 }
      );
    }

    // Store in secure cookie temporarily for frontend to use
    const response = NextResponse.json({
      message: 'Authorization request received',
      clientId,
      redirectUri,
      scopes: scope.split(' '),
      state,
    });

    response.cookies.set('oauth_sso_state', JSON.stringify({
      clientId,
      redirectUri,
      scope,
      state,
      nonce,
    }), {
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
