#!/usr/bin/env node
/**
 * Push Elixpo Mails' paid plans to Elixpo Pay (POST /v1/sync), generated from
 * src/lib/plans.ts so the prices people see and the prices they're charged can
 * never drift. Run after changing a plan price:
 *
 *   ELIXPO_PAY_API_KEY=lix_pay_… npm run pay:sync            # apply
 *   npm run pay:sync -- --dry-run                            # print payload only
 *
 * Optional: ELIXPO_PAY_URL (default https://payouts.elixpo.com),
 *           NEXT_PUBLIC_APP_URL (default https://mails.elixpo.com).
 * Needs Node ≥ 22.18 (imports the .ts plan file with native type stripping).
 */

const { PLANS } = await import("../src/lib/plans.ts");

const dryRun = process.argv.includes("--dry-run");
const site = (process.env.NEXT_PUBLIC_APP_URL || "https://mails.elixpo.com").replace(/\/$/, "");
const payUrl = (process.env.ELIXPO_PAY_URL || "https://payouts.elixpo.com").replace(/\/$/, "");

const toMinor = (major) => Math.round(major * 100);

const products = Object.values(PLANS)
    .filter((p) => p.id === "pro" || p.id === "scale")
    .map((p) => ({
        tier: p.id,
        name: `Elixpo Mails ${p.name}`,
        description: p.blurb,
        prices: ["INR", "USD"].flatMap((currency) => {
            const pr = p.pricing[currency];
            return [
                {
                    nickname: `${currency} monthly`,
                    currency,
                    unit_amount: toMinor(pr.amount),
                    interval: "month",
                    type: "recurring",
                },
                {
                    nickname: `${currency} yearly`,
                    currency,
                    unit_amount: toMinor(pr.yearlyAmount),
                    interval: "year",
                    type: "recurring",
                },
            ];
        }),
    }));

const payload = {
    app: { homepage_url: site, pricing_url: `${site}/pricing` },
    products,
};

if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    process.exit(0);
}

const key = process.env.ELIXPO_PAY_API_KEY;
if (!key) {
    console.error("ELIXPO_PAY_API_KEY is not set (or pass --dry-run).");
    process.exit(1);
}

const res = await fetch(`${payUrl}/v1/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
    console.error(`Sync failed (${res.status}):`, body.error_description || body.error || body);
    process.exit(1);
}
console.log(`Synced ${products.length} plans to ${payUrl}.`);
console.log(JSON.stringify(body, null, 2));
