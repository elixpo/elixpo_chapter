/**
 * Diagnostics — "why is this service not returning 2xx?"
 *
 * Pulls status-code evidence from the GraphQL Analytics API and turns it into
 * findings a human can act on. Every field used here was checked against the
 * live account (Free plan zones), which notably does NOT expose: firewall
 * events, edgeTimeToFirstByteMs, referer, ASN, query string, upperTierColo.
 * What it DOES expose and we lean on:
 *
 *   edgeResponseStatus      what the visitor got
 *   originResponseStatus    what the origin said (0 = origin never answered)
 *   cacheStatus             hit / miss / dynamic / …
 *   securityAction/Source   Cloudflare security layer that intervened
 *   requestSource           eyeball / earlyHintsCache / …
 *   avg.originResponseDurationMs
 *   workers + pagesFunctions invocations by status (exceededResources, …)
 *
 * Every function is non-throwing: failures come back as { available:false }.
 */

import { cfGraphQL, getAccountId } from "./cloudflare-api";
import { cached } from "./kv";
import type { Window } from "./metrics";

const TTL = 45;

export * from "./diagnostics-core";
import {
    type FunctionStatusRow,
    type HostStatusRow,
    type NonOkRow,
    type Result,
    type SourceRow,
    type TimelinePoint,
    classOf,
} from "./diagnostics-core";

const ok = <T>(data: T): Result<T> => ({ available: true, data });
const fail = <T>(e: unknown, data: T): Result<T> => ({
    available: false,
    error: (e as Error)?.message || String(e),
    data,
});

/* -------------------------------------------------------------- queries */

const hostFilter = (host?: string) => (host ? ",clientRequestHTTPHost:$h" : "");
const hostVar = (host?: string) => (host ? ",$h:string!" : "");

/** host × edgeResponseStatus counts for the whole zone (or one host). */
export async function statusMatrix(
    zoneId: string,
    w: Window,
    host?: string,
): Promise<Result<HostStatusRow[]>> {
    return cached(
        `dg:mx:${zoneId}:${host || "*"}:${w.since}:${w.until}`,
        TTL,
        async () => {
            try {
                const d = await cfGraphQL<any>(
                    `query($z:String!,$s:Time!,$u:Time!${hostVar(host)}){viewer{zones(filter:{zoneTag:$z}){
                        g:httpRequestsAdaptiveGroups(limit:2000,filter:{datetime_geq:$s,datetime_leq:$u${hostFilter(host)}},orderBy:[count_DESC]){
                            count dimensions{clientRequestHTTPHost edgeResponseStatus}
                        }
                    }}}`,
                    {
                        z: zoneId,
                        s: w.since,
                        u: w.until,
                        ...(host ? { h: host } : {}),
                    },
                );
                const rows = d?.viewer?.zones?.[0]?.g ?? [];
                return ok<HostStatusRow[]>(
                    rows.map((r: any) => ({
                        host: String(r.dimensions.clientRequestHTTPHost || "—"),
                        status: Number(r.dimensions.edgeResponseStatus) || 0,
                        count: r.count ?? 0,
                    })),
                );
            } catch (e) {
                return fail<HostStatusRow[]>(e, []);
            }
        },
    );
}

/** Average origin response time per host (ms). */
export async function originTiming(
    zoneId: string,
    w: Window,
): Promise<Result<Record<string, number>>> {
    return cached(`dg:ot:${zoneId}:${w.since}:${w.until}`, TTL, async () => {
        try {
            const d = await cfGraphQL<any>(
                `query($z:String!,$s:Time!,$u:Time!){viewer{zones(filter:{zoneTag:$z}){
                    g:httpRequestsAdaptiveGroups(limit:500,filter:{datetime_geq:$s,datetime_leq:$u},orderBy:[count_DESC]){
                        count avg{originResponseDurationMs} dimensions{clientRequestHTTPHost}
                    }
                }}}`,
                { z: zoneId, s: w.since, u: w.until },
            );
            const out: Record<string, number> = {};
            for (const r of d?.viewer?.zones?.[0]?.g ?? []) {
                out[r.dimensions.clientRequestHTTPHost] =
                    r.avg?.originResponseDurationMs ?? 0;
            }
            return ok(out);
        } catch (e) {
            return fail<Record<string, number>>(e, {});
        }
    });
}

