import { NextRequest, NextResponse } from 'next/server';
import { generateUUID, hashString } from '@/lib/crypto';
import { createAccessToken, createRefreshToken } from '@/lib/jwt';
import { hashPassword } from '@/lib/password';
import { verifyTurnstile } from '@/lib/captcha';

/**
 * POST /api/auth/register
 *
 * Register a new user with email/password
 * Or accept OAuth provider registration
 *
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "securepassword", // optional for OAuth
 *   "provider": "google|github|email",
 *   "turnstile_token": "captcha-token",
 *   "provider_id": "oauth_provider_user_id" // for OAuth
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, provider, turnstile_token, provider_id, provider_email } = body;

    // Validate required fields
    if (!email || !provider) {
      return NextResponse.json(
        { error: 'email and provider are required' },
        { status: 400 }
      );
    }

    // For email/password, require password
    if (provider === 'email' && !password) {
      return NextResponse.json(
        { error: 'password is required for email provider' },
        { status: 400 }
      );
    }

    // Validate captcha
    if (!turnstile_token) {
      return NextResponse.json(
        { error: 'Captcha verification required' },
        { status: 400 }
      );
    }

    const captchaValid = await verifyTurnstile(turnstile_token);
    if (!captchaValid) {
      return NextResponse.json(
        { error: 'Captcha verification failed' },
        { status: 400 }
      );
    }

    // In production, integrate with D1 database
    // const db = env.DB;

    // Check if user already exists
    // const existingUser = await getUserByEmail(db, email);
    // if (existingUser) {
    //   return NextResponse.json(
    //     { error: 'User already exists' },
    //     { status: 409 }
    //   );
    // }

    // Create new user
    const userId = generateUUID();

    // For email/password provider
    if (provider === 'email') {
      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user in D1
      // await createUser(db, {
      //   id: userId,
      //   email,
      //   password_hash: passwordHash,
      // });

      // Create identity
      // await createIdentity(db, {
      //   id: generateUUID(),
      //   userId,
      //   provider: 'email',
      //   providerUserId: email, // Use email as unique identifier
      //   providerEmail: email,
      // });

      // Log audit event
      // await logAuditEvent(db, {
      //   id: generateUUID(),
      //   userId,
      //   eventType: 'registration',
      //   provider: 'email',
      //   status: 'success',
      // });
    }
    // For OAuth providers
    else if (provider === 'google' || provider === 'github') {
      if (!provider_id) {
        return NextResponse.json(
          { error: `${provider}_id is required for ${provider} provider` },
          { status: 400 }
        );
      }

      // Create user in D1
      // await createUser(db, {
      //   id: userId,
      //   email: email || `${provider}_${provider_id}@elixpo.local`,
      // });

      // Create identity
      // await createIdentity(db, {
      //   id: generateUUID(),
      //   userId,
      //   provider,
      //   providerUserId: provider_id,
      //   providerEmail: provider_email || email,
      // });

      // Log audit event
      // await logAuditEvent(db, {
      //   id: generateUUID(),
      //   userId,
      //   eventType: 'registration',
      //   provider,
      //   status: 'success',
      // });
    } else {
      return NextResponse.json(
        { error: `unsupported provider: ${provider}` },
        { status: 400 }
      );
    }

    // Create tokens
    const accessToken = await createAccessToken(userId, email, provider as any);
    const refreshToken = await createRefreshToken(userId, provider as any);

    // Hash refresh token for D1 storage
    // const refreshTokenHash = hashString(refreshToken);
    // await createRefreshToken(db, {
    //   id: generateUUID(),
    //   userId,
    //   tokenHash: refreshTokenHash,
    //   expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    // });

    // Return response with tokens
    const response = NextResponse.json({
      user: {
        id: userId,
        email,
        provider,
      },
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
      },
    });

    // Set secure cookies
    response.cookies.set('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
      path: '/',
    });

    response.cookies.set('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    response.cookies.set('user_id', userId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[Registration] Error:', error);
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}
