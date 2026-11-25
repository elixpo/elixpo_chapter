export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { requireDashboard } from "@/lib/dashboard-auth";
import { type FundraiserRow, ownerView, parseFundraiserInput, verifyCoverImage } from "@/lib/fundraisers";
import { newId } from "@/lib/ids";

/**
 * GET  /api/dashboard/fundraisers — the signed-in creator's fundraisers.
 * POST /api/dashboard/fundraisers — create a DRAFT (publish is a separate step
 *      that requires connected payouts).
 */
export async function GET(request: NextRequest) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const res = await ctx.db
        .prepare("SELECT * FROM fundraisers WHERE merchant_id = ? ORDER BY created_at DESC")
        .bind(ctx.merchantId)
        .all();
    const rows = (res.results ?? []) as unknown as FundraiserRow[];
    return NextResponse.json({
        fundraisers: await Promise.all(rows.map((r) => ownerView(ctx.db, r))),
    });
}

export async function POST(request: NextRequest) {
    const ctx = await requireDashboard(request);
    if (ctx instanceof NextResponse) return ctx;
    const body: any = await request.json().catch(() => null);
    const parsed = parseFundraiserInput(body ?? {}, false);
    if (!parsed.ok) {
        return NextResponse.json({ error: "invalid_request", error_description: parsed.error }, { status: 400 });
    }
    const f = parsed.fields;
    // Every cover image must really be an image (checked in parallel).
    const covers: string[] = f.cover_urls_json ? JSON.parse(f.cover_urls_json) : f.cover_url ? [f.cover_url] : [];
    const checks = await Promise.all(covers.map((u) => verifyCoverImage(u)));
    const bad = checks.findIndex((c) => !c.ok);
    if (bad !== -1) {
        const c = checks[bad] as { ok: false; error: string };
        const which = covers.length > 1 ? `Cover image ${bad + 1}: ` : "";
        return NextResponse.json({ error: "invalid_cover", error_description: `${which}${c.error}` }, { status: 400 });
    }
    const id = newId("fundraiser");
    try {
        await ctx.db
            .prepare(
                `INSERT INTO fundraisers
                   (id, merchant_id, owner_uid, owner_name, owner_avatar, slug, title, body_md, cover_url, link_url,
                    goal_amount, goal_currency, presets_json, thank_you_message, ends_at, status,
                    cover_urls_json, cover_autoplay, display_name)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, 'draft', ?, ?, ?)`,
            )
            .bind(
                id,
                ctx.merchantId,
                ctx.session.uid,
                ctx.session.name || ctx.session.email,
                ctx.session.avatar ?? null,
                f.slug,
                f.title,
                f.body_md ?? "",
                f.cover_url ?? null,
                f.link_url ?? null,
                f.goal_amount,
                f.presets_json,
                f.thank_you_message ?? null,
                f.ends_at ?? null,
                f.cover_urls_json ?? (f.cover_url ? JSON.stringify([f.cover_url]) : null),
                f.cover_autoplay ?? 1,
                f.display_name ?? null,
            )
            .run();
    } catch (err) {
        if (/UNIQUE/i.test(String(err))) {
            return NextResponse.json(
                { error: "slug_taken", error_description: `The link /f/${f.slug} is already taken — choose another.` },
                { status: 409 },
            );
        }
        throw err;
    }
    const row = (await ctx.db.prepare("SELECT * FROM fundraisers WHERE id = ?").bind(id).first()) as FundraiserRow;
    return NextResponse.json({ fundraiser: await ownerView(ctx.db, row) }, { status: 201 });
}
