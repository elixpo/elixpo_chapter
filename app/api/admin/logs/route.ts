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
    const limit = parseInt(searchParams.get('limit') || '50');
    const filterType = searchParams.get('type') || 'all'; // all, errors, suspensions

    // Mock data - replace with actual DB queries
    const logs = [
      {
        id: 'log_1',
        adminId: 'admin_1',
        adminEmail: 'admin@elixpo.com',
        action: 'user_suspended',
        resourceType: 'user',
        resourceId: 'user_123',
        changes: 'is_active: true -> false',
        timestamp: '2025-12-16T15:30:00Z',
        status: 'success',
      },
      {
        id: 'log_2',
        adminId: 'admin_1',
        adminEmail: 'admin@elixpo.com',
        action: 'app_deleted',
        resourceType: 'app',
        resourceId: 'app_456',
        changes: 'Removed OAuth client',
        timestamp: '2025-12-16T14:20:00Z',
        status: 'success',
      },
      {
        id: 'log_3',
        adminId: 'admin_1',
        adminEmail: 'admin@elixpo.com',
        action: 'config_updated',
        resourceType: 'system',
        resourceId: 'config',
        changes: 'rate_limit_max: 100 -> 150',
        timestamp: '2025-12-16T12:45:00Z',
        status: 'success',
      },
      {
        id: 'log_4',
        adminId: 'admin_2',
        adminEmail: 'superadmin@elixpo.com',
        action: 'admin_role_granted',
        resourceType: 'user',
        resourceId: 'user_789',
        changes: 'role: user -> admin',
        timestamp: '2025-12-15T10:00:00Z',
        status: 'success',
      },
    ];

    const total = logs.length;
    const paginatedLogs = logs.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      logs: paginatedLogs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Activity logs error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity logs' },
      { status: 500 }
    );
  }
}
