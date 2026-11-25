"use client";

import MetricChart from "@/components/metric-chart";
import {
    C,
    Empty,
    PageHeader,
    Panel,
    SectionError,
    TopList,
    eyebrow,
} from "@/components/ui";
import type { DnsBreakdown, MetricSeries } from "@/lib/metrics";

export interface DnsZone {
    name: string;
    id: string;
    series: MetricSeries;
    bd: DnsBreakdown;
}

export default function DnsView({ zones }: { zones: DnsZone[] }) {
    return (
        <div>
            <PageHeader
                title="DNS analytics"
                subtitle="Queries, types and response codes per zone"
                timeRange
            />
            {zones.length === 0 && <Empty message="No zones found." />}
            {zones.map((z) => (
                <div key={z.id} style={{ marginBottom: 28 }}>
                    <div style={{ marginBottom: 12 }}>
                        <div style={eyebrow}>Zone</div>
                        <div
                            style={{
                                color: C.text,
                                fontSize: "1.6rem",
                                fontWeight: 650,
                                letterSpacing: "-0.05em",
                                lineHeight: 1.1,
                                marginTop: 4,
                            }}
                        >
                            {z.name}
                        </div>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <Panel title="DNS queries over time">
                            {z.series.available ? (
                                <MetricChart
                                    points={z.series.points}
                                    series={[
                                        {
                                            key: "queries",
                                            label: "Queries",
                                            color: C.accent,
                                        },
                                    ]}
                                    height={240}
                                />
                            ) : (
                                <SectionError
                                    message={`DNS analytics unavailable: ${z.series.error}`}
                                />
                            )}
                        </Panel>
                    </div>

                    {z.bd.available && (
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns:
                                    "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
                                gap: 12,
                            }}
                        >
                            <Panel title="Top query names" dense>
                                <TopList
                                    color={C.accent}
                                    items={z.bd.queryName
                                        .slice(0, 12)
                                        .map((x) => ({
                                            label: x.label,
                                            value: x.count,
                                        }))}
                                />
                            </Panel>
                            <Panel title="Query types" dense>
                                <TopList
                                    color={C.green}
                                    items={z.bd.queryType
                                        .slice(0, 12)
                                        .map((x) => ({
                                            label: x.label,
                                            value: x.count,
                                        }))}
                                />
                            </Panel>
                            <Panel title="Response codes" dense>
                                <TopList
                                    color={C.yellow}
                                    items={z.bd.responseCode
                                        .slice(0, 12)
                                        .map((x) => ({
                                            label: x.label,
                                            value: x.count,
                                        }))}
                                />
                            </Panel>
                            <Panel title="Data centres (colo)" dense>
                                <TopList
                                    color={C.ink}
                                    items={z.bd.colo.slice(0, 12).map((x) => ({
                                        label: x.label,
                                        value: x.count,
                                    }))}
                                />
                            </Panel>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
