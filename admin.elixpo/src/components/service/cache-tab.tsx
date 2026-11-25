"use client";

import {
    DataTable,
    Grid,
    KV,
    Note,
    PathCell,
    Pill,
    ShareBar,
    StackedBars,
    fmtMs,
    pct,
} from "@/components/service/kit";
import { settingValue } from "@/components/service/settings";
import {
    CACHE_SERVED,
    type CacheTabData,
    type ServiceCtx,
} from "@/components/service/types";
import {
    C,
    Donut,
    KpiTile,
    Panel,
    SectionError,
    fmt,
    fmtBytes,
} from "@/components/ui";
import { Box } from "@mui/material";
import { useMemo } from "react";

export const CACHE_COLORS: Record<string, string> = {
    hit: "#0b623c",
    stale: "#5f9e7a",
    updating: "#8cbf9f",
    revalidated: "#2f9e63",
    miss: "#f0ad16",
    expired: "#d68a00",
    dynamic: "#3a65c7",
    bypass: "#7c5cc4",
    none: "#9aa39d",
    unknown: "#c3c8c2",
};

const CACHE_MEANING: Record<string, string> = {
    hit: "Served from Cloudflare's edge cache.",
    miss: "Cacheable, but not in cache yet — fetched from origin.",
    expired: "Was cached but its TTL ran out — refetched from origin.",
    stale: "Served stale from cache while the origin was unreachable/updating.",
    updating: "Served stale while a background refresh ran.",
    revalidated: "Cache entry revalidated with the origin (304) and served.",
    dynamic:
        "Not eligible for caching (HTML / API by default) — always goes to origin.",
    bypass: "Cache explicitly bypassed (Cache-Control: no-cache/private, cookies, rule).",
    none: "No cache lookup was made (e.g. Worker-generated or redirected at the edge).",
};

