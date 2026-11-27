/**
 * Account-home data — server only. Fetches everything the overview needs in
 * parallel and folds it into one plain-JSON `OverviewData` prop so the client
 * view stays a pure renderer. Every call is non-throwing; failures surface as
 * `error` strings on the relevant section.
 */

import { cfGraphQL } from "@/lib/cloudflare-api";
import {
    type HostHealth,
    type HostStatusRow,
    type NonOkRow,
    type Severity,
    type SourceRow,
    type StatusClass,
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
    visitorOnly,
} from "@/lib/diagnostics";
import { type Inventory, discoverAccount } from "@/lib/discovery";
import { cached } from "@/lib/kv";
import { type MetricSeries, workersMetricsAll } from "@/lib/metrics";
import type { RangeWindow } from "@/lib/range";
import { type Service, listServices } from "@/lib/services";

/* ------------------------------------------------------------------ types */

export interface SummaryPoint {
    ts: string;
    requests: number;
    bytes: number;
    cached: number;
    threats: number;
    uniques: number;
}

export interface ZoneSummary {
    available: boolean;
    error?: string;
    points: SummaryPoint[];
    status: { code: number; count: number }[];
    countries: { code: string; requests: number; threats: number }[];
}

export interface ServiceCard {
    host: string;
    label: string;
    zoneName: string;
    backends: Service["backends"];
    total: number;
    byClass: Record<StatusClass, number>;
    worst?: { status: number; count: number };
    severity: Severity | "ok" | "idle";
}

export interface DeployRow {
    project: string;
    env: string;
    createdOn: string;
    host?: string;
}

export interface OverviewData {
    now: number;
    rangeLabel: string;
    rangeKey: string;
    serviceCount: number;
    state: "healthy" | "degraded" | "failing";
    criticalCount: number;
    warningCount: number;
    hostsWith5xx: number;
    kpi: {
        available: boolean;
        error?: string;
        requests: number;
        bytes: number;
        uniques: number;
        threats: number;
        cached: number;
        status2xx: number;
        status5xx: number;
        statusTotal: number;
        series: SummaryPoint[];
        bucket: "hour" | "day";
    };
    workers: MetricSeries;
    services: ServiceCard[];
    attention: AttentionItem[];
    timeline: { available: boolean; error?: string; points: TimelinePoint[] };
    status: { label: string; count: number }[];
    countries: { label: string; value: number }[];
    hosts: { host: string; total: number; errorRate: number; known: boolean }[];
    inventory: {
        fetchedAt: number;
        counts: Record<InventoryKey, number>;
        errors: { section: string; error: string }[];
    };
    deadQueues: string[];
    deploys: DeployRow[];
    diagnosticsError?: string;
}

export type InventoryKey =
    | "pages"
    | "workers"
    | "d1"
    | "kv"
    | "queues"
    | "durableObjects"
    | "workflows"
    | "zones";

export interface AttentionItem {
    id: string;
    severity: Severity;
    host: string;
    status: number;
    count: number;
    share: number;
    title: string;
    reason: string;
}

/* --------------------------------------------------------------- helpers */

/** Floor a window to the minute so cached() keys repeat across page loads. */
export function stableWindow(w: RangeWindow): RangeWindow {
    const floor = (iso: string) =>
        new Date(Math.floor(new Date(iso).getTime() / 60_000) * 60_000)
            .toISOString()
            .replace(".000Z", "Z");
    return { ...w, since: floor(w.since), until: floor(w.until) };
}

const SUM_FIELDS =
    "sum{requests cachedRequests bytes threats responseStatusMap{edgeResponseStatus requests} countryMap{clientCountryName requests threats}} uniq{uniques}";

/**
 * Zone-wide totals from the pre-aggregated httpRequests1h/1dGroups datasets
 * (uniques, threats, cache and per-status counts aren't in adaptive groups
 * on Free). 1h groups only allow ≤3d windows, so ≥7d switches to daily rows.
 */
