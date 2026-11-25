"use client";

/**
 * UI kit — the research.elixpo "paper & ink" look (warm paper ground, white
 * rounded cards, hairline borders, mono eyebrows) kept dense and operational:
 * KPI tiles with sparklines + deltas, panels, top-N bar tables, donuts.
 */

import TimeRange from "@/components/time-range";
import {
    ArrowDownward,
    ArrowUpward,
    ContentCopy,
    DownloadOutlined,
    ImageOutlined,
    MoreHoriz,
    PrintOutlined,
    Search as SearchIcon,
    SwapVert,
} from "@mui/icons-material";
import {
    Box,
    Card,
    Chip,
    IconButton,
    InputBase,
    ListItemIcon,
    Menu,
    MenuItem,
    Typography,
} from "@mui/material";
import Link from "next/link";
import type React from "react";
import { useMemo, useRef, useState } from "react";

// Re-export pure helpers so client code can keep importing from "@/components/ui".
// Server code should import these from "@/lib/format" directly.
export { fmt, fmtBytes, trend } from "@/lib/format";

/**
 * Elixpo "paper & ink" palette — shared with research.elixpo.com. Keys are kept
 * stable so every page restyles from here; new keys (paper, ink, line, …) are
 * the research tokens by name.
 */
export const C = {
    bg: "#fbfbf8",
    paper: "#fbfbf8",
    paperDeep: "#eff1ed",
    ink: "#142018",
    line: "#d7dbd6",
    blue: "#3a65c7",
    blueWash: "#dce7ff",
    green: "#0b623c",
    orange: "#e76043",
    yellow: "#f0ad16",
    accent: "#3a65c7",
    accentLight: "#2d55b3",
    accentDeep: "#1f3f8c",
    accentDim: "#dce7ff",
    panel: "#ffffff",
    panelSolid: "#ffffff",
    panelHover: "#f4f5f1",
    border: "#d7dbd6",
    borderLight: "#c3c8c2",
    text: "#142018",
    textDim: "#3d4741",
    textMuted: "#5f6962",
    success: "#0b623c",
    successBg: "#dcefe4",
    error: "#c2412a",
    errorBg: "#fbe3dd",
    warn: "#a66a00",
    warnBg: "#fbefd2",
    mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

/** Status-class colours used by every status-code visual. */
export const STATUS_COLORS: Record<string, string> = {
    "1xx": "#9aa39d",
    "2xx": "#2f9e63",
    "3xx": "#3a65c7",
    "4xx": "#f0ad16",
    "5xx": "#e76043",
};

/** Research palette for charts. Orange is reserved-ish for errors. */
export const CHART = [
    "#3a65c7",
    "#0b623c",
    "#f0ad16",
    "#142018",
    "#0e8a8a",
    "#e76043",
];

export const glass = {
    bgcolor: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: "18px",
} as const;

/** Mono uppercase eyebrow label — the research.elixpo signature. */
export const eyebrow = {
    fontFamily: C.mono,
    fontSize: "0.66rem",
    fontWeight: 700,
    letterSpacing: "0.17em",
    textTransform: "uppercase",
    color: C.blue,
} as const;

/* ---------------------------------------------------------------- page header */

export function PageHeader({
    title,
    subtitle,
    action,
    timeRange,
}: {
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
    /** Show the global time-range picker (analytics pages). */
    timeRange?: boolean;
}) {
    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 1.5,
                mb: 2.5,
            }}
        >
            <Box>
                <Typography
                    sx={{
                        fontWeight: 650,
                        fontSize: { xs: "1.9rem", md: "2.5rem" },
                        lineHeight: 1,
                        color: C.text,
                        letterSpacing: "-0.055em",
                    }}
                >
                    {title}
                </Typography>
                {subtitle && (
                    <Typography
                        sx={{
                            color: C.textMuted,
                            fontSize: "0.82rem",
                            mt: 0.25,
                        }}
                    >
                        {subtitle}
                    </Typography>
                )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {timeRange && <TimeRange />}
                {action}
            </Box>
        </Box>
    );
}

/* ---------------------------------------------------------------------- panel */

