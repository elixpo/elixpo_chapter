"use client";

import {
    Apps,
    DarkModeOutlined,
    DevicesOther,
    LightModeOutlined,
    Logout,
    MenuBook,
    Person,
    PersonAddAlt,
    Receipt,
    Security,
    SwapHoriz,
    Webhook,
} from "@mui/icons-material";
import {
    AppBar,
    Box,
    CircularProgress,
    Divider,
    IconButton,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    Toolbar,
    Typography,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import BackgroundAurora from "../components/background-aurora";
import { makeMuiTheme } from "../components/mui-theme";
import { useTheme as useAppTheme } from "../components/theme-provider";

interface DashboardLayoutProps {
    children: React.ReactNode;
}

type SavedAccount = {
    id: string;
    email: string;
    displayName: string | null;
};

type AccountsResponse = {
    activeUserId: string | null;
    accounts: SavedAccount[];
};

const navItems = [
    { label: "OAuth Apps", icon: Apps, href: "/dashboard/oauth-apps" },
    { label: "Services", icon: DevicesOther, href: "/dashboard/services" },
    { label: "Profile", icon: Person, href: "/dashboard/profile" },
    { label: "Webhooks", icon: Webhook, href: "/dashboard/webhooks" },
];

export default function DashboardShell({ children }: DashboardLayoutProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [userEmail, setUserEmail] = useState<string>("");
    const [displayName, setDisplayName] = useState<string>("");
    const [userAvatar, setUserAvatar] = useState<string | null>(null);
    const [activeUserId, setActiveUserId] = useState<string>("");
    const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
    const [authChecked, setAuthChecked] = useState(false);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const { theme: appTheme, toggle: toggleAppTheme } = useAppTheme();
    const muiTheme = useMemo(() => makeMuiTheme(appTheme), [appTheme]);

    // Auth check. Uses window.location for redirects so router isn't
    // referenced inside the effect body — that way eslint-react-hooks can't
    // autofix `router` into the deps array (which loops because useRouter
    // returns a new ref on every render under Next 15.2 + React 19).
    useEffect(() => {
        fetch("/api/auth/me", { credentials: "include" })
            .then((res) => {
                if (res.ok) return res.json();
                window.location.assign("/login");
                return null;
            })
            .then((data: any) => {
                if (!data) return;
                if (!data.username) {
                    window.location.replace("/setup-name");
                    return;
                }
                // 2FA hard wall: users with ≥3 OAuth apps must have MFA
                // enabled to keep using the dashboard. `mfa_setup_required`
                // is set server-side in /api/auth/me. /dashboard/security
                // is the ONE page allowed past the wall — that's where
                // they enroll a factor and flip the flag. Without this
                // exception we'd infinite-loop the redirect.
                if (
                    data.mfa_setup_required &&
                    pathname !== "/dashboard/security"
                ) {
                    window.location.replace("/mfa/setup-required");
                    return;
                }
                if (data.email) setUserEmail(data.email);
                if (data.displayName) setDisplayName(data.displayName);
                if (data.avatar) setUserAvatar(data.avatar);
                fetch("/api/auth/accounts", {
                    credentials: "include",
                    cache: "no-store",
                })
                    .then(async (response) =>
                        response.ok
                            ? ((await response.json()) as AccountsResponse)
                            : null,
                    )
                    .then((accountData) => {
                        if (!accountData) return;
                        setActiveUserId(accountData.activeUserId || "");
                        setSavedAccounts(accountData.accounts);
                    })
                    .catch(() => {});
                setAuthChecked(true);
            })
            .catch(() => {
                window.location.assign("/login");
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    const handleLogout = async () => {
        setAnchorEl(null);
        try {
            await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "include",
            });
        } catch {
            // silent
        }
        router.push("/");
    };

    const handleSwitchAccount = async (userId: string) => {
        setAnchorEl(null);
        const response = await fetch("/api/auth/accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ userId }),
        });
        if (response.ok) window.location.reload();
    };

    const isActive = (href: string) => pathname.startsWith(href);

    if (!authChecked) {
        return (
            <Box
                sx={{
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "var(--bg)",
                }}
            >
                <CircularProgress sx={{ color: "var(--accent)" }} />
            </Box>
        );
    }

    return (
        <ThemeProvider theme={muiTheme}>
            <Box sx={{ position: "relative", minHeight: "100vh" }}>
                <BackgroundAurora variant="default" />
                <Box sx={{ position: "relative", zIndex: 1 }}>
                    {/* Top Navbar */}
                    <AppBar
                        position="sticky"
                        elevation={0}
                        sx={{
                            top: { xs: 8, md: 14 },
                            width: "min(calc(100% - 2rem), 1510px)",
                            mx: "auto",
                            mt: { xs: 1, md: "14px" },
                            bgcolor: "var(--header-bg)",
                            backdropFilter: "blur(18px)",
                            border: "1px solid var(--header-border)",
                            borderRadius: "999px",
                            boxShadow: "0 18px 48px rgba(20,32,24,.09)",
                            color: "var(--fg)",
                        }}
                    >
                        <Toolbar
                            sx={{
                                width: "100%",
                                minHeight: { xs: 60, md: 68 },
                                pl: { xs: 1.75, md: 2.25 },
                                pr: { xs: 1, md: 1.25 },
                            }}
                        >
                            {/* Logo + Brand */}
                            <Box
                                component={Link}
                                href="/dashboard/oauth-apps"
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.5,
                                    textDecoration: "none",
                                    mr: 4,
                                    flexShrink: 0,
                                }}
                            >
                                <Box
                                    component="img"
                                    src="/LOGO/logo.png"
                                    alt="Elixpo"
                                    sx={{
                                        height: 34,
                                        width: 34,
                                        objectFit: "contain",
                                    }}
                                />
                                <Box
                                    component="span"
                                    sx={{
                                        display: { xs: "none", sm: "flex" },
                                        alignItems: "baseline",
                                        gap: "0.45rem",
                                    }}
                                >
                                    <Box
                                        component="b"
                                        sx={{
                                            fontSize: "1rem",
                                            color: "var(--fg)",
                                        }}
                                    >
                                        Elixpo
                                    </Box>
                                    <Box
                                        component="small"
                                        sx={{
                                            fontSize: "0.72rem",
                                            color: "var(--muted)",
                                        }}
                                    >
                                        Accounts
                                    </Box>
                                </Box>
                            </Box>
                            {/* Spacer */}

                            <Box sx={{ flexGrow: 1 }} />
                            {/* Nav Icons (right side) */}

                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 0.5,
                                    mr: 1,
                                }}
                            >
                                {navItems.map((item) => (
                                    <IconButton
                                        key={item.href}
                                        component={Link}
                                        href={item.href}
                                        title={item.label}
                                        sx={{
                                            color: isActive(item.href)
                                                ? "var(--cta-fg)"
                                                : "var(--fg-muted)",
                                            bgcolor: isActive(item.href)
                                                ? "var(--cta-bg)"
                                                : "transparent",
                                            borderRadius: "999px",
                                            width: { xs: 38, lg: "auto" },
                                            height: 38,
                                            px: { xs: 0, lg: 1.25 },
                                            gap: { xs: 0, lg: 0.75 },
                                            transition: "all 0.2s ease",
                                            "&:hover": {
                                                bgcolor: isActive(item.href)
                                                    ? "var(--cta-bg)"
                                                    : "var(--overlay)",
                                                color: isActive(item.href)
                                                    ? "var(--cta-fg)"
                                                    : "var(--fg)",
                                            },
                                        }}
                                    >
                                        <item.icon
                                            sx={{ fontSize: "1.25rem" }}
                                        />
                                        <Typography
                                            component="span"
                                            sx={{
                                                display: {
                                                    xs: "none",
                                                    lg: "inline",
                                                },
                                                fontSize: "0.82rem",
                                                fontWeight: 650,
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {item.label}
                                        </Typography>
                                    </IconButton>
                                ))}
                            </Box>
                            {/* User profile — name + email CTA (GitHub lives in the footer) */}
                            <Box
                                component="button"
                                onClick={(e) => setAnchorEl(e.currentTarget)}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                    cursor: "pointer",
                                    background: "transparent",
                                    border: "1px solid var(--border)",
                                    borderRadius: "999px",
                                    pl: 0.6,
                                    pr: { xs: 0.6, sm: 1.1 },
                                    py: 0.5,
                                    color: "inherit",
                                    font: "inherit",
                                    transition: "all 0.15s ease",
                                    "&:hover": {
                                        borderColor: "rgba(58,101,199,0.4)",
                                        bgcolor: "rgba(58,101,199,0.06)",
                                    },
                                }}
                            >
                                {userAvatar ? (
                                    <Box
                                        component="img"
                                        src={userAvatar}
                                        alt="Avatar"
                                        sx={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: "50%",
                                            border: "2px solid rgba(58, 101, 199,0.3)",
                                            flexShrink: 0,
                                        }}
                                    />
                                ) : (
                                    <Box
                                        sx={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: "50%",
                                            background: "#3a65c7",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: "0.9rem",
                                            fontWeight: 700,
                                            color: "#fff",
                                            flexShrink: 0,
                                        }}
                                    >
                                        {(displayName || userEmail)
                                            ?.charAt(0)
                                            .toUpperCase() || "E"}
                                    </Box>
                                )}
                                <Box
                                    sx={{
                                        display: { xs: "none", sm: "flex" },
                                        flexDirection: "column",
                                        alignItems: "flex-start",
                                        lineHeight: 1.15,
                                        minWidth: 0,
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            fontSize: "0.82rem",
                                            fontWeight: 600,
                                            color: "var(--fg)",
                                            maxWidth: 160,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {displayName || userEmail || "Account"}
                                    </Typography>
                                    {userEmail && (
                                        <Typography
                                            sx={{
                                                fontSize: "0.7rem",
                                                color: "var(--fg-faint)",
                                                maxWidth: 160,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {userEmail}
                                        </Typography>
                                    )}
                                </Box>
                            </Box>

                            <Menu
                                anchorEl={anchorEl}
                                open={Boolean(anchorEl)}
                                onClose={() => setAnchorEl(null)}
                                transformOrigin={{
                                    horizontal: "right",
                                    vertical: "top",
                                }}
                                anchorOrigin={{
                                    horizontal: "right",
                                    vertical: "bottom",
                                }}
                                slotProps={{
                                    paper: {
                                        sx: {
                                            mt: 1,
                                            bgcolor:
                                                appTheme === "dark"
                                                    ? "rgba(22, 32, 26, 0.95)"
                                                    : "rgba(255, 255, 255, 0.95)",
                                            backdropFilter: "blur(16px)",
                                            border: "1px solid var(--border)",
                                            borderRadius: "12px",
                                            minWidth: 220,
                                            boxShadow:
                                                "0 8px 32px var(--overlay)",
                                        },
                                    },
                                }}
                            >
                                <Box sx={{ px: 2, py: 1.5 }}>
                                    <Typography
                                        sx={{
                                            color: "var(--fg)",
                                            fontWeight: 600,
                                            fontSize: "0.9rem",
                                        }}
                                    >
                                        {displayName || "User"}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: "var(--fg-faint)",
                                            fontSize: "0.8rem",
                                        }}
                                    >
                                        {userEmail}
                                    </Typography>
                                </Box>
                                <Divider
                                    sx={{
                                        borderColor: "var(--border)",
                                    }}
                                />
                                {savedAccounts
                                    .filter(
                                        (account) =>
                                            account.id !== activeUserId,
                                    )
                                    .map((account) => (
                                        <MenuItem
                                            key={account.id}
                                            onClick={() =>
                                                handleSwitchAccount(account.id)
                                            }
                                            sx={{
                                                py: 1.1,
                                                color: "var(--fg-muted)",
                                                "&:hover": {
                                                    bgcolor: "var(--overlay)",
                                                    color: "var(--fg)",
                                                },
                                            }}
                                        >
                                            <ListItemIcon
                                                sx={{
                                                    color: "inherit",
                                                    minWidth: 36,
                                                }}
                                            >
                                                <SwapHoriz fontSize="small" />
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={
                                                    account.displayName ||
                                                    account.email
                                                }
                                                secondary={account.email}
                                                primaryTypographyProps={{
                                                    fontSize: "0.875rem",
                                                }}
                                                secondaryTypographyProps={{
                                                    fontSize: "0.72rem",
                                                    color: "var(--fg-faint)",
                                                }}
                                            />
                                        </MenuItem>
                                    ))}
                                <MenuItem
                                    component={Link}
                                    href={`/login?add_account=1&next=${encodeURIComponent(pathname)}`}
                                    onClick={() => setAnchorEl(null)}
                                    sx={{
                                        py: 1.1,
                                        color: "var(--accent)",
                                        "&:hover": {
                                            bgcolor: "rgba(58,101,199,0.08)",
                                        },
                                    }}
                                >
                                    <ListItemIcon
                                        sx={{ color: "inherit", minWidth: 36 }}
                                    >
                                        <PersonAddAlt fontSize="small" />
                                    </ListItemIcon>
                                    <ListItemText
                                        primaryTypographyProps={{
                                            fontSize: "0.875rem",
                                        }}
                                    >
                                        Add another account
                                    </ListItemText>
                                </MenuItem>
                                <Divider
                                    sx={{
                                        borderColor: "var(--border)",
                                    }}
                                />
                                {/* Account group */}
                                {[
                                    {
                                        href: "/dashboard/profile",
                                        icon: <Person fontSize="small" />,
                                        label: "Profile",
                                    },
                                    {
                                        href: "/dashboard/security",
                                        icon: <Security fontSize="small" />,
                                        label: "Security & 2FA",
                                    },
                                    {
                                        href: "/dashboard/subscriptions",
                                        icon: <Receipt fontSize="small" />,
                                        label: "Subscriptions",
                                    },
                                    {
                                        href: "/dashboard/services",
                                        icon: <DevicesOther fontSize="small" />,
                                        label: "Connected services",
                                    },
                                ].map((item) => (
                                    <MenuItem
                                        key={item.href}
                                        component={Link}
                                        href={item.href}
                                        onClick={() => setAnchorEl(null)}
                                        sx={{
                                            py: 1.25,
                                            color: "var(--fg-muted)",
                                            "&:hover": {
                                                bgcolor: "var(--overlay)",
                                                color: "var(--fg)",
                                            },
                                        }}
                                    >
                                        <ListItemIcon
                                            sx={{
                                                color: "inherit",
                                                minWidth: 36,
                                            }}
                                        >
                                            {item.icon}
                                        </ListItemIcon>
                                        <ListItemText
                                            primaryTypographyProps={{
                                                fontSize: "0.875rem",
                                            }}
                                        >
                                            {item.label}
                                        </ListItemText>
                                    </MenuItem>
                                ))}

                                <Divider
                                    sx={{
                                        borderColor: "var(--border)",
                                    }}
                                />

                                {/* Developer group — opens in same tab for
                                    internal pages, new tab for the external
                                    docs link. */}
                                {[
                                    {
                                        href: "/dashboard/oauth-apps",
                                        icon: <Apps fontSize="small" />,
                                        label: "OAuth apps",
                                        external: false,
                                    },
                                    {
                                        href: "/dashboard/webhooks",
                                        icon: <Webhook fontSize="small" />,
                                        label: "Webhooks",
                                        external: false,
                                    },
                                    {
                                        href: "/docs",
                                        icon: <MenuBook fontSize="small" />,
                                        label: "API docs",
                                        external: false,
                                    },
                                ].map((item) => (
                                    <MenuItem
                                        key={item.href}
                                        component={Link}
                                        href={item.href}
                                        onClick={() => setAnchorEl(null)}
                                        sx={{
                                            py: 1.25,
                                            color: "var(--fg-muted)",
                                            "&:hover": {
                                                bgcolor: "var(--overlay)",
                                                color: "var(--fg)",
                                            },
                                        }}
                                    >
                                        <ListItemIcon
                                            sx={{
                                                color: "inherit",
                                                minWidth: 36,
                                            }}
                                        >
                                            {item.icon}
                                        </ListItemIcon>
                                        <ListItemText
                                            primaryTypographyProps={{
                                                fontSize: "0.875rem",
                                            }}
                                        >
                                            {item.label}
                                        </ListItemText>
                                    </MenuItem>
                                ))}

                                <Divider
                                    sx={{
                                        borderColor: "var(--border)",
                                    }}
                                />

                                {/* Light / dark theme preference */}
                                <MenuItem
                                    onClick={toggleAppTheme}
                                    sx={{
                                        py: 1.25,
                                        color: "var(--fg-muted)",
                                        "&:hover": {
                                            bgcolor: "var(--overlay)",
                                            color: "var(--fg)",
                                        },
                                    }}
                                >
                                    <ListItemIcon
                                        sx={{ color: "inherit", minWidth: 36 }}
                                    >
                                        {appTheme === "dark" ? (
                                            <LightModeOutlined fontSize="small" />
                                        ) : (
                                            <DarkModeOutlined fontSize="small" />
                                        )}
                                    </ListItemIcon>
                                    <ListItemText
                                        primaryTypographyProps={{
                                            fontSize: "0.875rem",
                                        }}
                                    >
                                        {appTheme === "dark"
                                            ? "Light mode"
                                            : "Dark mode"}
                                    </ListItemText>
                                </MenuItem>

                                <Divider
                                    sx={{
                                        borderColor: "var(--border)",
                                    }}
                                />

                                <MenuItem
                                    onClick={handleLogout}
                                    sx={{
                                        py: 1.25,
                                        color: "var(--fg-faint)",
                                        "&:hover": {
                                            bgcolor: "rgba(239, 68, 68, 0.08)",
                                            color: "#b91c1c",
                                        },
                                    }}
                                >
                                    <ListItemIcon
                                        sx={{ color: "inherit", minWidth: 36 }}
                                    >
                                        <Logout fontSize="small" />
                                    </ListItemIcon>
                                    <ListItemText
                                        primaryTypographyProps={{
                                            fontSize: "0.875rem",
                                        }}
                                    >
                                        Sign out
                                    </ListItemText>
                                </MenuItem>
                            </Menu>
                        </Toolbar>
                    </AppBar>
                    {/* Page Content */}

                    <Box
                        component="main"
                        sx={{
                            maxWidth: "1400px",
                            mx: "auto",
                            px: { xs: 2, md: 3 },
                            py: 3,
                        }}
                    >
                        {children}
                    </Box>
                </Box>
            </Box>
        </ThemeProvider>
    );
}
