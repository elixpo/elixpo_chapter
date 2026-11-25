"use client";

/**
 * Account-wide diagnostics — which services answer with anything but 2xx,
 * every status code, and why. All filters apply client-side and are mirrored
 * to the URL (?svc=&cls=&code=&sev=&benign=&visitor=) so a view is shareable.
 */

import {
    CodeDistribution,
    CodeGlossary,
    type CodeStat,
} from "@/components/diagnostics/code-distribution";
import {
    type Option,
    PillMulti,
    PillToggle,
    ResetPill,
} from "@/components/diagnostics/filter-bar";
import Findings from "@/components/diagnostics/findings";
import FunctionsOutcomes, {
    type ScriptOwner,
} from "@/components/diagnostics/functions-outcomes";
import HealthMatrix from "@/components/diagnostics/health-matrix";
import RequestExplorer from "@/components/diagnostics/request-explorer";
import { SEV, Section, num, pct } from "@/components/diagnostics/shared";
import StatusTimeline from "@/components/diagnostics/status-timeline";
import {
    C,
    KpiTile,
    PageHeader,
    STATUS_COLORS,
    SectionError,
    eyebrow,
} from "@/components/ui";
import {
    type Finding,
    type FunctionStatusRow,
    type HostStatusRow,
    type NonOkRow,
    STATUS_CLASSES,
    type Severity,
    type SourceRow,
    type StatusClass,
    type TimelinePoint,
    classOf,
    functionOutcomeInfo,
    hostHealth,
    statusInfo,
    visitorOnly,
} from "@/lib/diagnostics-core";
import { Box, Typography } from "@mui/material";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";

export interface DiagPayload {
    range: { key: string; label: string; since: string; until: string };
    zones: { id: string; name: string }[];
    services: {
        host: string;
        label: string;
        zoneName: string;
        pagesProject?: string;
        workerScript?: string;
        functionScript?: string;
    }[];
    matrix: HostStatusRow[];
    internal: SourceRow[];
    originMs: Record<string, number>;
    timeline: TimelinePoint[];
    internalTimeline: TimelinePoint[];
    /** Hosts the timeline was loaded for ([] = every zone). */
    timelineHosts: string[];
    nonOk: NonOkRow[];
    functions: FunctionStatusRow[];
    findings: Finding[];
    errors: { section: string; message: string }[];
}

interface Filters {
    svc: string[];
    cls: StatusClass[];
    code: number[];
    sev: Severity[];
    hideBenign: boolean;
    visitor: boolean;
}

const EMPTY: Filters = {
    svc: [],
    cls: [],
    code: [],
    sev: [],
    hideBenign: false,
    visitor: false,
};

