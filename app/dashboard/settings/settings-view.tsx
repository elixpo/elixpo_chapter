"use client";

import { C, eyebrow } from "@/components/ui";
import {
    CheckCircle,
    ContentCopy,
    ErrorOutline,
    Launch,
    Refresh,
    RemoveCircleOutline,
} from "@mui/icons-material";
import { Box, CircularProgress, Tooltip, Typography } from "@mui/material";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";

/* ------------------------------------------------------------------ types */

export interface SettingsData {
    now: number;
    accountId: string;
    account:
        | { ok: true; name?: string; type?: string; createdOn?: string }
        | { ok: false; error: string };
    session: {
        email: string;
        name?: string;
        avatar: string | null;
        uid: string;
        isAdmin: boolean;
        iat: number;
        exp: number;
        atExp?: number;
    } | null;
    token:
        | {
              ok: true;
              id: string;
              status: string;
              expiresOn?: string;
              notBefore?: string;
          }
        | { ok: false; error: string };
    discovery: {
        fetchedAt: number;
        services: number;
        sections: {
            key: string;
            count: number;
            error?: string;
            status?: number;
        }[];
    };
    zones: {
        id: string;
        name: string;
        status: string;
        plan: string;
        type?: string;
        activatedOn?: string;
        nameServers: string[];
        services: number;
        settings: Record<string, string>;
        settingsError?: string;
    }[];
    zonesError?: string;
    runtime: {
        environment: string;
        appUrl: string;
        accountsUrl: string;
        redirectUri: string;
        kvBinding: boolean;
        secrets: { name: string; set: boolean }[];
    };
}

/* --------------------------------------------------------------- metadata */

/** What each discovery section needs on CF_API_TOKEN. */
const SCOPES: Record<string, { label: string; permission: string }> = {
    pages: {
        label: "Pages projects",
        permission: "Account · Cloudflare Pages · Read",
    },
    workers: {
        label: "Workers",
        permission: "Account · Workers Scripts · Read",
    },
    d1: { label: "D1 databases", permission: "Account · D1 · Read" },
    kv: {
        label: "KV namespaces",
        permission: "Account · Workers KV Storage · Read",
    },
    queues: { label: "Queues", permission: "Account · Queues · Read" },
    durableObjects: {
        label: "Durable Objects",
        permission: "Account · Workers Scripts · Read",
    },
    workflows: {
        label: "Workflows",
        permission: "Account · Workers Scripts · Read",
    },
    zones: { label: "Zones", permission: "Zone · Zone · Read (all zones)" },
};

const ZONE_SETTING_LABELS: Record<string, string> = {
    ssl: "SSL/TLS mode",
    always_use_https: "Always use HTTPS",
    min_tls_version: "Minimum TLS",
    tls_1_3: "TLS 1.3",
    automatic_https_rewrites: "Automatic HTTPS rewrites",
    http3: "HTTP/3 (QUIC)",
    brotli: "Brotli",
    early_hints: "Early Hints",
    security_level: "Security level",
    browser_check: "Browser integrity check",
    cache_level: "Caching level",
    browser_cache_ttl: "Browser cache TTL",
    always_online: "Always Online",
    development_mode: "Development mode",
};

const ZONE_GROUPS: { title: string; keys: string[] }[] = [
    {
        title: "SSL / TLS",
        keys: [
            "ssl",
            "always_use_https",
            "min_tls_version",
            "tls_1_3",
            "automatic_https_rewrites",
        ],
    },
    { title: "Speed", keys: ["http3", "brotli", "early_hints"] },
    { title: "Security", keys: ["security_level", "browser_check"] },
    {
        title: "Caching",
        keys: [
            "cache_level",
            "browser_cache_ttl",
            "always_online",
            "development_mode",
        ],
    },
];

const CACHE_POLICY = [
    {
        what: "Account discovery (inventory)",
        ttl: "60 s",
        key: "discovery:account",
    },
    { what: "Service catalog (switcher)", ttl: "5 min", key: "services:v1" },
    {
        what: "Analytics & diagnostics queries",
        ttl: "45 s",
        key: "zt:, zb:, dg:, svc:",
    },
    { what: "Daily uptime history", ttl: "10 min", key: "du:" },
    { what: "Audit log entries", ttl: "90 days", key: "audit:" },
];

const PLAN_LIMITS = {
    available: [
        "Requests, bandwidth, visits by host",
        "Edge + origin status codes",
        "Cache status, content type",
        "Security action / source",
        "Avg origin response time",
        "Countries, colos, devices, browsers, IPs",
        "Workers CPU / wall percentiles",
        "Pages Functions outcomes",
    ],
    unavailable: [
        "Time to first byte & any request percentiles",
        "Firewall events (WAF event log)",
        "Referrer, ASN, query string",
        "Bot score, WAF attack score",
        "Upper-tier colo",
    ],
};

const SECTIONS = [
    { id: "account", label: "Account" },
    { id: "session", label: "Your session" },
    { id: "token", label: "API token & scopes" },
    { id: "zones", label: "Zones" },
    { id: "runtime", label: "Runtime" },
    { id: "cache", label: "Cache policy" },
    { id: "plan", label: "Plan capabilities" },
];

/* ---------------------------------------------------------------- helpers */

function ago(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
}

function until(ms: number): string {
    if (ms <= 0) return "expired";
    const m = Math.round(ms / 60000);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
}

const dateFmt = (iso?: string | number) =>
    iso
        ? new Date(iso).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
          })
        : "—";

