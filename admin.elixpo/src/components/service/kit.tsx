"use client";

/**
 * Small building blocks shared by the per-service dashboard tabs: responsive
 * panel grid, stacked-bar timeline, compact data table, notes and key/value
 * lists. Styled with the research.elixpo "paper & ink" tokens from ui.tsx.
 */

import { C, CHART, STATUS_COLORS, eyebrow } from "@/components/ui";
import { fmt } from "@/lib/format";
import { InfoOutlined } from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import Link from "next/link";
import type React from "react";
import { useMemo, useState } from "react";

/* ------------------------------------------------------------- formatting */

export function pct(n: number, digits = 1): string {
    if (!Number.isFinite(n)) return "—";
    return `${(n * 100).toFixed(digits)}%`;
}

export function fmtMs(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return "—";
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
    if (ms >= 10) return `${Math.round(ms)} ms`;
    return `${ms.toFixed(1)} ms`;
}

/** Workers quantiles come back in microseconds. */
export function fmtUs(us?: number): string {
    if (us == null || !Number.isFinite(us)) return "—";
    return fmtMs(us / 1000);
}

export function fmtTs(ts: string, withDate = true): string {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString("en-US", {
        ...(withDate ? { month: "short", day: "numeric" } : {}),
        hour: "numeric",
        minute: "2-digit",
    });
}

/* ------------------------------------------------------------------ grid */

/**
 * Dense Cloudflare-like panel grid. `cols` is the desktop column count; it
 * collapses to 2 on tablets (when > 2) and 1 on phones.
 */
export function Grid({
    cols = 2,
    min,
    children,
    mb = 2,
}: {
    cols?: number;
    /** Use auto-fill with this minimum tile width instead of fixed columns. */
    min?: number;
    children: React.ReactNode;
    mb?: number;
}) {
    return (
        <Box
            sx={{
                display: "grid",
                gap: 1.5,
                mb,
                minWidth: 0,
                gridTemplateColumns: min
                    ? `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`
                    : {
                          xs: "minmax(0,1fr)",
                          sm: `repeat(${Math.min(cols, 2)}, minmax(0,1fr))`,
                          lg: `repeat(${cols}, minmax(0,1fr))`,
                      },
                "& > *": { minWidth: 0 },
            }}
        >
            {children}
        </Box>
    );
}

/** Span a grid child across all columns. */
export function Wide({ children }: { children: React.ReactNode }) {
    return <Box sx={{ gridColumn: "1 / -1", minWidth: 0 }}>{children}</Box>;
}

export function SectionTitle({
    children,
    note,
}: {
    children: React.ReactNode;
    note?: React.ReactNode;
}) {
    return (
        <Box sx={{ mb: 1.25, mt: 0.5 }}>
            <Typography sx={{ ...eyebrow }}>{children}</Typography>
            {note && (
                <Typography
                    sx={{ color: C.textMuted, fontSize: "0.78rem", mt: 0.25 }}
                >
                    {note}
                </Typography>
            )}
        </Box>
    );
}

/* ------------------------------------------------------------------ notes */

export function Note({ children }: { children: React.ReactNode }) {
    return (
        <Box
            sx={{
                display: "flex",
                gap: 0.75,
                alignItems: "flex-start",
                color: C.textMuted,
                fontSize: "0.74rem",
                lineHeight: 1.45,
                mt: 1,
            }}
        >
            <InfoOutlined
                sx={{ fontSize: "0.9rem", mt: "1px", color: C.blue }}
            />
            <Box>{children}</Box>
        </Box>
    );
}

export function Pill({
    children,
    tone = "neutral",
    mono,
}: {
    children: React.ReactNode;
    tone?: "neutral" | "blue" | "green" | "warn" | "error" | "ink";
    mono?: boolean;
}) {
    const t = {
        neutral: { c: C.textDim, bg: C.paperDeep, b: C.line },
        blue: { c: C.accentDeep, bg: C.blueWash, b: `${C.blue}40` },
        green: { c: C.success, bg: C.successBg, b: `${C.success}33` },
        warn: { c: C.warn, bg: C.warnBg, b: `${C.warn}33` },
        error: { c: C.error, bg: C.errorBg, b: `${C.error}33` },
        ink: { c: "#fff", bg: C.ink, b: C.ink },
    }[tone];
    return (
        <Box
            component="span"
            sx={{
                display: "inline-flex",
                alignItems: "center",
                px: 1,
                py: 0.2,
                borderRadius: "999px",
                fontSize: "0.68rem",
                fontWeight: 650,
                fontFamily: mono ? C.mono : "inherit",
                color: t.c,
                bgcolor: t.bg,
                border: `1px solid ${t.b}`,
                whiteSpace: "nowrap",
                lineHeight: 1.5,
            }}
        >
            {children}
        </Box>
    );
}

