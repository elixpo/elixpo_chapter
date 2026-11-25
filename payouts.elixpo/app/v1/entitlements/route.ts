export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { appFromApiKey } from "@/lib/api-auth";
import { getDatabase } from "@/lib/d1-client";
import { getEntitlement, toView } from "@/lib/entitlements";

/**
 * GET /v1/entitlements?app=<slug>&uid=<external uid>
 *
 * Server-to-server entitlement lookup for the consuming app. Auth:
 *   Authorization: Bearer <app secret key>   (or  X-Elixpo-Pay-Key: <key>)
 * The key must belong to `app` (current key, or the previous one during a
 * rotation grace window).
 *
 * Returns the EntitlementView (tier, status, active, expires_at, version).
 */
export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;
        const appSlug = sp.get("app");
        const uid = sp.get("uid");

        if (!appSlug || !uid) {
            return NextResponse.json(
                {
                    error: "invalid_request",
                    error_description: "app and uid are required",
                },
                { status: 400 },
            );
        }

        const db = await getDatabase();
        // Same key check as every other /v1 route (incl. rotation grace), and
        // auth BEFORE any slug lookup so callers can't enumerate apps.
        const app = await appFromApiKey(db, request);
        if (!app) {
            return NextResponse.json(
                {
                    error: "unauthorized",
                    error_description: "Invalid or missing secret key",
                },
                { status: 401 },
            );
        }
        if (app.slug !== appSlug) {
            return NextResponse.json(
                {
                    error: "forbidden",
                    error_description: "This key does not belong to that app",
                },
                { status: 403 },
            );
        }

        const row = await getEntitlement(db, app.id, uid);
        const view = toView(appSlug, row, uid);

        return NextResponse.json(view, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (err: any) {
        console.error("[v1/entitlements] error:", err);
        return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
}