export function Panel({
    title,
    action,
    children,
    dense,
    exportData,
    exportName,
}: {
    title?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
    dense?: boolean;
    /** Rows offered for CSV export via the panel menu. */
    exportData?: { label: string; value: number | string }[];
    exportName?: string;
}) {
    const contentRef = useRef<HTMLDivElement>(null);
    return (
        <Card
            sx={{
                ...glass,
                height: "100%",
                boxShadow: "none",
            }}
        >
            {title && (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        px: 1.75,
                        py: 1.25,
                        borderBottom: `1px solid ${C.border}`,
                    }}
                >
                    <Typography
                        sx={{
                            ...eyebrow,
                            color: C.textDim,
                        }}
                    >
                        {title}
                    </Typography>
                    {action ?? (
                        <PanelMenu
                            title={title}
                            targetRef={contentRef}
                            exportData={exportData}
                            exportName={exportName || title}
                        />
                    )}
                </Box>
            )}
            <Box ref={contentRef} sx={{ p: dense ? 0 : 1.75 }}>
                {children}
            </Box>
        </Card>
    );
}

/* ----------------------------------------------------- panel action menu (3-dots) */

function PanelMenu({
    title,
    targetRef,
    exportData,
    exportName,
}: {
    title?: string;
    targetRef: React.RefObject<HTMLDivElement | null>;
    exportData?: { label: string; value: number | string }[];
    exportName?: string;
}) {
    const [anchor, setAnchor] = useState<null | HTMLElement>(null);
    const close = () => setAnchor(null);
    const slug = (exportName || title || "panel")
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase();

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
        } catch {}
        close();
    };
    const print = () => {
        window.print();
        close();
    };
    const saveImage = async () => {
        close();
        if (!targetRef.current) return;
        try {
            const { toPng } = await import("html-to-image");
            const url = await toPng(targetRef.current, {
                backgroundColor: C.panel,
                pixelRatio: 2,
            });
            const a = document.createElement("a");
            a.href = url;
            a.download = `${slug}.png`;
            a.click();
        } catch {}
    };
    const downloadCsv = () => {
        close();
        if (!exportData?.length) return;
        const rows = [
            ["label", "value"],
            ...exportData.map((d) => [d.label, String(d.value)]),
        ];
        const csv = rows
            .map((r) =>
                r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
            )
            .join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${slug}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <>
            <IconButton
                size="small"
                onClick={(e) => setAnchor(e.currentTarget)}
                sx={{
                    color: C.textMuted,
                    p: 0.25,
                    "&:hover": { color: C.text },
                }}
            >
                <MoreHoriz sx={{ fontSize: "1.1rem" }} />
            </IconButton>
            <Menu
                anchorEl={anchor}
                open={Boolean(anchor)}
                onClose={close}
                slotProps={{
                    paper: {
                        sx: {
                            bgcolor: C.panel,
                            boxShadow: "0 18px 48px rgba(20,32,24,.09)",
                            border: `1px solid ${C.border}`,
                            borderRadius: "14px",
                            minWidth: 190,
                        },
                    },
                }}
            >
                <PanelMenuItem
                    icon={<ContentCopy fontSize="small" />}
                    label="Copy link"
                    onClick={copyLink}
                />
                <PanelMenuItem
                    icon={<ImageOutlined fontSize="small" />}
                    label="Save as image"
                    onClick={saveImage}
                />
                {exportData && exportData.length > 0 && (
                    <PanelMenuItem
                        icon={<DownloadOutlined fontSize="small" />}
                        label="Download CSV"
                        onClick={downloadCsv}
                    />
                )}
                <PanelMenuItem
                    icon={<PrintOutlined fontSize="small" />}
                    label="Print"
                    onClick={print}
                />
            </Menu>
        </>
    );
}

function PanelMenuItem({
    icon,
    label,
    onClick,
}: { icon: React.ReactNode; label: string; onClick: () => void }) {
    return (
        <MenuItem
            onClick={onClick}
            sx={{
                py: 0.85,
                color: C.textDim,
                fontSize: "0.82rem",
                "&:hover": { bgcolor: C.panelHover, color: C.text },
            }}
        >
            <ListItemIcon sx={{ color: "inherit", minWidth: 32 }}>
                {icon}
            </ListItemIcon>
            {label}
        </MenuItem>
    );
}

