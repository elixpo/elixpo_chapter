import {
    type FunctionStatusRow,
    type HostStatusRow,
    type NonOkRow,
    type Result,
    type SourceRow,
    type TimelinePoint,
    diagnose,
    functionsHealth,
    hostHealth,
    internalTimeline,
    internalTraffic,
    nonOkDetail,
    originTiming,
    statusMatrix,
    statusTimeline,
} from "@/lib/diagnostics";
import { discoverAccount } from "@/lib/discovery";
import { rangeWindow } from "@/lib/range";
import { type Service, listServices } from "@/lib/services";
import DiagnosticsView, { type DiagPayload } from "./diagnostics-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function mergeTimeline(lists: TimelinePoint[][]): TimelinePoint[] {
    const by = new Map<string, TimelinePoint>();
    for (const list of lists)
        for (const p of list) {
            const cur = by.get(p.ts);
            if (!cur) by.set(p.ts, { ...p });
            else
                for (const k of ["1xx", "2xx", "3xx", "4xx", "5xx"] as const)
                    cur[k] += p[k];
        }
    return Array.from(by.values()).sort((a, b) => a.ts.localeCompare(b.ts));
}

export default async function DiagnosticsPage({
    searchParams,
}: {
    searchParams: Promise<SP>;
}) {
    const sp = await searchParams;
    const w = rangeWindow(one(sp.range));
    const errors: DiagPayload["errors"] = [];
    const note = <T,>(section: string, zone: string, r: Result<T>): T => {
        if (!r.available)
            errors.push({
                section,
                message: `${zone ? `${zone}: ` : ""}${r.error || "unavailable"}`,
            });
        return r.data;
    };

    const [inv, services] = await Promise.all([
        discoverAccount(),
        listServices().catch((): Service[] => []),
    ]);
    const zones = inv.zones.map((z) => ({ id: z.id, name: z.name }));
    if (!zones.length)
        errors.push({
            section: "all",
            message: "No zones visible to the API token — nothing to diagnose.",
        });

    // Hosts the user filtered to: the timeline is re-queried per host so it
    // respects the service filter (everything else filters client-side).
    const selected = (one(sp.svc) || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8);
    const zoneFor = (host: string) => {
        const h = host.split(":")[0].replace(/\.$/, "");
        return zones
            .filter((z) => h === z.name || h.endsWith(`.${z.name}`))
            .sort((a, b) => b.name.length - a.name.length)[0];
    };

    const [perZone, fnRes, hostTl] = await Promise.all([
        Promise.all(
            zones.map(async (z) => {
                const [mx, tl, itl, nk3, nk4, ot, it] = await Promise.all([
                    statusMatrix(z.id, w),
                    selected.length ? null : statusTimeline(z.id, w),
                    selected.length ? null : internalTimeline(z.id, w),
                    nonOkDetail(z.id, w, undefined, 600, 300),
                    nonOkDetail(z.id, w, undefined, 1500, 400),
                    originTiming(z.id, w),
                    internalTraffic(z.id, w),
                ]);
                const nk3Rows = note("explorer", z.name, nk3).filter(
                    (r) => r.status < 400,
                );
                const nk4Rows = note("explorer", z.name, nk4);
                return {
                    matrix: note("matrix", z.name, mx),
                    timeline: tl ? note("timeline", z.name, tl) : [],
                    internalTimeline: itl ? note("internal", z.name, itl) : [],
                    nonOk: [...nk4Rows, ...nk3Rows],
                    origin: note("origin", z.name, ot),
                    internal: note("internal", z.name, it),
                };
            }),
        ),
        functionsHealth(w),
        Promise.all(
            selected.map(async (host) => {
                const z = zoneFor(host);
                if (!z)
                    return {
                        tl: [] as TimelinePoint[],
                        itl: [] as TimelinePoint[],
                    };
                const [tl, itl] = await Promise.all([
                    statusTimeline(z.id, w, host),
                    internalTimeline(z.id, w, host),
                ]);
                return {
                    tl: note("timeline", host, tl),
                    itl: note("internal", host, itl),
                };
            }),
        ),
    ]);

    const matrix: HostStatusRow[] = perZone.flatMap((z) => z.matrix);
    const nonOk: NonOkRow[] = perZone.flatMap((z) => z.nonOk);
    const internal: SourceRow[] = perZone.flatMap((z) => z.internal);
    const originMs: Record<string, number> = Object.assign(
        {},
        ...perZone.map((z) => z.origin),
    );
    const functions: FunctionStatusRow[] = note("functions", "", fnRes);
    const timeline = selected.length
        ? mergeTimeline(hostTl.map((h) => h.tl))
        : mergeTimeline(perZone.map((z) => z.timeline));
    const itl = selected.length
        ? mergeTimeline(hostTl.map((h) => h.itl))
        : mergeTimeline(perZone.map((z) => z.internalTimeline));

    const findings = diagnose({
        health: hostHealth(matrix, originMs),
        nonOk,
        functions,
        services,
        internal,
    });

    const payload: DiagPayload = {
        range: { key: w.key, label: w.label, since: w.since, until: w.until },
        zones,
        services: services.map((s) => ({
            host: s.host,
            label: s.label,
            zoneName: s.zoneName,
            pagesProject: s.pagesProject,
            workerScript: s.workerScript,
            functionScript: s.functionScript,
        })),
        matrix,
        internal,
        originMs,
        timeline,
        internalTimeline: itl,
        timelineHosts: selected,
        nonOk,
        functions,
        findings,
        errors: errors.filter(
            (e, i) =>
                errors.findIndex(
                    (x) => x.section === e.section && x.message === e.message,
                ) === i,
        ),
    };

    return <DiagnosticsView data={payload} />;
}
