import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '@/lib/jwt';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');
    const clientId = searchParams.get('client_id');

    if (!token) {
      return NextResponse.json(
        { valid: false, error: 'invalid_request', error_description: 'token parameter is required' },
        { status: 400 }
      );
    }

    const payload = await verifyJWT(token);

    if (!payload) {
      return NextResponse.json(
        { valid: false, error: 'invalid_token', error_description: 'Token is invalid or expired' },
        { status: 401 }
      );
    }

    console.log(`[SSO Verify GET] User ${payload.sub}${clientId ? ` verified by ${clientId}` : ''}`);

    return NextResponse.json({
      valid: true,
      user: { sub: payload.sub, email: payload.email, provider: payload.provider }
    });
  } catch (error) {
    console.error('[SSO Verify GET]', error);
    return NextResponse.json({ valid: false, error: 'server_error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const clientId = request.headers.get('x-client-id');
    const body = await request.json().catch(() => ({}));

    let token: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (body.token) {
      token = body.token;
    }

    if (!token) {
      return NextResponse.json(
        { valid: false, error: 'invalid_request', error_description: 'No token provided' },
        { status: 400 }
      );
    }

    const payload = await verifyJWT(token);

    if (!payload) {
      return NextResponse.json(
        { valid: false, error: 'invalid_token', error_description: 'Token invalid or expired' },
        { status: 401 }
      );
    }

    console.log(`[SSO Verify POST] User ${payload.sub}${clientId ? ` verified by ${clientId}` : ''}`);

    return NextResponse.json({
      valid: true,
      user: { sub: payload.sub, email: payload.email, provider: payload.provider },
      authenticated_at: new Date(payload.iat * 1000).toISOString()
    });
  } catch (error) {
    console.error('[SSO Verify POST]', error);
    return NextResponse.json({ valid: false, error: 'server_error' }, { status: 500 });
  }
}
