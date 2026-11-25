/**
 * Fundraisers (issue #60) — public pages with a goal where anyone contributes
 * any amount. Payments are one-time Razorpay orders in INR (no USD route yet:
 * USD amounts are shown and converted to INR at order time). Money reaches the
 * owner through Razorpay Route when their payout account is active; the
 * platform owner's own fundraisers settle directly to the platform account.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { appUrl } from "./env";
import { getUsdInrRate } from "./fx";
import { formatDate, formatMoney, quoteBlockHtml } from "./mail-notify";
import { isPlatformMerchant } from "./merchant";
import { sendPlatformMail } from "./platform-mail";

export type FundraiserStatus = "draft" | "live" | "closed" | "held" | "deleted";
export type DisplayCurrency = "INR" | "USD";

export interface FundraiserRow {
    id: string;
    merchant_id: string;
    owner_uid: string;
    owner_name: string | null;
    owner_avatar: string | null;
    slug: string;
    title: string;
    body_md: string;
    cover_url: string | null;
    cover_urls_json: string | null;
    cover_autoplay: number;
    display_name: string | null;
    link_url: string | null;
    goal_amount: number;
    goal_currency: string;
    presets_json: string;
    thank_you_message: string | null;
    status: FundraiserStatus;
    moderation_note: string | null;
    ends_at: string | null;
    published_at: string | null;
    created_at: string;
    updated_at: string;
}

/** Contribution limits per display currency (minor units). */
export const LIMITS: Record<DisplayCurrency, { min: number; max: number }> = {
    INR: { min: 1000, max: 20_000_000 }, // ₹10 – ₹2,00,000
    USD: { min: 100, max: 250_000 }, //     $1 – $2,500
};

export const DEFAULT_PRESETS: Record<DisplayCurrency, number[]> = {
    INR: [10000, 25000, 50000, 100000],
    USD: [500, 1000, 2500, 5000],
};

const RESERVED_SLUGS = new Set([
    "new", "edit", "admin", "api", "thanks", "report", "contribute", "contributions", "elixpo", "pay",
]);
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

export function validateSlug(raw: unknown): string | null {
    const slug = String(raw ?? "").trim().toLowerCase();
    if (!SLUG_RE.test(slug) || slug.includes("--") || RESERVED_SLUGS.has(slug)) return null;
    return slug;
}

export function slugify(title: string): string {
    return title
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)
        .replace(/-+$/g, "");
}

/** https URL (http only for localhost), or null. */
export function httpsUrl(raw: unknown): string | null {
    if (typeof raw !== "string" || !raw.trim()) return null;
    try {
        const u = new URL(raw.trim());
        const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
        return u.protocol === "https:" || (local && u.protocol === "http:") ? u.toString() : null;
    } catch {
        return null;
    }
}

/**
 * A creator-supplied link (cover image, GitHub/website): https only, a public
 * hostname (no localhost / private or link-local IPs / .local / .internal),
 * no embedded credentials, ≤ 2048 chars. Returns the normalised URL or null.
 */
export function publicHttpsUrl(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const v = raw.trim();
    if (!v || v.length > 2048) return null;
    let u: URL;
    try {
        u = new URL(v);
    } catch {
        return null;
    }
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host.includes(".") && !host.includes(":")) return null; // single-label hosts
    if (host === "localhost" || /\.(localhost|local|internal|lan|home|arpa)$/.test(host)) return null;
    // IPv4 literals in private / loopback / link-local / CGNAT / unspecified ranges.
    const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])];
        if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) {
            return null;
        }
    }
    // IPv6 literals: loopback, unique-local, link-local, mapped.
    if (host.includes(":") && (host === "::1" || host === "::" || /^(fc|fd|fe8|fe9|fea|feb)/.test(host) || host.startsWith("::ffff:"))) {
        return null;
    }
    u.hash = "";
    return u.toString();
}

const MAX_COVER_BYTES = 10 * 1024 * 1024;

/**
 * Confirm a cover image URL actually serves an image: fetched server-side with
 * a timeout, must answer 2xx with an image/* content type and ≤ 10 MB. Only the
 * headers are read; the body is cancelled. Never throws.
 */
