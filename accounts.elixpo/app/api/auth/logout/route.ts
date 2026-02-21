import { NextRequest, NextResponse } from 'next/server';
import { hashString } from '@/lib/crypto';
import { revokeRefreshToken } from '@/lib/db';
import { getDatabase } from '@/lib/d1-client';

/**
 * POST /api/auth/logout
 * Logout user and revoke all tokens
 * 
 * Features:
 * - Revoke refresh token in database
 * - Clear all authentication cookies
 * - Support logout_redirect_uri for SSO
 * 
 * Request body (optional):
 * {
 *   "refresh_token": "jwt_token", // If not using cookies
 *   "logout_redirect_uri": "https://app.example.com/logged-out"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const refreshToken = body.refresh_token || request.cookies.get('refresh_token')?.value;
    const logoutRedirectUri = body.logout_redirect_uri;

    // Revoke refresh token in database if available
    if (refreshToken) {
      try {
        const db = await getDatabase();
        const tokenHash = hashString(refreshToken);
        await revokeRefreshToken(db, tokenHash);
        console.log('[Logout] Refresh token revoked');
      } catch (error) {
        console.error('[Logout] Error revoking token:', error);
        // Don't fail logout if DB is unavailable - still clear cookies
      }
    }

    // Clear all auth cookies
    const response = NextResponse.json(
      { 
        message: 'Successfully logged out',
        redirect: logoutRedirectUri || undefined
      },
      { status: 200 }
    );

    // Clear all authentication cookies with secure settings
    response.cookies.set('access_token', '', { 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    
    response.cookies.set('refresh_token', '', { 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    
    response.cookies.set('user_id', '', { 
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    // Clear session/state cookies if present
    response.cookies.set('oauth_state', '', { 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    response.cookies.set('oauth_pkce_verifier', '', { 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[Logout] Error:', error);
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }
}
