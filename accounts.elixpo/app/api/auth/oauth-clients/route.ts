import { NextRequest, NextResponse } from 'next/server';
import { generateRandomString, hashString } from '@/lib/crypto';
import { createOAuthClient, getOAuthClientById } from '@/lib/db';
import { getDatabase } from '@/lib/d1-client';

/**
 * POST /api/auth/oauth-clients
 * 
 * Register a new OAuth 2.0 application
 * Third-party services use this endpoint to register for sign in/sign up
 * 
 * Returns: { client_id, client_secret }
 * 
 * IMPORTANT: Store client_secret securely. It will NOT be retrievable after first creation.
 * 
 * Request body:
 * {
 *   "name": "My Service Name",
 *   "redirect_uris": ["https://myservice.com/auth/callback"],
 *   "logo_uri": "https://myservice.com/logo.png", (optional)
 *   "description": "Brief description of your service", (optional)
 *   "scopes": ["openid", "profile", "email"]
 * }
 * 
 * Response:
 * {
 *   "client_id": "cli_xxxxx",
 *   "client_secret": "secret_xxxxx",
 *   "name": "My Service Name",
 *   "redirect_uris": ["https://myservice.com/auth/callback"],
 *   "scopes": ["openid", "profile", "email"],
 *   "created_at": "2026-02-21T10:00:00Z"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, redirect_uris, logo_uri, description, scopes } = body;

    // Validate required fields
    if (!name || !redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return NextResponse.json(
        { error: 'name and redirect_uris (non-empty array) are required' },
        { status: 400 }
      );
    }

    // Validate redirect URIs are valid URLs
    const validUris: string[] = [];
    for (const uri of redirect_uris) {
      try {
        const parsed = new URL(uri);
        // Ensure HTTPS in production
        if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
          return NextResponse.json(
            { error: `Redirect URI must use HTTPS in production: ${uri}` },
            { status: 400 }
          );
        }
        validUris.push(uri);
      } catch {
        return NextResponse.json(
          { error: `Invalid redirect_uri: ${uri}` },
          { status: 400 }
        );
      }
    }

    // Validate scopes if provided
    const validScopes = ['openid', 'profile', 'email', 'phone', 'address'];
    if (scopes && Array.isArray(scopes)) {
      for (const scope of scopes) {
        if (!validScopes.includes(scope)) {
          return NextResponse.json(
            { error: `Invalid scope: ${scope}. Valid scopes: ${validScopes.join(', ')}` },
            { status: 400 }
          );
        }
      }
    }

    // Generate secure credentials
    const clientId = `cli_${generateRandomString(32)}`;
    const clientSecret = `secret_${generateRandomString(64)}`;
    const clientSecretHash = hashString(clientSecret);

    const now = new Date().toISOString();

    // Store in D1
    try {
      const db = await getDatabase();
      await createOAuthClient(db, {
        clientId,
        clientSecretHash,
        name,
        redirectUris: JSON.stringify(validUris),
        scopes: JSON.stringify(scopes || validScopes),
      });
      console.log(`[OAuth Client] Registered: ${name} (${clientId})`);
    } catch (dbError) {
      console.error('[OAuth Client] Database storage error:', dbError);
      return NextResponse.json(
        { error: 'Failed to register application' },
        { status: 500 }
      );
    }

    // Return credentials (client_secret shown only once)
    return NextResponse.json(
      {
        client_id: clientId,
        client_secret: clientSecret,
        name,
        redirect_uris: validUris,
        logo_uri,
        description,
        scopes: scopes || validScopes,
        created_at: now,
        _notice: 'Store client_secret securely. It will NOT be retrievable after this response.',
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('[OAuth Client] Registration error:', error);
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
 * This is used by the authorization server to validate client credentials
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

    // Fetch from D1
    const db = await getDatabase();
    const client = await getOAuthClientById(db, clientId);
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Return public client info (no secret!)
    return NextResponse.json({
      client_id: clientId,
      name: (client as any).name,
      redirect_uris: JSON.parse((client as any).redirect_uris || '[]'),
      scopes: JSON.parse((client as any).scopes || '[]'),
      created_at: (client as any).created_at,
      is_active: (client as any).is_active,
    });

  } catch (error) {
    console.error('[OAuth Client] Get error:', error);
    return NextResponse.json(
      { error: 'Failed to get client details' },
      { status: 500 }
    );
  }
}
