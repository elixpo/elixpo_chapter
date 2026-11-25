"use client";

/**
 * Dashboard chrome — research.elixpo "paper & ink" look with a Cloudflare-style
 * layout: a floating pill header holding the service switcher, and a left rail
 * that shows account navigation, or per-service navigation once a service
 * (blogs.elixpo.com, …) is selected — like Cloudflare's account vs zone views.
 */

import { C, eyebrow } from "@/components/ui";
import type { Service } from "@/lib/services";
import {
    AccountTree,
    Bolt,
    Cached,
    Check,
    CreditCard,
    Dns,
    ExpandMore,
    Functions,
    Groups,
    History,
    Hub,
    Insights,
    Inventory2,
    Launch,
    Logout,
    MedicalServices,
    MenuBook,
    Menu as MenuIcon,
    OpenInNew,
    Public,
    Queue,
    Search,
    Security,
    Settings as SettingsIcon,
    Speed,
    Storage,
    Timeline,
    ViewList,
    VpnKey,
    Widgets,
} from "@mui/icons-material";
import {
    Box,
    Divider,
    Drawer,
    IconButton,
    InputBase,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    Typography,
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type React from "react";
import { Suspense, useMemo, useState } from "react";

const theme = createTheme({
    palette: {
        mode: "light",
        primary: { main: C.blue },
        secondary: { main: C.green },
        error: { main: C.error },
        warning: { main: C.warn },
        success: { main: C.success },
        background: { default: C.paper, paper: C.panel },
        text: { primary: C.text, secondary: C.textMuted },
        divider: C.border,
    },
    shape: { borderRadius: 12 },
    typography: {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 13,
        button: { textTransform: "none", fontWeight: 700 },
    },
    components: {
        MuiCard: {
            styleOverrides: {
                root: { backgroundImage: "none", boxShadow: "none" },
            },
        },
        MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
        MuiButton: {
            styleOverrides: { root: { borderRadius: 999, boxShadow: "none" } },
        },
        MuiTooltip: {
            styleOverrides: {
                tooltip: {
                    background: C.ink,
                    fontSize: "0.72rem",
                    borderRadius: 8,
                },
            },
        },
    },
});

type NavItem = {
    label: string;
    icon: typeof Speed;
    href: string;
    /** For service tabs: the ?tab= value. */
    tab?: string;
};

const accountNav: { group: string; items: NavItem[] }[] = [
    {
        group: "Account",
        items: [
            { label: "Overview", icon: Speed, href: "/dashboard" },
            {
                label: "Diagnostics",
                icon: MedicalServices,
                href: "/dashboard/diagnostics",
            },
            { label: "Services", icon: Widgets, href: "/dashboard/services" },
            {
                label: "Product insights",
                icon: Groups,
                href: "/dashboard/insights",
            },
            { label: "Traffic", icon: Public, href: "/dashboard/traffic" },
        ],
    },
    {
        group: "Compute",
        items: [
            {
                label: "Pages projects",
                icon: Inventory2,
                href: "/dashboard/projects",
            },
            { label: "Workers", icon: Bolt, href: "/dashboard/workers" },
            {
                label: "Workflows",
                icon: AccountTree,
                href: "/dashboard/workflows",
            },
            {
                label: "Durable Objects",
                icon: Hub,
                href: "/dashboard/durable-objects",
            },
        ],
    },
    {
        group: "Storage",
        items: [
            { label: "D1", icon: Storage, href: "/dashboard/d1" },
            { label: "KV", icon: ViewList, href: "/dashboard/kv" },
            { label: "Queues", icon: Queue, href: "/dashboard/queues" },
        ],
    },
    {
        group: "Network",
        items: [{ label: "DNS", icon: Dns, href: "/dashboard/dns" }],
    },
    {
        group: "Admin",
        items: [
            { label: "Audit log", icon: History, href: "/dashboard/audit" },
            {
                label: "Settings",
                icon: SettingsIcon,
                href: "/dashboard/settings",
            },
        ],
    },
];

/** Per-service sections — the Cloudflare zone sidebar, scoped to one host. */
export const SERVICE_TABS: {
    tab: string;
    label: string;
    icon: typeof Speed;
}[] = [
    { tab: "overview", label: "Overview", icon: Speed },
    { tab: "analytics", label: "Analytics", icon: Insights },
    { tab: "status", label: "Status codes", icon: MedicalServices },
    { tab: "performance", label: "Performance", icon: Timeline },
    { tab: "cache", label: "Caching", icon: Cached },
    { tab: "security", label: "Security", icon: Security },
    { tab: "functions", label: "Functions", icon: Functions },
    { tab: "dns", label: "DNS & routing", icon: Dns },
];

export interface ChromeUser {
    email: string;
    name?: string;
    avatar?: string | null;
}

const SERVICE_PREFIX = "/dashboard/services/";

function serviceHref(base: string, tab: string, range: string): string {
    const p = new URLSearchParams();
    if (tab && tab !== "overview") p.set("tab", tab);
    if (range) p.set("range", range);
    const q = p.toString();
    return q ? `${base}?${q}` : base;
}

function currentHost(pathname: string): string | null {
    if (!pathname.startsWith(SERVICE_PREFIX)) return null;
    const rest = pathname.slice(SERVICE_PREFIX.length).split("/")[0];
    return rest ? decodeURIComponent(rest) : null;
}

export default function DashboardChrome(props: {
    user: ChromeUser;
    services: Service[];
    children: React.ReactNode;
}) {
    // useSearchParams needs a Suspense boundary under the App Router.
    return (
        <ThemeProvider theme={theme}>
            <Suspense fallback={<Shell {...props} tab="overview" range="" />}>
                <ShellWithTab {...props} />
            </Suspense>
        </ThemeProvider>
    );
}

function ShellWithTab(props: {
    user: ChromeUser;
    services: Service[];
    children: React.ReactNode;
}) {
    const params = useSearchParams();
    return (
        <Shell
            {...props}
            tab={params.get("tab") || "overview"}
            range={params.get("range") || ""}
        />
    );
}

function Shell({
    user,
    services,
    children,
    tab,
    range,
}: {
    user: ChromeUser;
    services: Service[];
    children: React.ReactNode;
    tab: string;
    /** Current ?range= — carried across service tabs and service switches. */
    range: string;
}) {
    const pathname = usePathname();
    const [drawer, setDrawer] = useState(false);
    const host = currentHost(pathname);
    const service = host ? services.find((s) => s.host === host) : undefined;

    const sidebar = (
        <SideNav
            pathname={pathname}
            host={host}
            service={service}
            tab={tab}
            range={range}
            onNavigate={() => setDrawer(false)}
        />
    );

    return (
        <Box sx={{ minHeight: "100vh", bgcolor: C.paper, color: C.text }}>
            {/* ---------------------------------------------------- pill header */}
            <Box
                component="header"
                sx={{
                    position: "sticky",
                    zIndex: 30,
                    top: { xs: 8, md: 14 },
                    width: "min(calc(100% - 1.25rem), 1640px)",
                    mx: "auto",
                    mt: { xs: 1, md: "14px" },
                    minHeight: { xs: 58, md: 64 },
                    px: { xs: 1, md: 1.5 },
                    pl: { md: 2.25 },
                    display: "flex",
                    alignItems: "center",
                    gap: { xs: 0.75, md: 1.5 },
                    border: "1px solid rgba(20,32,24,.14)",
                    borderRadius: "999px",
                    bgcolor: "rgba(251,251,248,.9)",
                    boxShadow: "0 18px 48px rgba(20,32,24,.09)",
                    backdropFilter: "blur(18px)",
                }}
            >
                <IconButton
                    onClick={() => setDrawer(true)}
                    aria-label="Open navigation"
                    sx={{
                        display: { xs: "inline-flex", md: "none" },
                        color: C.text,
                    }}
                >
                    <MenuIcon />
                </IconButton>

                <Box
                    component={Link}
                    href="/dashboard"
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        textDecoration: "none",
                        color: C.text,
                        flexShrink: 0,
                    }}
                >
                    <Box
                        component="img"
                        src="/icon.png"
                        alt=""
                        sx={{ width: 32, height: 32, objectFit: "contain" }}
                    />
                    <Box
                        sx={{
                            display: { xs: "none", sm: "flex" },
                            alignItems: "baseline",
                            gap: 0.6,
                        }}
                    >
                        <Typography sx={{ fontWeight: 700, fontSize: "1rem" }}>
                            Elixpo
                        </Typography>
                        <Typography
                            sx={{ color: C.textMuted, fontSize: "0.72rem" }}
                        >
                            Admin
                        </Typography>
                    </Box>
                </Box>

                <Box
                    sx={{
                        width: "1px",
                        height: 26,
                        bgcolor: C.border,
                        display: { xs: "none", sm: "block" },
                    }}
                />

                <ServiceSwitcher
                    services={services}
                    host={host}
                    tab={tab}
                    range={range}
                />

                <Box sx={{ flexGrow: 1 }} />

                <Box
                    component="a"
                    href="https://dash.cloudflare.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                        display: { xs: "none", lg: "inline-flex" },
                        alignItems: "center",
                        gap: 0.6,
                        fontSize: "0.75rem",
                        fontWeight: 650,
                        color: C.text,
                        textDecoration: "none",
                        px: 1.25,
                        "&:hover": { opacity: 0.55 },
                    }}
                >
                    Cloudflare <OpenInNew sx={{ fontSize: "0.85rem" }} />
                </Box>
                <Box
                    component="a"
                    href="https://status.elixpo.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                        display: { xs: "none", lg: "inline-flex" },
                        alignItems: "center",
                        gap: 0.6,
                        fontSize: "0.75rem",
                        fontWeight: 650,
                        color: C.text,
                        textDecoration: "none",
                        px: 1.25,
                        "&:hover": { opacity: 0.55 },
                    }}
                >
                    Status page <OpenInNew sx={{ fontSize: "0.85rem" }} />
                </Box>

                <ProfileMenu user={user} />
            </Box>

            {/* ------------------------------------------------------ body grid */}
            <Box
                sx={{
                    width: "min(calc(100% - 1.25rem), 1640px)",
                    mx: "auto",
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "232px 1fr" },
                    gap: { md: 3 },
                    pt: { xs: 2, md: 3 },
                    pb: 8,
                }}
            >
                <Box
                    component="nav"
                    aria-label="Dashboard navigation"
                    sx={{
                        display: { xs: "none", md: "block" },
                        position: "sticky",
                        top: 100,
                        alignSelf: "start",
                        maxHeight: "calc(100vh - 120px)",
                        overflowY: "auto",
                    }}
                >
                    {sidebar}
                </Box>
                <Box component="main" sx={{ minWidth: 0 }}>
                    {children}
                </Box>
            </Box>

            <Drawer
                anchor="left"
                open={drawer}
                onClose={() => setDrawer(false)}
                slotProps={{
                    paper: {
                        sx: {
                            width: 280,
                            bgcolor: C.paper,
                            borderRight: `1px solid ${C.border}`,
                            p: 1.5,
                        },
                    },
                }}
            >
                {sidebar}
            </Drawer>
        </Box>
    );
}

