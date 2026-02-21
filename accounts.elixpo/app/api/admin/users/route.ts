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
    const users = [
      {
        id: 'user_1',
        email: 'john@example.com',
        isAdmin: false,
        isActive: true,
        createdAt: '2025-11-01T10:00:00Z',
        lastLogin: '2025-12-16T15:30:00Z',
        emailVerified: true,
        appsCount: 2,
      },
      {
        id: 'user_2',
        email: 'admin@elixpo.com',
        isAdmin: true,
        isActive: true,
        createdAt: '2025-10-01T08:00:00Z',
        lastLogin: '2025-12-16T16:00:00Z',
        emailVerified: true,
        appsCount: 0,
      },
      {
        id: 'user_3',
        email: 'jane@example.com',
        isAdmin: false,
        isActive: false,
        createdAt: '2025-12-05T14:00:00Z',
        lastLogin: '2025-12-10T09:15:00Z',
        emailVerified: false,
        appsCount: 1,
      },
    ];

    const filtered = users.filter(
      (user) =>
        user.email.toLowerCase().includes(search.toLowerCase())
    );

    const total = filtered.length;
    const paginatedUsers = filtered.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      users: paginatedUsers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Users list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const session = await verifyAdminSession(request);

  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { userId, action, data } = body;

    if (!userId || !action) {
      return NextResponse.json(
        { error: 'Missing userId or action' },
        { status: 400 }
      );
    }

    // Handle different admin actions
    switch (action) {
      case 'toggle_admin':
        // Toggle admin status
        return NextResponse.json({
          success: true,
          message: 'Admin status updated',
          userId,
        });

      case 'suspend':
        // Suspend user account
        return NextResponse.json({
          success: true,
          message: 'User suspended',
          userId,
        });

      case 'activate':
        // Activate user account
        return NextResponse.json({
          success: true,
          message: 'User activated',
          userId,
        });

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('User action error:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}
