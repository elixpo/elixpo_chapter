"use client";

import {
    DataTable,
    Grid,
    Note,
    Pill,
    SectionTitle,
    StackedBars,
    fmtUs,
    pct,
} from "@/components/service/kit";
import type { FunctionsTabData, ServiceCtx } from "@/components/service/types";
import {
    C,
    Empty,
    KpiTile,
    Panel,
    SectionError,
    fmt,
    glass,
} from "@/components/ui";
import { functionOutcomeInfo } from "@/lib/diagnostics-core";
import type { FnData, Res } from "@/lib/service-metrics";
import { Box } from "@mui/material";

const OUTCOME_COLORS: Record<string, string> = {
    success: "#2f9e63",
    clientDisconnected: "#9aa39d",
    exceededResources: "#e76043",
    exceededCpu: "#e76043",
    exceededMemory: "#c2412a",
    scriptThrewException: "#a8321f",
    responseStreamDisconnected: "#f0ad16",
    internal: "#7c5cc4",
};

function FnSection({ res, ctx }: { res: Res<FnData>; ctx: ServiceCtx }) {
    const d = res.data;
    const isWorker = d.kind === "worker";
    const t = d.totals;
    const failed = d.byStatus
        .filter(
            (r) => r.status !== "success" && r.status !== "clientDisconnected",
        )
        .reduce((a, r) => a + r.requests, 0);
    const keys = d.statuses
        .slice()
        .sort((a, b) =>
            a === "success" ? -1 : b === "success" ? 1 : a.localeCompare(b),
        )
        .map((k) => ({
            key: k,
            label: functionOutcomeInfo(k).label,
            color: OUTCOME_COLORS[k] || C.yellow,
        }));

    return (
        <Box sx={{ mb: 3 }}>
            <SectionTitle
                note={
                    isWorker
                        ? `Worker script ${d.script} — invocations from every route/domain it serves, not only ${ctx.service.host}.`
                        : `Pages Functions script ${d.script}${ctx.service.pagesProject ? ` (project ${ctx.service.pagesProject})` : ""}.`
                }
            >
                {isWorker ? "Worker" : "Pages Functions"} · {d.script}
            </SectionTitle>
            {!res.available && (
                <Box sx={{ mb: 1.5 }}>
                    <SectionError message={res.error || "Unavailable"} />
                </Box>
            )}
            <Grid min={160}>
                <KpiTile
                    label="Invocations"
                    value={fmt(t.requests)}
                    spark={d.timeline.map((p) =>
                        d.statuses.reduce((a, s) => a + (Number(p[s]) || 0), 0),
                    )}
                />
                <KpiTile
                    label="Failed invocations"
                    value={fmt(failed)}
                    sub={
                        t.requests
                            ? `${pct(failed / t.requests, 2)} · excl. client disconnects`
                            : undefined
                    }
                    color={C.orange}
                />
                <KpiTile
                    label="Errors (reported)"
                    value={fmt(t.errors)}
                    color={C.orange}
                />
                {isWorker && (
                    <>
                        <KpiTile
                            label="Subrequests"
                            value={fmt(t.subrequests)}
                            color={C.green}
                        />
                        <KpiTile
                            label="CPU p50"
                            value={fmtUs(d.quantiles?.cpuP50)}
                        />
                        <KpiTile
                            label="CPU p99"
                            value={fmtUs(d.quantiles?.cpuP99)}
                            sub="Free plan limit: 10 ms"
                        />
                        <KpiTile
                            label="Wall time p99"
                            value={fmtUs(d.quantiles?.wallP99)}
                        />
                    </>
                )}
            </Grid>
            <Grid cols={3}>
                <Box
                    sx={{
                        gridColumn: { xs: "auto", lg: "span 2" },
                        minWidth: 0,
                    }}
                >
                    <Panel title="Invocations by outcome (hourly)">
                        <StackedBars points={d.timeline} keys={keys} />
                    </Panel>
                </Box>
                <Panel title="Outcome share">
                    {d.byStatus.map((r) => (
                        <Box key={r.status} sx={{ mb: 1.1 }}>
                            <Box
                                sx={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontSize: "0.78rem",
                                    mb: 0.4,
                                }}
                            >
                                <Box component="span" sx={{ color: C.text }}>
                                    {functionOutcomeInfo(r.status).label}
                                </Box>
                                <Box
                                    component="span"
                                    sx={{
                                        color: C.textDim,
                                        fontFamily: C.mono,
                                    }}
                                >
                                    {fmt(r.requests)} ·{" "}
                                    {pct(r.requests / (t.requests || 1))}
                                </Box>
                            </Box>
                            <Box
                                sx={{
                                    height: 6,
                                    borderRadius: 99,
                                    bgcolor: C.paperDeep,
                                    overflow: "hidden",
                                }}
                            >
                                <Box
                                    sx={{
                                        height: "100%",
                                        width: `${(r.requests / (t.requests || 1)) * 100}%`,
                                        bgcolor:
                                            OUTCOME_COLORS[r.status] ||
                                            C.yellow,
                                    }}
                                />
                            </Box>
                        </Box>
                    ))}
                    {!d.byStatus.length && (
                        <Empty message="No invocations in this window." />
                    )}
                </Panel>
            </Grid>
            <Panel title="Outcomes explained" dense>
                <DataTable
                    rows={d.byStatus}
                    cols={[
                        {
                            key: "status",
                            label: "Outcome",
                            render: (r) => {
                                const i = functionOutcomeInfo(r.status);
                                return (
                                    <Pill
                                        tone={
                                            i.severity === "critical"
                                                ? "error"
                                                : i.severity === "warning"
                                                  ? "warn"
                                                  : r.status === "success"
                                                    ? "green"
                                                    : "neutral"
                                        }
                                        mono
                                    >
                                        {r.status}
                                    </Pill>
                                );
                            },
                        },
                        {
                            key: "meaning",
                            label: "What it means",
                            render: (r) => (
                                <Box
                                    sx={{
                                        fontSize: "0.75rem",
                                        color: C.textDim,
                                        minWidth: 240,
                                    }}
                                >
                                    {functionOutcomeInfo(r.status).meaning}
                                </Box>
                            ),
                        },
                        {
                            key: "requests",
                            label: "Invocations",
                            align: "right",
                            mono: true,
                            render: (r) => fmt(r.requests),
                        },
                        {
                            key: "errors",
                            label: "Errors",
                            align: "right",
                            mono: true,
                            render: (r) => fmt(r.errors),
                        },
                        ...(isWorker
                            ? [
                                  {
                                      key: "cpuP50",
                                      label: "CPU p50",
                                      align: "right" as const,
                                      mono: true,
                                      render: (r: FnData["byStatus"][number]) =>
                                          fmtUs(r.cpuP50),
                                  },
                                  {
                                      key: "cpuP99",
                                      label: "CPU p99",
                                      align: "right" as const,
                                      mono: true,
                                      render: (r: FnData["byStatus"][number]) =>
                                          fmtUs(r.cpuP99),
                                  },
                                  {
                                      key: "wallP99",
                                      label: "Wall p99",
                                      align: "right" as const,
                                      mono: true,
                                      render: (r: FnData["byStatus"][number]) =>
                                          fmtUs(r.wallP99),
                                  },
                              ]
                            : []),
                    ]}
                />
                <Box sx={{ px: 1.5, pb: 1.25 }}>
                    {isWorker ? (
                        <Note>
                            Quantiles are per outcome over the whole window.
                            Workers Free allows 10 ms CPU per invocation; a CPU
                            p99 near that limit predicts{" "}
                            <b>exceededResources</b>.
                        </Note>
                    ) : (
                        <Note>
                            Pages Functions analytics expose invocation counts
                            and outcomes only — CPU / wall-time quantiles are
                            not available for Pages Functions.{" "}
                            <b>exceededResources</b> = the Function hit the CPU
                            or memory limit and was killed (visitor sees 1102 /
                            5xx); <b>scriptThrewException</b> = uncaught error
                            (1101 / 500); <b>clientDisconnected</b> = the
                            visitor left before the response finished.
                        </Note>
                    )}
                </Box>
            </Panel>
        </Box>
    );
}

export default function FunctionsTab({
    ctx,
    data,
}: { ctx: ServiceCtx; data: FunctionsTabData }) {
    if (!data.worker && !data.pages) {
        return (
            <Box sx={{ ...glass, p: 3 }}>
                <Empty message={`No Functions behind ${ctx.service.host}.`} />
                <Note>
                    This host is not served by a Worker (custom domain or route)
                    or a Pages project with Functions.
                    {ctx.service.dnsTarget
                        ? ` It resolves via DNS (${ctx.service.dnsType} → ${ctx.service.dnsTarget}).`
                        : ""}
                </Note>
            </Box>
        );
    }
    return (
        <Box>
            {data.worker && <FnSection res={data.worker} ctx={ctx} />}
            {data.pages && <FnSection res={data.pages} ctx={ctx} />}
        </Box>
    );
}
