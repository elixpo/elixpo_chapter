import type { MetadataRoute } from "next";
import { getDatabase } from "@/lib/d1-client";

const BASE = "https://payouts.elixpo.com";

// path → priority. Marketing + docs are indexable; auth/dashboard/api/checkout
// are excluded here and in robots.ts.
const ROUTES: Array<[string, number]> = [
    ["", 1],
    ["/pricing", 0.9],
    ["/about", 0.8],
    ["/docs", 0.8],
    ["/docs/quickstart", 0.7],
    ["/docs/catalog", 0.7],
    ["/docs/checkout", 0.7],
    ["/docs/webhooks", 0.7],
    ["/docs/entitlements", 0.7],
    ["/docs/payouts", 0.7],
    ["/docs/fundraisers", 0.7],
    ["/docs/emails", 0.6],
    ["/privacy", 0.4],
    ["/terms", 0.4],
    ["/refunds", 0.4],
    ["/contact", 0.5],
    ["/trust", 0.7],
    ["/email-policy", 0.4],
];

export const runtime = "edge";
// Fundraisers are listed live from the database.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const lastModified = new Date();
    const pages: MetadataRoute.Sitemap = ROUTES.map(([path, priority]) => ({
        url: `${BASE}${path}`,
        lastModified,
        changeFrequency: path.startsWith("/docs") ? "weekly" : "monthly",
        priority,
    }));
    // Public fundraisers: live ones rank higher; closed ones stay as records.
    try {
        const db = await getDatabase();
        const res = await db
            .prepare("SELECT slug, status, updated_at FROM fundraisers WHERE status IN ('live', 'closed') ORDER BY updated_at DESC LIMIT 5000")
            .all();
        for (const f of (res.results ?? []) as { slug: string; status: string; updated_at: string }[]) {
            pages.push({
                url: `${BASE}/f/${f.slug}`,
                lastModified: new Date(`${f.updated_at.replace(" ", "T")}Z`),
                changeFrequency: f.status === "live" ? "daily" : "monthly",
                priority: f.status === "live" ? 0.8 : 0.4,
            });
        }
    } catch {
        // Database unavailable (e.g. at build time) — static pages only.
    }
    return pages;
}