/* ------------------------------------------------------------------- sparkline */

export function Sparkline({
    values,
    color = C.accent,
    height = 34,
}: { values: number[]; color?: string; height?: number }) {
    if (!values.length) return <Box sx={{ height }} />;
    const W = 120;
    const H = height;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const step = values.length > 1 ? W / (values.length - 1) : W;
    const pts = values.map(
        (v, i) =>
            `${(i * step).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`,
    );
    const line = `M${pts.join(" L")}`;
    const area = `${line} L${W},${H} L0,${H} Z`;
    const id = `sl-${color.replace(/[^a-z0-9]/gi, "")}`;
    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            preserveAspectRatio="none"
            aria-hidden
        >
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#${id})`} />
            <path d={line} fill="none" stroke={color} strokeWidth="1.6" />
        </svg>
    );
}

/* --------------------------------------------------------------------- KPI tile */

export function KpiTile({
    label,
    value,
    delta,
    spark,
    color = C.accent,
    href,
    sub,
}: {
    label: string;
    value: string | number;
    delta?: number | null;
    spark?: number[];
    color?: string;
    href?: string;
    sub?: string;
}) {
    const up = (delta ?? 0) >= 0;
    const tile = (
        <Card
            sx={{
                ...glass,
                p: { xs: 1.5, md: 1.75 },
                height: "100%",
                boxShadow: "none",
                transition: "border-color 0.15s",
                "&:hover": { borderColor: href ? C.ink : C.border },
            }}
        >
            <Typography
                sx={{
                    ...eyebrow,
                    color: C.textMuted,
                    fontSize: "0.62rem",
                }}
            >
                {label}
            </Typography>
            <Box
                sx={{
                    display: "flex",
                    alignItems: "baseline",
                    flexWrap: "wrap",
                    columnGap: 1,
                    mt: 0.75,
                }}
            >
                <Typography
                    sx={{
                        fontWeight: 650,
                        color: C.text,
                        fontSize: { xs: "1.85rem", md: "2.2rem" },
                        lineHeight: 1,
                        letterSpacing: "-0.055em",
                        fontVariantNumeric: "tabular-nums",
                        overflowWrap: "anywhere",
                        minWidth: 0,
                    }}
                >
                    {value}
                </Typography>
                {delta != null && Number.isFinite(delta) && (
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            color: up ? C.success : C.error,
                            fontSize: "0.74rem",
                            fontWeight: 700,
                            fontFamily: C.mono,
                        }}
                    >
                        {up ? (
                            <ArrowUpward sx={{ fontSize: "0.85rem" }} />
                        ) : (
                            <ArrowDownward sx={{ fontSize: "0.85rem" }} />
                        )}
                        {Math.abs(delta).toFixed(1)}%
                    </Box>
                )}
            </Box>
            {sub && (
                <Typography
                    sx={{ color: C.textMuted, fontSize: "0.7rem", mt: 0.25 }}
                >
                    {sub}
                </Typography>
            )}
            {spark && spark.length > 0 && (
                <Box sx={{ mt: 1 }}>
                    <Sparkline values={spark} color={color} />
                </Box>
            )}
        </Card>
    );
    return href ? (
        <Link
            href={href}
            style={{ textDecoration: "none", display: "block", height: "100%" }}
        >
            {tile}
        </Link>
    ) : (
        tile
    );
}

/* ----------------------------------------------------------------- top-N table */

