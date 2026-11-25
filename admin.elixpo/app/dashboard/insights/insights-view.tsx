"use client";

import {
    Card,
    CardTitle,
    DaysToggle,
    SectionHead,
    SourceTag,
    evenGrid,
} from "@/components/insights/parts";
import {
    C,
    KpiTile,
    SectionError,
    Sparkline,
    eyebrow,
    fmt,
} from "@/components/ui";
import {
    type InsightsOverview,
    type ProductSummary,
    countryName,
    pct,
} from "@/lib/insights-core";
import { Search } from "@mui/icons-material";
import { Box, InputBase, Typography } from "@mui/material";
import Link from "next/link";
import { useMemo, useState } from "react";

type SortKey =
    | "visits"
    | "pageViews"
    | "mau"
    | "allTimeUsers"
    | "returningShare";

const SORTS: { key: SortKey; label: string }[] = [
    { key: "visits", label: "Visits" },
    { key: "pageViews", label: "Page views" },
    { key: "mau", label: "Signed-in this month" },
    { key: "allTimeUsers", label: "All-time users" },
    { key: "returningShare", label: "Returning users" },
];

export default function InsightsOverviewView({
    data,
}: { data: InsightsOverview }) {
    const [q, setQ] = useState("");
    const [sort, setSort] = useState<SortKey>("visits");

    const rows = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return data.products
            .filter(
                (p) =>
                    !needle ||
                    p.product.host.includes(needle) ||
                    p.product.label.toLowerCase().includes(needle),
            )
            .sort((a, b) => (b[sort] as number) - (a[sort] as number));
    }, [data.products, q, sort]);

    const totals = data.products.reduce(
        (a, p) => ({
            visits: a.visits + p.visits,
            pageViews: a.pageViews + p.pageViews,
            mau: a.mau + p.mau,
        }),
        { visits: 0, pageViews: 0, mau: 0 },
    );
    const visitSpark = data.products.reduce<number[]>(
        (acc, p) => p.spark.map((v, i) => v + (acc[i] || 0)),
        [],
    );

    return (
        <Box>
            {/* hero */}
            <Box
                sx={{
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: 2,
                    flexWrap: "wrap",
                    mb: 3,
                }}
            >
                <Box sx={{ maxWidth: 760 }}>
                    <Typography sx={{ ...eyebrow, mb: 1 }}>
                        Product insights · {data.rangeLabel}
                    </Typography>
                    <Typography
                        component="h1"
                        sx={{
                            fontSize: { xs: "2.5rem", md: "3.8rem" },
                            fontWeight: 600,
                            letterSpacing: "-0.07em",
                            lineHeight: 0.92,
                        }}
                    >
                        Who uses{" "}
                        <Box
                            component="em"
                            sx={{
                                fontFamily: "Georgia, serif",
                                fontWeight: 400,
                            }}
                        >
                            what.
                        </Box>
                    </Typography>
                    <Typography
                        sx={{
                            color: C.textMuted,
                            fontSize: "0.92rem",
                            mt: 1.5,
                            lineHeight: 1.6,
                        }}
                    >
                        Audience KPIs for each of the {data.products.length}{" "}
                        deployed products — visitors and visits from Cloudflare,
                        plus real signed-in users from Elixpo Accounts. Open a
                        product for regions, locales, returning users and what
                        people use most.
                    </Typography>
                    <Box
                        sx={{
                            display: "flex",
                            gap: 0.75,
                            flexWrap: "wrap",
                            mt: 1.5,
                        }}
                    >
                        <SourceTag source="edge" />
                        <SourceTag source="rum" />
                        <SourceTag source="users" />
                    </Box>
                </Box>
                <DaysToggle days={data.days} />
            </Box>

            {data.errors.map((e) => (
                <Box key={e} sx={{ mb: 1.5 }}>
                    <SectionError message={e} />
                </Box>
            ))}

            {/* totals */}
            <Box sx={{ ...evenGrid(4), mb: 4 }}>
                <KpiTile
                    label="Visits · all products"
                    value={fmt(totals.visits)}
                    spark={visitSpark}
                    color={C.blue}
                    sub="Human visitor traffic"
                />
                <KpiTile
                    label="Page views"
                    value={fmt(totals.pageViews)}
                    color={CHART_PV}
                    sub="HTML pages served"
                />
                <KpiTile
                    label="Elixpo accounts"
                    value={data.sso ? fmt(data.sso.users) : "—"}
                    color={C.green}
                    sub={
                        data.sso
                            ? `${fmt(data.sso.verified)} verified email`
                            : "Accounts DB unavailable"
                    }
                    href="/dashboard/insights/accounts.elixpo.com"
                />
                <KpiTile
                    label="Signed in · last 30 days"
                    value={data.sso ? fmt(data.sso.active30) : "—"}
                    color={C.green}
                    sub={`${fmt(totals.mau)} product sign-ins this month`}
                />
            </Box>

            {/* product list */}
            <SectionHead
                kicker="Per product"
                title="Every deployed product"
                right={
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.75,
                                px: 1.25,
                                height: 36,
                                borderRadius: "999px",
                                border: `1px solid ${C.border}`,
                                bgcolor: C.panel,
                            }}
                        >
                            <Search
                                sx={{ fontSize: "1rem", color: C.textMuted }}
                            />
                            <InputBase
                                placeholder="Filter products"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                sx={{ fontSize: "0.8rem", width: 140 }}
                            />
                        </Box>
                        <Box
                            component="select"
                            value={sort}
                            onChange={(
                                e: React.ChangeEvent<HTMLSelectElement>,
                            ) => setSort(e.target.value as SortKey)}
                            aria-label="Sort products"
                            sx={{
                                height: 36,
                                px: 1.25,
                                borderRadius: "999px",
                                border: `1px solid ${C.border}`,
                                bgcolor: C.panel,
                                fontFamily: "inherit",
                                fontSize: "0.8rem",
                                fontWeight: 600,
                                color: C.text,
                            }}
                        >
                            {SORTS.map((s) => (
                                <option key={s.key} value={s.key}>
                                    Sort: {s.label}
                                </option>
                            ))}
                        </Box>
                    </Box>
                }
            />
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: {
                        xs: "1fr",
                        md: "repeat(2, minmax(0,1fr))",
                        xl: "repeat(3, minmax(0,1fr))",
                    },
                    gap: 1.5,
                    mb: 4,
                }}
            >
                {rows.map((p) => (
                    <ProductCard key={p.product.host} p={p} />
                ))}
            </Box>

            {data.unmappedApps.length > 0 && (
                <Card>
                    <CardTitle hint="Active OAuth apps on Elixpo Accounts that don't match a deployed product's host. Their sign-ins aren't attributed to any product above.">
                        Unlinked sign-in apps
                    </CardTitle>
                    <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                        {data.unmappedApps.map((a) => (
                            <Box
                                key={a.name}
                                component="span"
                                sx={{
                                    px: 1.1,
                                    py: 0.4,
                                    borderRadius: "999px",
                                    border: `1px solid ${C.border}`,
                                    fontSize: "0.74rem",
                                    color: C.textDim,
                                }}
                            >
                                {a.name}
                                {a.mau > 0 && ` · ${a.mau} this month`}
                            </Box>
                        ))}
                    </Box>
                </Card>
            )}
        </Box>
    );
}

