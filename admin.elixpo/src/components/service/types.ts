/**
 * Plain-JSON payloads passed from the /dashboard/services server pages to their
 * client views. Type-only imports from server libs (erased at build time).
 */

import type {
    Finding,
    HostStatusRow,
    NonOkRow,
    Result,
    SourceRow,
    TimelinePoint,
} from "@/lib/diagnostics-core";
import type { PagesDetail } from "@/lib/discovery";
import type { ZoneBreakdown } from "@/lib/metrics";
import type {
    AnalyticsExtras,
    CacheData,
    FnData,
    HostDns,
    HostPoint,
    HostTotals,
    PerfData,
    Res,
    SecurityData,
    ThreatData,
    ZoneSettings,
} from "@/lib/service-metrics";
import type { Service } from "@/lib/services";

export const TABS = [
    "overview",
    "analytics",
    "status",
    "performance",
    "cache",
    "security",
    "functions",
    "dns",
] as const;
export type Tab = (typeof TABS)[number];

export interface ServiceCtx {
    service: Service;
    /** false when the host isn't in the catalog but belongs to a zone. */
    known: boolean;
    accountId: string;
    range: string;
    rangeLabel: string;
}

export type SeriesRes = Res<{ points: HostPoint[]; totals: HostTotals }>;

export interface DeploymentLite {
    id: string;
    created_on?: string;
    environment?: string;
    url?: string;
    branch?: string;
    commit?: string;
    message?: string;
    status?: string;
}

export interface OverviewData {
    tab: "overview";
    series: SeriesRes;
    matrix: Result<HostStatusRow[]>;
    breakdown: ZoneBreakdown;
    findings: Finding[];
    findingsError?: string;
    pages: PagesDetail | null;
    deployments: DeploymentLite[];
}
export interface AnalyticsData {
    tab: "analytics";
    series: SeriesRes;
    breakdown: ZoneBreakdown;
    extras: Res<AnalyticsExtras>;
}
export interface StatusData {
    tab: "status";
    timeline: Result<TimelinePoint[]>;
    matrix: Result<HostStatusRow[]>;
    nonOk: Result<NonOkRow[]>;
    internal: Result<SourceRow[]>;
    findings: Finding[];
}
export interface PerformanceData {
    tab: "performance";
    series: SeriesRes;
    perf: Res<PerfData>;
    worker: Res<FnData> | null;
    pagesFn: boolean;
}
export interface CacheTabData {
    tab: "cache";
    cache: Res<CacheData>;
    series: SeriesRes;
    settings: Res<ZoneSettings>;
}
export interface SecurityTabData {
    tab: "security";
    security: Res<SecurityData>;
    threats: Res<ThreatData>;
    settings: Res<ZoneSettings>;
    total: number;
}
export interface FunctionsTabData {
    tab: "functions";
    worker: Res<FnData> | null;
    pages: Res<FnData> | null;
}
export interface DnsTabData {
    tab: "dns";
    dns: Res<HostDns>;
    settings: Res<ZoneSettings>;
    pages: PagesDetail | null;
}

export type TabData =
    | OverviewData
    | AnalyticsData
    | StatusData
    | PerformanceData
    | CacheTabData
    | SecurityTabData
    | FunctionsTabData
    | DnsTabData;

/* ----------------------------------------------------------------- health */

export type Health = "healthy" | "degraded" | "idle";

export function healthOf(
    byClass: Record<string, number>,
    total: number,
): Health {
    if (!total) return "idle";
    if ((byClass["5xx"] || 0) / total > 0.01) return "degraded";
    if ((byClass["4xx"] || 0) / total > 0.2) return "degraded";
    return "healthy";
}

/* ---------------------------------------------------- client-safe helpers */

/** Cache statuses that mean "served from Cloudflare's cache". */
export const CACHE_SERVED = new Set([
    "hit",
    "stale",
    "updating",
    "revalidated",
]);

export { classOf } from "@/lib/diagnostics-core";
