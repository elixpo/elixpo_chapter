/**
 * Refunds / disputes end-to-end check — run with `npm run test:e2e`.
 *
 * Drives the REAL Razorpay webhook handler against an in-memory SQLite "D1"
 * with every migration applied. Razorpay's transfer API and the consuming
 * app's webhook receiver are stubbed in-process; nothing leaves the machine.
 *
 * Bundled + executed by scripts/e2e.mjs (needs Node >= 22.13 for node:sqlite).
 */
import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const ROOT = process.cwd();

for (const k of Object.keys(process.env)) {
    if (/^(CLOUDFLARE_|RAZORPAY_|PAY_MAILS_|FUNDRAISER_)/.test(k)) delete process.env[k];
}

// ── Network stubs ─────────────────────────────────────────────────────────
// Razorpay Route: one transfer of 45000 on pay_RT1 (90% of 50000).
const transfers: Record<string, { id: string; amount: number; amount_reversed: number; status: string }[]> = {
    pay_RT1: [{ id: "trf_RT1", amount: 45000, amount_reversed: 0, status: "processed" }],
};
const reversals: { id: string; amount: number }[] = [];
const appDeliveries: any[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    let m = /api\.razorpay\.com\/v1\/payments\/([^/]+)\/transfers$/.exec(url);
    if (m) {
        const items = transfers[decodeURIComponent(m[1])] ?? [];
        return json({ entity: "collection", count: items.length, items });
    }
    m = /api\.razorpay\.com\/v1\/transfers\/([^/]+)\/reversals$/.exec(url);
    if (m) {
        const id = decodeURIComponent(m[1]);
        const amount = Number(JSON.parse(String(init?.body || "{}")).amount);
        const t = Object.values(transfers).flat().find((x) => x.id === id);
        if (!t || t.amount_reversed + amount > t.amount) return json({ error: { description: "too much" } }, 400);
        t.amount_reversed += amount;
        reversals.push({ id, amount });
        return json({ id: `rvrsl_${reversals.length}`, amount, transfer_id: id });
    }
    if (url.startsWith("https://blogs.elixpo.com/")) {
        appDeliveries.push(JSON.parse(String(init?.body || "{}")));
        return json({ ok: true });
    }
    throw new Error(`unexpected network call in test: ${url}`);
}) as typeof fetch;

// ── D1 shim ────────────────────────────────────────────────────────────────
const sqlite = new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys = ON");
const norm = (vals: unknown[]) => vals.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v));
function stmt(sql: string, vals: unknown[] = []) {
    return {
        bind: (...v: unknown[]) => stmt(sql, v),
        first: async () => (sqlite.prepare(sql).get(...(norm(vals) as any[])) as any) ?? null,
        all: async () => ({ results: sqlite.prepare(sql).all(...(norm(vals) as any[])) }),
        run: async () => {
            const r = sqlite.prepare(sql).run(...(norm(vals) as any[]));
            return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
        },
        _exec: () => sqlite.prepare(sql).run(...(norm(vals) as any[])),
    };
}
const D1 = {
    prepare: (sql: string) => stmt(sql),
    batch: async (list: any[]) => list.map((s) => s._exec()),
};
const migDir = `${ROOT}/src/workers/migrations`;
for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migDir}/${f}`, "utf8"));
}

Object.assign(process.env, {
    ENVIRONMENT: "development",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    RAZORPAY_KEY_ID: "rzp_test_x",
    RAZORPAY_KEY_SECRET: "keysecret",
    RAZORPAY_WEBHOOK_SECRET: "whsecret",
    ELIXPO_PAY_WEBHOOK_SECRET: "app_webhook_secret_for_tests",
    FUNDRAISER_USD_INR_RATE: "90",
});
Object.defineProperty(process, "env", { value: { ...process.env, DB: D1 }, writable: true, configurable: true });

const { NextRequest } = await import("next/server");
const webhook = await import("../../app/api/webhooks/razorpay/route.ts");
const pub = await import("../../app/api/fundraisers/[slug]/route.ts");
const { testPaymentsAllowed, PRODUCTION_D1_ID } = await import("../../src/lib/env.ts");

let failures = 0;
const ok = (cond: unknown, label: string, extra?: unknown) => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${label}${!cond && extra !== undefined ? `  → ${JSON.stringify(extra)}` : ""}`);
    if (!cond) failures++;
};
async function call(handler: any, method: string, path: string, opts: { params?: any; headers?: Record<string, string>; raw?: string } = {}) {
    const req = new NextRequest(`http://localhost:3000${path}`, {
        method,
        headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
        body: opts.raw,
    });
    const res: Response = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
    const text = await res.text();
    let json: any = null;
    try {
        json = JSON.parse(text);
    } catch {
        json = text;
    }
    return { status: res.status, json };
}
function hook(body: unknown, eventId: string) {
    const raw = JSON.stringify(body);
    const sig = createHmac("sha256", "whsecret").update(raw).digest("hex");
    return call(webhook.POST, "POST", "/api/webhooks/razorpay", { raw, headers: { "x-razorpay-signature": sig, "x-razorpay-event-id": eventId } });
}
const refundEvt = (paymentId: string, refundId: string, amount: number, paymentAmount: number, totalRefunded: number) => ({
    event: "refund.processed",
    payload: {
        refund: { entity: { id: refundId, payment_id: paymentId, amount, currency: "INR", status: "processed" } },
        payment: {
            entity: {
                id: paymentId,
                amount: paymentAmount,
                currency: "INR",
                amount_refunded: totalRefunded,
                refund_status: totalRefunded >= paymentAmount ? "full" : "partial",
                status: totalRefunded >= paymentAmount ? "refunded" : "captured",
            },
        },
    },
});