export async function verifyCoverImage(url: string): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        const res = await fetch(url, {
            method: "GET",
            redirect: "follow",
            headers: { Accept: "image/*", "User-Agent": "ElixpoPay-CoverCheck/1" },
            signal: AbortSignal.timeout(6000),
        });
        // A redirect must not land somewhere we wouldn't accept directly.
        if (res.url && res.url !== url && !publicHttpsUrl(res.url)) {
            await res.body?.cancel().catch(() => {});
            return { ok: false, error: "The cover image URL redirects to an address that isn't allowed." };
        }
        const type = (res.headers.get("content-type") || "").toLowerCase();
        const size = Number(res.headers.get("content-length") || 0);
        await res.body?.cancel().catch(() => {});
        if (res.status === 404) return { ok: false, error: "The cover image wasn't found (404). Check the link." };
        if (!res.ok) return { ok: false, error: `The cover image couldn't be loaded (HTTP ${res.status}).` };
        if (!type.startsWith("image/")) {
            return { ok: false, error: "That link isn't an image. Use a direct link to a .jpg, .png or .webp file." };
        }
        if (size > MAX_COVER_BYTES) return { ok: false, error: "The cover image is larger than 10 MB." };
        return { ok: true };
    } catch {
        return { ok: false, error: "We couldn't reach the cover image. Check the link and try again." };
    }
}

/**
 * Strictly validate presets from the dashboard: per currency an array of
 * integers (minor units) within LIMITS, 1–6 values. Duplicates are merged and
 * values sorted. Unlike normalizePresets (used when READING stored data), this
 * reports problems instead of silently fixing them.
 */
export function validatePresets(
    input: unknown,
): { ok: true; presets: Record<DisplayCurrency, number[]> } | { ok: false; error: string } {
    const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const out: Record<DisplayCurrency, number[]> = { INR: [], USD: [] };
    for (const cur of ["INR", "USD"] as DisplayCurrency[]) {
        const sym = cur === "INR" ? "₹" : "$";
        const arr = src[cur];
        if (!Array.isArray(arr)) return { ok: false, error: `Add ${sym} preset amounts.` };
        const vals: number[] = [];
        for (const v of arr) {
            const n = typeof v === "number" ? v : Number.NaN;
            if (!Number.isInteger(n)) return { ok: false, error: `${sym} presets must be whole amounts.` };
            if (n < LIMITS[cur].min || n > LIMITS[cur].max) {
                return {
                    ok: false,
                    error: `${sym} presets must be between ${sym}${(LIMITS[cur].min / 100).toLocaleString("en-IN")} and ${sym}${(LIMITS[cur].max / 100).toLocaleString("en-IN")}.`,
                };
            }
            vals.push(n);
        }
        const uniq = [...new Set(vals)].sort((a, b) => a - b);
        if (uniq.length === 0) return { ok: false, error: `Add at least one ${sym} preset amount.` };
        if (uniq.length > 6) return { ok: false, error: `Use at most 6 ${sym} preset amounts.` };
        out[cur] = uniq;
    }
    return { ok: true, presets: out };
}

/** Sanitise presets: integers within limits, unique, ascending, ≤ 6 each. */
export function normalizePresets(input: unknown): Record<DisplayCurrency, number[]> {
    const out: Record<DisplayCurrency, number[]> = { INR: [], USD: [] };
    const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    for (const cur of ["INR", "USD"] as DisplayCurrency[]) {
        const arr = Array.isArray(src[cur]) ? (src[cur] as unknown[]) : [];
        const vals = arr
            .map((v) => Math.round(Number(v)))
            .filter((v) => Number.isInteger(v) && v >= LIMITS[cur].min && v <= LIMITS[cur].max);
        out[cur] = [...new Set(vals)].sort((a, b) => a - b).slice(0, 6);
        if (out[cur].length === 0) out[cur] = DEFAULT_PRESETS[cur];
    }
    return out;
}

