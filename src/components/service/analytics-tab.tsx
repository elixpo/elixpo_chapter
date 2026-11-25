"use client";

import ExpandableGlobe from "@/components/expandable-globe";
import MetricChart from "@/components/metric-chart";
import { Grid, Note, Wide } from "@/components/service/kit";
import type { AnalyticsData, ServiceCtx } from "@/components/service/types";
import {
    C,
    Donut,
    KpiTile,
    Panel,
    SectionError,
    TopList,
    fmt,
    fmtBytes,
    trend,
} from "@/components/ui";
import { requestSourceInfo } from "@/lib/diagnostics-core";
import type { Dim } from "@/lib/metrics";
import { Box } from "@mui/material";

const items = (d: { label: string; count: number }[]) =>
    d.map((x) => ({ label: x.label || "(none)", value: x.count }));
const donut = (d: { label: string; count: number }[]) =>
    d.slice(0, 6).map((x) => ({ label: x.label || "(none)", value: x.count }));

export default function AnalyticsTab({
    ctx,
    data,
}: { ctx: ServiceCtx; data: AnalyticsData }) {
    const pts = data.series.data.points;
    const tot = data.series.data.totals;
    const b = data.breakdown;
    const x = data.extras.data;
    const bwPoints = pts.map((p) => ({
        ts: p.ts,
        mb: +(p.bytes / 1048576).toFixed(2),
    }));

    return (
        <Box>
            {!data.series.available && (
                <Box sx={{ mb: 1.5 }}>
                    <SectionError
                        message={`Traffic series unavailable: ${data.series.error}`}
                    />
                </Box>
            )}
            {!b.available && (
                <Box sx={{ mb: 1.5 }}>
                    <SectionError
                        message={`Breakdowns unavailable: ${b.error}`}
                    />
                </Box>
            )}
            {!data.extras.available && (
                <Box sx={{ mb: 1.5 }}>
                    <SectionError
                        message={`Extra dimensions unavailable: ${data.extras.error}`}
                    />
                </Box>
            )}

            <Grid min={180}>
                <KpiTile
                    label="Requests"
                    value={fmt(tot.requests)}
                    delta={trend(pts.map((p) => p.requests))}
                    spark={pts.map((p) => p.requests)}
                />
                <KpiTile
                    label="Bandwidth"
                    value={fmtBytes(tot.bytes)}
                    spark={pts.map((p) => p.bytes)}
                    color={C.green}
                />
                <KpiTile
                    label="Visits"
                    value={fmt(tot.visits)}
                    spark={pts.map((p) => p.visits)}
                    color="#0e8a8a"
                    sub="Page views from a different referrer"
                />
                <KpiTile
                    label="Bytes / request"
                    value={
                        tot.requests
                            ? fmtBytes(Math.round(tot.bytes / tot.requests))
                            : "—"
                    }
                />
            </Grid>

            <Grid cols={2}>
                <Panel title={`Requests & visits · ${ctx.rangeLabel}`}>
                    <MetricChart
                        points={pts}
                        series={[
                            {
                                key: "requests",
                                label: "Requests",
                                color: C.blue,
                            },
                            { key: "visits", label: "Visits", color: C.green },
                        ]}
                    />
                </Panel>
                <Panel title={`Bandwidth (MB) · ${ctx.rangeLabel}`}>
                    <MetricChart
                        points={bwPoints}
                        series={[
                            {
                                key: "mb",
                                label: "Data transfer MB",
                                color: "#0e8a8a",
                            },
                        ]}
                    />
                </Panel>

                <Wide>
                    <Grid cols={3} mb={0}>
                        <Panel title="Visitors by country">
                            <Box
                                sx={{
                                    display: "flex",
                                    justifyContent: "center",
                                }}
                            >
                                <ExpandableGlobe
                                    country={b.country as Dim[]}
                                    size={240}
                                />
                            </Box>
                        </Panel>
                        <Panel title="Countries" dense>
                            <TopList
                                items={items(b.country)}
                                controls={false}
                            />
                        </Panel>
                        <Panel title="Data centers (colo)" dense>
                            <TopList
                                items={items(x.colo)}
                                color={C.green}
                                controls={false}
                            />
                        </Panel>
                    </Grid>
                </Wide>

                <Wide>
                    <Grid cols={3} mb={0}>
                        <Panel title="Device type">
                            <Donut data={donut(b.device)} size={130} />
                        </Panel>
                        <Panel title="HTTP protocol">
                            <Donut data={donut(b.httpProtocol)} size={130} />
                        </Panel>
                        <Panel title="TLS version">
                            <Donut data={donut(b.tls)} size={130} />
                        </Panel>
                    </Grid>
                </Wide>

                <Panel title="Browsers" dense>
                    <TopList items={items(b.browser)} controls={false} />
                </Panel>
                <Panel title="Operating systems" dense>
                    <TopList
                        items={items(b.os)}
                        color={C.green}
                        controls={false}
                    />
                </Panel>
                <Panel
                    title="Top paths"
                    dense
                    exportData={b.path.map((p) => ({
                        label: p.label,
                        value: p.count,
                    }))}
                >
                    <TopList items={items(b.path)} />
                </Panel>
                <Panel title="Content types" dense>
                    <TopList
                        items={x.contentType.map((r) => ({
                            label: r.label,
                            value: r.count,
                            chip: (
                                <Box
                                    component="span"
                                    sx={{
                                        fontSize: "0.68rem",
                                        color: C.textMuted,
                                    }}
                                >
                                    {fmtBytes(r.bytes || 0)}
                                </Box>
                            ),
                        }))}
                        controls={false}
                    />
                </Panel>
                <Panel
                    title="Top client IPs"
                    dense
                    exportData={b.ip.map((p) => ({
                        label: p.label,
                        value: p.count,
                    }))}
                >
                    <TopList items={items(b.ip)} color={C.orange} />
                </Panel>
                <Panel title="Verified bot categories" dense>
                    <TopList
                        items={items(x.botCategory)}
                        color="#0e8a8a"
                        controls={false}
                    />
                    <Box sx={{ px: 1.5, pb: 1 }}>
                        <Note>
                            Only bots Cloudflare verifies (search crawlers, link
                            previews…). Bot score is not available on the Free
                            plan.
                        </Note>
                    </Box>
                </Panel>
                <Panel title="HTTP methods">
                    <Donut data={donut(x.method)} size={130} />
                </Panel>
                <Panel title="Request source" dense>
                    <TopList
                        items={x.requestSource.map((r) => ({
                            label: requestSourceInfo(r.label).label,
                            value: r.count,
                        }))}
                        controls={false}
                    />
                    <Box sx={{ px: 1.5, pb: 1 }}>
                        <Note>
                            Non-visitor sources (Early Hints lookups, challenge
                            fetches, Worker subrequests) are Cloudflare-internal
                            and inflate raw request counts.
                        </Note>
                    </Box>
                </Panel>
                <Panel title="User agents" dense>
                    <TopList items={items(b.userAgent)} controls={false} />
                </Panel>
                <Panel title="Edge cache status" dense>
                    <TopList
                        items={items(b.cacheStatus)}
                        color={C.green}
                        controls={false}
                    />
                </Panel>
            </Grid>
        </Box>
    );
}
