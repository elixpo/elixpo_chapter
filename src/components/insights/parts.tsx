"use client";

/** Building blocks shared by the insights overview and product pages. */

import { C, eyebrow } from "@/components/ui";
import type { Dim, MonthRow } from "@/lib/insights-core";
import { Box, Tooltip, Typography } from "@mui/material";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type React from "react";

export const SOURCE = {
    users: {
        label: "Signed-in users",
        hint: "accounts.elixpo SSO",
        color: C.green,
    },
    edge: {
        label: "Visitors",
        hint: "Cloudflare edge · humans only",
        color: C.blue,
    },
    rum: {
        label: "Real browsers",
        hint: "Cloudflare Web Analytics",
        color: C.yellow,
    },
} as const;

export function evenGrid(cols = 4) {
    return {
        display: "grid",
        gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: `repeat(${cols}, minmax(0, 1fr))`,
        },
        gap: 1.5,
    } as const;
}

export function SectionHead({
    kicker,
    title,
    source,
    right,
}: {
    kicker: string;
    title?: string;
    source?: keyof typeof SOURCE;
    right?: React.ReactNode;
}) {
    const s = source ? SOURCE[source] : null;
    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 1.5,
                flexWrap: "wrap",
                mb: 1.5,
            }}
        >
            <Box>
                <Typography sx={{ ...eyebrow, mb: title ? 0.6 : 0 }}>
                    {kicker}
                </Typography>
                {title && (
                    <Typography
                        component="h2"
                        sx={{
                            fontSize: { xs: "1.45rem", md: "1.8rem" },
                            fontWeight: 650,
                            letterSpacing: "-0.05em",
                            lineHeight: 1,
                        }}
                    >
                        {title}
                    </Typography>
                )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {s && <SourceTag source={source as keyof typeof SOURCE} />}
                {right}
            </Box>
        </Box>
    );
}

export function SourceTag({ source }: { source: keyof typeof SOURCE }) {
    const s = SOURCE[source];
    return (
        <Tooltip title={s.hint}>
            <Box
                component="span"
                sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.6,
                    px: 1,
                    py: 0.35,
                    borderRadius: "999px",
                    border: `1px solid ${C.border}`,
                    bgcolor: C.panel,
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    color: C.textDim,
                    whiteSpace: "nowrap",
                }}
            >
                <Box
                    sx={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        bgcolor: s.color,
                    }}
                />
                {s.label}
            </Box>
        </Tooltip>
    );
}

/** 7d / 30d pill toggle driving ?range= (insights are day-based). */
export function DaysToggle({ days }: { days: number }) {
    const pathname = usePathname();
    const params = useSearchParams();
    const href = (range: string) => {
        const p = new URLSearchParams(params.toString());
        p.set("range", range);
        return `${pathname}?${p.toString()}`;
    };
    return (
        <Box
            sx={{
                display: "inline-flex",
                p: "3px",
                borderRadius: "999px",
                border: `1px solid ${C.border}`,
                bgcolor: C.paper,
            }}
        >
            {[
                { key: "7d", n: 7 },
                { key: "30d", n: 30 },
            ].map((r) => {
                const active = days === r.n;
                return (
                    <Box
                        key={r.key}
                        component={Link}
                        href={href(r.key)}
                        sx={{
                            px: 1.4,
                            py: 0.55,
                            borderRadius: "999px",
                            fontFamily: C.mono,
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            textDecoration: "none",
                            color: active ? "#fff" : C.textDim,
                            bgcolor: active ? C.ink : "transparent",
                        }}
                    >
                        {r.n} days
                    </Box>
                );
            })}
        </Box>
    );
}

export function Card({
    children,
    sx,
}: { children: React.ReactNode; sx?: object }) {
    return (
        <Box
            sx={{
                bgcolor: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: "20px",
                p: { xs: 1.75, md: 2.25 },
                minWidth: 0,
                ...sx,
            }}
        >
            {children}
        </Box>
    );
}

export function CardTitle({
    children,
    hint,
}: { children: React.ReactNode; hint?: string }) {
    return (
        <Box sx={{ mb: 1.25 }}>
            <Typography sx={{ ...eyebrow, color: C.textDim }}>
                {children}
            </Typography>
            {hint && (
                <Typography
                    sx={{ fontSize: "0.72rem", color: C.textMuted, mt: 0.4 }}
                >
                    {hint}
                </Typography>
            )}
        </Box>
    );
}

