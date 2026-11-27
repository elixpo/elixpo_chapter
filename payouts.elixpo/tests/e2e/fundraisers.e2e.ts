/**
 * Fundraisers end-to-end check (issue #60) — run with `npm run test:e2e`.
 *
 * Drives the REAL route handlers against an in-memory SQLite "D1" with every
 * migration applied, a local fake Elixpo Mails endpoint that verifies
 * signatures, and stubbed FX sources. It never touches a real database, KV,
 * Razorpay, Mails or FX API: any CLOUDFLARE_* / RAZORPAY_* / PAY_MAILS_*
 * variables in the environment are removed before the app code loads.
 *
 * Bundled + executed by scripts/e2e.mjs (needs Node ≥ 22.13 for node:sqlite).
 */
import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";

// The runner (scripts/e2e.mjs) executes from the repository root.
const ROOT = process.cwd();

// ── Isolation: never let a local shell's real credentials leak in ─────────
for (const k of Object.keys(process.env)) {
    if (/^(CLOUDFLARE_|RAZORPAY_|PAY_MAILS_|FUNDRAISER_)/.test(k)) delete process.env[k];
}

// ── FX stub: deterministic rates; "down" exercises the fallback chain ────
let fxMode: "down" | "up" = "down";
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (/api\.frankfurter\.dev|open\.er-api\.com/.test(url)) {
        if (fxMode === "down") throw new Error("fx source down (stub)");
        if (url.includes("frankfurter")) {
            return new Response(JSON.stringify({ amount: 1, base: "USD", date: "2026-11-17", rates: { INR: 93.5 } }), {
                headers: { "content-type": "application/json" },
            });
        }
    }
    // Stub image host for the cover-image checks.
    if (url.startsWith("https://img.example.com/")) {
        if (url.endsWith("/ok.png")) return new Response("png", { status: 200, headers: { "content-type": "image/png", "content-length": "3" } });
        if (url.endsWith("/page.html")) return new Response("<html>", { status: 200, headers: { "content-type": "text/html" } });
        if (url.endsWith("/redirect.png")) {
            const r = new Response("x", { status: 200, headers: { "content-type": "image/png" } });
            Object.defineProperty(r, "url", { value: "https://10.0.0.5/x.png" });
            return r;
        }
        return new Response("nope", { status: 404, headers: { "content-type": "text/plain" } });
    }
    return realFetch(input, init);
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
    batch: async (list: any[]) => {
        sqlite.exec("BEGIN");
        try {
            const out = list.map((s) => s._exec());
            sqlite.exec("COMMIT");
            return out;
        } catch (e) {
            sqlite.exec("ROLLBACK");
            throw e;
        }
    },
};
const migDir = `${ROOT}/src/workers/migrations`;
for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migDir}/${f}`, "utf8"));
}

// ── Fake Elixpo Mails (verifies the signature like the real /v1/hooks) ────
const MAIL_SECRET = "mails_test_secret_0123456789abcdef";
const mails: { hook: string; body: any; sigOk: boolean }[] = [];
const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
        const h = String(req.headers["x-elixpo-signature"] || "");
        const t = /t=(\d+)/.exec(h)?.[1];
        const v1 = /v1=([0-9a-f]+)/.exec(h)?.[1];
        const sigOk = !!t && v1 === createHmac("sha256", MAIL_SECRET).update(`${t}.${raw}`).digest("hex");
        mails.push({ hook: req.url || "", body: JSON.parse(raw || "{}"), sigOk });
        res.writeHead(sigOk ? 200 : 401, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: sigOk, id: `dlv_${mails.length}`, status: sigOk ? "sent" : "failed" }));
    });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const port = (server.address() as any).port;

Object.assign(process.env, {
    ENVIRONMENT: "development",
    ELIXPO_PAY_SESSION_SECRET: "session_secret_for_tests_only_0123456789",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    PAY_MAILS_SIGNING_SECRET: MAIL_SECRET,
    PAY_MAILS_HOOK_FUNDRAISER_THANK_YOU: `http://127.0.0.1:${port}/v1/hooks/thanks`,
    PAY_MAILS_HOOK_FUNDRAISER_NEW_CONTRIBUTION: `http://127.0.0.1:${port}/v1/hooks/owner`,
    PAY_MAILS_HOOK_FUNDRAISER_REPORT: `http://127.0.0.1:${port}/v1/hooks/report`,
});
// process.env stringifies values; use a plain object so d1-client can read the shim.
Object.defineProperty(process, "env", { value: { ...process.env, DB: D1 }, writable: true, configurable: true });

