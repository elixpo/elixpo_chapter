/**
 * Razorpay (INR) adapter. P0 uses the one-time Orders API:
 * create an order, the client pays via Razorpay Checkout, and we fulfill on the
 * `payment.captured` webhook (the authoritative server-side signal).
 *
 * Docs: https://razorpay.com/docs/api/orders / .../webhooks
 */

import { hmacSha256Hex, timingSafeEqual, verifyHmacSha256Hex } from "../crypto";
import type {
    CreateCustomerInput,
    CreateCustomerResult,
    CreateOrderInput,
    CreateOrderResult,
    CreatePlanInput,
    CreatePlanResult,
    CreateSubscriptionInput,
    CreateSubscriptionResult,
    NormalizedWebhookEvent,
    PaymentProvider,
} from "./types";

const RAZORPAY_API = "https://api.razorpay.com/v1";

/** A refund or dispute event, normalised (see RazorpayProvider.parseRefundEvent). */
export interface RazorpayRefundEvent {
    kind: "refund" | "dispute_lost" | "dispute_created";
    paymentId: string;
    /** rfnd_… for refunds, disp_… for disputes. */
    referenceId: string | null;
    /** This refund's / dispute's amount (minor units). */
    amount: number;
    /** The original payment amount, when the payload carries the payment. */
    paymentAmount: number | null;
    /** Cumulative amount gone from the payment after this event. */
    totalRefunded: number;
    currency: string | null;
    /** True when the whole payment is now refunded / lost. */
    full: boolean;
}

export interface RazorpayTransfer {
    id: string;
    recipient: string | null;
    amount: number;
    amountReversed: number;
    currency: string | null;
    status: string | null;
}

export class RazorpayProvider implements PaymentProvider {
    readonly name = "razorpay";

    constructor(
        readonly keyId: string,
        private readonly keySecret: string,
        private readonly webhookSecret: string,
        readonly mode: "test" | "live" = "test",
    ) {}

    private authHeader(): string {
        // Basic auth: base64(key_id:key_secret)
        return `Basic ${btoa(`${this.keyId}:${this.keySecret}`)}`;
    }

    /**
     * Raw authenticated call to any Razorpay API path (e.g. "/v2/accounts").
     * Returns the parsed JSON and status; never throws on HTTP errors.
     */
    async call(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: any }> {
        const res = await fetch(`https://api.razorpay.com${path}`, {
            method,
            headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const json: any = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, json };
    }

    async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
        const res = await fetch(`${RAZORPAY_API}/orders`, {
            method: "POST",
            headers: {
                "Authorization": this.authHeader(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                amount: input.amount,
                currency: input.currency,
                receipt: input.receipt,
                notes: input.notes ?? {},
                payment_capture: 1,
                // Razorpay Route split (only when a connected payout account
                // supplies transfers; otherwise omitted → settles to platform).
                ...(input.transfers?.length ? { transfers: input.transfers } : {}),
            }),
        });

        const raw: any = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(
                `Razorpay order create failed (${res.status}): ${raw?.error?.description || res.statusText}`,
            );
        }