/** Key → value rows (settings, metadata). */
export function KV({
    rows,
}: {
    rows: { k: string; v: React.ReactNode; hint?: string }[];
}) {
    return (
        <Box>
            {rows.map((r) => (
                <Box
                    key={r.k}
                    sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 2,
                        py: 0.85,
                        borderBottom: `1px solid ${C.border}`,
                        "&:last-of-type": { borderBottom: "none" },
                    }}
                >
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: "0.8rem", color: C.text }}>
                            {r.k}
                        </Typography>
                        {r.hint && (
                            <Typography
                                sx={{ fontSize: "0.7rem", color: C.textMuted }}
                            >
                                {r.hint}
                            </Typography>
                        )}
                    </Box>
                    <Box
                        sx={{
                            fontSize: "0.8rem",
                            fontFamily: C.mono,
                            color: C.textDim,
                            textAlign: "right",
                            wordBreak: "break-all",
                        }}
                    >
                        {r.v}
                    </Box>
                </Box>
            ))}
        </Box>
    );
}

/* ------------------------------------------------------------- data table */

export interface Col<T> {
    key: string;
    label: string;
    align?: "left" | "right";
    mono?: boolean;
    render?: (row: T) => React.ReactNode;
    width?: number | string;
}

export function DataTable<T>({
    cols,
    rows,
    limit = 15,
    empty = "No rows in this window.",
}: {
    cols: Col<T>[];
    rows: T[];
    limit?: number;
    empty?: string;
}) {
    const [all, setAll] = useState(false);
    if (!rows.length) {
        return (
            <Typography
                sx={{
                    color: C.textMuted,
                    fontSize: "0.82rem",
                    py: 2,
                    textAlign: "center",
                }}
            >
                {empty}
            </Typography>
        );
    }
    const shown = all ? rows : rows.slice(0, limit);
    return (
        <Box>
            <Box sx={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <Box
                    component="table"
                    sx={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.78rem",
                        "& th": {
                            ...eyebrow,
                            fontSize: "0.6rem",
                            color: C.textMuted,
                            textAlign: "left",
                            fontWeight: 700,
                            py: 0.9,
                            px: 1.25,
                            borderBottom: `1px solid ${C.border}`,
                            whiteSpace: "nowrap",
                            bgcolor: C.paper,
                        },
                        "& td": {
                            py: 0.8,
                            px: 1.25,
                            borderBottom: `1px solid ${C.border}`,
                            color: C.text,
                            verticalAlign: "middle",
                        },
                        "& tr:last-of-type td": { borderBottom: "none" },
                        "& tbody tr:hover td": { bgcolor: C.panelHover },
                    }}
                >
                    <thead>
                        <tr>
                            {cols.map((c) => (
                                <th
                                    key={c.key}
                                    style={{
                                        textAlign: c.align || "left",
                                        width: c.width,
                                    }}
                                >
                                    {c.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((r, i) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id
                            <tr key={i}>
                                {cols.map((c) => (
                                    <td
                                        key={c.key}
                                        style={{
                                            textAlign: c.align || "left",
                                            fontFamily: c.mono
                                                ? C.mono
                                                : undefined,
                                            fontVariantNumeric: "tabular-nums",
                                            whiteSpace: c.mono
                                                ? "nowrap"
                                                : undefined,
                                        }}
                                    >
                                        {c.render
                                            ? c.render(r)
                                            : String(
                                                  (
                                                      r as Record<
                                                          string,
                                                          unknown
                                                      >
                                                  )[c.key] ?? "—",
                                              )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </Box>
            </Box>
            {rows.length > limit && (
                <Box
                    component="button"
                    onClick={() => setAll((a) => !a)}
                    sx={{
                        display: "block",
                        width: "100%",
                        border: "none",
                        borderTop: `1px solid ${C.border}`,
                        bgcolor: "transparent",
                        py: 0.9,
                        cursor: "pointer",
                        color: C.green,
                        fontSize: "0.76rem",
                        fontWeight: 650,
                        fontFamily: "inherit",
                        "&:hover": { bgcolor: C.panelHover },
                    }}
                >
                    {all ? "Show fewer" : `Show all ${rows.length}`}
                </Box>
            )}
        </Box>
    );
}

/** Truncating mono path cell. */
export function PathCell({ path, max = 420 }: { path: string; max?: number }) {
    return (
        <Box
            component="span"
            title={path}
            sx={{
                display: "inline-block",
                maxWidth: { xs: 200, sm: max },
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                verticalAlign: "bottom",
                fontFamily: C.mono,
                fontSize: "0.74rem",
            }}
        >
            {path}
        </Box>
    );
}

/* -------------------------------------------------------- stacked timeline */

export interface StackKey {
    key: string;
    label?: string;
    color?: string;
}

/** Stacked bars over time (status classes, cache statuses, Function outcomes). */
export function StackedBars({
    points: rawPoints,
    keys,
    height = 190,
}: {
    /** Objects with `ts` plus a numeric field per key (interfaces welcome). */
    points: { ts: string }[];
    keys: StackKey[];
    height?: number;
}) {
    const [hover, setHover] = useState<number | null>(null);
    const points = rawPoints as { ts: string; [k: string]: unknown }[];
    const W = 600;
    const H = height;
    const PAD = { top: 8, bottom: 4 };
    const cols = keys.map((k, i) => ({
        ...k,
        color: k.color || CHART[i % CHART.length],
        label: k.label || k.key,
    }));
    const { max, totals } = useMemo(() => {
        let max = 1;
        const totals: Record<string, number> = {};
        for (const p of points) {
            let s = 0;
            for (const k of keys) {
                const v = Number(p[k.key]) || 0;
                s += v;
                totals[k.key] = (totals[k.key] || 0) + v;
            }
            max = Math.max(max, s);
        }
        return { max, totals };
    }, [points, keys]);

    if (!points.length) {
        return (
            <Typography
                sx={{
                    color: C.textMuted,
                    fontSize: "0.82rem",
                    py: 4,
                    textAlign: "center",
                }}
            >
                No data in this window.
            </Typography>
        );
    }
    const n = points.length;
    const bw = W / n;
    const innerH = H - PAD.top - PAD.bottom;
    const hp = hover != null ? points[hover] : null;

    return (
        <Box>
            <Box sx={{ display: "flex", gap: 1.75, mb: 1, flexWrap: "wrap" }}>
                {cols.map((c) => (
                    <Box
                        key={c.key}
                        sx={{ display: "flex", alignItems: "center", gap: 0.6 }}
                    >
                        <Box
                            sx={{
                                width: 8,
                                height: 8,
                                borderRadius: "2px",
                                bgcolor: c.color,
                            }}
                        />
                        <Typography
                            sx={{ fontSize: "0.72rem", color: C.textDim }}
                        >
                            {c.label}
                            <Box
                                component="span"
                                sx={{ color: C.text, fontWeight: 650, ml: 0.5 }}
                            >
                                {fmt(
                                    hp
                                        ? Number(hp[c.key]) || 0
                                        : totals[c.key] || 0,
                                )}
                            </Box>
                        </Typography>
                    </Box>
                ))}
            </Box>
            <Box sx={{ position: "relative" }}>
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    width="100%"
                    height={H}
                    preserveAspectRatio="none"
                    onMouseLeave={() => setHover(null)}
                    role="img"
                    aria-label="Stacked timeline"
                >
                    {[0.25, 0.5, 0.75, 1].map((f) => (
                        <line
                            key={f}
                            x1={0}
                            x2={W}
                            y1={PAD.top + innerH - f * innerH}
                            y2={PAD.top + innerH - f * innerH}
                            stroke={C.line}
                            strokeDasharray="3 4"
                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
                    {points.map((p, i) => {
                        let y = PAD.top + innerH;
                        const gap = bw > 4 ? Math.min(2, bw * 0.15) : 0;
                        return (
                            <g
                                key={p.ts}
                                onMouseEnter={() => setHover(i)}
                                opacity={
                                    hover == null || hover === i ? 1 : 0.55
                                }
                            >
                                <rect
                                    x={i * bw}
                                    y={0}
                                    width={bw}
                                    height={H}
                                    fill="transparent"
                                />
                                {cols.map((c) => {
                                    const v = Number(p[c.key]) || 0;
                                    if (!v) return null;
                                    const h = (v / max) * innerH;
                                    y -= h;
                                    return (
                                        <rect
                                            key={c.key}
                                            x={i * bw + gap / 2}
                                            y={y}
                                            width={Math.max(bw - gap, 0.5)}
                                            height={h}
                                            fill={c.color}
                                        />
                                    );
                                })}
                            </g>
                        );
                    })}
                </svg>
            </Box>
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    mt: 0.5,
                }}
            >
                <Typography
                    sx={{
                        fontSize: "0.68rem",
                        color: C.textMuted,
                        fontFamily: C.mono,
                    }}
                >
                    {hp ? fmtTs(hp.ts) : fmtTs(points[0].ts)}
                </Typography>
                <Typography
                    sx={{
                        fontSize: "0.68rem",
                        color: C.textMuted,
                        fontFamily: C.mono,
                    }}
                >
                    {hp ? `peak ${fmt(max)}` : fmtTs(points[n - 1].ts)}
                </Typography>
            </Box>
        </Box>
    );
}

export const STATUS_KEYS: StackKey[] = ["2xx", "3xx", "4xx", "5xx", "1xx"].map(
    (k) => ({
        key: k,
        color: STATUS_COLORS[k],
    }),
);

/* ----------------------------------------------------- horizontal stack bar */

/** Single 100% horizontal bar from labelled parts. */
export function ShareBar({
    parts,
    height = 8,
}: {
    parts: { label: string; value: number; color: string }[];
    height?: number;
}) {
    const total = parts.reduce((a, p) => a + p.value, 0);
    return (
        <Box
            sx={{
                display: "flex",
                height,
                borderRadius: "999px",
                overflow: "hidden",
                bgcolor: C.paperDeep,
            }}
        >
            {total > 0 &&
                parts
                    .filter((p) => p.value > 0)
                    .map((p) => (
                        <Box
                            key={p.label}
                            title={`${p.label}: ${p.value.toLocaleString()} (${pct(p.value / total)})`}
                            sx={{
                                width: `${(p.value / total) * 100}%`,
                                bgcolor: p.color,
                            }}
                        />
                    ))}
        </Box>
    );
}

/* ----------------------------------------------------------------- links */

export function TextLink({
    href,
    children,
    external,
}: {
    href: string;
    children: React.ReactNode;
    external?: boolean;
}) {
    const sx = {
        color: C.green,
        fontWeight: 650,
        textDecoration: "none",
        "&:hover": { textDecoration: "underline" },
    } as const;
    return external ? (
        <Box component="a" href={href} target="_blank" rel="noreferrer" sx={sx}>
            {children}
        </Box>
    ) : (
        <Box component={Link} href={href} sx={sx}>
            {children}
        </Box>
    );
}

/** Colour for a status code / class. */
export function statusColor(code: number | string): string {
    const n = Number(code);
    if (n >= 500) return STATUS_COLORS["5xx"];
    if (n >= 400) return STATUS_COLORS["4xx"];
    if (n >= 300) return STATUS_COLORS["3xx"];
    if (n >= 200) return STATUS_COLORS["2xx"];
    return STATUS_COLORS["1xx"];
}

export function CodeBadge({ code }: { code: number | string }) {
    const c = statusColor(code);
    return (
        <Box
            component="span"
            sx={{
                display: "inline-block",
                minWidth: 38,
                textAlign: "center",
                px: 0.75,
                py: 0.1,
                borderRadius: "6px",
                fontFamily: C.mono,
                fontSize: "0.72rem",
                fontWeight: 700,
                color: Number(code) >= 400 && Number(code) < 500 ? C.warn : c,
                bgcolor: `${c}1f`,
                border: `1px solid ${c}55`,
            }}
        >
            {code}
        </Box>
    );
}

/** Small toggle pill for in-panel filters. */
export function FilterPill({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <Box
            component="button"
            onClick={onClick}
            sx={{
                border: `1px solid ${active ? C.ink : C.line}`,
                bgcolor: active ? C.ink : "transparent",
                color: active ? "#fff" : C.textDim,
                borderRadius: "999px",
                px: 1.1,
                py: 0.2,
                fontSize: "0.7rem",
                fontWeight: 650,
                fontFamily: "inherit",
                cursor: "pointer",
            }}
        >
            {children}
        </Box>
    );
}
