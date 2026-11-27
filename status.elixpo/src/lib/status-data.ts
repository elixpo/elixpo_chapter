/**
 * Status payload builder — the single source of truth for the public status
 * page, used by both the SSR page (app/page.tsx) and the JSON API route
 * (app/api/status/route.ts).
 *
 * How health is measured
 * ----------------------
 * - Only VISITOR traffic counts (requestSource = "eyeball"). Cloudflare's own
 *   internal lookups — chiefly the Early Hints cache, which answers 504 when no
 *   hints are cached — used to make healthy sites look like outages.
 * - Two GraphQL queries per ZONE cover every host at once (24h hourly + 30d
 *   daily). The old design ran two queries per HOST, which on Pages Functions
 *   blew through the 50-subrequest limit and made a random subset of services
 *   render "Monitoring unavailable" / "History unavailable".
 * - 30 days is the longest window Cloudflare allows on these zones' plan.
 */

import { type ChangeLogItem, fetchChangelogs } from "@/lib/changelog";
import { cfGraphQL } from "@/lib/cloudflare-api";
import { discoverAccount } from "@/lib/discovery";
import { knownDomains, metaFor } from "@/lib/enrich";
import { cached } from "@/lib/kv";
import type { DayPoint } from "@/lib/metrics";

export type Health = "operational" | "degraded" | "outage" | "idle";
export type { DayPoint };

export const HISTORY_DAYS = 30;
export const RECENT_HOURS = 24;
/** Current health looks at the last N hours (the current hour is partial). */
const CURRENT_HOURS = 2;

export interface ProductStatus {
    label: string;
    domain?: string;
    repo?: string;
    health: Health;
    /** 30 daily cells, oldest → newest (today is partial). */
    days: DayPoint[];
    /** 24 hourly cells, oldest → newest (current hour is partial). */
    hours: DayPoint[];
    /** Share of non-5xx visitor responses over the 30-day window. */
    uptimePct: number;
    /** Same, over the last 24 hours. */
    uptime24hPct: number;
    /** Visitor requests in the 30-day / 24-hour windows. */
    total30d: number;
    total24h: number;
    /** Visitor requests + 5xx in the "current" window (last 2h). */
    recent: { total: number; errors: number };
    /** Whether the 24h query (which drives current health) succeeded. */
    healthAvailable: boolean;
    /** Whether the 30-day history query succeeded. */
    seriesAvailable: boolean;
}

export interface StatusPayload {
    products: ProductStatus[];
    changelogs: ChangeLogItem[];
    fetchedAt: number;
    monitoringAvailable: boolean;
}

const BASE = "elixpo.com";
/** Domains we never surface on the public status page. */
const EXCLUDE = new Set(["url.elixpo.com", "career.elixpo.com"]);

const TTL = 60;

function health(total: number, fivexx: number): Health {
    if (total === 0) return "idle";
    const ratio = fivexx / total;
    if (ratio < 0.02) return "operational";
    // A tiny sample must not turn one failed request into a declared outage.
    if (ratio < 0.1 || total < 20 || fivexx < 10) return "degraded";
    return "outage";
}

const pct = (total: number, errors: number) =>
    total > 0 ? ((total - errors) / total) * 100 : 100;

/* ------------------------------------------------------------- queries */

type Counts = Map<string, Map<string, { total: number; errors: number }>>;

interface ZoneSeries {
    available: boolean;
    error?: string;
    /** host → bucket key → counts */
    counts: Record<string, Record<string, { total: number; errors: number }>>;
}

/**
 * Visitor requests for every host in `hosts`, bucketed by `dim`
 * ("datetimeHour" or "date"), in ONE query for the whole zone.
 */
async function zoneSeries(
    zoneId: string,
    hosts: string[],
    dim: "datetimeHour" | "date",
    since: Date,
    until: Date,
): Promise<ZoneSeries> {
    const key = `status:v2:${dim}:${zoneId}:${since.toISOString()}:${hosts.length}`;
    return cached<ZoneSeries>(key, TTL, async () => {
        try {
            const d = await cfGraphQL<any>(
                `query($z:String!,$s:Time!,$u:Time!,$h:[string!]){viewer{zones(filter:{zoneTag:$z}){
                    g:httpRequestsAdaptiveGroups(limit:10000,
                        filter:{datetime_geq:$s,datetime_leq:$u,clientRequestHTTPHost_in:$h,requestSource:"eyeball"},
                        orderBy:[${dim}_ASC]){
                        count dimensions{${dim} clientRequestHTTPHost edgeResponseStatus}
                    }
                }}}`,
                {
                    z: zoneId,
                    s: since.toISOString(),
                    u: until.toISOString(),
                    h: hosts,
                },
            );
            const by: Counts = new Map();
            for (const r of d?.viewer?.zones?.[0]?.g ?? []) {
                const host = String(r.dimensions.clientRequestHTTPHost);
                const raw = String(r.dimensions[dim]);
                const bucket =
                    dim === "date" ? raw.slice(0, 10) : raw.slice(0, 13);
                const status = Number(r.dimensions.edgeResponseStatus);
                const hm = by.get(host) || new Map();
                const cur = hm.get(bucket) || { total: 0, errors: 0 };
                cur.total += r.count ?? 0;
                if (status >= 500) cur.errors += r.count ?? 0;
                hm.set(bucket, cur);
                by.set(host, hm);
            }
            const counts: ZoneSeries["counts"] = {};
            for (const [h, m] of by) counts[h] = Object.fromEntries(m);
            return { available: true, counts };
        } catch (e) {
            return {
                available: false,
                error: (e as Error).message,
                counts: {},
            };
        }
    });
}