function prettySetting(key: string, raw: string | undefined): string {
    if (raw === undefined) return "—";
    if (key === "browser_cache_ttl") {
        const n = Number(raw);
        if (n === 0) return "Respect existing headers";
        if (n < 3600) return `${Math.round(n / 60)} min`;
        if (n < 86400) return `${Math.round(n / 3600)} h`;
        return `${Math.round(n / 86400)} d`;
    }
    if (key === "ssl")
        return (
            {
                off: "Off",
                flexible: "Flexible",
                full: "Full",
                strict: "Full (strict)",
            }[raw] || raw
        );
    if (key === "cache_level")
        return (
            {
                basic: "No query string",
                simplified: "Ignore query string",
                aggressive: "Standard",
            }[raw] || raw
        );
    if (raw === "on") return "On";
    if (raw === "off") return "Off";
    return raw.replace(/_/g, " ");
}

/** Whether a setting value is the recommended/healthy one (for the dot). */
function settingTone(key: string, raw?: string): "good" | "warn" | "neutral" {
    if (raw === undefined) return "neutral";
    const good: Record<string, (v: string) => boolean> = {
        ssl: (v) => v === "full" || v === "strict",
        always_use_https: (v) => v === "on",
        min_tls_version: (v) => Number(v) >= 1.2,
        tls_1_3: (v) => v !== "off",
        automatic_https_rewrites: (v) => v === "on",
        http3: (v) => v === "on",
        brotli: (v) => v === "on",
        development_mode: (v) => v === "off",
        browser_check: (v) => v === "on",
    };
    const f = good[key];
    if (!f) return "neutral";
    return f(raw) ? "good" : "warn";
}

/* ------------------------------------------------------------ primitives */

function Card({ children, sx }: { children: React.ReactNode; sx?: object }) {
    return (
        <Box
            sx={{
                bgcolor: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: "20px",
                p: { xs: 2, md: 2.5 },
                ...sx,
            }}
        >
            {children}
        </Box>
    );
}

function Section({
    id,
    kicker,
    title,
    lede,
    action,
    children,
}: {
    id: string;
    kicker: string;
    title: string;
    lede?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <Box component="section" id={id} sx={{ scrollMarginTop: 110, mb: 5 }}>
            <Box
                sx={{
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: 2,
                    flexWrap: "wrap",
                    mb: 1.75,
                }}
            >
                <Box sx={{ maxWidth: 680 }}>
                    <Typography sx={{ ...eyebrow, mb: 0.75 }}>
                        {kicker}
                    </Typography>
                    <Typography
                        component="h2"
                        sx={{
                            fontSize: { xs: "1.6rem", md: "2rem" },
                            fontWeight: 650,
                            letterSpacing: "-0.05em",
                            lineHeight: 1,
                        }}
                    >
                        {title}
                    </Typography>
                    {lede && (
                        <Typography
                            sx={{
                                color: C.textMuted,
                                fontSize: "0.86rem",
                                lineHeight: 1.6,
                                mt: 1,
                            }}
                        >
                            {lede}
                        </Typography>
                    )}
                </Box>
                {action}
            </Box>
            {children}
        </Box>
    );
}

function Row({
    label,
    children,
    hint,
}: {
    label: string;
    children: React.ReactNode;
    hint?: string;
}) {
    return (
        <Box
            sx={{
                display: "grid",
                gridTemplateColumns: {
                    xs: "1fr",
                    sm: "minmax(150px, 0.8fr) minmax(0, 1.6fr)",
                },
                gap: { xs: 0.25, sm: 2 },
                alignItems: "center",
                py: 1.15,
                borderBottom: `1px solid ${C.line}`,
                "&:last-of-type": { borderBottom: 0 },
            }}
        >
            <Box>
                <Typography sx={{ color: C.textMuted, fontSize: "0.8rem" }}>
                    {label}
                </Typography>
                {hint && (
                    <Typography
                        sx={{
                            color: C.textMuted,
                            fontSize: "0.68rem",
                            opacity: 0.8,
                        }}
                    >
                        {hint}
                    </Typography>
                )}
            </Box>
            <Box
                sx={{
                    fontSize: "0.86rem",
                    color: C.text,
                    minWidth: 0,
                    overflowWrap: "anywhere",
                    textAlign: { sm: "right" },
                    display: "flex",
                    justifyContent: { sm: "flex-end" },
                    alignItems: "center",
                    gap: 0.75,
                    flexWrap: "wrap",
                }}
            >
                {children}
            </Box>
        </Box>
    );
}

function Mono({ children }: { children: React.ReactNode }) {
    return (
        <Box component="span" sx={{ fontFamily: C.mono, fontSize: "0.8rem" }}>
            {children}
        </Box>
    );
}

type Tone = "good" | "warn" | "bad" | "neutral";
const TONE: Record<Tone, { fg: string; bg: string }> = {
    good: { fg: C.success, bg: C.successBg },
    warn: { fg: C.warn, bg: C.warnBg },
    bad: { fg: C.error, bg: C.errorBg },
    neutral: { fg: C.textDim, bg: C.paperDeep },
};

function Pill({
    tone = "neutral",
    children,
}: { tone?: Tone; children: React.ReactNode }) {
    const t = TONE[tone];
    return (
        <Box
            component="span"
            sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                px: 1,
                py: 0.3,
                borderRadius: "999px",
                fontSize: "0.7rem",
                fontWeight: 700,
                color: t.fg,
                bgcolor: t.bg,
                whiteSpace: "nowrap",
            }}
        >
            {children}
        </Box>
    );
}

