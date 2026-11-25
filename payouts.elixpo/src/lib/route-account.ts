/**
 * Whether a merchant's payments are split via Razorpay Route — i.e. they have an
 * active linked payout account. Same rule as routeTransfers() in
 * ./route-transfers: the platform merchant is never split.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { isPlatformMerchant } from "./merchant";

export async function hasActiveRouteAccount(
    db: D1Database,
    merchantId: string | null | undefined,
): Promise<boolean> {
    if (!merchantId || isPlatformMerchant(merchantId)) return false;
    const row = await db
        .prepare(
            `SELECT 1 AS ok
             FROM payout_accounts
             WHERE merchant_id = ? AND status = 'active'
               AND razorpay_account_id IS NOT NULL
             LIMIT 1`,
        )
        .bind(merchantId)
        .first();
    return !!row;
}
