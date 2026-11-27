/**
 * Per-service (single host) analytics for /dashboard/services/[host] — the
 * Cloudflare "zone dashboard" scoped to one hostname.
 *
 * Every query here was probed against the live account (Free plan zones) on
 * 2026-11-15. Notably NOT available on Free and therefore not used:
 * quantiles on httpRequestsAdaptiveGroups, edgeTimeToFirstByteMs, firewall
 * events, referer/ASN. httpRequests1hGroups only accepts windows ≤ 3 days, so
 * zone-wide threat data switches to httpRequests1dGroups for longer ranges.
 *
 * Every function is non-throwing ({ available, error?, data }) and cached ~45s.
 */

import { CACHE_SERVED } from "@/components/service/types";
import {
    acctPath,
    cfGraphQL,
    cfList,
    cfRest,
    getAccountId,
} from "./cloudflare-api";
import { cached } from "./kv";
import type { Window } from "./metrics";

const TTL = 45;

export interface Res<T> {
    available: boolean;
    error?: string;
    data: T;
}
const ok = <T>(data: T): Res<T> => ({ available: true, data });
const fail = <T>(e: unknown, data: T): Res<T> => ({
    available: false,
    error: (e as Error)?.message || String(e),
    data,
});

async function guard<T>(
    key: string,
    empty: T,
    fn: () => Promise<T>,
): Promise<Res<T>> {
    return cached(key, TTL, async () => {
        try {
            return ok(await fn());
        } catch (e) {
            return fail(e, empty);
        }
    });
}

export interface DimRow {
    label: string;
    count: number;
    bytes?: number;
    visits?: number;
    originMs?: number;
}

/** 5-minute buckets for ≤ 6h windows, hourly otherwise. */
export function bucketFor(w: Window): "datetimeFiveMinutes" | "datetimeHour" {
    const hours =
        (new Date(w.until).getTime() - new Date(w.since).getTime()) / 3600_000;
    return hours <= 6 ? "datetimeFiveMinutes" : "datetimeHour";
}

const HV = "$z:String!,$s:Time!,$u:Time!,$h:string!";
const hf = (extra = "") =>
    `filter:{datetime_geq:$s,datetime_leq:$u,clientRequestHTTPHost:$h${extra}}`;
const vars = (zoneId: string, w: Window, host: string) => ({
    z: zoneId,
    s: w.since,
    u: w.until,
    h: host,
});
const grp = (
    alias: string,
    dims: string,
    limit = 10,
    extra = "",
    order = "count_DESC",
) =>
    `${alias}:httpRequestsAdaptiveGroups(limit:${limit},${hf(extra)},orderBy:[${order}]){count sum{edgeResponseBytes visits} avg{originResponseDurationMs} dimensions{${dims}}}`;

function rows(z: any, alias: string, key: string): DimRow[] {
    return (z?.[alias] || []).map((r: any) => ({
        label: String(r.dimensions?.[key] ?? "") || "(none)",
        count: r.count ?? 0,
        bytes: r.sum?.edgeResponseBytes ?? 0,
        visits: r.sum?.visits ?? 0,
        originMs: Math.max(0, r.avg?.originResponseDurationMs ?? 0),
    }));
}

async function zoneQuery(
    zoneId: string,
    w: Window,
    host: string,
    body: string,
) {
    const d = await cfGraphQL<any>(
        `query(${HV}){viewer{zones(filter:{zoneTag:$z}){${body}}}}`,
        vars(zoneId, w, host),
    );
    return d?.viewer?.zones?.[0] || {};
}

/* -------------------------------------------------------- series + totals */

export interface HostPoint {
    ts: string;
    requests: number;
    bytes: number;
    visits: number;
    originMs: number;
    [k: string]: number | string;
}
export interface HostTotals {
    requests: number;
    bytes: number;
    visits: number;
    originMs: number;
}

