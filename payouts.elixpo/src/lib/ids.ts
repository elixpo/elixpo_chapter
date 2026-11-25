/**
 * Prefixed opaque ids (Stripe-style) so an id is self-describing in logs.
 */

const PREFIXES = {
    merchant: "mer",
    app: "app",
    providerConnection: "pc",
    product: "prod",
    price: "price",
    customer: "cus",
    checkoutSession: "cs",
    transaction: "txn",
    subscription: "sub",
    entitlement: "ent",
    grant: "grant",
    webhookEndpoint: "whe",
    webhookDelivery: "whd",
    providerWebhookEvent: "pwe",
    ledger: "le",
    ledgerGroup: "leg",
    refund: "rfnd",
    payoutAccount: "pa",
    mailHook: "mhk",
    mailDelivery: "mld",
    fundraiser: "fr",
    contribution: "ctb",
    fundraiserReport: "frr",
} as const;

export type IdKind = keyof typeof PREFIXES;

export function newId(kind: IdKind): string {
    const rand = crypto.randomUUID().replace(/-/g, "");
    return `${PREFIXES[kind]}_${rand}`;
}

/** ISO-8601 UTC timestamp, matching the SQL `datetime('now')` style. */
export function nowIso(): string {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/** ISO timestamp `days` days from now (UTC, second precision). */
export function isoDaysFromNow(days: number): string {
    return new Date(Date.now() + days * 86_400_000)
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
}

/** Parse our SQL-style UTC timestamp ("YYYY-MM-DD HH:MM:SS") or ISO. */
export function parseSqlTime(v: string | null | undefined): Date | null {
    if (!v) return null;
    const d = new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * `from` + N billing intervals, using CALENDAR months/years (like Razorpay's
 * billing cycle) rather than fixed 30/365-day blocks. Clamps month-end
 * overflow (Jan 31 + 1 month → Feb 28/29). Returns the SQL-style string.
 */
export function addInterval(from: Date, interval: string, count = 1): string {
    const n = Math.max(1, count);
    const d = new Date(from.getTime());
    if (interval === "month" || interval === "year") {
        const months = interval === "year" ? 12 * n : n;
        const day = d.getUTCDate();
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() + months);
        const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
        d.setUTCDate(Math.min(day, lastDay));
    } else {
        d.setTime(d.getTime() + (interval === "week" ? 7 : 1) * n * 86_400_000);
    }
    return d.toISOString().replace("T", " ").slice(0, 19);
}