function CopyButton({ value }: { value: string }) {
    const [done, setDone] = useState(false);
    return (
        <Tooltip title={done ? "Copied" : "Copy"}>
            <Box
                component="button"
                type="button"
                aria-label="Copy to clipboard"
                onClick={async () => {
                    try {
                        await navigator.clipboard.writeText(value);
                        setDone(true);
                        setTimeout(() => setDone(false), 1400);
                    } catch {}
                }}
                sx={{
                    border: `1px solid ${C.border}`,
                    bgcolor: C.paper,
                    borderRadius: "999px",
                    width: 28,
                    height: 28,
                    display: "inline-grid",
                    placeItems: "center",
                    cursor: "pointer",
                    color: done ? C.success : C.textMuted,
                    "&:hover": { color: C.text, borderColor: C.borderLight },
                }}
            >
                {done ? (
                    <CheckCircle sx={{ fontSize: "0.9rem" }} />
                ) : (
                    <ContentCopy sx={{ fontSize: "0.85rem" }} />
                )}
            </Box>
        </Tooltip>
    );
}

function ExtLink({
    href,
    children,
}: { href: string; children: React.ReactNode }) {
    return (
        <Box
            component="a"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                color: C.green,
                fontSize: "0.76rem",
                fontWeight: 700,
                textDecoration: "none",
                "&:hover": { textDecoration: "underline" },
            }}
        >
            {children} <Launch sx={{ fontSize: "0.8rem" }} />
        </Box>
    );
}

function SummaryTile({
    label,
    value,
    sub,
    tone,
    href,
}: {
    label: string;
    value: string;
    sub: string;
    tone: Tone;
    href: string;
}) {
    const t = TONE[tone];
    return (
        <Box
            component="a"
            href={href}
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
                    alignItems: "center",
                    gap: 0.75,
                    mb: 1.25,
                }}
            >
                <Box
                    sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: t.fg,
                    }}
                />
                <Typography sx={{ ...eyebrow, color: C.textMuted }}>
                    {label}
                </Typography>
            </Box>
            <Typography
                sx={{
                    fontSize: "1.65rem",
                    fontWeight: 650,
                    letterSpacing: "-0.055em",
                    lineHeight: 1,
                }}
            >
                {value}
            </Typography>
            <Typography
                sx={{ color: C.textMuted, fontSize: "0.74rem", mt: 0.75 }}
            >
                {sub}
            </Typography>
        </Box>
    );
}

/* ------------------------------------------------------------------ view */

