"use client";

import {
    CodeBadge,
    DataTable,
    FilterPill,
    Pill,
    ShareBar,
    pct,
} from "@/components/service/kit";
import type { Health } from "@/components/service/types";
import {
    C,
    Empty,
    PageHeader,
    STATUS_COLORS,
    SectionError,
    eyebrow,
    fmt,
    glass,
} from "@/components/ui";
import type { Service } from "@/lib/services";
import {
    GridViewOutlined,
    Search,
    ViewListOutlined,
} from "@mui/icons-material";
import { Box, InputBase, Typography } from "@mui/material";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export interface ServiceRow {
    service: Service;
    total: number;
    byClass: Record<string, number>;
    topNon2xx: { code: number; count: number } | null;
    health: Health;
}

const HEALTH: Record<Health, { label: string; color: string; hint: string }> = {
    healthy: {
        label: "Healthy",
        color: STATUS_COLORS["2xx"],
        hint: "5xx ≤ 1% and 4xx ≤ 20% of visitor requests",
    },
    degraded: {
        label: "Degraded",
        color: C.orange,
        hint: "5xx > 1% or 4xx > 20% of visitor requests",
    },
    idle: {
        label: "No traffic",
        color: C.borderLight,
        hint: "No requests in this window",
    },
};

const BACKENDS = [
    { key: "all", label: "All backends" },
    { key: "pages", label: "Pages" },
    { key: "worker", label: "Worker" },
    { key: "route", label: "Worker route" },
    { key: "dns", label: "DNS only" },
];

const CLASS_ORDER = ["2xx", "3xx", "4xx", "5xx", "1xx"];

function hrefFor(host: string, range: string | null) {
    const base = `/dashboard/services/${encodeURIComponent(host)}`;
    return range && range !== "24h" ? `${base}?range=${range}` : base;
}

function HealthDot({ h }: { h: Health }) {
    return (
        <Box
            title={`${HEALTH[h].label} — ${HEALTH[h].hint}`}
            sx={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                flexShrink: 0,
                bgcolor: HEALTH[h].color,
                boxShadow: h === "degraded" ? `0 0 0 3px ${C.errorBg}` : "none",
            }}
        />
    );
}

function backendSummary(s: Service): string {
    if (s.pagesProject) return `Pages · ${s.pagesProject}`;
    if (s.workerScript) return `Worker · ${s.workerScript}`;
    if (s.dnsTarget) return `${s.dnsType} → ${s.dnsTarget}`;
    return "—";
}

const selectSx = {
    appearance: "none",
    border: `1px solid ${C.line}`,
    bgcolor: C.panel,
    color: C.text,
    borderRadius: "999px",
    px: 1.5,
    py: 0.7,
    fontSize: "0.8rem",
    fontFamily: "inherit",
    cursor: "pointer",
    "&:focus": { outline: `2px solid ${C.blueWash}` },
} as const;

