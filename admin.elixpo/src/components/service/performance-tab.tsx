"use client";

import MetricChart from "@/components/metric-chart";
import {
    DataTable,
    Grid,
    Note,
    PathCell,
    fmtMs,
    fmtUs,
} from "@/components/service/kit";
import type { PerformanceData, ServiceCtx } from "@/components/service/types";
import {
    C,
    KpiTile,
    Panel,
    SectionError,
    fmt,
    fmtBytes,
} from "@/components/ui";
import type { DimRow } from "@/lib/service-metrics";
import { Box } from "@mui/material";

function MsBar({ ms, max }: { ms: number; max: number }) {
    const color = ms > 2000 ? C.orange : ms > 600 ? C.yellow : C.green;
    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                justifyContent: "flex-end",
            }}
        >
            <Box
                sx={{
                    width: 70,
                    height: 6,
                    borderRadius: 99,
                    bgcolor: C.paperDeep,
                    overflow: "hidden",
                    display: { xs: "none", sm: "block" },
                }}
            >
                <Box
                    sx={{
                        width: `${Math.min(100, (ms / (max || 1)) * 100)}%`,
                        height: "100%",
                        bgcolor: color,
                    }}
                />
            </Box>
            <Box component="span" sx={{ minWidth: 62, textAlign: "right" }}>
                {fmtMs(ms)}
            </Box>
        </Box>
    );
}

export default function PerformanceTab({
    ctx,
    data,
}: { ctx: ServiceCtx; data: PerformanceData }) {
    const pts = data.series.data.points;
    const tot = data.series.data.totals;
    const perf = data.perf.data;
    const maxMs = Math.max(
        ...perf.paths.map((p) => p.originMs || 0),
        ...perf.slowest.map((p) => p.originMs || 0),
        1,
    );
    const w = data.worker?.data;
    const wq = w?.quantiles;

    const pathCols = [
        {
            key: "label",
            label: "Path",
            render: (r: DimRow) => <PathCell path={r.label} max={360} />,
        },
        {
            key: "count",
            label: "Requests",
            align: "right" as const,
            mono: true,
            render: (r: DimRow) => fmt(r.count),
        },
        {
            key: "originMs",
            label: "Avg origin",
            align: "right" as const,
            mono: true,
            render: (r: DimRow) => <MsBar ms={r.originMs || 0} max={maxMs} />,
        },
        {
            key: "bpr",
            label: "Bytes / req",
            align: "right" as const,
            mono: true,
            render: (r: DimRow) =>
                r.count ? fmtBytes(Math.round((r.bytes || 0) / r.count)) : "—",
        },
    ];

    return (
        <Box>
            {!data.series.available && (
                <Box sx={{ mb: 1.5 }}>
                    <SectionError
                        message={`Series unavailable: ${data.series.error}`}
                    />
                </Box>
            )}
            <Grid min={180}>
                <KpiTile
                    label="Avg origin response"
                    value={fmtMs(tot.originMs)}
                    spark={pts.map((p) => p.originMs)}
                    color={C.orange}
                />
                <KpiTile
                    label="Bytes / request"
                    value={
                        tot.requests
                            ? fmtBytes(Math.round(tot.bytes / tot.requests))
                            : "—"
                    }
                    spark={pts.map((p) =>
                        p.requests ? p.bytes / p.requests : 0,
                    )}
                    color={C.green}
                />
                <KpiTile
                    label="Slowest path (avg)"
                    value={fmtMs(perf.slowest[0]?.originMs || 0)}
                    sub={perf.slowest[0]?.label}
                />
                {wq && (
                    <>
                        <KpiTile
                            label="Worker CPU p50"
                            value={fmtUs(wq.cpuP50)}
                            sub={w?.script}
                        />
                        <KpiTile
                            label="Worker CPU p99"
                            value={fmtUs(wq.cpuP99)}
                        />
                        <KpiTile
                            label="Worker wall p99"
                            value={fmtUs(wq.wallP99)}
                        />
                    </>
                )}
            </Grid>

            <Grid cols={2}>
                <Panel
                    title={`Avg origin response time (ms) · ${ctx.rangeLabel}`}
                >
                    <MetricChart
                        points={pts}
                        series={[
                            {
                                key: "originMs",
                                label: "Avg origin ms",
                                color: C.orange,
                            },
                        ]}
                    />
                    <Note>
                        Origin time = how long the origin (Pages Function,
                        Worker or server) took to answer Cloudflare. Percentiles
                        (p50/p95/p99) and time-to-first-byte are not exposed on
                        the Free plan, so these are averages.
                    </Note>
                </Panel>
                {data.worker ? (
                    <Panel title="Worker CPU / wall time (ms, successful invocations)">
                        {data.worker.available ? (
                            <MetricChart
                                points={w?.cpuSeries || []}
                                series={[
                                    {
                                        key: "cpuP50",
                                        label: "CPU p50",
                                        color: C.blue,
                                    },
                                    {
                                        key: "cpuP99",
                                        label: "CPU p99",
                                        color: C.orange,
                                    },
                                    {
                                        key: "wallP99",
                                        label: "Wall p99",
                                        color: C.green,
                                    },
                                ]}
                            />
                        ) : (
                            <SectionError
                                message={data.worker.error || "Unavailable"}
                            />
                        )}
                    </Panel>
                ) : (
                    <Panel title="Response weight (bytes / request)">
                        <MetricChart
                            points={pts.map((p) => ({
                                ts: p.ts,
                                kb: p.requests
                                    ? +(p.bytes / p.requests / 1024).toFixed(1)
                                    : 0,
                            }))}
                            series={[
                                {
                                    key: "kb",
                                    label: "KB / request",
                                    color: C.green,
                                },
                            ]}
                        />
                        {data.pagesFn && (
                            <Note>
                                This host runs Pages Functions. Cloudflare does
                                not expose CPU-time quantiles for Pages
                                Functions — see the Functions tab for invocation
                                outcomes.
                            </Note>
                        )}
                    </Panel>
                )}
            </Grid>

            {!data.perf.available && (
                <Box sx={{ mb: 1.5 }}>
                    <SectionError
                        message={`Path timings unavailable: ${data.perf.error}`}
                    />
                </Box>
            )}
            <Grid cols={2}>
                <Panel title="Slowest paths (avg origin time)" dense>
                    <DataTable rows={perf.slowest} cols={pathCols} />
                </Panel>
                <Panel title="Busiest paths — timing & weight" dense>
                    <DataTable rows={perf.paths} cols={pathCols} />
                </Panel>
                <Panel title="By content type" dense>
                    <DataTable
                        rows={perf.contentType}
                        cols={[
                            { key: "label", label: "Content type", mono: true },
                            ...pathCols.slice(1),
                        ]}
                    />
                </Panel>
            </Grid>
        </Box>
    );
}
