/* Public-site chrome (header + footer) shared by / and /denied. Styles live in
 * app/landing.css under the `.lx` scope. */

import Link from "next/link";

export const REPO_URL = "https://github.com/elixpo/admin.elixpo";

export function SiteHeader({
    authed,
    sectionLinks = true,
}: {
    authed?: boolean;
    sectionLinks?: boolean;
}) {
    return (
        <header className="site-header">
            <Link className="brand" href="/">
                <img src="/icon.png" width={34} height={34} alt="" />
                <span>
                    <b>Elixpo</b>
                    <small>Admin</small>
                </span>
            </Link>
            <nav aria-label="Primary navigation">
                {sectionLinks ? (
                    <>
                        <a href="/#watches">What it watches</a>
                        <a href="/#access">Access</a>
                        <a href="/#capabilities">Capabilities</a>
                    </>
                ) : (
                    <Link href="/">Overview</Link>
                )}
                <a href="https://status.elixpo.com">Status ↗</a>
                <a
                    className="portal-link"
                    href={authed ? "/dashboard" : "/api/auth/login"}
                >
                    {authed ? "Open dashboard" : "Sign in"}
                </a>
            </nav>
        </header>
    );
}

export function SiteFooter() {
    return (
        <footer className="lx-footer">
            <div className="footer-brand">
                <img src="/icon.png" width={42} height={42} alt="" />
                <div>
                    <strong>Elixpo Admin</strong>
                    <p>
                        The gated control plane for Elixpo&apos;s Cloudflare
                        account.
                    </p>
                </div>
            </div>
            <nav aria-label="Footer navigation">
                <a href="https://elixpo.com">elixpo.com</a>
                <a href="https://status.elixpo.com">Status</a>
                <a href="https://accounts.elixpo.com">Accounts</a>
                <a href={REPO_URL}>GitHub</a>
            </nav>
        </footer>
    );
}
