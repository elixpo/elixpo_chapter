"use client";

import { Pill } from "@/components/service/kit";
import { type ServiceCtx, TABS, type Tab } from "@/components/service/types";
import TimeRange from "@/components/time-range";
import { C, eyebrow } from "@/components/ui";
import { Launch, OpenInNew } from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import Link from "next/link";

const TAB_LABEL: Record<Tab, string> = {
    overview: "Overview",
    analytics: "Analytics",
    status: "Status codes",
    performance: "Performance",
    cache: "Caching",
    security: "Security",
    functions: "Functions",
    dns: "DNS",
};

const BACKEND_LABEL: Record<string, string> = {
    pages: "Pages",
    worker: "Worker",
    route: "Worker route",
    dns: "DNS",
};

export function tabLabel(t: Tab) {
    return TAB_LABEL[t];
}

const btn = {
    display: "inline-flex",
    alignItems: "center",
    gap: 0.6,
    px: 1.6,
    py: 0.7,
    borderRadius: "999px",
    fontSize: "0.78rem",
    fontWeight: 650,
    textDecoration: "none",
    whiteSpace: "nowrap",
} as const;

export default function ServiceHero({
    ctx,
    tab,
}: { ctx: ServiceCtx; tab: Tab }) {
    const s = ctx.service;
    const cfUrl = ctx.accountId
        ? `https://dash.cloudflare.com/${ctx.accountId}/${s.zoneName}`
        : "https://dash.cloudflare.com";
    const base = `/dashboard/services/${encodeURIComponent(s.host)}`;
    const q = (t: Tab) => {
        const p = new URLSearchParams();
        if (t !== "overview") p.set("tab", t);
        if (ctx.range && ctx.range !== "24h") p.set("range", ctx.range);
        const str = p.toString();
        return str ? `${base}?${str}` : base;
    };

    return (
        <Box sx={{ mb: 2.5 }}>
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    flexWrap: "wrap",
                    gap: 2,
                }}
            >
                <Box sx={{ minWidth: 0, flex: "1 1 320px" }}>
                    <Typography sx={{ ...eyebrow, mb: 0.75 }}>
                        Service · {s.zoneName}
                        {tab !== "overview" ? ` · ${TAB_LABEL[tab]}` : ""}
                    </Typography>
                    <Typography
                        component="h1"
                        sx={{
                            fontWeight: 650,
                            fontSize: {
                                xs: "2rem",
                                sm: "2.6rem",
                                md: "3.2rem",
                            },
                            lineHeight: 0.98,
                            letterSpacing: "-0.06em",
                            color: C.ink,
                            wordBreak: "break-word",
                        }}
                    >
                        {s.host}
                    </Typography>
                    <Box
                        sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 0.75,
                            mt: 1.25,
                        }}
                    >
                        {s.backends.length ? (
                            s.backends.map((b) => (
                                <Pill
                                    key={b}
                                    tone={
                                        b === "pages" || b === "worker"
                                            ? "blue"
                                            : "neutral"
                                    }
                                >
                                    {BACKEND_LABEL[b] || b}
                                </Pill>
                            ))
                        ) : (
                            <Pill tone="warn">
                                Not in catalog — traffic only
                            </Pill>
                        )}
                        {s.pagesProject && (
                            <Pill mono>pages: {s.pagesProject}</Pill>
                        )}
                        {s.workerScript && (
                            <Pill mono>worker: {s.workerScript}</Pill>
                        )}
                        {s.dnsType && (
                            <Pill mono>
                                {s.dnsType} → {s.dnsTarget}
                            </Pill>
                        )}
                        {s.proxied != null && s.backends.includes("dns") && (
                            <Pill tone={s.proxied ? "green" : "warn"}>
                                {s.proxied ? "Proxied" : "DNS only"}
                            </Pill>
                        )}
                    </Box>
                </Box>
                <Box
                    sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 1,
                    }}
                >
                    <Box
                        component="a"
                        href={`https://${s.host}`}
                        target="_blank"
                        rel="noreferrer"
                        sx={{
                            ...btn,
                            bgcolor: C.ink,
                            color: "#fff",
                            "&:hover": { bgcolor: "#000" },
                        }}
                    >
                        Visit site <OpenInNew sx={{ fontSize: "0.9rem" }} />
                    </Box>
                    <Box
                        component="a"
                        href={cfUrl}
                        target="_blank"
                        rel="noreferrer"
                        sx={{
                            ...btn,
                            color: C.ink,
                            border: `1px solid ${C.ink}`,
                            "&:hover": { bgcolor: C.paperDeep },
                        }}
                    >
                        Open in Cloudflare{" "}
                        <Launch sx={{ fontSize: "0.9rem" }} />
                    </Box>
                    <TimeRange />
                </Box>
            </Box>

            {/* Tab strip — mirrors the sidebar; essential on phones where the sidebar is a drawer. */}
            <Box
                sx={{
                    display: "flex",
                    gap: 0.5,
                    mt: 2,
                    pb: 0.25,
                    overflowX: "auto",
                    borderBottom: `1px solid ${C.line}`,
                    scrollbarWidth: "none",
                }}
            >
                {TABS.map((t) => {
                    const active = t === tab;
                    return (
                        <Box
                            key={t}
                            component={Link}
                            href={q(t)}
                            sx={{
                                px: 1.25,
                                py: 0.9,
                                fontSize: "0.8rem",
                                fontWeight: active ? 700 : 550,
                                color: active ? C.ink : C.textMuted,
                                textDecoration: "none",
                                whiteSpace: "nowrap",
                                borderBottom: `2px solid ${active ? C.ink : "transparent"}`,
                                mb: "-1px",
                                "&:hover": { color: C.ink },
                            }}
                        >
                            {TAB_LABEL[t]}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}
