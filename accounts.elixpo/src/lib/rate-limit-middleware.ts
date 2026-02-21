/**
 * Rate Limit Middleware/Helper
 * Use this in API routes to check rate limits against D1 database
 * 
 * Usage:
 * const rateLimit = await checkRateLimit(db, ipAddress, 'login');
 * if (!rateLimit.allowed) {
 *   return NextResponse.json(
 *     { error: 'Too many attempts' },
 *     { status: 429, headers: { 'Retry-After': rateLimit.retryAfter?.toString() } }
 *   );
 * }
 */

import type { D1Database } from '@cloudflare/workers-types';
import {
  createLoginRateLimiter,
  createRegisterRateLimiter,
  createPasswordResetRateLimiter,
  type RateLimitResult,
} from './rate-limit';

export async function checkLoginRateLimit(
  db: D1Database,
  ipAddress: string
): Promise<RateLimitResult> {
  const limiter = createLoginRateLimiter();
  return limiter.check(db, ipAddress, 'login');
}

export async function checkRegisterRateLimit(
  db: D1Database,
  ipAddress: string
): Promise<RateLimitResult> {
  const limiter = createRegisterRateLimiter();
  return limiter.check(db, ipAddress, 'register');
}

export async function checkPasswordResetRateLimit(
  db: D1Database,
  ipAddress: string
): Promise<RateLimitResult> {
  const limiter = createPasswordResetRateLimiter();
  return limiter.check(db, ipAddress, 'password_reset');
}

/**
 * Example: How to use in an API route
 * 
 * import { checkLoginRateLimit } from '@/lib/rate-limit-middleware';
 * 
 * export async function POST(request: NextRequest, { params }: { params: any }) {
 *   try {
 *     const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
 *     
 *     // Get D1 database from environment (when integrated)
 *     // const db = getD1Database(); // Need to implement this
 *     
 *     // Check rate limit
 *     // const rateLimit = await checkLoginRateLimit(db, ipAddress);
 *     // if (!rateLimit.allowed) {
 *     //   return NextResponse.json(
 *     //     { error: 'Too many login attempts. Please try again later.', retryAfter: rateLimit.retryAfter },
 *     //     { status: 429, headers: { 'Retry-After': (rateLimit.retryAfter || 60).toString() } }
 *     //   );
 *     // }
 *     
 *     // ... rest of the endpoint logic
 *   } catch (error) {
 *     // ...
 *   }
 * }
 */