export default function ServicesView({
    rows,
    rangeLabel,
    error,
}: {
    rows: ServiceRow[];
    rangeLabel: string;
    error?: string;
}) {
    const params = useSearchParams();
    const range = params.get("range");
    const [q, setQ] = useState("");
    const [backend, setBackend] = useState("all");
    const [health, setHealth] = useState<"all" | Health>("all");
    const [view, setView] = useState<"grid" | "list">("grid");
    const [sort, setSort] = useState<"name" | "traffic" | "errors">("name");

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        const out = rows.filter((r) => {
            const s = r.service;
            if (needle) {
                const hay = [
                    s.host,
                    s.pagesProject,
                    s.workerScript,
                    s.dnsTarget,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                if (!hay.includes(needle)) return false;
            }
            if (backend === "dns") {
                if (s.backends.some((b) => b !== "dns")) return false;
            } else if (
                backend !== "all" &&
                !s.backends.includes(backend as Service["backends"][number])
            )
                return false;
            if (health !== "all" && r.health !== health) return false;
            return true;
        });
        if (sort === "traffic") out.sort((a, b) => b.total - a.total);
        if (sort === "errors")
            out.sort(
                (a, b) =>
                    (b.byClass["5xx"] + b.byClass["4xx"]) / (b.total || 1) -
                    (a.byClass["5xx"] + a.byClass["4xx"]) / (a.total || 1),
            );
        return out;
    }, [rows, q, backend, health, sort]);

    const zones = useMemo(() => {
        const m = new Map<string, ServiceRow[]>();
        for (const r of filtered)
            m.set(r.service.zoneName, [
                ...(m.get(r.service.zoneName) || []),
                r,
            ]);
        return Array.from(m);
    }, [filtered]);

    const counts = useMemo(() => {
        const c: Record<Health, number> = { healthy: 0, degraded: 0, idle: 0 };
        for (const r of rows) c[r.health]++;
        return c;
    }, [rows]);

    return (
        <Box>
            <PageHeader
                title="Services"
                subtitle={`${rows.length} hostnames across ${new Set(rows.map((r) => r.service.zoneName)).size} zones · health from visitor traffic in the last ${rangeLabel}`}
                timeRange
            />

            {error && (
                <Box sx={{ mb: 1.5 }}>
                    <SectionError
                        message={`Traffic data unavailable: ${error}`}
                    />
                </Box>
            )}

            {/* summary strip */}
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
                {(Object.keys(HEALTH) as Health[]).map((h) => (
                    <Box
                        key={h}
                        component="button"
                        onClick={() => setHealth(health === h ? "all" : h)}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                            px: 1.4,
                            py: 0.6,
                            borderRadius: "999px",
                            border: `1px solid ${health === h ? C.ink : C.line}`,
                            bgcolor: health === h ? C.paperDeep : C.panel,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontSize: "0.8rem",
                            color: C.text,
                        }}
                    >
                        <HealthDot h={h} />
                        {HEALTH[h].label}
                        <Box component="span" sx={{ fontWeight: 700 }}>
                            {counts[h]}
                        </Box>
                    </Box>
                ))}
            </Box>

            {/* toolbar */}
            <Box
                sx={{
                    display: "flex",
                    gap: 1,
                    flexWrap: "wrap",
                    alignItems: "center",
                    mb: 2.5,
                }}
            >
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.75,
                        flex: "1 1 240px",
                        bgcolor: C.panel,
                        border: `1px solid ${C.line}`,
                        borderRadius: "999px",
                        px: 1.5,
                        py: 0.4,
                    }}
                >
                    <Search sx={{ fontSize: "1.05rem", color: C.textMuted }} />
                    <InputBase
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search host, project, worker, target…"
                        sx={{ flex: 1, fontSize: "0.85rem" }}
                    />
                </Box>
                <Box
                    component="select"
                    value={backend}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setBackend(e.target.value)
                    }
                    sx={selectSx}
                    aria-label="Backend type"
                >
                    {BACKENDS.map((b) => (
                        <option key={b.key} value={b.key}>
                            {b.label}
                        </option>
                    ))}
                </Box>
                <Box
                    component="select"
                    value={health}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setHealth(e.target.value as "all" | Health)
                    }
                    sx={selectSx}
                    aria-label="Health"
                >
                    <option value="all">Any health</option>
                    <option value="healthy">Healthy</option>
                    <option value="degraded">Degraded</option>
                    <option value="idle">No traffic</option>
                </Box>
                <Box
                    component="select"
                    value={sort}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setSort(e.target.value as typeof sort)
                    }
                    sx={selectSx}
                    aria-label="Sort"
                >
                    <option value="name">Sort: name</option>
                    <option value="traffic">Sort: traffic</option>
                    <option value="errors">Sort: error rate</option>
                </Box>
                <Box sx={{ display: "flex", gap: 0.5 }}>
                    <FilterPill
                        active={view === "grid"}
                        onClick={() => setView("grid")}
                    >
                        <GridViewOutlined
                            sx={{ fontSize: "0.9rem", verticalAlign: "middle" }}
                        />
                    </FilterPill>
                    <FilterPill
                        active={view === "list"}
                        onClick={() => setView("list")}
                    >
                        <ViewListOutlined
                            sx={{ fontSize: "0.9rem", verticalAlign: "middle" }}
                        />
                    </FilterPill>
                </Box>
            </Box>

            {!filtered.length && (
                <Box sx={{ ...glass, p: 2 }}>
                    <Empty message="No services match these filters." />
                </Box>
            )}

            {zones.map(([zone, list]) => (
                <Box key={zone} sx={{ mb: 3 }}>
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: 1,
                            mb: 1.25,
                        }}
                    >
                        <Typography sx={{ ...eyebrow }}>Zone</Typography>
                        <Typography
                            sx={{
                                fontWeight: 650,
                                fontSize: "1.15rem",
                                letterSpacing: "-0.03em",
                                color: C.ink,
                            }}
                        >
                            {zone}
                        </Typography>
                        <Typography
                            sx={{ fontSize: "0.78rem", color: C.textMuted }}
                        >
                            {list.length} service{list.length === 1 ? "" : "s"}
                        </Typography>
                    </Box>
                    {view === "grid" ? (
                        <Box
                            sx={{
                                display: "grid",
                                gap: 1.5,
                                gridTemplateColumns:
                                    "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
                            }}
                        >
                            {list.map((r) => (
                                <ServiceCard
                                    key={r.service.host}
                                    r={r}
                                    href={hrefFor(r.service.host, range)}
                                />
                            ))}
                        </Box>
                    ) : (
                        <Box sx={{ ...glass, overflow: "hidden" }}>
                            <DataTable<ServiceRow>
                                rows={list}
                                limit={200}
                                cols={[
                                    {
                                        key: "host",
                                        label: "Host",
                                        render: (r) => (
                                            <Box
                                                component={Link}
                                                href={hrefFor(
                                                    r.service.host,
                                                    range,
                                                )}
                                                sx={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 1,
                                                    color: C.ink,
                                                    fontWeight: 650,
                                                    textDecoration: "none",
                                                    "&:hover": {
                                                        color: C.green,
                                                    },
                                                }}
                                            >
                                                <HealthDot h={r.health} />
                                                {r.service.host}
                                            </Box>
                                        ),
                                    },
                                    {
                                        key: "backend",
                                        label: "Backend",
                                        render: (r) => (
                                            <Box
                                                sx={{
                                                    fontSize: "0.74rem",
                                                    color: C.textDim,
                                                    fontFamily: C.mono,
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {backendSummary(r.service)}
                                            </Box>
                                        ),
                                    },
                                    {
                                        key: "total",
                                        label: "Requests",
                                        align: "right",
                                        mono: true,
                                        render: (r) => fmt(r.total),
                                    },
                                    {
                                        key: "mix",
                                        label: "Status mix",
                                        render: (r) => (
                                            <Box sx={{ minWidth: 120 }}>
                                                <ShareBar
                                                    parts={CLASS_ORDER.map(
                                                        (k) => ({
                                                            label: k,
                                                            value:
                                                                r.byClass[k] ||
                                                                0,
                                                            color: STATUS_COLORS[
                                                                k
                                                            ],
                                                        }),
                                                    )}
                                                />
                                            </Box>
                                        ),
                                    },
                                    {
                                        key: "2xx",
                                        label: "2xx",
                                        align: "right",
                                        mono: true,
                                        render: (r) =>
                                            r.total
                                                ? pct(
                                                      r.byClass["2xx"] /
                                                          r.total,
                                                      0,
                                                  )
                                                : "—",
                                    },
                                    {
                                        key: "top",
                                        label: "Top non-2xx",
                                        render: (r) =>
                                            r.topNon2xx ? (
                                                <CodeBadge
                                                    code={r.topNon2xx.code}
                                                />
                                            ) : (
                                                "—"
                                            ),
                                    },
                                ]}
                            />
                        </Box>
                    )}
                </Box>
            ))}
        </Box>
    );
}