// ── App code (imported after env is ready) ────────────────────────────────
const { NextRequest } = await import("next/server");
const { signSession } = await import("../../src/lib/session.ts");
const { renderMarkdown } = await import("../../src/lib/markdown.ts");
const dash = await import("../../app/api/dashboard/fundraisers/route.ts");
const dashOne = await import("../../app/api/dashboard/fundraisers/[id]/route.ts");
const dashCtb = await import("../../app/api/dashboard/fundraisers/[id]/contributions/route.ts");
const pub = await import("../../app/api/fundraisers/[slug]/route.ts");
const contribute = await import("../../app/api/fundraisers/[slug]/contribute/route.ts");
const confirm = await import("../../app/api/fundraisers/contributions/[id]/route.ts");
const report = await import("../../app/api/fundraisers/[slug]/report/route.ts");
const moderation = await import("../../app/api/dashboard/moderation/route.ts");
const webhook = await import("../../app/api/webhooks/razorpay/route.ts");

// ── Helpers ────────────────────────────────────────────────────────────────
let failures = 0;
const ok = (cond: unknown, label: string, extra?: unknown) => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${label}${!cond && extra !== undefined ? `  → ${JSON.stringify(extra)}` : ""}`);
    if (!cond) failures++;
};
const base = "http://localhost:3000";
async function call(handler: any, method: string, path: string, opts: { body?: unknown; cookie?: string; params?: any; headers?: Record<string, string>; raw?: string } = {}) {
    const req = new NextRequest(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json", ...(opts.cookie ? { cookie: `pay_session=${opts.cookie}` } : {}), ...(opts.headers ?? {}) },
        body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
    const res: Response = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
    const text = await res.text();
    let json: any = null;
    try {
        json = JSON.parse(text);
    } catch {
        json = text;
    }
    return { status: res.status, json, headers: res.headers };
}

// Seed: the platform owner (mer_elixpo, from 0002) and a third-party creator.
sqlite.exec("UPDATE merchants SET owner_uid = 'uid_owner', email = 'owner@elixpo.test' WHERE id = 'mer_elixpo'");
sqlite.exec("INSERT INTO merchants (id, name, email, status, owner_uid) VALUES ('mer_other', 'Other', 'other@x.test', 'active', 'uid_other')");
const ownerCookie = await signSession({ uid: "uid_owner", email: "owner@elixpo.test", name: "Ayushman", avatar: null, merchantId: "mer_elixpo" });
const otherCookie = await signSession({ uid: "uid_other", email: "other@x.test", name: "Other", avatar: null, merchantId: "mer_other" });

// ── 0. Live FX rate: fallback chain, then live ────────────────────────────
const { getUsdInrRate } = await import("../../src/lib/fx");
process.env.FUNDRAISER_USD_INR_RATE = "90";
let fx = await getUsdInrRate();
ok(fx.source === "env" && fx.rate === 90, "FX sources down → configured fallback rate", fx);
delete process.env.FUNDRAISER_USD_INR_RATE;
fx = await getUsdInrRate();
ok(fx.source === "default" && fx.rate === 85, "FX sources down + no config → built-in default", fx);
fxMode = "up";
fx = await getUsdInrRate();
ok(fx.source === "frankfurter" && fx.rate === 93.5 && fx.as_of === "2026-11-17", "live FX rate from the primary source", fx);

// ── 1. Create + publish gating ─────────────────────────────────────────────
let r = await call(dash.POST, "POST", "/api/dashboard/fundraisers", {
    cookie: ownerCookie,
    body: { title: "Build the first Falera badge boards", body_md: "# Why\nWe need **parts**.\n<script>alert(1)</script>", goal_amount: 800000, presets: { INR: [10000, 25000, 50000, 100000], USD: [500, 1000] }, thank_you_message: "Thank you for backing Falera!" },
});
ok(r.status === 201 && r.json.fundraiser.status === "draft", "creator creates a draft", r.json);
const f = r.json.fundraiser;
ok(f.slug === "build-the-first-falera-badge-boards", "slug derived from the title", f.slug);

r = await call(pub.GET, "GET", `/api/fundraisers/${f.slug}`, { params: { slug: f.slug } });
ok(r.status === 404, "draft is not public");

r = await call(dash.POST, "POST", "/api/dashboard/fundraisers", { cookie: otherCookie, body: { title: "Other fund", goal_amount: 50000 } });
const other = r.json.fundraiser;
r = await call(dashOne.PATCH, "PATCH", `/api/dashboard/fundraisers/${other.id}`, { cookie: otherCookie, params: { id: other.id }, body: { action: "publish" } });
ok(r.status === 409 && r.json.error === "payouts_required", "creator without connected payouts can't publish", r.json);

r = await call(dashOne.PATCH, "PATCH", `/api/dashboard/fundraisers/${f.id}`, { cookie: otherCookie, params: { id: f.id }, body: { title: "hijack" } });
ok(r.status === 404, "another merchant can't edit someone else's fundraiser");

r = await call(dash.POST, "POST", "/api/dashboard/fundraisers", { cookie: otherCookie, body: { title: "Dup", slug: f.slug, goal_amount: 50000 } });
ok(r.status === 409 && r.json.error === "slug_taken", "slug collisions are rejected", r.json);

r = await call(dashOne.PATCH, "PATCH", `/api/dashboard/fundraisers/${f.id}`, { cookie: ownerCookie, params: { id: f.id }, body: { action: "publish" } });
ok(r.status === 200 && r.json.fundraiser.status === "live", "platform owner publishes (payout-ready)", r.json);

r = await call(dashOne.PATCH, "PATCH", `/api/dashboard/fundraisers/${f.id}`, { cookie: ownerCookie, params: { id: f.id }, body: { slug: "new-link" } });
ok(r.status === 409 && r.json.error === "slug_locked", "published link can't change", r.json);

r = await call(pub.GET, "GET", `/api/fundraisers/${f.slug}`, { params: { slug: f.slug } });
ok(r.status === 200 && r.json.accepts_payments === true && r.json.owner.verified === true, "public page is live and verified", r.json);
ok(!JSON.stringify(r.json).includes("mer_elixpo") && !JSON.stringify(r.json).includes("uid_owner"), "public view leaks no internal ids");
ok(/s-maxage=10/.test(r.headers.get("cache-control") || ""), "public read is edge-cacheable");

// ── 2. Contributions (test mode: no Razorpay configured) ──────────────────
r = await call(contribute.POST, "POST", `/api/fundraisers/${f.slug}/contribute`, { params: { slug: f.slug }, body: { currency: "INR", amount: 500, email: "a@x.test" } });
ok(r.status === 400 && r.json.error === "invalid_amount", "below-minimum amount rejected", r.json);
r = await call(contribute.POST, "POST", `/api/fundraisers/${f.slug}/contribute`, { params: { slug: f.slug }, body: { currency: "INR", amount: 25000, email: "nope" } });
ok(r.status === 400 && r.json.error === "invalid_email", "missing receipt email rejected", r.json);

r = await call(contribute.POST, "POST", `/api/fundraisers/${f.slug}/contribute`, {
    params: { slug: f.slug },
    body: { currency: "INR", amount: 25000, email: "asha@x.test", name: "Asha", show_name: true, message: "=HYPERLINK(\"http://evil\")" },
});
ok(r.status === 200 && r.json.test_mode === true && r.json.amount === 25000, "INR contribution starts (test mode)", r.json);
const c1 = r.json.contribution_id;
r = await call(confirm.POST, "POST", `/api/fundraisers/contributions/${c1}`, { params: { id: c1 }, body: { test: true } });
ok(r.json.status === "paid", "test contribution confirmed", r.json);
r = await call(confirm.POST, "POST", `/api/fundraisers/contributions/${c1}`, { params: { id: c1 }, body: { test: true } });
ok(r.json.status === "paid", "second confirm is a no-op");

r = await call(contribute.POST, "POST", `/api/fundraisers/${f.slug}/contribute`, { params: { slug: f.slug }, body: { currency: "USD", amount: 1000, email: "bob@x.test", name: "Bob", show_name: false } });
const c2 = r.json.contribution_id;
const fxRow = sqlite.prepare("SELECT fx_rate, amount FROM contributions WHERE id = ?").get(c2) as any;
const usdCharge = Math.round(10 * fxRow.fx_rate) * 100;
ok(fxRow.fx_rate > 50 && fxRow.fx_rate < 200 && r.json.amount === usdCharge, `$10 charged at the live rate (₹${fxRow.fx_rate}/$) = ₹${usdCharge / 100}`, { fxRow, amount: r.json.amount });
await call(confirm.POST, "POST", `/api/fundraisers/contributions/${c2}`, { params: { id: c2 }, body: { test: true } });

r = await call(pub.GET, "GET", `/api/fundraisers/${f.slug}`, { params: { slug: f.slug } });
ok(r.json.raised === 25000 + usdCharge && r.json.contributors === 2 && r.json.usd_inr_as_of, "total = ₹250 + USD charge; page shows rate date", { raised: r.json.raised, n: r.json.contributors });
ok(r.json.supporters.some((s: any) => s.name === "Asha") && r.json.supporters.some((s: any) => s.name === "Anonymous"), "supporters: shown name + Anonymous", r.json.supporters);

// Display name overrides the account name publicly.
r = await call(dashOne.PATCH, "PATCH", `/api/dashboard/fundraisers/${f.id}`, { cookie: ownerCookie, params: { id: f.id }, body: { display_name: "  Falera   Badge Project " } });
ok(r.json.fundraiser.display_name === "Falera Badge Project", "display name saved (whitespace tidied)", r.json.fundraiser?.display_name);
r = await call(pub.GET, "GET", `/api/fundraisers/${f.slug}`, { params: { slug: f.slug } });
ok(r.json.owner.name === "Falera Badge Project", "public page shows the display name", r.json.owner);
r = await call(dashOne.PATCH, "PATCH", `/api/dashboard/fundraisers/${f.id}`, { cookie: ownerCookie, params: { id: f.id }, body: { display_name: "x".repeat(81) } });
ok(r.status === 400, "display name over 80 chars rejected", r.json);
r = await call(contribute.POST, "POST", `/api/fundraisers/${f.slug}/contribute`, { params: { slug: f.slug }, body: { currency: "INR", amount: 25000, email: "a@b" } });
ok(r.status === 400 && r.json.error === "invalid_email", "email without a real domain rejected", r.json);

const thanks = mails.filter((m) => m.hook.endsWith("/thanks"));
const owner = mails.filter((m) => m.hook.endsWith("/owner"));
ok(thanks.length === 2 && owner.length === 2, "1 thank-you + 1 owner email per contribution", mails.map((m) => m.hook));
ok(mails.every((m) => m.sigOk), "every Mails trigger is correctly signed");
ok(thanks[0].body.to === "asha@x.test" && thanks[0].body.variables.thank_you_message === "Thank you for backing Falera!", "thank-you email has recipient + message", thanks[0].body);
ok(owner[0].body.to === "owner@elixpo.test" && owner[1].body.variables.total_raised.startsWith("₹"), "owner alert has running total", owner[1]?.body?.variables);
const st = sqlite.prepare("SELECT thanks_email_status s FROM contributions WHERE id = ?").get(c1) as any;
ok(st.s === "sent", "email outcome recorded on the contribution", st);

// ── 3. Razorpay webhook: authoritative, idempotent ────────────────────────
Object.assign(process.env, { RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "keysecret", RAZORPAY_WEBHOOK_SECRET: "whsecret" });
sqlite.prepare("INSERT INTO contributions (id, fundraiser_id, amount, currency, display_amount, display_currency, email, provider_order_id) VALUES ('ctb_webhook', ?, 50000, 'INR', 50000, 'INR', 'w@x.test', 'order_WEB1')").run(f.id);
const evt = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_WEB1", order_id: "order_WEB1", amount: 50000, currency: "INR", status: "captured" } } } });
const sig = createHmac("sha256", "whsecret").update(evt).digest("hex");
const hook = (eventId: string) =>
    call(webhook.POST, "POST", "/api/webhooks/razorpay", { raw: evt, headers: { "x-razorpay-signature": sig, "x-razorpay-event-id": eventId } });
r = await hook("evt_1");
ok(r.status === 200 && r.json.counted === true, "webhook marks the contribution paid", r.json);
r = await hook("evt_1");
ok(r.json.duplicate === true, "replayed webhook (same event id) is ignored", r.json);
r = await hook("evt_2");
ok(r.json.counted === false, "duplicate webhook (new event id, same payment) doesn't count twice", r.json);
r = await call(webhook.POST, "POST", "/api/webhooks/razorpay", { raw: evt, headers: { "x-razorpay-signature": "bad", "x-razorpay-event-id": "evt_3" } });
ok(r.status === 401, "bad webhook signature rejected");
r = await call(pub.GET, "GET", `/api/fundraisers/${f.slug}`, { params: { slug: f.slug } });
ok(r.json.raised === 75000 + usdCharge && r.json.contributors === 3, "total counts the webhook payment exactly once", { raised: r.json.raised });
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;

// ── 4. Dashboard: contributions + CSV ─────────────────────────────────────
r = await call(dashCtb.GET, "GET", `/api/dashboard/fundraisers/${f.id}/contributions`, { cookie: ownerCookie, params: { id: f.id } });
ok(r.json.contributions.length === 3 && !JSON.stringify(r.json).includes("asha@x.test"), "owner sees 3 contributions, never contributor emails", r.json);
r = await call(dashCtb.GET, "GET", `/api/dashboard/fundraisers/${f.id}/contributions?format=csv`, { cookie: ownerCookie, params: { id: f.id } });
ok(typeof r.json === "string" && r.json.includes(`"'=HYPERLINK`) && /text\/csv/.test(r.headers.get("content-type") || ""), "CSV export, formula injection neutralised", r.json);
r = await call(dashCtb.GET, "GET", `/api/dashboard/fundraisers/${f.id}/contributions`, { cookie: otherCookie, params: { id: f.id } });
ok(r.status === 404, "another merchant can't read the contributions");