async function zoneSummary(
    zoneId: string,
    w: RangeWindow,
): Promise<ZoneSummary> {
    const hours =
        (new Date(w.until).getTime() - new Date(w.since).getTime()) / 3600_000;
    const daily = hours > 72;
    return cached(`ov:zs:${zoneId}:${w.since}:${w.until}`, 60, async () => {
        try {
            let rows: any[];
            if (daily) {
                const d = await cfGraphQL<any>(
                    `query($z:String!,$d:Date!){viewer{zones(filter:{zoneTag:$z}){
                        g:httpRequests1dGroups(limit:40,filter:{date_geq:$d},orderBy:[date_ASC]){${SUM_FIELDS} dimensions{date}}
                    }}}`,
                    { z: zoneId, d: w.since.slice(0, 10) },
                );
                rows = (d?.viewer?.zones?.[0]?.g ?? []).map((r: any) => ({
                    ...r,
                    ts: `${r.dimensions.date}T00:00:00Z`,
                }));
            } else {
                // Floor to the hour so short windows still catch a full bucket.
                const since = new Date(
                    Math.floor(new Date(w.since).getTime() / 3600_000) *
                        3600_000,
                ).toISOString();
                const d = await cfGraphQL<any>(
                    `query($z:String!,$s:Time!,$u:Time!){viewer{zones(filter:{zoneTag:$z}){
                        g:httpRequests1hGroups(limit:100,filter:{datetime_geq:$s,datetime_leq:$u},orderBy:[datetime_ASC]){${SUM_FIELDS} dimensions{datetime}}
                    }}}`,
                    { z: zoneId, s: since, u: w.until },
                );
                rows = (d?.viewer?.zones?.[0]?.g ?? []).map((r: any) => ({
                    ...r,
                    ts: r.dimensions.datetime,
                }));
            }
            const status = new Map<number, number>();
            const countries = new Map<
                string,
                { requests: number; threats: number }
            >();
            const points: SummaryPoint[] = rows.map((r: any) => {
                for (const s of r.sum?.responseStatusMap ?? []) {
                    const k = Number(s.edgeResponseStatus) || 0;
                    status.set(k, (status.get(k) || 0) + (s.requests ?? 0));
                }
                for (const c of r.sum?.countryMap ?? []) {
                    const k = String(c.clientCountryName || "—");
                    const e = countries.get(k) || { requests: 0, threats: 0 };
                    e.requests += c.requests ?? 0;
                    e.threats += c.threats ?? 0;
                    countries.set(k, e);
                }
                return {
                    ts: r.ts,
                    requests: r.sum?.requests ?? 0,
                    bytes: r.sum?.bytes ?? 0,
                    cached: r.sum?.cachedRequests ?? 0,
                    threats: r.sum?.threats ?? 0,
                    uniques: r.uniq?.uniques ?? 0,
                };
            });
            return {
                available: true,
                points,
                status: Array.from(status, ([code, count]) => ({
                    code,
                    count,
                })),
                countries: Array.from(countries, ([code, v]) => ({
                    code,
                    ...v,
                })),
            };
        } catch (e) {
            return {
                available: false,
                error: (e as Error)?.message || String(e),
                points: [],
                status: [],
                countries: [],
            };
        }
    });
}

const emptyInventory = (error: string): Inventory => ({
    accountId: "",
    fetchedAt: Date.now(),
    pages: [],
    workers: [],
    d1: [],
    kv: [],
    queues: [],
    durableObjects: [],
    workflows: [],
    zones: [],
    errors: { account: { error } },
});

function mergeByTs<T extends { ts: string }>(
    lists: T[][],
    add: (a: T, b: T) => T,
): T[] {
    const m = new Map<string, T>();
    for (const list of lists)
        for (const p of list) {
            const prev = m.get(p.ts);
            m.set(p.ts, prev ? add(prev, p) : { ...p });
        }
    return Array.from(m.values()).sort((a, b) => a.ts.localeCompare(b.ts));
}

const RANK: Record<string, number> = {
    critical: 0,
    warning: 1,
    info: 2,
    ok: 3,
    idle: 4,
};

/* ----------------------------------------------------------------- loader */

