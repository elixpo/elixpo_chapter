export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { appUrl } from "@/lib/env";
import { getFundraiserBySlug } from "@/lib/fundraisers";
import { newId } from "@/lib/ids";
import { PLATFORM_MERCHANT_ID } from "@/lib/merchant";
import { quoteBlockHtml } from "@/lib/mail-notify";
import { sendPlatformMail } from "@/lib/platform-mail";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const REASONS = new Set(["scam", "misleading", "inappropriate", "impersonation", "other"]);

/**
 * POST /api/fundraisers/:slug/report { reason, details?, email? }
 * Queues the page for Elixpo admin review (Dashboard → Moderation) and emails
 * the platform owner when the report hook is configured.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const body: any = await request.json().catch(() => ({}));
    const reason = String(body?.reason || "");
    if (!REASONS.has(reason)) {
        return NextResponse.json({ error: "invalid_reason" }, { status: 400 });
    }
    const db = await getDatabase();
    const f = await getFundraiserBySlug(db, slug.toLowerCase());
    if (!f || f.status === "draft" || f.status === "deleted") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Abuse guards: per-IP and per-page rate limits, plus a cap on open reports.
    const ip = clientIp(request);
    if (ip && !(await rateLimit("report-ip", ip, 5, 3600)).allowed) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    if (!(await rateLimit("report-page", f.id, 30, 3600)).allowed) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    const open = (await db
        .prepare("SELECT COUNT(*) AS n FROM fundraiser_reports WHERE fundraiser_id = ? AND status = 'open'")
        .bind(f.id)
        .first()) as { n: number } | null;
    if ((open?.n ?? 0) >= 50) return NextResponse.json({ ok: true });

    const id = newId("fundraiserReport");
    const details = String(body?.details || "").trim().slice(0, 1000) || null;
    const email = String(body?.email || "").trim().slice(0, 254) || null;
    await db
        .prepare(
            "INSERT INTO fundraiser_reports (id, fundraiser_id, reason, details, reporter_email) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(id, f.id, reason, details, email)
        .run();

    // Email the admin only for the first open report on a page; later ones
    // are visible in the moderation queue without flooding the inbox.
    if ((open?.n ?? 0) > 0) return NextResponse.json({ ok: true });

    const base = await appUrl();
    const admin = (await db
        .prepare("SELECT email FROM merchants WHERE id = ?")
        .bind(PLATFORM_MERCHANT_ID)
        .first()) as { email: string | null } | null;
    await sendPlatformMail(
        "fundraiser.report",
        admin?.email,
        {
            fundraiser_title: f.title,
            fundraiser_url: `${base}/f/${f.slug}`,
            reason,
            details: details || "",
            reporter_email: email || "",
            moderation_url: `${base}/dashboard/moderation`,
            details_html: quoteBlockHtml(details, "Details from the reporter"),
        },
        `fundraiser.report:${id}`,
    );
    return NextResponse.json({ ok: true });
}
