"use client";

import { FindingCard } from "@/components/service/findings";
import {
    CodeBadge,
    DataTable,
    FilterPill,
    Grid,
    Note,
    PathCell,
    Pill,
    STATUS_KEYS,
    SectionTitle,
    StackedBars,
    pct,
} from "@/components/service/kit";
import type { ServiceCtx, StatusData } from "@/components/service/types";
import { C, Panel, SectionError, StatusBar } from "@/components/ui";
import {
    type NonOkRow,
    SECURITY_SOURCE_INFO,
    classOf,
    requestSourceInfo,
    statusInfo,
} from "@/lib/diagnostics-core";
import { Box, Typography } from "@mui/material";
import { useMemo, useState } from "react";

const CLASSES = ["all", "3xx", "4xx", "5xx"] as const;

export default function StatusTab({
    ctx,
    data,
}: { ctx: ServiceCtx; data: StatusData }) {
    const [cls, setCls] = useState<(typeof CLASSES)[number]>("all");
    const [visitorsOnly, setVisitorsOnly] = useState(false);

    const codes = useMemo(() => {
        const m = new Map<number, number>();
        for (const r of data.matrix.data)
            m.set(r.status, (m.get(r.status) || 0) + r.count);
        const internal = new Map<number, number>();
        for (const r of data.internal.data)
            internal.set(r.status, (internal.get(r.status) || 0) + r.count);
        return Array.from(m, ([code, count]) => ({
            code,
            count,
            internal: internal.get(code) || 0,
        })).sort((a, b) => b.count - a.count);
    }, [data.matrix.data, data.internal.data]);
    const total = codes.reduce((a, c) => a + c.count, 0);

    const nonOk = useMemo(
        () =>
            data.nonOk.data.filter(
                (r) =>
                    (cls === "all" || classOf(r.status) === cls) &&
                    (!visitorsOnly || r.requestSource === "eyeball"),
            ),
        [data.nonOk.data, cls, visitorsOnly],
    );

    return (
        <Box>
            <Grid cols={3}>
                <Box
                    sx={{
                        gridColumn: { xs: "auto", lg: "span 2" },
                        minWidth: 0,
                    }}
                >
                    <Panel
                        title={`Status classes over time · ${ctx.rangeLabel}`}
                    >
                        {data.timeline.available ? (
                            <StackedBars
                                points={data.timeline.data}
                                keys={STATUS_KEYS}
                            />
                        ) : (
                            <SectionError
                                message={data.timeline.error || "Unavailable"}
                            />
                        )}
                    </Panel>
                </Box>
                <Panel title="Share">
                    <StatusBar
                        status={codes.map((c) => ({
                            label: String(c.code),
                            count: c.count,
                        }))}
                    />
                    <Typography
                        sx={{
                            fontSize: "0.76rem",
                            color: C.textMuted,
                            mt: 1.5,
                        }}
                    >
                        {total.toLocaleString()} requests · {codes.length}{" "}
                        distinct status codes
                    </Typography>
                    {data.internal.data.length > 0 && (
                        <Note>
                            {data.internal.data
                                .reduce((a, r) => a + r.count, 0)
                                .toLocaleString()}{" "}
                            requests came from Cloudflare itself (Early Hints
                            lookups, challenge fetches, Worker subrequests), not
                            visitors — see the “internal” column below.
                        </Note>
                    )}
                </Panel>
            </Grid>

            <Panel title="Every status code for this host" dense>
                {!data.matrix.available && (
                    <Box sx={{ p: 1.5 }}>
                        <SectionError
                            message={data.matrix.error || "Unavailable"}
                        />
                    </Box>
                )}
                <DataTable
                    limit={25}
                    rows={codes}
                    cols={[
                        {
                            key: "code",
                            label: "Code",
                            render: (r) => <CodeBadge code={r.code} />,
                            width: 60,
                        },
                        {
                            key: "name",
                            label: "Meaning",
                            render: (r) => {
                                const i = statusInfo(r.code);
                                return (
                                    <Box sx={{ minWidth: 220 }}>
                                        <Box
                                            sx={{
                                                fontWeight: 650,
                                                fontSize: "0.8rem",
                                            }}
                                        >
                                            {i.name}{" "}
                                            {i.benign && (
                                                <Pill tone="green">
                                                    usually benign
                                                </Pill>
                                            )}
                                        </Box>
                                        <Box
                                            sx={{
                                                color: C.textMuted,
                                                fontSize: "0.74rem",
                                            }}
                                        >
                                            {i.meaning}
                                        </Box>
                                        {!i.benign && i.causes.length > 0 && (
                                            <Box
                                                sx={{
                                                    color: C.textDim,
                                                    fontSize: "0.72rem",
                                                    mt: 0.25,
                                                }}
                                            >
                                                Likely:{" "}
                                                {i.causes
                                                    .slice(0, 2)
                                                    .join("; ")}
                                            </Box>
                                        )}
                                    </Box>
                                );
                            },
                        },
                        {
                            key: "count",
                            label: "Requests",
                            align: "right",
                            mono: true,
                            render: (r) => r.count.toLocaleString(),
                        },
                        {
                            key: "share",
                            label: "Share",
                            align: "right",
                            mono: true,
                            render: (r) => pct(r.count / (total || 1)),
                        },
                        {
                            key: "internal",
                            label: "Internal",
                            align: "right",
                            mono: true,
                            render: (r) =>
                                r.internal ? r.internal.toLocaleString() : "—",
                        },
                    ]}
                />
            </Panel>

            <Box sx={{ mt: 2.5 }}>
                <SectionTitle note="Each finding explains why this host returned a non-2xx code, from origin status, cache, security and Functions evidence.">
                    Findings · {data.findings.length}
                </SectionTitle>
                {data.findings.length ? (
                    <Box sx={{ display: "grid", gap: 1.25 }}>
                        {data.findings.map((f) => (
                            <FindingCard key={f.id} f={f} />
                        ))}
                    </Box>
                ) : (
                    <Box
                        sx={{
                            bgcolor: C.successBg,
                            color: C.success,
                            borderRadius: "14px",
                            p: 1.75,
                            fontSize: "0.85rem",
                        }}
                    >
                        No findings — this host only returned 2xx / benign
                        responses in this window.
                    </Box>
                )}
            </Box>

            <Box sx={{ mt: 2.5 }}>
                <Panel
                    title="Non-2xx requests"
                    dense
                    action={
                        <Box
                            sx={{
                                display: "flex",
                                gap: 0.5,
                                flexWrap: "wrap",
                                justifyContent: "flex-end",
                            }}
                        >
                            {CLASSES.map((c) => (
                                <FilterPill
                                    key={c}
                                    active={cls === c}
                                    onClick={() => setCls(c)}
                                >
                                    {c}
                                </FilterPill>
                            ))}
                            <FilterPill
                                active={visitorsOnly}
                                onClick={() => setVisitorsOnly((v) => !v)}
                            >
                                visitors only
                            </FilterPill>
                        </Box>
                    }
                >
                    {!data.nonOk.available && (
                        <Box sx={{ p: 1.5 }}>
                            <SectionError
                                message={data.nonOk.error || "Unavailable"}
                            />
                        </Box>
                    )}
                    <DataTable<NonOkRow>
                        limit={30}
                        rows={nonOk}
                        cols={[
                            {
                                key: "status",
                                label: "Edge",
                                render: (r) => <CodeBadge code={r.status} />,
                            },
                            {
                                key: "originStatus",
                                label: "Origin",
                                mono: true,
                                render: (r) =>
                                    r.originStatus === 0 ? (
                                        <Box
                                            component="span"
                                            title="Origin never answered"
                                            sx={{ color: C.error }}
                                        >
                                            0 · none
                                        </Box>
                                    ) : (
                                        r.originStatus
                                    ),
                            },
                            { key: "cacheStatus", label: "Cache", mono: true },
                            {
                                key: "security",
                                label: "Security",
                                render: (r) =>
                                    r.securityAction &&
                                    r.securityAction !== "unknown" ? (
                                        <Box
                                            component="span"
                                            title={
                                                SECURITY_SOURCE_INFO[
                                                    r.securitySource
                                                ] || r.securitySource
                                            }
                                            sx={{
                                                fontFamily: C.mono,
                                                fontSize: "0.72rem",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {r.securityAction}
                                            {r.securitySource &&
                                            r.securitySource !== "unknown"
                                                ? ` · ${r.securitySource}`
                                                : ""}
                                        </Box>
                                    ) : (
                                        "—"
                                    ),
                            },
                            {
                                key: "requestSource",
                                label: "Source",
                                render: (r) => {
                                    const i = requestSourceInfo(
                                        r.requestSource,
                                    );
                                    return (
                                        <Box component="span" title={i.meaning}>
                                            <Pill
                                                tone={
                                                    i.visitor
                                                        ? "neutral"
                                                        : "blue"
                                                }
                                            >
                                                {i.label}
                                            </Pill>
                                        </Box>
                                    );
                                },
                            },
                            { key: "method", label: "Method", mono: true },
                            {
                                key: "path",
                                label: "Path",
                                render: (r) => <PathCell path={r.path} />,
                            },
                            {
                                key: "count",
                                label: "Count",
                                align: "right",
                                mono: true,
                                render: (r) => r.count.toLocaleString(),
                            },
                        ]}
                    />
                </Panel>
            </Box>
        </Box>
    );
}