/** Requests / bandwidth / visits / avg origin ms over time + window totals. */
export async function hostSeries(
    zoneId: string,
    w: Window,
    host: string,
): Promise<Res<{ points: HostPoint[]; totals: HostTotals }>> {
    const b = bucketFor(w);
    return guard(
        `svc:series:${zoneId}:${host}:${w.since}:${w.until}`,
        {
            points: [],
            totals: { requests: 0, bytes: 0, visits: 0, originMs: 0 },
        },
        async () => {
            const z = await zoneQuery(
                zoneId,
                w,
                host,
                `ts:httpRequestsAdaptiveGroups(limit:10000,${hf()},orderBy:[${b}_ASC]){count sum{edgeResponseBytes visits} avg{originResponseDurationMs} dimensions{${b}}}
                 t:httpRequestsAdaptiveGroups(limit:1,${hf()}){count sum{edgeResponseBytes visits} avg{originResponseDurationMs}}`,
            );
            const points: HostPoint[] = (z.ts || []).map((r: any) => ({
                ts: r.dimensions[b],
                requests: r.count ?? 0,
                bytes: r.sum?.edgeResponseBytes ?? 0,
                visits: r.sum?.visits ?? 0,
                originMs: Math.max(
                    0,
                    Math.round(r.avg?.originResponseDurationMs ?? 0),
                ),
            }));
            const t = z.t?.[0];
            return {
                points,
                totals: {
                    requests: t?.count ?? 0,
                    bytes: t?.sum?.edgeResponseBytes ?? 0,
                    visits: t?.sum?.visits ?? 0,
                    originMs: Math.max(
                        0,
                        Math.round(t?.avg?.originResponseDurationMs ?? 0),
                    ),
                },
            };
        },
    );
}

/* -------------------------------------------------------------- analytics */

export interface AnalyticsExtras {
    contentType: DimRow[];
    botCategory: DimRow[];
    method: DimRow[];
    colo: DimRow[];
    requestSource: DimRow[];
}

/** Traffic dimensions not covered by metrics.zoneBreakdown. */
export async function analyticsExtras(
    zoneId: string,
    w: Window,
    host: string,
): Promise<Res<AnalyticsExtras>> {
    const empty: AnalyticsExtras = {
        contentType: [],
        botCategory: [],
        method: [],
        colo: [],
        requestSource: [],
    };
    return guard(
        `svc:ax:${zoneId}:${host}:${w.since}:${w.until}`,
        empty,
        async () => {
            const z = await zoneQuery(
                zoneId,
                w,
                host,
                `${grp("ct", "edgeResponseContentTypeName", 12)}
             ${grp("bot", "verifiedBotCategory", 12)}
             ${grp("m", "clientRequestHTTPMethodName", 10)}
             ${grp("colo", "coloCode", 15)}
             ${grp("rs", "requestSource", 8)}`,
            );
            return {
                contentType: rows(z, "ct", "edgeResponseContentTypeName"),
                botCategory: rows(z, "bot", "verifiedBotCategory").map((r) => ({
                    ...r,
                    label:
                        r.label === "(none)" ? "Not a verified bot" : r.label,
                })),
                method: rows(z, "m", "clientRequestHTTPMethodName"),
                colo: rows(z, "colo", "coloCode"),
                requestSource: rows(z, "rs", "requestSource"),
            };
        },
    );
}

/* ------------------------------------------------------------ performance */

export interface PerfData {
    paths: DimRow[];
    slowest: DimRow[];
    contentType: DimRow[];
}

export async function perfData(
    zoneId: string,
    w: Window,
    host: string,
): Promise<Res<PerfData>> {
    return guard(
        `svc:perf:${zoneId}:${host}:${w.since}:${w.until}`,
        { paths: [], slowest: [], contentType: [] },
        async () => {
            const z = await zoneQuery(
                zoneId,
                w,
                host,
                `${grp("p", "clientRequestPath", 25)}
                 ${grp("slow", "clientRequestPath", 15, "", "avg_originResponseDurationMs_DESC")}
                 ${grp("ct", "edgeResponseContentTypeName", 10)}`,
            );
            return {
                paths: rows(z, "p", "clientRequestPath"),
                slowest: rows(z, "slow", "clientRequestPath"),
                contentType: rows(z, "ct", "edgeResponseContentTypeName"),
            };
        },
    );
}

/* ------------------------------------------------------------------ cache */

export interface CacheData {
    timeline: { ts: string; [status: string]: number | string }[];
    statuses: string[];
    byStatus: DimRow[];
    uncachedPaths: (DimRow & { cacheStatus: string })[];
    contentTypes: {
        contentType: string;
        cacheStatus: string;
        count: number;
        bytes: number;
    }[];
}

