"use client";

/**
 * Stacked status-class timeline (hand-rolled SVG). Counts or share-of-traffic,
 * hover crosshair + tooltip, colours from STATUS_COLORS.
 */

import { C, STATUS_COLORS } from "@/components/ui";
import type { StatusClass, TimelinePoint } from "@/lib/diagnostics-core";
import { fmt } from "@/lib/format";
import { Box, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { num } from "./shared";

const W = 800;

export default function StatusTimeline({
    points,
    classes,
    height = 240,
}: {
    points: TimelinePoint[];
    /** Classes to draw, bottom → top. */
    classes: StatusClass[];
    height?: number;
}) {
    const [mode, setMode] = useState<"count" | "share">("count");
    const [hover, setHover] = useState<number | null>(null);
    const H = height;
    const PAD = { top: 8, bottom: 4 };

    const model = useMemo(() => {
        const n = points.length;
        const innerH = H - PAD.top - PAD.bottom;
        const totals = points.map((p) =>
            classes.reduce((a, c) => a + (p[c] || 0), 0),
        );
        const allTotals = points.map(
            (p) => p["1xx"] + p["2xx"] + p["3xx"] + p["4xx"] + p["5xx"],
        );
        const val = (i: number, c: StatusClass) =>
            mode === "share"
                ? allTotals[i]
                    ? (points[i][c] || 0) / allTotals[i]
                    : 0
                : points[i][c] || 0;
        let max = 0;
        for (let i = 0; i < n; i++) {
            let s = 0;
            for (const c of classes) s += val(i, c);
            max = Math.max(max, s);
        }
        if (mode === "share") max = Math.max(max, 0.0001);
        if (max <= 0) max = 1;
        const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
        const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
        const base = new Array(n).fill(0);
        const layers = classes.map((c) => {
            const lower = [...base];
            for (let i = 0; i < n; i++) base[i] += val(i, c);
            const upper = [...base];
            let d = "";
            for (let i = 0; i < n; i++)
                d += `${i ? "L" : "M"}${x(i).toFixed(1)},${y(upper[i]).toFixed(1)} `;
            for (let i = n - 1; i >= 0; i--)
                d += `L${x(i).toFixed(1)},${y(lower[i]).toFixed(1)} `;
            let line = "";
            for (let i = 0; i < n; i++)
                line += `${i ? "L" : "M"}${x(i).toFixed(1)},${y(upper[i]).toFixed(1)} `;
            const total = points.reduce((a, p) => a + (p[c] || 0), 0);
            return { c, d: `${d}Z`, line, total };
        });
        const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
            y: PAD.top + innerH - f * innerH,
            label:
                mode === "share"
                    ? `${(max * f * 100).toFixed(max < 0.05 ? 1 : 0)}%`
                    : fmt(max * f),
        }));
        return { layers, grid, totals, allTotals };
    }, [points, classes, mode, H]);

    if (!points.length)
        return (
            <Typography
                sx={{
                    color: C.textMuted,
                    fontSize: "0.82rem",
                    py: 5,
                    textAlign: "center",
                }}
            >
                No requests in this window.
            </Typography>
        );

    const fmtTs = (ts: string, withMin = false) =>
        new Date(ts).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            ...(withMin ? { minute: "2-digit" } : {}),
        });
    const hp = hover !== null ? points[hover] : null;
    const leftPct = (i: number) =>
        points.length <= 1 ? 50 : (i / (points.length - 1)) * 100;

    return (
        <Box>
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 1,
                    mb: 1.25,
                }}
            >
                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                    {[...model.layers].reverse().map((l) => (
                        <Box
                            key={l.c}
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.6,
                            }}
                        >
                            <Box
                                sx={{
                                    width: 9,
                                    height: 9,
                                    borderRadius: "3px",
                                    bgcolor: STATUS_COLORS[l.c],
                                }}
                            />
                            <Typography
                                sx={{ fontSize: "0.74rem", color: C.textDim }}
                            >
                                {l.c}
                                <Box
                                    component="span"
                                    sx={{
                                        color: C.text,
                                        fontWeight: 700,
                                        ml: 0.6,
                                    }}
                                >
                                    {fmt(l.total)}
                                </Box>
                            </Typography>
                        </Box>
                    ))}
                </Box>
                <Box
                    sx={{
                        display: "flex",
                        p: 0.3,
                        borderRadius: "999px",
                        border: `1px solid ${C.line}`,
                    }}
                >
                    {(["count", "share"] as const).map((m) => (
                        <Box
                            key={m}
                            component="button"
                            onClick={() => setMode(m)}
                            sx={{
                                border: "none",
                                cursor: "pointer",
                                px: 1.1,
                                py: 0.3,
                                borderRadius: "999px",
                                fontFamily: C.mono,
                                fontSize: "0.66rem",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                color: mode === m ? "#fff" : C.textMuted,
                                bgcolor: mode === m ? C.ink : "transparent",
                            }}
                        >
                            {m === "count" ? "Requests" : "Share"}
                        </Box>
                    ))}
                </Box>
            </Box>
            <Box
                sx={{ position: "relative", touchAction: "pan-y" }}
                onMouseMove={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.min(
                        1,
                        Math.max(0, (e.clientX - r.left) / r.width),
                    );
                    setHover(Math.round(ratio * (points.length - 1)));
                }}
                onMouseLeave={() => setHover(null)}
            >
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    width="100%"
                    height={H}
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Status codes over time"
                    style={{ display: "block" }}
                >
                    {model.grid.map((g, i) => (
                        <line
                            key={i}
                            x1={0}
                            x2={W}
                            y1={g.y}
                            y2={g.y}
                            stroke={C.border}
                            strokeDasharray="2 5"
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
                    {model.layers.map((l) => (
                        <g key={l.c}>
                            <path
                                d={l.d}
                                fill={STATUS_COLORS[l.c]}
                                fillOpacity={0.55}
                            />
                            <path
                                d={l.line}
                                fill="none"
                                stroke={STATUS_COLORS[l.c]}
                                strokeWidth={1.4}
                                vectorEffect="non-scaling-stroke"
                            />
                        </g>
                    ))}
                </svg>
                {model.grid.slice(1).map((g, i) => (
                    <Typography
                        key={i}
                        sx={{
                            position: "absolute",
                            left: 4,
                            top: g.y,
                            transform: "translateY(-50%)",
                            fontFamily: C.mono,
                            fontSize: "0.58rem",
                            color: C.textMuted,
                            bgcolor: "rgba(255,255,255,.85)",
                            px: 0.4,
                            borderRadius: "4px",
                            pointerEvents: "none",
                        }}
                    >
                        {g.label}
                    </Typography>
                ))}
                {hp && hover !== null && (
                    <>
                        <Box
                            sx={{
                                position: "absolute",
                                top: 0,
                                bottom: 0,
                                left: `${leftPct(hover)}%`,
                                width: "1px",
                                bgcolor: C.ink,
                                opacity: 0.35,
                                pointerEvents: "none",
                            }}
                        />
                        <Box
                            sx={{
                                position: "absolute",
                                top: 6,
                                left: `${leftPct(hover)}%`,
                                transform:
                                    hover > points.length / 2
                                        ? "translateX(calc(-100% - 10px))"
                                        : "translateX(10px)",
                                zIndex: 3,
                                pointerEvents: "none",
                                bgcolor: C.panel,
                                border: `1px solid ${C.border}`,
                                borderRadius: "12px",
                                boxShadow: "0 18px 48px rgba(20,32,24,.09)",
                                px: 1.25,
                                py: 1,
                                minWidth: 150,
                            }}
                        >
                            <Typography
                                sx={{
                                    fontFamily: C.mono,
                                    fontSize: "0.62rem",
                                    color: C.textMuted,
                                    mb: 0.5,
                                }}
                            >
                                {fmtTs(hp.ts, true)}
                            </Typography>
                            {[...classes].reverse().map((c) => (
                                <Box
                                    key={c}
                                    sx={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        gap: 2,
                                    }}
                                >
                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 0.6,
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                width: 7,
                                                height: 7,
                                                borderRadius: "2px",
                                                bgcolor: STATUS_COLORS[c],
                                            }}
                                        />
                                        <Typography
                                            sx={{
                                                fontSize: "0.72rem",
                                                color: C.textDim,
                                            }}
                                        >
                                            {c}
                                        </Typography>
                                    </Box>
                                    <Typography
                                        sx={{
                                            fontSize: "0.72rem",
                                            fontWeight: 700,
                                            fontVariantNumeric: "tabular-nums",
                                        }}
                                    >
                                        {num(hp[c] || 0)}
                                        <Box
                                            component="span"
                                            sx={{
                                                color: C.textMuted,
                                                fontWeight: 400,
                                                ml: 0.75,
                                            }}
                                        >
                                            {model.allTotals[hover]
                                                ? `${(((hp[c] || 0) / model.allTotals[hover]) * 100).toFixed(1)}%`
                                                : "—"}
                                        </Box>
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    </>
                )}
            </Box>
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    mt: 0.6,
                    fontFamily: C.mono,
                    fontSize: "0.62rem",
                    color: C.textMuted,
                }}
            >
                <span suppressHydrationWarning>{fmtTs(points[0].ts)}</span>
                <span suppressHydrationWarning>
                    {fmtTs(points[Math.floor(points.length / 2)].ts)}
                </span>
                <span suppressHydrationWarning>
                    {fmtTs(points[points.length - 1].ts)}
                </span>
            </Box>
        </Box>
    );
}
