"use client";

/**
 * Building blocks for the account home: section headings, the decorative hero
 * geometry, service health cards and the attention list. Paper & ink tokens
 * only — every colour comes from C / STATUS_COLORS.
 */

import { C, STATUS_COLORS, eyebrow, fmt, glass } from "@/components/ui";
import type { StatusClass } from "@/lib/diagnostics";
import { ArrowForward } from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import Link from "next/link";
import type React from "react";
import type { AttentionItem, ServiceCard } from "./data";

export const CLASSES: StatusClass[] = ["2xx", "3xx", "4xx", "5xx", "1xx"];

export const SEVERITY_COLOR: Record<string, string> = {
    critical: STATUS_COLORS["5xx"],
    warning: STATUS_COLORS["4xx"],
    info: C.blue,
    ok: STATUS_COLORS["2xx"],
    idle: C.borderLight,
};

export function classColor(status: number): string {
    const c = `${Math.min(5, Math.max(1, Math.floor(status / 100)))}xx`;
    return STATUS_COLORS[c] || C.textMuted;
}

/* ------------------------------------------------------------ headings */

export function SectionHead({
    kicker,
    title,
    action,
}: {
    kicker: string;
    title?: string;
    action?: { label: string; href: string };
}) {
    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 1.5,
                mb: 1.25,
                flexWrap: "wrap",
            }}
        >
            <Box sx={{ minWidth: 0 }}>
                <Typography sx={eyebrow}>{kicker}</Typography>
                {title && (
                    <Typography
                        component="h2"
                        sx={{
                            mt: 0.4,
                            fontSize: { xs: "1.2rem", md: "1.4rem" },
                            fontWeight: 650,
                            letterSpacing: "-0.045em",
                            lineHeight: 1.1,
                            color: C.ink,
                        }}
                    >
                        {title}
                    </Typography>
                )}
            </Box>
            {action && <TextLink {...action} />}
        </Box>
    );
}

export function TextLink({ label, href }: { label: string; href: string }) {
    return (
        <Link href={href} style={{ textDecoration: "none" }}>
            <Box
                component="span"
                sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.5,
                    color: C.green,
                    fontSize: "0.8rem",
                    fontWeight: 650,
                    whiteSpace: "nowrap",
                    "&:hover": { textDecoration: "underline" },
                }}
            >
                {label}
                <ArrowForward sx={{ fontSize: "0.9rem" }} />
            </Box>
        </Link>
    );
}

export function PillLink({
    href,
    children,
    primary,
}: {
    href: string;
    children: React.ReactNode;
    primary?: boolean;
}) {
    return (
        <Link href={href} style={{ textDecoration: "none" }}>
            <Box
                component="span"
                sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.75,
                    px: 2,
                    py: 0.9,
                    borderRadius: "999px",
                    fontSize: "0.82rem",
                    fontWeight: 650,
                    whiteSpace: "nowrap",
                    transition: "background-color .15s, border-color .15s",
                    ...(primary
                        ? {
                              bgcolor: C.ink,
                              color: "#fff",
                              border: `1px solid ${C.ink}`,
                              "&:hover": { bgcolor: C.textDim },
                          }
                        : {
                              bgcolor: C.panel,
                              color: C.ink,
                              border: `1px solid ${C.line}`,
                              "&:hover": { borderColor: C.ink },
                          }),
                }}
            >
                {children}
            </Box>
        </Link>
    );
}

export function Card({
    children,
    sx,
}: {
    children: React.ReactNode;
    sx?: Record<string, unknown>;
}) {
    return (
        <Box sx={{ ...glass, p: { xs: 1.75, md: 2.25 }, minWidth: 0, ...sx }}>
            {children}
        </Box>
    );
}

/* ------------------------------------------------------------ geometry */

const GEO: Record<string, { bg: string; ink: string; accent: string }> = {
    healthy: { bg: "#d8edd5", ink: "#155a39", accent: "#f0ad16" },
    degraded: { bg: "#f6dfa0", ink: "#193c79", accent: "#f7f4e8" },
    failing: { bg: "#f0d7bd", ink: "#6c2e1e", accent: "#e76043" },
};