export async function cacheData(
    zoneId: string,
    w: Window,
    host: string,
): Promise<Res<CacheData>> {
    const b = bucketFor(w);
    const empty: CacheData = {
        timeline: [],
        statuses: [],
        byStatus: [],
        uncachedPaths: [],
        contentTypes: [],
    };
    return guard(
        `svc:cache:${zoneId}:${host}:${w.since}:${w.until}`,
        empty,
        async () => {
            const z = await zoneQuery(
                zoneId,
                w,
                host,
                `tl:httpRequestsAdaptiveGroups(limit:10000,${hf()},orderBy:[${b}_ASC]){count dimensions{${b} cacheStatus}}
             ${grp("cs", "cacheStatus", 20)}
             ${grp("cp", "cacheStatus clientRequestPath", 300)}
             ${grp("cct", "cacheStatus edgeResponseContentTypeName", 100)}`,
            );
            const byTs = new Map<
                string,
                { ts: string; [k: string]: number | string }
            >();
            const statuses = new Set<string>();
            for (const r of z.tl || []) {
                const ts = r.dimensions[b];
                const s = String(r.dimensions.cacheStatus || "unknown");
                statuses.add(s);
                const p: { ts: string; [k: string]: number | string } =
                    byTs.get(ts) || { ts };
                p[s] = (Number(p[s]) || 0) + (r.count ?? 0);
                byTs.set(ts, p);
            }
            const st = Array.from(statuses);
            const timeline = Array.from(byTs.values())
                .map((p) => {
                    for (const s of st) p[s] = Number(p[s]) || 0;
                    return p;
                })
                .sort((a, c) => String(a.ts).localeCompare(String(c.ts)));
            return {
                timeline,
                statuses: st,
                byStatus: rows(z, "cs", "cacheStatus"),
                uncachedPaths: (z.cp || [])
                    .filter(
                        (r: any) => !CACHE_SERVED.has(r.dimensions.cacheStatus),
                    )
                    .slice(0, 25)
                    .map((r: any) => ({
                        label: String(r.dimensions.clientRequestPath || "/"),
                        cacheStatus: String(
                            r.dimensions.cacheStatus || "unknown",
                        ),
                        count: r.count ?? 0,
                        bytes: r.sum?.edgeResponseBytes ?? 0,
                        originMs: Math.max(
                            0,
                            r.avg?.originResponseDurationMs ?? 0,
                        ),
                    })),
                contentTypes: (z.cct || []).map((r: any) => ({
                    contentType: String(
                        r.dimensions.edgeResponseContentTypeName || "(none)",
                    ),
                    cacheStatus: String(r.dimensions.cacheStatus || "unknown"),
                    count: r.count ?? 0,
                    bytes: r.sum?.edgeResponseBytes ?? 0,
                })),
            };
        },
    );
}

/* --------------------------------------------------------------- security */

export interface SecurityData {
    action: DimRow[];
    source: DimRow[];
    blocked: DimRow[]; // 403 / 429 counts
    ip4xx: DimRow[];
    country4xx: DimRow[];
    path4xx: DimRow[];
}

export async function securityData(
    zoneId: string,
    w: Window,
    host: string,
): Promise<Res<SecurityData>> {
    const empty: SecurityData = {
        action: [],
        source: [],
        blocked: [],
        ip4xx: [],
        country4xx: [],
        path4xx: [],
    };
    const x4 = ",edgeResponseStatus_geq:400,edgeResponseStatus_lt:500";
    return guard(
        `svc:sec:${zoneId}:${host}:${w.since}:${w.until}`,
        empty,
        async () => {
            const z = await zoneQuery(
                zoneId,
                w,
                host,
                `${grp("sa", "securityAction", 12)}
             ${grp("ss", "securitySource", 12)}
             ${grp("blk", "edgeResponseStatus", 5, ",edgeResponseStatus_in:[403,429]")}
             ${grp("ip", "clientIP", 15, x4)}
             ${grp("c", "clientCountryName", 15, x4)}
             ${grp("p", "clientRequestPath", 15, x4)}`,
            );
            return {
                action: rows(z, "sa", "securityAction"),
                source: rows(z, "ss", "securitySource"),
                blocked: rows(z, "blk", "edgeResponseStatus"),
                ip4xx: rows(z, "ip", "clientIP"),
                country4xx: rows(z, "c", "clientCountryName"),
                path4xx: rows(z, "p", "clientRequestPath"),
            };
        },
    );
}