export default function CacheTab({
    ctx,
    data,
}: { ctx: ServiceCtx; data: CacheTabData }) {
    const c = data.cache.data;
    const totalReq = c.byStatus.reduce((a, r) => a + r.count, 0);
    const served = c.byStatus.filter((r) => CACHE_SERVED.has(r.label));
    const servedReq = served.reduce((a, r) => a + r.count, 0);
    const servedBytes = served.reduce((a, r) => a + (r.bytes || 0), 0);
    const totalBytes = c.byStatus.reduce((a, r) => a + (r.bytes || 0), 0);
    const keys = c.statuses
        .slice()
        .sort(
            (a, b) =>
                Number(CACHE_SERVED.has(b)) - Number(CACHE_SERVED.has(a)) ||
                a.localeCompare(b),
        )
        .map((k) => ({ key: k, color: CACHE_COLORS[k] || C.borderLight }));

    const byType = useMemo(() => {
        const m = new Map<
            string,
            {
                label: string;
                total: number;
                cached: number;
                bytes: number;
                parts: Record<string, number>;
            }
        >();
        for (const r of c.contentTypes) {
            const e = m.get(r.contentType) || {
                label: r.contentType,
                total: 0,
                cached: 0,
                bytes: 0,
                parts: {},
            };
            e.total += r.count;
            e.bytes += r.bytes;
            if (CACHE_SERVED.has(r.cacheStatus)) e.cached += r.count;
            e.parts[r.cacheStatus] = (e.parts[r.cacheStatus] || 0) + r.count;
            m.set(r.contentType, e);
        }
        return Array.from(m.values()).sort((a, b) => b.total - a.total);
    }, [c.contentTypes]);

    const s = data.settings;

    return (
        <Box>
            {!data.cache.available && (
                <Box sx={{ mb: 1.5 }}>
                    <SectionError
                        message={`Cache analytics unavailable: ${data.cache.error}`}
                    />
                </Box>
            )}
            <Grid min={180}>
                <KpiTile
                    label="Cache hit ratio"
                    value={totalReq ? pct(servedReq / totalReq) : "—"}
                    sub={`${fmt(servedReq)} of ${fmt(totalReq)} requests`}
                    color={C.green}
                />
                <KpiTile
                    label="Bandwidth saved"
                    value={fmtBytes(servedBytes)}
                    sub={
                        totalBytes
                            ? `${pct(servedBytes / totalBytes)} of ${fmtBytes(totalBytes)}`
                            : undefined
                    }
                    color={C.green}
                />
                <KpiTile
                    label="Uncached requests"
                    value={fmt(totalReq - servedReq)}
                    sub="miss + dynamic + expired + bypass"
                    color={C.yellow}
                />
                <KpiTile
                    label="Dynamic share"
                    value={
                        totalReq
                            ? pct(
                                  (c.byStatus.find((r) => r.label === "dynamic")
                                      ?.count || 0) / totalReq,
                              )
                            : "—"
                    }
                    sub="never eligible for cache"
                />
            </Grid>

            <Grid cols={3}>
                <Box
                    sx={{
                        gridColumn: { xs: "auto", lg: "span 2" },
                        minWidth: 0,
                    }}
                >
                    <Panel title={`Cache status over time · ${ctx.rangeLabel}`}>
                        <StackedBars points={c.timeline} keys={keys} />
                    </Panel>
                </Box>
                <Panel title="Cache status">
                    <Donut
                        data={c.byStatus
                            .slice(0, 6)
                            .map((r) => ({ label: r.label, value: r.count }))}
                        size={130}
                    />
                </Panel>
            </Grid>

            <Grid cols={2}>
                <Panel title="Cache statuses explained" dense>
                    <DataTable
                        rows={c.byStatus}
                        cols={[
                            {
                                key: "label",
                                label: "Status",
                                render: (r) => (
                                    <Box
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
                                                bgcolor:
                                                    CACHE_COLORS[r.label] ||
                                                    C.borderLight,
                                            }}
                                        />
                                        <Box
                                            component="span"
                                            sx={{ fontFamily: C.mono }}
                                        >
                                            {r.label}
                                        </Box>
                                    </Box>
                                ),
                            },
                            {
                                key: "m",
                                label: "Meaning",
                                render: (r) => (
                                    <Box
                                        sx={{
                                            fontSize: "0.74rem",
                                            color: C.textMuted,
                                            minWidth: 180,
                                        }}
                                    >
                                        {CACHE_MEANING[r.label] || "—"}
                                    </Box>
                                ),
                            },
                            {
                                key: "count",
                                label: "Requests",
                                align: "right",
                                mono: true,
                                render: (r) => fmt(r.count),
                            },
                            {
                                key: "bytes",
                                label: "Bytes",
                                align: "right",
                                mono: true,
                                render: (r) => fmtBytes(r.bytes || 0),
                            },
                        ]}
                    />
                </Panel>
                <Panel title="Zone cache settings (read-only)">
                    {s.available ? (
                        <KV
                            rows={[
                                {
                                    k: "Caching level",
                                    v: settingValue(s.data.cache_level),
                                    hint: "aggressive = cache static files incl. query-string variants",
                                },
                                {
                                    k: "Browser cache TTL",
                                    v: settingValue(
                                        s.data.browser_cache_ttl,
                                        "ttl",
                                    ),
                                    hint: "0 = respect origin headers",
                                },
                                {
                                    k: "Always Online",
                                    v: settingValue(s.data.always_online),
                                },
                                {
                                    k: "Development mode",
                                    v: settingValue(s.data.development_mode),
                                    hint: "on = cache bypassed for 3 hours",
                                },
                                {
                                    k: "Edge cache TTL",
                                    v: settingValue(
                                        s.data.edge_cache_ttl,
                                        "ttl",
                                    ),
                                },
                                { k: "Brotli", v: settingValue(s.data.brotli) },
                                {
                                    k: "Early Hints",
                                    v: settingValue(s.data.early_hints),
                                },
                            ]}
                        />
                    ) : (
                        <SectionError
                            message={`Zone settings unavailable: ${s.error}`}
                        />
                    )}
                    <Note>
                        Settings apply to the whole zone ({ctx.service.zoneName}
                        ), not only this host.
                    </Note>
                </Panel>

                <Panel title="Top uncached paths" dense>
                    <DataTable
                        rows={c.uncachedPaths}
                        cols={[
                            {
                                key: "label",
                                label: "Path",
                                render: (r) => (
                                    <PathCell path={r.label} max={300} />
                                ),
                            },
                            {
                                key: "cacheStatus",
                                label: "Status",
                                render: (r) => (
                                    <Pill
                                        tone={
                                            r.cacheStatus === "dynamic"
                                                ? "blue"
                                                : "warn"
                                        }
                                        mono
                                    >
                                        {r.cacheStatus}
                                    </Pill>
                                ),
                            },
                            {
                                key: "count",
                                label: "Requests",
                                align: "right",
                                mono: true,
                                render: (r) => fmt(r.count),
                            },
                            {
                                key: "originMs",
                                label: "Avg origin",
                                align: "right",
                                mono: true,
                                render: (r) => fmtMs(r.originMs || 0),
                            },
                        ]}
                    />
                    <Box sx={{ px: 1.5, pb: 1 }}>
                        <Note>
                            Static assets showing <b>miss</b> repeatedly may
                            have short TTLs; HTML/API paths are <b>dynamic</b>{" "}
                            by default — add a Cache Rule if they are safe to
                            cache.
                        </Note>
                    </Box>
                </Panel>
                <Panel title="Content types by cache status" dense>
                    <DataTable
                        rows={byType}
                        cols={[
                            { key: "label", label: "Content type", mono: true },
                            {
                                key: "bar",
                                label: "Mix",
                                render: (r) => (
                                    <Box sx={{ minWidth: 110 }}>
                                        <ShareBar
                                            parts={Object.entries(r.parts).map(
                                                ([k, v]) => ({
                                                    label: k,
                                                    value: v,
                                                    color:
                                                        CACHE_COLORS[k] ||
                                                        C.borderLight,
                                                }),
                                            )}
                                        />
                                    </Box>
                                ),
                            },
                            {
                                key: "cached",
                                label: "Hit %",
                                align: "right",
                                mono: true,
                                render: (r) =>
                                    pct(r.cached / (r.total || 1), 0),
                            },
                            {
                                key: "total",
                                label: "Requests",
                                align: "right",
                                mono: true,
                                render: (r) => fmt(r.total),
                            },
                        ]}
                    />
                </Panel>
            </Grid>
        </Box>
    );
}
