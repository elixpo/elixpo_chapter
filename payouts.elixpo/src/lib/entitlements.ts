/**
 * Entitlement state + grant application. This is the source of truth behind
 * both GET /v1/entitlements and the outbound entitlement.updated webhook.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { newId } from "./ids";

export interface EntitlementRow {
    id: string;
    app_id: string;
    external_uid: string;
    customer_id: string | null;
    subscription_id: string | null;
    tier: string;
    status: string;
    expires_at: string | null;
    version: number;
    updated_at: string;
}

export async function getEntitlement(
    db: D1Database,
    appId: string,
    externalUid: string,
): Promise<EntitlementRow | null> {
    return (await db
        .prepare(
            "SELECT * FROM entitlements WHERE app_id = ? AND external_uid = ?",
        )
        .bind(appId, externalUid)
        .first()) as EntitlementRow | null;
}

/**
 * The shape returned by GET /v1/entitlements and carried in the webhook.
 * `active` is computed against expiry so consumers don't have to.
 */
export interface EntitlementView {
    app: string;
    uid: string;
    tier: string;
    status: string;
    active: boolean;
    expires_at: string | null;
    version: number;
}

export function toView(
    appSlug: string,
    row: EntitlementRow | null,
    externalUid: string,
): EntitlementView {
    if (!row) {
        return {
            app: appSlug,
            uid: externalUid,
            tier: "free",
            status: "none",
            active: false,
            expires_at: null,
            version: 0,
        };
    }
    const notExpired =
        !row.expires_at ||
        new Date(`${row.expires_at.replace(" ", "T")}Z`) > new Date();
    return {
        app: appSlug,
        uid: row.external_uid,
        tier: row.tier,
        status: row.status,
        active: row.status === "active" && notExpired,
        expires_at: row.expires_at,
        version: row.version,
    };
}

export interface ApplyGrantInput {
    appId: string;
    externalUid: string;
    customerId: string | null;
    subscriptionId: string | null;
    transactionId: string | null;
    tier: string;
    expiresAt: string | null;
    action?: "granted" | "renewed" | "revoked" | "expired";
}

/**
 * Upsert the entitlement to the granted tier/expiry, bump its monotonic
 * version, and write an immutable grant log row. Returns the new entitlement.
 */