export function TopList({
    items,
    color = C.accent,
    valueFmt = (n: number) => n.toLocaleString(),
    controls = true,
}: {
    items: {
        label: string;
        value: number;
        href?: string;
        chip?: React.ReactNode;
    }[];
    color?: string;
    valueFmt?: (n: number) => string;
    controls?: boolean;
}) {
    const [filter, setFilter] = useState("");
    const [desc, setDesc] = useState(true);

    const shown = useMemo(() => {
        let r = items;
        if (filter.trim()) {
            const q = filter.toLowerCase();
            r = r.filter((i) => i.label.toLowerCase().includes(q));
        }
        return [...r].sort((a, b) =>
            desc ? b.value - a.value : a.value - b.value,
        );
    }, [items, filter, desc]);

    if (!items.length) return <Empty message="No data." />;
    const max = Math.max(...shown.map((i) => i.value), 1);
    return (
        <Box>
            {controls && (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        px: 1,
                        py: 0.75,
                        borderBottom: `1px solid ${C.border}`,
                    }}
                >
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            flex: 1,
                            bgcolor: C.paperDeep,
                            borderRadius: "999px",
                            px: 1.25,
                        }}
                    >
                        <SearchIcon
                            sx={{ fontSize: "0.95rem", color: C.textMuted }}
                        />
                        <InputBase
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder="Filter…"
                            sx={{
                                flex: 1,
                                fontSize: "0.78rem",
                                color: C.text,
                                "& input::placeholder": {
                                    color: C.textMuted,
                                    opacity: 1,
                                },
                            }}
                        />
                    </Box>
                    <IconButton
                        size="small"
                        onClick={() => setDesc((d) => !d)}
                        title={desc ? "Sort ascending" : "Sort descending"}
                        sx={{
                            color: C.textMuted,
                            "&:hover": { color: C.text },
                        }}
                    >
                        <SwapVert sx={{ fontSize: "1rem" }} />
                    </IconButton>
                </Box>
            )}
            {shown.map((it) => {
                const row = (
                    <Box
                        key={it.label}
                        sx={{
                            position: "relative",
                            py: 0.8,
                            px: 1,
                            borderBottom: `1px solid ${C.line}`,
                            "&:hover": it.href
                                ? { bgcolor: C.panelHover }
                                : undefined,
                        }}
                    >
                        <Box
                            sx={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: `${(it.value / max) * 100}%`,
                                bgcolor: color,
                                opacity: 0.1,
                                borderRight: `2px solid ${color}`,
                            }}
                        />
                        <Box
                            sx={{
                                position: "relative",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 1,
                            }}
                        >
                            <Typography
                                sx={{
                                    color: C.text,
                                    fontSize: "0.82rem",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    maxWidth: "68%",
                                }}
                            >
                                {it.label}
                            </Typography>
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                }}
                            >
                                {it.chip}
                                <Typography
                                    sx={{
                                        color: C.textDim,
                                        fontSize: "0.78rem",
                                        fontFamily: C.mono,
                                        fontVariantNumeric: "tabular-nums",
                                    }}
                                >
                                    {valueFmt(it.value)}
                                </Typography>
                            </Box>
                        </Box>
                    </Box>
                );
                return it.href ? (
                    <Link
                        key={it.label}
                        href={it.href}
                        style={{ textDecoration: "none" }}
                    >
                        {row}
                    </Link>
                ) : (
                    <Box key={it.label}>{row}</Box>
                );
            })}
        </Box>
    );
}

/* -------------------------------------------------------------------- donut */

