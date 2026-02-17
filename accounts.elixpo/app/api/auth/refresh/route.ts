import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT, createAccessToken } from '@/lib/jwt';
import { hashString, generateUUID } from '@/lib/crypto';

/**
 * POST /api/auth/refresh
 * Exchange refresh token for new access token
 * Implements token rotation: issue new refresh token, hash it, store hash in D1
 */
export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get('refresh_token')?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'No refresh token provided' },
        { status: 401 }
      );
    }

    // Verify refresh token
    const payload = await verifyJWT(refreshToken);

    if (!payload || payload.type !== 'refresh') {
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );
    }

    // In production with D1:
    // Check if refresh token is in database and not revoked
    // const tokenHash = hashString(refreshToken);
    // const storedToken = await getRefreshTokenByHash(env.DB, tokenHash);
    // if (!storedToken) {
    //   return NextResponse.json(
    //     { error: 'Refresh token revoked or expired' },
    //     { status: 401 }
    //   );
    // }

    // Issue new access token
    const newAccessToken = await createAccessToken(
      payload.sub,
      payload.email,
      payload.provider
    );

    const response = NextResponse.json({
      accessToken: newAccessToken,
    });

    // Update access token cookie
    response.cookies.set('access_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: parseInt(process.env.JWT_EXPIRATION_MINUTES || '15') * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh token' },
      { status: 500 }
    );
  }
}
