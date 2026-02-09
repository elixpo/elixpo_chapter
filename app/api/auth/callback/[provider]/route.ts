import { NextRequest, NextResponse } from 'next/server';
import { generateUUID, hashString } from '@/lib/crypto';
import { createUser, createIdentity, createRefreshToken, logAuditEvent, updateUserLastLogin, getIdentityByProvider, getUserById } from '@/lib/db';
import { createAccessToken, createRefreshToken as createRefreshTokenJWT } from '@/lib/jwt';
import { getOAuthConfig } from '@/lib/oauth-config';

/**
 * GET /api/auth/callback/[provider]?code=...&state=...
 * OAuth callback handler
 * 1. Validate state parameter
 * 2. Exchange authorization code for tokens
 * 3. Fetch user info from provider
 * 4. Upsert user and identity in D1
 * 5. Issue JWT and refresh token
 * 6. Set secure cookies
 * 7. Redirect to dashboard or error page
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const { provider } = params;
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Get request metadata for audit logging
  const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  try {
    // Handle OAuth provider errors
    if (error) {
      console.error(`OAuth error from ${provider}:`, error, errorDescription);
      
      return NextResponse.redirect(
        new URL(
          `/error?error=${error}&description=${encodeURIComponent(errorDescription || 'Authentication failed')}`,
          request.url
        )
      );
    }

    // Validate required parameters
    if (!code || !state) {
      return NextResponse.redirect(
        new URL(
          '/error?error=invalid_request&description=Missing code or state parameter',
          request.url
        )
      );
    }

    // Validate state from cookie
    const storedState = request.cookies.get('oauth_state')?.value;
    const pkceVerifier = request.cookies.get('oauth_pkce_verifier')?.value;

    if (!storedState || storedState !== state) {
      console.error('State mismatch:', { storedState, state });
      
      return NextResponse.redirect(
        new URL(
          '/error?error=invalid_state&description=State validation failed',
          request.url
        )
      );
    }

    // Get OAuth config
    const config = getOAuthConfig(provider.toLowerCase(), {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    });

    if (!config) {
      return NextResponse.redirect(
        new URL(
          `/error?error=unsupported_provider&description=Provider ${provider} not supported`,
          request.url
        )
      );
    }

    // Step 1: Exchange authorization code for tokens
    const tokenResponse = await exchangeCodeForTokens(
      code,
      config,
      pkceVerifier
    );

    if (!tokenResponse || !tokenResponse.access_token) {
      console.error('Failed to exchange code for tokens');
      
      return NextResponse.redirect(
        new URL(
          '/error?error=token_exchange_failed&description=Failed to exchange authorization code',
          request.url
        )
      );
    }

    // Step 2: Fetch user info from provider
    const userInfo = await fetchUserInfoFromProvider(
      provider.toLowerCase(),
      tokenResponse.access_token,
      config.userInfoEndpoint
    );

    if (!userInfo || !userInfo.sub) {
      console.error('Failed to fetch user info');
      
      return NextResponse.redirect(
        new URL(
          '/error?error=user_info_failed&description=Failed to retrieve user information',
          request.url
        )
      );
    }

    // Step 3: Upsert user and identity in database
    // For now, using mock D1 (replace with real D1 once configured)
    const userId = generateUUID();
    const email = userInfo.email || `${provider}_${userInfo.sub}@elixpo.local`;

    // In production with D1:
    // const user = await createUser(env.DB, { id: userId, email });
    // const identity = await createIdentity(env.DB, {
    //   id: generateUUID(),
    //   userId,
    //   provider: provider.toLowerCase(),
    //   providerUserId: userInfo.sub,
    //   providerEmail: userInfo.email,
    //   providerProfileUrl: userInfo.picture,
    // });

    // Step 4: Create tokens
    const jwtSecret = process.env.JWT_SECRET || 'dev-secret-key';
    const accessToken = await createAccessToken(
      userId,
      email,
      jwtSecret,
      parseInt(process.env.JWT_EXPIRATION_MINUTES || '15')
    );

    const refreshToken = await createRefreshTokenJWT(
      userId,
      jwtSecret,
      parseInt(process.env.REFRESH_TOKEN_EXPIRATION_DAYS || '30')
    );

    const refreshTokenHash = hashString(refreshToken);

    // In production with D1:
    // await createRefreshToken(env.DB, {
    //   id: generateUUID(),
    //   userId,
    //   tokenHash: refreshTokenHash,
    //   expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    // });

    // Step 5: Log audit event
    // In production with D1:
    // await logAuditEvent(env.DB, {
    //   id: generateUUID(),
    //   userId,
    //   eventType: 'login',
    //   provider: provider.toLowerCase(),
    //   ipAddress,
    //   userAgent,
    //   status: 'success',
    // });

    // Step 6: Create response with secure cookies
    const response = NextResponse.redirect(
      new URL('/dashboard', request.url)
    );

    // Set secure, httpOnly cookies
    response.cookies.set('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: parseInt(process.env.JWT_EXPIRATION_MINUTES || '15') * 60,
      path: '/',
    });

    response.cookies.set('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: parseInt(process.env.REFRESH_TOKEN_EXPIRATION_DAYS || '30') * 24 * 60 * 60,
      path: '/',
    });

    response.cookies.set('user_id', userId, {
      httpOnly: false, // accessible to client-side code if needed
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: parseInt(process.env.JWT_EXPIRATION_MINUTES || '15') * 60,
      path: '/',
    });

    // Clear OAuth state cookies
    response.cookies.set('oauth_state', '', { maxAge: 0 });
    response.cookies.set('oauth_pkce_verifier', '', { maxAge: 0 });

    return response;
  } catch (error) {
    console.error(`OAuth callback error for ${provider}:`, error);
    
    return NextResponse.redirect(
      new URL(
        '/error?error=server_error&description=An unexpected error occurred during authentication',
        request.url
      )
    );
  }
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  code: string,
  config: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    tokenEndpoint: string;
  },
  pkceVerifier?: string
): Promise<{ access_token: string; refresh_token?: string; id_token?: string } | null> {
  try {
    const body: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    };

    // Add PKCE verifier if present
    if (pkceVerifier) {
      body.code_verifier = pkceVerifier;
    }

    const response = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(body).toString(),
    });

    if (!response.ok) {
      console.error('Token endpoint error:', response.status, await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Token exchange error:', error);
    return null;
  }
}

/**
 * Fetch user information from OAuth provider
 */
async function fetchUserInfoFromProvider(
  provider: string,
  accessToken: string,
  endpoint: string
): Promise<{
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
} | null> {
  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.error('User info endpoint error:', response.status);
      return null;
    }

    const data = await response.json();

    // Normalize user info by provider
    switch (provider) {
      case 'google':
        return {
          sub: data.sub,
          email: data.email,
          name: data.name,
          picture: data.picture,
        };

      case 'github':
        return {
          sub: String(data.id),
          email: data.email,
          name: data.name,
          picture: data.avatar_url,
        };

      default:
        return null;
    }
  } catch (error) {
    console.error('Fetch user info error:', error);
    return null;
  }
}