/** Compact horizontal bars with share %, for audience breakdowns. */
export function Bars({
    items,
    color = C.blue,
    limit = 8,
    format = (d: Dim) => d.label,
    empty = "No data in this window.",
}: {
    items: Dim[];
    color?: string;
    limit?: number;
    format?: (d: Dim) => string;
    empty?: string;
}) {
    const rows = items.slice(0, limit);
    const total = items.reduce((a, d) => a + d.value, 0) || 1;
    const max = Math.max(1, ...rows.map((d) => d.value));
    if (!rows.length)
        return (
            <Typography sx={{ fontSize: "0.8rem", color: C.textMuted, py: 1 }}>
                {empty}
            </Typography>
        );
    return (
        <Box sx={{ display: "grid", gap: 0.85 }}>
            {rows.map((d) => (
                <Box key={d.label}>
                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 1,
                            fontSize: "0.8rem",
                            mb: 0.35,
                        }}
                    >
                        <Box
                            component="span"
                            title={d.label}
                            sx={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                minWidth: 0,
                            }}
                        >
                            {format(d)}
                        </Box>
                        <Box
                            component="span"
                            sx={{
                                fontFamily: C.mono,
                                fontSize: "0.74rem",
                                color: C.textMuted,
                                flexShrink: 0,
                            }}
                        >
                            {d.value.toLocaleString()} ·{" "}
                            {((d.value / total) * 100).toFixed(0)}%
                        </Box>
                    </Box>
                    <Box
                        sx={{
                            height: 6,
                            borderRadius: 999,
                            bgcolor: C.paperDeep,
                            overflow: "hidden",
                        }}
                    >
                        <Box
                            sx={{
                                width: `${(d.value / max) * 100}%`,
                                height: "100%",
                                bgcolor: color,
                                borderRadius: 999,
                            }}
                        />
                    </Box>
                </Box>
            ))}
        </Box>
    );
}

/** Signed-in users per month, stacked new (green) vs returning (ink). */
export function MonthBars({ months }: { months: MonthRow[] }) {
    if (!months.length)
        return (
            <Typography sx={{ fontSize: "0.8rem", color: C.textMuted, py: 1 }}>
                No sign-ins recorded yet.
            </Typography>
        );
    const max = Math.max(1, ...months.map((m) => m.users));
    const fmtMonth = (m: string) =>
        new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, {
            month: "short",
            year: "2-digit",
            timeZone: "UTC",
        });
    return (
        <Box>
            <Box
                sx={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 1,
                    height: 150,
                }}
            >
                {months.map((m) => (
                    <Tooltip
                        key={m.month}
                        title={`${fmtMonth(m.month)} · ${m.users} active · ${m.newUsers} new · ${m.returningUsers} returning`}
                    >
                        <Box
                            sx={{
                                flex: 1,
                                minWidth: 0,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 0.5,
                                height: "100%",
                                justifyContent: "flex-end",
                            }}
                        >
                            <Typography
                                sx={{
                                    fontFamily: C.mono,
                                    fontSize: "0.68rem",
                                    color: C.textDim,
                                }}
                            >
                                {m.users}
                            </Typography>
                            <Box
                                sx={{
                                    width: "100%",
                                    maxWidth: 46,
                                    height: `${(m.users / max) * 110}px`,
                                    minHeight: 3,
                                    display: "flex",
                                    flexDirection: "column",
                                    borderRadius: "8px 8px 3px 3px",
                                    overflow: "hidden",
                                }}
                            >
                                <Box
                                    sx={{ flex: m.newUsers, bgcolor: C.green }}
                                />
                                <Box
                                    sx={{
                                        flex: m.returningUsers,
                                        bgcolor: C.ink,
                                    }}
                                />
                            </Box>
                        </Box>
                    </Tooltip>
                ))}
            </Box>
            <Box sx={{ display: "flex", gap: 1, mt: 0.75 }}>
                {months.map((m) => (
                    <Typography
                        key={m.month}
                        sx={{
                            flex: 1,
                            minWidth: 0,
                            textAlign: "center",
                            fontFamily: C.mono,
                            fontSize: "0.62rem",
                            color: C.textMuted,
                        }}
                    >
                        {fmtMonth(m.month)}
                    </Typography>
                ))}
            </Box>
            <Box
                sx={{
                    display: "flex",
                    gap: 2,
                    mt: 1.25,
                    fontSize: "0.72rem",
                    color: C.textMuted,
                }}
            >
                <Legend color={C.green} label="New that month" />
                <Legend color={C.ink} label="Returning" />
            </Box>
        </Box>
    );
}

export function Legend({ color, label }: { color: string; label: string }) {
    return (
        <Box
            component="span"
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.6 }}
        >
            <Box
                sx={{
                    width: 9,
                    height: 9,
                    borderRadius: "3px",
                    bgcolor: color,
                }}
            />
            {label}
        </Box>
    );
}

export function Note({ children }: { children: React.ReactNode }) {
    return (
        <Box
            sx={{
                p: 1.5,
                borderRadius: "14px",
                bgcolor: C.paperDeep,
                color: C.textDim,
                fontSize: "0.78rem",
                lineHeight: 1.6,
            }}
        >
            {children}
        </Box>
    );
}

export const fmtMs = (ms: number | null) =>
    ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`;

export function delta(cur: number, prev: number): number | null {
    if (!prev) return cur ? null : 0;
    return ((cur - prev) / prev) * 100;
}
