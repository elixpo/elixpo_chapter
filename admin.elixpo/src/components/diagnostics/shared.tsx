"use client";

/** Small shared pieces for the diagnostics dashboard (tables, chips, CSV). */

import { C, STATUS_COLORS, eyebrow, glass } from "@/components/ui";
import { type Severity, classOf } from "@/lib/diagnostics-core";
import { ArrowDownward, ArrowUpward } from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import Link from "next/link";
import type React from "react";

export const SEV: Record<
    Severity,
    { label: string; color: string; text: string; bg: string; rank: number }
> = {
    critical: {
        label: "Critical",
        color: C.orange,
        text: C.error,
        bg: C.errorBg,
        rank: 0,
    },
    warning: {
        label: "Warning",
        color: C.yellow,
        text: C.warn,
        bg: C.warnBg,
        rank: 1,
    },
    info: {
        label: "Info",
        color: C.blue,
        text: C.blue,
        bg: C.blueWash,
        rank: 2,
    },
};

export const pct = (x: number, digits = 1) =>
    `${(x * 100).toFixed(x > 0 && x < 0.001 ? 2 : digits)}%`;
export const num = (x: number) => Math.round(x).toLocaleString("en-US");

export function SevChip({ sev }: { sev: Severity }) {
    const s = SEV[sev];
    return (
        <Box
            component="span"
            sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.6,
                px: 1,
                py: 0.2,
                borderRadius: "999px",
                bgcolor: s.bg,
                color: s.text,
                border: `1px solid ${s.color}55`,
                fontFamily: C.mono,
                fontSize: "0.62rem",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
            }}
        >
            <Box
                component="span"
                sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: s.color,
                }}
            />
            {s.label}
        </Box>
    );
}

/** Status-code pill coloured by class. `onClick` makes it a filter shortcut. */
export function CodeChip({
    code,
    onClick,
    active,
    label,
}: {
    code: number;
    onClick?: () => void;
    active?: boolean;
    label?: string;
}) {
    const color = STATUS_COLORS[classOf(code)];
    return (
        <Box
            component={onClick ? "button" : "span"}
            onClick={onClick}
            title={onClick ? `Filter to ${code}` : undefined}
            sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                px: 0.9,
                py: 0.15,
                borderRadius: "999px",
                border: `1px solid ${active ? color : `${color}66`}`,
                bgcolor: active ? color : `${color}18`,
                color: active ? "#fff" : C.text,
                fontFamily: C.mono,
                fontSize: "0.72rem",
                fontWeight: 700,
                cursor: onClick ? "pointer" : "default",
                whiteSpace: "nowrap",
                lineHeight: 1.5,
            }}
        >
            {code === 0 ? "—" : code}
            {label && (
                <Box
                    component="span"
                    sx={{
                        fontWeight: 500,
                        fontFamily: "inherit",
                        opacity: 0.8,
                    }}
                >
                    {label}
                </Box>
            )}
        </Box>
    );
}

/** Section wrapper: mono eyebrow + big heading + white hairline card. */
export function Section({
    id,
    kicker,
    title,
    note,
    action,
    children,
    flush,
}: {
    id?: string;
    kicker: string;
    title: string;
    note?: React.ReactNode;
    action?: React.ReactNode;
    children: React.ReactNode;
    /** No inner padding (tables). */
    flush?: boolean;
}) {
    return (
        <Box id={id} component="section" sx={{ mt: 4, minWidth: 0 }}>
            <Box
                sx={{
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: 1.5,
                    flexWrap: "wrap",
                    mb: 1.25,
                }}
            >
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={eyebrow}>{kicker}</Typography>
                    <Typography
                        sx={{
                            fontWeight: 650,
                            fontSize: { xs: "1.25rem", md: "1.5rem" },
                            letterSpacing: "-0.045em",
                            color: C.text,
                            lineHeight: 1.15,
                            mt: 0.25,
                        }}
                    >
                        {title}
                    </Typography>
                    {note && (
                        <Typography
                            sx={{
                                color: C.textMuted,
                                fontSize: "0.8rem",
                                mt: 0.4,
                                maxWidth: 760,
                            }}
                        >
                            {note}
                        </Typography>
                    )}
                </Box>
                {action}
            </Box>
            <Box
                sx={{
                    ...glass,
                    overflow: "hidden",
                    p: flush ? 0 : { xs: 1.5, md: 2 },
                    minWidth: 0,
                }}
            >
                {children}
            </Box>
        </Box>
    );
}

/* ------------------------------------------------------------------ tables */

