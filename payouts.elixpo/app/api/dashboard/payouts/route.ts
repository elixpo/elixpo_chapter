export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import type { D1Database } from "@cloudflare/workers-types";
import { requireDashboard } from "@/lib/dashboard-auth";
import { getEnv } from "@/lib/env";
import { newId } from "@/lib/ids";
import { isPlatformMerchant, PLATFORM_COMMISSION_BPS } from "@/lib/merchant";
import { razorpayFromEnv } from "@/lib/providers/razorpay";
import {
    fetchActivation,
    onboardLinkedAccount,
    PAN_RE,
    PHONE_RE,
    PIN_RE,
    type PayoutPurpose,
    setSettlementAccount,
    statusFor,
} from "@/lib/route-onboarding";

/**
 * Connected payout account (Razorpay Route) for the signed-in merchant.
 *
 *   GET    → current connection + status + routable revenue summary
 *   PUT    → connect (full KYC) or change the settlement bank account
 *   DELETE → pause payouts (keeps the Razorpay account so reconnecting reuses it)
 *
 * Onboarding runs Razorpay Route's v2 flow (src/lib/route-onboarding.ts). Splits
 * only happen once Razorpay activates the account (status 'active'); GET polls
 * the activation status while it is pending. PUT and DELETE need a sign-in from
 * the last REAUTH_SECONDS, since they decide where money goes.
 */

const REAUTH_SECONDS = 15 * 60;

function needsReauth(session: { iat: number }): boolean {
    return Math.floor(Date.now() / 1000) - session.iat > REAUTH_SECONDS;
}

const reauth = () =>
    NextResponse.json(
        {
            error: "reauth_required",
            error_description: "For your security, sign in again to change where your payouts go.",
        },
        { status: 401 },
    );

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

async function getAccount(db: D1Database, merchantId: string): Promise<any | null> {
    return db
        .prepare("SELECT * FROM payout_accounts WHERE merchant_id = ?")
        .bind(merchantId)
        .first();
}

function view(row: any | null) {
    if (!row) return null;
    return {
        beneficiary_name: row.beneficiary_name,
        bank_ifsc: row.bank_ifsc,
        bank_last4: row.bank_last4,
        razorpay_account_id: row.razorpay_account_id,
        commission_bps: row.commission_bps,
        status: row.status, // pending | active | disabled | self
        activation_status: row.activation_status ?? null,
        activation_note: row.activation_note ?? null,
        // True once KYC is submitted: later updates only need bank details.
        kyc_submitted: !!(row.razorpay_account_id && row.razorpay_product_id),
    };
}