// ── Seed: a live fundraiser with three paid contributions ─────────────────
sqlite.exec(`INSERT INTO fundraisers (id, merchant_id, owner_uid, slug, title, goal_amount, presets_json, status, published_at)
              VALUES ('fr_t', 'mer_elixpo', 'uid_owner', 'refund-test', 'Refund test', 1000000, '{}', 'live', datetime('now'))`);
const addCtb = (id: string, amount: number, pay: string) =>
    sqlite
        .prepare(
            `INSERT INTO contributions (id, fundraiser_id, amount, currency, provider_order_id, provider_payment_id, status, paid_at, thanks_email_status)
             VALUES (?, 'fr_t', ?, 'INR', ?, ?, 'paid', datetime('now'), 'sent')`,
        )
        .run(id, amount, `order_${pay}`, pay);
addCtb("ctb_a", 25000, "pay_A");
addCtb("ctb_b", 50000, "pay_RT1");
addCtb("ctb_c", 10000, "pay_C");
const total = async () => (await call(pub.GET, "GET", "/api/fundraisers/refund-test", { params: { slug: "refund-test" } })).json;

let page = await total();
ok(page.raised === 85000 && page.contributors === 3, "seeded total: 3 paid contributions", page);

// ── 1. Full refund flips the contribution and drops the public total ─────
let r = await hook(refundEvt("pay_A", "rfnd_A1", 25000, 25000, 25000), "evt_ref_1");
ok(r.status === 200 && r.json.contribution === "ctb_a" && r.json.refunded === true, "refund.processed marks the contribution refunded", r.json);
ok((sqlite.prepare("SELECT status FROM contributions WHERE id = 'ctb_a'").get() as any).status === "refunded", "contribution row is 'refunded'");
page = await total();
ok(page.raised === 60000 && page.contributors === 2, "public total drops by the refunded amount", page);

// ── 2. Replays are no-ops ─────────────────────────────────────────────────
r = await hook(refundEvt("pay_A", "rfnd_A1", 25000, 25000, 25000), "evt_ref_1");
ok(r.json.duplicate === true, "replayed refund (same event id) is ignored", r.json);
r = await hook(refundEvt("pay_A", "rfnd_A1", 25000, 25000, 25000), "evt_ref_1_redelivered");
ok(r.status === 200 && r.json.refunded === false, "same refund under a new event id changes nothing", r.json);
page = await total();
ok(page.raised === 60000 && page.contributors === 2, "total unchanged after replays", page);

// ── 3. Partial refund on a Route payment: reversed proportionally ─────────
r = await hook(refundEvt("pay_RT1", "rfnd_RT1a", 10000, 50000, 10000), "evt_ref_2");
ok(r.json.partial === true && r.json.refunded === false, "partial refund keeps the contribution paid", r.json);
ok(reversals.length === 1 && reversals[0].amount === 9000, "transfer reversed in proportion (20% of 45000)", reversals);
r = await hook(refundEvt("pay_RT1", "rfnd_RT1a", 10000, 50000, 10000), "evt_ref_2_redelivered");
ok(reversals.length === 1, "re-delivered partial refund doesn't reverse twice", reversals);
r = await hook(refundEvt("pay_RT1", "rfnd_RT1b", 40000, 50000, 50000), "evt_ref_3");
ok(r.json.refunded === true, "the remaining refund completes it", r.json);
ok(reversals.length === 2 && reversals[1].amount === 36000 && transfers.pay_RT1[0].amount_reversed === 45000, "rest of the transfer reversed, capped at the transfer", reversals);
page = await total();
ok(page.raised === 10000 && page.contributors === 1, "public total after the Route refund", page);

