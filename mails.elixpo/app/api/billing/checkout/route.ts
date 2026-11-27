export const runtime = "edge";

import { getTenantSubscription } from "@/lib/billing";
import { getDatabase } from "@/lib/d1-client";
import { ElixpoPayError, createPayCheckout } from "@/lib/elixpo-pay";
import { appUrl } from "@/lib/env";
import type { BillingCycle, Currency } from "@/lib/plans";
import { getSession } from "@/lib/session";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

/**
 * POST /api/billing/checkout  { plan: "pro"|"scale", cycle, currency }
 *
 * Starts an Elixpo Pay hosted checkout for the current workspace and returns
 * `{ ok, url }` — the client redirects there. The plan only changes when
 * Elixpo Pay's signed grant webhook arrives (/api/billing/grant), never here.
 */
export async function POST(request: NextRequest) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;

    const body: any = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });

    const plan = body.plan;
    const cycle: BillingCycle = body.cycle === "yearly" ? "yearly" : "monthly";
    const currency: Currency = body.currency === "INR" ? "INR" : "USD";

    if (plan !== "pro" && plan !== "scale") {
        return NextResponse.json(
            { error: "invalid_plan", message: "Only Pro and Scale plans require checkout." },
            { status: 400 },
        );
    }

    const db = await getDatabase();
    const sub = await getTenantSubscription(db, session.tenantId);
    if (
        sub.plan === plan &&
        sub.billingCycle === cycle &&
        sub.subscriptionStatus === "active" &&
        !sub.cancelAtPeriodEnd
    ) {
        return NextResponse.json(
            {
                error: "already_subscribed",
                message: `This workspace is already on ${plan} (${cycle}).`,
            },
            { status: 409 },
        );
    }

    try {
        const base = await appUrl();
        const { url } = await createPayCheckout({
            tenantId: session.tenantId,
            tenantName: sub.tenantName,
            email: session.email,
            plan,
            cycle,
            currency,
            successUrl: `${base}/dashboard/billing?checkout=success`,
        });

        // Remember the choice; applied when the grant webhook lands.
        await db
            .prepare(
                "UPDATE tenants SET pending_billing_cycle = ?, pending_billing_currency = ? WHERE id = ?",
            )
            .bind(cycle, currency, session.tenantId)
            .run();

        return NextResponse.json({ ok: true, url });
    } catch (e) {
        const err = e instanceof ElixpoPayError ? e : null;
        console.error("[billing/checkout]", e);
        return NextResponse.json(
            {
                error: err?.code || "checkout_failed",
                message: err?.message || "Failed to start checkout",
            },
            { status: err?.status || 500 },
        );
    }
}
