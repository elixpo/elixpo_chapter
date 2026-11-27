export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { appFromApiKey } from "@/lib/api-auth";
import { getDatabase } from "@/lib/d1-client";
import { safeReturnUrl } from "@/lib/safe-redirect";
import {
    createCheckoutSession,
    resolveProductAndPrice,
    upsertCustomer,
} from "@/lib/repo";
import { hasActiveRouteAccount } from "@/lib/route-account";

const CURRENCIES = ["INR", "USD", "EUR", "GBP"];
const INTERVALS = ["day", "week", "month", "year"];

/**
 * POST /v1/checkout/sessions
 *
 * Server-to-server. The consuming app authenticates with its secret key
 * (`Authorization: Bearer lix_pay_…`) and asks us to start a checkout for one of
 * its buyers. This REPLACES the old signed-handoff token: the app no longer
 * signs an amount — Elixpo Pay resolves the price from its own catalog by
 * (tier, currency), so the price can't be tampered with and there is no shared
 * HANDOFF secret to distribute.
 *
 * Body:
 * {
 *   "tier": "member",                    // product tier to purchase (required)
 *   "customer": { "uid": "u_123", "email": "a@b.com" },   // buyer (uid required)
 *   "currency": "INR",                   // optional; defaults to INR
 *   "interval": "year",                  // optional; month | year | week | day —
 *                                        //   picks between a tier's prices
 *   "success_url": "https://app/return", // where checkout returns the buyer
 *   "metadata": { ... }                  // optional, echoed onto the session
 * }
 *
 * Response: { id, url, amount, currency, expires_at }
 *   `url` is the hosted checkout page — redirect the buyer there.
 */
export async function POST(request: NextRequest) {
    try {
        const db = await getDatabase();
        const app = await appFromApiKey(db, request);
        if (!app) {
            return NextResponse.json(
                {
                    error: "unauthorized",
                    error_description: "Invalid or missing secret key",
                },
                { status: 401 },
            );
        }

        const body: any = await request.json().catch(() => ({}));
        const tier = String(body.tier || "")
            .trim()
            .toLowerCase();
        if (!tier) {
            return NextResponse.json(
                {
                    error: "invalid_request",
                    error_description: "tier is required",
                },
                { status: 400 },
            );
        }

        const customer = body.customer || {};
        const uid = customer.uid ? String(customer.uid) : "";
        const email = customer.email ? String(customer.email) : null;
        if (!uid) {
            return NextResponse.json(
                {
                    error: "invalid_request",
                    error_description: "customer.uid is required",
                },
                { status: 400 },
            );
        }

        const currency = String(body.currency || "INR").toUpperCase();
        if (!CURRENCIES.includes(currency)) {
            return NextResponse.json(
                {
                    error: "invalid_currency",
                    error_description: `Unsupported currency '${currency}'`,
                },
                { status: 400 },
            );
        }

        const interval =
            body.interval == null
                ? null
                : String(body.interval).trim().toLowerCase();
        if (interval && !INTERVALS.includes(interval)) {
            return NextResponse.json(
                {
                    error: "invalid_request",
                    error_description: `interval must be one of ${INTERVALS.join(", ")}`,
                },
                { status: 400 },
            );
        }

        // Price is resolved from OUR catalog — never trusted from the caller.
        const resolved = await resolveProductAndPrice(
            db,
            app.id,
            tier,
            currency,
            interval,
        );
        if (!resolved) {
            return NextResponse.json(
                {
                    error: "unknown_plan",
                    error_description: `No active product for tier '${tier}'`,
                },
                { status: 404 },
            );
        }
        if (!resolved.price) {
            return NextResponse.json(
                {
                    error: "no_price",
                    error_description: `No active ${currency}${interval ? ` ${interval}ly` : ""} price for tier '${tier}'`,
                },
                { status: 404 },
            );
        }

        const amount = resolved.price.unit_amount;

        // Razorpay Route (merchant payouts) only settles INR. A Route-connected
        // merchant can't take other currencies — the money would have nowhere
        // to go but the platform account.
        if (
            currency !== "INR" &&
            (await hasActiveRouteAccount(db, app.merchant_id))
        ) {
            return NextResponse.json(
                {
                    error: "currency_not_supported_for_payouts",
                    error_description:
                        "Payouts to this merchant are INR-only; use currency INR.",
                },
                { status: 400 },
            );
        }
        let returnUrl = app.return_url;
        if (body.success_url != null && body.success_url !== "") {
            returnUrl = safeReturnUrl(body.success_url);
            if (!returnUrl) {
                return NextResponse.json(
                    {
                        error: "invalid_request",
                        error_description:
                            "success_url must be an absolute https:// URL",
                    },
                    { status: 400 },
                );
            }
        }

        const customerId = await upsertCustomer(db, app.id, uid, email);

        // NOTE: a buyer's existing autopay is NOT cancelled here — opening (and
        // possibly abandoning) checkout must never stop a paid plan. Superseded
        // subscriptions are cancelled once the new mandate activates (see
        // cancelSupersededSubscriptions in the Razorpay webhook).

        // Caller metadata first, then the system keys so they always win.
        const metadata: Record<string, unknown> = {};
        if (
            body.metadata &&
            typeof body.metadata === "object" &&
            !Array.isArray(body.metadata)
        ) {
            Object.assign(metadata, body.metadata);
        }
        metadata.plan = tier;
        metadata.source = "api";

        const sessionId = await createCheckoutSession(db, {
            appId: app.id,
            customerId,
            externalUid: uid,
            productId: resolved.product.id,
            priceId: resolved.price.id,
            currency,
            amount,
            returnUrl,
            metadata,
        });

        const url = `${request.nextUrl.origin}/checkout?session=${encodeURIComponent(sessionId)}`;
        const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();

        return NextResponse.json(
            {
                id: sessionId,
                url,
                amount,
                currency,
                tier: resolved.product.tier,
                expires_at: expiresAt,
            },
            { status: 201 },
        );
    } catch (err: any) {
        console.error("[v1/checkout/sessions] error:", err);
        return NextResponse.json(
            {
                error: "server_error",
                error_description: String(err?.message || err),
            },
            { status: 500 },
        );
    }
}