export function parsePresets(json: string | null): Record<DisplayCurrency, number[]> {
    try {
        return normalizePresets(JSON.parse(json || "{}"));
    } catch {
        return DEFAULT_PRESETS;
    }
}

export const MAX_COVERS = 6;

/** Stored cover list (falls back to the single legacy cover_url). */
export function coverList(row: Pick<FundraiserRow, "cover_url" | "cover_urls_json">): string[] {
    try {
        const arr = JSON.parse(row.cover_urls_json || "null");
        if (Array.isArray(arr)) return arr.filter((u) => typeof u === "string" && publicHttpsUrl(u)).slice(0, MAX_COVERS);
    } catch {
        /* fall through */
    }
    return row.cover_url ? [row.cover_url] : [];
}

/** The name shown publicly: the fundraiser's display name, else the account name. */
export function publicName(row: Pick<FundraiserRow, "display_name" | "owner_name">, fallback = "Elixpo creator"): string {
    return (row.display_name || "").trim() || (row.owner_name || "").trim() || fallback;
}

/**
 * The preset most supporters actually chose (by display currency), so the
 * page can honestly tag it "Most chosen". Needs at least 2 matching gifts.
 */
export async function mostChosen(db: D1Database, fundraiserId: string): Promise<Partial<Record<DisplayCurrency, number>>> {
    const res = await db
        .prepare(
            `SELECT display_currency AS cur, display_amount AS amt, COUNT(*) AS n
             FROM contributions WHERE fundraiser_id = ? AND status = 'paid' AND display_amount IS NOT NULL
             GROUP BY display_currency, display_amount HAVING COUNT(*) >= 2
             ORDER BY n DESC, amt DESC`,
        )
        .bind(fundraiserId)
        .all();
    const out: Partial<Record<DisplayCurrency, number>> = {};
    for (const r of (res.results ?? []) as any[]) {
        const cur = r.cur === "USD" ? "USD" : "INR";
        if (out[cur] === undefined) out[cur] = Number(r.amt);
    }
    return out;
}

/** Live ₹ per $1 used to convert USD contributions into the INR charge. */
export async function usdInrRate(): Promise<number> {
    return (await getUsdInrRate()).rate;
}

/** Convert a USD minor amount into the INR (paise) charge, rounded to ₹1. */
export function usdToInrPaise(usdCents: number, rate: number): number {
    return Math.round((usdCents / 100) * rate) * 100;
}