// ── 4. Lost dispute ───────────────────────────────────────────────────────
r = await hook({ event: "payment.dispute.created", payload: { payment: { entity: { id: "pay_C", amount: 10000, currency: "INR" } }, dispute: { entity: { id: "disp_C", payment_id: "pay_C", amount: 10000, currency: "INR" } } } }, "evt_disp_1");
ok(r.json.dispute === "created", "dispute.created is acknowledged only", r.json);
ok((sqlite.prepare("SELECT status FROM contributions WHERE id = 'ctb_c'").get() as any).status === "paid", "an open dispute doesn't change the contribution");
r = await hook({ event: "payment.dispute.lost", payload: { payment: { entity: { id: "pay_C", amount: 10000, currency: "INR", amount_refunded: 0 } }, dispute: { entity: { id: "disp_C", payment_id: "pay_C", amount: 10000, currency: "INR", status: "lost" } } } }, "evt_disp_2");
ok(r.json.refunded === true && (await total()).raised === 0, "lost dispute removes the contribution from the total", r.json);

// ── 5. Product purchase: transaction refunded, one-time access revoked ────
sqlite.exec(`INSERT INTO customers (id, app_id, external_uid) VALUES ('cus_t', 'app_lixblogs', 'uid_buyer')`);
sqlite.exec(`INSERT INTO subscriptions (id, app_id, customer_id, tier, status, billing_mode, current_period_end)
             VALUES ('sub_t', 'app_lixblogs', 'cus_t', 'member', 'active', 'one_time', datetime('now', '+30 days'))`);
sqlite.exec(`INSERT INTO transactions (id, app_id, customer_id, provider, provider_order_id, provider_payment_id, currency, amount, status)
             VALUES ('txn_t', 'app_lixblogs', 'cus_t', 'razorpay', 'order_P', 'pay_P', 'INR', 19900, 'captured')`);
sqlite.exec(`INSERT INTO entitlements (id, app_id, external_uid, customer_id, subscription_id, tier, status, expires_at, version)
             VALUES ('ent_t', 'app_lixblogs', 'uid_buyer', 'cus_t', 'sub_t', 'member', 'active', datetime('now', '+30 days'), 1)`);
sqlite.exec(`INSERT INTO grants (id, entitlement_id, app_id, external_uid, transaction_id, subscription_id, tier, action)
             VALUES ('grant_t', 'ent_t', 'app_lixblogs', 'uid_buyer', 'txn_t', 'sub_t', 'member', 'granted')`);
r = await hook(refundEvt("pay_P", "rfnd_P", 19900, 19900, 19900), "evt_ref_p");
ok(r.json.transaction === "txn_t" && r.json.refunded === true && r.json.entitlement === "revoked", "product refund revokes one-time access", r.json);
const txn = sqlite.prepare("SELECT status FROM transactions WHERE id = 'txn_t'").get() as any;
const ent = sqlite.prepare("SELECT status, version FROM entitlements WHERE id = 'ent_t'").get() as any;
const rf = sqlite.prepare("SELECT COUNT(*) n FROM refunds WHERE transaction_id = 'txn_t'").get() as any;
ok(txn.status === "refunded" && ent.status === "revoked" && ent.version === 2 && rf.n === 1, "transaction refunded, entitlement revoked, refund recorded", { txn, ent, rf });
ok(appDeliveries.some((d) => JSON.stringify(d).includes("uid_buyer") && JSON.stringify(d).includes('"active":false')), "entitlement.updated (active:false) sent to the app", appDeliveries);
const sent = appDeliveries.length;
r = await hook(refundEvt("pay_P", "rfnd_P", 19900, 19900, 19900), "evt_ref_p_redelivered");
const rf2 = sqlite.prepare("SELECT COUNT(*) n FROM refunds WHERE transaction_id = 'txn_t'").get() as any;
ok(r.json.refunded === false && rf2.n === 1 && appDeliveries.length === sent, "replayed product refund is a no-op", { json: r.json, rf2, sent: appDeliveries.length });

// ── 6. Test payments are never allowed against the production D1 ─────────
ok((await testPaymentsAllowed()) === true, "test payments allowed in development");
(process.env as any).CLOUDFLARE_DATABASE_ID = PRODUCTION_D1_ID;
ok((await testPaymentsAllowed()) === false, "test payments refused when CLOUDFLARE_DATABASE_ID is production");
delete (process.env as any).CLOUDFLARE_DATABASE_ID;

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll refund checks passed.");
process.exit(failures ? 1 : 0);