const list = (v: string | null) =>
    (v || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

function readFilters(p: URLSearchParams): Filters {
    return {
        svc: list(p.get("svc")).map((s) => s.toLowerCase()),
        cls: list(p.get("cls")).filter((c): c is StatusClass =>
            (STATUS_CLASSES as string[]).includes(c),
        ),
        code: list(p.get("code"))
            .map(Number)
            .filter((n) => Number.isFinite(n) && n > 0),
        sev: list(p.get("sev")).filter((s): s is Severity => s in SEV),
        hideBenign: p.get("benign") === "hide",
        visitor: p.get("visitor") === "1",
    };
}

function writeFilters(base: URLSearchParams, f: Filters): URLSearchParams {
    const p = new URLSearchParams(base.toString());
    const set = (k: string, v: string) => (v ? p.set(k, v) : p.delete(k));
    set("svc", f.svc.join(","));
    set("cls", f.cls.join(","));
    set("code", f.code.join(","));
    set("sev", f.sev.join(","));
    set("benign", f.hideBenign ? "hide" : "");
    set("visitor", f.visitor ? "1" : "");
    return p;
}

const sumClasses = (p: TimelinePoint) =>
    p["1xx"] + p["2xx"] + p["3xx"] + p["4xx"] + p["5xx"];

export default function DiagnosticsView({ data }: { data: DiagPayload }) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const [f, setF] = useState<Filters>(() =>
        readFilters(new URLSearchParams(params.toString())),
    );
    const [pending, startTransition] = useTransition();

    const update = useCallback(
        (patch: Partial<Filters>) => {
            const next = { ...f, ...patch };
            setF(next);
            const qs = writeFilters(
                new URLSearchParams(window.location.search),
                next,
            ).toString();
            const url = qs ? `${pathname}?${qs}` : pathname;
            if (next.svc.join(",") !== f.svc.join(",")) {
                // Service changes re-query the per-host timeline on the server.
                startTransition(() => router.replace(url, { scroll: false }));
            } else {
                window.history.replaceState(null, "", url);
            }
        },
        [f, pathname, router],
    );

    const toggleCode = useCallback(
        (code: number) =>
            update({
                code: f.code.includes(code)
                    ? f.code.filter((c) => c !== code)
                    : [code],
            }),
        [f.code, update],
    );

    /* -------------------------------------------------------- derived data */

    const known = useMemo(
        () => new Set(data.services.map((s) => s.host)),
        [data.services],
    );
    const hostOk = useCallback(
        (h: string) => !f.svc.length || f.svc.includes(h.toLowerCase()),
        [f.svc],
    );
    const codeOk = useCallback(
        (code: number) => {
            const cls = classOf(code);
            if (f.hideBenign && cls === "3xx") return false;
            if (f.cls.length && !f.cls.includes(cls)) return false;
            if (f.code.length && !f.code.includes(code)) return false;
            return true;
        },
        [f.cls, f.code, f.hideBenign],
    );
    const filtersOn =
        f.svc.length + f.cls.length + f.code.length + f.sev.length > 0 ||
        f.hideBenign ||
        f.visitor;

    const baseRows = useMemo(
        () =>
            f.visitor ? visitorOnly(data.matrix, data.internal) : data.matrix,
        [data.matrix, data.internal, f.visitor],
    );
    const hostRows = useMemo(
        () => baseRows.filter((r) => hostOk(r.host)),
        [baseRows, hostOk],
    );

    const health = useMemo(() => {
        const all = hostHealth(hostRows, data.originMs);
        const narrowed = f.cls.length || f.code.length;
        return narrowed
            ? all.filter((h) => h.byStatus.some((s) => codeOk(s.status)))
            : all;
    }, [hostRows, data.originMs, f.cls, f.code, codeOk]);

    const kpi = useMemo(() => {
        let total = 0;
        const byClass: Record<StatusClass, number> = {
            "1xx": 0,
            "2xx": 0,
            "3xx": 0,
            "4xx": 0,
            "5xx": 0,
        };
        let non2xx = 0;
        for (const r of hostRows) {
            total += r.count;
            const c = classOf(r.status);
            byClass[c] += r.count;
            if (c !== "2xx" && codeOk(r.status)) non2xx += r.count;
        }
        return { total, byClass, non2xx };
    }, [hostRows, codeOk]);

    const internal5xx = useMemo(() => {
        let n = 0;
        let all = 0;
        for (const r of data.matrix)
            if (r.status >= 500 && hostOk(r.host)) all += r.count;
        for (const r of data.internal)
            if (r.status >= 500 && hostOk(r.host)) n += r.count;
        return { n, all };
    }, [data.matrix, data.internal, hostOk]);

    const findings = useMemo(() => {
        return data.findings
            .filter(
                (x) =>
                    hostOk(x.host) &&
                    codeOk(x.status) &&
                    (!f.sev.length || f.sev.includes(x.severity)) &&
                    (!f.visitor || (x.visitorCount ?? x.count) > 0),
            )
            .map((x) =>
                f.visitor && x.visitorCount != null && x.count
                    ? {
                          ...x,
                          count: x.visitorCount,
                          share: (x.share * x.visitorCount) / x.count,
                      }
                    : x,
            );
    }, [data.findings, hostOk, codeOk, f.sev, f.visitor]);

    const criticalHosts = useMemo(
        () =>
            new Set(
                findings
                    .filter((x) => x.severity === "critical")
                    .map((x) => x.host),
            ).size,
        [findings],
    );

    // Script → owning service(s), so pages-worker--N-production reads as a project.
    const owners = useMemo(() => {
        const o: Record<string, ScriptOwner> = {};
        for (const s of data.services) {
            if (s.functionScript) {
                o[s.functionScript] ??= {
                    name: s.pagesProject || s.functionScript,
                    hosts: [],
                };
                o[s.functionScript].hosts.push(s.host);
            }
            if (s.workerScript) {
                o[s.workerScript] ??= { name: s.workerScript, hosts: [] };
                o[s.workerScript].hosts.push(s.host);
            }
        }
        return o;
    }, [data.services]);

    const fnRows = useMemo(
        () =>
            data.functions.filter((r) => {
                if (
                    f.svc.length &&
                    !owners[r.script]?.hosts.some((h) => hostOk(h))
                )
                    return false;
                if (
                    f.sev.length &&
                    !f.sev.includes(functionOutcomeInfo(r.status).severity)
                )
                    return false;
                return true;
            }),
        [data.functions, f.svc, f.sev, owners, hostOk],
    );
    const fnFail = useMemo(() => {
        let fail = 0;
        let disc = 0;
        for (const r of data.functions) {
            if (f.svc.length && !owners[r.script]?.hosts.some((h) => hostOk(h)))
                continue;
            if (r.status === "clientDisconnected") disc += r.requests;
            else if (r.status !== "success") fail += r.requests;
        }
        return { fail, disc };
    }, [data.functions, f.svc, owners, hostOk]);

    const timeline = useMemo(() => {
        if (!f.visitor) return data.timeline;
        const minus = new Map(data.internalTimeline.map((p) => [p.ts, p]));
        return data.timeline.map((p) => {
            const m = minus.get(p.ts);
            if (!m) return p;
            const out = { ...p };
            for (const c of STATUS_CLASSES) out[c] = Math.max(0, p[c] - m[c]);
            return out;
        });
    }, [data.timeline, data.internalTimeline, f.visitor]);
    const timelineClasses = useMemo(() => {
        const codeClasses = new Set(f.code.map(classOf));
        return STATUS_CLASSES.filter((c) => {
            if (f.hideBenign && c === "3xx") return false;
            if (f.cls.length && !f.cls.includes(c)) return false;
            if (f.code.length && !codeClasses.has(c)) return false;
            if (c === "1xx") return timeline.some((p) => p["1xx"] > 0);
            return true;
        });
    }, [f.code, f.cls, f.hideBenign, timeline]);
    const series = useMemo(
        () => ({
            total: timeline.map(sumClasses),
            "4xx": timeline.map((p) => p["4xx"]),
            "5xx": timeline.map((p) => p["5xx"]),
            non2xx: timeline.map((p) => sumClasses(p) - p["2xx"]),
            ok: timeline.map((p) => {
                const t = sumClasses(p);
                return t ? (p["2xx"] / t) * 100 : 0;
            }),
        }),
        [timeline],
    );

    const codes: CodeStat[] = useMemo(() => {
        const by = new Map<number, { count: number; hosts: Set<string> }>();
        for (const r of hostRows) {
            const x = by.get(r.status) || {
                count: 0,
                hosts: new Set<string>(),
            };
            x.count += r.count;
            x.hosts.add(r.host);
            by.set(r.status, x);
        }
        return Array.from(by, ([status, x]) => ({
            status,
            count: x.count,
            hosts: x.hosts.size,
        })).sort((a, b) => b.count - a.count);
    }, [hostRows]);

    const explorerRows = useMemo(
        () =>
            data.nonOk.filter(
                (r) =>
                    hostOk(r.host) &&
                    codeOk(r.status) &&
                    (!f.visitor || r.requestSource === "eyeball"),
            ),
        [data.nonOk, hostOk, codeOk, f.visitor],
    );

    const glossaryCodes = useMemo(
        () =>
            codes
                .map((c) => c.status)
                .filter((c) => codeOk(c) && c >= 300)
                .sort((a, b) => a - b),
        [codes, codeOk],
    );

    /* ------------------------------------------------------ filter options */

    const hostOptions: Option<string>[] = useMemo(() => {
        const totals = new Map<string, number>();
        for (const r of data.matrix)
            totals.set(r.host, (totals.get(r.host) || 0) + r.count);
        const svc = data.services.map((s) => ({
            value: s.host,
            label: s.host,
            hint: totals.has(s.host) ? num(totals.get(s.host) || 0) : "idle",
            group: "Services",
        }));
        const others = Array.from(totals)
            .filter(([h]) => !known.has(h))
            .sort((a, b) => b[1] - a[1])
            .map(([h, n]) => ({
                value: h.toLowerCase(),
                label: h,
                hint: num(n),
                group: "Unlisted hosts (wildcard / scanners / subrequests)",
            }));
        return [...svc, ...others];
    }, [data.matrix, data.services, known]);

    const classOptions: Option<StatusClass>[] = STATUS_CLASSES.map((c) => ({
        value: c,
        label: c,
        color: STATUS_COLORS[c],
        hint: num(kpi.byClass[c]),
    }));
    const codeOptions: Option<number>[] = useMemo(() => {
        const all = new Map<number, number>();
        for (const r of baseRows)
            all.set(r.status, (all.get(r.status) || 0) + r.count);
        return Array.from(all)
            .sort((a, b) => a[0] - b[0])
            .map(([code, n]) => ({
                value: code,
                label: `${code} ${statusInfo(code).name}`,
                hint: num(n),
                color: STATUS_COLORS[classOf(code)],
                group: classOf(code),
            }));
    }, [baseRows]);
    const sevOptions: Option<Severity>[] = (
        ["critical", "warning", "info"] as Severity[]
    ).map((s) => ({
        value: s,
        label: SEV[s].label,
        color: SEV[s].color,
        hint: String(data.findings.filter((x) => x.severity === s).length),
    }));

    const err = (section: string) =>
        data.errors
            .filter((e) => e.section === section)
            .map((e) => (
                <Box key={e.message} sx={{ mb: 1.5 }}>
                    <SectionError
                        message={`Could not load ${section}: ${e.message}`}
                    />
                </Box>
            ));

    const ok2xx = kpi.total ? kpi.byClass["2xx"] / kpi.total : 0;
    const svcPending =
        pending || f.svc.slice(0, 8).join(",") !== data.timelineHosts.join(",");

    return (
        <Box sx={{ minWidth: 0 }}>
            <PageHeader
                title="Diagnostics"
                subtitle={`Every response that wasn't 2xx across ${data.zones.map((z) => z.name).join(" + ") || "the account"}, and the evidence for why — last ${data.range.label}.`}
                timeRange
            />

            {/* ------------------------------------------------ filter bar */}
            <Box
                sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 0.75,
                    p: 1,
                    mb: 2,
                    borderRadius: "22px",
                    border: `1px solid ${C.line}`,
                    bgcolor: C.panel,
                }}
            >
                <Typography sx={{ ...eyebrow, px: 1, color: C.textMuted }}>
                    Filter
                </Typography>
                <PillMulti
                    label="Service"
                    allLabel="All services"
                    options={hostOptions}
                    value={f.svc}
                    onChange={(svc) => update({ svc })}
                    searchable
                />
                <PillMulti
                    label="Class"
                    allLabel="All classes"
                    options={classOptions}
                    value={f.cls}
                    onChange={(cls) => update({ cls })}
                />
                <PillMulti
                    label="Code"
                    allLabel="All codes"
                    options={codeOptions}
                    value={f.code}
                    onChange={(code) => update({ code })}
                    searchable
                />
                <PillMulti
                    label="Severity"
                    allLabel="All severities"
                    options={sevOptions}
                    value={f.sev}
                    onChange={(sev) => update({ sev })}
                />
                <PillToggle
                    label="Hide benign redirects (3xx/304)"
                    on={f.hideBenign}
                    onChange={(hideBenign) => update({ hideBenign })}
                />
                <PillToggle
                    label="Visitor requests only"
                    on={f.visitor}
                    onChange={(visitor) => update({ visitor })}
                    title="Drop Cloudflare-internal requests (Early Hints cache lookups, challenge-platform fetches, Worker subrequests)"
                />
                <ResetPill
                    onClick={() => update({ ...EMPTY })}
                    disabled={!filtersOn}
                />
            </Box>

            {err("all")}

            {/* ------------------------------------- internal-noise callout */}
            {!f.visitor &&
                internal5xx.all > 0 &&
                internal5xx.n / internal5xx.all > 0.3 && (
                    <Box
                        sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: 2,
                            p: { xs: 2, md: 2.5 },
                            mb: 2,
                            borderRadius: "22px",
                            bgcolor: C.ink,
                            color: "#fff",
                        }}
                    >
                        <Box sx={{ flex: "1 1 380px", minWidth: 0 }}>
                            <Typography sx={{ ...eyebrow, color: "#9fb8ff" }}>
                                Read this first
                            </Typography>
                            <Typography
                                sx={{
                                    fontWeight: 650,
                                    fontSize: { xs: "1.1rem", md: "1.3rem" },
                                    letterSpacing: "-0.04em",
                                    mt: 0.5,
                                }}
                            >
                                {pct(internal5xx.n / internal5xx.all, 0)} of the
                                5xx ({num(internal5xx.n)} of{" "}
                                {num(internal5xx.all)}) never reached a visitor.
                            </Typography>
                            <Typography
                                sx={{
                                    fontSize: "0.82rem",
                                    opacity: 0.75,
                                    mt: 0.5,
                                    maxWidth: 720,
                                }}
                            >
                                They are Cloudflare's own requests — mostly
                                Early Hints cache lookups (requestSource =
                                earlyHintsCache) that log 504 / origin 0 when no
                                hints are cached. Switch to visitor requests to
                                see what people actually got.
                            </Typography>
                        </Box>
                        <Box
                            component="button"
                            onClick={() => update({ visitor: true })}
                            sx={{
                                border: "none",
                                cursor: "pointer",
                                px: 2,
                                py: 0.9,
                                borderRadius: "999px",
                                bgcolor: "#fff",
                                color: C.ink,
                                fontWeight: 700,
                                fontSize: "0.82rem",
                                fontFamily: "inherit",
                            }}
                        >
                            Show visitor requests only
                        </Box>
                    </Box>
                )}

            {/* ------------------------------------------------------- KPIs */}
            {err("matrix")}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: {
                        xs: "repeat(2, minmax(0,1fr))",
                        sm: "repeat(4, minmax(0,1fr))",
                        lg: "repeat(7, minmax(0,1fr))",
                    },
                    gap: 1.25,
                }}
            >
                <KpiTile
                    label="Requests"
                    value={num(kpi.total)}
                    spark={series.total}
                    color={C.blue}
                    sub={f.visitor ? "visitor requests" : "all requests"}
                />
                <KpiTile
                    label="2xx share"
                    value={pct(ok2xx)}
                    spark={series.ok}
                    color={STATUS_COLORS["2xx"]}
                    sub={`${num(kpi.byClass["2xx"])} ok`}
                />
                <KpiTile
                    label="Non-2xx"
                    value={num(kpi.non2xx)}
                    spark={series.non2xx}
                    color={C.ink}
                    sub={
                        kpi.total
                            ? `${pct(kpi.non2xx / kpi.total)} of traffic`
                            : undefined
                    }
                />
                <KpiTile
                    label="4xx"
                    value={num(kpi.byClass["4xx"])}
                    spark={series["4xx"]}
                    color={STATUS_COLORS["4xx"]}
                    sub={
                        kpi.total
                            ? pct(kpi.byClass["4xx"] / kpi.total)
                            : undefined
                    }
                />
                <KpiTile
                    label="5xx"
                    value={num(kpi.byClass["5xx"])}
                    spark={series["5xx"]}
                    color={STATUS_COLORS["5xx"]}
                    sub={
                        kpi.total
                            ? pct(kpi.byClass["5xx"] / kpi.total)
                            : undefined
                    }
                />
                <KpiTile
                    label="Critical services"
                    value={criticalHosts}
                    color={C.orange}
                    sub={`${findings.length} findings`}
                />
                <KpiTile
                    label="Functions failures"
                    value={num(fnFail.fail)}
                    color={C.orange}
                    sub={`+${num(fnFail.disc)} client disconnects`}
                />
            </Box>

            {/* -------------------------------------------------- findings */}
            <Section
                id="findings"
                kicker="01 · Reasoning"
                title="Why it's not 2xx"
                note="One card per host × status code, ranked by what visitors actually felt. Each reason is computed from the evidence (origin status, cache, security action, request source, Functions outcomes, paths)."
                flush
            >
                <Box
                    sx={{
                        p: data.errors.some((e) => e.section === "explorer")
                            ? 1.5
                            : 0,
                    }}
                >
                    {err("explorer")}
                </Box>
                <Findings
                    findings={findings}
                    onCode={toggleCode}
                    activeCodes={f.code}
                />
            </Section>

            {/* ---------------------------------------------------- matrix */}
            <Section
                id="matrix"
                kicker="02 · Health matrix"
                title="Every host × status class"
                note="Click a row to list every status code it returned. Unlisted hosts are not configured services — wildcard DNS, scanner Host headers or Worker subrequest targets."
                flush
            >
                <HealthMatrix
                    health={health}
                    codeOk={codeOk}
                    known={known}
                    onCode={toggleCode}
                    activeCodes={f.code}
                />
            </Section>

            {/* -------------------------------------------------- timeline */}
            <Section
                id="timeline"
                kicker="03 · Timeline"
                title="Status classes over time"
                note={
                    svcPending && f.svc.length
                        ? "Loading the timeline for the selected services…"
                        : data.timelineHosts.length
                          ? `Showing ${data.timelineHosts.join(", ")}.`
                          : "All hosts in every zone. Pick a service to narrow it."
                }
            >
                {err("timeline")}
                <Box
                    sx={{
                        opacity: svcPending && f.svc.length ? 0.5 : 1,
                        transition: "opacity .2s",
                    }}
                >
                    <StatusTimeline
                        points={timeline}
                        classes={timelineClasses}
                    />
                </Box>
            </Section>

            {/* ---------------------------------------------- distribution */}
            <Section
                id="codes"
                kicker="04 · Distribution"
                title="Every status code seen"
                note="Click a code to filter the whole page to it; click again to clear."
                flush
            >
                <CodeDistribution
                    codes={codes}
                    total={kpi.total}
                    activeCodes={f.code}
                    codeOk={codeOk}
                    onCode={toggleCode}
                />
            </Section>

            {/* -------------------------------------------------- explorer */}
            <Section
                id="requests"
                kicker="05 · Explorer"
                title="Non-2xx requests"
                note="Top request groups by host, status, origin status, cache, security and source. 'No response' means the origin never answered. Blue sources are Cloudflare-internal, not visitors."
                flush
            >
                <RequestExplorer
                    rows={explorerRows}
                    onCode={toggleCode}
                    activeCodes={f.code}
                />
            </Section>

            {/* ------------------------------------------------- functions */}
            <Section
                id="functions"
                kicker="06 · Functions"
                title="Workers & Pages Functions outcomes"
                note="Invocations by script and outcome. exceededResources and scriptThrewException are failures the visitor sees as Cloudflare errors 1102 (503) and 1101 (500)."
                flush
            >
                <Box
                    sx={{
                        p: data.errors.some((e) => e.section === "functions")
                            ? 1.5
                            : 0,
                    }}
                >
                    {err("functions")}
                </Box>
                <FunctionsOutcomes rows={fnRows} owners={owners} />
            </Section>

            {/* -------------------------------------------------- glossary */}
            <Section
                id="reference"
                kicker="07 · Reference"
                title="What each code means"
                note="Meaning, typical causes and what to do, for every non-2xx code in view."
            >
                <CodeGlossary codes={glossaryCodes} />
            </Section>

            <Box sx={{ height: 32 }} />
        </Box>
    );
}
