export const runtime = "edge";

import { NextResponse } from "next/server";
import {
    contributionDateKey,
    normalizeTimezone,
} from "../../../../../lib/contributions";

const CACHE_TTL_SECONDS = 3600;

/**
 * GET /api/users/[username]/contributions?timezone=America/New_York
 *
 * Returns aggregate daily post counts for the last 12 months.
 * Only counts first-publish dates of public/unlisted, non-secret posts.
 * Response shape: { days: { "2026-01-15": 2, ... }, total: 47 }
 *
 * No blog IDs, titles, or slugs are exposed — aggregate counts only.
 */

export async function GET(request, { params }) {
    const { username } = await params;
    const { searchParams } = new URL(request.url);

    if (!username) {
        return NextResponse.json(
            { error: "Missing username" },
            { status: 400 },
        );
    }

    try {
        const { getDB } = await import("../../../../../lib/cloudflare");
        const db = getDB();

        const user = await db
            .prepare("SELECT id, timezone FROM users WHERE LOWER(username) = ?")
            .bind(username.toLowerCase())
            .first();

        if (!user) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 },
            );
        }

        // Normalize and canonicalize the timezone before using it in the cache key.
        // Invalid or unsupported values fall back to UTC.
        const requestedTimezone = searchParams.get("timezone");
        const effectiveTz = normalizeTimezone(
            requestedTimezone || user.timezone || "UTC",
        );

        const cacheKey = `v1:contributions:${username.toLowerCase()}:${effectiveTz}`;

        const { kvCache } = await import("../../../../../lib/cache");

        const contributionData = await kvCache(
            cacheKey,
            CACHE_TTL_SECONDS,
            async () => {
                const now = Math.floor(Date.now() / 1000);
                const oneYearAgo = now - 365 * 24 * 60 * 60;

                // Single aggregate query — no per-cell queries. D1/SQLite has no
                // timezone-aware DATE(), so fetch raw epochs and bucket in JS.
                const result = await db
                    .prepare(`
                        SELECT published_at
                        FROM blogs
                        WHERE author_id = ?
                          AND status IN ('published', 'unlisted')
                          AND secret = 0
                          AND published_at >= ?
                          AND published_at IS NOT NULL
                        ORDER BY published_at
                    `)
                    .bind(user.id, oneYearAgo)
                    .all();

                const rows = result?.results || [];

                const days = {};
                let total = 0;

                for (const row of rows) {
                    if (!row.published_at) continue;

                    const dateStr = contributionDateKey(row.published_at, effectiveTz);
                    if (!dateStr) continue;

                    days[dateStr] = (days[dateStr] || 0) + 1;
                    total++;
                }

                return { days, total };
            },
        );

        return NextResponse.json(contributionData);
    } catch (e) {
        console.error("Contributions error:", e?.message || e);

        return NextResponse.json(
            { error: "Service unavailable" },
            { status: 503 },
        );
    }
}