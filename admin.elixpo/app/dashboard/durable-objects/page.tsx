import ListView, { type ListItem } from "@/components/list-view";
import { discoverAccount } from "@/lib/discovery";
import { autoLabel } from "@/lib/enrich";
import { doMetrics } from "@/lib/metrics";
import DoRequestsPanel from "./do-requests-panel";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function DurableObjectsPage() {
    const inv = await discoverAccount();
    const metrics = await doMetrics();

    const items: ListItem[] = inv.durableObjects.map((d) => ({
        id: d.id,
        primary: d.class || d.name || autoLabel(d.id),
        secondary: [d.script, d.use_sqlite ? "SQLite" : null, d.id]
            .filter(Boolean)
            .join(" · "),
        href: `/dashboard/durable-objects/${d.id}`,
    }));

    return (
        <ListView
            title="Durable Objects"
            subtitle="Stateful coordination objects across the account"
            panelTitle={`${items.length} namespaces`}
            items={items}
            emptyMessage="No Durable Object namespaces found."
            error={inv.errors.durableObjects?.error}
        >
            <DoRequestsPanel metrics={metrics} />
        </ListView>
    );
}
