export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { requireDashboard } from "@/lib/dashboard-auth";
import { isPlatformMerchant } from "@/lib/merchant";

/**
 * Elixpo admin moderation for fundraisers (platform owner only).
 *   GET  → every non-draft fundraiser with open-report counts, plus open reports
 *   POST { fundraiser_id, action, note? }
 *        "hold"      → page shows "under review", no new payments, owner can't re-publish
 *        "unpublish" → back to draft (owner must fix and re-publish)
 *        "restore"   → held page back to closed (owner can re-open it)
 *        "resolve"   → mark this page's open reports resolved
 */
async function admin(request: NextRequest) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    if (!isPlatformMerchant(ctx.merchantId)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return ctx;
}

export async function GET(request: NextRequest) {
    const ctx = await admin(request);
    if (ctx instanceof NextResponse) return ctx;
    const fundraisers = await ctx.db
        .prepare(
            `SELECT f.id, f.slug, f.title, f.status, f.owner_name, f.moderation_note, f.created_at,
                    (SELECT COUNT(*) FROM fundraiser_reports r WHERE r.fundraiser_id = f.id AND r.status = 'open') AS open_reports,
                    (SELECT COALESCE(SUM(amount),0) FROM contributions c WHERE c.fundraiser_id = f.id AND c.status = 'paid') AS raised
             FROM fundraisers f WHERE f.status != 'draft' OR f.moderation_note IS NOT NULL
             ORDER BY open_reports DESC, f.created_at DESC LIMIT 200`,
        )
        .all();
    const reports = await ctx.db
        .prepare(
            `SELECT r.id, r.fundraiser_id, r.reason, r.details, r.reporter_email, r.created_at, f.slug
             FROM fundraiser_reports r JOIN fundraisers f ON f.id = r.fundraiser_id
             WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 200`,
        )
        .all();
    return NextResponse.json(
        { fundraisers: fundraisers.results ?? [], reports: reports.results ?? [] },
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function POST(request: NextRequest) {
    const ctx = await admin(request);
    if (ctx instanceof NextResponse) return ctx;
    const body: any = await request.json().catch(() => ({}));
    const id = String(body?.fundraiser_id || "");
    const note = String(body?.note || "").trim().slice(0, 500) || null;
    const f = (await ctx.db.prepare("SELECT id, status, moderation_note FROM fundraisers WHERE id = ?").bind(id).first()) as {
        id: string;
        status: string;
        moderation_note: string | null;
    } | null;
    if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const stmts = [];
    switch (body?.action) {
        case "hold":
            stmts.push(
                ctx.db
                    .prepare("UPDATE fundraisers SET status = 'held', moderation_note = ?, updated_at = datetime('now') WHERE id = ?")
                    .bind(note ?? "Held for review by Elixpo.", id),
            );
            break;
        case "unpublish":
            stmts.push(
                ctx.db
                    .prepare("UPDATE fundraisers SET status = 'draft', moderation_note = ?, updated_at = datetime('now') WHERE id = ?")
                    .bind(note ?? "Unpublished by Elixpo moderation.", id),
            );
            break;
        case "restore":
            if (f.status === "held") {
                // Back as closed: the owner decides when to re-publish.
                stmts.push(
                    ctx.db
                        .prepare("UPDATE fundraisers SET status = 'closed', moderation_note = NULL, updated_at = datetime('now') WHERE id = ?")
                        .bind(id),
                );
            } else if (f.status === "draft" && f.moderation_note) {
                // Lift a moderation unpublish: the owner may publish again.
                stmts.push(
                    ctx.db
                        .prepare("UPDATE fundraisers SET moderation_note = NULL, updated_at = datetime('now') WHERE id = ?")
                        .bind(id),
                );
            } else {
                return NextResponse.json({ error: "not_moderated" }, { status: 409 });
            }
            break;
        case "resolve":
            break;
        default:
            return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    }
    // Every moderation action closes the page's open reports.
    stmts.push(
        ctx.db.prepare("UPDATE fundraiser_reports SET status = 'resolved' WHERE fundraiser_id = ? AND status = 'open'").bind(id),
    );
    await ctx.db.batch(stmts);
    return NextResponse.json({ ok: true });
}
