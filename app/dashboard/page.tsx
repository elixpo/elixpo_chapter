/**
 * Account home — Cloudflare-style overview of every *.elixpo service: live
 * health state, account KPIs, per-service status bars, the top diagnostics
 * findings, traffic, inventory and recent deploys. All data is fetched in
 * parallel by loadOverview() and every call degrades instead of throwing.
 */

import { loadOverview } from "@/components/overview/data";
import { rangeWindow } from "@/lib/range";
import OverviewView from "./overview-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function OverviewPage({
    searchParams,
}: {
    searchParams: Promise<{ range?: string }>;
}) {
    const { range } = await searchParams;
    const data = await loadOverview(rangeWindow(range));
    return <OverviewView data={data} />;
}
