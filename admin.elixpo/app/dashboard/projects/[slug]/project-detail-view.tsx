"use client";

import BarChart, { statusBars } from "@/components/bar-chart";
import ExpandableGlobe from "@/components/expandable-globe";
import MetricChart from "@/components/metric-chart";
import {
    C,
    CHART,
    Empty,
    KpiTile,
    PageHeader,
    Panel,
    SectionError,
    StatusChip,
    TopList,
    eyebrow,
    fmt,
    fmtBytes,
    trend,
} from "@/components/ui";
import type { PagesDetail } from "@/lib/discovery";
import type { MetricSeries, ZoneBreakdown } from "@/lib/metrics";
import { Launch, Storage, ViewList } from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import Link from "next/link";
import { ServiceLink } from "../projects-view";

export interface BindingMetric {
    binding: string;
    id: string;
    name: string;
    metrics: MetricSeries;
}

const sumTotals = (t: Record<string, number>) =>
    Object.values(t).reduce((a, b) => a + b, 0);

export default function ProjectDetailView({
    label,
    detail,
    traffic,
    breakdown,
    d1,
    kv,
}: {
    label: string;
    detail: PagesDetail;
    traffic: MetricSeries | null;
    breakdown: ZoneBreakdown | null;
    d1: BindingMetric[];
    kv: BindingMetric[];
}) {
    const reqSpark = traffic?.points.map((p) => Number(p.requests) || 0) || [];
    const bytSpark = traffic?.points.map((p) => Number(p.bytes) || 0) || [];

    return (
        <Box>
            <PageHeader
                title={label}
                subtitle={detail.productionDomain || detail.name}
                timeRange
                action={
                    detail.productionDomain ? (
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: 1,
                            }}
                        >
                            {!detail.productionDomain.endsWith(
                                ".pages.dev",
                            ) && (
                                <ServiceLink
                                    host={detail.productionDomain}
                                    label="Service dashboard"
                                />
                            )}
                            <Box
                                component="a"
                                href={`https://${detail.productionDomain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 0.5,
                                    px: 1.25,
                                    py: 0.45,
                                    borderRadius: "999px",
                                    bgcolor: C.ink,
                                    color: C.panel,
                                    textDecoration: "none",
                                    fontSize: "0.74rem",
                                    fontWeight: 700,
                                    "&:hover": { bgcolor: C.textDim },
                                }}
                            >
                                Open site{" "}
                                <Launch sx={{ fontSize: "0.85rem" }} />
                            </Box>
                        </Box>
                    ) : undefined
                }
            />

            {/* KPIs */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                    gap: 1.5,
                    mb: 1.5,
                }}
            >
                <KpiTile
                    label="Requests"
                    value={
                        traffic?.available
                            ? fmt(traffic.totals.requests || 0)
                            : "—"
                    }
                    delta={trend(reqSpark)}
                    spark={reqSpark}
                    color={C.accent}
                />
                <KpiTile
                    label="Bandwidth"
                    value={
                        traffic?.available
                            ? fmtBytes(traffic.totals.bytes || 0)
                            : "—"
                    }
                    spark={bytSpark}
                    color={C.green}
                />
                <KpiTile
                    label="D1 databases"
                    value={d1.length}
                    color={C.green}
                />
                <KpiTile
                    label="KV namespaces"
                    value={kv.length}
                    color={C.blue}
                />
            </Box>

            {/* traffic over time */}
            {traffic && (
                <Box sx={{ mb: 1.5 }}>
                    <Panel title="Requests over time">
                        {traffic.available ? (
                            <MetricChart
                                points={traffic.points}
                                series={[
                                    {
                                        key: "requests",
                                        label: "Requests",
                                        color: C.accent,
                                    },
                                    {
                                        key: "bytes",
                                        label: "Bytes",
                                        color: C.green,
                                    },
                                ]}
                                height={200}
                            />
                        ) : (
                            <SectionError
                                message={`Traffic unavailable: ${traffic.error}`}
                            />
                        )}
                    </Panel>
                </Box>
            )}

            {/* breakdowns */}
            {breakdown?.available && (
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", lg: "1.4fr 1fr 1fr" },
                        gap: 1.5,
                        mb: 1.5,
                    }}
                >
                    <Panel title="Requests by country">
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: {
                                    xs: "1fr",
                                    sm: "auto 1fr",
                                },
                                gap: 2,
                                alignItems: "center",
                            }}
                        >
                            <ExpandableGlobe
                                country={breakdown.country}
                                size={280}
                            />
                            <TopList
                                items={breakdown.country
                                    .slice(0, 8)
                                    .map((c) => ({
                                        label: c.label,
                                        value: c.count,
                                    }))}
                            />
                        </Box>
                    </Panel>
                    <Panel title="Status Codes">
                        <BarChart
                            data={statusBars(breakdown.status)}
                            height={180}
                        />
                    </Panel>
                    <Panel title="Devices">
                        {breakdown.device.length ? (
                            <BarChart
                                data={breakdown.device.map((d) => ({
                                    label: d.label || "unknown",
                                    value: d.count,
                                }))}
                                height={180}
                            />
                        ) : (
                            <Empty message="No device data." />
                        )}
                    </Panel>
                </Box>
            )}

            {breakdown?.available && (
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: {
                            xs: "1fr",
                            md: "repeat(auto-fit, minmax(340px, 1fr))",
                        },
                        gap: 1.5,
                        mb: 1.5,
                    }}
                >
                    <Panel title="Top paths">
                        <TopList
                            color={C.green}
                            items={breakdown.path.slice(0, 10).map((p) => ({
                                label: p.label,
                                value: p.count,
                            }))}
                        />
                    </Panel>
                    <Panel title="Top browsers">
                        <TopList
                            items={breakdown.browser.slice(0, 10).map((x) => ({
                                label: x.label || "—",
                                value: x.count,
                            }))}
                        />
                    </Panel>
                </Box>
            )}

            {/* bindings — D1 */}
            <Box sx={{ mt: 3, mb: 1.25 }}>
                <Typography sx={eyebrow}>Resources</Typography>
                <Typography
                    sx={{
                        color: C.text,
                        fontWeight: 650,
                        fontSize: "1.5rem",
                        letterSpacing: "-0.045em",
                        lineHeight: 1.1,
                        mt: 0.5,
                    }}
                >
                    Bindings
                </Typography>
            </Box>

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(auto-fit, minmax(300px, 1fr))",
                    },
                    gap: 1.5,
                    mb: 1.5,
                }}
            >
                {d1.map((b) => (
                    <Panel
                        key={b.id}
                        title={`D1 · ${b.binding}`}
                        action={<StatusChip label="D1" tone="info" />}
                    >
                        <Box
                            component={Link}
                            href={`/dashboard/d1/${b.id}`}
                            sx={{ textDecoration: "none", display: "block" }}
                        >
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                    mb: 1,
                                }}
                            >
                                <Storage
                                    sx={{
                                        color: C.green,
                                        fontSize: "1.1rem",
                                    }}
                                />
                                <Typography
                                    sx={{
                                        color: C.text,
                                        fontSize: "0.88rem",
                                        fontWeight: 600,
                                    }}
                                >
                                    {b.name}
                                </Typography>
                            </Box>
                            {b.metrics.available ? (
                                <>
                                    <Box
                                        sx={{ display: "flex", gap: 2, mb: 1 }}
                                    >
                                        <Metric
                                            label="Reads"
                                            value={fmt(
                                                b.metrics.totals.readQueries ||
                                                    0,
                                            )}
                                        />
                                        <Metric
                                            label="Writes"
                                            value={fmt(
                                                b.metrics.totals.writeQueries ||
                                                    0,
                                            )}
                                        />
                                        <Metric
                                            label="Rows read"
                                            value={fmt(
                                                b.metrics.totals.rowsRead || 0,
                                            )}
                                        />
                                    </Box>
                                    <MetricChart
                                        points={b.metrics.points}
                                        series={[
                                            {
                                                key: "readQueries",
                                                label: "Reads",
                                                color: C.green,
                                            },
                                            {
                                                key: "writeQueries",
                                                label: "Writes",
                                                color: CHART[0],
                                            },
                                        ]}
                                        height={120}
                                    />
                                </>
                            ) : (
                                <Empty message="No D1 metrics." />
                            )}
                        </Box>
                    </Panel>
                ))}

                {kv.map((b) => (
                    <Panel
                        key={b.id}
                        title={`KV · ${b.binding}`}
                        action={<StatusChip label="KV" tone="info" />}
                    >
                        <Box
                            component={Link}
                            href="/dashboard/kv"
                            sx={{ textDecoration: "none", display: "block" }}
                        >
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                    mb: 1,
                                }}
                            >
                                <ViewList
                                    sx={{
                                        color: C.blue,
                                        fontSize: "1.1rem",
                                    }}
                                />
                                <Typography
                                    sx={{
                                        color: C.text,
                                        fontSize: "0.88rem",
                                        fontWeight: 600,
                                    }}
                                >
                                    {b.name}
                                </Typography>
                            </Box>
                            {b.metrics.available ? (
                                <>
                                    <Box sx={{ mb: 1 }}>
                                        <Metric
                                            label="Operations"
                                            value={fmt(
                                                sumTotals(b.metrics.totals),
                                            )}
                                        />
                                    </Box>
                                    {b.metrics.points.length > 0 ? (
                                        <MetricChart
                                            points={b.metrics.points}
                                            series={Object.keys(
                                                b.metrics.totals,
                                            ).map((k) => ({
                                                key: k,
                                                label: k,
                                            }))}
                                            height={120}
                                        />
                                    ) : (
                                        <Empty message="No KV operations in window." />
                                    )}
                                </>
                            ) : (
                                <Empty message="No KV metrics." />
                            )}
                        </Box>
                    </Panel>
                ))}
            </Box>

            {/* other bindings + vars */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(auto-fit, minmax(300px, 1fr))",
                    },
                    gap: 1.5,
                }}
            >
                <Panel title="Service & queue bindings">
                    <ChipRow
                        label="Durable Objects"
                        items={detail.durableObjects}
                    />
                    <ChipRow label="Queues" items={detail.queues} />
                    <ChipRow label="Services" items={detail.services} />
                </Panel>
                <Panel title={`Environment variables · ${detail.vars.length}`}>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {detail.vars.length ? (
                            detail.vars.map((v) => (
                                <StatusChip key={v} label={v} tone="neutral" />
                            ))
                        ) : (
                            <Empty message="None." />
                        )}
                    </Box>
                </Panel>
            </Box>
        </Box>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <Box>
            <Typography
                sx={{ ...eyebrow, color: C.textMuted, fontSize: "0.6rem" }}
            >
                {label}
            </Typography>
            <Typography
                sx={{
                    color: C.text,
                    fontSize: "1.3rem",
                    fontWeight: 650,
                    letterSpacing: "-0.045em",
                    lineHeight: 1.15,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {value}
            </Typography>
        </Box>
    );
}

function ChipRow({ label, items }: { label: string; items: string[] }) {
    return (
        <Box sx={{ mb: 1.25 }}>
            <Typography
                sx={{
                    ...eyebrow,
                    color: C.textMuted,
                    fontSize: "0.6rem",
                    mb: 0.6,
                }}
            >
                {label}
            </Typography>
            {items.length ? (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {items.map((i) => (
                        <StatusChip key={i} label={i} tone="info" />
                    ))}
                </Box>
            ) : (
                <Typography sx={{ color: C.textMuted, fontSize: "0.78rem" }}>
                    None
                </Typography>
            )}
        </Box>
    );
}
