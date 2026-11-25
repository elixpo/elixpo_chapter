"use client";

import MetricChart from "@/components/metric-chart";
import { FindingList } from "@/components/service/findings";
import {
    Grid,
    KV,
    Note,
    Pill,
    TextLink,
    Wide,
    fmtMs,
    fmtTs,
    pct,
} from "@/components/service/kit";
import {
    CACHE_SERVED,
    type OverviewData,
    type ServiceCtx,
    classOf,
} from "@/components/service/types";
import {
    C,
    KpiTile,
    Panel,
    STATUS_COLORS,
    SectionError,
    StatusBar,
    TopList,
    fmt,
    fmtBytes,
    trend,
} from "@/components/ui";
import { Box, Typography } from "@mui/material";

export default function OverviewTab({
    ctx,
    data,
}: { ctx: ServiceCtx; data: OverviewData }) {
    const s = ctx.service;
    const base = `/dashboard/services/${encodeURIComponent(s.host)}`;
    const withRange = (tab: string) =>
        `${base}?tab=${tab}${ctx.range !== "24h" ? `&range=${ctx.range}` : ""}`;
    const pts = data.series.data.points;
    const tot = data.series.data.totals;

    const byClass: Record<string, number> = {
        "1xx": 0,
        "2xx": 0,
        "3xx": 0,
        "4xx": 0,
        "5xx": 0,
    };
    const codes = new Map<number, number>();
    for (const r of data.matrix.data) {
        byClass[classOf(r.status)] += r.count;
        codes.set(r.status, (codes.get(r.status) || 0) + r.count);
    }
    const mTotal = Object.values(byClass).reduce((a, b) => a + b, 0);
    const cacheRows = data.breakdown.cacheStatus;
    const cacheTotal = cacheRows.reduce((a, r) => a + r.count, 0);
    const cacheHit = cacheRows
        .filter((r) => CACHE_SERVED.has(r.label))
        .reduce((a, r) => a + r.count, 0);

    const req = pts.map((p) => p.requests);
    const fivexx = byClass["5xx"];

    return (
        <Box>
            {!data.series.available && (
                <Box sx={{ mb: 1.5 }}>
                    <SectionError
                        message={`Traffic unavailable: ${data.series.error}`}
                    />
                </Box>
            )}
            <Grid min={170}>
                <KpiTile
                    label="Requests"
                    value={fmt(tot.requests)}
                    delta={trend(req)}
                    spark={req}
                    href={withRange("analytics")}
                />
                <KpiTile
                    label="Bandwidth"
                    value={fmtBytes(tot.bytes)}
                    spark={pts.map((p) => p.bytes)}
                    color={C.green}
                    href={withRange("analytics")}
                />
                <KpiTile
                    label="Visits"
                    value={fmt(tot.visits)}
                    spark={pts.map((p) => p.visits)}
                    color={CHART_TEAL}
                />
                <KpiTile
                    label="Cache hit ratio"
                    value={cacheTotal ? pct(cacheHit / cacheTotal) : "—"}
                    sub={
                        cacheTotal
                            ? `${fmt(cacheHit)} served from cache`
                            : "no data"
                    }
                    href={withRange("cache")}
                />
                <KpiTile
                    label="2xx share"
                    value={mTotal ? pct(byClass["2xx"] / mTotal) : "—"}
                    sub={
                        mTotal
                            ? `${fmt(mTotal - byClass["2xx"])} non-2xx`
                            : "no traffic"
                    }
                    color={STATUS_COLORS["2xx"]}
                    href={withRange("status")}
                />
                <KpiTile
                    label="5xx errors"
                    value={fmt(fivexx)}
                    sub={
                        mTotal
                            ? `${pct(fivexx / mTotal, 2)} of requests`
                            : undefined
                    }
                    color={STATUS_COLORS["5xx"]}
                    href={withRange("status")}
                />
                <KpiTile
                    label="Avg origin time"
                    value={fmtMs(tot.originMs)}
                    spark={pts.map((p) => p.originMs)}
                    color={C.orange}
                    href={withRange("performance")}
                />
            </Grid>

            <Grid cols={3}>
                <Wide>
                    <Grid cols={3} mb={0}>
                        <Box
                            sx={{
                                gridColumn: { xs: "auto", lg: "span 2" },
                                minWidth: 0,
                            }}
                        >
                            <Panel title={`Requests · ${ctx.rangeLabel}`}>
                                <MetricChart
                                    points={pts}
                                    series={[
                                        {
                                            key: "requests",
                                            label: "Requests",
                                            color: C.blue,
                                        },
                                        {
                                            key: "visits",
                                            label: "Visits",
                                            color: C.green,
                                        },
                                    ]}
                                    height={210}
                                />
                            </Panel>
                        </Box>
                        <Panel
                            title="Status classes"
                            action={
                                <TextLink href={withRange("status")}>
                                    Details →
                                </TextLink>
                            }
                        >
                            {data.matrix.available ? (
                                <>
                                    <StatusBar
                                        status={Array.from(codes, ([c, n]) => ({
                                            label: String(c),
                                            count: n,
                                        }))}
                                    />
                                    <Box sx={{ mt: 1.75 }}>
                                        {Array.from(codes)
                                            .sort((a, b) => b[1] - a[1])
                                            .slice(0, 6)
                                            .map(([c, n]) => (
                                                <Box
                                                    key={c}
                                                    sx={{
                                                        display: "flex",
                                                        justifyContent:
                                                            "space-between",
                                                        py: 0.45,
                                                        fontSize: "0.78rem",
                                                        borderBottom: `1px solid ${C.border}`,
                                                    }}
                                                >
                                                    <Box
                                                        component="span"
                                                        sx={{
                                                            fontFamily: C.mono,
                                                            color: C.text,
                                                        }}
                                                    >
                                                        {c}
                                                    </Box>
                                                    <Box
                                                        component="span"
                                                        sx={{
                                                            color: C.textDim,
                                                        }}
                                                    >
                                                        {n.toLocaleString()} ·{" "}
                                                        {pct(n / (mTotal || 1))}
                                                    </Box>
                                                </Box>
                                            ))}
                                    </Box>
                                </>
                            ) : (
                                <SectionError
                                    message={data.matrix.error || "Unavailable"}
                                />
                            )}
                        </Panel>
                    </Grid>
                </Wide>

                <Panel title="Top paths" dense>
                    <TopList
                        items={data.breakdown.path.map((d) => ({
                            label: d.label,
                            value: d.count,
                        }))}
                        controls={false}
                    />
                </Panel>
                <Panel title="Top countries" dense>
                    <TopList
                        items={data.breakdown.country.map((d) => ({
                            label: d.label,
                            value: d.count,
                        }))}
                        color={C.green}
                        controls={false}
                    />
                </Panel>
                <Panel
                    title="Issues"
                    dense
                    action={
                        <TextLink href={withRange("status")}>All →</TextLink>
                    }
                >
                    {data.findingsError && (
                        <Box sx={{ p: 1 }}>
                            <SectionError
                                message={`Functions data unavailable: ${data.findingsError}`}
                            />
                        </Box>
                    )}
                    <FindingList
                        findings={data.findings}
                        href={withRange("status")}
                    />
                </Panel>
            </Grid>

            <LinkedResources data={data} ctx={ctx} />
        </Box>
    );
}

