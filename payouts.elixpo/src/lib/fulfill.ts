/**
 * Payment fulfillment — the single path that turns a captured charge into a
 * grant. Called by BOTH the client-side handback (instant UX) and the Razorpay
 * webhook (authoritative). Idempotent: the transaction unique index means the
 * second caller is a no-op and we never double-grant.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { applyGrant, type EntitlementView, toView } from "./entitlements";
import {
    completeSession,
    getWebhookEndpoint,
    recordRevenueLedger,
    recordTransaction,
    upsertOneTimeSubscription,
} from "./repo";
import { notifyBuyer } from "./mail-notify";
import { fireEntitlementUpdated, firePaymentCaptured } from "./webhooks";

export interface FulfillInput {
    session: any; // checkout_sessions row
    appSlug: string;
    providerOrderId: string;
    providerPaymentId: string;
    amount: number;
    currency: string;
    raw?: unknown;
}

export interface FulfillResult {
    alreadyFulfilled: boolean;
    entitlement: EntitlementView;
}

export async function fulfillPayment(
    db: D1Database,
    input: FulfillInput,
): Promise<FulfillResult> {
    const { session } = input;

    // 1. Record the transaction idempotently.
    const txn = await recordTransaction(db, {
        appId: session.app_id,
        customerId: session.customer_id,
        checkoutSessionId: session.id,
        providerOrderId: input.providerOrderId,
        providerPaymentId: input.providerPaymentId,
        currency: input.currency,
        amount: input.amount,
        status: "captured",
        raw: input.raw,
    });

    if (!txn.created && !(await needsResume(db, txn.id))) {
        // Already fulfilled (or being fulfilled right now) by the other path —
        // return current state, no re-grant.
        const ent = await applyGrantNoop(db, session, input.appSlug);
        return { alreadyFulfilled: true, entitlement: ent };
    }

    // 2. Ledger discipline (minimal balanced pair).
    await recordRevenueLedger(
        db,
        session.app_id,
        txn.id,
        input.currency,
        input.amount,
    );

    // 3. Resolve tier + period from the product/price on the session.
    let tier = "member";
    let interval = "month";
    let intervalCount = 1;
    if (session.product_id) {
        const product = (await db
            .prepare("SELECT tier FROM products WHERE id = ?")
            .bind(session.product_id)
            .first()) as { tier: string } | null;
        if (product?.tier) tier = product.tier;
    }
    if (session.price_id) {
        const price = (await db
            .prepare("SELECT interval, interval_count FROM prices WHERE id = ?")
            .bind(session.price_id)
            .first()) as { interval: string; interval_count: number } | null;
        if (price) {
            interval = price.interval;
            intervalCount = price.interval_count;
        }
    }

    // 4. Roll the subscription period forward.
    const sub = await upsertOneTimeSubscription(db, {
        appId: session.app_id,
        customerId: session.customer_id,
        productId: session.product_id,
        priceId: session.price_id,
        tier,
        interval,
        intervalCount,
    });

    // 5. Apply the entitlement grant (+ immutable grant log).
    const entRow = await applyGrant(db, {
        appId: session.app_id,
        externalUid: session.external_uid,
        customerId: session.customer_id,
        subscriptionId: sub.id,
        transactionId: txn.id,
        tier,
        expiresAt: sub.periodEnd,
    });

    // 6. Close the session.
    await completeSession(db, session.id, txn.id);

    const view = toView(input.appSlug, entRow, session.external_uid);

    // 7. Notify the consuming app (best-effort; logged either way). Each call is
    //    a no-op unless the endpoint is subscribed to that event type.
    const endpoint = await getWebhookEndpoint(db, session.app_id);
    if (endpoint) {
        await fireEntitlementUpdated(db, endpoint, view);
        await firePaymentCaptured(db, endpoint, {
            app: input.appSlug,
            uid: session.external_uid,
            transaction_id: txn.id,
            provider_payment_id: input.providerPaymentId,
            provider_order_id: input.providerOrderId,
            currency: input.currency,
            amount: input.amount,
            tier,
        });
    }

    // 8. Email the buyer a receipt via Elixpo Mails (no-op unless wired up).
    //    A session that was already completed is being charged again, i.e. an
    //    autopay renewal on the same subscription.
    await notifyBuyer(db, {
        appId: session.app_id,
        event: "payment.receipt",
        externalUid: session.external_uid,
        ref: txn.id,
        tier,
        productId: session.product_id,
        amount: input.amount,
        currency: input.currency,
        interval,
        isRenewal: session.status === "completed",
        transactionId: txn.id,
        paymentId: input.providerPaymentId || null,
        periodEnd: sub.periodEnd,
    });

    return { alreadyFulfilled: false, entitlement: view };
}

/**
 * A transaction row with no grant means an earlier run crashed between
 * recording the charge and granting access. Resume it — but only once the row
 * is old enough that it can't be the other path still mid-flight.
 */
async function needsResume(db: D1Database, transactionId: string): Promise<boolean> {
    const row = (await db
        .prepare(
            `SELECT
                (SELECT 1 FROM grants WHERE transaction_id = ?1 LIMIT 1) AS granted,
                (SELECT created_at < datetime('now', '-2 minutes') FROM transactions WHERE id = ?1) AS stale`,
        )
        .bind(transactionId)
        .first()) as { granted: number | null; stale: number | null } | null;
    return !row?.granted && !!row?.stale;
}

async function applyGrantNoop(
    db: D1Database,
    session: any,
    appSlug: string,
): Promise<EntitlementView> {
    const row = (await db
        .prepare(
            "SELECT * FROM entitlements WHERE app_id = ? AND external_uid = ?",
        )
        .bind(session.app_id, session.external_uid)
        .first()) as any;
    return toView(appSlug, row, session.external_uid);
}
