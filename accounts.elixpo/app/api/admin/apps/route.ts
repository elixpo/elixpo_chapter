import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '../../../../src/lib/admin-middleware';

export async function GET(request: NextRequest) {
  const session = await verifyAdminSession(request);

  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';

    // Mock data - replace with actual DB queries
    const apps = [
      {
        id: 'app_1',
        name: 'Mobile Banking App',
        owner: { id: 'user_1', email: 'owner1@example.com' },
        status: 'active',
        createdAt: '2025-12-01T10:00:00Z',
        requests: 45230,
        users: 120,
        lastUsed: '2025-12-16T15:30:00Z',
        requestCount: 45230,
      },
      {
        id: 'app_2',
        name: 'E-commerce Platform',
        owner: { id: 'user_2', email: 'owner2@example.com' },
        status: 'active',
        createdAt: '2025-11-15T08:20:00Z',
        requests: 32140,
        users: 89,
        lastUsed: '2025-12-16T14:45:00Z',
        requestCount: 32140,
      },
      {
        id: 'app_3',
        name: 'Analytics Dashboard',
        owner: { id: 'user_3', email: 'owner3@example.com' },
        status: 'suspended',
        createdAt: '2025-10-20T14:00:00Z',
        requests: 8920,
        users: 23,
        lastUsed: '2025-12-10T09:15:00Z',
        requestCount: 8920,
      },
    ];

    const filtered = apps.filter(
      (app) =>
        app.name.toLowerCase().includes(search.toLowerCase()) ||
        app.owner.email.toLowerCase().includes(search.toLowerCase())
    );

    const total = filtered.length;
    const paginatedApps = filtered.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      apps: paginatedApps,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Apps list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch applications' },
      { status: 500 }
    );
  }
}
