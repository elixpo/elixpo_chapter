export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { getFundraiserBySlug, getTotals, hasEnded } from "@/lib/fundraisers";
import { cardState } from "@/lib/fundraiser-share";
import { renderCard } from "@/lib/og-card";

/**
 * GET /f/:slug/og.png — the fundraiser's link-preview card (og:image and
 * twitter:image). The page links it with ?v=<raised>-<supporters>-<state>, so
 * social caches refetch when the numbers change; the query is otherwise
 * ignored. Unknown, draft, held and deleted slugs get the generic card.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    try {
        const db = await getDatabase();
        const row = await getFundraiserBySlug(db, slug.toLowerCase());
        if (!row || (row.status !== "live" && row.status !== "closed")) return renderCard(null);
        const { raised, count } = await getTotals(db, row.id);
        return renderCard({
            title: row.title,
            slug: row.slug,
            raised,
            goal: row.goal_amount,
            supporters: count,
            state: cardState({ status: row.status, ended: hasEnded(row), raised, goal: row.goal_amount }),
        });
    } catch {
        // A database hiccup still gets a card, cached briefly.
        return renderCard(null, "public, max-age=60, s-maxage=60");
    }
}
