import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "./components/page-shell";

export const metadata: Metadata = {
    title: "Page not found",
    robots: { index: false },
};

/** Custom 404 — editorial, with the Elixpo panda and clear ways forward. */
export default function NotFound() {
    return (
        <PageShell variant="docs">
            <section className="nf">
                <div className="nf-art" aria-hidden>
                    <span className="nf-ring" />
                    <span className="nf-code">404</span>
                    {/* biome-ignore lint/performance/noImgElement: static mascot */}
                    <img className="nf-panda" src="/icon.png" alt="" width={96} height={96} />
                </div>
                <p className="eyebrow">Page not found</p>
                <h1 className="display">
                    This page <em>wandered off.</em>
                </h1>
                <p className="nf-lead">
                    The link may be mistyped, or the page has moved. If you scanned a QR code for a fundraiser, check the
                    address on the poster — or ask the creator for a fresh link.
                </p>
                <div className="actions nf-actions">
                    <Link href="/">Go home</Link>
                    <Link href="/docs">Read the docs</Link>
                    <Link href="/dashboard">Open the dashboard</Link>
                </div>
            </section>
            <style>{`
                .nf { width: min(calc(100% - 2rem), 760px); margin: 0 auto; padding: 4.5rem 0 7rem; text-align: center; }
                .nf-art { position: relative; width: 220px; height: 170px; margin: 0 auto 1.6rem; }
                .nf-ring { position: absolute; inset: 0 25px; border: 1px solid var(--app-art-line); border-radius: 50%; }
                .nf-code { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -62%); font: 510 6.2rem/1 Arial, Helvetica, sans-serif; letter-spacing: -0.07em; color: var(--app-fg); opacity: 0.12; }
                .nf-panda { position: absolute; left: 50%; bottom: 0; width: 96px; height: 96px; margin-left: -48px; padding: 12px; border-radius: 50%; background: var(--app-surface); border: 2px solid var(--app-ink); box-shadow: var(--app-shadow); animation: nf-bob 3s ease-in-out infinite; }
                .nf h1 { font-size: clamp(2.6rem, 8vw, 4.6rem); }
                .nf h1 em { font-family: var(--font-serif); font-weight: 400; }
                .nf-lead { max-width: 560px; margin: 1.4rem auto 0; color: var(--app-fg-muted); font-size: 1.02rem; line-height: 1.7; }
                .nf-actions { justify-content: center; }
                @keyframes nf-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px) rotate(-3deg); } }
                @media (prefers-reduced-motion: reduce) { .nf-panda { animation: none; } }
            `}</style>
        </PageShell>
    );
}
