export const runtime = "edge";

import { getTenantSubscription, getTenantUsage, listInvoices } from "@/lib/billing";
import { getDatabase } from "@/lib/d1-client";
import { PLANS } from "@/lib/plans";
import { getSession } from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";

/** GET /api/billing — returns current plan, subscription, limits, live usage, and invoices. */
export async function GET(request: NextRequest) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const db = await getDatabase();
    const subscription = await getTenantSubscription(db, session.tenantId);
    const usage = await getTenantUsage(
        db,
        session.tenantId,
        subscription.plan,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
    );
    const invoices = await listInvoices(db, session.tenantId);

    return NextResponse.json({
        ok: true,
        subscription,
        usage,
        invoices,
        plans: PLANS,
    });
}