export interface ThreatData {
    /** Which dataset answered: hourly (≤ 3 days) or daily. */
    granularity: "hour" | "day";
    total: number;
    requests: number;
    points: { ts: string; threats: number; requests: number }[];
    pathing: DimRow[];
    countries: DimRow[];
}

/** Zone-wide threats (no host dimension exists in these datasets). */
export async function zoneThreats(
    zoneId: string,
    w: Window,
): Promise<Res<ThreatData>> {
    const hours =
        (new Date(w.until).getTime() - new Date(w.since).getTime()) / 3600_000;
    const hourly = hours <= 72;
    const empty: ThreatData = {
        granularity: hourly ? "hour" : "day",
        total: 0,
        requests: 0,
        points: [],
        pathing: [],
        countries: [],
    };
    return guard(`svc:thr:${zoneId}:${w.since}:${w.until}`, empty, async () => {
        const fields =
            "sum{requests threats threatPathingMap{threatPathingName requests} countryMap{clientCountryName threats}}";
        const d = hourly
            ? await cfGraphQL<any>(
                  `query($z:String!,$s:Time!,$u:Time!){viewer{zones(filter:{zoneTag:$z}){g:httpRequests1hGroups(limit:1000,filter:{datetime_geq:$s,datetime_leq:$u},orderBy:[datetime_ASC]){${fields} dimensions{datetime}}}}}`,
                  { z: zoneId, s: w.since, u: w.until },
              )
            : await cfGraphQL<any>(
                  `query($z:String!,$s:Date!,$u:Date!){viewer{zones(filter:{zoneTag:$z}){g:httpRequests1dGroups(limit:100,filter:{date_geq:$s,date_leq:$u},orderBy:[date_ASC]){${fields} dimensions{date}}}}}`,
                  {
                      z: zoneId,
                      s: w.since.slice(0, 10),
                      u: w.until.slice(0, 10),
                  },
              );
        const g = d?.viewer?.zones?.[0]?.g || [];
        const path = new Map<string, number>();
        const country = new Map<string, number>();
        let total = 0;
        let requests = 0;
        const points = g.map((r: any) => {
            total += r.sum?.threats ?? 0;
            requests += r.sum?.requests ?? 0;
            for (const p of r.sum?.threatPathingMap || [])
                path.set(
                    p.threatPathingName,
                    (path.get(p.threatPathingName) || 0) + (p.requests ?? 0),
                );
            for (const c of r.sum?.countryMap || [])
                if (c.threats)
                    country.set(
                        c.clientCountryName,
                        (country.get(c.clientCountryName) || 0) + c.threats,
                    );
            return {
                ts: hourly
                    ? r.dimensions.datetime
                    : `${r.dimensions.date}T00:00:00Z`,
                threats: r.sum?.threats ?? 0,
                requests: r.sum?.requests ?? 0,
            };
        });
        const toRows = (m: Map<string, number>) =>
            Array.from(m, ([label, count]) => ({ label, count })).sort(
                (a, b) => b.count - a.count,
            );
        return {
            granularity: hourly ? "hour" : "day",
            total,
            requests,
            points,
            pathing: toRows(path),
            countries: toRows(country).slice(0, 15),
        };
    });
}

/* -------------------------------------------------------------- functions */

export interface FnPoint {
    ts: string;
    [status: string]: number | string;
}
export interface FnData {
    kind: "worker" | "pages";
    script: string;
    timeline: FnPoint[];
    statuses: string[];
    byStatus: {
        status: string;
        requests: number;
        errors: number;
        subrequests?: number;
        cpuP50?: number;
        cpuP99?: number;
        wallP99?: number;
    }[];
    /** Overall quantiles (µs) — Workers only; Pages Functions expose none. */
    quantiles?: { cpuP50: number; cpuP99: number; wallP99: number };
    totals: { requests: number; errors: number; subrequests: number };
    /** Worker only: CPU p50/p99 per hour (ms). */
    cpuSeries?: {
        ts: string;
        cpuP50: number;
        cpuP99: number;
        wallP99: number;
    }[];
}