export default function SettingsView({ data }: { data: SettingsData }) {
    const router = useRouter();
    const [refreshing, setRefreshing] = useState(false);
    const [refreshMsg, setRefreshMsg] = useState<{
        tone: Tone;
        text: string;
    } | null>(null);

    const { session, token, discovery, zones, runtime } = data;
    const failing = discovery.sections.filter((s) => s.error);
    const okCount = discovery.sections.length - failing.length;
    const missingSecrets = runtime.secrets.filter((s) => !s.set);
    const sessionLeft = session ? session.exp * 1000 - data.now : 0;
    const sessionFrac = session
        ? Math.min(
              1,
              Math.max(0, sessionLeft / ((session.exp - session.iat) * 1000)),
          )
        : 0;
    const dash = `https://dash.cloudflare.com/${data.accountId}`;

    const refresh = async () => {
        setRefreshing(true);
        setRefreshMsg(null);
        try {
            const r = await fetch("/api/admin/refresh", { method: "POST" });
            const j = (await r.json()) as {
                error?: string;
                services?: number;
                failing?: string[];
                ms?: number;
            };
            if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
            setRefreshMsg({
                tone: j.failing?.length ? "warn" : "good",
                text: `Rediscovered ${j.services ?? 0} services in ${((j.ms ?? 0) / 1000).toFixed(1)}s${j.failing?.length ? ` · ${j.failing.length} section(s) failing` : ""}`,
            });
            router.refresh();
        } catch (e) {
            setRefreshMsg({ tone: "bad", text: (e as Error).message });
        } finally {
            setRefreshing(false);
        }
    };

    return (
        <Box>
            {/* -------------------------------------------------------- hero */}
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
                <Box>
                    <Typography sx={{ ...eyebrow, mb: 1 }}>
                        Admin · Settings
                    </Typography>
                    <Typography
                        component="h1"
                        sx={{
                            fontSize: { xs: "2.6rem", md: "4rem" },
                            fontWeight: 600,
                            letterSpacing: "-0.07em",
                            lineHeight: 0.92,
                        }}
                    >
                        Settings &{" "}
                        <Box
                            component="em"
                            sx={{
                                fontFamily: "Georgia, serif",
                                fontWeight: 400,
                            }}
                        >
                            health.
                        </Box>
                    </Typography>
                    <Typography
                        sx={{
                            color: C.textMuted,
                            fontSize: "0.92rem",
                            mt: 1.5,
                            maxWidth: 620,
                            lineHeight: 1.6,
                        }}
                    >
                        Everything this console runs on — the Cloudflare
                        account, your session, the API token and the scopes
                        discovery depends on. Read-only; secret values never
                        leave the server.
                    </Typography>
                </Box>
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: { xs: "flex-start", sm: "flex-end" },
                        gap: 0.75,
                    }}
                >
                    <Box
                        component="button"
                        type="button"
                        onClick={refresh}
                        disabled={refreshing}
                        sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 0.75,
                            height: 44,
                            px: 2,
                            border: 0,
                            borderRadius: "999px",
                            bgcolor: C.ink,
                            color: "#fff",
                            fontFamily: "inherit",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            cursor: refreshing ? "progress" : "pointer",
                            opacity: refreshing ? 0.75 : 1,
                        }}
                    >
                        {refreshing ? (
                            <CircularProgress
                                size={14}
                                sx={{ color: "#fff" }}
                            />
                        ) : (
                            <Refresh sx={{ fontSize: "1rem" }} />
                        )}
                        {refreshing ? "Rediscovering…" : "Refresh discovery"}
                    </Box>
                    <Typography
                        sx={{ fontSize: "0.72rem", color: C.textMuted }}
                    >
                        Last discovered {ago(data.now - discovery.fetchedAt)}
                    </Typography>
                    {refreshMsg && (
                        <Pill tone={refreshMsg.tone}>{refreshMsg.text}</Pill>
                    )}
                </Box>
            </Box>

            {/* ------------------------------------------------ summary strip */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, minmax(0,1fr))",
                        lg: "repeat(4, minmax(0,1fr))",
                    },
                    gap: 1.5,
                    mb: 4,
                }}
            >
                <SummaryTile
                    label="API token"
                    value={
                        token.ok
                            ? token.status === "active"
                                ? "Active"
                                : token.status
                            : "Invalid"
                    }
                    sub={
                        token.ok
                            ? token.expiresOn
                                ? `Expires ${dateFmt(token.expiresOn)}`
                                : "No expiry set"
                            : token.error
                    }
                    tone={
                        token.ok && token.status === "active" ? "good" : "bad"
                    }
                    href="#token"
                />
                <SummaryTile
                    label="Discovery scopes"
                    value={`${okCount}/${discovery.sections.length}`}
                    sub={
                        failing.length
                            ? `${failing.map((f) => SCOPES[f.key]?.label || f.key).join(", ")} failing`
                            : "Every section readable"
                    }
                    tone={failing.length ? "warn" : "good"}
                    href="#token"
                />
                <SummaryTile
                    label="Zones"
                    value={String(zones.length)}
                    sub={`${zones.filter((z) => z.status === "active").length} active · ${Array.from(new Set(zones.map((z) => z.plan))).join(", ") || "—"}`}
                    tone={
                        zones.every((z) => z.status === "active")
                            ? "good"
                            : "warn"
                    }
                    href="#zones"
                />
                <SummaryTile
                    label="Session"
                    value={session ? until(sessionLeft) : "—"}
                    sub={session ? "until you're signed out" : "No session"}
                    tone={
                        !session
                            ? "bad"
                            : sessionLeft < 3600_000
                              ? "warn"
                              : "good"
                    }
                    href="#session"
                />
            </Box>

            {/* -------------------------------------------------- body grid */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: {
                        xs: "1fr",
                        lg: "180px minmax(0, 1fr)",
                    },
                    gap: { lg: 4 },
                }}
            >
                <Box
                    component="nav"
                    aria-label="Settings sections"
                    sx={{
                        display: { xs: "none", lg: "block" },
                        position: "sticky",
                        top: 110,
                        alignSelf: "start",
                    }}
                >
                    <Typography sx={{ ...eyebrow, color: C.textMuted, mb: 1 }}>
                        On this page
                    </Typography>
                    {SECTIONS.map((s) => (
                        <Box
                            key={s.id}
                            component="a"
                            href={`#${s.id}`}
                            sx={{
                                display: "block",
                                py: 0.6,
                                pl: 1.25,
                                borderLeft: `2px solid ${C.line}`,
                                color: C.textDim,
                                fontSize: "0.8rem",
                                fontWeight: 600,
                                textDecoration: "none",
                                "&:hover": {
                                    color: C.text,
                                    borderLeftColor: C.ink,
                                },
                            }}
                        >
                            {s.label}
                        </Box>
                    ))}
                </Box>

                <Box sx={{ minWidth: 0 }}>
                    {/* ------------------------------------------- account */}
                    <Section
                        id="account"
                        kicker="01 · Account"
                        title="Cloudflare account"
                        action={
                            <ExtLink href={dash}>Open in Cloudflare</ExtLink>
                        }
                    >
                        <Card>
                            {data.account.ok ? (
                                <>
                                    <Row label="Name">
                                        {data.account.name || "—"}
                                    </Row>
                                    <Row label="Type">
                                        <Pill>{data.account.type || "—"}</Pill>
                                    </Row>
                                    <Row label="Created">
                                        {dateFmt(data.account.createdOn)}
                                    </Row>
                                </>
                            ) : (
                                <Row label="Account details">
                                    <Pill tone="warn">
                                        unavailable · {data.account.error}
                                    </Pill>
                                </Row>
                            )}
                            <Row label="Account ID">
                                <Mono>{data.accountId}</Mono>
                                <CopyButton value={data.accountId} />
                            </Row>
                            <Row label="Quick links">
                                <ExtLink href={`${dash}/billing`}>
                                    Billing
                                </ExtLink>
                                <ExtLink href={`${dash}/members`}>
                                    Members
                                </ExtLink>
                                <ExtLink href={`${dash}/audit-log`}>
                                    CF audit log
                                </ExtLink>
                            </Row>
                        </Card>
                    </Section>

                    {/* ------------------------------------------- session */}
                    <Section
                        id="session"
                        kicker="02 · You"
                        title="Your session"
                        lede="Signed in through accounts.elixpo.com. Sessions are signed, httpOnly cookies that last 12 hours."
                    >
                        <Card>
                            {session ? (
                                <>
                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 1.75,
                                            pb: 2,
                                            borderBottom: `1px solid ${C.line}`,
                                        }}
                                    >
                                        {session.avatar ? (
                                            <Box
                                                component="img"
                                                src={session.avatar}
                                                alt=""
                                                referrerPolicy="no-referrer"
                                                sx={{
                                                    width: 52,
                                                    height: 52,
                                                    borderRadius: "50%",
                                                    objectFit: "cover",
                                                    border: `1px solid ${C.border}`,
                                                }}
                                            />
                                        ) : (
                                            <Box
                                                sx={{
                                                    width: 52,
                                                    height: 52,
                                                    borderRadius: "50%",
                                                    bgcolor: C.ink,
                                                    color: "#fff",
                                                    display: "grid",
                                                    placeItems: "center",
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {session.email
                                                    .charAt(0)
                                                    .toUpperCase()}
                                            </Box>
                                        )}
                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                            <Typography
                                                sx={{
                                                    fontWeight: 700,
                                                    fontSize: "1.05rem",
                                                    letterSpacing: "-0.02em",
                                                }}
                                            >
                                                {session.name || "Admin"}
                                            </Typography>
                                            <Typography
                                                sx={{
                                                    color: C.textMuted,
                                                    fontSize: "0.82rem",
                                                    overflowWrap: "anywhere",
                                                }}
                                            >
                                                {session.email}
                                            </Typography>
                                        </Box>
                                        <Pill
                                            tone={
                                                session.isAdmin ? "good" : "bad"
                                            }
                                        >
                                            {session.isAdmin
                                                ? "Administrator"
                                                : "Not admin"}
                                        </Pill>
                                    </Box>
                                    <Row label="Signed in">
                                        {new Date(
                                            session.iat * 1000,
                                        ).toLocaleString()}
                                    </Row>
                                    <Row
                                        label="Expires"
                                        hint={`${until(sessionLeft)} left`}
                                    >
                                        <Box
                                            sx={{
                                                width: { xs: "100%", sm: 160 },
                                                height: 6,
                                                borderRadius: 999,
                                                bgcolor: C.paperDeep,
                                                overflow: "hidden",
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    width: `${sessionFrac * 100}%`,
                                                    height: "100%",
                                                    bgcolor:
                                                        sessionLeft < 3600_000
                                                            ? C.warn
                                                            : C.green,
                                                }}
                                            />
                                        </Box>
                                        {new Date(
                                            session.exp * 1000,
                                        ).toLocaleTimeString()}
                                    </Row>
                                    {session.atExp && (
                                        <Row
                                            label="Upstream access token"
                                            hint="Elixpo Accounts OAuth"
                                        >
                                            {session.atExp * 1000 > data.now ? (
                                                <Pill tone="good">
                                                    valid ·{" "}
                                                    {until(
                                                        session.atExp * 1000 -
                                                            data.now,
                                                    )}
                                                </Pill>
                                            ) : (
                                                <Pill tone="warn">expired</Pill>
                                            )}
                                        </Row>
                                    )}
                                    <Row label="User ID">
                                        <Mono>{session.uid}</Mono>
                                    </Row>
                                    <Row label="Account">
                                        <ExtLink href="https://accounts.elixpo.com/dashboard">
                                            Manage on Elixpo Accounts
                                        </ExtLink>
                                        <Box
                                            component="a"
                                            href="/api/auth/logout"
                                            sx={{
                                                px: 1.5,
                                                py: 0.6,
                                                borderRadius: "999px",
                                                border: `1px solid ${C.border}`,
                                                fontSize: "0.76rem",
                                                fontWeight: 700,
                                                color: C.error,
                                                textDecoration: "none",
                                                "&:hover": {
                                                    bgcolor: C.errorBg,
                                                    borderColor: C.error,
                                                },
                                            }}
                                        >
                                            Sign out
                                        </Box>
                                    </Row>
                                </>
                            ) : (
                                <Typography
                                    sx={{
                                        color: C.textMuted,
                                        fontSize: "0.85rem",
                                    }}
                                >
                                    No session found.
                                </Typography>
                            )}
                        </Card>
                    </Section>

                    {/* --------------------------------------------- token */}
                    <Section
                        id="token"
                        kicker="03 · Access"
                        title="API token & scopes"
                        lede="Discovery and analytics run on the dedicated CF_API_TOKEN. A failing section almost always means the token is missing that permission, or the product isn't enabled on the account."
                        action={
                            <ExtLink href="https://dash.cloudflare.com/profile/api-tokens">
                                Manage tokens
                            </ExtLink>
                        }
                    >
                        <Card sx={{ mb: 1.5 }}>
                            <Row label="Status">
                                {token.ok ? (
                                    <Pill
                                        tone={
                                            token.status === "active"
                                                ? "good"
                                                : "bad"
                                        }
                                    >
                                        {token.status}
                                    </Pill>
                                ) : (
                                    <Pill tone="bad">{token.error}</Pill>
                                )}
                            </Row>
                            {token.ok && (
                                <>
                                    <Row
                                        label="Token ID"
                                        hint="Identifier only — not the secret"
                                    >
                                        <Mono>{token.id}</Mono>
                                    </Row>
                                    <Row label="Valid from">
                                        {token.notBefore
                                            ? dateFmt(token.notBefore)
                                            : "Immediately"}
                                    </Row>
                                    <Row label="Expires">
                                        {token.expiresOn
                                            ? dateFmt(token.expiresOn)
                                            : "Never"}
                                    </Row>
                                </>
                            )}
                            <Row label="Analytics">
                                <Mono>
                                    GraphQL · Account Analytics Read + Zone
                                    Analytics Read
                                </Mono>
                            </Row>
                        </Card>
                        <Card sx={{ p: 0, overflow: "hidden" }}>
                            <Box sx={{ overflowX: "auto" }}>
                                <Box
                                    component="table"
                                    sx={{
                                        width: "100%",
                                        borderCollapse: "collapse",
                                        minWidth: 560,
                                    }}
                                >
                                    <Box component="thead">
                                        <Box
                                            component="tr"
                                            sx={{ bgcolor: C.paperDeep }}
                                        >
                                            {[
                                                "Section",
                                                "Discovered",
                                                "Required permission",
                                                "Status",
                                            ].map((h, i) => (
                                                <Box
                                                    key={h}
                                                    component="th"
                                                    sx={{
                                                        ...eyebrow,
                                                        color: C.textMuted,
                                                        textAlign:
                                                            i === 3
                                                                ? "right"
                                                                : "left",
                                                        px: 2,
                                                        py: 1.25,
                                                    }}
                                                >
                                                    {h}
                                                </Box>
                                            ))}
                                        </Box>
                                    </Box>
                                    <Box component="tbody">
                                        {discovery.sections.map((s) => (
                                            <Box
                                                component="tr"
                                                key={s.key}
                                                sx={{
                                                    borderTop: `1px solid ${C.line}`,
                                                }}
                                            >
                                                <Box
                                                    component="td"
                                                    sx={{
                                                        px: 2,
                                                        py: 1.25,
                                                        fontSize: "0.84rem",
                                                        fontWeight: 650,
                                                    }}
                                                >
                                                    {SCOPES[s.key]?.label ||
                                                        s.key}
                                                </Box>
                                                <Box
                                                    component="td"
                                                    sx={{
                                                        px: 2,
                                                        py: 1.25,
                                                        fontFamily: C.mono,
                                                        fontSize: "0.8rem",
                                                    }}
                                                >
                                                    {s.error ? "—" : s.count}
                                                </Box>
                                                <Box
                                                    component="td"
                                                    sx={{
                                                        px: 2,
                                                        py: 1.25,
                                                        fontSize: "0.76rem",
                                                        color: C.textMuted,
                                                    }}
                                                >
                                                    {SCOPES[s.key]
                                                        ?.permission || "—"}
                                                    {s.error && (
                                                        <Box
                                                            sx={{
                                                                color: C.error,
                                                                mt: 0.4,
                                                                fontSize:
                                                                    "0.72rem",
                                                            }}
                                                        >
                                                            {s.status
                                                                ? `HTTP ${s.status} · `
                                                                : ""}
                                                            {s.error}
                                                        </Box>
                                                    )}
                                                </Box>
                                                <Box
                                                    component="td"
                                                    sx={{
                                                        px: 2,
                                                        py: 1.25,
                                                        textAlign: "right",
                                                    }}
                                                >
                                                    {s.error ? (
                                                        <Pill tone="warn">
                                                            <ErrorOutline
                                                                sx={{
                                                                    fontSize:
                                                                        "0.85rem",
                                                                }}
                                                            />{" "}
                                                            unavailable
                                                        </Pill>
                                                    ) : (
                                                        <Pill tone="good">
                                                            <CheckCircle
                                                                sx={{
                                                                    fontSize:
                                                                        "0.85rem",
                                                                }}
                                                            />{" "}
                                                            ok
                                                        </Pill>
                                                    )}
                                                </Box>
                                            </Box>
                                        ))}
                                    </Box>
                                </Box>
                            </Box>
                            <Box
                                sx={{
                                    px: 2,
                                    py: 1.25,
                                    borderTop: `1px solid ${C.line}`,
                                    fontSize: "0.74rem",
                                    color: C.textMuted,
                                }}
                            >
                                {discovery.services} services in the catalog ·
                                discovered {ago(data.now - discovery.fetchedAt)}
                            </Box>
                        </Card>
                    </Section>

                    {/* --------------------------------------------- zones */}
                    <Section
                        id="zones"
                        kicker="04 · Network"
                        title="Zones"
                        lede="Plan and the settings that most affect what visitors get. Green means the recommended value; amber is worth a look."
                    >
                        {data.zonesError && (
                            <Card sx={{ mb: 1.5 }}>
                                <Pill tone="warn">
                                    Zones unavailable · {data.zonesError}
                                </Pill>
                            </Card>
                        )}
                        <Box sx={{ display: "grid", gap: 1.5 }}>
                            {zones.map((z) => (
                                <Card key={z.id}>
                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "flex-start",
                                            justifyContent: "space-between",
                                            gap: 2,
                                            flexWrap: "wrap",
                                            mb: 2,
                                        }}
                                    >
                                        <Box>
                                            <Typography
                                                sx={{
                                                    fontSize: "1.5rem",
                                                    fontWeight: 650,
                                                    letterSpacing: "-0.05em",
                                                    lineHeight: 1.1,
                                                }}
                                            >
                                                {z.name}
                                            </Typography>
                                            <Box
                                                sx={{
                                                    display: "flex",
                                                    gap: 0.75,
                                                    flexWrap: "wrap",
                                                    mt: 1,
                                                }}
                                            >
                                                <Pill
                                                    tone={
                                                        z.status === "active"
                                                            ? "good"
                                                            : "warn"
                                                    }
                                                >
                                                    {z.status}
                                                </Pill>
                                                <Pill>{z.plan}</Pill>
                                                {z.type && (
                                                    <Pill>{z.type} setup</Pill>
                                                )}
                                                <Pill>
                                                    {z.services} services
                                                </Pill>
                                            </Box>
                                        </Box>
                                        <Box
                                            sx={{ textAlign: { sm: "right" } }}
                                        >
                                            <ExtLink href={`${dash}/${z.name}`}>
                                                Open zone
                                            </ExtLink>
                                            <Typography
                                                sx={{
                                                    fontSize: "0.72rem",
                                                    color: C.textMuted,
                                                    mt: 0.5,
                                                }}
                                            >
                                                Active since{" "}
                                                {dateFmt(z.activatedOn)}
                                            </Typography>
                                            {z.nameServers.length > 0 && (
                                                <Typography
                                                    sx={{
                                                        fontFamily: C.mono,
                                                        fontSize: "0.68rem",
                                                        color: C.textMuted,
                                                        mt: 0.25,
                                                    }}
                                                >
                                                    {z.nameServers.join(" · ")}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Box>
                                    {z.settingsError ? (
                                        <Pill tone="warn">
                                            Settings unavailable ·{" "}
                                            {z.settingsError}
                                        </Pill>
                                    ) : (
                                        <Box
                                            sx={{
                                                display: "grid",
                                                gridTemplateColumns: {
                                                    xs: "1fr",
                                                    md: "repeat(2, minmax(0,1fr))",
                                                },
                                                gap: 1.5,
                                            }}
                                        >
                                            {ZONE_GROUPS.map((g) => (
                                                <Box
                                                    key={g.title}
                                                    sx={{
                                                        border: `1px solid ${C.line}`,
                                                        borderRadius: "14px",
                                                        p: 1.5,
                                                        bgcolor: C.paper,
                                                    }}
                                                >
                                                    <Typography
                                                        sx={{
                                                            ...eyebrow,
                                                            color: C.textMuted,
                                                            mb: 0.75,
                                                        }}
                                                    >
                                                        {g.title}
                                                    </Typography>
                                                    {g.keys.map((k) => {
                                                        const tone =
                                                            settingTone(
                                                                k,
                                                                z.settings[k],
                                                            );
                                                        return (
                                                            <Box
                                                                key={k}
                                                                sx={{
                                                                    display:
                                                                        "flex",
                                                                    alignItems:
                                                                        "center",
                                                                    justifyContent:
                                                                        "space-between",
                                                                    gap: 1,
                                                                    py: 0.55,
                                                                    fontSize:
                                                                        "0.8rem",
                                                                }}
                                                            >
                                                                <Box
                                                                    component="span"
                                                                    sx={{
                                                                        color: C.textDim,
                                                                    }}
                                                                >
                                                                    {
                                                                        ZONE_SETTING_LABELS[
                                                                            k
                                                                        ]
                                                                    }
                                                                </Box>
                                                                <Box
                                                                    component="span"
                                                                    sx={{
                                                                        display:
                                                                            "inline-flex",
                                                                        alignItems:
                                                                            "center",
                                                                        gap: 0.6,
                                                                        fontWeight: 650,
                                                                        textAlign:
                                                                            "right",
                                                                    }}
                                                                >
                                                                    {prettySetting(
                                                                        k,
                                                                        z
                                                                            .settings[
                                                                            k
                                                                        ],
                                                                    )}
                                                                    <Box
                                                                        component="span"
                                                                        sx={{
                                                                            width: 7,
                                                                            height: 7,
                                                                            borderRadius:
                                                                                "50%",
                                                                            flexShrink: 0,
                                                                            bgcolor:
                                                                                tone ===
                                                                                "good"
                                                                                    ? C.success
                                                                                    : tone ===
                                                                                        "warn"
                                                                                      ? C.yellow
                                                                                      : C.line,
                                                                        }}
                                                                    />
                                                                </Box>
                                                            </Box>
                                                        );
                                                    })}
                                                </Box>
                                            ))}
                                        </Box>
                                    )}
                                </Card>
                            ))}
                        </Box>
                    </Section>

                    {/* ------------------------------------------- runtime */}
                    <Section
                        id="runtime"
                        kicker="05 · Runtime"
                        title="Environment"
                        lede="Where this deployment runs and which secrets it can see. Only whether each one is set is shown — values never reach the browser."
                    >
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: {
                                    xs: "1fr",
                                    xl: "1.2fr 1fr",
                                },
                                gap: 1.5,
                            }}
                        >
                            <Card>
                                <Row label="Environment">
                                    <Pill
                                        tone={
                                            runtime.environment === "production"
                                                ? "good"
                                                : "neutral"
                                        }
                                    >
                                        {runtime.environment}
                                    </Pill>
                                </Row>
                                <Row label="App URL">
                                    <Mono>{runtime.appUrl}</Mono>
                                </Row>
                                <Row label="Accounts SSO">
                                    <Mono>{runtime.accountsUrl}</Mono>
                                </Row>
                                <Row label="OAuth redirect">
                                    <Mono>{runtime.redirectUri}</Mono>
                                </Row>
                                <Row
                                    label="KV binding"
                                    hint="admin-cache namespace"
                                >
                                    {runtime.kvBinding ? (
                                        <Pill tone="good">bound</Pill>
                                    ) : (
                                        <Pill tone="neutral">
                                            REST fallback (local dev)
                                        </Pill>
                                    )}
                                </Row>
                            </Card>
                            <Card>
                                <Box
                                    sx={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        mb: 1,
                                    }}
                                >
                                    <Typography
                                        sx={{ ...eyebrow, color: C.textMuted }}
                                    >
                                        Secrets
                                    </Typography>
                                    <Pill
                                        tone={
                                            missingSecrets.length
                                                ? "bad"
                                                : "good"
                                        }
                                    >
                                        {runtime.secrets.length -
                                            missingSecrets.length}
                                        /{runtime.secrets.length} set
                                    </Pill>
                                </Box>
                                {runtime.secrets.map((s) => (
                                    <Box
                                        key={s.name}
                                        sx={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            py: 0.85,
                                            borderTop: `1px solid ${C.line}`,
                                        }}
                                    >
                                        <Mono>{s.name}</Mono>
                                        {s.set ? (
                                            <Box
                                                sx={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: 0.5,
                                                    color: C.success,
                                                    fontSize: "0.76rem",
                                                    fontWeight: 700,
                                                }}
                                            >
                                                <CheckCircle
                                                    sx={{ fontSize: "0.95rem" }}
                                                />{" "}
                                                set
                                            </Box>
                                        ) : (
                                            <Box
                                                sx={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: 0.5,
                                                    color: C.error,
                                                    fontSize: "0.76rem",
                                                    fontWeight: 700,
                                                }}
                                            >
                                                <RemoveCircleOutline
                                                    sx={{ fontSize: "0.95rem" }}
                                                />{" "}
                                                missing
                                            </Box>
                                        )}
                                    </Box>
                                ))}
                            </Card>
                        </Box>
                    </Section>

                    {/* --------------------------------------------- cache */}
                    <Section
                        id="cache"
                        kicker="06 · Data"
                        title="Cache policy"
                        lede="Responses from the Cloudflare API are cached in the admin-cache KV namespace so pages stay fast and inside API rate limits. Use “Refresh discovery” to skip the inventory cache."
                    >
                        <Card sx={{ p: 0, overflow: "hidden" }}>
                            {CACHE_POLICY.map((c, i) => (
                                <Box
                                    key={c.what}
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: {
                                            xs: "1fr auto",
                                            sm: "1fr 1fr auto",
                                        },
                                        gap: 2,
                                        alignItems: "center",
                                        px: 2,
                                        py: 1.25,
                                        borderTop: i
                                            ? `1px solid ${C.line}`
                                            : 0,
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            fontSize: "0.84rem",
                                            fontWeight: 600,
                                        }}
                                    >
                                        {c.what}
                                    </Typography>
                                    <Box
                                        sx={{
                                            display: {
                                                xs: "none",
                                                sm: "block",
                                            },
                                            fontFamily: C.mono,
                                            fontSize: "0.74rem",
                                            color: C.textMuted,
                                        }}
                                    >
                                        {c.key}
                                    </Box>
                                    <Pill>{c.ttl}</Pill>
                                </Box>
                            ))}
                        </Card>
                    </Section>

                    {/* ---------------------------------------------- plan */}
                    <Section
                        id="plan"
                        kicker="07 · Limits"
                        title="Plan capabilities"
                        lede="Both zones are on the Free plan, which limits the analytics Cloudflare exposes. The dashboards only use what's available and label the gaps."
                        action={
                            <ExtLink href={`${dash}/billing/subscriptions`}>
                                Compare plans
                            </ExtLink>
                        }
                    >
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: {
                                    xs: "1fr",
                                    md: "1fr 1fr",
                                },
                                gap: 1.5,
                            }}
                        >
                            <Card>
                                <Typography
                                    sx={{ ...eyebrow, color: C.green, mb: 1 }}
                                >
                                    Available
                                </Typography>
                                {PLAN_LIMITS.available.map((x) => (
                                    <Box
                                        key={x}
                                        sx={{
                                            display: "flex",
                                            gap: 1,
                                            alignItems: "flex-start",
                                            py: 0.6,
                                            fontSize: "0.82rem",
                                        }}
                                    >
                                        <CheckCircle
                                            sx={{
                                                fontSize: "1rem",
                                                color: C.success,
                                                mt: "1px",
                                            }}
                                        />
                                        {x}
                                    </Box>
                                ))}
                            </Card>
                            <Card sx={{ bgcolor: C.paperDeep }}>
                                <Typography
                                    sx={{ ...eyebrow, color: C.orange, mb: 1 }}
                                >
                                    Not on Free
                                </Typography>
                                {PLAN_LIMITS.unavailable.map((x) => (
                                    <Box
                                        key={x}
                                        sx={{
                                            display: "flex",
                                            gap: 1,
                                            alignItems: "flex-start",
                                            py: 0.6,
                                            fontSize: "0.82rem",
                                            color: C.textDim,
                                        }}
                                    >
                                        <RemoveCircleOutline
                                            sx={{
                                                fontSize: "1rem",
                                                color: C.textMuted,
                                                mt: "1px",
                                            }}
                                        />
                                        {x}
                                    </Box>
                                ))}
                            </Card>
                        </Box>
                    </Section>
                </Box>
            </Box>
        </Box>
    );
}
