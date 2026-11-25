"use client";

import MetricChart from "@/components/metric-chart";
import QueryConsole from "@/components/query-console";
import {
    C,
    CHART,
    KpiTile,
    PageHeader,
    Panel,
    SectionError,
} from "@/components/ui";
import type { MetricSeries } from "@/lib/metrics";
import { Box } from "@mui/material";

export default function D1DetailView({
    dbId,
    dbName,
    tables,
    tablesError,
    metrics,
}: {
    dbId: string;
    dbName: string;
    tables: string[];
    tablesError?: string | null;
    metrics: MetricSeries;
}) {
    return (
        <Box>
            <PageHeader title={dbName} subtitle={`D1 · ${dbId}`} timeRange />

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fill, minmax(min(180px, 100%), 1fr))",
                    gap: 1.5,
                    mb: 3,
                }}
            >
                <KpiTile
                    label="Read queries"
                    value={metrics.totals.readQueries?.toLocaleString() ?? "—"}
                    spark={metrics.points.map(
                        (p) => Number(p.readQueries) || 0,
                    )}
                    color={C.green}
                />
                <KpiTile
                    label="Write queries"
                    value={metrics.totals.writeQueries?.toLocaleString() ?? "—"}
                    spark={metrics.points.map(
                        (p) => Number(p.writeQueries) || 0,
                    )}
                    color={C.yellow}
                />
                <KpiTile
                    label="Rows read"
                    value={metrics.totals.rowsRead?.toLocaleString() ?? "—"}
                    spark={metrics.points.map((p) => Number(p.rowsRead) || 0)}
                    color={C.blue}
                />
                <KpiTile
                    label="Rows written"
                    value={metrics.totals.rowsWritten?.toLocaleString() ?? "—"}
                    spark={metrics.points.map(
                        (p) => Number(p.rowsWritten) || 0,
                    )}
                    color={C.ink}
                />
            </Box>

            <Box sx={{ mb: 3 }}>
                <Panel title="D1 activity">
                    {metrics.available ? (
                        <MetricChart
                            points={metrics.points}
                            series={[
                                {
                                    key: "readQueries",
                                    label: "Reads",
                                    color: C.green,
                                },
                                {
                                    key: "writeQueries",
                                    label: "Writes",
                                    color: CHART[2],
                                },
                            ]}
                        />
                    ) : (
                        <SectionError
                            message={`Metrics unavailable: ${metrics.error}`}
                        />
                    )}
                </Panel>
            </Box>

            <Panel title="Query console">
                {tablesError && (
                    <SectionError
                        message={`Couldn't list tables: ${tablesError}`}
                    />
                )}
                <QueryConsole dbId={dbId} tables={tables} />
            </Panel>
        </Box>
    );
}