const CHART_TEAL = "#0e8a8a";

function LinkedResources({
    data,
    ctx,
}: { data: OverviewData; ctx: ServiceCtx }) {
    const s = ctx.service;
    const p = data.pages;
    const hasAny = s.pagesProject || s.workerScript || s.routes?.length;
    if (!hasAny) {
        return (
            <Panel title="Linked resources">
                <Typography sx={{ fontSize: "0.82rem", color: C.textMuted }}>
                    No Pages project or Worker is attached to {s.host}
                    {s.dnsTarget
                        ? ` — it is answered by DNS (${s.dnsType} → ${s.dnsTarget}).`
                        : "."}
                </Typography>
            </Panel>
        );
    }
    const bind = (
        kind: string,
        items: { label: string; sub?: string; href?: string }[],
    ) =>
        items.length > 0 && (
            <Box sx={{ mb: 1.25 }}>
                <Typography
                    sx={{
                        fontSize: "0.7rem",
                        color: C.textMuted,
                        fontWeight: 650,
                        mb: 0.5,
                    }}
                >
                    {kind}
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                    {items.map((i) =>
                        i.href ? (
                            <Box
                                key={i.label + (i.sub || "")}
                                component="a"
                                href={i.href}
                                sx={{ textDecoration: "none" }}
                            >
                                <Pill tone="blue" mono>
                                    {i.label}
                                    {i.sub ? ` · ${i.sub}` : ""}
                                </Pill>
                            </Box>
                        ) : (
                            <Pill key={i.label} mono>
                                {i.label}
                                {i.sub ? ` · ${i.sub}` : ""}
                            </Pill>
                        ),
                    )}
                </Box>
            </Box>
        );

    return (
        <Grid cols={2}>
            <Panel title="Linked resources">
                <KV
                    rows={[
                        ...(s.pagesProject
                            ? [
                                  {
                                      k: "Pages project",
                                      v: (
                                          <TextLink
                                              href={`/dashboard/projects/${s.pagesProject}`}
                                          >
                                              {s.pagesProject}
                                          </TextLink>
                                      ),
                                  },
                              ]
                            : []),
                        ...(s.functionScript
                            ? [
                                  {
                                      k: "Pages Functions script",
                                      v: s.functionScript,
                                  },
                              ]
                            : []),
                        ...(s.workerScript
                            ? [
                                  {
                                      k: "Worker",
                                      v: (
                                          <TextLink href="/dashboard/workers">
                                              {s.workerScript}
                                          </TextLink>
                                      ),
                                  },
                              ]
                            : []),
                        ...(s.routes?.length
                            ? [{ k: "Routes", v: s.routes.join(", ") }]
                            : []),
                    ]}
                />
                {p ? (
                    <Box sx={{ mt: 1.5 }}>
                        {bind(
                            "D1 databases",
                            p.d1.map((b) => ({
                                label: b.binding,
                                href: b.id
                                    ? `/dashboard/d1/${b.id}`
                                    : undefined,
                            })),
                        )}
                        {bind(
                            "KV namespaces",
                            p.kv.map((b) => ({
                                label: b.binding,
                                href: b.id
                                    ? `/dashboard/kv/${b.id}`
                                    : undefined,
                            })),
                        )}
                        {bind(
                            "Durable Objects",
                            p.durableObjects.map((b) => ({
                                label: b,
                                href: "/dashboard/durable-objects",
                            })),
                        )}
                        {bind(
                            "Queues",
                            p.queues.map((b) => ({
                                label: b,
                                href: "/dashboard/queues",
                            })),
                        )}
                        {bind(
                            "Service bindings",
                            p.services.map((b) => ({ label: b })),
                        )}
                        {bind(
                            "Environment variables",
                            p.vars.map((b) => ({ label: b })),
                        )}
                        {!p.d1.length &&
                            !p.kv.length &&
                            !p.durableObjects.length &&
                            !p.queues.length &&
                            !p.services.length && (
                                <Note>No production bindings on {p.name}.</Note>
                            )}
                    </Box>
                ) : (
                    s.pagesProject && (
                        <Note>Pages project detail unavailable.</Note>
                    )
                )}
            </Panel>
            <Panel title="Latest deployments" dense>
                {data.deployments.length ? (
                    data.deployments.map((d) => (
                        <Box
                            key={d.id}
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1.25,
                                px: 1.5,
                                py: 1,
                                borderBottom: `1px solid ${C.border}`,
                            }}
                        >
                            <Box
                                sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    flexShrink: 0,
                                    bgcolor:
                                        d.status === "success"
                                            ? STATUS_COLORS["2xx"]
                                            : d.status === "failure"
                                              ? C.orange
                                              : C.yellow,
                                }}
                            />
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography
                                    sx={{
                                        fontSize: "0.8rem",
                                        color: C.text,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {d.message?.split("\n")[0] ||
                                        d.id.slice(0, 8)}
                                </Typography>
                                <Typography
                                    sx={{
                                        fontSize: "0.7rem",
                                        color: C.textMuted,
                                        fontFamily: C.mono,
                                    }}
                                >
                                    {d.environment || "—"}
                                    {d.branch ? ` · ${d.branch}` : ""}
                                    {d.commit
                                        ? ` · ${d.commit.slice(0, 7)}`
                                        : ""}
                                    {d.created_on
                                        ? ` · ${fmtTs(d.created_on)}`
                                        : ""}
                                </Typography>
                            </Box>
                            {d.status && (
                                <Pill
                                    tone={
                                        d.status === "success"
                                            ? "green"
                                            : d.status === "failure"
                                              ? "error"
                                              : "warn"
                                    }
                                >
                                    {d.status}
                                </Pill>
                            )}
                        </Box>
                    ))
                ) : (
                    <Box sx={{ p: 1.75 }}>
                        <Typography
                            sx={{ fontSize: "0.8rem", color: C.textMuted }}
                        >
                            {s.pagesProject
                                ? "No deployments returned."
                                : "Deployments are shown for Pages projects only."}
                        </Typography>
                    </Box>
                )}
            </Panel>
        </Grid>
    );
}
