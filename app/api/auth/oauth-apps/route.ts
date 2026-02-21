import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/auth/oauth-apps
 * 
 * List all OAuth applications for the current user
 * In production, this should filter by the authenticated user
 * For now, returns all applications (admin view)
 */
export async function GET(request: NextRequest) {
  try {
    // TODO: In production, verify user authentication
    // const userId = await getUserFromToken(request);
    // if (!userId) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    // In production, integrate with D1:
    // const db = env.DB;
    // const apps = await listOAuthClients(db);

    // Mock data for development
    const mockApps = [
      {
        client_id: 'cli_3f8e9c7d2a1b4c6f9e8d7c6b5a4f3e2d',
        name: 'My Web App',
        created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        is_active: true,
        redirect_uris: ['https://myapp.com/callback'],
      },
      {
        client_id: 'cli_2e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b',
        name: 'Mobile App',
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        is_active: true,
        redirect_uris: ['myapp://callback'],
      },
    ];

    return NextResponse.json({
      apps: mockApps,
      total: mockApps.length,
    });
  } catch (error) {
    console.error('[OAuth Apps] List error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch applications' },
      { status: 500 }
    );
  }
}