        return {
            providerOrderId: raw.id,
            amount: raw.amount,
            currency: raw.currency,
            raw,
        };
    }

    /**
     * Client handback signature: HMAC_SHA256(key_secret, `${orderId}|${paymentId}`).
     * Razorpay Checkout returns razorpay_signature in the success callback.
     */
    async verifyPaymentSignature(
        orderId: string,
        paymentId: string,
        signature: string,
    ): Promise<boolean> {
        return verifyHmacSha256Hex(
            this.keySecret,
            `${orderId}|${paymentId}`,
            signature,
        );
    }

    /** Webhook signature: HMAC_SHA256(webhook_secret, rawBody) in X-Razorpay-Signature. */
    async verifyWebhookSignature(
        rawBody: string,
        signature: string,
    ): Promise<boolean> {
        // No configured secret → nothing can verify (and an empty HMAC key
        // throws in WebCrypto). Fail closed instead of 500ing.
        if (!this.webhookSecret || !signature) return false;
        const expected = await hmacSha256Hex(this.webhookSecret, rawBody);
        return timingSafeEqual(expected, (signature || "").trim());
    }

    parseWebhook(rawBody: string, headers: Headers): NormalizedWebhookEvent {
        const body = JSON.parse(rawBody);
        const type: string = body.event || "";
        const payment = body.payload?.payment?.entity;
        const order = body.payload?.order?.entity;
        const subscription = body.payload?.subscription?.entity;

        const isPaymentCaptured =
            type === "payment.captured" ||
            (type === "order.paid" && payment?.status === "captured");

        // Subscription lifecycle:
        //   subscription.activated  — mandate confirmed, first charge done
        //   subscription.charged    — recurring charge succeeded (renewal)
        //   subscription.cancelled  — buyer or merchant cancelled
        //   subscription.paused     — paused (Razorpay-side pause feature)
        //   subscription.halted     — repeated charge failures; buyer must
        //                             update payment method to resume
        //   subscription.completed  — ran out of total_count cycles
        // `subscription.charged` events arrive WITH a `payment.entity` too;
        // we treat them as both a subscription event AND a captured charge
        // so the same fulfillment path (`fulfillPayment`) extends the
        // entitlement and writes a ledger row per renewal.
        const isSubscriptionEvent = type.startsWith("subscription.");
        const subscriptionStatusFromType = isSubscriptionEvent
            ? type.split(".").slice(1).join(".")
            : null;

        return {
            eventId: headers.get("x-razorpay-event-id"),
            type,
            // subscription.charged carries a payment.entity → treat as captured
            isPaymentCaptured:
                isPaymentCaptured ||
                (type === "subscription.charged" &&
                    payment?.status === "captured"),
            providerOrderId: payment?.order_id || order?.id || null,
            providerPaymentId: payment?.id || null,
            amount: payment?.amount ?? order?.amount ?? null,
            currency: payment?.currency ?? order?.currency ?? null,
            raw: body,
            providerSubscriptionId:
                subscription?.id ?? payment?.subscription_id ?? null,
            subscriptionStatus: subscriptionStatusFromType,
        };
    }

    /**
     * Money-back events: `refund.processed` (full or partial) and the dispute
     * lifecycle (`payment.dispute.created` / `.lost`). Returns null for any
     * other event. `totalRefunded` is CUMULATIVE for the payment (Razorpay's
     * payment.amount_refunded), so callers can act idempotently on it; a lost
     * dispute counts as the whole disputed amount gone.
     */
    parseRefundEvent(body: any): RazorpayRefundEvent | null {
        const type: string = body?.event || "";
        const payment = body?.payload?.payment?.entity;
        if (type === "refund.processed") {
            const refund = body?.payload?.refund?.entity;
            const paymentId: string | null = refund?.payment_id || payment?.id || null;
            if (!paymentId) return null;
            const amount = Number(refund?.amount ?? 0);
            const paymentAmount = payment?.amount != null ? Number(payment.amount) : null;
            const totalRefunded =
                payment?.amount_refunded != null ? Number(payment.amount_refunded) : amount;
            return {
                kind: "refund",
                paymentId,
                referenceId: refund?.id ?? null,
                amount,
                paymentAmount,
                totalRefunded,
                currency: refund?.currency ?? payment?.currency ?? null,
                full:
                    payment?.refund_status === "full" ||
                    (paymentAmount != null && totalRefunded >= paymentAmount),
            };
        }
        if (type === "payment.dispute.lost" || type === "payment.dispute.created") {
            const dispute = body?.payload?.dispute?.entity;
            const paymentId: string | null = dispute?.payment_id || payment?.id || null;
            if (!paymentId) return null;
            const paymentAmount = payment?.amount != null ? Number(payment.amount) : null;
            const amount = Number(dispute?.amount ?? paymentAmount ?? 0);
            const lost = type === "payment.dispute.lost";
            return {
                kind: lost ? "dispute_lost" : "dispute_created",
                paymentId,
                referenceId: dispute?.id ?? null,
                amount,
                paymentAmount,
                // A lost dispute debits the disputed amount on top of any refunds.
                totalRefunded: lost
                    ? Number(payment?.amount_refunded ?? 0) + amount
                    : Number(payment?.amount_refunded ?? 0),
                currency: dispute?.currency ?? payment?.currency ?? null,
                full: lost && (paymentAmount == null || amount >= paymentAmount),
            };
        }
        return null;
    }

    /** Route transfers made from a payment: GET /v1/payments/:id/transfers. */
    async listPaymentTransfers(paymentId: string): Promise<RazorpayTransfer[]> {
        const res = await fetch(
            `${RAZORPAY_API}/payments/${encodeURIComponent(paymentId)}/transfers`,
            {
                method: "GET",
                headers: { Authorization: this.authHeader(), Accept: "application/json" },
            },
        );
        const raw: any = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(
                `Razorpay list transfers failed (${res.status}): ${raw?.error?.description || res.statusText}`,
            );
        }
        const items: any[] = Array.isArray(raw?.items) ? raw.items : [];
        return items.map((t) => ({
            id: String(t.id),
            recipient: t.recipient ?? null,
            amount: Number(t.amount ?? 0),
            amountReversed: Number(t.amount_reversed ?? 0),
            currency: t.currency ?? null,
            status: t.status ?? null,
        }));
    }

    /**
     * Pull money back from a linked account: POST /v1/transfers/:id/reversals.
     * Omitting `amount` reverses the whole remaining transfer.
     */
    async reverseTransfer(
        transferId: string,
        amount?: number,
    ): Promise<{ reversalId: string; amount: number; raw: unknown }> {
        const res = await fetch(
            `${RAZORPAY_API}/transfers/${encodeURIComponent(transferId)}/reversals`,
            {
                method: "POST",
                headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
                body: JSON.stringify(amount != null ? { amount } : {}),
            },
        );
        const raw: any = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(
                `Razorpay transfer reversal failed (${res.status}): ${raw?.error?.description || res.statusText}`,
            );
        }
        return { reversalId: raw.id, amount: Number(raw.amount ?? amount ?? 0), raw };
    }

    async createPlan(input: CreatePlanInput): Promise<CreatePlanResult> {
        // Razorpay Plans API: POST /v1/plans. Plans are immutable —
        // amount/period/interval can't be edited after creation, so we
        // make one plan per (price) row and reuse it for every
        // Subscription against that price.
        // Docs: https://razorpay.com/docs/api/payments/subscriptions/plans
        // Razorpay's Plans API expects the ADVERB form of the period —
        // 'daily' | 'weekly' | 'monthly' | 'yearly' — NOT the singular
        // noun like 'month'. Passing 'month' returns
        // HTTP 400 "Invalid argument for period passed". Our internal
        // schema uses the noun form (matches `prices.interval`), so we
        // map it here at the provider boundary.
        const PERIOD_MAP: Record<string, string> = {
            day: "daily",
            week: "weekly",
            month: "monthly",
            year: "yearly",
        };
        const period = PERIOD_MAP[input.interval] ?? "monthly";
        const interval = Math.max(1, input.intervalCount ?? 1);
        const res = await fetch(`${RAZORPAY_API}/plans`, {
            method: "POST",
            headers: {
                Authorization: this.authHeader(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                period,
                interval,
                item: {
                    name: input.name,
                    description: input.description ?? input.name,
                    amount: input.amount,
                    currency: input.currency,
                },
                notes: input.referenceId
                    ? { price_id: input.referenceId }
                    : undefined,
            }),
        });

        const raw: any = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(
                `Razorpay plan create failed (${res.status}): ${raw?.error?.description || res.statusText}`,
            );
        }
        return { providerPlanId: raw.id, raw };
    }

    /**
     * Razorpay enforces TWO ceilings on subscription length:
     *  1. `end_time` ≤ 2120-12-25 (Unix 4765046400) — global cap.
     *  2. UPI Autopay mandates ≤ 30 years from creation — RBI rule, the
     *     stricter of the two. Returns:
     *       "expire_at cannot be more than 30 years for upi"
     *  Card eMandate and bank eMandate also cap at 30 years per RBI.
     *
     * So 30 years (= 360 monthly cycles) is the practical universal max.
     * Plenty of headroom for any realistic SaaS subscription — buyers
     * who somehow run through 30 years of renewals can re-mint a new
     * subscription.
     */
    private safeTotalCount(input: CreateSubscriptionInput): number {
        const MONTHLY_CEILING = 360; // 30 years, RBI/UPI Autopay limit
        const requested = Math.max(1, input.totalCount);
        return Math.min(requested, MONTHLY_CEILING);
    }

    async createSubscription(
        input: CreateSubscriptionInput,
    ): Promise<CreateSubscriptionResult> {
        // Razorpay Subscriptions API: POST /v1/subscriptions. Returns a
        // `short_url` that the buyer is redirected to — Razorpay's hosted
        // mandate-collection UX. After they approve, the activated webhook
        // fires and the first charge auto-runs.
        // Docs: https://razorpay.com/docs/api/payments/subscriptions/create-subscription
        const res = await fetch(`${RAZORPAY_API}/subscriptions`, {
            method: "POST",
            headers: {
                Authorization: this.authHeader(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                plan_id: input.providerPlanId,
                total_count: this.safeTotalCount(input),
                // Binding a customer pre-mandate is required for UPI
                // Autopay to work — without it the hosted page can't
                // generate a valid UPI Intent and the QR loops forever.
                ...(input.providerCustomerId
                    ? { customer_id: input.providerCustomerId }
                    : {}),
                // We drive all notification copy ourselves through
                // mails.elixpo (consistent branding + suppression list).
                customer_notify: input.notifyEmail ? 1 : 0,
                notes: input.notes ?? {},
            }),
        });

        const raw: any = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(
                `Razorpay subscription create failed (${res.status}): ${raw?.error?.description || res.statusText}`,
            );
        }
        return {
            providerSubscriptionId: raw.id,
            shortUrl: raw.short_url,
            status: raw.status,
            raw,
        };
    }

    async getSubscription(
        providerSubscriptionId: string,
    ): Promise<{ status: string; shortUrl: string | null; raw: unknown }> {
        // GET /v1/subscriptions/{id} — returns the live subscription
        // including the canonical `short_url`. We use this for retries
        // (page reload, browser back) where the original short_url from
        // create-time wasn't persisted; constructing one from the sub_id
        // by string concat doesn't work — Razorpay's short URL uses a
        // separate ID namespace.
        const res = await fetch(
            `${RAZORPAY_API}/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,
            {
                method: "GET",
                headers: {
                    Authorization: this.authHeader(),
                    Accept: "application/json",
                },
            },
        );
        const raw: any = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(
                `Razorpay subscription get failed (${res.status}): ${raw?.error?.description || res.statusText}`,
            );
        }
        return {
            status: raw.status,
            shortUrl: raw.short_url ?? null,
            raw,
        };
    }

    async cancelSubscription(
        providerSubscriptionId: string,
        cancelAtCycleEnd = false,
    ): Promise<{ status: string; raw: unknown }> {
        // POST /v1/subscriptions/{id}/cancel
        // cancel_at_cycle_end = 1 → keeps the entitlement until the period
        // they already paid for ends (graceful downgrade).
        // = 0 → cancels immediately, entitlement should expire now.
        const res = await fetch(
            `${RAZORPAY_API}/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`,
            {
                method: "POST",
                headers: {
                    Authorization: this.authHeader(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0,
                }),
            },
        );

        const raw: any = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(
                `Razorpay subscription cancel failed (${res.status}): ${raw?.error?.description || res.statusText}`,
            );
        }
        return { status: raw.status, raw };
    }

    async createCustomer(
        input: CreateCustomerInput,
    ): Promise<CreateCustomerResult> {
        // POST /v1/customers — Razorpay enforces `fail_existing=0` semantics
        // by default (returns the existing customer instead of 4xx if the
        // contact/email already exists), which makes this safe to call
        // repeatedly. We still cache the result ourselves to avoid the
        // round-trip on every checkout.
        // Docs: https://razorpay.com/docs/api/customers/create
        const body: Record<string, unknown> = {
            name: input.name,
            fail_existing: 0,
        };
        if (input.email) body.email = input.email;
        if (input.contact) body.contact = input.contact;
        if (input.referenceId) body.notes = { reference_id: input.referenceId };

        const res = await fetch(`${RAZORPAY_API}/customers`, {
            method: "POST",
            headers: {
                Authorization: this.authHeader(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        const raw: any = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(
                `Razorpay customer create failed (${res.status}): ${raw?.error?.description || res.statusText}`,
            );
        }
        return { providerCustomerId: raw.id, raw };
    }
}

/**
 * Build a Razorpay provider from env. Selects test vs live keys by RAZORPAY_MODE
 * (default "test"), preferring RAZORPAY_{TEST,LIVE}_* and falling back to the
 * legacy unsuffixed RAZORPAY_* vars. Returns null if no usable keys.
 */
export async function razorpayFromEnv(
    getEnv: (k: string) => Promise<string | undefined>,
): Promise<RazorpayProvider | null> {
    const mode =
        ((await getEnv("RAZORPAY_MODE")) || "test").toLowerCase() === "live"
            ? "live"
            : "test";
    const M = mode.toUpperCase();
    const pick = async (suffix: string) =>
        (await getEnv(`RAZORPAY_${M}_${suffix}`)) ||
        (await getEnv(`RAZORPAY_${suffix}`));

    const keyId = await pick("KEY_ID");
    const keySecret = await pick("KEY_SECRET");
    const webhookSecret = await pick("WEBHOOK_SECRET");
    if (!keyId || !keySecret) return null;
    return new RazorpayProvider(keyId, keySecret, webhookSecret || "", mode);
}
