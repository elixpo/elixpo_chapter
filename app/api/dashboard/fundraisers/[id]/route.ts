export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { requireDashboard } from "@/lib/dashboard-auth";
import {
    type FundraiserRow,
    hasEnded,
    ownerView,
    parseFundraiserInput,
    payoutReadiness,
    coverList,
    verifyCoverImage,
} from "@/lib/fundraisers";

/**
 * GET   /api/dashboard/fundraisers/:id — owner view (status, totals, readiness)
 * PATCH /api/dashboard/fundraisers/:id — edit fields and/or { action }:
 *         "publish" (draft|closed → live; needs connected payouts)
 *         "close"   (live → closed; the page stays up as a record)
 *       A page held by Elixpo moderation can be edited but not re-published.
 */
async function load(request: NextRequest, params: Promise<{ id: string }>) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return { error: ctx };
    const { id } = await params;
    const row = (await ctx.db
        .prepare("SELECT * FROM fundraisers WHERE id = ? AND merchant_id = ?")
        .bind(id, ctx.merchantId)
        .first()) as FundraiserRow | null;
    if (!row) {
        return { error: NextResponse.json({ error: "not_found", error_description: "Fundraiser not found" }, { status: 404 }) };
    }
    return { ctx, row };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const r = await load(request, params);
    if (r.error) return r.error;
    return NextResponse.json({ fundraiser: await ownerView(r.ctx.db, r.row) });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const r = await load(request, params);
    if (r.error) return r.error;
    const { ctx, row } = r;
    const body: any = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });

    const parsed = parseFundraiserInput(body, true);
    if (!parsed.ok) {
        return NextResponse.json({ error: "invalid_request", error_description: parsed.error }, { status: 400 });
    }
    // A published link may already be printed on QR codes — never move it.
    if (parsed.fields.slug && parsed.fields.slug !== row.slug && row.published_at) {
        return NextResponse.json(
            { error: "slug_locked", error_description: "The link can't change after the fundraiser has been published." },
            { status: 409 },
        );
    }
    if (parsed.fields.slug === row.slug) delete parsed.fields.slug;

    // Re-check only cover images that weren't already saved.
    if (parsed.fields.cover_urls_json !== undefined || parsed.fields.cover_url !== undefined) {
        const before = new Set(coverList(row));
        const next: string[] = parsed.fields.cover_urls_json
            ? JSON.parse(parsed.fields.cover_urls_json)
            : parsed.fields.cover_url
              ? [parsed.fields.cover_url]
              : [];
        const fresh = next.filter((u) => !before.has(u));
        const checks = await Promise.all(fresh.map((u) => verifyCoverImage(u)));
        const bad = checks.findIndex((c) => !c.ok);
        if (bad !== -1) {
            const c = checks[bad] as { ok: false; error: string };
            return NextResponse.json(
                { error: "invalid_cover", error_description: `${next.length > 1 ? `${fresh[bad]}: ` : ""}${c.error}` },
                { status: 400 },
            );
        }
        // Keep the legacy single-cover column in step with the list.
        if (parsed.fields.cover_urls_json === undefined) {
            parsed.fields.cover_urls_json = next.length ? JSON.stringify(next) : null;
        }
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(parsed.fields)) {
        sets.push(`${k} = ?`);
        vals.push(v);
    }
    // Keep the public byline current with the owner's Accounts profile.
    sets.push("owner_name = ?", "owner_avatar = ?");
    vals.push(ctx.session.name || ctx.session.email, ctx.session.avatar ?? null);

    if (row.status === "deleted") {
        return NextResponse.json(
            { error: "deleted", error_description: "This fundraiser was deleted and can't be changed." },
            { status: 409 },
        );
    }
    const action = body.action as string | undefined;
    if (action === "publish") {
        if (row.status === "held") {
            return NextResponse.json(
                { error: "held", error_description: "This page is held by Elixpo moderation. Contact support to restore it." },
                { status: 409 },
            );
        }
        // Unpublished by moderation: stays down until an admin restores it.
        if (row.status === "draft" && row.moderation_note) {
            return NextResponse.json(
                {
                    error: "unpublished_by_moderation",
                    error_description:
                        "Elixpo moderation unpublished this page. You can edit it, but it can't go live again until we review it. Write to hello@elixpo.com.",
                },
                { status: 409 },
            );
        }
        const readiness = await payoutReadiness(ctx.db, ctx.merchantId);
        if (!readiness.ready) {
            return NextResponse.json({ error: "payouts_required", error_description: readiness.reason }, { status: 409 });
        }
        const endsAt = parsed.fields.ends_at !== undefined ? parsed.fields.ends_at : row.ends_at;
        if (hasEnded({ ends_at: endsAt })) {
            return NextResponse.json(
                { error: "ended", error_description: "The end date has passed — move it forward or clear it first." },
                { status: 409 },
            );
        }
        sets.push("status = 'live'", "published_at = COALESCE(published_at, datetime('now'))");
    } else if (action === "close") {
        if (row.status !== "live") {
            return NextResponse.json({ error: "not_live", error_description: "Only a live fundraiser can be closed." }, { status: 409 });
        }
        sets.push("status = 'closed'");
    } else if (action != null) {
        return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    }

    sets.push("updated_at = datetime('now')");
    vals.push(row.id);
    try {
        await ctx.db.prepare(`UPDATE fundraisers SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
    } catch (err) {
        if (/UNIQUE/i.test(String(err))) {
            return NextResponse.json(
                { error: "slug_taken", error_description: "That link is already taken — choose another." },
                { status: 409 },
            );
        }
        throw err;
    }
    const fresh = (await ctx.db.prepare("SELECT * FROM fundraisers WHERE id = ?").bind(row.id).first()) as FundraiserRow;
    return NextResponse.json({ fundraiser: await ownerView(ctx.db, fresh) });
}

/**
 * DELETE /api/dashboard/fundraisers/:id
 * - A draft that was never published (so it can't have contributions) is
 *   removed outright and its link is freed.
 * - Anything published becomes `deleted`: the public page shows a "no longer
 *   taking contributions" notice (printed QR codes keep resolving), payments
 *   stop, the link stays reserved so it can't be reused for someone else's
 *   fundraiser, and contributions stay readable/exportable for the owner.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const r = await load(request, params);
    if (r.error) return r.error;
    const { ctx, row } = r;
    if (row.status === "deleted") return NextResponse.json({ ok: true, deleted: "soft" });

    const hasMoney = (await ctx.db
        .prepare("SELECT 1 FROM contributions WHERE fundraiser_id = ? LIMIT 1")
        .bind(row.id)
        .first()) as unknown;
    if (row.status === "draft" && !row.published_at && !hasMoney) {
        await ctx.db.batch([
            ctx.db.prepare("DELETE FROM fundraiser_reports WHERE fundraiser_id = ?").bind(row.id),
            ctx.db.prepare("DELETE FROM fundraisers WHERE id = ? AND merchant_id = ?").bind(row.id, ctx.merchantId),
        ]);
        return NextResponse.json({ ok: true, deleted: "hard" });
    }
    await ctx.db
        .prepare("UPDATE fundraisers SET status = 'deleted', updated_at = datetime('now') WHERE id = ? AND merchant_id = ?")
        .bind(row.id, ctx.merchantId)
        .run();
    return NextResponse.json({ ok: true, deleted: "soft" });
}
