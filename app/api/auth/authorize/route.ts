import { NextRequest, NextResponse } from 'next/server';
import { generateRandomString, generatePKCE, generateNonce, generateUUID } from '@/lib/crypto';
import { getOAuthConfig } from '@/lib/oauth-config';

// Trusted domains for client authorization
const TRUSTED_DOMAINS = ['elixpo.com', 'www.elixpo.com'];

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const provider = searchParams.get('provider')?.toLowerCase();
    const redirectUri = searchParams.get('redirect_uri') || `${process.env.NEXT_PUBLIC_APP_URL}/`;

    if (!provider) {
      return NextResponse.json(
        { error: 'provider is required' },
        { status: 400 }
      );
    }

    const config = getOAuthConfig(provider, {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    });

    if (!config || !config.clientId) {
      return NextResponse.json(
        { error: `provider ${provider} not configured` },
        { status: 400 }
      );
    }


    const state = generateRandomString(32);
    const nonce = generateNonce();
    const { verifier: pkceVerifier, challenge: pkceChallenge } = generatePKCE();
    const authRequestId = generateUUID();
    
    // For now, store minimal state in cookies (will be validated in callback)
    // In production, store full auth_request in D1 with state as unique key
    const authState = {
      id: authRequestId,
      state,
      nonce,
      pkceVerifier,
      provider,
      redirectUri,
      createdAt: Date.now(),
    };

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state: state,
      nonce: nonce,
    });

    // Add PKCE challenge if provider supports it (Google, GitHub both do)
    if (provider === 'google' || provider === 'github') {
      params.append('code_challenge', pkceChallenge);
      params.append('code_challenge_method', 'S256');
    }

    const authUrl = `${config.authorizationEndpoint}?${params.toString()}`;

    // Return authorization URL and state cookie
    const response = NextResponse.json({
      authUrl,
      state,
      nonce,
      pkceVerifier, // Send to client - will send back in callback
    });

    // Set secure cookie with auth state (basic validation)
    response.cookies.set('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 5 * 60, // 5 minutes
    });

    response.cookies.set('oauth_pkce_verifier', pkceVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 5 * 60,
    });

    return response;
  } catch (error) {
    console.error('OAuth authorize error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate OAuth flow' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { state, clientId, redirectUri, scopes, approved } = body;

    // Validate required fields
    if (!state || !clientId || !redirectUri || approved === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate redirect URI domain is trusted
    try {
      const redirectUrl = new URL(redirectUri);
      const domain = redirectUrl.hostname;

      if (!TRUSTED_DOMAINS.includes(domain)) {
        return NextResponse.json(
          { error: `Unauthorized domain: ${domain}` },
          { status: 403 }
        );
      }
    } catch (err) {
      return NextResponse.json(
        { error: 'Invalid redirect URI' },
        { status: 400 }
      );
    }

    // Check if user denied access
    if (!approved) {
      const errorRedirect = new URL(redirectUri);
      errorRedirect.searchParams.append('error', 'access_denied');
      errorRedirect.searchParams.append('state', state);
      
      return NextResponse.json({
        redirectUrl: errorRedirect.toString(),
      });
    }

    // Generate authorization code (store in auth_requests table)
    const authCode = `auth_${generateRandomString(32)}`;

    // Build redirect URL with authorization code and state
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.append('code', authCode);
    redirectUrl.searchParams.append('state', state);

    // TODO: In production, implement:
    // 1. Get authenticated user ID from session
    // 2. Store auth code in auth_requests table with:
    //    - user_id
    //    - client_id
    //    - code
    //    - redirect_uri
    //    - scopes
    //    - expires_at
    // 3. Validate client_id is registered and redirect_uri matches
    // 4. Validate requested scopes

    return NextResponse.json({
      redirectUrl: redirectUrl.toString(),
    });
  } catch (error) {
    console.error('Client authorization error:', error);
    return NextResponse.json(
      { error: 'Failed to process authorization' },
      { status: 500 }
    );
  }
}