export async function functionsData(
    kind: "worker" | "pages",
    script: string,
    w: Window,
): Promise<Res<FnData>> {
    const empty: FnData = {
        kind,
        script,
        timeline: [],
        statuses: [],
        byStatus: [],
        totals: { requests: 0, errors: 0, subrequests: 0 },
    };
    return guard(
        `svc:fn:${kind}:${script}:${w.since}:${w.until}`,
        empty,
        async () => {
            const a = await getAccountId();
            const v = { a, s: w.since, u: w.until, n: script };
            const f = "filter:{datetime_geq:$s,datetime_leq:$u,scriptName:$n}";
            const q =
                kind === "worker"
                    ? `tl:workersInvocationsAdaptive(limit:5000,${f},orderBy:[datetimeHour_ASC]){sum{requests errors subrequests} quantiles{cpuTimeP50 cpuTimeP99 wallTimeP99} dimensions{datetimeHour status}}
                   st:workersInvocationsAdaptive(limit:20,${f}){sum{requests errors subrequests} quantiles{cpuTimeP50 cpuTimeP99 wallTimeP99} dimensions{status}}
                   all:workersInvocationsAdaptive(limit:1,${f}){sum{requests errors subrequests} quantiles{cpuTimeP50 cpuTimeP99 wallTimeP99}}`
                    : `tl:pagesFunctionsInvocationsAdaptiveGroups(limit:5000,${f},orderBy:[datetimeHour_ASC]){sum{requests errors} dimensions{datetimeHour status}}
                   st:pagesFunctionsInvocationsAdaptiveGroups(limit:20,${f}){sum{requests errors} dimensions{status}}`;
            const d = await cfGraphQL<any>(
                `query($a:String!,$s:Time!,$u:Time!,$n:string!){viewer{accounts(filter:{accountTag:$a}){${q}}}}`,
                v,
            );
            const acc = d?.viewer?.accounts?.[0] || {};
            const byTs = new Map<string, FnPoint>();
            const statuses = new Set<string>();
            const cpu = new Map<
                string,
                {
                    ts: string;
                    cpuP50: number;
                    cpuP99: number;
                    wallP99: number;
                    n: number;
                }
            >();
            for (const r of acc.tl || []) {
                const ts = r.dimensions.datetimeHour;
                const s = String(r.dimensions.status || "unknown");
                statuses.add(s);
                const p: { ts: string; [k: string]: number | string } =
                    byTs.get(ts) || { ts };
                p[s] = (Number(p[s]) || 0) + (r.sum?.requests ?? 0);
                byTs.set(ts, p);
                if (kind === "worker" && s === "success") {
                    cpu.set(ts, {
                        ts,
                        cpuP50: (r.quantiles?.cpuTimeP50 ?? 0) / 1000,
                        cpuP99: (r.quantiles?.cpuTimeP99 ?? 0) / 1000,
                        wallP99: (r.quantiles?.wallTimeP99 ?? 0) / 1000,
                        n: r.sum?.requests ?? 0,
                    });
                }
            }
            const st = Array.from(statuses);
            const byStatus = (acc.st || [])
                .map((r: any) => ({
                    status: String(r.dimensions.status || "unknown"),
                    requests: r.sum?.requests ?? 0,
                    errors: r.sum?.errors ?? 0,
                    subrequests: r.sum?.subrequests,
                    cpuP50: r.quantiles?.cpuTimeP50,
                    cpuP99: r.quantiles?.cpuTimeP99,
                    wallP99: r.quantiles?.wallTimeP99,
                }))
                .sort((x: any, y: any) => y.requests - x.requests);
            const all = acc.all?.[0];
            const totals = byStatus.reduce(
                (t: FnData["totals"], r: FnData["byStatus"][number]) => ({
                    requests: t.requests + r.requests,
                    errors: t.errors + r.errors,
                    subrequests: t.subrequests + (r.subrequests ?? 0),
                }),
                { requests: 0, errors: 0, subrequests: 0 },
            );
            return {
                kind,
                script,
                statuses: st,
                timeline: Array.from(byTs.values())
                    .map((p) => {
                        for (const s of st) p[s] = Number(p[s]) || 0;
                        return p;
                    })
                    .sort((x, y) => String(x.ts).localeCompare(String(y.ts))),
                byStatus,
                totals,
                quantiles: all?.quantiles
                    ? {
                          cpuP50: all.quantiles.cpuTimeP50 ?? 0,
                          cpuP99: all.quantiles.cpuTimeP99 ?? 0,
                          wallP99: all.quantiles.wallTimeP99 ?? 0,
                      }
                    : undefined,
                cpuSeries:
                    kind === "worker"
                        ? Array.from(cpu.values())
                              .sort((x, y) => x.ts.localeCompare(y.ts))
                              .map(({ n: _n, ...p }) => p)
                        : undefined,
            };
        },
    );
}

