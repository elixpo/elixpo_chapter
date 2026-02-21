import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT, createAccessToken, createRefreshToken } from '@/lib/jwt';
import { hashString, generateUUID } from '@/lib/crypto';
import { getRefreshTokenByHash, revokeRefreshToken, createRefreshToken as storeRefreshToken } from '@/lib/db';
import { getDatabase } from '@/lib/d1-client';

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

    // Check if refresh token is in database and not revoked
    try {
      const db = await getDatabase();
      const tokenHash = hashString(refreshToken);
      const storedToken = await getRefreshTokenByHash(db, tokenHash);
      if (!storedToken) {
        return NextResponse.json(
          { error: 'Refresh token revoked or expired' },
          { status: 401 }
        );
      }
    } catch (error) {
      console.error('[Refresh] Database check error:', error);
      // Fail open if DB is unavailable, but still verify JWT
    }

    // Issue new access token
    const newAccessToken = await createAccessToken(
      payload.sub,
      payload.email,
      payload.provider
    );

    // Rotate refresh token
    const newRefreshToken = await createRefreshToken(payload.sub, payload.provider);

    // Store new refresh token and revoke old one
    try {
      const db = await getDatabase();
      const oldTokenHash = hashString(refreshToken);
      const newTokenHash = hashString(newRefreshToken);

      await revokeRefreshToken(db, oldTokenHash);
      await storeRefreshToken(db, {
        id: generateUUID(),
        userId: payload.sub,
        tokenHash: newTokenHash,
        expiresAt: new Date(Date.now() + parseInt(process.env.REFRESH_TOKEN_EXPIRATION_DAYS || '30') * 24 * 60 * 60 * 1000),
      });
    } catch (error) {
      console.error('[Refresh] Token rotation error:', error);
      // Continue anyway - tokens are still valid
    }

    const response = NextResponse.json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      token_type: 'Bearer',
      expires_in: parseInt(process.env.JWT_EXPIRATION_MINUTES || '15') * 60,
    });

    // Update both access and refresh token cookies
    response.cookies.set('access_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: parseInt(process.env.JWT_EXPIRATION_MINUTES || '15') * 60,
      path: '/',
    });

    response.cookies.set('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: parseInt(process.env.REFRESH_TOKEN_EXPIRATION_DAYS || '30') * 24 * 60 * 60,
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