/** Research `.record-geometry` block: dot grid, ring, disc, tile — CSS only. */
export function HeroGeometry({
    state,
    label,
    count,
}: {
    state: "healthy" | "degraded" | "failing";
    label: string;
    count: number;
}) {
    const g = GEO[state];
    const piece = {
        position: "absolute",
        display: "block",
        transition: "transform .55s cubic-bezier(.2,.8,.2,1)",
    } as const;
    return (
        <Box
            aria-hidden
            sx={{
                position: "relative",
                height: { xs: 132, md: "100%" },
                minHeight: { md: 200 },
                overflow: "hidden",
                isolation: "isolate",
                borderRadius: { xs: "18px", md: "24px" },
                border: "1px solid rgba(20,32,24,.12)",
                bgcolor: g.bg,
                "&::before": {
                    content: '""',
                    position: "absolute",
                    inset: 0,
                    zIndex: -1,
                    opacity: 0.32,
                    backgroundImage:
                        "radial-gradient(circle at center, rgba(20,32,24,.38) 1px, transparent 1.5px)",
                    backgroundSize: "22px 22px",
                    maskImage: "linear-gradient(90deg,#000,transparent 72%)",
                    WebkitMaskImage:
                        "linear-gradient(90deg,#000,transparent 72%)",
                },
                "&:hover .geo-disc": {
                    transform: "rotate(31deg) translate(-8px,-5px)",
                },
                "&:hover .geo-tile": {
                    transform: "rotate(-6deg) translate(7px,-6px)",
                },
            }}
        >
            <Box
                sx={{
                    position: "absolute",
                    zIndex: 4,
                    inset: "1rem 1.1rem auto",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    color: g.ink,
                    fontFamily: C.mono,
                    fontWeight: 700,
                    fontSize: "0.6rem",
                    letterSpacing: "0.17em",
                    textTransform: "uppercase",
                }}
            >
                <span>{label}</span>
                <Box
                    component="b"
                    sx={{
                        display: "grid",
                        placeItems: "center",
                        width: 38,
                        height: 38,
                        border: "1px solid currentColor",
                        borderRadius: "50%",
                        fontSize: "0.72rem",
                        letterSpacing: 0,
                        bgcolor: "rgba(255,255,255,.35)",
                    }}
                >
                    {count}
                </Box>
            </Box>
            <Box
                component="i"
                sx={{
                    ...piece,
                    width: 260,
                    height: 260,
                    right: "4%",
                    top: -110,
                    border: `1px solid ${g.ink}9e`,
                    borderRadius: "50%",
                }}
            />
            <Box
                component="i"
                className="geo-disc"
                sx={{
                    ...piece,
                    width: { xs: 74, md: 110 },
                    height: { xs: 74, md: 110 },
                    right: "24%",
                    top: { xs: 40, md: 64 },
                    borderRadius: "48% 52% 35% 65%",
                    bgcolor: g.accent,
                    transform: "rotate(21deg)",
                    boxShadow: "0 18px 48px rgba(20,32,24,.09)",
                }}
            />
            <Box
                component="i"
                sx={{
                    ...piece,
                    width: 60,
                    height: 200,
                    left: "40%",
                    bottom: -120,
                    border: `1px solid ${g.ink}8c`,
                    borderRadius: "999px",
                    bgcolor: "rgba(255,255,255,.55)",
                    transform: "rotate(47deg)",
                }}
            />
            <Box
                component="i"
                className="geo-tile"
                sx={{
                    ...piece,
                    width: { xs: 64, md: 92 },
                    height: { xs: 64, md: 92 },
                    left: "9%",
                    bottom: -22,
                    borderRadius: "18% 82% 61% 39%",
                    bgcolor: g.ink,
                    transform: "rotate(-13deg)",
                }}
            />
            <Box
                component="i"
                sx={{
                    ...piece,
                    width: "50%",
                    height: "1px",
                    right: "7%",
                    bottom: 36,
                    bgcolor: `${g.ink}7a`,
                    transform: "rotate(-8deg)",
                    transformOrigin: "right",
                }}
            />
        </Box>
    );
}

/* -------------------------------------------------------- stacked bar */

export function ClassBar({
    byClass,
    height = 6,
}: {
    byClass: Record<StatusClass, number>;
    height?: number;
}) {
    const total = CLASSES.reduce((a, c) => a + byClass[c], 0);
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
                CLASSES.filter((c) => byClass[c] > 0).map((c) => (
                    <Box
                        key={c}
                        title={`${c}: ${byClass[c].toLocaleString()}`}
                        sx={{
                            width: `${(byClass[c] / total) * 100}%`,
                            bgcolor: STATUS_COLORS[c],
                        }}
                    />
                ))}
        </Box>
    );
}

export function Dot({ color, size = 9 }: { color: string; size?: number }) {
    return (
        <Box
            component="span"
            sx={{
                display: "inline-block",
                flex: "none",
                width: size,
                height: size,
                borderRadius: "50%",
                bgcolor: color,
                boxShadow: `0 0 0 3px ${color}26`,
            }}
        />
    );
}

/* --------------------------------------------------------- service card */

const BACKEND_LABEL: Record<string, string> = {
    pages: "Pages",
    worker: "Worker",
    route: "Route",
    dns: "DNS",
};

