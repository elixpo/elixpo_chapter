export const runtime = "edge";

import { recordInvoice, updateTenantSubscription } from "@/lib/billing";
import { getDatabase } from "@/lib/d1-client";
import { verifyPayWebhook } from "@/lib/elixpo-pay";
import { PLANS, type PlanId } from "@/lib/plans";
import { type NextRequest, NextResponse } from "next/server";

/**
 * POST /api/billing/grant — Elixpo Pay → Mails webhook.
 *
 * Register this URL on the Elixpo Pay app (dashboard → product → webhook) and
 * subscribe to `entitlement.updated` + `payment.captured`.
 *
 *   entitlement.updated  data = { uid: <tenant id>, tier, active, status,
 *                                 expires_at, version?, failed? }
 *     active + tier pro|scale → workspace is on that plan until expires_at
 *       status "cancelled"    → still on plan, cancellation scheduled
 *       status "halted"       → still on plan (paid through), renewal failing
 *     !active                 → back to Starter
 *   payment.captured     data = { uid, transaction_id, amount, currency }
 *     → an invoice row (deduped on transaction_id)
 *
 * Signature-invalid → 401. Everything else → 2xx (unknown tenants/events are
 * acknowledged so Elixpo Pay doesn't retry forever); DB failures → 500 so it does.
 */
export async function POST(request: NextRequest) {
    const rawBody = await request.text();
    if (!(await verifyPayWebhook(rawBody, request.headers))) {
        return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }

    let event: any;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const data = event?.data ?? {};
    const tenantId = typeof data.uid === "string" ? data.uid : "";
    if (!tenantId) return NextResponse.json({ ok: true, ignored: "no_uid" });

    const db = await getDatabase();
    const tenant = (await db
        .prepare(
            `SELECT id, plan, pay_entitlement_version, pending_billing_cycle, pending_billing_currency
             FROM tenants WHERE id = ?`,
        )
        .bind(tenantId)
        .first()) as {
        id: string;
        plan: string;
        pay_entitlement_version: number;
        pending_billing_cycle: string | null;
        pending_billing_currency: string | null;
    } | null;
    if (!tenant) {
        console.warn("[billing/grant] unknown tenant %s", tenantId);
        return NextResponse.json({ ok: true, ignored: "unknown_tenant" });
    }

    try {
        if (event.type === "payment.captured") {
            const amount = Number(data.amount);
            if (data.transaction_id && Number.isInteger(amount)) {
                try {
                    await recordInvoice(db, {
                        tenantId,
                        provider: "elixpo_pay",
                        providerInvoiceId: String(data.transaction_id),
                        amount,
                        currency: data.currency === "INR" ? "INR" : "USD",
                        status: "paid",
                        paidAt: new Date().toISOString(),
                        hostedInvoiceUrl: null,
                    });
                } catch (err) {
                    // Redelivery of a charge we already recorded.
                    if (!/UNIQUE/i.test(String(err))) throw err;
                }
            }
            return NextResponse.json({ ok: true });
        }

        if (event.type !== "entitlement.updated") {
            return NextResponse.json({ ok: true, ignored: event.type ?? "unknown" });
        }

        // Out-of-order guard: versioned grants only move forward. Wind-down
        // notices (cancelled/halted) carry no version and never downgrade.
        const version = Number.isInteger(data.version) ? Number(data.version) : null;
        if (version !== null && version < (tenant.pay_entitlement_version ?? 0)) {
            return NextResponse.json({ ok: true, ignored: "stale_version" });
        }

        const tier = String(data.tier || "") as PlanId;
        const paidTier = (tier === "pro" || tier === "scale") && tier in PLANS;

        const paidActive = !!data.active && paidTier;
        if (paidActive) {
            const pc = tenant.pending_billing_cycle;
            const cycle = pc === "yearly" || pc === "monthly" ? pc : undefined;
            const pcur = tenant.pending_billing_currency;
            const currency = pcur === "INR" || pcur === "USD" ? pcur : undefined;
            await updateTenantSubscription(db, tenantId, {
                plan: tier,
                subscriptionStatus: data.status === "halted" && data.failed ? "past_due" : "active",
                // A revoked UPI mandate arrives as halted + failed:false — it
                // won't renew, same as a scheduled cancellation.
                cancelAtPeriodEnd:
                    data.status === "cancelled" || (data.status === "halted" && !data.failed),
                currentPeriodEnd: data.expires_at ?? null,
                ...(tenant.plan !== tier || data.status === "active"
                    ? { currentPeriodStart: new Date().toISOString() }
                    : {}),
                paymentProvider: "elixpo_pay",
                ...(cycle ? { billingCycle: cycle } : {}),
                ...(currency ? { billingCurrency: currency } : {}),
            });
        } else if (!data.active) {
            await updateTenantSubscription(db, tenantId, {
                plan: "starter",
                subscriptionStatus: "active",
                cancelAtPeriodEnd: false,
                currentPeriodStart: null,
                currentPeriodEnd: null,
            });
        }

        // Record the applied version; a paid grant also consumes the pending
        // checkout choice.
        await db
            .prepare(
                `UPDATE tenants SET
                    pay_entitlement_version = MAX(pay_entitlement_version, ?),
                    pending_billing_cycle = CASE WHEN ? THEN NULL ELSE pending_billing_cycle END,
                    pending_billing_currency = CASE WHEN ? THEN NULL ELSE pending_billing_currency END
                 WHERE id = ?`,
            )
            .bind(version ?? 0, paidActive ? 1 : 0, paidActive ? 1 : 0, tenantId)
            .run();

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[billing/grant] failed:", err);
        return NextResponse.json({ error: "processing_failed" }, { status: 500 });
    }
}