/* --------------------------------------------------------------- buckets */

/** Floor to the hour so cache keys repeat within the hour. */
function hourFloor(ms: number): Date {
    return new Date(Math.floor(ms / 3600_000) * 3600_000);
}

function hourKeys(now: number): string[] {
    const out: string[] = [];
    for (let i = RECENT_HOURS - 1; i >= 0; i--)
        out.push(new Date(now - i * 3600_000).toISOString().slice(0, 13));
    return out;
}

function dayKeys(now: number): string[] {
    const out: string[] = [];
    for (let i = HISTORY_DAYS - 1; i >= 0; i--)
        out.push(new Date(now - i * 86400_000).toISOString().slice(0, 10));
    return out;
}

function fill(
    keys: string[],
    data: Record<string, { total: number; errors: number }> | undefined,
    suffix: string,
): DayPoint[] {
    return keys.map((k) => ({
        date: `${k}${suffix}`,
        total: data?.[k]?.total ?? 0,
        errors: data?.[k]?.errors ?? 0,
    }));
}

/* ----------------------------------------------------------------- build */

export async function buildStatus(): Promise<StatusPayload> {
    const [inv, changelogs] = await Promise.all([
        discoverAccount().catch(() => null),
        fetchChangelogs(6).catch(() => []),
    ]);

    // Canonical service list — registry domains ∪ discovered Pages projects.
    // Independent of analytics, so the page is never empty.
    const byDomain = new Map<string, { label: string; repo?: string }>();
    for (const p of inv?.pages ?? []) {
        const domain = p.domains?.find((d) => !d.endsWith(".pages.dev"));
        if (!domain || EXCLUDE.has(domain)) continue;
        const meta = metaFor(p.name);
        byDomain.set(domain, { label: meta.label, repo: meta.repo });
    }
    for (const m of knownDomains()) {
        if (EXCLUDE.has(m.domain) || byDomain.has(m.domain)) continue;
        byDomain.set(m.domain, { label: m.label, repo: m.repo });
    }

    const now = Date.now();
    const hourNow = hourFloor(now);
    const until = new Date(now);
    // Hourly: from the start of the hour 23h ago. Daily: 30 days back (the
    // maximum range these zones allow), aligned to the hour for cache reuse.
    const hourSince = new Date(
        hourNow.getTime() - (RECENT_HOURS - 1) * 3600_000,
    );
    const daySince = new Date(
        hourNow.getTime() - (HISTORY_DAYS * 24 - 1) * 3600_000,
    );

    // Group hosts by the zone that owns them.
    const zones = inv?.zones ?? [];
    const zoneOf = (domain: string) =>
        zones
            .filter((z) => domain === z.name || domain.endsWith(`.${z.name}`))
            .sort((a, b) => b.name.length - a.name.length)[0];
    const hostsByZone = new Map<string, string[]>();
    for (const domain of byDomain.keys()) {
        const z = zoneOf(domain);
        if (!z) continue;
        hostsByZone.set(z.id, [...(hostsByZone.get(z.id) || []), domain]);
    }

    // Two queries per zone, all in parallel.
    const perZone = new Map<
        string,
        { hourly: ZoneSeries; daily: ZoneSeries }
    >();
    await Promise.all(
        [...hostsByZone.entries()].map(async ([zoneId, hosts]) => {
            const sorted = [...hosts].sort();
            const [hourly, daily] = await Promise.all([
                zoneSeries(zoneId, sorted, "datetimeHour", hourSince, until),
                zoneSeries(zoneId, sorted, "date", daySince, until),
            ]);
            perZone.set(zoneId, { hourly, daily });
        }),
    );

    const hKeys = hourKeys(now);
    const dKeys = dayKeys(now);

    const products: ProductStatus[] = [...byDomain.entries()].map(
        ([domain, meta]) => {
            const z = zoneOf(domain);
            const series = z ? perZone.get(z.id) : undefined;
            const hours = fill(hKeys, series?.hourly.counts[domain], ":00:00Z");
            const days = fill(dKeys, series?.daily.counts[domain], "");
            const sum = (pts: DayPoint[]) =>
                pts.reduce(
                    (a, p) => ({
                        total: a.total + p.total,
                        errors: a.errors + p.errors,
                    }),
                    { total: 0, errors: 0 },
                );
            const recent = sum(hours.slice(-CURRENT_HOURS));
            const h24 = sum(hours);
            const d30 = sum(days);
            const healthAvailable = !!series?.hourly.available;
            return {
                label: meta.label,
                domain,
                repo: meta.repo,
                health: healthAvailable
                    ? health(recent.total, recent.errors)
                    : "idle",
                days,
                hours,
                uptimePct: pct(d30.total, d30.errors),
                uptime24hPct: pct(h24.total, h24.errors),
                total30d: d30.total,
                total24h: h24.total,
                recent,
                healthAvailable,
                seriesAvailable: !!series?.daily.available,
            } satisfies ProductStatus;
        },
    );

    // Base platform pinned on top, then the busiest services (24h), then the
    // rest alphabetically so quiet services don't jump around.
    products.sort((a, b) => {
        if (a.domain === BASE) return -1;
        if (b.domain === BASE) return 1;
        if (b.total24h !== a.total24h) return b.total24h - a.total24h;
        return a.label.localeCompare(b.label);
    });

    return {
        products,
        changelogs,
        fetchedAt: inv?.fetchedAt ?? now,
        monitoringAvailable: products.some((p) => p.healthAvailable),
    };
}
