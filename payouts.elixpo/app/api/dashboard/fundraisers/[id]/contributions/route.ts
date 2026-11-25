export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { requireDashboard } from "@/lib/dashboard-auth";

/**
 * GET /api/dashboard/fundraisers/:id/contributions[?format=csv]
 * Paid contributions for the owner: amount, name (or "Anonymous" when the
 * contributor gave none), whether they chose to show it publicly, message,
 * date. Contributor emails are receipt-only and never exposed.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const { id } = await params;
    const f = (await ctx.db
        .prepare("SELECT id, slug FROM fundraisers WHERE id = ? AND merchant_id = ?")
        .bind(id, ctx.merchantId)
        .first()) as { id: string; slug: string } | null;
    if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const res = await ctx.db
        .prepare(
            `SELECT id, amount, currency, display_amount, display_currency, fx_rate, name, show_name, message,
                    provider_payment_id, paid_at
             FROM contributions WHERE fundraiser_id = ? AND status = 'paid' ORDER BY paid_at DESC LIMIT 5000`,
        )
        .bind(f.id)
        .all();
    const rows = ((res.results ?? []) as any[]).map((c) => ({
        id: c.id as string,
        amount: Number(c.amount),
        currency: String(c.currency),
        display_amount: c.display_amount == null ? null : Number(c.display_amount),
        display_currency: c.display_currency as string | null,
        fx_rate: c.fx_rate == null ? null : Number(c.fx_rate),
        name: c.name ? String(c.name) : "Anonymous",
        public: !!c.show_name,
        message: c.message as string | null,
        payment_id: c.provider_payment_id as string | null,
        paid_at: c.paid_at as string,
    }));

    if (request.nextUrl.searchParams.get("format") === "csv") {
        const esc = (v: unknown) => {
            const s = v == null ? "" : String(v);
            // Neutralise spreadsheet formula injection, then quote.
            const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
            return `"${safe.replace(/"/g, '""')}"`;
        };
        const header = ["paid_at", "amount_inr", "picked_amount", "picked_currency", "usd_inr_rate", "name", "public", "message", "payment_id"];
        const lines = rows.map((r) =>
            [
                r.paid_at,
                (r.amount / 100).toFixed(2),
                r.display_amount == null ? "" : (r.display_amount / 100).toFixed(2),
                r.display_currency ?? "",
                r.fx_rate ?? "",
                r.name,
                r.public ? "yes" : "no",
                r.message ?? "",
                r.payment_id ?? "",
            ]
                .map(esc)
                .join(","),
        );
        return new NextResponse([header.join(","), ...lines].join("\r\n"), {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="${f.slug}-contributions.csv"`,
                "Cache-Control": "no-store",
            },
        });
    }
    return NextResponse.json({ contributions: rows }, { headers: { "Cache-Control": "no-store" } });
}