/** Status-class timeline. Uses 5-minute buckets for windows ≤ 6h, else hourly. */
export async function statusTimeline(
    zoneId: string,
    w: Window,
    host?: string,
): Promise<Result<TimelinePoint[]>> {
    const hours =
        (new Date(w.until).getTime() - new Date(w.since).getTime()) / 3600_000;
    const bucket = hours <= 6 ? "datetimeFiveMinutes" : "datetimeHour";
    return cached(
        `dg:tl:${zoneId}:${host || "*"}:${w.since}:${w.until}`,
        TTL,
        async () => {
            try {
                const d = await cfGraphQL<any>(
                    `query($z:String!,$s:Time!,$u:Time!${hostVar(host)}){viewer{zones(filter:{zoneTag:$z}){
                        g:httpRequestsAdaptiveGroups(limit:10000,filter:{datetime_geq:$s,datetime_leq:$u${hostFilter(host)}},orderBy:[${bucket}_ASC]){
                            count dimensions{${bucket} edgeResponseStatus}
                        }
                    }}}`,
                    {
                        z: zoneId,
                        s: w.since,
                        u: w.until,
                        ...(host ? { h: host } : {}),
                    },
                );
                const byTs = new Map<string, TimelinePoint>();
                for (const r of d?.viewer?.zones?.[0]?.g ?? []) {
                    const ts = r.dimensions[bucket];
                    const p = byTs.get(ts) || {
                        ts,
                        "1xx": 0,
                        "2xx": 0,
                        "3xx": 0,
                        "4xx": 0,
                        "5xx": 0,
                    };
                    p[classOf(Number(r.dimensions.edgeResponseStatus))] +=
                        r.count ?? 0;
                    byTs.set(ts, p);
                }
                return ok(
                    Array.from(byTs.values()).sort((a, b) =>
                        a.ts.localeCompare(b.ts),
                    ),
                );
            } catch (e) {
                return fail<TimelinePoint[]>(e, []);
            }
        },
    );
}

/** Every non-2xx request group with the evidence needed to explain it. */
export async function nonOkDetail(
    zoneId: string,
    w: Window,
    host?: string,
    limit = 400,
    /** Lowest edge status to include (400 = errors only, so 3xx floods don't crowd them out). */
    minStatus = 300,
): Promise<Result<NonOkRow[]>> {
    return cached(
        `dg:nk:${zoneId}:${host || "*"}:${w.since}:${w.until}:${limit}:${minStatus}`,
        TTL,
        async () => {
            try {
                // Two passes: 3xx+ (all non-2xx we care about) — 1xx is negligible.
                const d = await cfGraphQL<any>(
                    `query($z:String!,$s:Time!,$u:Time!${hostVar(host)}){viewer{zones(filter:{zoneTag:$z}){
                        g:httpRequestsAdaptiveGroups(limit:${limit},filter:{datetime_geq:$s,datetime_leq:$u,edgeResponseStatus_geq:${Math.trunc(minStatus)}${hostFilter(host)}},orderBy:[count_DESC]){
                            count dimensions{clientRequestHTTPHost edgeResponseStatus originResponseStatus cacheStatus securityAction securitySource requestSource clientRequestHTTPMethodName clientRequestPath}
                        }
                    }}}`,
                    {
                        z: zoneId,
                        s: w.since,
                        u: w.until,
                        ...(host ? { h: host } : {}),
                    },
                );
                return ok<NonOkRow[]>(
                    (d?.viewer?.zones?.[0]?.g ?? []).map((r: any) => {
                        const x = r.dimensions;
                        return {
                            host: String(x.clientRequestHTTPHost || "—"),
                            status: Number(x.edgeResponseStatus) || 0,
                            originStatus: Number(x.originResponseStatus) || 0,
                            cacheStatus: String(x.cacheStatus || "unknown"),
                            securityAction: String(
                                x.securityAction || "unknown",
                            ),
                            securitySource: String(
                                x.securitySource || "unknown",
                            ),
                            requestSource: String(x.requestSource || "unknown"),
                            method: String(
                                x.clientRequestHTTPMethodName || "—",
                            ),
                            path: String(x.clientRequestPath || "/"),
                            count: r.count ?? 0,
                        };
                    }),
                );
            } catch (e) {
                return fail<NonOkRow[]>(e, []);
            }
        },
    );
}

