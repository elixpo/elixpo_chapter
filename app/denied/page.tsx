import "../landing.css";
import {
    REPO_URL,
    SiteFooter,
    SiteHeader,
} from "@/components/landing/site-chrome";
import type { Metadata } from "next";
import Link from "next/link";

export const runtime = "edge";

export const metadata: Metadata = { title: "Access denied" };

const REASONS: Record<string, { label: string; text: string }> = {
    not_admin: {
        label: "Not an admin",
        text: "Your Elixpo account isn't marked as an admin yet. Request access below and an existing admin will review it.",
    },
    bad_state: {
        label: "Request expired",
        text: "The sign-in request expired or was tampered with. Please try again.",
    },
    exchange_failed: {
        label: "Sign-in failed",
        text: "We couldn't complete sign-in with Elixpo Accounts. Please try again.",
    },
    no_profile: {
        label: "No profile",
        text: "We couldn't read your Elixpo profile. Please try again.",
    },
    access_denied: {
        label: "Declined",
        text: "You declined the sign-in request.",
    },
};

const issueUrl = () => {
    const title = "Admin access request — admin.elixpo";
    const body = [
        "### Admin access request",
        "",
        "**Elixpo account email:** <your email>",
        "**Why you need access:** <short reason>",
        "**Which areas:** <e.g. traffic, D1, payouts>",
        "",
        "_Submitted from admin.elixpo/denied._",
    ].join("\n");
    return `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=access-request`;
};

export default async function Denied({
    searchParams,
}: {
    searchParams: Promise<{ reason?: string }>;
}) {
    const { reason } = await searchParams;
    const known = reason ? REASONS[reason] : undefined;
    const message =
        known?.text ?? "You don't have access to the Elixpo Admin console.";
    const notAdmin = !reason || reason === "not_admin";

    return (
        <div className="lx">
            <SiteHeader sectionLinks={false} />
            <main className="record-page">
                <Link className="back" href="/">
                    ← Back to Elixpo Admin
                </Link>
                <div className="record-geometry" aria-hidden="true">
                    <div className="record-geometry-label">
                        <span>Access record · 403</span>
                        <b>403</b>
                    </div>
                    <i className="geometry-ring" />
                    <i className="geometry-disc" />
                    <i className="geometry-pill" />
                    <i className="geometry-tile" />
                    <i className="geometry-axis" />
                    <i className="geometry-node" />
                </div>

                <section className="record-hero">
                    <div className="record-heading">
                        <p className="eyebrow">Access denied</p>
                        <h1>
                            This console is for <em>admins only.</em>
                        </h1>
                        <div className="record-abstract">
                            <h2>What happened</h2>
                            <p>{message}</p>
                        </div>
                    </div>
                    <aside className="record-summary">
                        <dl>
                            <div>
                                <dt>Result</dt>
                                <dd className="bad">Not signed in</dd>
                            </div>
                            <div>
                                <dt>Reason</dt>
                                <dd>
                                    {known?.label ?? "No admin access"}
                                    {reason ? (
                                        <>
                                            <br />
                                            <code>{reason}</code>
                                        </>
                                    ) : null}
                                </dd>
                            </div>
                            <div>
                                <dt>Identity</dt>
                                <dd>accounts.elixpo.com</dd>
                            </div>
                            <div>
                                <dt>Required</dt>
                                <dd>Admin role</dd>
                            </div>
                        </dl>
                    </aside>
                </section>

                <section className="record-grid">
                    <article>
                        <p className="eyebrow">Next steps</p>
                        <h2>
                            {notAdmin
                                ? "Ask for access, or switch accounts."
                                : "Try signing in again."}
                        </h2>
                        <p>
                            Elixpo Admin only issues a session to Elixpo
                            accounts that carry the admin role. No session was
                            created for this attempt, and nothing about your
                            account was changed.
                        </p>
                        <ul>
                            <li>
                                Request access
                                <span>
                                    Opens a pre-filled GitHub issue an admin
                                    will review
                                </span>
                            </li>
                            <li>
                                Different account
                                <span>
                                    Signs out here, then start sign-in again
                                    with another Elixpo account
                                </span>
                            </li>
                            <li>
                                Public status
                                <span>
                                    status.elixpo.com is open to everyone
                                </span>
                            </li>
                        </ul>
                    </article>
                    <aside className="released-material">
                        <p className="eyebrow">Actions</p>
                        <div className="actions" style={{ margin: "0 0 1rem" }}>
                            <a href="/api/auth/login">Try again</a>
                            <a href="/api/auth/logout">
                                Sign in with a different account
                            </a>
                        </div>
                        <a
                            className="primary"
                            href={issueUrl()}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Request admin access ↗
                            <span>Pre-filled issue on elixpo/admin.elixpo</span>
                        </a>
                        <a href="https://status.elixpo.com">
                            Public status page ↗
                            <span>Live health for every Elixpo service</span>
                        </a>
                        <a href="https://elixpo.com">
                            Back to elixpo.com ↗
                            <span>The Elixpo suite home page</span>
                        </a>
                    </aside>
                </section>
            </main>
            <SiteFooter />
        </div>
    );
}
