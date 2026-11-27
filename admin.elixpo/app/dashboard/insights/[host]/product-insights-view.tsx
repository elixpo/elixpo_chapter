"use client";

import {
    Bars,
    Card,
    CardTitle,
    DaysToggle,
    Legend,
    MonthBars,
    Note,
    SectionHead,
    SourceTag,
    delta,
    evenGrid,
    fmtMs,
} from "@/components/insights/parts";
import MetricChart from "@/components/metric-chart";
import { C, KpiTile, SectionError, eyebrow, fmt } from "@/components/ui";
import {
    type Dim,
    type ProductInsights,
    countryName,
    inferLanguages,
    localeName,
    pct,
} from "@/lib/insights-core";
import { Launch } from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type React from "react";

const two = {
    display: "grid",
    gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0,1fr))" },
    gap: 1.5,
} as const;
const three = {
    display: "grid",
    gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0,1fr))" },
    gap: 1.5,
} as const;

const titleCase = (d: Dim) =>
    d.label === "unknown"
        ? "Unknown"
        : d.label.charAt(0).toUpperCase() + d.label.slice(1);

export default function ProductInsightsView({
    data,
    products,
}: {
    data: ProductInsights;
    products: { host: string; label: string }[];
}) {
    const router = useRouter();
    const params = useSearchParams();
    const { product, edge, rum, users } = data;
    const linked = product.isSso || !users.unlinked;

    const sparkVisitors = edge.daily.map((d) => Number(d.visitors) || 0);
    const sparkVisits = edge.daily.map((d) => Number(d.visits) || 0);
    const sparkPv = edge.daily.map((d) => Number(d.pageViews) || 0);
    const rumPv = rum.daily.map((d) => Number(d.pageViews) || 0);
    const monthUsers = users.months.map((m) => m.users);
    const newThisMonth = users.months.at(-1)?.newUsers ?? 0;
    const thisMonthIsCurrent =
        users.months.at(-1)?.month === new Date().toISOString().slice(0, 7);

    const switchProduct = (host: string) => {
        const range = params.get("range");
        router.push(
            `/dashboard/insights/${encodeURIComponent(host)}${range ? `?range=${range}` : ""}`,
        );
    };

    return (
        <Box>
            {/* ------------------------------------------------------------ hero */}
            <Box sx={{ mb: 1.5 }}>
                <Box
                    component={Link}
                    href="/dashboard/insights"
                    sx={{
                        color: C.green,
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        textDecoration: "none",
                    }}
                >
                    ← All products
                </Box>
            </Box>
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
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ ...eyebrow, mb: 1 }}>
                        Product insights · {data.rangeLabel}
                    </Typography>
                    <Typography
                        component="h1"
                        sx={{
                            fontSize: { xs: "2.3rem", md: "3.6rem" },
                            fontWeight: 600,
                            letterSpacing: "-0.07em",
                            lineHeight: 0.95,
                            wordBreak: "break-word",
                        }}
                    >
                        {product.host}
                    </Typography>
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1.5,
                            flexWrap: "wrap",
                            mt: 1.25,
                            fontSize: "0.8rem",
                            color: C.textMuted,
                        }}
                    >
                        <span>
                            {product.pagesProject
                                ? `Pages · ${product.pagesProject}`
                                : `Worker · ${product.workerScript}`}
                        </span>
                        {product.apps.length > 0 && (
                            <span>
                                Sign-in apps:{" "}
                                {product.apps.map((a) => a.name).join(", ")}
                            </span>
                        )}
                        <Box
                            component="a"
                            href={`https://${product.host}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                                color: C.green,
                                fontWeight: 700,
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 0.4,
                            }}
                        >
                            Visit <Launch sx={{ fontSize: "0.85rem" }} />
                        </Box>
                        <Box
                            component={Link}
                            href={`/dashboard/services/${encodeURIComponent(product.host)}`}
                            sx={{
                                color: C.green,
                                fontWeight: 700,
                                textDecoration: "none",
                            }}
                        >
                            Service health →
                        </Box>
                    </Box>
                </Box>
                <Box
                    sx={{
                        display: "flex",
                        gap: 1,
                        alignItems: "center",
                        flexWrap: "wrap",
                    }}
                >
                    <Box
                        component="select"
                        value={product.host}
                        aria-label="Switch product"
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                            switchProduct(e.target.value)
                        }
                        sx={{
                            height: 38,
                            px: 1.5,
                            borderRadius: "999px",
                            border: `1px solid ${C.border}`,
                            bgcolor: C.panel,
                            fontFamily: "inherit",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            color: C.text,
                            maxWidth: 260,
                        }}
                    >
                        {products.map((p) => (
                            <option key={p.host} value={p.host}>
                                {p.host}
                            </option>
                        ))}
                    </Box>
                    <DaysToggle days={data.days} />
                </Box>
            </Box>

            {/* ------------------------------------------------- signed-in users */}
            <Box component="section" sx={{ mb: 4 }}>
                <SectionHead
                    kicker="01 · People"
                    title={
                        product.isSso ? "Elixpo accounts" : "Signed-in users"
                    }
                    source="users"
                />
                {!users.available && users.error && (
                    <SectionError
                        message={`Accounts database unavailable: ${users.error}`}
                    />
                )}
                {users.available && !linked && (
                    <Note>
                        No Elixpo Accounts sign-in app is linked to{" "}
                        {product.host}, so there are no signed-in user numbers —
                        the visitor metrics below still apply. Link one by
                        registering an OAuth app on accounts.elixpo.com with a
                        redirect URI on this host.
                    </Note>
                )}
                {users.available && linked && (
                    <>
                        <Box sx={{ ...evenGrid(4), mb: 1.5 }}>
                            {product.isSso ? (
                                <>
                                    <KpiTile
                                        label="Registered accounts"
                                        value={fmt(users.allTime)}
                                        color={C.green}
                                        sub={`${fmt(users.verified ?? 0)} verified email`}
                                        spark={users.signups?.map(
                                            (s) => s.value,
                                        )}
                                    />
                                    <KpiTile
                                        label="Active · last 30 days"
                                        value={fmt(users.active30 ?? 0)}
                                        color={C.green}
                                        sub={`${pct(users.active30 ?? 0, users.allTime)} of accounts`}
                                    />
                                    <KpiTile
                                        label="Signed into apps · month"
                                        value={fmt(users.currentMau)}
                                        delta={delta(
                                            users.currentMau,
                                            users.previousMau,
                                        )}
                                        spark={monthUsers}
                                        color={C.green}
                                        sub={`${fmt(users.previousMau)} last month`}
                                    />
                                    <KpiTile
                                        label="Sign-ups · month"
                                        value={fmt(
                                            users.signups?.at(-1)?.value ?? 0,
                                        )}
                                        color={C.green}
                                        sub="New accounts this month"
                                    />
                                </>
                            ) : (
                                <>
                                    <KpiTile
                                        label="Active users · this month"
                                        value={fmt(users.currentMau)}
                                        delta={delta(
                                            users.currentMau,
                                            users.previousMau,
                                        )}
                                        spark={monthUsers}
                                        color={C.green}
                                        sub={`${fmt(users.previousMau)} last month`}
                                    />
                                    <KpiTile
                                        label="All-time users"
                                        value={fmt(users.allTime)}
                                        color={C.green}
                                        sub="Distinct accounts ever signed in"
                                    />
                                    <KpiTile
                                        label="Returning users"
                                        value={pct(users.returningShare, 1, 0)}
                                        color={C.green}
                                        sub="Active in 2+ different months"
                                    />
                                    <KpiTile
                                        label="New this month"
                                        value={fmt(
                                            thisMonthIsCurrent
                                                ? newThisMonth
                                                : 0,
                                        )}
                                        color={C.green}
                                        sub="First sign-in ever"
                                    />
                                </>
                            )}
                        </Box>
                        <Box sx={two}>
                            <Card>
                                <CardTitle hint="Monthly active accounts, split into first-time and returning.">
                                    Users by month
                                </CardTitle>
                                <MonthBars months={users.months} />
                            </Card>
                            <Card>
                                <CardTitle hint="Taken from each user's own account — real locale, not inferred.">
                                    Locale of signed-in users
                                </CardTitle>
                                <Bars
                                    items={users.locales}
                                    color={C.green}
                                    format={(d) =>
                                        d.label === "unknown"
                                            ? "Not set"
                                            : `${localeName(d.label)} · ${d.label}`
                                    }
                                />
                            </Card>
                        </Box>
                        <Box sx={{ ...three, mt: 1.5 }}>
                            <Card>
                                <CardTitle>Country</CardTitle>
                                <Bars
                                    items={users.countries}
                                    color={C.green}
                                    limit={6}
                                    format={(d) => countryName(d.label)}
                                />
                            </Card>
                            <Card>
                                <CardTitle>Device</CardTitle>
                                <Bars
                                    items={users.devices}
                                    color={C.green}
                                    limit={6}
                                    format={titleCase}
                                />
                            </Card>
                            <Card>
                                <CardTitle>Browser</CardTitle>
                                <Bars
                                    items={users.browsers}
                                    color={C.green}
                                    limit={6}
                                    format={titleCase}
                                />
                            </Card>
                        </Box>
                    </>
                )}
            </Box>

            {/* ------------------------------------------------------- visitors */}
            <Box component="section" sx={{ mb: 4 }}>
                <SectionHead
                    kicker="02 · Visitors"
                    title="Traffic & reach"
                    source="edge"
                />
                {!edge.available && edge.error && (
                    <SectionError
                        message={`Edge analytics unavailable: ${edge.error}`}
                    />
                )}
                {edge.available && (
                    <>
                        <Box sx={{ ...evenGrid(4), mb: 1.5 }}>
                            <KpiTile
                                label="Unique visitors (est.)"
                                value={`${fmt(edge.visitors)}${edge.truncated ? "+" : ""}`}
                                spark={sparkVisitors}
                                color={C.blue}
                                sub="Distinct client IPs, humans only"
                            />
                            <KpiTile
                                label="Returning visitors"
                                value={pct(edge.returning, edge.visitors, 0)}
                                color={C.blue}
                                sub={`${fmt(edge.returning)} came back on another day`}
                            />
                            <KpiTile
                                label="Visits"
                                value={fmt(edge.visits)}
                                spark={sparkVisits}
                                color={C.blue}
                                sub={`${edge.visitors ? (edge.visits / edge.visitors).toFixed(1) : "—"} per visitor`}
                            />
                            <KpiTile
                                label="Page views"
                                value={fmt(edge.pageViews)}
                                spark={sparkPv}
                                color={C.blue}
                                sub={`${edge.visits ? (edge.pageViews / edge.visits).toFixed(1) : "—"} pages per visit`}
                            />
                        </Box>
                        <Box sx={two}>
                            <Card>
                                <CardTitle hint="Daily unique visitors, visits and page views.">
                                    Trend
                                </CardTitle>
                                <MetricChart
                                    points={edge.daily.map((d) => ({
                                        ...d,
                                        ts: `${d.date}T00:00:00Z`,
                                    }))}
                                    series={[
                                        {
                                            key: "pageViews",
                                            label: "Page views",
                                            color: "#0e8a8a",
                                        },
                                        {
                                            key: "visitors",
                                            label: "Visitors",
                                            color: C.blue,
                                        },
                                        {
                                            key: "visits",
                                            label: "Visits",
                                            color: C.ink,
                                        },
                                    ]}
                                    height={220}
                                />
                            </Card>
                            <Card>
                                <CardTitle hint="How many different days each visitor showed up in this window.">
                                    Loyalty
                                </CardTitle>
                                <Bars items={edge.loyalty} color={C.blue} />
                                <Box
                                    sx={{
                                        mt: 2,
                                        display: "flex",
                                        gap: 2,
                                        flexWrap: "wrap",
                                        fontSize: "0.74rem",
                                        color: C.textMuted,
                                    }}
                                >
                                    <span>
                                        Verified bots:{" "}
                                        {pct(edge.botShare, 1, 1)} of requests
                                        (excluded)
                                    </span>
                                    {edge.truncated && (
                                        <span>
                                            Visitor counts hit a row limit —
                                            treat as a lower bound.
                                        </span>
                                    )}
                                </Box>
                            </Card>
                        </Box>
                    </>
                )}
            </Box>

            {/* ---------------------------------------------------- most used */}
            <Box component="section" sx={{ mb: 4 }}>
                <SectionHead
                    kicker="03 · Usage"
                    title="What people use most"
                    source="edge"
                />
                <Box sx={two}>
                    <Card>
                        <CardTitle hint="HTML pages by views, scanner probes removed.">
                            Top pages
                        </CardTitle>
                        <Bars items={edge.pages} limit={12} color={C.blue} />
                    </Card>
                    <Card>
                        <CardTitle hint="API calls grouped by endpoint (ids collapsed to :id) — a proxy for feature usage.">
                            Top features (API)
                        </CardTitle>
                        <Bars
                            items={edge.features}
                            limit={12}
                            color={C.ink}
                            empty="No API traffic in this window."
                        />
                    </Card>
                </Box>
            </Box>

            {/* ------------------------------------------------ regions & locale */}
            <Box component="section" sx={{ mb: 4 }}>
                <SectionHead
                    kicker="04 · Audience"
                    title="Regions, language & devices"
                    source="edge"
                />
                <Box sx={three}>
                    <Card>
                        <CardTitle hint="Country of each request (Cloudflare geo-IP).">
                            Regions
                        </CardTitle>
                        <Bars
                            items={edge.countries}
                            limit={10}
                            format={(d) => countryName(d.label)}
                        />
                    </Card>
                    <Card>
                        <CardTitle hint="Inferred from country — Cloudflare doesn't expose Accept-Language on this plan. See signed-in locales above for real values.">
                            Likely language
                        </CardTitle>
                        <Bars
                            items={inferLanguages(edge.countries)}
                            limit={10}
                            color="#0e8a8a"
                        />
                    </Card>
                    <Card>
                        <CardTitle>Devices</CardTitle>
                        <Bars
                            items={edge.devices}
                            limit={5}
                            format={titleCase}
                        />
                        <Box sx={{ mt: 2 }}>
                            <CardTitle>Browsers</CardTitle>
                            <Bars items={edge.browsers} limit={5} />
                        </Box>
                        <Box sx={{ mt: 2 }}>
                            <CardTitle>Operating systems</CardTitle>
                            <Bars items={edge.os} limit={5} />
                        </Box>
                    </Card>
                </Box>
            </Box>

            {/* ------------------------------------------------- real browsers */}
            <Box component="section" sx={{ mb: 4 }}>
                <SectionHead
                    kicker="05 · Real browsers"
                    title="Acquisition & speed"
                    source="rum"
                />
                {!rum.available && rum.error && (
                    <SectionError
                        message={`Web Analytics unavailable: ${rum.error}`}
                    />
                )}
                {rum.available && rum.pageViews === 0 && (
                    <Note>
                        No Web Analytics beacons for {product.host} in this
                        window. Enable Cloudflare Web Analytics for the site (or
                        check that its pages are HTML served through Cloudflare)
                        to get referrers and page-load timing.
                    </Note>
                )}
                {rum.available && rum.pageViews > 0 && (
                    <>
                        <Box sx={{ ...evenGrid(4), mb: 1.5 }}>
                            <KpiTile
                                label="Browser page views"
                                value={fmt(rum.pageViews)}
                                spark={rumPv}
                                color={C.yellow}
                                sub={`${fmt(rum.visits)} visits`}
                            />
                            <KpiTile
                                label="Median page load"
                                value={fmtMs(rum.loadP50)}
                                color={C.yellow}
                                sub={`First paint ${fmtMs(rum.fcpP50)}`}
                            />
                            <KpiTile
                                label="Slow page load (p90)"
                                value={fmtMs(rum.loadP90)}
                                color={C.orange}
                                sub="1 in 10 loads is slower"
                            />
                            <KpiTile
                                label="Top source"
                                value={rum.referrers[0]?.label ?? "—"}
                                color={C.yellow}
                                sub={
                                    rum.referrers[0]
                                        ? `${pct(
                                              rum.referrers[0].value,
                                              rum.referrers.reduce(
                                                  (a, d) => a + d.value,
                                                  0,
                                              ),
                                              0,
                                          )} of referred visits`
                                        : undefined
                                }
                            />
                        </Box>
                        <Box sx={three}>
                            <Card>
                                <CardTitle hint="Where visits came from. Self-referrals removed.">
                                    Referrers
                                </CardTitle>
                                <Bars
                                    items={rum.referrers}
                                    limit={10}
                                    color={C.yellow}
                                />
                            </Card>
                            <Card>
                                <CardTitle hint="Pages real browsers loaded.">
                                    Top pages · browsers
                                </CardTitle>
                                <Bars
                                    items={rum.pages}
                                    limit={10}
                                    color={C.yellow}
                                />
                            </Card>
                            <Card>
                                <CardTitle>Countries · browsers</CardTitle>
                                <Bars
                                    items={rum.countries}
                                    limit={10}
                                    color={C.yellow}
                                    format={(d) => countryName(d.label)}
                                />
                            </Card>
                        </Box>
                    </>
                )}
            </Box>

            {/* --------------------------------------------------------- notes */}
            <Card sx={{ bgcolor: C.paperDeep, borderColor: C.paperDeep }}>
                <CardTitle>How these numbers are measured</CardTitle>
                <Box
                    sx={{
                        display: "grid",
                        gap: 0.75,
                        fontSize: "0.78rem",
                        color: C.textDim,
                        lineHeight: 1.6,
                    }}
                >
                    <Box sx={{ display: "flex", gap: 1 }}>
                        <Legend color={C.green} label="" />
                        <span>
                            <b>Signed-in users</b> come from Elixpo Accounts: a
                            user counts for a month when they sign into one of
                            this product&apos;s OAuth apps. Locale, country and
                            device are what each user&apos;s account holds.
                        </span>
                    </Box>
                    <Box sx={{ display: "flex", gap: 1 }}>
                        <Legend color={C.blue} label="" />
                        <span>
                            <b>Visitors</b> are Cloudflare edge requests from
                            real visitors (verified bots and Cloudflare-internal
                            traffic excluded). Unique visitors are distinct IP
                            addresses — shared networks merge people and long
                            ranges are sampled, so treat it as an estimate.
                        </span>
                    </Box>
                    <Box sx={{ display: "flex", gap: 1 }}>
                        <Legend color={C.yellow} label="" />
                        <span>
                            <b>Real browsers</b> come from Cloudflare Web
                            Analytics beacons, so they skip API clients and
                            bots, and are sampled at low volume.
                        </span>
                    </Box>
                </Box>
            </Card>
        </Box>
    );
}
