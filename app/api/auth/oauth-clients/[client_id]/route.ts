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
 */
export async function GET(
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

    // In production, get from D1:
    // const app = await getOAuthClientById(db, client_id);
    // if (!app) {
    //   return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    // }

    return NextResponse.json({
      error: 'Not yet integrated with D1',
    }, { status: 501 });
  } catch (error) {
    console.error('[OAuth Client] Get error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch application' },
      { status: 500 }
    );
  }
}
