"use client";

import MetricChart from "@/components/metric-chart";
import { C, Panel, SectionError } from "@/components/ui";
import type { MetricSeries } from "@/lib/metrics";

/** Account-wide Durable Object request/error chart for the DO list page. */
export default function DoRequestsPanel({
    metrics,
}: { metrics: MetricSeries }) {
    return (
        <div style={{ marginBottom: 12 }}>
            <Panel title="Durable Object requests (account-wide, last 24h)">
                {metrics.available ? (
                    <MetricChart
                        points={metrics.points}
                        series={[
                            {
                                key: "requests",
                                label: "Requests",
                                color: C.blue,
                            },
                            {
                                key: "errors",
                                label: "Errors",
                                color: C.orange,
                            },
                        ]}
                    />
                ) : (
                    <SectionError
                        message={`Metrics unavailable: ${metrics.error}`}
                    />
                )}
            </Panel>
        </div>
    );
}
