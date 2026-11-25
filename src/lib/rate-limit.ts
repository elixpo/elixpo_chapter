/**
 * Exact fixed-window rate limiter backed by D1.
 *
 * Each (bucket, id) pair gets one row per window. The count is incremented with
 * a single atomic upsert (`INSERT … ON CONFLICT DO UPDATE … RETURNING`), and D1
 * serialises writes on its primary, so the limit is exact even under bursts.
 * Expired rows are swept by the hourly cron (pruneRateLimits).
 *
 * Fails OPEN: if the database errors (e.g. the migration hasn't been applied),
 * the request is allowed and the error is logged.
 */

import { getDatabase } from "./d1-client";

export interface RateLimitResult {
    allowed: boolean;
    count: number;
    limit: number;
}

export async function rateLimit(
    bucket: string,
    id: string,
    limit: number,
    windowSeconds: number,
): Promise<RateLimitResult> {
    try {
        const db = await getDatabase();
        const now = Math.floor(Date.now() / 1000);
        const window = Math.floor(now / windowSeconds);
        const key = `${bucket}:${id}:${window}`;
        const expiresAt = (window + 1) * windowSeconds;
        const row = (await db
            .prepare(
                `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
                 ON CONFLICT(key) DO UPDATE SET count = count + 1
                 RETURNING count`,
            )
            .bind(key, expiresAt)
            .first()) as { count: number } | null;
        const count = Number(row?.count ?? 1);
        return { allowed: count <= limit, count, limit };
    } catch (err) {
        console.error("[rate-limit] %s check failed, allowing:", bucket, err);
        return { allowed: true, count: 0, limit };
    }
}

/** Delete expired windows. Called from the hourly cron. */
export async function pruneRateLimits(): Promise<number> {
    try {
        const db = await getDatabase();
        const res = await db
            .prepare("DELETE FROM rate_limits WHERE expires_at < ?")
            .bind(Math.floor(Date.now() / 1000))
            .run();
        return Number(res.meta?.changes ?? 0);
    } catch {
        return 0;
    }
}

/** Best-effort client IP: Cloudflare's header first, then x-forwarded-for. */
export function clientIp(request: Request): string | null {
    const cf = request.headers.get("cf-connecting-ip")?.trim();
    if (cf) return cf;
    const xff = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return xff || null;
}