export async function applyGrant(
    db: D1Database,
    input: ApplyGrantInput,
): Promise<EntitlementRow> {
    const existing = await getEntitlement(db, input.appId, input.externalUid);

    let entitlementId: string;
    let version: number;

    if (existing) {
        entitlementId = existing.id;
        version = existing.version + 1;
        await db
            .prepare(
                `UPDATE entitlements
                 SET tier = ?, status = 'active', expires_at = ?, customer_id = COALESCE(?, customer_id),
                     subscription_id = COALESCE(?, subscription_id), version = ?, updated_at = datetime('now')
                 WHERE id = ?`,
            )
            .bind(
                input.tier,
                input.expiresAt,
                input.customerId,
                input.subscriptionId,
                version,
                entitlementId,
            )
            .run();
    } else {
        entitlementId = newId("entitlement");
        version = 1;
        await db
            .prepare(
                `INSERT INTO entitlements
                 (id, app_id, external_uid, customer_id, subscription_id, tier, status, expires_at, version)
                 VALUES (?, ?, ?, ?, ?, ?, 'active', ?, 1)`,
            )
            .bind(
                entitlementId,
                input.appId,
                input.externalUid,
                input.customerId,
                input.subscriptionId,
                input.tier,
                input.expiresAt,
            )
            .run();
    }

    await db
        .prepare(
            `INSERT INTO grants
             (id, entitlement_id, app_id, external_uid, transaction_id, subscription_id, tier, action, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
            newId("grant"),
            entitlementId,
            input.appId,
            input.externalUid,
            input.transactionId,
            input.subscriptionId,
            input.tier,
            input.action ?? (existing ? "renewed" : "granted"),
            input.expiresAt,
        )
        .run();

    return (await getEntitlement(
        db,
        input.appId,
        input.externalUid,
    )) as EntitlementRow;
}

/**
 * Mark an active entitlement expired (membership lapsed). Bumps version, logs
 * an immutable grant row, and expires the backing subscription. The caller
 * fires the entitlement.updated webhook so the consuming app downgrades.
 */
export async function expireEntitlement(
    db: D1Database,
    row: EntitlementRow,
): Promise<EntitlementRow> {
    const version = row.version + 1;
    await db
        .prepare(
            "UPDATE entitlements SET status = 'expired', version = ?, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(version, row.id)
        .run();

    await db
        .prepare(
            `INSERT INTO grants (id, entitlement_id, app_id, external_uid, subscription_id, tier, action, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, 'expired', ?)`,
        )
        .bind(
            newId("grant"),
            row.id,
            row.app_id,
            row.external_uid,
            row.subscription_id,
            row.tier,
            row.expires_at,
        )
        .run();

    if (row.subscription_id) {
        await db
            .prepare(
                "UPDATE subscriptions SET status = 'expired', updated_at = datetime('now') WHERE id = ?",
            )
            .bind(row.subscription_id)
            .run();
    }

    return { ...row, status: "expired", version };
}

/**
 * Revoke an entitlement because the account was deleted or the app's access was
 * revoked on accounts.elixpo. Marks the entitlement `revoked` and cancels its
 * subscription so it never renews (billing stops). Audited as a `revoked` grant.
 */
export async function revokeEntitlement(
    db: D1Database,
    row: EntitlementRow,
): Promise<EntitlementRow> {
    const version = row.version + 1;
    await db
        .prepare(
            "UPDATE entitlements SET status = 'revoked', version = ?, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(version, row.id)
        .run();

    await db
        .prepare(
            `INSERT INTO grants (id, entitlement_id, app_id, external_uid, subscription_id, tier, action, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, 'revoked', ?)`,
        )
        .bind(
            newId("grant"),
            row.id,
            row.app_id,
            row.external_uid,
            row.subscription_id,
            row.tier,
            row.expires_at,
        )
        .run();

    if (row.subscription_id) {
        await db
            .prepare(
                "UPDATE subscriptions SET status = 'cancelled', cancel_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
            )
            .bind(row.subscription_id)
            .run();
    }

    return { ...row, status: "revoked", version };
}

/**
 * A one-time purchase was fully refunded / charged back: revoke the access it
 * bought. Only when (a) the entitlement is still active, (b) its subscription
 * is one-time (an autopay renewal refund leaves the mandate's access alone),
 * and (c) the LATEST grant on the entitlement came from this transaction — a
 * refund of an older purchase must not cut off a newer paid period.
 * Returns the revoked row, or null when nothing changed.
 */
export async function revokeForRefundedTransaction(
    db: D1Database,
    transactionId: string,
): Promise<EntitlementRow | null> {
    const grant = (await db
        .prepare(
            "SELECT entitlement_id FROM grants WHERE transaction_id = ? ORDER BY created_at DESC LIMIT 1",
        )
        .bind(transactionId)
        .first()) as { entitlement_id: string } | null;
    if (!grant) return null;

    const row = (await db
        .prepare("SELECT * FROM entitlements WHERE id = ?")
        .bind(grant.entitlement_id)
        .first()) as EntitlementRow | null;
    if (row?.status !== "active") return null;

    if (row.subscription_id) {
        const sub = (await db
            .prepare("SELECT billing_mode FROM subscriptions WHERE id = ?")
            .bind(row.subscription_id)
            .first()) as { billing_mode: string } | null;
        if (sub?.billing_mode === "recurring") return null;
    }

    const latest = (await db
        .prepare(
            `SELECT transaction_id FROM grants
             WHERE entitlement_id = ? AND action IN ('granted', 'renewed')
             ORDER BY created_at DESC, rowid DESC LIMIT 1`,
        )
        .bind(row.id)
        .first()) as { transaction_id: string | null } | null;
    if (latest?.transaction_id !== transactionId) return null;

    return revokeEntitlement(db, row);
}
