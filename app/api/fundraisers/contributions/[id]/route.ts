export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { getEnv, testPaymentsAllowed } from "@/lib/env";
import { markContributionPaid } from "@/lib/fundraisers";
import { razorpayFromEnv } from "@/lib/providers/razorpay";

async function load(id: string) {
    const db = await getDatabase();
    const c = (await db
        .prepare(
            `SELECT c.id, c.status, c.amount, c.currency, c.display_amount, c.display_currency, c.name, c.show_name,
                    c.provider_order_id, c.thanks_email_status, f.slug, f.title, f.thank_you_message, f.owner_name, f.display_name
             FROM contributions c JOIN fundraisers f ON f.id = c.fundraiser_id WHERE c.id = ?`,
        )
        .bind(id)
        .first()) as any | null;
    return { db, c };
}

function view(c: any) {
    return {
        id: c.id,
        status: c.status,
        amount: c.amount,
        currency: c.currency,
        display_amount: c.display_amount,
        display_currency: c.display_currency,
        // This URL is shareable (thank-you page), so a hidden name stays hidden.
        name: c.show_name ? c.name : null,
        email_status: c.thanks_email_status,
        fundraiser: {
            slug: c.slug,
            title: c.title,
            // The creator's public name (display name, else account name).
            owner_name: (c.display_name || "").trim() || c.owner_name,
            thank_you_message: c.thank_you_message,
        },
    };
}

/** GET /api/fundraisers/contributions/:id — status for the thank-you page. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { c } = await load(id);
    if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(view(c), { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/fundraisers/contributions/:id — client handback after Razorpay
 * Checkout: { razorpay_order_id, razorpay_payment_id, razorpay_signature }.
 * Verifies the signature and marks the contribution paid (idempotent; the
 * Razorpay webhook is the authoritative backstop). `{ test: true }` completes
 * a test-mode contribution in development only.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const body: any = await request.json().catch(() => ({}));
    const { db, c } = await load(id);
    if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (c.status === "paid") return NextResponse.json(view(c));

    if (body?.test === true) {
        if (!(await testPaymentsAllowed()) || c.provider_order_id) {
            return NextResponse.json({ error: "test_payments_disabled" }, { status: 403 });
        }
        await markContributionPaid(db, { contributionId: id }, `pay_test_${id.slice(-12)}`);
        return NextResponse.json(view((await load(id)).c));
    }

    const orderId = String(body?.razorpay_order_id || "");
    const paymentId = String(body?.razorpay_payment_id || "");
    const signature = String(body?.razorpay_signature || "");
    if (!orderId || !paymentId || !signature || orderId !== c.provider_order_id) {
        return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const razorpay = await razorpayFromEnv(getEnv);
    if (!razorpay) return NextResponse.json({ error: "provider_unconfigured" }, { status: 503 });
    if (!(await razorpay.verifyPaymentSignature(orderId, paymentId, signature))) {
        return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
    await markContributionPaid(db, { contributionId: id }, paymentId);
    return NextResponse.json(view((await load(id)).c));
}