function sqlTime(v: string | null): Date | null {
    if (!v) return null;
    const d = new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function hasEnded(row: Pick<FundraiserRow, "ends_at">): boolean {
    const end = sqlTime(row.ends_at);
    return !!end && end <= new Date();
}

export function acceptsPayments(row: Pick<FundraiserRow, "status" | "ends_at">): boolean {
    return row.status === "live" && !hasEnded(row);
}

/**
 * Can this merchant's money actually reach them? Platform owner: always (it
 * settles directly). Others: an active Razorpay Route linked account, which is
 * also what the public "Verified" mark means (Razorpay's KYC).
 */
export async function payoutReadiness(
    db: D1Database,
    merchantId: string,
): Promise<{ ready: boolean; verified: boolean; reason: string | null }> {
    if (isPlatformMerchant(merchantId)) return { ready: true, verified: true, reason: null };
    const pa = (await db
        .prepare(
            "SELECT status, razorpay_account_id FROM payout_accounts WHERE merchant_id = ?",
        )
        .bind(merchantId)
        .first()) as { status: string; razorpay_account_id: string | null } | null;
    if (pa?.status === "active" && pa.razorpay_account_id) {
        return { ready: true, verified: true, reason: null };
    }
    return {
        ready: false,
        verified: false,
        reason: pa
            ? "Your payout account isn't active yet — finish connecting it under Payouts."
            : "Connect a payout account under Payouts first, so contributions can reach you.",
    };
}

export async function getTotals(
    db: D1Database,
    fundraiserId: string,
): Promise<{ raised: number; count: number }> {
    const r = (await db
        .prepare(
            "SELECT COALESCE(SUM(amount), 0) AS raised, COUNT(*) AS count FROM contributions WHERE fundraiser_id = ? AND status = 'paid'",
        )
        .bind(fundraiserId)
        .first()) as { raised: number; count: number } | null;
    return { raised: Number(r?.raised ?? 0), count: Number(r?.count ?? 0) };
}

export async function recentSupporters(db: D1Database, fundraiserId: string, limit = 8) {
    const res = await db
        .prepare(
            `SELECT name, show_name, message, amount, currency, display_amount, display_currency, paid_at
             FROM contributions WHERE fundraiser_id = ? AND status = 'paid'
             ORDER BY paid_at DESC LIMIT ?`,
        )
        .bind(fundraiserId, limit)
        .all();
    return ((res.results ?? []) as any[]).map((c) => ({
        name: c.show_name && c.name ? String(c.name) : "Anonymous",
        message: c.message ? String(c.message) : null,
        amount: Number(c.display_amount ?? c.amount),
        currency: String(c.display_currency ?? c.currency),
        paid_at: c.paid_at as string,
    }));
}

/** Supporters listed on the public page and API: all of them for a typical
 * fundraiser, capped so one with thousands stays a small response. */
const PUBLIC_SUPPORTERS = 100;

/** What the public page / API may see — never owner ids or contributor emails. */
export async function publicView(db: D1Database, row: FundraiserRow) {
    const [totals, supporters, readiness, fx, popular] = await Promise.all([
        getTotals(db, row.id),
        recentSupporters(db, row.id, PUBLIC_SUPPORTERS),
        payoutReadiness(db, row.merchant_id),
        getUsdInrRate(),
        mostChosen(db, row.id),
    ]);
    return {
        slug: row.slug,
        title: row.title,
        body_md: row.body_md,
        cover_url: row.cover_url,
        covers: coverList(row),
        cover_autoplay: row.cover_autoplay !== 0,
        link_url: row.link_url,
        owner: { name: publicName(row), avatar: row.owner_avatar, verified: readiness.verified },
        most_chosen: popular,
        goal: { amount: row.goal_amount, currency: row.goal_currency },
        raised: totals.raised,
        contributors: totals.count,
        presets: parsePresets(row.presets_json),
        status: row.status,
        accepts_payments: acceptsPayments(row) && readiness.ready,
        ends_at: row.ends_at,
        ended: hasEnded(row),
        supporters,
        usd_inr_rate: fx.rate,
        usd_inr_as_of: fx.as_of,
        limits: LIMITS,
    };
}

export async function getFundraiserBySlug(db: D1Database, slug: string): Promise<FundraiserRow | null> {
    return (await db.prepare("SELECT * FROM fundraisers WHERE slug = ?").bind(slug).first()) as FundraiserRow | null;
}

/**
 * Mark a contribution paid — the ONE place totals change. Idempotent: the
 * conditional UPDATE only succeeds for the first caller (client confirm or the
 * Razorpay webhook), and only that caller sends the emails, so a replayed or
 * duplicate webhook never counts a payment twice.
 */
export async function markContributionPaid(
    db: D1Database,
    where: { contributionId?: string; orderId?: string },
    paymentId: string | null,
): Promise<{ newlyPaid: boolean; contributionId: string | null }> {
    const c = (await db
        .prepare(
            where.contributionId
                ? "SELECT * FROM contributions WHERE id = ?"
                : "SELECT * FROM contributions WHERE provider_order_id = ?",
        )
        .bind(where.contributionId ?? where.orderId ?? "")
        .first()) as any | null;
    if (!c) return { newlyPaid: false, contributionId: null };

    const res = await db
        .prepare(
            `UPDATE contributions
             SET status = 'paid', provider_payment_id = COALESCE(?, provider_payment_id), paid_at = datetime('now')
             WHERE id = ? AND status NOT IN ('paid', 'refunded')`,
        )
        .bind(paymentId, c.id)
        .run();
    if (!res.meta?.changes) {
        // Already paid. If its emails never went out (the request that marked it
        // paid was cut off before notifying), a later webhook/confirm sends them.
        // Mails dedupes on the idempotency key, so this can't double-send.
        if (c.status === "paid" && c.thanks_email_status == null) {
            await notifyContribution(db, c.id).catch((err) =>
                console.error("[fundraisers] notify retry failed for %s:", c.id, err),
            );
        }
        return { newlyPaid: false, contributionId: c.id };
    }

    await notifyContribution(db, c.id).catch((err) =>
        console.error("[fundraisers] notify failed for %s:", c.id, err),
    );
    return { newlyPaid: true, contributionId: c.id };
}

/**
 * Sweep: paid contributions whose receipt or owner alert never went out
 * (status NULL, or a failed send) in the last 3 days. Run from the cron. Safe to repeat:
 * Elixpo Mails dedupes each email on its idempotency key.
 */
export async function retryContributionEmails(db: D1Database, limit = 50): Promise<{ scanned: number; sent: number }> {
    const rows = (
        await db
            .prepare(
                `SELECT id FROM contributions
                 WHERE status = 'paid'
                   AND (thanks_email_status IS NULL OR thanks_email_status = 'failed'
                        OR owner_email_status = 'failed')
                   AND paid_at < datetime('now', '-5 minutes')
                   AND paid_at > datetime('now', '-3 days')
                 ORDER BY paid_at LIMIT ?`,
            )
            .bind(limit)
            .all()
    ).results as { id: string }[];
    let sent = 0;
    for (const r of rows ?? []) {
        try {
            await notifyContribution(db, r.id);
            sent++;
        } catch (err) {
            console.error("[fundraisers] email sweep failed for %s:", r.id, err);
        }
    }
    return { scanned: rows?.length ?? 0, sent };
}

/** Thank-you email to the contributor + "new contribution" alert to the owner. */
async function notifyContribution(db: D1Database, contributionId: string): Promise<void> {
    const c = (await db.prepare("SELECT * FROM contributions WHERE id = ?").bind(contributionId).first()) as any;
    const f = (await db.prepare("SELECT * FROM fundraisers WHERE id = ?").bind(c.fundraiser_id).first()) as FundraiserRow;
    const owner = (await db.prepare("SELECT email, name FROM merchants WHERE id = ?").bind(f.merchant_id).first()) as {
        email: string | null;
        name: string | null;
    } | null;
    const base = await appUrl();
    const totals = await getTotals(db, f.id);
    const amount = formatMoney(c.amount, c.currency);
    const shownAs =
        c.display_currency && c.display_currency !== c.currency
            ? `${formatMoney(c.display_amount, c.display_currency)} (charged ${amount})`
            : amount;
    const contributor = c.name ? String(c.name) : "Anonymous";
    const pageUrl = `${base}/f/${f.slug}`;

    const thanks = await sendPlatformMail(
        "fundraiser.thank_you",
        c.email,
        {
            contributor_name: c.name || "friend",
            amount: shownAs,
            fundraiser_title: f.title,
            fundraiser_url: pageUrl,
            owner_name: publicName(f, owner?.name || "the creator"),
            thank_you_message: f.thank_you_message || "",
            message: c.message || "",
            payment_id: c.provider_payment_id || "",
            paid_at: formatDate(new Date().toISOString()),
            receipt_note: "Contributions are not tax-deductible.",
            // Optional sections — empty when there's nothing to show.
            thank_you_html: quoteBlockHtml(f.thank_you_message, `A note from ${publicName(f, owner?.name || "the creator")}`),
            message_html: quoteBlockHtml(c.message, "Your message"),
        },
        `fundraiser.thank_you:${c.id}`,
    );
    const progress = f.goal_amount > 0 ? Math.min(100, Math.round((totals.raised / f.goal_amount) * 100)) : 0;
    const ownerMail = await sendPlatformMail(
        "fundraiser.new_contribution",
        owner?.email,
        {
            owner_name: publicName(f, owner?.name || "there"),
            contributor_name: contributor,
            amount: shownAs,
            message: c.message || "",
            fundraiser_title: f.title,
            fundraiser_url: pageUrl,
            total_raised: formatMoney(totals.raised, f.goal_currency),
            goal: formatMoney(f.goal_amount, f.goal_currency),
            progress_percent: String(progress),
            contributors: String(totals.count),
            dashboard_url: `${base}/dashboard/fundraisers/${f.id}`,
            message_html: quoteBlockHtml(c.message, `Message from ${contributor}`),
        },
        `fundraiser.new_contribution:${c.id}`,
    );
    await db
        .prepare("UPDATE contributions SET thanks_email_status = ?, owner_email_status = ? WHERE id = ?")
        .bind(thanks, ownerMail, c.id)
        .run();
}

export interface FundraiserInput {
    title?: string;
    slug?: string;
    body_md?: string;
    cover_url?: string | null;
    cover_urls_json?: string | null;
    cover_autoplay?: number;
    display_name?: string | null;
    link_url?: string | null;
    goal_amount?: number;
    presets_json?: string;
    thank_you_message?: string | null;
    ends_at?: string | null;
}

/**
 * Validate editable fields from a dashboard request. `partial` = PATCH (only
 * fields present are validated/returned). Returns the clean fields or an error.
 */
export function parseFundraiserInput(
    body: any,
    partial: boolean,
): { ok: true; fields: FundraiserInput } | { ok: false; error: string } {
    const f: FundraiserInput = {};
    const has = (k: string) => body && Object.hasOwn(body, k);

    if (!partial || has("title")) {
        const t = String(body?.title ?? "").trim();
        if (t.length < 3 || t.length > 100) return { ok: false, error: "Title must be 3–100 characters." };
        f.title = t;
    }
    if (!partial || has("slug")) {
        const raw = body?.slug ? body.slug : f.title ? slugify(f.title) : "";
        const s = validateSlug(raw);
        if (!s) return { ok: false, error: "Slug must be 3–48 lowercase letters, numbers or single hyphens." };
        f.slug = s;
    }
    if (!partial || has("body_md")) {
        const b = String(body?.body_md ?? "");
        if (b.length > 10_000) return { ok: false, error: "The reason can be at most 10,000 characters." };
        f.body_md = b;
    }
    for (const k of ["cover_url", "link_url"] as const) {
        if (!partial || has(k)) {
            const v = typeof body?.[k] === "string" ? body[k].trim() : body?.[k];
            // An untouched prefilled "https://" means "no link".
            if (v == null || v === "" || v === "https://") f[k] = null;
            else {
                const u = publicHttpsUrl(v);
                if (!u) {
                    return {
                        ok: false,
                        error: `${k === "cover_url" ? "Cover image" : "GitHub or website"} must be a public https:// link.`,
                    };
                }
                f[k] = u;
            }
        }
    }
    // Multiple covers: an array of public https image links (≤ 6). The first
    // also becomes cover_url (social previews, older readers).
    if (has("cover_urls")) {
        const raw = body?.cover_urls;
        if (!Array.isArray(raw)) return { ok: false, error: "Cover images must be a list of links." };
        const list: string[] = [];
        for (const v of raw) {
            const t = typeof v === "string" ? v.trim() : "";
            if (!t || t === "https://") continue;
            const u = publicHttpsUrl(t);
            if (!u) return { ok: false, error: "Every cover image must be a public https:// link." };
            if (!list.includes(u)) list.push(u);
        }
        if (list.length > MAX_COVERS) return { ok: false, error: `Use at most ${MAX_COVERS} cover images.` };
        f.cover_urls_json = list.length ? JSON.stringify(list) : null;
        f.cover_url = list[0] ?? null;
    }
    if (has("cover_autoplay")) f.cover_autoplay = body?.cover_autoplay === false ? 0 : 1;
    if (!partial || has("display_name")) {
        const n = String(body?.display_name ?? "")
            // biome-ignore lint/suspicious/noControlCharactersInRegex: strip control chars
            .replace(/[\u0000-\u001f\u007f]/g, "")
            .replace(/\s+/g, " ")
            .trim();
        if (n.length > 80) return { ok: false, error: "Display name can be at most 80 characters." };
        f.display_name = n || null;
    }
    if (!partial || has("goal_amount")) {
        const g = Math.round(Number(body?.goal_amount));
        if (!Number.isInteger(g) || g < 10_000 || g > 1_000_000_000) {
            return { ok: false, error: "Goal must be between ₹100 and ₹1,00,00,000." };
        }
        f.goal_amount = g;
    }
    if (has("presets")) {
        const pr = validatePresets(body?.presets);
        if (!pr.ok) return { ok: false, error: pr.error };
        f.presets_json = JSON.stringify(pr.presets);
    } else if (!partial) {
        f.presets_json = JSON.stringify(DEFAULT_PRESETS);
    }
    if (!partial || has("thank_you_message")) {
        const m = String(body?.thank_you_message ?? "").trim();
        if (m.length > 500) return { ok: false, error: "Thank-you message can be at most 500 characters." };
        f.thank_you_message = m || null;
    }
    if (!partial || has("ends_at")) {
        const e = body?.ends_at;
        if (e == null || e === "") f.ends_at = null;
        else {
            const d = new Date(String(e));
            if (Number.isNaN(d.getTime())) return { ok: false, error: "End date is not a valid date." };
            f.ends_at = d.toISOString().replace("T", " ").slice(0, 19);
        }
    }
    return { ok: true, fields: f };
}

/** Dashboard (owner) view — includes status/moderation, totals and readiness. */
export async function ownerView(db: D1Database, row: FundraiserRow) {
    const [totals, readiness] = await Promise.all([getTotals(db, row.id), payoutReadiness(db, row.merchant_id)]);
    return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        body_md: row.body_md,
        cover_url: row.cover_url,
        covers: coverList(row),
        cover_autoplay: row.cover_autoplay !== 0,
        display_name: row.display_name,
        public_name: publicName(row),
        link_url: row.link_url,
        goal_amount: row.goal_amount,
        goal_currency: row.goal_currency,
        presets: parsePresets(row.presets_json),
        thank_you_message: row.thank_you_message,
        status: row.status,
        moderation_note: row.moderation_note,
        ends_at: row.ends_at,
        ended: hasEnded(row),
        published_at: row.published_at,
        created_at: row.created_at,
        raised: totals.raised,
        contributors: totals.count,
        payout_ready: readiness.ready,
        payout_reason: readiness.reason,
        verified: readiness.verified,
    };
}

