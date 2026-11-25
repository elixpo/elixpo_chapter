import {
    type DeploymentLite,
    type ServiceCtx,
    TABS,
    type Tab,
    type TabData,
} from "@/components/service/types";
import { getAccountId } from "@/lib/cloudflare-api";
import {
    diagnose,
    functionsHealth,
    hostHealth,
    internalTraffic,
    nonOkDetail,
    statusMatrix,
    statusTimeline,
} from "@/lib/diagnostics";
import type {
    Finding,
    HostStatusRow,
    NonOkRow,
    SourceRow,
} from "@/lib/diagnostics";
import {
    discoverAccount,
    pagesDeployments,
    pagesProjectDetail,
} from "@/lib/discovery";
import { zoneBreakdown } from "@/lib/metrics";
import type { Window } from "@/lib/metrics";
import { rangeWindow } from "@/lib/range";
import {
    analyticsExtras,
    cacheData,
    functionsData,
    hostDns,
    hostSeries,
    perfData,
    securityData,
    zoneSettings,
    zoneThreats,
} from "@/lib/service-metrics";
import { type Service, getService } from "@/lib/services";
import ServiceView from "./service-view";

export const runtime = "edge";
export const dynamic = "force-dynamic";

async function findingsFor(
    service: Service,
    w: Window,
    matrix: HostStatusRow[],
    nonOk: NonOkRow[],
    originMs: number,
    internal: SourceRow[],
): Promise<{ findings: Finding[]; error?: string }> {
    try {
        const fns = await functionsHealth(w);
        const health = hostHealth(matrix, { [service.host]: originMs });
        const findings = diagnose({
            health,
            nonOk,
            functions: fns.data,
            services: [service],
            internal,
        }).filter((f) => f.host === service.host);
        return { findings, error: fns.available ? undefined : fns.error };
    } catch (e) {
        return { findings: [], error: (e as Error).message };
    }
}

async function deployments(project?: string): Promise<DeploymentLite[]> {
    if (!project) return [];
    try {
        const raw = await pagesDeployments(project, 6);
        return raw.map((d: any) => ({
            id: String(d.id || ""),
            created_on: d.created_on,
            environment: d.environment,
            url: d.url,
            branch: d.deployment_trigger?.metadata?.branch,
            commit: d.deployment_trigger?.metadata?.commit_hash,
            message: d.deployment_trigger?.metadata?.commit_message,
            status: d.latest_stage?.status,
        }));
    } catch {
        return [];
    }
}

export default async function ServicePage({
    params,
    searchParams,
}: {
    params: Promise<{ host: string }>;
    searchParams: Promise<{ tab?: string; range?: string }>;
}) {
    const { host: rawHost } = await params;
    const { tab: rawTab, range } = await searchParams;
    const host = decodeURIComponent(rawHost).toLowerCase();
    const tab: Tab = (TABS as readonly string[]).includes(rawTab || "")
        ? (rawTab as Tab)
        : "overview";
    const w = rangeWindow(range);

    let service = await getService(host).catch(() => null);
    const known = !!service;
    if (!service) {
        const inv = await discoverAccount().catch(() => null);
        const zone = inv?.zones
            .filter((z) => host === z.name || host.endsWith(`.${z.name}`))
            .sort((a, b) => b.name.length - a.name.length)[0];
        if (zone) {
            service = {
                host,
                label:
                    host === zone.name
                        ? "@"
                        : host.slice(0, -(zone.name.length + 1)),
                zoneId: zone.id,
                zoneName: zone.name,
                backends: [],
            };
        }
    }
    if (!service) {
        return <ServiceView ctx={null} host={host} tab={tab} data={null} />;
    }

    const accountId = await getAccountId().catch(() => "");
    const ctx: ServiceCtx = {
        service,
        known,
        accountId,
        range: w.key,
        rangeLabel: w.label,
    };
    const s = service;
    const z = s.zoneId;

    let data: TabData;
    switch (tab) {
        case "analytics": {
            const [series, breakdown, extras] = await Promise.all([
                hostSeries(z, w, host),
                zoneBreakdown(z, w, host),
                analyticsExtras(z, w, host),
            ]);
            data = { tab, series, breakdown, extras };
            break;
        }
        case "status": {
            const [timeline, matrix, nonOk, series, internal] =
                await Promise.all([
                    statusTimeline(z, w, host),
                    statusMatrix(z, w, host),
                    nonOkDetail(z, w, host, 500),
                    hostSeries(z, w, host),
                    internalTraffic(z, w, host),
                ]);
            const { findings } = await findingsFor(
                s,
                w,
                matrix.data,
                nonOk.data,
                series.data.totals.originMs,
                internal.data,
            );
            data = { tab, timeline, matrix, nonOk, internal, findings };
            break;
        }
        case "performance": {
            const [series, perf, worker] = await Promise.all([
                hostSeries(z, w, host),
                perfData(z, w, host),
                s.workerScript
                    ? functionsData("worker", s.workerScript, w)
                    : Promise.resolve(null),
            ]);
            data = { tab, series, perf, worker, pagesFn: !!s.functionScript };
            break;
        }
        case "cache": {
            const [cache, series, settings] = await Promise.all([
                cacheData(z, w, host),
                hostSeries(z, w, host),
                zoneSettings(z),
            ]);
            data = { tab, cache, series, settings };
            break;
        }
        case "security": {
            const [security, threats, settings, series] = await Promise.all([
                securityData(z, w, host),
                zoneThreats(z, w),
                zoneSettings(z),
                hostSeries(z, w, host),
            ]);
            data = {
                tab,
                security,
                threats,
                settings,
                total: series.data.totals.requests,
            };
            break;
        }
        case "functions": {
            const [worker, pages] = await Promise.all([
                s.workerScript
                    ? functionsData("worker", s.workerScript, w)
                    : Promise.resolve(null),
                s.functionScript
                    ? functionsData("pages", s.functionScript, w)
                    : Promise.resolve(null),
            ]);
            data = { tab, worker, pages };
            break;
        }
        case "dns": {
            const [dns, settings, pages] = await Promise.all([
                hostDns(z, host, w),
                zoneSettings(z),
                s.pagesProject
                    ? pagesProjectDetail(s.pagesProject).catch(() => null)
                    : Promise.resolve(null),
            ]);
            data = { tab, dns, settings, pages };
            break;
        }
        default: {
            const [series, matrix, breakdown, nonOk, pages, deps, internal] =
                await Promise.all([
                    hostSeries(z, w, host),
                    statusMatrix(z, w, host),
                    zoneBreakdown(z, w, host),
                    nonOkDetail(z, w, host, 300),
                    s.pagesProject
                        ? pagesProjectDetail(s.pagesProject).catch(() => null)
                        : Promise.resolve(null),
                    deployments(s.pagesProject),
                    internalTraffic(z, w, host),
                ]);
            const { findings, error } = await findingsFor(
                s,
                w,
                matrix.data,
                nonOk.data,
                series.data.totals.originMs,
                internal.data,
            );
            data = {
                tab: "overview",
                series,
                matrix,
                breakdown,
                findings,
                findingsError: error,
                pages,
                deployments: deps,
            };
        }
    }

    return <ServiceView ctx={ctx} host={host} tab={tab} data={data} />;
}
