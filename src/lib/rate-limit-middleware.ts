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
