/**
 * API Key Authentication Middleware
 * Validates API keys and enforces rate limiting
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, logApiKeyUsage, hasScope, ApiKeyScopes } from './api-key-service';

export interface ApiAuthContext {
  apiKeyId: string;
  userId: string;
  scopes: ApiKeyScopes;
  rateLimitRequests: number;
  rateLimitWindow: number;
}

/**
 * Extract API key from request headers
 * Supports: Authorization: Bearer <key>
 */
function extractApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Middleware to validate API key
 */
export async function validateApiKeyMiddleware(
  request: NextRequest,
  requiredScopes?: (keyof ApiKeyScopes)[]
): Promise<{ context: ApiAuthContext | null; error: NextResponse | null }> {
  const apiKey = extractApiKey(request);

  if (!apiKey) {
    return {
      context: null,
      error: NextResponse.json(
        { error: 'Missing or invalid API key' },
        { status: 401 }
      ),
    };
  }

  const validated = await validateApiKey(apiKey);
  if (!validated) {
    return {
      context: null,
      error: NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      ),
    };
  }

  // Check required scopes
  if (requiredScopes && requiredScopes.length > 0) {
    const hasAllScopes = requiredScopes.every((scope) => validated.scopes[scope]);
    if (!hasAllScopes) {
      return {
        context: null,
        error: NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        ),
      };
    }
  }

  return {
    context: {
      apiKeyId: validated.id,
      userId: validated.userId,
      scopes: validated.scopes,
      rateLimitRequests: validated.rateLimitRequests,
      rateLimitWindow: validated.rateLimitWindow,
    },
    error: null,
  };
}

/**
 * Check rate limiting for API key
 * 
 * For production, implement actual rate limiting using:
 * - Database: Store request counts per API key
 * - Redis/Memcached: In-memory rate limiting for better performance
 */
export async function checkApiKeyRateLimit(
  context: ApiAuthContext
): Promise<{ allowed: boolean; retryAfter?: number }> {
  // TODO: Implement actual rate limiting based on:
  // - context.rateLimitRequests (max requests allowed)
  // - context.rateLimitWindow (time window in seconds)
  // - context.apiKeyId (to track per-key usage)
  
  // For now, all requests are allowed
  return { allowed: true };
}

/**
 * Log API request
 */
export async function logApiRequest(
  context: ApiAuthContext,
  request: NextRequest,
  statusCode: number,
  responseTime: number
): Promise<void> {
  const endpoint = new URL(request.url).pathname;
  const method = request.method;
  const ipAddress = request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown';
  const userAgent = request.headers.get('user-agent') || undefined;

  await logApiKeyUsage(
    context.apiKeyId,
    endpoint,
    method,
    statusCode,
    responseTime,
    ipAddress,
    userAgent
  );
}

/**
 * Wrap an API route handler with API key authentication
 */
export function withApiAuth(
  handler: (request: NextRequest, context: ApiAuthContext) => Promise<NextResponse>,
  requiredScopes?: (keyof ApiKeyScopes)[]
) {
  return async (request: NextRequest) => {
    const startTime = Date.now();

    const { context, error } = await validateApiKeyMiddleware(request, requiredScopes);
    if (error) {
      return error;
    }

    if (!context) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    // Check rate limiting
    const rateLimitCheck = await checkApiKeyRateLimit(context);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { 
          status: 429,
          headers: rateLimitCheck.retryAfter 
            ? { 'Retry-After': rateLimitCheck.retryAfter.toString() }
            : {},
        }
      );
    }

    try {
      const response = await handler(request, context);
      const responseTime = Date.now() - startTime;
      
      // Log request
      await logApiRequest(context, request, response.status, responseTime);
      
      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await logApiRequest(context, request, 500, responseTime);
      
      console.error('API handler error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}
