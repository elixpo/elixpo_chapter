/**
 * Database-backed Rate Limiter
 * Stores rate limit attempts in D1 for persistence across instances
 */
import type { D1Database } from '@cloudflare/workers-types';
import { generateUUID } from './crypto';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests in the window
  blockDurationMs?: number; // Duration to block after exceeding limit (optional)
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number; // Seconds until retry is allowed
}

class DatabaseRateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private blockDurationMs: number;

  constructor(config: RateLimitConfig) {
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;
    this.blockDurationMs = config.blockDurationMs || 0;
  }

  async check(
    db: D1Database,
    ipAddress: string,
    endpoint: string
  ): Promise<RateLimitResult> {
    const now = new Date();
    const windowResetAt = new Date(Date.now() + this.windowMs);

    try {
      // Check if IP is currently blocked
      const blockedEntry = await db
        .prepare(
          `SELECT * FROM rate_limits 
           WHERE ip_address = ? AND endpoint = ? AND is_blocked = 1 AND blocked_until > ?`
        )
        .bind(ipAddress, endpoint, now.toISOString())
        .first();

      if (blockedEntry) {
        const resetTime = new Date(String(blockedEntry.blocked_until)).getTime();
        return {
          allowed: false,
          remaining: 0,
          resetAt: resetTime,
          retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
        };
      }

      // Get or create rate limit entry
      let entry = await db
        .prepare(
          `SELECT * FROM rate_limits 
           WHERE ip_address = ? AND endpoint = ?`
        )
        .bind(ipAddress, endpoint)
        .first();

      if (!entry || new Date(String(entry.window_reset_at)).getTime() < Date.now()) {
        // Window expired or new entry - reset
        const entryId = generateUUID();
        await db
          .prepare(
            `INSERT INTO rate_limits (id, ip_address, endpoint, attempt_count, window_reset_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(ip_address, endpoint) DO UPDATE SET 
               attempt_count = 1,
               window_reset_at = ?,
               is_blocked = 0,
               blocked_until = NULL,
               first_attempt_at = CURRENT_TIMESTAMP,
               last_attempt_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP`
          )
          .bind(
            entryId,
            ipAddress,
            endpoint,
            1,
            windowResetAt.toISOString(),
            windowResetAt.toISOString()
          )
          .run();

        return {
          allowed: true,
          remaining: this.maxRequests - 1,
          resetAt: windowResetAt.getTime(),
        };
      }

      const currentCount = (entry.attempt_count as number) || 0;

      if (currentCount >= this.maxRequests) {
        // Exceeded limit - block the IP
        const blockedUntil = new Date(
          Date.now() + (this.blockDurationMs || this.windowMs)
        );
        await db
          .prepare(
            `UPDATE rate_limits 
             SET attempt_count = attempt_count + 1,
                 is_blocked = 1,
                 blocked_until = ?,
                 last_attempt_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE ip_address = ? AND endpoint = ?`
          )
          .bind(blockedUntil.toISOString(), ipAddress, endpoint)
          .run();

        return {
          allowed: false,
          remaining: 0,
          resetAt: blockedUntil.getTime(),
          retryAfter: Math.ceil((blockedUntil.getTime() - Date.now()) / 1000),
        };
      }

      // Increment attempt count
      await db
        .prepare(
          `UPDATE rate_limits 
           SET attempt_count = attempt_count + 1,
               last_attempt_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE ip_address = ? AND endpoint = ?`
        )
        .bind(ipAddress, endpoint)
        .run();

      const resetTime = new Date(String(entry.window_reset_at)).getTime();
      return {
        allowed: true,
        remaining: Math.max(0, this.maxRequests - currentCount - 1),
        resetAt: resetTime,
      };
    } catch (error) {
      console.error('Rate limit check error:', error);
      // Fail open - allow request if DB check fails
      return {
        allowed: true,
        remaining: this.maxRequests,
        resetAt: windowResetAt.getTime(),
      };
    }
  }

  async cleanup(db: D1Database): Promise<void> {
    try {
      const now = new Date();
      await db
        .prepare(
          `DELETE FROM rate_limits 
           WHERE window_reset_at < ? AND blocked_until < ?`
        )
        .bind(now.toISOString(), now.toISOString())
        .run();
    } catch (error) {
      console.error('Rate limit cleanup error:', error);
    }
  }
}

// Export factory functions for different endpoints
export function createLoginRateLimiter(): DatabaseRateLimiter {
  return new DatabaseRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 attempts per minute
    blockDurationMs: 15 * 60 * 1000, // 15 minute block
  });
}

export function createRegisterRateLimiter(): DatabaseRateLimiter {
  return new DatabaseRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5, // 5 attempts per minute
    blockDurationMs: 30 * 60 * 1000, // 30 minute block
  });
}

export function createPasswordResetRateLimiter(): DatabaseRateLimiter {
  return new DatabaseRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3, // 3 attempts per hour
    blockDurationMs: 60 * 60 * 1000, // 1 hour block
  });
}

export { DatabaseRateLimiter };
