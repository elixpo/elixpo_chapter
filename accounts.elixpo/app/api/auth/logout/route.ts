import { NextRequest, NextResponse } from 'next/server';
import { NextResponse as ServerResponse } from 'next/server';

/**
 * POST /api/auth/logout
 * Invalidate refresh token and clear cookies
 */
export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get('refresh_token')?.value;

    if (refreshToken) {
      // In production with D1:
      // const tokenHash = hashString(refreshToken);
      // await revokeRefreshToken(env.DB, tokenHash);
    }

    // Clear all auth cookies
    const response = NextResponse.json(
      { message: 'Successfully logged out' },
      { status: 200 }
    );

    response.cookies.set('access_token', '', { maxAge: 0 });
    response.cookies.set('refresh_token', '', { maxAge: 0 });
    response.cookies.set('user_id', '', { maxAge: 0 });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }
}