// ── 4a. Form validation: presets, links, cover image (server-side) ───────
const mk = (extra: Record<string, unknown>) =>
    call(dash.POST, "POST", "/api/dashboard/fundraisers", { cookie: ownerCookie, body: { title: "Validation fund", goal_amount: 50000, ...extra } });
r = await mk({ presets: { INR: [10050.5], USD: [500] } });
ok(r.status === 400 && /whole amounts/.test(r.json.error_description), "fractional preset rejected", r.json);
r = await mk({ presets: { INR: [500], USD: [500] } });
ok(r.status === 400 && /between/.test(r.json.error_description), "out-of-range ₹ preset rejected (₹5 < ₹10)", r.json);
r = await mk({ presets: { INR: [1000, 2000, 3000, 4000, 5000, 6000, 7000], USD: [500] } });
ok(r.status === 400 && /at most 6/.test(r.json.error_description), "more than 6 presets rejected", r.json);
r = await mk({ presets: { INR: [], USD: [500] } });
ok(r.status === 400 && /at least one/.test(r.json.error_description), "empty preset list rejected", r.json);
for (const bad of ["http://github.com/x", "https://localhost/x", "https://192.168.1.4/x", "https://user:pw@github.com/x", "javascript:alert(1)"]) {
    r = await mk({ link_url: bad });
    ok(r.status === 400, `unsafe link rejected: ${bad}`, r.json);
}
r = await mk({ link_url: "https://" });
ok(r.status === 201 && r.json.fundraiser.link_url === null, "untouched https:// prefill means no link", r.json);
r = await mk({ cover_url: "https://img.example.com/missing.png" });
ok(r.status === 400 && /404/.test(r.json.error_description), "cover image 404 rejected", r.json);
r = await mk({ cover_url: "https://img.example.com/page.html" });
ok(r.status === 400 && /isn't an image/.test(r.json.error_description), "cover link that isn't an image rejected", r.json);
r = await mk({ cover_url: "https://img.example.com/redirect.png" });
ok(r.status === 400 && /redirects/.test(r.json.error_description), "cover redirect to a private address rejected", r.json);
r = await mk({ slug: "covers-many", cover_urls: ["https://img.example.com/ok.png", "https://img.example.com/two/ok.png", "https://"], cover_autoplay: false });
ok(r.status === 201 && r.json.fundraiser.covers.length === 2 && r.json.fundraiser.cover_autoplay === false && r.json.fundraiser.cover_url === "https://img.example.com/ok.png",
    "multiple covers saved (blank prefill dropped), autoplay off, first is the main cover", r.json);
r = await mk({ slug: "covers-too-many", cover_urls: Array.from({ length: 7 }, (_, i) => `https://img.example.com/ok.png?${i}`) });
ok(r.status === 400 && /at most 6/.test(r.json.error_description), "more than 6 covers rejected", r.json);
r = await mk({ slug: "covers-bad", cover_urls: ["https://img.example.com/ok.png", "http://img.example.com/x.png"] });
ok(r.status === 400, "an unsafe link in the cover list is rejected", r.json);
r = await mk({ slug: "covers-404", cover_urls: ["https://img.example.com/ok.png", "https://img.example.com/missing.png"] });
ok(r.status === 400 && /Cover image 2/.test(r.json.error_description), "a missing cover is reported by position", r.json);
r = await mk({ slug: "validation-cover", cover_url: "https://img.example.com/ok.png", presets: { INR: [25000, 10000, 10000], USD: [1000] } });
ok(r.status === 201 && r.json.fundraiser.cover_url === "https://img.example.com/ok.png" && r.json.fundraiser.presets.INR.join() === "10000,25000",
    "valid cover accepted; presets de-duplicated and sorted", r.json);

// ── 4b. Email injection: user text can't put markup into an Elixpo email ──
const before = mails.length;
r = await call(contribute.POST, "POST", `/api/fundraisers/${f.slug}/contribute`, {
    params: { slug: f.slug },
    body: { currency: "INR", amount: 10000, email: "m@x.test", name: '<b>Mallory</b>', show_name: true, message: 'Hi <a href="https://evil.test">claim</a>\nline 2' },
});
await call(confirm.POST, "POST", `/api/fundraisers/contributions/${r.json.contribution_id}`, { params: { id: r.json.contribution_id }, body: { test: true } });
const injected = mails.slice(before);
const plainVals = injected.flatMap((m) => Object.entries(m.body.variables).filter(([k]) => !k.endsWith("_html")).map(([, v]) => String(v)));
ok(injected.length === 2 && plainVals.every((v) => !/[<>"]/.test(v)), "plain variables carry no markup characters", plainVals);
const ownerMsg = injected.find((m) => m.hook.endsWith("/owner"))?.body.variables.message_html ?? "";
ok(ownerMsg.includes("&lt;a href=&quot;https://evil.test&quot;&gt;") && !ownerMsg.includes("<a ") && ownerMsg.includes("<br>"), "message block is escaped (and keeps line breaks)", ownerMsg);
const thankVars = injected.find((m) => m.hook.endsWith("/thanks"))?.body.variables ?? {};
ok(thankVars.thank_you_html.includes("Thank you for backing Falera!") && thankVars.message_html.includes("Your message"), "thank-you email carries optional note + message blocks", thankVars);
r = await call(contribute.POST, "POST", `/api/fundraisers/${f.slug}/contribute`, { params: { slug: f.slug }, body: { currency: "INR", amount: 10000, email: "q@x.test" } });
await call(confirm.POST, "POST", `/api/fundraisers/contributions/${r.json.contribution_id}`, { params: { id: r.json.contribution_id }, body: { test: true } });
ok(mails[mails.length - 1].body.variables.message_html === "", "no message → empty block (no blank box)", mails[mails.length - 1].body.variables);

r = await call(pub.GET, "GET", `/api/fundraisers/${f.slug}`, { params: { slug: f.slug } });
ok(r.json.most_chosen?.INR === 10000, "“Most chosen” comes from real gifts (two ₹100 contributions)", r.json.most_chosen);

// ── 5. Close / report / hold / restore ────────────────────────────────────
r = await call(dashOne.PATCH, "PATCH", `/api/dashboard/fundraisers/${f.id}`, { cookie: ownerCookie, params: { id: f.id }, body: { action: "close" } });
ok(r.json.fundraiser.status === "closed", "owner closes the fundraiser");
r = await call(contribute.POST, "POST", `/api/fundraisers/${f.slug}/contribute`, { params: { slug: f.slug }, body: { currency: "INR", amount: 25000, email: "late@x.test" } });
ok(r.status === 409, "closed fundraiser refuses contributions", r.json);
r = await call(pub.GET, "GET", `/api/fundraisers/${f.slug}`, { params: { slug: f.slug } });
ok(r.status === 200 && r.json.status === "closed" && r.json.accepts_payments === false, "closed page stays up as a record");
await call(dashOne.PATCH, "PATCH", `/api/dashboard/fundraisers/${f.id}`, { cookie: ownerCookie, params: { id: f.id }, body: { action: "publish" } });

r = await call(report.POST, "POST", `/api/fundraisers/${f.slug}/report`, { params: { slug: f.slug }, body: { reason: "scam", details: "test" } });
ok(r.status === 200 && mails.some((m) => m.hook.endsWith("/report")), "report stored and admins emailed");
r = await call(moderation.GET, "GET", "/api/dashboard/moderation", { cookie: otherCookie });
ok(r.status === 403, "non-admins can't moderate");
r = await call(moderation.GET, "GET", "/api/dashboard/moderation", { cookie: ownerCookie });
ok(r.json.reports.length === 1, "admin sees the open report");
r = await call(moderation.POST, "POST", "/api/dashboard/moderation", { cookie: ownerCookie, body: { fundraiser_id: f.id, action: "hold", note: "checking" } });
r = await call(pub.GET, "GET", `/api/fundraisers/${f.slug}`, { params: { slug: f.slug } });
ok(r.json.status === "held", "held page shows only its status");
r = await call(contribute.POST, "POST", `/api/fundraisers/${f.slug}/contribute`, { params: { slug: f.slug }, body: { currency: "INR", amount: 25000, email: "h@x.test" } });
ok(r.status === 409, "held page takes no payments");
r = await call(dashOne.PATCH, "PATCH", `/api/dashboard/fundraisers/${f.id}`, { cookie: ownerCookie, params: { id: f.id }, body: { action: "publish" } });
ok(r.status === 409 && r.json.error === "held", "owner can't re-publish a held page", r.json);
await call(moderation.POST, "POST", "/api/dashboard/moderation", { cookie: ownerCookie, body: { fundraiser_id: f.id, action: "restore" } });
r = await call(dashOne.GET, "GET", `/api/dashboard/fundraisers/${f.id}`, { cookie: ownerCookie, params: { id: f.id } });
ok(r.json.fundraiser.status === "closed", "admin restore → closed (owner can re-open)");

// Moderation unpublish is sticky until an admin restores it.
await call(dashOne.PATCH, "PATCH", `/api/dashboard/fundraisers/${f.id}`, { cookie: ownerCookie, params: { id: f.id }, body: { action: "publish" } });
await call(moderation.POST, "POST", "/api/dashboard/moderation", { cookie: ownerCookie, body: { fundraiser_id: f.id, action: "unpublish", note: "misleading" } });
r = await call(dashOne.PATCH, "PATCH", `/api/dashboard/fundraisers/${f.id}`, { cookie: ownerCookie, params: { id: f.id }, body: { action: "publish" } });
ok(r.status === 409 && r.json.error === "unpublished_by_moderation", "owner can't re-publish a page moderation unpublished", r.json);
r = await call(dashOne.PATCH, "PATCH", `/api/dashboard/fundraisers/${f.id}`, { cookie: ownerCookie, params: { id: f.id }, body: { title: f.title } });
ok(r.status === 200, "owner can still edit it", r.json);
await call(moderation.POST, "POST", "/api/dashboard/moderation", { cookie: ownerCookie, body: { fundraiser_id: f.id, action: "restore" } });
r = await call(dashOne.PATCH, "PATCH", `/api/dashboard/fundraisers/${f.id}`, { cookie: ownerCookie, params: { id: f.id }, body: { action: "publish" } });
ok(r.status === 200 && r.json.fundraiser.status === "live", "after admin restore the owner can publish again", r.json);

// Rate limits are exact: the 6th report from one IP within the hour is refused.
{
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
        const rr = await call(report.POST, "POST", `/api/fundraisers/${f.slug}/report`, { params: { slug: f.slug }, headers: { "cf-connecting-ip": "203.0.113.7" }, body: { reason: "scam", details: `burst ${i}` } });
        statuses.push(rr.status);
    }
    ok(statuses.slice(0, 5).every((x) => x === 200) && statuses[5] === 429, "report rate limit is exact (5 per IP per hour)", statuses);
    const burst = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
            call(report.POST, "POST", `/api/fundraisers/${f.slug}/report`, { params: { slug: f.slug }, headers: { "cf-connecting-ip": "203.0.113.8" }, body: { reason: "scam", details: `parallel ${i}` } }),
        ),
    );
    ok(burst.filter((x) => x.status === 200).length === 5, "concurrent burst can't exceed the limit", burst.map((x) => x.status));
}

// ── 5b. Delete ─────────────────────────────────────────────────────────
r = await call(dashOne.DELETE, "DELETE", `/api/dashboard/fundraisers/${other.id}`, { cookie: ownerCookie, params: { id: other.id } });
ok(r.status === 404, "can't delete another merchant's fundraiser", r.json);
r = await call(dashOne.DELETE, "DELETE", `/api/dashboard/fundraisers/${other.id}`, { cookie: otherCookie, params: { id: other.id } });
ok(r.json.deleted === "hard", "never-published draft is removed outright", r.json);
r = await call(dash.POST, "POST", "/api/dashboard/fundraisers", { cookie: otherCookie, body: { title: "Other fund", goal_amount: 50000 } });
ok(r.status === 201 && r.json.fundraiser.slug === other.slug, "its link is free to reuse", r.json);

r = await call(dashOne.DELETE, "DELETE", `/api/dashboard/fundraisers/${f.id}`, { cookie: ownerCookie, params: { id: f.id } });
ok(r.json.deleted === "soft", "published fundraiser is soft-deleted", r.json);
r = await call(pub.GET, "GET", `/api/fundraisers/${f.slug}`, { params: { slug: f.slug } });
ok(r.json.status === "deleted" && r.json.title === f.title && r.json.raised === undefined, "public API: deleted status + title only", r.json);
r = await call(contribute.POST, "POST", `/api/fundraisers/${f.slug}/contribute`, { params: { slug: f.slug }, body: { currency: "INR", amount: 25000, email: "z@x.test" } });
ok(r.status === 409, "deleted fundraiser takes no payments", r.json);
r = await call(dashOne.PATCH, "PATCH", `/api/dashboard/fundraisers/${f.id}`, { cookie: ownerCookie, params: { id: f.id }, body: { action: "publish" } });
ok(r.status === 409 && r.json.error === "deleted", "deleted fundraiser can't be re-published or edited", r.json);
r = await call(dashCtb.GET, "GET", `/api/dashboard/fundraisers/${f.id}/contributions`, { cookie: ownerCookie, params: { id: f.id } });
ok(r.status === 200 && r.json.contributions.length >= 3, "contribution records kept after delete", r.json.contributions?.length);
r = await call(dash.POST, "POST", "/api/dashboard/fundraisers", { cookie: otherCookie, body: { title: "Squat", slug: f.slug, goal_amount: 50000 } });
ok(r.status === 409, "a deleted fundraiser's link stays reserved (printed QRs can't be hijacked)", r.json);

// ── 6. Markdown safety ────────────────────────────────────────────────────
const html = renderMarkdown('# Hi\n<img src=x onerror=alert(1)> **b** [ok](https://x.test) [bad](javascript:alert(1))');
ok(!/<img|<script|href="javascript:/i.test(html) && html.includes("&lt;img") && html.includes("<strong>b</strong>") && html.includes('href="https://x.test"'), "markdown escapes HTML and blocks javascript: links", html);

server.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
