import { discoverAccount } from "@/lib/discovery";
import { doMetrics } from "@/lib/metrics";
import { rangeWindow } from "@/lib/range";
import DoDetailView from "./do-detail-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function DoDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ range?: string }>;
}) {
    const { id } = await params;
    const { range } = await searchParams;
    const inv = await discoverAccount();
    const ns = inv.durableObjects.find((d) => d.id === id) || null;
    const metrics = await doMetrics(id, rangeWindow(range));

    return <DoDetailView id={id} ns={ns} metrics={metrics} />;
}
