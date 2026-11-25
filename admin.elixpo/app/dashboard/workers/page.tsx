import { discoverAccount, workerSchedules } from "@/lib/discovery";
import { workersMetrics } from "@/lib/metrics";
import { rangeWindow } from "@/lib/range";
import WorkersView, { type WorkerRow } from "./workers-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function WorkersPage({
    searchParams,
}: {
    searchParams: Promise<{ range?: string }>;
}) {
    const inv = await discoverAccount();
    const { range } = await searchParams;
    const w = rangeWindow(range);

    const data: WorkerRow[] = await Promise.all(
        inv.workers.map(async (script) => ({
            name: script.id,
            modified: script.modified_on,
            m: await workersMetrics(script.id, w),
            crons: await workerSchedules(script.id),
        })),
    );

    return <WorkersView data={data} listError={inv.errors.workers?.error} />;
}
