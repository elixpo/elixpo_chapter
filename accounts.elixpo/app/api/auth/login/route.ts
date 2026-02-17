import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/password';
import { createAccessToken, createRefreshToken } from '@/lib/jwt';
import { verifyTurnstile } from '@/lib/captcha';
import { hashString, generateUUID } from '@/lib/crypto';

/**
 * POST /api/auth/login
 *
 * Login user with email/password or OAuth provider
 *
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "userpassword", // optional for OAuth
 *   "provider": "google|github|email",
 *   "turnstile_token": "captcha-token",
 *   "oauth_code": "authorization_code" // for OAuth
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, provider, turnstile_token, oauth_code } = body;

    // Get request metadata for audit log
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Validate required fields
    if (!email || !provider) {
      return NextResponse.json(
        { error: 'email and provider are required' },
        { status: 400 }
      );
    }

    // Validate captcha (required for all login attempts)
    if (!turnstile_token) {
      return NextResponse.json(
        { error: 'Captcha verification required' },
        { status: 400 }
      );
    }

    const captchaValid = await verifyTurnstile(turnstile_token);
    if (!captchaValid) {
      // Log failed captcha
      console.warn(`[Login] Captcha verification failed for ${email} from ${ipAddress}`);
      
      return NextResponse.json(
        { error: 'Captcha verification failed' },
        { status: 403 }
      );
    }

    // In production, integrate with D1 database
    // const db = env.DB;

    let user: any;
    let identity: any;

    // Handle email/password login
    if (provider === 'email') {
      if (!password) {
        return NextResponse.json(
          { error: 'password is required for email provider' },
          { status: 400 }
        );
      }

      // Fetch user by email and provider from D1
      // const user = await getUserByEmail(db, email);
      // if (!user) {
      //   // Log failed login
      //   await logAuditEvent(db, {
      //     id: generateUUID(),
      //     eventType: 'login',
      //     provider: 'email',
      //     ipAddress,
      //     userAgent,
      //     status: 'failure',
      //     errorMessage: 'User not found',
      //   });

      //   return NextResponse.json(
      //     { error: 'Invalid email or password' },
      //     { status: 401 }
      //   );
      // }

      // const identity = await getIdentityByProvider(db, 'email', email);
      // if (!identity) {
      //   return NextResponse.json(
      //     { error: 'Invalid email or password' },
      //     { status: 401 }
      //   );
      // }

      // Verify password
      // const passwordValid = await verifyPassword(password, user.password_hash);
      // if (!passwordValid) {
      //   await logAuditEvent(db, {
      //     id: generateUUID(),
      //     userId: user.id,
      //     eventType: 'login',
      //     provider: 'email',
      //     ipAddress,
      //     userAgent,
      //     status: 'failure',
      //     errorMessage: 'Invalid password',
      //   });

      //   return NextResponse.json(
      //     { error: 'Invalid email or password' },
      //     { status: 401 }
      //   );
      // }

      // Mock user for demo
      user = {
        id: generateUUID(),
        email,
      };

      identity = {
        provider: 'email',
      };
    }
    // Handle OAuth provider login
    else if (provider === 'google' || provider === 'github') {
      if (!oauth_code) {
        return NextResponse.json(
          { error: `oauth_code is required for ${provider} provider` },
          { status: 400 }
        );
      }

      // TODO: Exchange oauth_code for provider token, fetch user info
      // This would be similar to the callback flow

      // Mock user for demo
      user = {
        id: generateUUID(),
        email,
      };

      identity = {
        provider,
      };
    } else {
      return NextResponse.json(
        { error: `unsupported provider: ${provider}` },
        { status: 400 }
      );
    }

    // Update last login timestamp
    // await updateUserLastLogin(db, user.id);

    // Create tokens
    const accessToken = await createAccessToken(user.id, email, provider as any);
    const refreshToken = await createRefreshToken(user.id, provider as any);

    // Hash and store refresh token in D1
    // const refreshTokenHash = hashString(refreshToken);
    // await createRefreshToken(db, {
    //   id: generateUUID(),
    //   userId: user.id,
    //   tokenHash: refreshTokenHash,
    //   expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    // });

    // Log successful login
    // await logAuditEvent(db, {
    //   id: generateUUID(),
    //   userId: user.id,
    //   eventType: 'login',
    //   provider,
    //   ipAddress,
    //   userAgent,
    //   status: 'success',
    // });

    // Return response with tokens
    const response = NextResponse.json({
      user: {
        id: user.id,
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

    response.cookies.set('user_id', user.id, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[Login] Error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
