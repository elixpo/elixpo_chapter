/**
 * POST /api/admin/refresh — bypass the KV cache and re-run account discovery
 * and the service catalog, so new Pages projects / Workers / DNS records show
 * up immediately. Admin-gated and audited. Only rewrites admin-cache entries;
 * it never mutates anything in the Cloudflare account.
 */

export const runtime = "edge";

import { recordAction } from "@/lib/audit";
import { discoverAccount } from "@/lib/discovery";
import { listServices } from "@/lib/services";
import { requireAdmin } from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    const session = await requireAdmin(request);
    if (!session)
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    try {
        const started = Date.now();
        // listServices(true) force-runs discovery itself, which re-caches the
        // inventory; the follow-up read is then a cache hit.
        const services = await listServices(true);
        const inv = await discoverAccount();
        const failing = Object.entries(inv.errors)
            .filter(([, e]) => e)
            .map(([k]) => k);
        await recordAction(session, "admin.refresh", "discovery", {
            services: services.length,
            failing,
        }).catch(() => {});
        return NextResponse.json({
            ok: true,
            fetchedAt: inv.fetchedAt,
            services: services.length,
            failing,
            ms: Date.now() - started,
        });
    } catch (e) {
        return NextResponse.json(
            { error: (e as Error).message },
            { status: 500 },
        );
    }
}
