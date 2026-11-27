"use client";

import CloseIcon from "@mui/icons-material/Close";
import GitHubIcon from "@mui/icons-material/GitHub";
import MenuIcon from "@mui/icons-material/Menu";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-mode";

interface Me {
    name: string;
    avatar: string | null;
}

const REPO = "elixpo/payouts.elixpo";
const REPO_URL = `https://github.com/${REPO}`;

const LINKS = [
    { label: "Platform", href: "/about" },
    { label: "Pricing", href: "/pricing" },
    { label: "Docs", href: "/docs" },
    { label: "Quickstart", href: "/docs/quickstart" },
    { label: "Trust", href: "/trust" },
];

function formatStars(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Floating pill header — the shared Elixpo editorial header. */
export default function Navbar() {
    const pathname = usePathname();
    const [stars, setStars] = useState<number | null>(null);
    const [me, setMe] = useState<Me | null | undefined>(undefined);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/auth/me", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d: any) => {
                if (!cancelled) {
                    setMe(d?.uid ? { name: d.name || d.email || "", avatar: d.avatar || null } : null);
                }
            })
            .catch(() => !cancelled && setMe(null));
        fetch(`https://api.github.com/repos/${REPO}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d: any) => {
                if (!cancelled && typeof d?.stargazers_count === "number") setStars(d.stargazers_count);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    // Close the mobile menu on navigation.
    // biome-ignore lint/correctness/useExhaustiveDependencies: run on route change
    useEffect(() => setOpen(false), [pathname]);

    const isActive = (href: string) =>
        href === "/docs"
            ? pathname.startsWith("/docs") && !pathname.startsWith("/docs/quickstart")
            : pathname === href || pathname.startsWith(`${href}/`);

    const account =
        me === undefined ? null : me ? (
            <Link className="pill-link" href="/dashboard">
                {me.avatar ? (
                    // biome-ignore lint/performance/noImgElement: tiny remote avatar
                    <img
                        src={me.avatar}
                        alt=""
                        width={22}
                        height={22}
                        style={{ borderRadius: "50%", margin: "-4px 0 -4px -6px" }}
                        referrerPolicy="no-referrer"
                    />
                ) : null}
                Dashboard ↗
            </Link>
        ) : (
            <Link className="pill-link" href="/login">
                Sign in ↗
            </Link>
        );

    return (
        <>
            <header className="site-header">
                <Link className="brand" href="/" aria-label="Elixpo Pay home">
                    {/* biome-ignore lint/performance/noImgElement: static brand mark */}
                    <img src="/icon.png" alt="" width={32} height={32} />
                    <span>
                        <b>Elixpo</b>
                        <small>Pay</small>
                    </span>
                </Link>

                <nav className="primary-nav" aria-label="Primary navigation">
                    {LINKS.map((l) => (
                        <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined}>
                            {l.label}
                        </Link>
                    ))}
                </nav>

                <div className="header-actions">
                    <a
                        className="pill-link ghost gh-stars"
                        href={REPO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={stars != null ? `GitHub repository, ${stars} stars` : "GitHub repository"}
                    >
                        <GitHubIcon sx={{ fontSize: 16 }} />
                        {stars != null ? `★ ${formatStars(stars)}` : "GitHub"}
                    </a>
                    <ThemeToggle />
                    {account}
                    <button
                        type="button"
                        className="menu-toggle"
                        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
                        aria-expanded={open}
                        aria-controls="mobile-menu"
                        onClick={() => setOpen((o) => !o)}
                    >
                        {open ? <CloseIcon fontSize="small" /> : <MenuIcon fontSize="small" />}
                    </button>
                </div>
            </header>

            <nav id="mobile-menu" className="mobile-menu" data-open={open} aria-label="Mobile navigation">
                {LINKS.map((l) => (
                    <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined}>
                        {l.label}
                    </Link>
                ))}
                <Link href="/dashboard">Dashboard</Link>
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                    GitHub{stars != null ? ` · ★ ${formatStars(stars)}` : ""}
                </a>
            </nav>
        </>
    );
}
