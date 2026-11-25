/**
 * Razorpay Route split for one-time orders — shared by product checkout and
 * fundraiser contributions.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { isPlatformMerchant, PLATFORM_COMMISSION_BPS } from "./merchant";

/**
 * Build the Razorpay Route `transfers` for an order when the app's merchant has
 * a connected, active payout account. Splits `amount` to their linked account,
 * holding back the platform commission. Returns undefined when there's no active
 * account (→ funds settle to the platform account, unchanged behaviour).
 */
export async function routeTransfers(
    db: D1Database,
    merchantId: string | undefined,
    amount: number,
    currency: string,
    noteTag: string | undefined,
): Promise<Array<Record<string, unknown>> | undefined> {
    // The platform owner's products settle directly to the platform account —
    // never split them.
    if (!merchantId || isPlatformMerchant(merchantId)) return undefined;
    const pa = (await db
        .prepare(
            `SELECT razorpay_account_id
             FROM payout_accounts
             WHERE merchant_id = ? AND status = 'active'
               AND razorpay_account_id IS NOT NULL`,
        )
        .bind(merchantId)
        .first()) as { razorpay_account_id: string } | null;
    if (!pa?.razorpay_account_id) return undefined;

    // Platform commission is set by us (hardcoded), never by the merchant.
    const commission = Math.round((amount * PLATFORM_COMMISSION_BPS) / 10000);
    const transferAmount = amount - commission;
    if (transferAmount <= 0) return undefined; // commission ≥ amount → keep it all

    return [
        {
            account: pa.razorpay_account_id,
            amount: transferAmount,
            currency,
            notes: noteTag ? { app: noteTag } : {},
        },
    ];
}
