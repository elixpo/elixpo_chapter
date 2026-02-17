import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '@/lib/jwt';

/**
 * POST /api/sso/verify
 * 
 * External SSO validation endpoint for other elixpo.com services
 * 
 * This is the core SSO interface that allows other services to:
 * 1. Verify if a user is authenticated
 * 2. Get user claims from access token
 * 3. Validate refresh tokens
 * 
 * Protected by:
 * - Bearer token (access_token or custom JWT)
 * - Client credentials (optional, for service-to-service calls)
 * 
 * Example usage from another service:
 * ```
 * const response = await fetch('https://auth.elixpo.com/api/sso/verify', {
 *   method: 'POST',
 *   headers: {
 *     'Authorization': 'Bearer ' + accessToken,
 *     'X-Client-Id': 'service-name'
 *   }
 * });
 * ```
 */
export async function POST(request: NextRequest) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    const clientId = request.headers.get('x-client-id') || 'unknown';

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'No authorization token provided', code: 'MISSING_TOKEN' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // Verify JWT
    const payload = await verifyJWT(token);

    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired token', code: 'INVALID_TOKEN' },
        { status: 401 }
      );
    }

    // Log verification attempt (in production, use D1)
    console.log(`SSO verification for user ${payload.sub} from client ${clientId}`);

    // Return user claims
    return NextResponse.json({
      authenticated: true,
      user: {
        id: payload.sub,
        email: payload.email,
        tokenType: payload.type,
      },
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      issuedAt: new Date(payload.iat * 1000).toISOString(),
    });
  } catch (error) {
    console.error('SSO verification error:', error);
    return NextResponse.json(
      { error: 'Verification failed', code: 'VERIFICATION_FAILED' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sso/verify
 * 
 * Lightweight verification endpoint
 * Returns 200 if token is valid, 401 if invalid
 * Useful for simple middleware checks
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    const payload = await verifyJWT(token);

    if (!payload) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      userId: payload.sub,
      email: payload.email,
    });
  } catch (error) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401 }
    );
  }
}