export function ServiceTile({ s }: { s: ServiceCard }) {
    const sevLabel =
        s.severity === "critical"
            ? "Failing"
            : s.severity === "warning"
              ? "Degraded"
              : s.severity === "idle"
                ? "No traffic"
                : "Healthy";
    return (
        <Link
            href={`/dashboard/services/${encodeURIComponent(s.host)}`}
            style={{ textDecoration: "none", minWidth: 0 }}
        >
            <Box
                sx={{
                    ...glass,
                    p: 1.5,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    transition: "border-color .15s, background-color .15s",
                    "&:hover": { borderColor: C.ink, bgcolor: C.panelHover },
                }}
            >
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        minWidth: 0,
                    }}
                >
                    <Box title={sevLabel} sx={{ display: "flex" }}>
                        <Dot color={SEVERITY_COLOR[s.severity]} />
                    </Box>
                    <Typography
                        sx={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: "0.86rem",
                            fontWeight: 650,
                            color: C.ink,
                            letterSpacing: "-0.01em",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }}
                    >
                        {s.host}
                    </Typography>
                    <Typography
                        sx={{
                            fontFamily: C.mono,
                            fontSize: "0.74rem",
                            fontWeight: 700,
                            color: s.total ? C.ink : C.textMuted,
                        }}
                    >
                        {fmt(s.total)}
                    </Typography>
                </Box>
                <ClassBar byClass={s.byClass} />
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                        flexWrap: "wrap",
                    }}
                >
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                        {s.backends.map((b) => (
                            <Box
                                key={b}
                                component="span"
                                sx={{
                                    px: 0.8,
                                    py: 0.1,
                                    borderRadius: "999px",
                                    border: `1px solid ${C.line}`,
                                    fontFamily: C.mono,
                                    fontSize: "0.6rem",
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    color: C.textMuted,
                                }}
                            >
                                {BACKEND_LABEL[b] || b}
                            </Box>
                        ))}
                    </Box>
                    {s.worst ? (
                        <Box
                            component="span"
                            sx={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 0.5,
                                fontFamily: C.mono,
                                fontSize: "0.68rem",
                                fontWeight: 700,
                                color: C.textDim,
                            }}
                        >
                            <Dot color={classColor(s.worst.status)} size={7} />
                            {s.worst.status} · {fmt(s.worst.count)}
                        </Box>
                    ) : (
                        <Typography
                            sx={{
                                fontFamily: C.mono,
                                fontSize: "0.66rem",
                                color: C.textMuted,
                            }}
                        >
                            {s.total ? "all 2xx" : "idle"}
                        </Typography>
                    )}
                </Box>
            </Box>
        </Link>
    );
}

/* ----------------------------------------------------- attention list */

export function AttentionRow({ f }: { f: AttentionItem }) {
    const color = SEVERITY_COLOR[f.severity];
    return (
        <Link
            href={`/dashboard/diagnostics?service=${encodeURIComponent(f.host)}`}
            style={{ textDecoration: "none" }}
        >
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 1.25,
                    alignItems: "start",
                    py: 1.25,
                    px: 1,
                    mx: -1,
                    borderRadius: "12px",
                    borderBottom: `1px solid ${C.line}`,
                    "&:hover": { bgcolor: C.panelHover },
                    "&:hover .go": { color: C.green },
                }}
            >
                <Box
                    sx={{
                        mt: 0.25,
                        px: 0.8,
                        py: 0.2,
                        borderRadius: "999px",
                        bgcolor:
                            f.severity === "critical" ? C.errorBg : C.warnBg,
                        color: f.severity === "critical" ? C.error : C.warn,
                        fontFamily: C.mono,
                        fontSize: "0.66rem",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                    }}
                >
                    <Dot color={color} size={6} />
                    {f.status}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    <Typography
                        sx={{
                            fontSize: "0.86rem",
                            fontWeight: 650,
                            color: C.ink,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {f.title}
                    </Typography>
                    <Typography
                        sx={{
                            mt: 0.25,
                            fontSize: "0.76rem",
                            color: C.textMuted,
                            lineHeight: 1.45,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                        }}
                    >
                        {f.reason}
                    </Typography>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                    <Typography
                        sx={{
                            fontFamily: C.mono,
                            fontSize: "0.74rem",
                            fontWeight: 700,
                            color: C.ink,
                        }}
                    >
                        {fmt(f.count)}
                    </Typography>
                    <Typography
                        className="go"
                        sx={{
                            fontFamily: C.mono,
                            fontSize: "0.64rem",
                            color: C.textMuted,
                        }}
                    >
                        {(f.share * 100).toFixed(f.share < 0.1 ? 1 : 0)}%
                    </Typography>
                </Box>
            </Box>
        </Link>
    );
}

/* ----------------------------------------------------------- formatting */

export function ago(now: number, iso: string): string {
    const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
    return new Date(iso).toISOString().slice(0, 10);
}

let regionNames: Intl.DisplayNames | null = null;
export function countryName(code: string): string {
    try {
        regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
        return (code.length === 2 && regionNames.of(code)) || code;
    } catch {
        return code;
    }
}
