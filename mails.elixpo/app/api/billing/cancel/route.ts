export const runtime = "edge";

import { getTenantSubscription, updateTenantSubscription } from "@/lib/billing";
import { getDatabase } from "@/lib/d1-client";
import { ElixpoPayError, cancelPaySubscription } from "@/lib/elixpo-pay";
import { getSession } from "@/lib/session";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

/**
 * POST /api/billing/cancel — cancel autopay at the end of the paid period via
 * Elixpo Pay. The workspace keeps its plan until then; Elixpo Pay's expiry
 * grant moves it back to Starter.
 */
export async function POST(request: NextRequest) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;

    const db = await getDatabase();
    const sub = await getTenantSubscription(db, session.tenantId);

    if (sub.plan === "starter") {
        return NextResponse.json(
            { error: "already_free", message: "Workspace is already on the free Starter plan." },
            { status: 400 },
        );
    }
    if (sub.cancelAtPeriodEnd) {
        return NextResponse.json({ ok: true, message: "Cancellation is already scheduled." });
    }

    try {
        const res = await cancelPaySubscription(session.tenantId);
        await updateTenantSubscription(db, session.tenantId, {
            cancelAtPeriodEnd: true,
            ...(res.current_period_end ? { currentPeriodEnd: res.current_period_end } : {}),
        });
        return NextResponse.json({
            ok: true,
            message:
                "Your subscription will end at the close of the current billing period. You keep your plan until then.",
        });
    } catch (e) {
        const err = e instanceof ElixpoPayError ? e : null;
        console.error("[billing/cancel]", e);
        return NextResponse.json(
            {
                error: err?.code || "cancel_failed",
                message: err?.message || "Failed to cancel subscription",
            },
            { status: err?.status || 500 },
        );
    }
}
