import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/password';
import { createAccessToken, createRefreshToken, verifyJWT } from '@/lib/jwt';
import { hashString, generateUUID } from '@/lib/crypto';
import { createLoginRateLimiter } from '@/lib/rate-limit';
import { getUserByEmail, getIdentitiesByUserId, createRefreshToken as storeRefreshToken, logAuditEvent } from '@/lib/db';

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
 *   "oauth_code": "authorization_code" // for OAuth
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, provider, oauth_code } = body;

    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
                     request.headers.get('cf-connecting-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Rate limiting: 10 login attempts per IP per minute
    // Uncomment when D1 is integrated
    // const db = env.DB;
    // const rateLimiter = createLoginRateLimiter();
    // const rateLimit = await rateLimiter.check(db, ipAddress, 'login');
    // if (!rateLimit.allowed) {
    //   console.warn(`[Login] Rate limit exceeded for IP: ${ipAddress}. Retry after ${rateLimit.retryAfter}s`);
    //   return NextResponse.json(
    //     { 
    //       error: 'Too many login attempts. Please try again later.',
    //       retryAfter: rateLimit.retryAfter,
    //     },
    //     { 
    //       status: 429,
    //       headers: {
    //         'Retry-After': (rateLimit.retryAfter || 900).toString(),
    //       },
    //     }
    //   );
    // }

    if (!email || !provider) {
      return NextResponse.json(
        { error: 'email and provider are required' },
        { status: 400 }
      );
    }

    let user: any;
    let identity: any;

    // NOTE: When D1 database is integrated, uncomment this section to enable provider lock-in
    // const db = env.DB;
    // const existingUser = await getUserByEmail(db, email);
    // if (existingUser) {
    //   // User exists - check what providers they used to register
    //   const userIdentities = await getIdentitiesByUserId(db, existingUser.id);
    //   const registeredProviders = userIdentities.map((id: any) => id.provider);
    //
    //   if (!registeredProviders.includes(provider)) {
    //     // User didn't register with this provider
    //     const providerList = registeredProviders.join(', ');
    //     return NextResponse.json(
    //       { 
    //         error: `This account was registered with ${providerList}. Please login with ${registeredProviders.length === 1 ? 'that' : 'one of those'} provider.`,
    //         registeredProviders
    //       },
    //       { status: 403 }
    //     );
    //   }
    // }

    if (provider === 'email') {
      if (!password) {
        return NextResponse.json(
          { error: 'password is required for email provider' },
          { status: 400 }
        );
      }

      user = {
        id: generateUUID(),
        email,
      };

      identity = {
        provider: 'email',
      };
    } else if (provider === 'google' || provider === 'github') {
      if (!oauth_code) {
        return NextResponse.json(
          { error: `oauth_code is required for ${provider} provider` },
          { status: 400 }
        );
      }

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

    const accessToken = await createAccessToken(user.id, email, provider as any);
    const refreshToken = await createRefreshToken(user.id, provider as any);

    const response = NextResponse.json({
      user: {
        id: user.id,
        email,
        provider,
      },
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: parseInt(process.env.JWT_EXPIRATION_MINUTES || '15') * 60,
        token_type: 'Bearer',
      },
    });

    // Set secure cookies
    const maxAge = parseInt(process.env.JWT_EXPIRATION_MINUTES || '15') * 60;
    response.cookies.set('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge,
      path: '/',
    });

    response.cookies.set('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: parseInt(process.env.REFRESH_TOKEN_EXPIRATION_DAYS || '30') * 24 * 60 * 60,
      path: '/',
    });

    response.cookies.set('user_id', user.id, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge,
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


