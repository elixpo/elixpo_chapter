"use client";

/** Every host × status class, sortable, with an expandable per-code list. */

import { C, STATUS_COLORS } from "@/components/ui";
import {
    type HostHealth,
    type StatusClass,
    classOf,
    statusInfo,
} from "@/lib/diagnostics-core";
import { ArrowOutward, ChevronRight } from "@mui/icons-material";
import { Box, InputBase, Typography } from "@mui/material";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import {
    ClassBar,
    CodeChip,
    PillButton,
    type SortDir,
    SortTh,
    TableBox,
    cmp,
    downloadCsv,
    nextSort,
    num,
    pct,
} from "./shared";

const CLASSES: StatusClass[] = ["1xx", "2xx", "3xx", "4xx", "5xx"];

/** Most serious code seen: highest class first, then most frequent in it. */
export function worstStatus(h: HostHealth): number {
    for (const c of ["5xx", "4xx", "3xx", "2xx", "1xx"] as StatusClass[]) {
        const s = h.byStatus.find((x) => classOf(x.status) === c);
        if (s) return s.status;
    }
    return 0;
}

export default function HealthMatrix({
    health,
    codeOk,
    known,
    onCode,
    activeCodes,
}: {
    health: HostHealth[];
    /** Whether a status code passes the current class/code filters. */
    codeOk: (code: number) => boolean;
    /** Hosts that are real services (others are wildcard / scanner hosts). */
    known: Set<string>;
    onCode: (code: number) => void;
    activeCodes: number[];
}) {
    const [sort, setSort] = useState<{ key: string; dir: SortDir }>({
        key: "total",
        dir: "desc",
    });
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const [q, setQ] = useState("");
    const [limit, setLimit] = useState(40);

    const rows = useMemo(() => {
        const s = q.trim().toLowerCase();
        const r = health
            .filter((h) => !s || h.host.toLowerCase().includes(s))
            .map((h) => ({
                h,
                worst: worstStatus(h),
                non2xx: h.total - h.byClass["2xx"],
            }));
        const val = (x: (typeof r)[number]): unknown => {
            switch (sort.key) {
                case "host":
                    return x.h.host;
                case "total":
                    return x.h.total;
                case "err":
                    return x.h.errorRate;
                case "ms":
                    return x.h.avgOriginMs ?? -1;
                case "worst":
                    return x.worst;
                case "non2xx":
                    return x.non2xx;
                default:
                    return x.h.byClass[sort.key as StatusClass] ?? 0;
            }
        };
        return r.sort(
            (a, b) => cmp(val(a), val(b)) * (sort.dir === "asc" ? 1 : -1),
        );
    }, [health, sort, q]);

    const onSort = (k: string) => setSort((s) => nextSort(s, k));

    const exportCsv = () =>
        downloadCsv("service-health-matrix", [
            [
                "host",
                "total",
                ...CLASSES,
                "error_rate",
                "avg_origin_ms",
                "worst",
            ],
            ...rows.map(({ h, worst }) => [
                h.host,
                h.total,
                ...CLASSES.map((c) => h.byClass[c]),
                h.errorRate.toFixed(4),
                Math.round(h.avgOriginMs ?? 0),
                worst,
            ]),
        ]);

    return (
        <Box>
            <Box
                sx={{
                    display: "flex",
                    gap: 1,
                    alignItems: "center",
                    px: { xs: 1.5, md: 2 },
                    py: 1.1,
                    borderBottom: `1px solid ${C.border}`,
                    flexWrap: "wrap",
                }}
            >
                <InputBase
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Find a host…"
                    sx={{
                        flex: "1 1 200px",
                        fontSize: "0.8rem",
                        px: 1.5,
                        py: 0.3,
                        borderRadius: "999px",
                        bgcolor: C.paperDeep,
                    }}
                />
                <Typography
                    sx={{
                        fontFamily: C.mono,
                        fontSize: "0.68rem",
                        color: C.textMuted,
                    }}
                >
                    {rows.length} hosts
                </Typography>
                <PillButton onClick={exportCsv}>CSV</PillButton>
            </Box>
            <TableBox minWidth={980}>
                <thead>
                    <tr>
                        <th style={{ width: 28 }} />
                        <SortTh
                            label="Host"
                            k="host"
                            sort={sort}
                            onSort={onSort}
                        />
                        <SortTh
                            label="Total"
                            k="total"
                            sort={sort}
                            onSort={onSort}
                            num
                        />
                        {CLASSES.map((c) => (
                            <SortTh
                                key={c}
                                label={c}
                                k={c}
                                sort={sort}
                                onSort={onSort}
                                num
                            />
                        ))}
                        <th>Mix</th>
                        <SortTh
                            label="Error rate"
                            k="err"
                            sort={sort}
                            onSort={onSort}
                            num
                            title="4xx + 5xx share"
                        />
                        <SortTh
                            label="Origin ms"
                            k="ms"
                            sort={sort}
                            onSort={onSort}
                            num
                            title="Average origin response time"
                        />
                        <SortTh
                            label="Worst"
                            k="worst"
                            sort={sort}
                            onSort={onSort}
                        />
                        <th />
                    </tr>
                </thead>
                <tbody>
                    {rows.slice(0, limit).map(({ h, worst }) => {
                        const o = !!open[h.host];
                        const codes = h.byStatus.filter((s) =>
                            codeOk(s.status),
                        );
                        return (
                            <Fragment key={h.host}>
                                <Box
                                    component="tr"
                                    onClick={() =>
                                        setOpen((m) => ({ ...m, [h.host]: !o }))
                                    }
                                    sx={{
                                        cursor: "pointer",
                                        "&:hover td": { bgcolor: C.paper },
                                    }}
                                >
                                    <td>
                                        <ChevronRight
                                            sx={{
                                                fontSize: "1rem",
                                                color: C.textMuted,
                                                transform: o
                                                    ? "rotate(90deg)"
                                                    : "none",
                                                transition: "transform .15s",
                                                display: "block",
                                            }}
                                        />
                                    </td>
                                    <td>
                                        <Box
                                            sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 0.75,
                                            }}
                                        >
                                            <Typography
                                                sx={{
                                                    fontWeight: 600,
                                                    fontSize: "0.8rem",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {h.host}
                                            </Typography>
                                            {!known.has(h.host) && (
                                                <Box
                                                    component="span"
                                                    title="Not a configured service — wildcard DNS, scanner host header or a Worker subrequest target"
                                                    sx={{
                                                        fontFamily: C.mono,
                                                        fontSize: "0.56rem",
                                                        letterSpacing: "0.1em",
                                                        textTransform:
                                                            "uppercase",
                                                        color: C.textMuted,
                                                        border: `1px solid ${C.line}`,
                                                        borderRadius: "999px",
                                                        px: 0.7,
                                                    }}
                                                >
                                                    unlisted
                                                </Box>
                                            )}
                                        </Box>
                                    </td>
                                    <td
                                        className="num"
                                        style={{ fontWeight: 700 }}
                                    >
                                        {num(h.total)}
                                    </td>
                                    {CLASSES.map((c) => {
                                        const v = h.byClass[c];
                                        return (
                                            <td
                                                key={c}
                                                className="num"
                                                style={{
                                                    color: v
                                                        ? C.text
                                                        : C.borderLight,
                                                }}
                                            >
                                                {v ? num(v) : "·"}
                                                {v > 0 && c !== "2xx" && (
                                                    <Box
                                                        component="span"
                                                        sx={{
                                                            display: "block",
                                                            fontSize: "0.64rem",
                                                            color: STATUS_COLORS[
                                                                c
                                                            ],
                                                            fontWeight: 700,
                                                        }}
                                                    >
                                                        {pct(v / h.total, 0)}
                                                    </Box>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td style={{ minWidth: 120 }}>
                                        <ClassBar
                                            byClass={h.byClass}
                                            total={h.total}
                                        />
                                    </td>
                                    <td
                                        className="num"
                                        style={{
                                            fontWeight: 700,
                                            color:
                                                h.errorRate > 0.2
                                                    ? C.error
                                                    : h.errorRate > 0.05
                                                      ? C.warn
                                                      : C.text,
                                        }}
                                    >
                                        {pct(h.errorRate)}
                                    </td>
                                    <td className="num">
                                        {h.avgOriginMs != null &&
                                        h.avgOriginMs > 0
                                            ? num(h.avgOriginMs)
                                            : "—"}
                                    </td>
                                    <td>
                                        {worst ? (
                                            <CodeChip code={worst} />
                                        ) : (
                                            "—"
                                        )}
                                    </td>
                                    <td
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => e.stopPropagation()}
                                    >
                                        <Box
                                            component={Link}
                                            href={`/dashboard/services/${encodeURIComponent(h.host)}?tab=status`}
                                            title="Open service"
                                            sx={{
                                                color: C.green,
                                                display: "inline-flex",
                                                p: 0.4,
                                                borderRadius: "999px",
                                                "&:hover": {
                                                    bgcolor: C.paperDeep,
                                                },
                                            }}
                                        >
                                            <ArrowOutward
                                                sx={{ fontSize: "0.95rem" }}
                                            />
                                        </Box>
                                    </td>
                                </Box>
                                {o && (
                                    <tr>
                                        <td
                                            colSpan={13}
                                            style={{ background: C.paper }}
                                        >
                                            <Box
                                                sx={{
                                                    display: "grid",
                                                    gridTemplateColumns:
                                                        "repeat(auto-fill, minmax(230px, 1fr))",
                                                    gap: 0.75,
                                                    py: 0.5,
                                                }}
                                            >
                                                {codes.map((s) => (
                                                    <Box
                                                        key={s.status}
                                                        sx={{
                                                            display: "flex",
                                                            alignItems:
                                                                "center",
                                                            gap: 1,
                                                            px: 1,
                                                            py: 0.6,
                                                            borderRadius:
                                                                "12px",
                                                            bgcolor: C.panel,
                                                            border: `1px solid ${C.border}`,
                                                        }}
                                                    >
                                                        <CodeChip
                                                            code={s.status}
                                                            onClick={() =>
                                                                onCode(s.status)
                                                            }
                                                            active={activeCodes.includes(
                                                                s.status,
                                                            )}
                                                        />
                                                        <Typography
                                                            sx={{
                                                                fontSize:
                                                                    "0.76rem",
                                                                flex: 1,
                                                                color: C.textDim,
                                                                overflow:
                                                                    "hidden",
                                                                textOverflow:
                                                                    "ellipsis",
                                                                whiteSpace:
                                                                    "nowrap",
                                                            }}
                                                        >
                                                            {
                                                                statusInfo(
                                                                    s.status,
                                                                ).name
                                                            }
                                                        </Typography>
                                                        <Typography
                                                            sx={{
                                                                fontSize:
                                                                    "0.76rem",
                                                                fontWeight: 700,
                                                                fontVariantNumeric:
                                                                    "tabular-nums",
                                                            }}
                                                        >
                                                            {num(s.count)}
                                                        </Typography>
                                                        <Typography
                                                            sx={{
                                                                fontSize:
                                                                    "0.68rem",
                                                                color: C.textMuted,
                                                                minWidth: 38,
                                                                textAlign:
                                                                    "right",
                                                            }}
                                                        >
                                                            {pct(
                                                                s.count /
                                                                    h.total,
                                                                0,
                                                            )}
                                                        </Typography>
                                                    </Box>
                                                ))}
                                                {!codes.length && (
                                                    <Typography
                                                        sx={{
                                                            fontSize: "0.76rem",
                                                            color: C.textMuted,
                                                        }}
                                                    >
                                                        No codes match the
                                                        current filters.
                                                    </Typography>
                                                )}
                                            </Box>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </TableBox>
            {rows.length > limit && (
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "center",
                        py: 1.25,
                        borderTop: `1px solid ${C.border}`,
                    }}
                >
                    <PillButton onClick={() => setLimit((l) => l + 60)}>
                        Show more hosts ({rows.length - limit} left)
                    </PillButton>
                </Box>
            )}
        </Box>
    );
}
