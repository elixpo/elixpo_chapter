export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { getEnv, testPaymentsAllowed } from "@/lib/env";
import {
    acceptsPayments,
    type DisplayCurrency,
    getFundraiserBySlug,
    LIMITS,
    payoutReadiness,
    usdToInrPaise,
} from "@/lib/fundraisers";
import { getUsdInrRate } from "@/lib/fx";
import { newId } from "@/lib/ids";
import { razorpayFromEnv } from "@/lib/providers/razorpay";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { routeTransfers } from "@/lib/route-transfers";

// Anonymous contribution creation is rate-limited (KV fixed window, fails open):
// per client IP, and per fundraiser as a cap on distributed bursts.
const RL_WINDOW_SECONDS = 600;
const RL_PER_IP = 10;
const RL_PER_FUNDRAISER = 120;

// Same rule as the contribute form: a dotted domain ending in a 2+ letter TLD.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;

function bad(error: string, description: string, status = 400) {
    return NextResponse.json({ error, error_description: description }, { status });
}

/**
 * POST /api/fundraisers/:slug/contribute
 * { currency: "INR"|"USD", amount: <minor units>, email, name?, show_name?, message? }
 *
 * Validates the amount server-side (limits per currency), records a pending
 * contribution and opens a Razorpay order — always in INR; a USD amount is
 * converted at the live USD→INR rate (src/lib/fx.ts). When the owner has an active payout
 * account the order carries a Route transfer so the money reaches them.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const body: any = await request.json().catch(() => null);
    if (!body) return bad("invalid_json", "Send a JSON body.");

    const db = await getDatabase();
    const f = await getFundraiserBySlug(db, slug.toLowerCase());
    if (!f || f.status === "draft") return bad("not_found", "This fundraiser doesn't exist.", 404);
    if (!acceptsPayments(f)) {
        return bad("closed", "This fundraiser isn't accepting contributions any more.", 409);
    }
    const readiness = await payoutReadiness(db, f.merchant_id);
    if (!readiness.ready) return bad("closed", "This fundraiser can't accept contributions right now.", 409);

    const currency: DisplayCurrency = body.currency === "USD" ? "USD" : "INR";
    const amount = Math.round(Number(body.amount));
    const lim = LIMITS[currency];
    if (!Number.isInteger(amount) || amount < lim.min || amount > lim.max) {
        return bad(
            "invalid_amount",
            currency === "USD"
                ? `Choose an amount between $${lim.min / 100} and $${(lim.max / 100).toLocaleString("en-US")}.`
                : `Choose an amount between ₹${lim.min / 100} and ₹${(lim.max / 100).toLocaleString("en-IN")}.`,
        );
    }
    const email = String(body.email || "").trim().slice(0, 254);
    if (!EMAIL_RE.test(email)) return bad("invalid_email", "Enter an email so we can send your receipt.");
    const name = String(body.name || "").trim().slice(0, 60) || null;
    const message = String(body.message || "").trim().slice(0, 280) || null;
    const showName = body.show_name === true && !!name;

    const ip = clientIp(request);
    if (ip && !(await rateLimit("contrib-ip", ip, RL_PER_IP, RL_WINDOW_SECONDS)).allowed) {
        return bad("rate_limited", "Too many attempts. Please wait a few minutes and try again.", 429);
    }
    if (!(await rateLimit("contrib-f", f.id, RL_PER_FUNDRAISER, RL_WINDOW_SECONDS)).allowed) {
        return bad("rate_limited", "This fundraiser is busy right now. Please try again in a few minutes.", 429);
    }

    // Charge in INR (the only live route) at the live USD→INR rate; remember
    // what the visitor picked and the rate used.
    const fx = currency === "USD" ? await getUsdInrRate() : null;
    const charge = fx ? usdToInrPaise(amount, fx.rate) : amount;

    const id = newId("contribution");
    await db
        .prepare(
            `INSERT INTO contributions
               (id, fundraiser_id, amount, currency, display_amount, display_currency, fx_rate, name, show_name, email, message)
             VALUES (?, ?, ?, 'INR', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, f.id, charge, amount, currency, fx?.rate ?? null, name, showName ? 1 : 0, email, message)
        .run();

    const razorpay = await razorpayFromEnv(getEnv);
    if (!razorpay) {
        if (await testPaymentsAllowed()) {
            return NextResponse.json({ contribution_id: id, test_mode: true, amount: charge, currency: "INR" });
        }
        return bad("provider_unconfigured", "Payments are temporarily unavailable.", 503);
    }

    const base = {
        amount: charge,
        currency: "INR",
        receipt: id,
        notes: { kind: "fundraiser", fundraiser: f.slug, contribution: id },
    };
    const transfers = await routeTransfers(db, f.merchant_id, charge, "INR", `fundraiser:${f.slug}`);
    let orderId: string;
    try {
        orderId = (await razorpay.createOrder(transfers ? { ...base, transfers } : base)).providerOrderId;
    } catch (err) {
        if (!transfers) {
            console.error("[fundraisers/contribute] order failed:", err);
            return bad("provider_error", "Couldn't start the payment. Please try again.", 502);
        }
        // Never fall back to a plain order: the money would settle to the
        // platform instead of the creator's linked account.
        console.error(`[fundraisers/contribute] Route order failed for merchant ${f.merchant_id}:`, err);
        return bad(
            "payout_route_unavailable",
            "Payments to this creator are temporarily unavailable. Please try again later.",
            503,
        );
    }
    await db.prepare("UPDATE contributions SET provider_order_id = ? WHERE id = ?").bind(orderId, id).run();

    return NextResponse.json({
        contribution_id: id,
        key_id: razorpay.keyId,
        order_id: orderId,
        amount: charge,
        currency: "INR",
        mode: razorpay.mode,
        title: f.title,
        prefill: { email, name },
    });
}