function ServiceCard({ r, href }: { r: ServiceRow; href: string }) {
    const s = r.service;
    return (
        <Box
            component={Link}
            href={href}
            sx={{
                ...glass,
                display: "flex",
                flexDirection: "column",
                gap: 1.1,
                p: 1.75,
                textDecoration: "none",
                color: C.text,
                transition: "border-color .15s, transform .15s",
                "&:hover": {
                    borderColor: C.ink,
                    transform: "translateY(-1px)",
                },
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
                <HealthDot h={r.health} />
                <Typography
                    sx={{
                        fontWeight: 650,
                        fontSize: "1.02rem",
                        letterSpacing: "-0.03em",
                        color: C.ink,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                    }}
                    title={s.host}
                >
                    {s.host}
                </Typography>
                <Typography
                    sx={{
                        fontSize: "0.7rem",
                        color: HEALTH[r.health].color,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                    }}
                >
                    {HEALTH[r.health].label}
                </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {s.backends.map((b) => (
                    <Pill
                        key={b}
                        tone={
                            b === "pages" || b === "worker" ? "blue" : "neutral"
                        }
                    >
                        {b}
                    </Pill>
                ))}
                {s.proxied === false && s.backends.includes("dns") && (
                    <Pill tone="warn">DNS only</Pill>
                )}
            </Box>
            <Typography
                sx={{
                    fontSize: "0.72rem",
                    color: C.textMuted,
                    fontFamily: C.mono,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
                title={backendSummary(s)}
            >
                {backendSummary(s)}
            </Typography>
            <Box
                sx={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 1,
                    mt: 0.25,
                }}
            >
                <Box>
                    <Typography
                        sx={{
                            fontWeight: 750,
                            fontSize: "1.45rem",
                            letterSpacing: "-0.04em",
                            lineHeight: 1,
                        }}
                    >
                        {fmt(r.total)}
                    </Typography>
                    <Typography
                        sx={{ fontSize: "0.68rem", color: C.textMuted }}
                    >
                        visitor requests
                    </Typography>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                    <Typography
                        sx={{
                            fontWeight: 700,
                            fontSize: "0.95rem",
                            color: C.text,
                        }}
                    >
                        {r.total ? pct(r.byClass["2xx"] / r.total, 0) : "—"}
                    </Typography>
                    <Typography
                        sx={{ fontSize: "0.68rem", color: C.textMuted }}
                    >
                        2xx
                    </Typography>
                </Box>
            </Box>
            <ShareBar
                parts={CLASS_ORDER.map((k) => ({
                    label: k,
                    value: r.byClass[k] || 0,
                    color: STATUS_COLORS[k],
                }))}
            />
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    minHeight: 22,
                }}
            >
                {r.topNon2xx ? (
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                            fontSize: "0.72rem",
                            color: C.textMuted,
                        }}
                    >
                        <CodeBadge code={r.topNon2xx.code} />
                        {fmt(r.topNon2xx.count)} ·{" "}
                        {pct(r.topNon2xx.count / (r.total || 1), 1)}
                    </Box>
                ) : (
                    <Box sx={{ fontSize: "0.72rem", color: C.textMuted }}>
                        {r.total ? "Only 2xx" : "—"}
                    </Box>
                )}
                <Box
                    component="span"
                    sx={{
                        fontSize: "0.75rem",
                        color: C.green,
                        fontWeight: 650,
                    }}
                >
                    Open →
                </Box>
            </Box>
        </Box>
    );
}
