import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'default-secret-key'
);

export interface AdminSession {
  userId: string;
  email: string;
  isAdmin: boolean;
  role: string;
}

export async function verifyAdminSession(
  request: NextRequest
): Promise<AdminSession | null> {
  try {
    // Get token from cookie or Authorization header
    const token =
      request.cookies.get('authToken')?.value ||
      request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return null;
    }

    const verified = await jwtVerify(token, JWT_SECRET);
    const payload = verified.payload as any;

    // Check if user has admin privileges
    if (!payload.isAdmin && payload.role !== 'admin') {
      return null;
    }

    return {
      userId: payload.sub || payload.userId,
      email: payload.email,
      isAdmin: payload.isAdmin,
      role: payload.role,
    };
  } catch (error) {
    console.error('Admin session verification failed:', error);
    return null;
  }
}

export function requireAdmin(handler: Function) {
  return async (request: NextRequest) => {
    const session = await verifyAdminSession(request);

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }

    return handler(request, session);
  };
}