export function Donut({
    data,
    size = 150,
}: { data: { label: string; value: number }[]; size?: number }) {
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const r = size / 2 - 10;
    const cx = size / 2;
    const cy = size / 2;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                flexWrap: "wrap",
            }}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={C.line}
                    strokeWidth="14"
                />
                {data.map((d, i) => {
                    const frac = d.value / total;
                    const dash = frac * circ;
                    const seg = (
                        <circle
                            key={d.label}
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill="none"
                            stroke={CHART[i % CHART.length]}
                            strokeWidth="14"
                            strokeDasharray={`${dash} ${circ - dash}`}
                            strokeDashoffset={-offset}
                            transform={`rotate(-90 ${cx} ${cy})`}
                        />
                    );
                    offset += dash;
                    return seg;
                })}
                <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={C.text}
                    fontSize="1.15rem"
                    fontWeight="650"
                    letterSpacing="-0.04em"
                >
                    {total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total}
                </text>
            </svg>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                {data.map((d, i) => (
                    <Box
                        key={d.label}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                        }}
                    >
                        <Box
                            sx={{
                                width: 9,
                                height: 9,
                                borderRadius: "2px",
                                bgcolor: CHART[i % CHART.length],
                            }}
                        />
                        <Typography
                            sx={{ fontSize: "0.76rem", color: C.textDim }}
                        >
                            {d.label}{" "}
                            <Box
                                component="span"
                                sx={{ color: C.text, fontWeight: 600 }}
                            >
                                {((d.value / total) * 100).toFixed(0)}%
                            </Box>
                        </Typography>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

/* ---------------------------------------------------------- status code bar */

const STATUS_CLASSES = [
    {
        key: "2xx",
        color: STATUS_COLORS["2xx"],
        test: (n: number) => n >= 200 && n < 300,
    },
    {
        key: "3xx",
        color: STATUS_COLORS["3xx"],
        test: (n: number) => n >= 300 && n < 400,
    },
    {
        key: "4xx",
        color: STATUS_COLORS["4xx"],
        test: (n: number) => n >= 400 && n < 500,
    },
    { key: "5xx", color: STATUS_COLORS["5xx"], test: (n: number) => n >= 500 },
];

export function StatusBar({
    status,
}: { status: { label: string; count: number }[] }) {
    const groups = STATUS_CLASSES.map((c) => ({
        ...c,
        count: status
            .filter((s) => c.test(Number(s.label)))
            .reduce((a, s) => a + s.count, 0),
    }));
    const total = groups.reduce((a, g) => a + g.count, 0) || 1;
    return (
        <Box>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 1.25 }}>
                {groups.map((g) => (
                    <Box
                        key={g.key}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                        }}
                    >
                        <Box
                            sx={{
                                width: 9,
                                height: 9,
                                borderRadius: "50%",
                                bgcolor: g.color,
                            }}
                        />
                        <Typography
                            sx={{ fontSize: "0.78rem", color: C.textDim }}
                        >
                            {g.key}{" "}
                            <Box
                                component="span"
                                sx={{ color: C.text, fontWeight: 600 }}
                            >
                                {g.count >= 1000
                                    ? `${(g.count / 1000).toFixed(2)}k`
                                    : g.count}
                            </Box>
                        </Typography>
                    </Box>
                ))}
            </Box>
            <Box
                sx={{
                    display: "flex",
                    height: 26,
                    borderRadius: "999px",
                    overflow: "hidden",
                    bgcolor: C.paperDeep,
                    gap: "2px",
                }}
            >
                {groups
                    .filter((g) => g.count > 0)
                    .map((g) => (
                        <Box
                            key={g.key}
                            title={`${g.key}: ${g.count.toLocaleString()}`}
                            sx={{
                                width: `${(g.count / total) * 100}%`,
                                bgcolor: g.color,
                                transition: "width 0.3s",
                            }}
                        />
                    ))}
            </Box>
        </Box>
    );
}

/* ------------------------------------------------------------- misc primitives */

const STATUS: Record<string, { color: string; bg: string }> = {
    success: { color: C.success, bg: C.successBg },
    warning: { color: C.warn, bg: C.warnBg },
    error: { color: C.error, bg: C.errorBg },
    info: { color: C.accentLight, bg: C.accentDim },
    neutral: { color: C.textDim, bg: C.paperDeep },
};

export function StatusChip({
    label,
    tone = "neutral",
}: { label: string; tone?: keyof typeof STATUS }) {
    const s = STATUS[tone];
    return (
        <Chip
            label={label}
            size="small"
            sx={{
                height: 20,
                fontSize: "0.68rem",
                fontWeight: 600,
                color: s.color,
                bgcolor: s.bg,
                border: `1px solid ${s.color}33`,
                borderRadius: "999px",
                "& .MuiChip-label": { px: 0.9 },
            }}
        />
    );
}

export function SectionError({ message }: { message: string }) {
    return (
        <Box
            sx={{
                p: 1.5,
                borderRadius: "12px",
                bgcolor: C.warnBg,
                border: `1px solid ${C.warn}33`,
                color: C.warn,
                fontSize: "0.78rem",
            }}
        >
            {message}
        </Box>
    );
}

export function Empty({ message }: { message: string }) {
    return (
        <Typography
            sx={{
                color: C.textMuted,
                fontSize: "0.82rem",
                py: 2,
                textAlign: "center",
            }}
        >
            {message}
        </Typography>
    );
}
