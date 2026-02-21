/**
 * RBAC Middleware for protecting API routes
 * Provides route protection with role and permission checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from './jwt';
import {
  hasPermission,
  hasResourceAccess,
  hasAnyPermission,
  hasAllPermissions,
  isSuperAdmin,
  isAdmin,
} from './permissions';

export interface RbacContext {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
}

/**
 * Extract and verify JWT token from request
 */
export async function getAuthContext(request: NextRequest): Promise<RbacContext | null> {
  const token = request.headers.get('authorization')?.split(' ')[1];
  if (!token) {
    return null;
  }

  const decoded = await verifyJWT(token);
  if (!decoded || !decoded.sub) {
    return null;
  }

  const isSA = await isSuperAdmin(decoded.sub);
  const isA = await isAdmin(decoded.sub);

  return {
    userId: decoded.sub,
    email: decoded.email || '',
    isSuperAdmin: isSA,
    isAdmin: isA,
  };
}

/**
 * Middleware factory for permission-based route protection
 * Supports multiple checks: permission name, resource+action, or custom function
 */
export function withRbac(
  handler: (
    request: NextRequest,
    context: RbacContext
  ) => Promise<NextResponse>,
  options?: {
    permission?: string;
    resource?: string;
    action?: string;
    permissions?: string[];
    requireAll?: boolean;
    custom?: (context: RbacContext) => Promise<boolean>;
  }
) {
  return async (request: NextRequest) => {
    const context = await getAuthContext(request);

    // Check authentication
    if (!context) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Skip permission checks for super admin
    if (!context.isSuperAdmin) {
      // Check specific permission by name
      if (options?.permission) {
        const hasPerms = await hasPermission(context.userId, options.permission);
        if (!hasPerms) {
          return NextResponse.json(
            { error: 'Forbidden: Insufficient permissions' },
            { status: 403 }
          );
        }
      }

      // Check resource+action permission
      if (options?.resource && options?.action) {
        const hasAccess = await hasResourceAccess(
          context.userId,
          options.resource,
          options.action
        );
        if (!hasAccess) {
          return NextResponse.json(
            { error: 'Forbidden: Insufficient permissions' },
            { status: 403 }
          );
        }
      }

      // Check multiple permissions (any or all)
      if (options?.permissions && options.permissions.length > 0) {
        const hasPerms = options.requireAll
          ? await hasAllPermissions(context.userId, options.permissions)
          : await hasAnyPermission(context.userId, options.permissions);

        if (!hasPerms) {
          return NextResponse.json(
            { error: 'Forbidden: Insufficient permissions' },
            { status: 403 }
          );
        }
      }

      // Custom permission check
      if (options?.custom) {
        const hasAccess = await options.custom(context);
        if (!hasAccess) {
          return NextResponse.json(
            { error: 'Forbidden' },
            { status: 403 }
          );
        }
      }
    }

    try {
      return await handler(request, context);
    } catch (error) {
      console.error('RBAC middleware error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Shorthand for admin-only routes
 */
export function withAdminOnly(
  handler: (request: NextRequest, context: RbacContext) => Promise<NextResponse>
) {
  return withRbac(handler, {
    custom: async (context) => context.isAdmin,
  });
}

/**
 * Shorthand for super admin only routes
 */
export function withSuperAdminOnly(
  handler: (request: NextRequest, context: RbacContext) => Promise<NextResponse>
) {
  return withRbac(handler, {
    custom: async (context) => context.isSuperAdmin,
  });
}

/**
 * Shorthand for authenticated routes
 */
export function withAuth(
  handler: (request: NextRequest, context: RbacContext) => Promise<NextResponse>
) {
  return withRbac(handler);
}
