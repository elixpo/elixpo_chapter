"use client";

import MetricChart from "@/components/metric-chart";
import type { InventoryKey, OverviewData } from "@/components/overview/data";
import {
    AttentionRow,
    Card,
    Dot,
    HeroGeometry,
    PillLink,
    SectionHead,
    ServiceTile,
    TextLink,
    ago,
    countryName,
} from "@/components/overview/parts";
import TimeRange from "@/components/time-range";
import {
    C,
    CHART,
    Empty,
    KpiTile,
    STATUS_COLORS,
    SectionError,
    StatusBar,
    StatusChip,
    TopList,
    eyebrow,
    fmt,
    fmtBytes,
    trend,
} from "@/components/ui";
import { CheckCircleOutline } from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import Link from "next/link";
import { Suspense } from "react";

const grid = (min: number, gap = 1.5) => ({
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`,
    gap,
});

const pct = (n: number, d: number) =>
    d > 0
        ? `${((n / d) * 100).toFixed(n / d > 0.995 || n / d < 0.1 ? 2 : 1)}%`
        : "—";

const STATE_WORD = {
    healthy: { lead: "All systems", word: "healthy", color: C.green },
    degraded: { lead: "Systems", word: "degraded", color: C.warn },
    failing: { lead: "Services", word: "failing", color: C.orange },
} as const;

const INVENTORY: { key: InventoryKey; label: string; href?: string }[] = [
    { key: "pages", label: "Pages projects", href: "/dashboard/projects" },
    { key: "workers", label: "Workers", href: "/dashboard/workers" },
    { key: "d1", label: "D1 databases", href: "/dashboard/d1" },
    { key: "kv", label: "KV namespaces", href: "/dashboard/kv" },
    { key: "queues", label: "Queues", href: "/dashboard/queues" },
    {
        key: "durableObjects",
        label: "Durable Objects",
        href: "/dashboard/durable-objects",
    },
    { key: "workflows", label: "Workflows", href: "/dashboard/workflows" },
    { key: "zones", label: "Zones", href: "/dashboard/dns" },
];

export default function OverviewView({ data }: { data: OverviewData }) {
    const { kpi, workers } = data;
    const st = STATE_WORD[data.state];
    const issues = data.criticalCount + data.warningCount;

    const s = kpi.series;
    const reqS = s.map((p) => p.requests);
    const cacheS = s.map((p) => (p.requests ? p.cached / p.requests : 0));
    const tl = data.timeline.points;
    const err5S = tl.map((p) => p["5xx"]);
    const ok2S = tl.map((p) => {
        const t = p["1xx"] + p["2xx"] + p["3xx"] + p["4xx"] + p["5xx"];
        return t ? p["2xx"] / t : 0;
    });
    const wReq = workers.points.map((p) => Number(p.requests) || 0);
    const na = (v: string) => (kpi.available ? v : "—");

    const chartPoints = tl.map((p) => ({
        ts: p.ts,
        requests: p["1xx"] + p["2xx"] + p["3xx"] + p["4xx"] + p["5xx"],
        "4xx": p["4xx"],
        "5xx": p["5xx"],
    }));

    const summary = [
        `${data.serviceCount} services`,
        `${data.hostsWith5xx} with server errors in the last ${data.rangeLabel}`,
        issues
            ? `${data.criticalCount} critical · ${data.warningCount} warning`
            : null,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <Box sx={{ display: "grid", gap: { xs: 2.5, md: 3.5 }, minWidth: 0 }}>
            {/* ------------------------------------------------ hero */}
            <Box
                component="section"
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1.55fr 1fr" },
                    gap: { xs: 2, md: 3 },
                    alignItems: "stretch",
                }}
            >
                <Box sx={{ minWidth: 0, py: { md: 1 } }}>
                    <Typography sx={eyebrow}>
                        Elixpo · Cloudflare account
                    </Typography>
                    <Typography
                        component="h1"
                        sx={{
                            mt: 1.25,
                            fontSize: {
                                xs: "2.3rem",
                                sm: "3rem",
                                md: "3.6rem",
                            },
                            fontWeight: 650,
                            lineHeight: 0.95,
                            letterSpacing: "-0.065em",
                            color: C.ink,
                        }}
                    >
                        {st.lead}{" "}
                        <Box component="span" sx={{ color: st.color }}>
                            {st.word}
                        </Box>
                        .
                    </Typography>
                    <Typography
                        sx={{
                            mt: 1.5,
                            color: C.textMuted,
                            fontSize: { xs: "0.9rem", md: "1rem" },
                            lineHeight: 1.5,
                        }}
                    >
                        {summary}
                    </Typography>
                    <Box
                        sx={{
                            mt: 2.25,
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            flexWrap: "wrap",
                        }}
                    >
                        <PillLink href="/dashboard/diagnostics" primary>
                            Open diagnostics
                        </PillLink>
                        <PillLink href="/dashboard/services">
                            All services
                        </PillLink>
                        <Box sx={{ maxWidth: "100%", ml: { sm: "auto" } }}>
                            <Suspense fallback={null}>
                                <TimeRange />
                            </Suspense>
                        </Box>
                    </Box>
                </Box>
                <HeroGeometry
                    state={data.state}
                    label={
                        issues
                            ? `Open issues · ${data.rangeLabel}`
                            : `Live · ${data.rangeLabel}`
                    }
                    count={issues}
                />
            </Box>

            {data.diagnosticsError && (
                <SectionError
                    message={`Some diagnostics data is unavailable: ${data.diagnosticsError}`}
                />
            )}

            {/* ------------------------------------------------ KPIs */}
            <Box component="section">
                <SectionHead
                    kicker={`Account traffic · ${data.rangeLabel} · all zones`}
                />
                {!kpi.available && kpi.error && (
                    <Box sx={{ mb: 1.5 }}>
                        <SectionError
                            message={`Zone analytics unavailable: ${kpi.error}`}
                        />
                    </Box>
                )}
                {/* 8 tiles → an even 4×2 / 2×4 / 1×8 grid at every width. */}
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: {
                            xs: "1fr",
                            sm: "repeat(2, minmax(0, 1fr))",
                            lg: "repeat(4, minmax(0, 1fr))",
                        },
                        gap: 1.5,
                    }}
                >
                    <KpiTile
                        label="Requests"
                        value={na(fmt(kpi.requests))}
                        delta={trend(reqS)}
                        spark={reqS}
                        color={C.blue}
                    />
                    <KpiTile
                        label="Bandwidth"
                        value={na(fmtBytes(kpi.bytes))}
                        spark={s.map((p) => p.bytes)}
                        color={C.green}
                    />
                    <KpiTile
                        label="Unique visitors"
                        value={na(fmt(kpi.uniques))}
                        spark={s.map((p) => p.uniques)}
                        color={CHART[4]}
                        sub={`Sum of ${kpi.bucket === "day" ? "daily" : "hourly"} uniques`}
                    />
                    <KpiTile
                        label="Threats"
                        value={na(fmt(kpi.threats))}
                        spark={s.map((p) => p.threats)}
                        color={C.orange}
                    />
                    <KpiTile
                        label="Cache hit ratio"
                        value={na(pct(kpi.cached, kpi.requests))}
                        spark={cacheS}
                        color={CHART[1]}
                        sub={`${fmt(kpi.cached)} served from cache`}
                    />
                    <KpiTile
                        label="2xx share"
                        value={na(pct(kpi.status2xx, kpi.statusTotal))}
                        spark={ok2S}
                        color={STATUS_COLORS["2xx"]}
                        sub={`${fmt(kpi.status2xx)} successful responses`}
                    />
                    <KpiTile
                        label="5xx errors"
                        value={na(fmt(kpi.status5xx))}
                        spark={err5S}
                        color={STATUS_COLORS["5xx"]}
                        sub={`${pct(kpi.status5xx, kpi.statusTotal)} of responses`}
                        href="/dashboard/diagnostics"
                    />
                    <KpiTile
                        label="Workers invocations"
                        value={
                            workers.available
                                ? fmt(workers.totals.requests || 0)
                                : "—"
                        }
                        delta={trend(wReq)}
                        spark={wReq}
                        color={CHART[0]}
                        sub={
                            workers.available
                                ? `${fmt(workers.totals.errors || 0)} errors · ${pct(workers.totals.errors || 0, workers.totals.requests || 0)} error rate`
                                : workers.error
                        }
                        href="/dashboard/workers"
                    />
                </Box>
            </Box>

            {/* -------------------------------- attention + traffic */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", lg: "1fr 1.35fr" },
                    gap: 1.5,
                }}
            >
                <Card>
                    <SectionHead
                        kicker="Needs attention"
                        title={
                            data.attention.length
                                ? `${issues} finding${issues === 1 ? "" : "s"} to review`
                                : "Nothing to fix"
                        }
                        action={{
                            label: "Diagnostics",
                            href: "/dashboard/diagnostics",
                        }}
                    />
                    {data.attention.length ? (
                        <Box>
                            {data.attention.map((f) => (
                                <AttentionRow key={f.id} f={f} />
                            ))}
                        </Box>
                    ) : (
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1.25,
                                p: 1.5,
                                borderRadius: "14px",
                                bgcolor: C.successBg,
                                color: C.success,
                                fontSize: "0.84rem",
                            }}
                        >
                            <CheckCircleOutline sx={{ fontSize: "1.2rem" }} />
                            No critical or warning findings in the last{" "}
                            {data.rangeLabel}.
                        </Box>
                    )}
                </Card>

                <Card>
                    <SectionHead
                        kicker="Traffic over time"
                        title="Requests vs errors"
                        action={{
                            label: "Status codes",
                            href: "/dashboard/diagnostics",
                        }}
                    />
                    {data.timeline.available && chartPoints.length ? (
                        <MetricChart
                            points={chartPoints}
                            height={210}
                            series={[
                                {
                                    key: "requests",
                                    label: "Requests",
                                    color: C.blue,
                                },
                                {
                                    key: "4xx",
                                    label: "4xx",
                                    color: STATUS_COLORS["4xx"],
                                },
                                {
                                    key: "5xx",
                                    label: "5xx",
                                    color: STATUS_COLORS["5xx"],
                                },
                            ]}
                        />
                    ) : data.timeline.error ? (
                        <SectionError
                            message={`Timeline unavailable: ${data.timeline.error}`}
                        />
                    ) : (
                        <Empty message="No requests in this window." />
                    )}
                    <Box sx={{ mt: 2 }}>
                        <Typography
                            sx={{ ...eyebrow, color: C.textMuted, mb: 1 }}
                        >
                            Status classes · zone totals
                        </Typography>
                        {data.status.length ? (
                            <StatusBar status={data.status} />
                        ) : (
                            <Empty message="No status data." />
                        )}
                    </Box>
                </Card>
            </Box>

            {/* ------------------------------------------- services */}
            <Box component="section">
                <SectionHead
                    kicker={`Services · ${data.serviceCount}`}
                    title="Service health"
                    action={{
                        label: "All services",
                        href: "/dashboard/services",
                    }}
                />
                <Box
                    sx={{
                        display: "flex",
                        gap: 2,
                        flexWrap: "wrap",
                        mb: 1.25,
                        fontSize: "0.72rem",
                        color: C.textMuted,
                    }}
                >
                    {(
                        [
                            ["Failing", STATUS_COLORS["5xx"]],
                            ["Degraded", STATUS_COLORS["4xx"]],
                            ["Healthy", STATUS_COLORS["2xx"]],
                            ["No traffic", C.borderLight],
                        ] as const
                    ).map(([l, c]) => (
                        <Box
                            key={l}
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.75,
                            }}
                        >
                            <Dot color={c} size={7} />
                            {l}
                        </Box>
                    ))}
                </Box>
                {data.services.length ? (
                    <Box sx={grid(250, 1.25)}>
                        {data.services.map((sv) => (
                            <ServiceTile key={sv.host} s={sv} />
                        ))}
                    </Box>
                ) : (
                    <Card>
                        <Empty message="No services discovered." />
                    </Card>
                )}
            </Box>

            {/* -------------------------------------- breakdowns */}
            <Box sx={grid(320)}>
                <Card>
                    <SectionHead
                        kicker="Top countries"
                        title="Where requests come from"
                    />
                    <TopList
                        controls={false}
                        color={C.blue}
                        items={data.countries.map((c) => ({
                            label: countryName(c.label),
                            value: c.value,
                        }))}
                    />
                </Card>
                <Card>
                    <SectionHead
                        kicker="Top hosts"
                        title="Busiest hostnames"
                        action={{
                            label: "Services",
                            href: "/dashboard/services",
                        }}
                    />
                    <TopList
                        controls={false}
                        color={C.green}
                        items={data.hosts.map((h) => ({
                            label: h.host,
                            value: h.total,
                            href: h.known
                                ? `/dashboard/services/${encodeURIComponent(h.host)}`
                                : undefined,
                            chip:
                                h.errorRate > 0.05 ? (
                                    <StatusChip
                                        label={`${Math.round(h.errorRate * 100)}% err`}
                                        tone={
                                            h.errorRate > 0.25
                                                ? "error"
                                                : "warning"
                                        }
                                    />
                                ) : undefined,
                        }))}
                    />
                </Card>
            </Box>

            {/* ------------------------------- inventory + activity */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", lg: "1.25fr 1fr" },
                    gap: 1.5,
                }}
            >
                <Card>
                    <SectionHead kicker="Compute & storage" title="Inventory" />
                    <Box sx={grid(130, 1)}>
                        {INVENTORY.map((it) => (
                            <InventoryTile
                                key={it.key}
                                label={it.label}
                                value={data.inventory.counts[it.key]}
                                href={it.href}
                                failed={data.inventory.errors.some(
                                    (e) => e.section === it.key,
                                )}
                            />
                        ))}
                    </Box>
                    {data.deadQueues.length > 0 && (
                        <Box sx={{ mt: 1.5 }}>
                            <SectionError
                                message={`${data.deadQueues.length} queue${data.deadQueues.length > 1 ? "s have" : " has"} no consumer: ${data.deadQueues.join(", ")}`}
                            />
                        </Box>
                    )}
                    {data.inventory.errors.length > 0 && (
                        <Box sx={{ mt: 1.5, display: "grid", gap: 1 }}>
                            {data.inventory.errors.map((e) => (
                                <SectionError
                                    key={e.section}
                                    message={`${e.section}: ${e.error}`}
                                />
                            ))}
                        </Box>
                    )}
                    <Typography
                        sx={{
                            mt: 1.5,
                            fontFamily: C.mono,
                            fontSize: "0.64rem",
                            color: C.textMuted,
                            letterSpacing: "0.06em",
                        }}
                    >
                        Discovered{" "}
                        {ago(
                            data.now,
                            new Date(data.inventory.fetchedAt).toISOString(),
                        )}
                    </Typography>
                </Card>

                <Card>
                    <SectionHead
                        kicker="Recent activity"
                        title="Latest Pages deployments"
                        action={{
                            label: "Projects",
                            href: "/dashboard/projects",
                        }}
                    />
                    {data.deploys.length ? (
                        <Box>
                            {data.deploys.map((d) => (
                                <Link
                                    key={d.project}
                                    href={`/dashboard/projects/${encodeURIComponent(d.project)}`}
                                    style={{ textDecoration: "none" }}
                                >
                                    <Box
                                        sx={{
                                            display: "grid",
                                            gridTemplateColumns:
                                                "auto 1fr auto",
                                            alignItems: "center",
                                            gap: 1.25,
                                            py: 1,
                                            px: 1,
                                            mx: -1,
                                            borderRadius: "12px",
                                            borderBottom: `1px solid ${C.line}`,
                                            "&:hover": {
                                                bgcolor: C.panelHover,
                                            },
                                        }}
                                    >
                                        <Dot
                                            color={
                                                d.env === "production"
                                                    ? C.green
                                                    : C.blue
                                            }
                                            size={8}
                                        />
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography
                                                sx={{
                                                    fontSize: "0.85rem",
                                                    fontWeight: 650,
                                                    color: C.ink,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {d.project}
                                            </Typography>
                                            <Typography
                                                sx={{
                                                    fontFamily: C.mono,
                                                    fontSize: "0.68rem",
                                                    color: C.textMuted,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {d.host || "—"}
                                            </Typography>
                                        </Box>
                                        <Box
                                            sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 1,
                                            }}
                                        >
                                            <StatusChip
                                                label={d.env}
                                                tone={
                                                    d.env === "production"
                                                        ? "success"
                                                        : "info"
                                                }
                                            />
                                            <Typography
                                                sx={{
                                                    fontFamily: C.mono,
                                                    fontSize: "0.68rem",
                                                    color: C.textMuted,
                                                    minWidth: 52,
                                                    textAlign: "right",
                                                }}
                                            >
                                                {ago(data.now, d.createdOn)}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Link>
                            ))}
                        </Box>
                    ) : (
                        <Empty message="No Pages deployments found." />
                    )}
                    <Box sx={{ mt: 1.5 }}>
                        <TextLink
                            label="Open audit log"
                            href="/dashboard/audit"
                        />
                    </Box>
                </Card>
            </Box>
        </Box>
    );
}

function InventoryTile({
    label,
    value,
    href,
    failed,
}: {
    label: string;
    value: number;
    href?: string;
    failed?: boolean;
}) {
    const tile = (
        <Box
            sx={{
                p: 1.5,
                borderRadius: "14px",
                border: `1px solid ${C.line}`,
                bgcolor: C.paper,
                height: "100%",
                transition: "border-color .15s, background-color .15s",
                "&:hover": href
                    ? { borderColor: C.ink, bgcolor: C.panel }
                    : undefined,
            }}
        >
            <Typography
                sx={{
                    fontSize: "1.65rem",
                    fontWeight: 700,
                    letterSpacing: "-0.05em",
                    lineHeight: 1,
                    color: failed ? C.warn : C.ink,
                }}
            >
                {failed ? "—" : value}
            </Typography>
            <Typography
                sx={{
                    mt: 0.75,
                    fontFamily: C.mono,
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: C.textMuted,
                }}
            >
                {label}
            </Typography>
        </Box>
    );
    return href ? (
        <Link href={href} style={{ textDecoration: "none" }}>
            {tile}
        </Link>
    ) : (
        tile
    );
}
