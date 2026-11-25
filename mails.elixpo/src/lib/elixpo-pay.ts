/**
 * Elixpo Pay (payouts.elixpo.com) client — Elixpo Mails bills its paid plans
 * through Elixpo Pay like every other ecosystem app, instead of talking to
 * Stripe/Razorpay directly. Elixpo Pay owns checkout, autopay mandates,
 * renewals, receipts and the ledger; Mails only mirrors the resulting plan.
 *
 *   start   → POST /v1/checkout/sessions   (tier = plan id, interval = month|year)
 *   cancel  → POST /v1/subscriptions/cancel (graceful, at period end)
 *   grants  ← POST /api/billing/grant       (signed `entitlement.updated` /
 *                                            `payment.captured` webhooks)
 *
 * The buyer uid is the Mails TENANT id — a plan belongs to a workspace.
 *
 * Env:
 *   ELIXPO_PAY_URL             default https://payouts.elixpo.com
 *   ELIXPO_PAY_APP             app slug in Elixpo Pay, default "elixpo-mails"
 *   ELIXPO_PAY_API_KEY         app secret key (server-only)
 *   ELIXPO_PAY_WEBHOOK_SECRET  whsec_… from the Elixpo Pay dashboard
 *                              (comma-separate two during a rotation)
 */

import { hmacSha256Hex, timingSafeEqual } from "./crypto";
import { getEnv } from "./env";
import type { BillingCycle, Currency, PlanId } from "./plans";

export async function payBaseUrl(): Promise<string> {
    return ((await getEnv("ELIXPO_PAY_URL")) || "https://payouts.elixpo.com").replace(/\/$/, "");
}

export async function payAppSlug(): Promise<string> {
    return (await getEnv("ELIXPO_PAY_APP")) || "elixpo-mails";
}

export class ElixpoPayError extends Error {
    constructor(
        public code: string,
        message: string,
        public status = 502,
    ) {
        super(message);
    }
}

async function payFetch(path: string, body: unknown): Promise<any> {
    const key = await getEnv("ELIXPO_PAY_API_KEY");
    if (!key) {
        throw new ElixpoPayError(
            "billing_unconfigured",
            "Billing isn't configured on this deployment (ELIXPO_PAY_API_KEY missing).",
            503,
        );
    }
    let res: Response;
    try {
        res = await fetch(`${await payBaseUrl()}${path}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
        });
    } catch (err) {
        throw new ElixpoPayError(
            "billing_unreachable",
            `Couldn't reach Elixpo Pay: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new ElixpoPayError(
            data.error || "billing_error",
            data.error_description || data.error || `Elixpo Pay returned ${res.status}`,
            res.status >= 500 ? 502 : res.status === 404 ? 404 : 400,
        );
    }
    return data;
}

/** Create a hosted checkout for a workspace and return its URL. */
export async function createPayCheckout(input: {
    tenantId: string;
    tenantName: string;
    email: string;
    plan: Exclude<PlanId, "starter" | "enterprise">;
    cycle: BillingCycle;
    currency: Currency;
    successUrl: string;
}): Promise<{ id: string; url: string }> {
    const data = await payFetch("/v1/checkout/sessions", {
        tier: input.plan,
        interval: input.cycle === "yearly" ? "year" : "month",
        currency: input.currency,
        customer: { uid: input.tenantId, email: input.email },
        success_url: input.successUrl,
        metadata: { tenant_name: input.tenantName, cycle: input.cycle },
    });
    if (!data?.url)
        throw new ElixpoPayError("billing_error", "Elixpo Pay returned no checkout URL");
    return { id: data.id, url: data.url };
}

/** Cancel the workspace's autopay at the end of the paid period. */
export async function cancelPaySubscription(tenantId: string): Promise<{
    status: string;
    current_period_end: string | null;
}> {
    return payFetch("/v1/subscriptions/cancel", {
        customer: { uid: tenantId },
        cancel_at_cycle_end: true,
    });
}

const TOLERANCE_SECONDS = 300;

/**
 * Verify an Elixpo Pay webhook:
 *   X-Elixpo-Pay-Timestamp: <unix>
 *   X-Elixpo-Pay-Signature: sha256=<hex>[,sha256=<hex>]   (dual-signed during rotation)
 * over `${timestamp}.${rawBody}`. Accepts if ANY signature matches ANY of our
 * configured secrets. Fails closed when no secret is configured.
 */
export async function verifyPayWebhook(rawBody: string, headers: Headers): Promise<boolean> {
    const secrets = ((await getEnv("ELIXPO_PAY_WEBHOOK_SECRET")) || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (secrets.length === 0) return false;

    const ts = headers.get("x-elixpo-pay-timestamp") || "";
    const t = Number.parseInt(ts, 10);
    if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return false;

    const presented = (headers.get("x-elixpo-pay-signature") || "")
        .split(",")
        .map((p) =>
            p
                .trim()
                .replace(/^sha256=/i, "")
                .toLowerCase(),
        )
        .filter(Boolean);
    if (presented.length === 0) return false;

    for (const secret of secrets) {
        const expected = await hmacSha256Hex(secret, `${ts}.${rawBody}`);
        if (presented.some((sig) => timingSafeEqual(expected, sig))) return true;
    }
    return false;
}