export async function loadOverview(w: RangeWindow): Promise<OverviewData> {
    const win = stableWindow(w);
    const [inv, services] = await Promise.all([
        discoverAccount().catch((e) =>
            emptyInventory((e as Error)?.message || String(e)),
        ),
        listServices().catch(() => [] as Service[]),
    ]);

    const zones = inv.zones.filter((z) => z.status !== "pending");
    const [perZone, functions, workers] = await Promise.all([
        Promise.all(
            zones.map((z) =>
                Promise.all([
                    statusMatrix(z.id, win),
                    statusTimeline(z.id, win),
                    nonOkDetail(z.id, win, undefined, 300),
                    originTiming(z.id, win),
                    zoneSummary(z.id, win),
                    // Cloudflare-internal requests (Early Hints lookups, …) so
                    // visitor-facing counts aren't inflated by their 504s.
                    internalTraffic(z.id, win),
                    internalTimeline(z.id, win),
                ]),
            ),
        ),
        functionsHealth(win),
        workersMetricsAll(win).catch(
            (e): MetricSeries => ({
                available: false,
                error: String(e),
                points: [],
                totals: {},
            }),
        ),
    ]);

    /* ---- health + findings */
    const matrix: HostStatusRow[] = [];
    const nonOk: NonOkRow[] = [];
    const originMs: Record<string, number> = {};
    const internal: SourceRow[] = [];
    const diagErrors: string[] = [];
    for (const [mx, , nk, ot, , it] of perZone) {
        if (!mx.available && mx.error) diagErrors.push(mx.error);
        matrix.push(...mx.data);
        nonOk.push(...nk.data);
        internal.push(...it.data);
        Object.assign(originMs, ot.data);
    }
    const findings = diagnose({
        health: hostHealth(matrix, originMs),
        nonOk,
        functions: functions.data,
        services,
        internal,
    });
    // Everything shown as "health" below counts visitor requests only.
    const health: HostHealth[] = hostHealth(
        visitorOnly(matrix, internal),
        originMs,
    );
    const critical = findings.filter((f) => f.severity === "critical");
    const warning = findings.filter((f) => f.severity === "warning");
    const worstSev = new Map<string, Severity>();
    for (const f of findings) {
        const prev = worstSev.get(f.host);
        if (!prev || RANK[f.severity] < RANK[prev])
            worstSev.set(f.host, f.severity);
    }

    /* ---- service cards */
    const healthBy = new Map(health.map((h) => [h.host, h]));
    const known = new Set(services.map((s) => s.host));
    const cards: ServiceCard[] = services.map((s) => {
        const h = healthBy.get(s.host);
        const byClass = h?.byClass || {
            "1xx": 0,
            "2xx": 0,
            "3xx": 0,
            "4xx": 0,
            "5xx": 0,
        };
        const worstClass = (["5xx", "4xx", "3xx"] as StatusClass[]).find(
            (c) => byClass[c] > 0,
        );
        const worst = worstClass
            ? h?.byStatus.find(
                  (b) => `${Math.floor(b.status / 100)}xx` === worstClass,
              )
            : undefined;
        const sev = worstSev.get(s.host);
        return {
            host: s.host,
            label: s.label,
            zoneName: s.zoneName,
            backends: s.backends,
            total: h?.total || 0,
            byClass,
            worst,
            severity: !h?.total
                ? "idle"
                : sev === "critical" || sev === "warning"
                  ? sev
                  : "ok",
        };
    });
    cards.sort(
        (a, b) => RANK[a.severity] - RANK[b.severity] || b.total - a.total,
    );

    /* ---- zone summaries → KPIs */
    const sums = perZone.map((p) => p[4]);
    const sumErr = sums.find((s) => !s.available)?.error;
    const series = mergeByTs(
        sums.map((s) => s.points),
        (a, b) => ({
            ts: a.ts,
            requests: a.requests + b.requests,
            bytes: a.bytes + b.bytes,
            cached: a.cached + b.cached,
            threats: a.threats + b.threats,
            uniques: a.uniques + b.uniques,
        }),
    );
    const tot = (k: keyof Omit<SummaryPoint, "ts">) =>
        series.reduce((a, p) => a + p[k], 0);
    const countries = new Map<string, number>();
    for (const s of sums) {
        for (const c of s.countries)
            countries.set(c.code, (countries.get(c.code) || 0) + c.requests);
    }
    // Status KPIs use visitor-only counts (zone summaries include internal
    // Early Hints lookups, which inflate 5xx with harmless 504s).
    const visitorStatus = new Map<number, number>();
    for (const h of health)
        for (const b of h.byStatus)
            visitorStatus.set(
                b.status,
                (visitorStatus.get(b.status) || 0) + b.count,
            );
    let s2 = 0;
    let s5 = 0;
    let sAll = 0;
    for (const h of health) {
        sAll += h.total;
        s2 += h.byClass["2xx"];
        s5 += h.byClass["5xx"];
    }

    /* ---- timeline */
    const timelineLists = perZone.map((p) => p[1]);
    const internalTl = new Map<string, TimelinePoint>();
    for (const p of perZone)
        for (const t of p[6].data) {
            const prev = internalTl.get(t.ts);
            internalTl.set(
                t.ts,
                prev
                    ? {
                          ts: t.ts,
                          "1xx": prev["1xx"] + t["1xx"],
                          "2xx": prev["2xx"] + t["2xx"],
                          "3xx": prev["3xx"] + t["3xx"],
                          "4xx": prev["4xx"] + t["4xx"],
                          "5xx": prev["5xx"] + t["5xx"],
                      }
                    : t,
            );
        }
    const mergedTl = mergeByTs(
        timelineLists.map((t) => t.data),
        (a, b) => ({
            ts: a.ts,
            "1xx": a["1xx"] + b["1xx"],
            "2xx": a["2xx"] + b["2xx"],
            "3xx": a["3xx"] + b["3xx"],
            "4xx": a["4xx"] + b["4xx"],
            "5xx": a["5xx"] + b["5xx"],
        }),
    );
    const timeline = mergedTl.map((p) => {
        const x = internalTl.get(p.ts);
        if (!x) return p;
        const sub = (k: StatusClass) => Math.max(0, p[k] - x[k]);
        return {
            ts: p.ts,
            "1xx": sub("1xx"),
            "2xx": sub("2xx"),
            "3xx": sub("3xx"),
            "4xx": sub("4xx"),
            "5xx": sub("5xx"),
        };
    });

    /* ---- deployments */
    const deploys: DeployRow[] = inv.pages
        .filter((p) => p.latest_deployment?.created_on)
        .map((p) => ({
            project: p.name,
            env: p.latest_deployment?.environment || "production",
            createdOn: p.latest_deployment?.created_on as string,
            host:
                services.find((s) => s.pagesProject === p.name)?.host ||
                p.domains?.find((d) => !d.endsWith(".pages.dev")),
        }))
        .sort((a, b) => b.createdOn.localeCompare(a.createdOn))
        .slice(0, 8);

    return {
        now: Date.now(),
        rangeLabel: w.label,
        rangeKey: w.key,
        serviceCount: services.length,
        state: critical.length
            ? "failing"
            : warning.length
              ? "degraded"
              : "healthy",
        criticalCount: critical.length,
        warningCount: warning.length,
        hostsWith5xx: cards.filter((c) => c.byClass["5xx"] > 0).length,
        kpi: {
            available: sums.length > 0 && sums.some((s) => s.available),
            error: sums.length ? sumErr : "No zones discovered.",
            requests: tot("requests"),
            bytes: tot("bytes"),
            uniques: tot("uniques"),
            threats: tot("threats"),
            cached: tot("cached"),
            status2xx: s2,
            status5xx: s5,
            statusTotal: sAll,
            series,
            bucket:
                (new Date(win.until).getTime() -
                    new Date(win.since).getTime()) /
                    3600_000 >
                72
                    ? "day"
                    : "hour",
        },
        workers,
        services: cards,
        attention: [...critical, ...warning].slice(0, 5).map((f) => ({
            id: f.id,
            severity: f.severity,
            host: f.host,
            status: f.status,
            count: f.count,
            share: f.share,
            title: f.title,
            reason: f.reasons[0] || "",
        })),
        timeline: {
            available: timelineLists.some((t) => t.available),
            error: timelineLists.find((t) => !t.available)?.error,
            points: timeline,
        },
        status: Array.from(visitorStatus, ([code, count]) => ({
            label: String(code),
            count,
        })).sort((a, b) => b.count - a.count),
        countries: Array.from(countries, ([label, value]) => ({
            label,
            value,
        }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10),
        hosts: health.slice(0, 10).map((h) => ({
            host: h.host,
            total: h.total,
            errorRate: h.errorRate,
            known: known.has(h.host),
        })),
        inventory: {
            fetchedAt: inv.fetchedAt,
            counts: {
                pages: inv.pages.length,
                workers: inv.workers.length,
                d1: inv.d1.length,
                kv: inv.kv.length,
                queues: inv.queues.length,
                durableObjects: inv.durableObjects.length,
                workflows: inv.workflows.length,
                zones: inv.zones.length,
            },
            errors: Object.entries(inv.errors)
                .filter(([, e]) => e)
                .map(([section, e]) => ({
                    section,
                    error: e?.error || "unavailable",
                })),
        },
        deadQueues: inv.queues
            .filter((q) => (q.consumers_total_count ?? 0) === 0)
            .map((q) => q.queue_name),
        deploys,
        diagnosticsError: diagErrors[0] || functions.error,
    };
}