const CHART_PV = "#0e8a8a";

function ProductCard({ p }: { p: ProductSummary }) {
    const linked = p.product.isSso || p.product.apps.length > 0;
    const mauDelta = p.mauPrev ? ((p.mau - p.mauPrev) / p.mauPrev) * 100 : null;
    return (
        <Box
            component={Link}
            href={`/dashboard/insights/${encodeURIComponent(p.product.host)}`}
            sx={{
                display: "block",
                textDecoration: "none",
                color: C.text,
                bgcolor: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: "20px",
                p: 2,
                transition: "border-color .15s ease, transform .15s ease",
                "&:hover": {
                    borderColor: C.ink,
                    transform: "translateY(-2px)",
                },
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 1,
                    mb: 1.5,
                }}
            >
                <Box sx={{ minWidth: 0 }}>
                    <Typography
                        sx={{
                            fontWeight: 700,
                            fontSize: "1.05rem",
                            letterSpacing: "-0.03em",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {p.product.host}
                    </Typography>
                    <Typography
                        sx={{ fontSize: "0.72rem", color: C.textMuted }}
                    >
                        {p.product.pagesProject
                            ? `Pages · ${p.product.pagesProject}`
                            : `Worker · ${p.product.workerScript}`}
                        {p.topCountry &&
                            ` · mostly ${countryName(p.topCountry)}`}
                    </Typography>
                </Box>
                <Typography
                    sx={{
                        color: C.green,
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                    }}
                >
                    Open →
                </Typography>
            </Box>
            <Box sx={{ height: 38, mb: 1.5 }}>
                <Sparkline values={p.spark} color={C.blue} height={38} />
            </Box>
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0,1fr))",
                    gap: 1,
                }}
            >
                <Stat label="Visits" value={fmt(p.visits)} />
                <Stat label="Page views" value={fmt(p.pageViews)} />
                <Stat label="Browser visits" value={fmt(p.rumVisits)} />
                <Stat
                    label="Signed in · month"
                    value={linked ? fmt(p.mau) : "—"}
                    sub={
                        linked && mauDelta != null
                            ? `${mauDelta >= 0 ? "▲" : "▼"} ${Math.abs(mauDelta).toFixed(0)}% vs last`
                            : undefined
                    }
                    tone={
                        mauDelta == null
                            ? undefined
                            : mauDelta >= 0
                              ? C.green
                              : C.orange
                    }
                />
                <Stat
                    label="All-time users"
                    value={linked ? fmt(p.allTimeUsers) : "—"}
                />
                <Stat
                    label="Returning users"
                    value={
                        linked && p.allTimeUsers
                            ? pct(
                                  p.returningShare * p.allTimeUsers,
                                  p.allTimeUsers,
                                  0,
                              )
                            : "—"
                    }
                />
            </Box>
            {!linked && (
                <Typography
                    sx={{ fontSize: "0.7rem", color: C.textMuted, mt: 1.25 }}
                >
                    No Elixpo sign-in linked — visitor metrics only.
                </Typography>
            )}
        </Box>
    );
}

function Stat({
    label,
    value,
    sub,
    tone,
}: { label: string; value: string; sub?: string; tone?: string }) {
    return (
        <Box sx={{ minWidth: 0 }}>
            <Typography
                sx={{
                    fontFamily: C.mono,
                    fontSize: "0.58rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: C.textMuted,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                }}
            >
                {label}
            </Typography>
            <Typography
                sx={{
                    fontWeight: 650,
                    fontSize: "1.15rem",
                    letterSpacing: "-0.04em",
                }}
            >
                {value}
            </Typography>
            {sub && (
                <Typography
                    sx={{
                        fontSize: "0.64rem",
                        color: tone || C.textMuted,
                        fontWeight: 700,
                    }}
                >
                    {sub}
                </Typography>
            )}
        </Box>
    );
}
