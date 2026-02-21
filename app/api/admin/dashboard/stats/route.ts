import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '../../../../../src/lib/admin-middleware';

export async function GET(request: NextRequest) {
  const session = await verifyAdminSession(request);

  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Get stats from query params
    const searchParams = request.nextUrl.searchParams;
    const timeRange = searchParams.get('range') || '7d'; // 7d, 30d, 90d

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    if (timeRange === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (timeRange === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    }

    // Mock data - replace with actual DB queries
    const stats = {
      totalUsers: 1245,
      activeUsers: 342,
      totalApps: 89,
      totalRequests: 145230,
      avgResponseTime: 245,
      errorRate: 0.23,
      lastUpdated: new Date().toISOString(),
      topApps: [
        {
          id: 'app1',
          name: 'Example App 1',
          requests: 45230,
          users: 120,
          errorRate: 0.15,
        },
        {
          id: 'app2',
          name: 'Example App 2',
          requests: 32140,
          users: 89,
          errorRate: 0.22,
        },
      ],
      requestTrend: Array.from({ length: 7 }, (_, i) => ({
        date: new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        requests: Math.floor(Math.random() * 30000) + 10000,
        errors: Math.floor(Math.random() * 1000),
      })),
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