/** Horizontal-scroll container with the shared table look. */
export function TableBox({
    children,
    minWidth = 720,
}: {
    children: React.ReactNode;
    minWidth?: number;
}) {
    return (
        <Box sx={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <Box
                component="table"
                sx={{
                    width: "100%",
                    minWidth,
                    borderCollapse: "collapse",
                    fontSize: "0.8rem",
                    color: C.text,
                    "& th": {
                        ...eyebrow,
                        color: C.textMuted,
                        fontSize: "0.6rem",
                        letterSpacing: "0.14em",
                        textAlign: "left",
                        px: 1.25,
                        py: 1,
                        borderBottom: `1px solid ${C.border}`,
                        bgcolor: C.paper,
                        whiteSpace: "nowrap",
                        position: "sticky",
                        top: 0,
                    },
                    "& td": {
                        px: 1.25,
                        py: 0.85,
                        borderBottom: `1px solid ${C.border}`,
                        verticalAlign: "middle",
                    },
                    "& tbody tr:last-of-type td": { borderBottom: "none" },
                    "& td.num, & th.num": {
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                    },
                    "& td.mono": { fontFamily: C.mono, fontSize: "0.74rem" },
                }}
            >
                {children}
            </Box>
        </Box>
    );
}

export type SortDir = "asc" | "desc";

export function SortTh({
    label,
    k,
    sort,
    onSort,
    num: isNum,
    title,
}: {
    label: string;
    k: string;
    sort: { key: string; dir: SortDir };
    onSort: (k: string) => void;
    num?: boolean;
    title?: string;
}) {
    const active = sort.key === k;
    const Icon = sort.dir === "asc" ? ArrowUpward : ArrowDownward;
    return (
        <th className={isNum ? "num" : undefined} title={title}>
            <Box
                component="button"
                onClick={() => onSort(k)}
                sx={{
                    all: "unset",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.3,
                    color: active ? C.ink : "inherit",
                    "&:hover": { color: C.ink },
                }}
            >
                {label}
                <Icon
                    sx={{
                        fontSize: "0.75rem",
                        opacity: active ? 1 : 0,
                        transition: "opacity .15s",
                    }}
                />
            </Box>
        </th>
    );
}

/** Toggle helper for sortable tables. */
export function nextSort(
    cur: { key: string; dir: SortDir },
    k: string,
): { key: string; dir: SortDir } {
    return cur.key === k
        ? { key: k, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key: k, dir: "desc" };
}

export function cmp(a: unknown, b: unknown): number {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a ?? "").localeCompare(String(b ?? ""));
}

/** Download rows as CSV. */
export function downloadCsv(name: string, rows: (string | number)[][]) {
    const csv = rows
        .map((r) =>
            r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
        )
        .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

/** Small pill button (secondary style). */
export function PillButton({
    children,
    onClick,
    dark,
    disabled,
    title,
    href,
}: {
    children: React.ReactNode;
    onClick?: () => void;
    dark?: boolean;
    disabled?: boolean;
    title?: string;
    /** Render as a Next link instead of a button. */
    href?: string;
}) {
    const linkProps = href
        ? { component: Link, href }
        : { component: "button" as const, onClick, disabled };
    return (
        <Box
            {...linkProps}
            title={title}
            sx={{
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                px: 1.4,
                py: 0.55,
                borderRadius: "999px",
                border: `1px solid ${dark ? C.ink : C.line}`,
                bgcolor: dark ? C.ink : C.panel,
                color: dark ? "#fff" : C.text,
                fontSize: "0.76rem",
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.45 : 1,
                whiteSpace: "nowrap",
                transition: "border-color .15s, background .15s",
                "&:hover": disabled
                    ? undefined
                    : {
                          borderColor: C.ink,
                          bgcolor: dark ? C.ink : C.paperDeep,
                      },
            }}
        >
            {children}
        </Box>
    );
}

/** Thin stacked share bar for one row (by status class). */
export function ClassBar({
    byClass,
    total,
    height = 8,
}: {
    byClass: Record<string, number>;
    total: number;
    height?: number;
}) {
    return (
        <Box
            sx={{
                display: "flex",
                height,
                borderRadius: "999px",
                overflow: "hidden",
                bgcolor: C.paperDeep,
                minWidth: 90,
            }}
        >
            {["1xx", "2xx", "3xx", "4xx", "5xx"].map((k) =>
                byClass[k] > 0 ? (
                    <Box
                        key={k}
                        title={`${k}: ${num(byClass[k])}`}
                        sx={{
                            width: `${(byClass[k] / (total || 1)) * 100}%`,
                            bgcolor: STATUS_COLORS[k],
                        }}
                    />
                ) : null,
            )}
        </Box>
    );
}
