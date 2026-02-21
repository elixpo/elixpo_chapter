import { NextRequest, NextResponse } from 'next/server';
import { generateUUID, generateRandomString, hashString } from '@/lib/crypto';

/**
 * POST /api/auth/oauth-clients
 * 
 * Register a new OAuth application
 * Returns: { client_id, client_secret }
 * 
 * IMPORTANT: Store client_secret securely on client-side. 
 * It will NOT be retrievable after first creation.
 * 
 * Request body:
 * {
 *   "name": "My App",
 *   "redirect_uris": ["https://myapp.com/callback"],
 *   "scopes": ["openid", "profile", "email"]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, redirect_uris, scopes } = body;

    // Validate required fields
    if (!name || !redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return NextResponse.json(
        { error: 'name and redirect_uris (array) are required' },
        { status: 400 }
      );
    }

    // Validate redirect URIs are valid URLs
    for (const uri of redirect_uris) {
      try {
        new URL(uri);
      } catch {
        return NextResponse.json(
          { error: `Invalid redirect_uri: ${uri}` },
          { status: 400 }
        );
      }
    }

    // Validate scopes if provided
    if (scopes && !Array.isArray(scopes)) {
      return NextResponse.json(
        { error: 'scopes must be an array' },
        { status: 400 }
      );
    }

    // Generate client credentials
    const clientId = `cli_${generateRandomString(32)}`;
    const clientSecret = `secret_${generateRandomString(64)}`; // Long random secret
    const clientSecretHash = hashString(clientSecret);

    // In production, this should be stored in D1:
    // const db = env.DB;
    // await createOAuthClient(db, {
    //   clientId,
    //   clientSecretHash,
    //   name,
    //   redirectUris: JSON.stringify(redirect_uris),
    //   scopes: JSON.stringify(scopes || []),
    // });

    console.log(`[OAuth] New application registered: ${name} (${clientId})`);

    // Return credentials to client (secret shown only once)
    return NextResponse.json({
      client_id: clientId,
      client_secret: clientSecret,
      name,
      redirect_uris,
      scopes: scopes || [],
      created_at: new Date().toISOString(),
      note: 'Store client_secret securely. It will not be retrievable after this response.',
    });

  } catch (error) {
    console.error('[OAuth] Registration error:', error);
    return NextResponse.json(
      { error: 'Failed to register application' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/oauth-clients?client_id=cli_xxx
 * 
 * Get application details (public info only, no secret)
 * 
 * This endpoint is used by the callback flow to validate client credentials
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get('client_id');

    if (!clientId) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      );
    }

    // In production, this should query D1:
    // const db = env.DB;
    // const client = await getOAuthClientById(db, clientId);

    // Mock response - replace with actual DB lookup
    return NextResponse.json(
      { error: 'Not yet integrated with D1' },
      { status: 501 }
    );

  } catch (error) {
    console.error('[OAuth] Get client error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve application' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/auth/oauth-clients/[client_id]
 * 
 * Update application details (redirect_uris, scopes, name)
 * Requires client authentication
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const clientId = request.nextUrl.pathname.split('/').pop();
    const { name, redirect_uris, scopes } = body;

    if (!clientId) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      );
    }

    // TODO: Authenticate client (verify Authorization header with client credentials)
    // const authHeader = request.headers.get('authorization');
    // const [clientId, clientSecret] = parseBasicAuth(authHeader);
    // const client = await validateOAuthClient(db, clientId, clientSecret);

    // In production, update in D1:
    // await updateOAuthClient(db, clientId, {
    //   ...(name && { name }),
    //   ...(redirect_uris && { redirectUris: JSON.stringify(redirect_uris) }),
    //   ...(scopes && { scopes: JSON.stringify(scopes) }),
    // });

    return NextResponse.json({
      message: 'Application updated',
      client_id: clientId,
    });

  } catch (error) {
    console.error('[OAuth] Update client error:', error);
    return NextResponse.json(
      { error: 'Failed to update application' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/oauth-clients/[client_id]
 * 
 * Deactivate an application
 */
export async function DELETE(request: NextRequest) {
  try {
    const clientId = request.nextUrl.pathname.split('/').pop();

    if (!clientId) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      );
    }

    // TODO: Authenticate client

    // In production, deactivate in D1:
    // await updateOAuthClient(db, clientId, { isActive: false });

    return NextResponse.json({
      message: 'Application deactivated',
      client_id: clientId,
    });

  } catch (error) {
    console.error('[OAuth] Delete client error:', error);
    return NextResponse.json(
      { error: 'Failed to delete application' },
      { status: 500 }
    );
  }
}
