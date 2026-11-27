"use client";

import MetricChart from "@/components/metric-chart";
import {
    C,
    Empty,
    PageHeader,
    Panel,
    SectionError,
    StatusChip,
} from "@/components/ui";
import { autoLabel } from "@/lib/enrich";
import { fmt } from "@/lib/format";
import type { MetricSeries } from "@/lib/metrics";

export interface WorkerRow {
    name: string;
    modified?: string;
    m: MetricSeries;
    crons: string[];
}

function Stat({
    label,
    value,
    color,
}: { label: string; value: string; color: string }) {
    return (
        <div>
            <div
                style={{
                    color: C.textMuted,
                    fontFamily: C.mono,
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.17em",
                }}
            >
                {label}
            </div>
            <div
                style={{
                    color,
                    fontSize: "1.45rem",
                    fontWeight: 650,
                    letterSpacing: "-0.05em",
                    lineHeight: 1.15,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {value}
            </div>
        </div>
    );
}

export default function WorkersView({
    data,
    listError,
}: {
    data: WorkerRow[];
    listError?: string | null;
}) {
    return (
        <div>
            <PageHeader
                title="Workers"
                subtitle="Invocations, errors, subrequests & cron per script"
                timeRange
            />
            {listError && (
                <SectionError message={`Couldn't list Workers: ${listError}`} />
            )}
            {data.length === 0 ? (
                <Empty message="No Workers found." />
            ) : (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fit, minmax(min(440px, 100%), 1fr))",
                        gap: 12,
                    }}
                >
                    {data.map(({ name, m, crons, modified }) => (
                        <Panel
                            key={name}
                            title={autoLabel(name)}
                            action={
                                crons.length > 0 ? (
                                    <StatusChip
                                        label={`cron: ${crons.length}`}
                                        tone="info"
                                    />
                                ) : undefined
                            }
                        >
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(3, 1fr)",
                                    gap: 8,
                                    marginBottom: 12,
                                }}
                            >
                                <Stat
                                    label="Requests"
                                    value={fmt(m.totals.requests || 0)}
                                    color={C.text}
                                />
                                <Stat
                                    label="Errors"
                                    value={fmt(m.totals.errors || 0)}
                                    color={C.error}
                                />
                                <Stat
                                    label="Subrequests"
                                    value={fmt(m.totals.subrequests || 0)}
                                    color={C.green}
                                />
                            </div>
                            {m.available ? (
                                <MetricChart
                                    points={m.points}
                                    series={[
                                        {
                                            key: "requests",
                                            label: "Requests",
                                            color: C.accent,
                                        },
                                        {
                                            key: "errors",
                                            label: "Errors",
                                            color: C.error,
                                        },
                                        {
                                            key: "subrequests",
                                            label: "Subrequests",
                                            color: C.green,
                                        },
                                    ]}
                                    height={150}
                                />
                            ) : (
                                <SectionError
                                    message={`Metrics unavailable: ${m.error}`}
                                />
                            )}
                            <div
                                style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 6,
                                    marginTop: 10,
                                }}
                            >
                                <StatusChip label={name} tone="neutral" />
                                {crons.map((c) => (
                                    <StatusChip
                                        key={c}
                                        label={`⏱ ${c}`}
                                        tone="info"
                                    />
                                ))}
                                {modified && (
                                    <StatusChip
                                        label={`updated ${new Date(modified).toLocaleDateString()}`}
                                        tone="neutral"
                                    />
                                )}
                            </div>
                        </Panel>
                    ))}
                </div>
            )}
        </div>
    );
}
