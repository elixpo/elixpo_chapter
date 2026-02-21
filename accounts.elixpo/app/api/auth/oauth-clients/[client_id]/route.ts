import { NextRequest, NextResponse } from 'next/server';

/**
 * PUT /api/auth/oauth-clients/[client_id]
 * UPDATE /api/auth/oauth-clients/[client_id]
 * 
 * Update OAuth application details
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { client_id: string } }
) {
  try {
    const { client_id } = params;
    const body = await request.json();
    const { name, redirect_uris, scopes } = body;

    if (!client_id) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      );
    }

    // TODO: Authenticate user and verify ownership of application
    // const userId = await getUserFromToken(request);
    // const app = await getOAuthClientById(db, client_id);
    // if (!app || app.created_by !== userId) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    // }

    // In production, update in D1:
    // await updateOAuthClient(db, client_id, {
    //   ...(name && { name }),
    //   ...(redirect_uris && { redirectUris: JSON.stringify(redirect_uris) }),
    //   ...(scopes && { scopes: JSON.stringify(scopes) }),
    // });

    return NextResponse.json({
      message: 'Application updated successfully',
      client_id,
    });
  } catch (error) {
    console.error('[OAuth Client] Update error:', error);
    return NextResponse.json(
      { error: 'Failed to update application' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/oauth-clients/[client_id]
 * 
 * Deactivate an OAuth application
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { client_id: string } }
) {
  try {
    const { client_id } = params;

    if (!client_id) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      );
    }

    // TODO: Authenticate user
    // const userId = await getUserFromToken(request);
    // if (!userId) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    // TODO: Verify user owns this application
    // const app = await getOAuthClientById(db, client_id);
    // if (!app || app.created_by !== userId) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    // }

    // In production, deactivate in D1:
    // await updateOAuthClient(db, client_id, { isActive: false });

    console.log(`[OAuth Client] Deactivated: ${client_id}`);

    return NextResponse.json({
      message: 'Application deactivated successfully',
      client_id,
    });
  } catch (error) {
    console.error('[OAuth Client] Delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete application' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/oauth-clients/[client_id]
 * 
 * Get OAuth application details (public info only)
 * Query params:
 *   - validate_redirect_uri: optional redirect URI to validate against registered URIs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { client_id: string } }
) {
  try {
    const { client_id } = params;
    const validateRedirectUri = request.nextUrl.searchParams.get('validate_redirect_uri');

    if (!client_id) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      );
    }

    // TODO: In production, get from D1:
    // const app = await getOAuthClientById(db, client_id);
    // if (!app) {
    //   return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    // }
    // if (!app.is_active) {
    //   return NextResponse.json({ error: 'Application is inactive' }, { status: 403 });
    // }

    // MOCK DATA - Replace with D1 query in production
    const mockApp = {
      client_id,
      name: 'Test Application',
      redirect_uris: ['https://example.com/callback', 'https://localhost:3000/callback'],
      scopes: ['openid', 'profile', 'email'],
      is_active: true,
      created_at: new Date().toISOString(),
    };

    // Validate redirect URI if provided
    if (validateRedirectUri) {
      const isValidRedirectUri = mockApp.redirect_uris.includes(validateRedirectUri);
      if (!isValidRedirectUri) {
        return NextResponse.json(
          {
            error: 'Invalid redirect URI',
            message: `The provided redirect_uri is not registered for this application`,
            registeredUris: mockApp.redirect_uris,
          },
          { status: 400 }
        );
      }
    }

    // Return public client info (without secret)
    return NextResponse.json({
      client_id: mockApp.client_id,
      name: mockApp.name,
      redirect_uris: mockApp.redirect_uris,
      scopes: mockApp.scopes,
      is_active: mockApp.is_active,
      created_at: mockApp.created_at,
    });
  } catch (error) {
    console.error('[OAuth Client] Get error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch application' },
      { status: 500 }
    );
  }
}