/* ------------------------------------------------------------ REST: zone */

export type ZoneSettings = Record<string, unknown>;

/** GET /zones/:id/settings → { id: value }. Read-only. */
export async function zoneSettings(zoneId: string): Promise<Res<ZoneSettings>> {
    return guard(`svc:zs:${zoneId}`, {}, async () => {
        const env = await cfRest<{ id: string; value: unknown }[]>(
            `/zones/${zoneId}/settings`,
        );
        const out: ZoneSettings = {};
        for (const s of env.result || []) out[s.id] = s.value;
        return out;
    });
}

export interface DnsRecordRow {
    id: string;
    type: string;
    name: string;
    content: string;
    proxied?: boolean;
    ttl?: number;
    comment?: string | null;
    modified_on?: string;
}
export interface HostDns {
    records: DnsRecordRow[];
    workerDomains: {
        hostname: string;
        service: string;
        environment?: string;
        enabled?: boolean;
    }[];
    workerRoutes: { pattern: string; script?: string }[];
    queries: { queryType: string; responseCode: string; count: number }[];
    queriesError?: string;
}

/** DNS records, Worker custom domains/routes and DNS query analytics for a host. */
export async function hostDns(
    zoneId: string,
    host: string,
    w: Window,
): Promise<Res<HostDns>> {
    const empty: HostDns = {
        records: [],
        workerDomains: [],
        workerRoutes: [],
        queries: [],
    };
    return guard(
        `svc:dns:${zoneId}:${host}:${w.since}:${w.until}`,
        empty,
        async () => {
            const hostOf = (p: string) => p.split("/")[0].toLowerCase();
            const matches = (pattern: string) => {
                const h = hostOf(pattern);
                if (h === host) return true;
                if (h.startsWith("*")) return host.endsWith(h.slice(1));
                return false;
            };
            const [records, domains, routes, q] = await Promise.all([
                cfList<DnsRecordRow>(
                    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(host)}`,
                ),
                acctPath("/workers/domains")
                    .then((p) => cfList<any>(p))
                    .catch(() => []),
                cfList<any>(`/zones/${zoneId}/workers/routes`).catch(() => []),
                cfGraphQL<any>(
                    `query(${HV}){viewer{zones(filter:{zoneTag:$z}){a:dnsAnalyticsAdaptiveGroups(limit:30,filter:{datetime_geq:$s,datetime_leq:$u,queryName:$h},orderBy:[count_DESC]){count dimensions{queryType responseCode}}}}}`,
                    vars(zoneId, w, host),
                ).then(
                    (d) => ({ ok: true as const, d }),
                    (e) => ({ ok: false as const, e: (e as Error).message }),
                ),
            ]);
            return {
                records: records.map((r) => ({
                    id: r.id,
                    type: r.type,
                    name: r.name,
                    content: r.content,
                    proxied: r.proxied,
                    ttl: r.ttl,
                    comment: r.comment,
                    modified_on: r.modified_on,
                })),
                workerDomains: (domains as any[])
                    .filter((d) => String(d.hostname).toLowerCase() === host)
                    .map((d) => ({
                        hostname: d.hostname,
                        service: d.service,
                        environment: d.environment,
                        enabled: d.enabled,
                    })),
                workerRoutes: (routes as any[])
                    .filter((r) => matches(String(r.pattern)))
                    .map((r) => ({ pattern: r.pattern, script: r.script })),
                queries: q.ok
                    ? (q.d?.viewer?.zones?.[0]?.a || []).map((r: any) => ({
                          queryType: String(r.dimensions.queryType),
                          responseCode: String(r.dimensions.responseCode),
                          count: r.count ?? 0,
                      }))
                    : [],
                queriesError: q.ok ? undefined : q.e,
            };
        },
    );
}
