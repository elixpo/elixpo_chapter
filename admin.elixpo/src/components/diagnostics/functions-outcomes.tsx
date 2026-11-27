"use client";

/** Workers + Pages Functions invocations by script × outcome. */

import { C, eyebrow } from "@/components/ui";
import {
    FUNCTION_OUTCOME_INFO,
    type FunctionStatusRow,
    functionOutcomeInfo,
} from "@/lib/diagnostics-core";
import { Box, Typography } from "@mui/material";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
    SEV,
    type SortDir,
    SortTh,
    TableBox,
    cmp,
    nextSort,
    num,
    pct,
} from "./shared";

export interface ScriptOwner {
    /** Pages project / worker name to show. */
    name: string;
    hosts: string[];
}

interface Row {
    script: string;
    kind: "worker" | "pages";
    owner?: ScriptOwner;
    total: number;
    outcomes: Record<string, number>;
    failures: number;
}

export default function FunctionsOutcomes({
    rows,
    owners,
}: {
    rows: FunctionStatusRow[];
    owners: Record<string, ScriptOwner>;
}) {
    const [sort, setSort] = useState<{ key: string; dir: SortDir }>({
        key: "failures",
        dir: "desc",
    });

    const { table, statuses } = useMemo(() => {
        const by = new Map<string, Row>();
        const statuses = new Set<string>();
        for (const r of rows) {
            statuses.add(r.status);
            const x = by.get(r.script) || {
                script: r.script,
                kind: r.kind,
                owner: owners[r.script],
                total: 0,
                outcomes: {},
                failures: 0,
            };
            x.total += r.requests;
            x.outcomes[r.status] = (x.outcomes[r.status] || 0) + r.requests;
            if (r.status !== "success" && r.status !== "clientDisconnected")
                x.failures += r.requests;
            by.set(r.script, x);
        }
        const order = [
            "success",
            "clientDisconnected",
            "exceededResources",
            "scriptThrewException",
        ];
        const st = Array.from(statuses).sort(
            (a, b) =>
                (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) ||
                a.localeCompare(b),
        );
        return { table: Array.from(by.values()), statuses: st };
    }, [rows, owners]);

    const sorted = useMemo(() => {
        const val = (r: Row): unknown =>
            sort.key === "script"
                ? r.owner?.name || r.script
                : sort.key === "total"
                  ? r.total
                  : sort.key === "failures"
                    ? r.failures
                    : (r.outcomes[sort.key] ?? 0);
        return [...table].sort(
            (a, b) =>
                cmp(val(a), val(b)) * (sort.dir === "asc" ? 1 : -1) ||
                b.total - a.total,
        );
    }, [table, sort]);
    const onSort = (k: string) => setSort((s) => nextSort(s, k));

    if (!table.length)
        return (
            <Typography
                sx={{
                    color: C.textMuted,
                    fontSize: "0.82rem",
                    py: 3,
                    textAlign: "center",
                }}
            >
                No Worker or Pages Functions invocations in this window.
            </Typography>
        );

    return (
        <Box>
            <TableBox minWidth={760}>
                <thead>
                    <tr>
                        <SortTh
                            label="Script"
                            k="script"
                            sort={sort}
                            onSort={onSort}
                        />
                        <th>Kind</th>
                        <SortTh
                            label="Invocations"
                            k="total"
                            sort={sort}
                            onSort={onSort}
                            num
                        />
                        {statuses.map((s) => (
                            <SortTh
                                key={s}
                                label={functionOutcomeInfo(s).label}
                                k={s}
                                sort={sort}
                                onSort={onSort}
                                num
                                title={functionOutcomeInfo(s).meaning}
                            />
                        ))}
                        <SortTh
                            label="Failure rate"
                            k="failures"
                            sort={sort}
                            onSort={onSort}
                            num
                            title="exceededResources + scriptThrewException + other non-success (excludes clientDisconnected)"
                        />
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((r) => {
                        const rate = r.total ? r.failures / r.total : 0;
                        return (
                            <tr key={r.script}>
                                <td>
                                    <Typography
                                        sx={{
                                            fontWeight: 650,
                                            fontSize: "0.8rem",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {r.owner?.name || r.script}
                                    </Typography>
                                    {r.owner && r.owner.name !== r.script && (
                                        <Typography
                                            sx={{
                                                fontFamily: C.mono,
                                                fontSize: "0.64rem",
                                                color: C.textMuted,
                                            }}
                                        >
                                            {r.script}
                                        </Typography>
                                    )}
                                    {r.owner?.hosts.length ? (
                                        <Box
                                            sx={{
                                                display: "flex",
                                                gap: 0.75,
                                                flexWrap: "wrap",
                                                mt: 0.25,
                                            }}
                                        >
                                            {r.owner.hosts
                                                .slice(0, 3)
                                                .map((h) => (
                                                    <Link
                                                        key={h}
                                                        href={`/dashboard/services/${encodeURIComponent(h)}?tab=functions`}
                                                        style={{
                                                            color: C.green,
                                                            fontSize: "0.7rem",
                                                            textDecoration:
                                                                "none",
                                                        }}
                                                    >
                                                        {h}
                                                    </Link>
                                                ))}
                                        </Box>
                                    ) : null}
                                </td>
                                <td className="mono">
                                    {r.kind === "pages" ? "Pages Fn" : "Worker"}
                                </td>
                                <td className="num" style={{ fontWeight: 700 }}>
                                    {num(r.total)}
                                </td>
                                {statuses.map((s) => {
                                    const v = r.outcomes[s] || 0;
                                    const o = functionOutcomeInfo(s);
                                    const hot = v > 0 && o.severity !== "info";
                                    const sev = SEV[o.severity];
                                    return (
                                        <td key={s} className="num">
                                            {v ? (
                                                <Box
                                                    component="span"
                                                    sx={{
                                                        display: "inline-block",
                                                        px: hot ? 0.8 : 0,
                                                        borderRadius: "999px",
                                                        bgcolor: hot
                                                            ? sev.bg
                                                            : "transparent",
                                                        color: hot
                                                            ? sev.text
                                                            : C.text,
                                                        fontWeight: hot
                                                            ? 700
                                                            : 400,
                                                    }}
                                                >
                                                    {num(v)}
                                                </Box>
                                            ) : (
                                                <Box
                                                    component="span"
                                                    sx={{
                                                        color: C.borderLight,
                                                    }}
                                                >
                                                    ·
                                                </Box>
                                            )}
                                        </td>
                                    );
                                })}
                                <td
                                    className="num"
                                    style={{
                                        fontWeight: 700,
                                        color:
                                            rate > 0.02
                                                ? C.error
                                                : rate > 0
                                                  ? C.warn
                                                  : C.green,
                                    }}
                                >
                                    {pct(rate)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </TableBox>
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: {
                        xs: "1fr",
                        md: "repeat(2, minmax(0,1fr))",
                    },
                    gap: 1.25,
                    p: { xs: 1.5, md: 2 },
                    borderTop: `1px solid ${C.border}`,
                    bgcolor: C.paper,
                }}
            >
                {statuses
                    .concat(
                        Object.keys(FUNCTION_OUTCOME_INFO).filter(
                            (k) =>
                                !statuses.includes(k) &&
                                [
                                    "exceededResources",
                                    "scriptThrewException",
                                ].includes(k),
                        ),
                    )
                    .map((s) => {
                        const o = functionOutcomeInfo(s);
                        const sev = SEV[o.severity];
                        return (
                            <Box key={s} sx={{ display: "flex", gap: 1 }}>
                                <Box
                                    sx={{
                                        width: 3,
                                        borderRadius: 2,
                                        bgcolor: sev.color,
                                        flexShrink: 0,
                                    }}
                                />
                                <Box>
                                    <Typography
                                        sx={{
                                            ...eyebrow,
                                            color: sev.text,
                                            fontSize: "0.6rem",
                                        }}
                                    >
                                        {s}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            fontSize: "0.76rem",
                                            color: C.textDim,
                                            mt: 0.25,
                                        }}
                                    >
                                        {o.meaning}
                                    </Typography>
                                </Box>
                            </Box>
                        );
                    })}
            </Box>
        </Box>
    );
}