/**
 * Money-back on a contribution (Razorpay `refund.processed` / a lost dispute),
 * found by its payment id. `totalRefunded` is the payment's CUMULATIVE refunded
 * amount. Once that covers the whole contribution it flips to 'refunded', which
 * drops it from getTotals / supporters (they only count 'paid'). A partial
 * refund leaves it 'paid' and is only logged — contributions have no column
 * for a partial amount. Idempotent: the UPDATE only fires on a 'paid' row, so a
 * replayed event is a no-op (newlyRefunded=false).
 */
export async function markContributionRefunded(
    db: D1Database,
    paymentId: string,
    totalRefunded: number,
): Promise<{ contributionId: string | null; newlyRefunded: boolean; partial: boolean; amount: number }> {
    const c = (await db
        .prepare("SELECT id, amount, status FROM contributions WHERE provider_payment_id = ?")
        .bind(paymentId)
        .first()) as { id: string; amount: number; status: string } | null;
    if (!c) return { contributionId: null, newlyRefunded: false, partial: false, amount: 0 };

    const amount = Number(c.amount);
    if (totalRefunded < amount) {
        console.warn(
            "[fundraisers] partial refund on %s (payment %s): %d of %d refunded; left as %s",
            c.id,
            paymentId,
            totalRefunded,
            amount,
            c.status,
        );
        return { contributionId: c.id, newlyRefunded: false, partial: true, amount };
    }

    const res = await db
        .prepare("UPDATE contributions SET status = 'refunded' WHERE id = ? AND status = 'paid'")
        .bind(c.id)
        .run();
    return { contributionId: c.id, newlyRefunded: !!res.meta?.changes, partial: false, amount };
}