/* -------------------------------------------------------------- side nav */

function SideNav({
    pathname,
    host,
    service,
    tab,
    range,
    onNavigate,
}: {
    pathname: string;
    host: string | null;
    service?: Service;
    tab: string;
    range: string;
    onNavigate: () => void;
}) {
    const isActive = (href: string) =>
        href === "/dashboard"
            ? pathname === "/dashboard"
            : href === "/dashboard/services"
              ? pathname === "/dashboard/services"
              : pathname.startsWith(href);

    if (host) {
        const base = `${SERVICE_PREFIX}${encodeURIComponent(host)}`;
        return (
            <Box>
                <NavLink
                    href="/dashboard"
                    label="← All services"
                    onClick={onNavigate}
                    muted
                />
                <Box
                    sx={{
                        mt: 1.5,
                        mb: 1.5,
                        p: 1.75,
                        borderRadius: "16px",
                        border: `1px solid ${C.border}`,
                        bgcolor: C.panel,
                    }}
                >
                    <Typography sx={{ ...eyebrow, mb: 0.75 }}>
                        Service
                    </Typography>
                    <Typography
                        sx={{
                            fontWeight: 700,
                            fontSize: "0.95rem",
                            letterSpacing: "-0.02em",
                            wordBreak: "break-all",
                        }}
                    >
                        {host}
                    </Typography>
                    {service && (
                        <Box
                            sx={{
                                display: "flex",
                                gap: 0.5,
                                flexWrap: "wrap",
                                mt: 1,
                            }}
                        >
                            {service.backends.map((b) => (
                                <BackendTag key={b} backend={b} />
                            ))}
                        </Box>
                    )}
                    <Box
                        component="a"
                        href={`https://${host}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                            mt: 1.25,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 0.5,
                            color: C.green,
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            textDecoration: "none",
                        }}
                    >
                        Visit site <Launch sx={{ fontSize: "0.8rem" }} />
                    </Box>
                </Box>
                {SERVICE_TABS.map((t) => (
                    <NavLink
                        key={t.tab}
                        href={serviceHref(base, t.tab, range)}
                        label={t.label}
                        icon={t.icon}
                        active={tab === t.tab}
                        onClick={onNavigate}
                    />
                ))}
                <NavLink
                    href={`/dashboard/insights/${encodeURIComponent(host)}`}
                    label="Audience insights"
                    icon={Groups}
                    onClick={onNavigate}
                />
            </Box>
        );
    }

    return (
        <Box>
            {accountNav.map((g) => (
                <Box key={g.group} sx={{ mb: 2 }}>
                    <Typography
                        sx={{
                            ...eyebrow,
                            color: C.textMuted,
                            px: 1.25,
                            mb: 0.5,
                        }}
                    >
                        {g.group}
                    </Typography>
                    {g.items.map((item) => (
                        <NavLink
                            key={item.href}
                            href={item.href}
                            label={item.label}
                            icon={item.icon}
                            active={isActive(item.href)}
                            onClick={onNavigate}
                        />
                    ))}
                </Box>
            ))}
        </Box>
    );
}

function NavLink({
    href,
    label,
    icon: Icon,
    active,
    muted,
    onClick,
}: {
    href: string;
    label: string;
    icon?: typeof Speed;
    active?: boolean;
    muted?: boolean;
    onClick?: () => void;
}) {
    return (
        <Box
            component={Link}
            href={href}
            onClick={onClick}
            aria-current={active ? "page" : undefined}
            sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.1,
                px: 1.25,
                py: 0.85,
                mb: 0.25,
                borderRadius: "999px",
                textDecoration: "none",
                fontSize: "0.82rem",
                fontWeight: active ? 700 : 600,
                color: active ? "#fff" : muted ? C.textMuted : C.text,
                bgcolor: active ? C.ink : "transparent",
                transition: "background .15s ease",
                "&:hover": { bgcolor: active ? C.ink : C.paperDeep },
            }}
        >
            {Icon && (
                <Icon sx={{ fontSize: "1.05rem", opacity: active ? 1 : 0.7 }} />
            )}
            {label}
        </Box>
    );
}

const BACKEND_LABEL: Record<string, string> = {
    pages: "Pages",
    worker: "Worker",
    route: "Route",
    dns: "DNS",
};

export function BackendTag({ backend }: { backend: string }) {
    return (
        <Box
            component="span"
            sx={{
                fontFamily: C.mono,
                fontSize: "0.6rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                px: 0.75,
                py: 0.2,
                borderRadius: "999px",
                border: `1px solid ${C.border}`,
                color: C.textMuted,
                bgcolor: C.paper,
            }}
        >
            {BACKEND_LABEL[backend] || backend}
        </Box>
    );
}

/* ----------------------------------------------------- service switcher */

type ServiceKind = "sites" | "workers" | "dns";

/** Sites = a Pages project serves it; Workers = a Worker (custom domain or
 * route) serves it with no Pages project; DNS = neither (redirects, wildcard
 * catches, external targets). */
function kindOf(s: Service): ServiceKind {
    if (s.pagesProject) return "sites";
    if (s.workerScript) return "workers";
    return "dns";
}

const KINDS: { key: ServiceKind; label: string; hint: string }[] = [
    { key: "sites", label: "Sites", hint: "Pages projects" },
    { key: "workers", label: "Workers", hint: "Custom domains & routes" },
    { key: "dns", label: "DNS only", hint: "No Pages project or Worker" },
];

function ServiceSwitcher({
    services,
    host,
    tab,
    range,
}: {
    services: Service[];
    host: string | null;
    tab: string;
    range: string;
}) {
    const router = useRouter();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [q, setQ] = useState("");

    const [kind, setKind] = useState<ServiceKind | "all">("all");

    const counts = useMemo(() => {
        const c: Record<ServiceKind, number> = { sites: 0, workers: 0, dns: 0 };
        for (const s of services) c[kindOf(s)]++;
        return c;
    }, [services]);

    const groups = useMemo(() => {
        const needle = q.trim().toLowerCase();
        const filtered = services.filter(
            (s) =>
                (kind === "all" || kindOf(s) === kind) &&
                (!needle ||
                    s.host.includes(needle) ||
                    s.pagesProject?.toLowerCase().includes(needle) ||
                    s.workerScript?.toLowerCase().includes(needle)),
        );
        return KINDS.map(
            (k) => [k, filtered.filter((s) => kindOf(s) === k.key)] as const,
        ).filter(([, list]) => list.length > 0);
    }, [services, q, kind]);

    const go = (h: string | null) => {
        setAnchor(null);
        setQ("");
        setKind("all");
        if (!h)
            return router.push(
                range ? `/dashboard?range=${range}` : "/dashboard",
            );
        router.push(
            serviceHref(
                `${SERVICE_PREFIX}${encodeURIComponent(h)}`,
                tab,
                range,
            ),
        );
    };

    return (
        <>
            <Box
                component="button"
                onClick={(e: React.MouseEvent<HTMLElement>) =>
                    setAnchor(e.currentTarget)
                }
                aria-haspopup="listbox"
                aria-expanded={Boolean(anchor)}
                sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.75,
                    minWidth: 0,
                    maxWidth: { xs: 190, sm: 320 },
                    height: 40,
                    px: 1.5,
                    border: `1px solid ${C.border}`,
                    borderRadius: "999px",
                    bgcolor: C.panel,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    color: C.text,
                    "&:hover": {
                        borderColor: C.borderLight,
                        bgcolor: C.paperDeep,
                    },
                }}
            >
                <Widgets sx={{ fontSize: "1rem", color: C.blue }} />
                <Box
                    component="span"
                    sx={{
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {host || "All services"}
                </Box>
                <ExpandMore sx={{ fontSize: "1.1rem", color: C.textMuted }} />
            </Box>
            <Menu
                anchorEl={anchor}
                open={Boolean(anchor)}
                onClose={() => setAnchor(null)}
                autoFocus={false}
                slotProps={{
                    paper: {
                        sx: {
                            mt: 1,
                            width: 360,
                            maxWidth: "calc(100vw - 24px)",
                            maxHeight: 520,
                            borderRadius: "18px",
                            border: `1px solid ${C.border}`,
                            boxShadow: "0 18px 48px rgba(20,32,24,.14)",
                        },
                    },
                    list: { sx: { py: 0 } },
                }}
            >
                <Box
                    sx={{
                        position: "sticky",
                        top: 0,
                        zIndex: 1,
                        bgcolor: C.panel,
                        p: 1.25,
                        borderBottom: `1px solid ${C.border}`,
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                >
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            px: 1.25,
                            height: 38,
                            borderRadius: "999px",
                            border: `1px solid ${C.border}`,
                            bgcolor: C.paper,
                        }}
                    >
                        <Search sx={{ fontSize: "1rem", color: C.textMuted }} />
                        <InputBase
                            autoFocus
                            placeholder={`Search ${services.length} services`}
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    const first = groups[0]?.[1][0];
                                    if (first) go(first.host);
                                }
                            }}
                            sx={{ flex: 1, fontSize: "0.82rem" }}
                        />
                    </Box>
                </Box>
                <Box
                    role="tablist"
                    aria-label="Service type"
                    sx={{
                        display: "flex",
                        gap: 0.5,
                        p: 0.5,
                        mx: 1.25,
                        mt: 1.25,
                        borderRadius: "999px",
                        border: `1px solid ${C.border}`,
                        bgcolor: C.paper,
                    }}
                >
                    {[
                        {
                            key: "all" as const,
                            label: "All",
                            n: services.length,
                        },
                        ...KINDS.map((k) => ({
                            key: k.key,
                            label: k.label,
                            n: counts[k.key],
                        })),
                    ].map((t) => {
                        const active = kind === t.key;
                        return (
                            <Box
                                key={t.key}
                                component="button"
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => setKind(t.key)}
                                sx={{
                                    flex: 1,
                                    border: "none",
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    py: 0.6,
                                    borderRadius: "999px",
                                    color: active ? "#fff" : C.textDim,
                                    bgcolor: active ? C.ink : "transparent",
                                    whiteSpace: "nowrap",
                                    "&:hover": {
                                        bgcolor: active ? C.ink : C.paperDeep,
                                    },
                                }}
                            >
                                {t.label}{" "}
                                <Box
                                    component="span"
                                    sx={{ fontFamily: C.mono, opacity: 0.7 }}
                                >
                                    {t.n}
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
                <MenuItem
                    selected={!host}
                    onClick={() => go(null)}
                    sx={{ py: 1.1, mx: 0.75, my: 0.5, borderRadius: "12px" }}
                >
                    <ListItemIcon sx={{ minWidth: 30 }}>
                        <Speed fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                        primary="All services"
                        secondary="Account overview"
                        primaryTypographyProps={{
                            fontSize: "0.84rem",
                            fontWeight: 700,
                        }}
                        secondaryTypographyProps={{ fontSize: "0.7rem" }}
                    />
                    {!host && <Check fontSize="small" sx={{ color: C.blue }} />}
                </MenuItem>
                {groups.map(([k, list]) => (
                    <Box key={k.key}>
                        <Typography
                            sx={{
                                ...eyebrow,
                                color: C.textMuted,
                                px: 2,
                                pt: 1.25,
                                pb: 0.5,
                            }}
                        >
                            {k.label} · {list.length}
                            <Box
                                component="span"
                                sx={{
                                    textTransform: "none",
                                    letterSpacing: 0,
                                    fontFamily: "Arial, sans-serif",
                                    fontWeight: 400,
                                    ml: 0.75,
                                }}
                            >
                                {k.hint}
                            </Box>
                        </Typography>
                        {list.map((s) => (
                            <MenuItem
                                key={s.host}
                                selected={s.host === host}
                                onClick={() => go(s.host)}
                                sx={{
                                    py: 0.8,
                                    mx: 0.75,
                                    borderRadius: "12px",
                                    gap: 1,
                                }}
                            >
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography
                                        sx={{
                                            fontSize: "0.83rem",
                                            fontWeight: 650,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                        }}
                                    >
                                        {s.host}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            fontSize: "0.68rem",
                                            color: C.textMuted,
                                        }}
                                    >
                                        {[
                                            s.pagesProject &&
                                                `Pages · ${s.pagesProject}`,
                                            s.workerScript &&
                                                `Worker · ${s.workerScript}`,
                                            !s.pagesProject &&
                                                !s.workerScript &&
                                                s.dnsType &&
                                                `${s.dnsType}${s.proxied ? " · proxied" : ""}${s.dnsTarget ? ` → ${s.dnsTarget}` : ""}`,
                                        ]
                                            .filter(Boolean)
                                            .join("  ·  ")}
                                    </Typography>
                                </Box>
                                {s.host === host && (
                                    <Check
                                        fontSize="small"
                                        sx={{ color: C.blue }}
                                    />
                                )}
                            </MenuItem>
                        ))}
                    </Box>
                ))}
                {groups.length === 0 && (
                    <Typography
                        sx={{ p: 2, fontSize: "0.8rem", color: C.textMuted }}
                    >
                        No services match “{q}”.
                    </Typography>
                )}
                <Divider sx={{ mt: 1 }} />
                <MenuItem
                    component={Link}
                    href="/dashboard/services"
                    onClick={() => setAnchor(null)}
                    sx={{
                        py: 1,
                        fontSize: "0.78rem",
                        color: C.green,
                        fontWeight: 700,
                    }}
                >
                    View all services →
                </MenuItem>
            </Menu>
        </>
    );
}

/* -------------------------------------------------------- profile menu */

function ProfileMenu({ user }: { user: ChromeUser }) {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const close = () => setAnchorEl(null);
    return (
        <>
            <IconButton
                onClick={(e) => setAnchorEl(e.currentTarget)}
                aria-label="Account menu"
                sx={{ p: 0.5 }}
            >
                <Avatar user={user} size={36} />
            </IconButton>
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={close}
                transformOrigin={{ horizontal: "right", vertical: "top" }}
                anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
                slotProps={{
                    paper: {
                        sx: {
                            mt: 1,
                            minWidth: 260,
                            borderRadius: "18px",
                            border: `1px solid ${C.border}`,
                            boxShadow: "0 18px 48px rgba(20,32,24,.14)",
                        },
                    },
                }}
            >
                <Box sx={{ px: 2, py: 1.5 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>
                        {user.name || "Admin"}
                    </Typography>
                    <Typography
                        sx={{ color: C.textMuted, fontSize: "0.78rem" }}
                    >
                        {user.email}
                    </Typography>
                    <Typography sx={{ ...eyebrow, mt: 1 }}>
                        Administrator
                    </Typography>
                </Box>
                <Divider />
                <ProfileLink
                    href="https://dash.cloudflare.com"
                    icon={<Launch fontSize="small" />}
                    label="Cloudflare dashboard"
                    external
                />
                <ProfileLink
                    href="https://accounts.elixpo.com/dashboard"
                    icon={<OpenInNew fontSize="small" />}
                    label="Elixpo Accounts"
                    external
                />
                <ProfileLink
                    href="https://dash.cloudflare.com/?to=/:account/billing"
                    icon={<CreditCard fontSize="small" />}
                    label="Billing & usage"
                    external
                />
                <ProfileLink
                    href="https://dash.cloudflare.com/profile/api-tokens"
                    icon={<VpnKey fontSize="small" />}
                    label="API tokens"
                    external
                />
                <ProfileLink
                    href="https://developers.cloudflare.com"
                    icon={<MenuBook fontSize="small" />}
                    label="Documentation"
                    external
                />
                <ProfileLink
                    href="/dashboard/audit"
                    icon={<History fontSize="small" />}
                    label="Audit log"
                    onClick={close}
                />
                <ProfileLink
                    href="/dashboard/settings"
                    icon={<SettingsIcon fontSize="small" />}
                    label="Settings"
                    onClick={close}
                />
                <Divider />
                <MenuItem
                    component="a"
                    href="/api/auth/logout"
                    sx={{
                        py: 1.1,
                        color: C.textDim,
                        "&:hover": { bgcolor: C.errorBg, color: C.error },
                    }}
                >
                    <ListItemIcon sx={{ color: "inherit", minWidth: 34 }}>
                        <Logout fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                        primaryTypographyProps={{ fontSize: "0.85rem" }}
                    >
                        Log out
                    </ListItemText>
                </MenuItem>
            </Menu>
        </>
    );
}

function ProfileLink({
    href,
    icon,
    label,
    external,
    onClick,
}: {
    href: string;
    icon: React.ReactNode;
    label: string;
    external?: boolean;
    onClick?: () => void;
}) {
    const props = external
        ? {
              component: "a" as const,
              href,
              target: "_blank",
              rel: "noopener noreferrer",
          }
        : { component: Link, href };
    return (
        <MenuItem
            {...props}
            onClick={onClick}
            sx={{
                py: 1,
                color: C.textDim,
                "&:hover": { bgcolor: C.paperDeep, color: C.text },
            }}
        >
            <ListItemIcon sx={{ color: "inherit", minWidth: 34 }}>
                {icon}
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: "0.85rem" }}>
                {label}
            </ListItemText>
        </MenuItem>
    );
}

function Avatar({ user, size }: { user: ChromeUser; size: number }) {
    if (user.avatar) {
        return (
            <Box
                component="img"
                src={user.avatar}
                alt={user.name || user.email}
                referrerPolicy="no-referrer"
                sx={{
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: `1px solid ${C.border}`,
                }}
            />
        );
    }
    return (
        <Box
            sx={{
                width: size,
                height: size,
                borderRadius: "50%",
                bgcolor: C.ink,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "#fff",
            }}
        >
            {user.email?.charAt(0).toUpperCase() || "A"}
        </Box>
    );
}