export async function GET(request: NextRequest) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId } = ctx;

    let row = await getAccount(db, merchantId);

    // While Razorpay is reviewing the account, refresh its activation status.
    if (row?.razorpay_account_id && row.razorpay_product_id && row.status === "pending") {
        const razorpay = await razorpayFromEnv(getEnv);
        if (razorpay) {
            const a = await fetchActivation(razorpay, {
                accountId: row.razorpay_account_id,
                productId: row.razorpay_product_id,
            });
            if (a.activationStatus && a.activationStatus !== row.activation_status) {
                await db
                    .prepare(
                        `UPDATE payout_accounts SET activation_status = ?, activation_note = ?, status = ?,
                         updated_at = datetime('now') WHERE merchant_id = ?`,
                    )
                    .bind(a.activationStatus, a.requirements.join("; ") || null, statusFor(a.activationStatus), merchantId)
                    .run();
                row = await getAccount(db, merchantId);
            }
        }
    }

    // Revenue that would route to the merchant once Route is live (captured, by currency).
    const revenue = await db
        .prepare(
            `SELECT t.currency AS currency, COALESCE(SUM(t.amount), 0) AS total, COUNT(*) AS count
             FROM transactions t JOIN apps a ON t.app_id = a.id
             WHERE a.merchant_id = ? AND t.status = 'captured'
             GROUP BY t.currency`,
        )
        .bind(merchantId)
        .all();

    return NextResponse.json(
        {
            account: view(row),
            routable: revenue.results ?? [],
            platform_commission_bps: PLATFORM_COMMISSION_BPS,
            // The platform owner's products settle directly — no payout connection.
            is_platform_owner: isPlatformMerchant(merchantId),
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function PUT(request: NextRequest) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId, session } = ctx;

    // The platform owner doesn't connect a payout account — its products settle
    // directly to the platform Razorpay account.
    if (isPlatformMerchant(merchantId)) {
        return NextResponse.json(
            {
                error: "platform_owner",
                error_description:
                    "Your products settle directly to the platform account — no payout connection needed.",
            },
            { status: 400 },
        );
    }
    if (needsReauth(session)) return reauth();

    const body: any = await request.json().catch(() => ({}));
    const str = (k: string, max = 120) => String(body[k] ?? "").trim().slice(0, max);
    const beneficiary = str("beneficiary_name");
    const ifsc = str("ifsc", 11).toUpperCase();
    const accountNumber = String(body.account_number || "").replace(/\s/g, "");

    if (beneficiary.length < 4 || !/^[A-Za-z0-9 .]+$/.test(beneficiary)) {
        return NextResponse.json({ error: "missing_beneficiary" }, { status: 400 });
    }
    if (!IFSC_RE.test(ifsc)) {
        return NextResponse.json({ error: "invalid_ifsc" }, { status: 400 });
    }
    if (!/^\d{6,18}$/.test(accountNumber)) {
        return NextResponse.json({ error: "invalid_account_number" }, { status: 400 });
    }

    const razorpay = await razorpayFromEnv(getEnv);
    if (!razorpay) {
        return NextResponse.json({ error: "provider_unconfigured" }, { status: 503 });
    }

    // Only the last 4 of the account number are persisted (display only). The
    // full number, PAN, phone and address go to Razorpay and are never stored.
    const last4 = accountNumber.slice(-4);
    const existing = await getAccount(db, merchantId);
    let result: Awaited<ReturnType<typeof onboardLinkedAccount>>;

    if (existing?.razorpay_account_id && existing.razorpay_product_id) {
        // KYC already submitted: just change the settlement bank account.
        result = await setSettlementAccount(
            razorpay,
            { accountId: existing.razorpay_account_id, productId: existing.razorpay_product_id },
            { accountNumber, ifsc, name: beneficiary },
        );
    } else {
        const phone = str("phone", 15).replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
        const pan = str("pan", 10).toUpperCase();
        const street = str("street", 100);
        const city = str("city", 32);
        const state = str("state", 32);
        const postalCode = str("postal_code", 6);
        const purpose: PayoutPurpose = body.purpose === "selling" ? "selling" : "fundraising";
        if (!PHONE_RE.test(phone)) return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
        if (!PAN_RE.test(pan)) return NextResponse.json({ error: "invalid_pan" }, { status: 400 });
        if (street.length < 10 || city.length < 2 || state.length < 2) {
            return NextResponse.json({ error: "invalid_address" }, { status: 400 });
        }
        if (!PIN_RE.test(postalCode)) return NextResponse.json({ error: "invalid_postal_code" }, { status: 400 });

        const merchant = (await db.prepare("SELECT email FROM merchants WHERE id = ?").bind(merchantId).first()) as {
            email: string | null;
        } | null;
        const email = merchant?.email || session.email;
        if (!email) return NextResponse.json({ error: "missing_email" }, { status: 400 });

        result = await onboardLinkedAccount(
            razorpay,
            { email, phone, name: beneficiary, pan, street, city, state, postalCode, purpose, accountNumber, ifsc },
            {
                accountId: existing?.razorpay_account_id ?? null,
                productId: existing?.razorpay_product_id ?? null,
            },
        );
    }

    if (result.error) console.error("[payouts] onboarding for %s: %s", merchantId, result.error);
    // A failed bank change must not leave the old account looking replaced.
    const bankSaved = !result.error;
    const status = result.activationStatus ? statusFor(result.activationStatus) : "pending";
    const note = result.requirements.join("; ") || null;

    if (existing) {
        await db
            .prepare(
                `UPDATE payout_accounts
                 SET beneficiary_name = ?, bank_ifsc = ?, bank_last4 = ?,
                     razorpay_account_id = ?, razorpay_product_id = ?,
                     activation_status = COALESCE(?, activation_status), activation_note = ?,
                     status = ?, updated_at = datetime('now')
                 WHERE merchant_id = ?`,
            )
            .bind(
                bankSaved ? beneficiary : existing.beneficiary_name,
                bankSaved ? ifsc : existing.bank_ifsc,
                bankSaved ? last4 : existing.bank_last4,
                result.accountId,
                result.productId,
                result.activationStatus,
                note,
                bankSaved ? status : existing.status === "active" ? "active" : "pending",
                merchantId,
            )
            .run();
    } else {
        await db
            .prepare(
                `INSERT INTO payout_accounts
                 (id, merchant_id, provider, razorpay_account_id, razorpay_product_id, beneficiary_name,
                  bank_ifsc, bank_last4, activation_status, activation_note, status)
                 VALUES (?, ?, 'razorpay', ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                newId("payoutAccount"),
                merchantId,
                result.accountId,
                result.productId,
                beneficiary,
                ifsc,
                last4,
                result.activationStatus,
                note,
                status,
            )
            .run();
    }

    return NextResponse.json(
        {
            ok: !result.error,
            account: view(await getAccount(db, merchantId)),
            create_error: result.error,
        },
        { status: result.error ? 422 : 200 },
    );
}

export async function DELETE(request: NextRequest) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { db, merchantId, session } = ctx;
    if (needsReauth(session)) return reauth();
    // Pause instead of forgetting the Razorpay account: reconnecting reuses it
    // (Razorpay won't create a second account for the same person).
    await db
        .prepare("UPDATE payout_accounts SET status = 'disabled', updated_at = datetime('now') WHERE merchant_id = ?")
        .bind(merchantId)
        .run();
    return NextResponse.json({ ok: true });
}