/** Worker + Pages Functions invocations by outcome (success, exceededResources…). */
export async function functionsHealth(
    w: Window,
): Promise<Result<FunctionStatusRow[]>> {
    return cached(`dg:fn:${w.since}:${w.until}`, TTL, async () => {
        try {
            const a = await getAccountId();
            const d = await cfGraphQL<any>(
                `query($a:String!,$s:Time!,$u:Time!){viewer{accounts(filter:{accountTag:$a}){
                    w:workersInvocationsAdaptive(limit:500,filter:{datetime_geq:$s,datetime_leq:$u},orderBy:[sum_requests_DESC]){
                        sum{requests errors} dimensions{scriptName status}
                    }
                    p:pagesFunctionsInvocationsAdaptiveGroups(limit:500,filter:{datetime_geq:$s,datetime_leq:$u},orderBy:[sum_requests_DESC]){
                        sum{requests errors} dimensions{scriptName status}
                    }
                }}}`,
                { a, s: w.since, u: w.until },
            );
            const acc = d?.viewer?.accounts?.[0] || {};
            const map = (rows: any[], kind: "worker" | "pages") =>
                (rows || []).map(
                    (r: any): FunctionStatusRow => ({
                        script: r.dimensions.scriptName,
                        kind,
                        status: r.dimensions.status || "unknown",
                        requests: r.sum?.requests ?? 0,
                        errors: r.sum?.errors ?? 0,
                    }),
                );
            return ok([...map(acc.w, "worker"), ...map(acc.p, "pages")]);
        } catch (e) {
            return fail<FunctionStatusRow[]>(e, []);
        }
    });
}

/**
 * Requests that did not come from visitors (requestSource ≠ eyeball): Early
 * Hints cache lookups, challenge-platform fetches, Worker subrequests. These
 * are a large share of the zone's "5xx" on accounts with Early Hints on.
 */
export async function internalTraffic(
    zoneId: string,
    w: Window,
    host?: string,
): Promise<Result<SourceRow[]>> {
    return cached(
        `dg:in:${zoneId}:${host || "*"}:${w.since}:${w.until}`,
        TTL,
        async () => {
            try {
                const d = await cfGraphQL<any>(
                    `query($z:String!,$s:Time!,$u:Time!${hostVar(host)}){viewer{zones(filter:{zoneTag:$z}){
                        g:httpRequestsAdaptiveGroups(limit:5000,filter:{datetime_geq:$s,datetime_leq:$u,requestSource_neq:"eyeball"${hostFilter(host)}},orderBy:[count_DESC]){
                            count dimensions{clientRequestHTTPHost edgeResponseStatus requestSource}
                        }
                    }}}`,
                    {
                        z: zoneId,
                        s: w.since,
                        u: w.until,
                        ...(host ? { h: host } : {}),
                    },
                );
                return ok<SourceRow[]>(
                    (d?.viewer?.zones?.[0]?.g ?? []).map((r: any) => ({
                        host: String(r.dimensions.clientRequestHTTPHost || "—"),
                        status: Number(r.dimensions.edgeResponseStatus) || 0,
                        requestSource: String(
                            r.dimensions.requestSource || "unknown",
                        ),
                        count: r.count ?? 0,
                    })),
                );
            } catch (e) {
                return fail<SourceRow[]>(e, []);
            }
        },
    );
}

/** Status-class timeline of non-visitor requests only (same buckets as statusTimeline). */
export async function internalTimeline(
    zoneId: string,
    w: Window,
    host?: string,
): Promise<Result<TimelinePoint[]>> {
    const hours =
        (new Date(w.until).getTime() - new Date(w.since).getTime()) / 3600_000;
    const bucket = hours <= 6 ? "datetimeFiveMinutes" : "datetimeHour";
    return cached(
        `dg:itl:${zoneId}:${host || "*"}:${w.since}:${w.until}`,
        TTL,
        async () => {
            try {
                const d = await cfGraphQL<any>(
                    `query($z:String!,$s:Time!,$u:Time!${hostVar(host)}){viewer{zones(filter:{zoneTag:$z}){
                        g:httpRequestsAdaptiveGroups(limit:10000,filter:{datetime_geq:$s,datetime_leq:$u,requestSource_neq:"eyeball"${hostFilter(host)}},orderBy:[${bucket}_ASC]){
                            count dimensions{${bucket} edgeResponseStatus}
                        }
                    }}}`,
                    {
                        z: zoneId,
                        s: w.since,
                        u: w.until,
                        ...(host ? { h: host } : {}),
                    },
                );
                const byTs = new Map<string, TimelinePoint>();
                for (const r of d?.viewer?.zones?.[0]?.g ?? []) {
                    const ts = r.dimensions[bucket];
                    const p = byTs.get(ts) || {
                        ts,
                        "1xx": 0,
                        "2xx": 0,
                        "3xx": 0,
                        "4xx": 0,
                        "5xx": 0,
                    };
                    p[classOf(Number(r.dimensions.edgeResponseStatus))] +=
                        r.count ?? 0;
                    byTs.set(ts, p);
                }
                return ok(
                    Array.from(byTs.values()).sort((a, b) =>
                        a.ts.localeCompare(b.ts),
                    ),
                );
            } catch (e) {
                return fail<TimelinePoint[]>(e, []);
            }
        },
    );
}
