/**
 * Product insights — audience KPIs for every deployed product: visitors,
 * visits, signed-in monthly actives, returning users, top region.
 */

import { insightsOverview } from "@/lib/insights";
import { rangeWindow } from "@/lib/range";
import InsightsOverviewView from "./insights-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function InsightsPage({
    searchParams,
}: {
    searchParams: Promise<{ range?: string }>;
}) {
    const { range } = await searchParams;
    const data = await insightsOverview(rangeWindow(range || "30d"));
    return <InsightsOverviewView data={data} />;
}
