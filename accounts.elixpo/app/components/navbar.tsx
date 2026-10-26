"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "./theme-toggle";

const MARKETING_LINKS = [
    { label: "Product", href: "/" },
    { label: "Pricing", href: "/pricing" },
    { label: "Docs", href: "/docs" },
    { label: "SDK", href: "/docs/lixaccounts" },
    { label: "About", href: "/about" },
];

const APP_LINKS = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "OAuth apps", href: "/dashboard/oauth-apps" },
    { label: "Services", href: "/dashboard/services" },
    { label: "Webhooks", href: "/dashboard/webhooks" },
    { label: "Docs", href: "/docs" },
];

function Brand({ onClick }: { onClick?: () => void }) {
    return (
        <Link
            href="/"
            onClick={onClick}
            className="flex items-center gap-3 min-w-0"
            aria-label="Elixpo Accounts home"
        >
            <img
                src="/LOGO/logo.png"
                alt=""
                width={34}
                height={34}
                className="h-[34px] w-[34px] object-contain"
            />
            <span className="flex items-baseline gap-[0.45rem]">
                <b className="text-base text-[var(--fg)]">Elixpo</b>
                <small className="text-[0.72rem] text-[var(--muted)]">
                    Accounts
                </small>
            </span>
        </Link>
    );
}

export default function Navbar() {
    const [me, setMe] = useState<any>(undefined);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const pathname = usePathname();

    useEffect(() => {
        let cancelled = false;
        fetch("/api/auth/me", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d: any) => {
                if (cancelled) return;
                setMe(d?.email ? d : null);
            })
            .catch(() => {
                if (!cancelled) setMe(null);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const authed = !!me?.email;
    const links = authed ? APP_LINKS : MARKETING_LINKS;
    const close = () => setIsMobileMenuOpen(false);

    return (
        <header className="site-header text-[var(--fg)] font-body">
            <Brand />

            <nav
                aria-label="Primary navigation"
                className="hidden md:flex items-center gap-7 text-[0.78rem] font-[650]"
            >
                {links.map((link) => (
                    <Link
                        key={link.label}
                        href={link.href}
                        aria-current={
                            pathname === link.href ? "page" : undefined
                        }
                        className="transition-opacity hover:opacity-55 aria-[current=page]:text-[var(--blue)]"
                    >
                        {link.label}
                    </Link>
                ))}
            </nav>

            <div className="hidden md:flex items-center gap-2">
                <ThemeToggle size={16} />
                {me === undefined ? (
                    <div className="h-[46px] w-[132px]" />
                ) : authed ? (
                    <Link
                        href="/dashboard/profile"
                        className="pill-btn pill-btn-solid"
                    >
                        My account
                    </Link>
                ) : (
                    <>
                        <Link
                            href="/login"
                            className="px-3 text-[0.78rem] font-[650] hover:opacity-55 transition-opacity"
                        >
                            Sign in
                        </Link>
                        <Link
                            href="/register"
                            className="pill-btn pill-btn-solid"
                        >
                            Get started
                        </Link>
                    </>
                )}
            </div>

            <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className="md:hidden grid h-11 w-11 place-items-center rounded-full bg-[var(--cta-bg)] text-[var(--cta-fg)]"
                aria-label="Open menu"
                aria-expanded={isMobileMenuOpen}
            >
                <Menu className="w-5 h-5" />
            </button>

            <AnimatePresence>
                {isMobileMenuOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={close}
                            className="fixed inset-0 bg-[#142018]/35 backdrop-blur-[4px] z-50"
                        />
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-label="Menu"
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{
                                ease: [0.22, 1, 0.36, 1] as const,
                                duration: 0.45,
                            }}
                            className="fixed right-0 top-0 w-[min(88vw,360px)] h-[100dvh] bg-[var(--bg)] border-l border-[var(--border)] z-50 flex flex-col p-6 text-[var(--fg)]"
                        >
                            <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
                                <Brand onClick={close} />
                                <button
                                    type="button"
                                    onClick={close}
                                    className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border)]"
                                    aria-label="Close menu"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <p className="eyebrow mt-8">Navigate</p>
                            <div className="flex-1 flex flex-col">
                                {links.map((link, i) => (
                                    <motion.div
                                        key={link.label}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{
                                            delay: 0.12 + i * 0.05,
                                            ease: [0.22, 1, 0.36, 1] as const,
                                            duration: 0.4,
                                        }}
                                    >
                                        <Link
                                            href={link.href}
                                            onClick={close}
                                            className="flex items-center justify-between py-4 border-b border-[var(--border)] text-2xl font-semibold tracking-[-0.04em]"
                                        >
                                            {link.label}
                                            <span aria-hidden>→</span>
                                        </Link>
                                    </motion.div>
                                ))}
                            </div>

                            <div className="pt-6 flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-[var(--muted)]">
                                        Theme
                                    </span>
                                    <ThemeToggle size={16} />
                                </div>
                                {me === undefined ? null : authed ? (
                                    <Link
                                        href="/dashboard/profile"
                                        onClick={close}
                                        className="pill-btn pill-btn-solid w-full"
                                    >
                                        My account
                                    </Link>
                                ) : (
                                    <>
                                        <Link
                                            href="/register"
                                            onClick={close}
                                            className="pill-btn pill-btn-solid w-full"
                                        >
                                            Get started
                                        </Link>
                                        <Link
                                            href="/login"
                                            onClick={close}
                                            className="pill-btn w-full"
                                        >
                                            Sign in
                                        </Link>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </header>
    );
}
