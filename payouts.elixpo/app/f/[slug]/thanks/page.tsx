"use client";

export const runtime = "edge";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import PolicyLinks from "@/components/trust/policy-links";
import PageShell from "../../../components/page-shell";
import HeartyBackground, { HEART, SPARK } from "../hearty-background";
import "../../fundraiser.css";

const SYMBOL: Record<string, string> = { INR: "₹", USD: "$" };
const fmt = (minor: number, cur: string) =>
    `${SYMBOL[cur] ?? `${cur} `}${(minor / 100).toLocaleString(cur === "INR" ? "en-IN" : "en-US", { maximumFractionDigits: 2 })}`;

/** Copy text with a fallback for browsers that block the async clipboard API. */
async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            ta.remove();
            return ok;
        } catch {
            return false;
        }
    }
}

/** One-time celebratory burst of hearts and sparkles behind the medallion. */
function Celebration() {
    // Deterministic spread (no hydration mismatch): 18 particles around a circle.
    const parts = useMemo(
        () =>
            Array.from({ length: 18 }, (_, i) => {
                const a = (i / 18) * Math.PI * 2;
                const d = 110 + ((i * 37) % 70);
                return {
                    kind: i % 3 === 0 ? "spark" : "heart",
                    x: Math.cos(a) * d,
                    y: Math.sin(a) * d * 0.8,
                    s: 10 + ((i * 7) % 12),
                    delay: (i % 6) * 60,
                    rot: ((i * 53) % 90) - 45,
                };
            }),
        [],
    );
    return (
        <div className="ty-celebrate" aria-hidden>
            <div className="ty-medal">
                <span className="ty-ring" />
                <span className="ty-ring r2" />
                <svg viewBox="0 0 24 24">
                    <path d={HEART} />
                </svg>
            </div>
            {parts.map((p, i) => (
                <svg
                    // biome-ignore lint/suspicious/noArrayIndexKey: static decorative list
                    key={i}
                    viewBox="0 0 24 24"
                    className={`ty-p ${p.kind}`}
                    style={
                        {
                            "--x": `${p.x}px`,
                            "--y": `${p.y}px`,
                            "--r": `${p.rot}deg`,
                            width: p.s,
                            height: p.s,
                            animationDelay: `${300 + p.delay}ms`,
                        } as React.CSSProperties
                    }
                >
                    <path d={p.kind === "heart" ? HEART : SPARK} />
                </svg>
            ))}
        </div>
    );
}

/** Share block: copy (with feedback), one-tap apps, and the native sheet when available. */
function ShareThis({ url, title, owner }: { url: string; title: string; owner?: string | null }) {
    const [copied, setCopied] = useState<"link" | "text" | null>(null);
    const [failed, setFailed] = useState(false);
    const [canShare, setCanShare] = useState(false);
    useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

    const text = `I just backed ${title}${owner ? ` by ${owner}` : ""} on Elixpo Pay. Every bit helps — join me:`;
    const full = `${text} ${url}`;
    const enc = encodeURIComponent;
    const apps = [
        { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${enc(full)}` },
        { id: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}` },
        { id: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}` },
        { id: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
        { id: "email", label: "Email", href: `mailto:?subject=${enc(`Support ${title}`)}&body=${enc(full)}` },
    ];
    const copy = async (what: "link" | "text") => {
        const ok = await copyText(what === "link" ? url : full);
        setFailed(!ok);
        if (ok) {
            setCopied(what);
            setTimeout(() => setCopied(null), 2000);
        }
    };

    return (
        <section className="ty-share" aria-labelledby="ty-share-h">
            <h2 id="ty-share-h">Help it go further</h2>
            <p>Most support comes from friends of supporters. One share can matter as much as a contribution.</p>
            <div className="ty-share-link">
                <span>{url.replace(/^https?:\/\//, "")}</span>
                <button type="button" onClick={() => copy("link")} aria-live="polite">
                    {copied === "link" ? "Copied!" : "Copy link"}
                </button>
            </div>
            <div className="ty-share-apps">
                {canShare && (
                    <button
                        type="button"
                        className="ty-app primary"
                        onClick={() => navigator.share({ title, text, url }).catch(() => {})}
                    >
                        Share…
                    </button>
                )}
                {apps.map((a) => (
                    <a key={a.id} className="ty-app" href={a.href} target="_blank" rel="noopener noreferrer">
                        {a.label}
                    </a>
                ))}
                <button type="button" className="ty-app" onClick={() => copy("text")}>
                    {copied === "text" ? "Message copied!" : "Copy message"}
                </button>
            </div>
            {failed && (
                <p className="fr-hint bad" role="alert">
                    Couldn't copy automatically — select the link above and copy it.
                </p>
            )}
        </section>
    );
}

function Thanks() {
    const { slug } = useParams<{ slug: string }>();
    const id = useSearchParams().get("c") || "";
    const [c, setC] = useState<any>(null);
    const [gaveUp, setGaveUp] = useState(false);
    const [origin, setOrigin] = useState("https://payouts.elixpo.com");
    useEffect(() => setOrigin(window.location.origin), []);

    // Poll until the payment is confirmed (client confirm or Razorpay webhook).
    useEffect(() => {
        if (!id) return;
        let tries = 0;
        let stop = false;
        const tick = async () => {
            tries++;
            const r = await fetch(`/api/fundraisers/contributions/${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
            const d: any = r?.ok ? await r.json() : null;
            if (stop) return;
            if (d) setC(d);
            if (d?.status === "paid") return;
            if (tries >= 20) return setGaveUp(true);
            setTimeout(tick, 2000);
        };
        tick();
        return () => {
            stop = true;
        };
    }, [id]);

    const paid = c?.status === "paid";
    const shown =
        c &&
        (c.display_currency && c.display_currency !== c.currency
            ? `${fmt(c.display_amount, c.display_currency)} (${fmt(c.amount, c.currency)})`
            : fmt(c.amount, c.currency));
    const pageUrl = `${origin}/f/${slug}`;

    if (paid) {
        return (
            <div className="fr-thanks ty">
                <Celebration />
                <p className="eyebrow">Contribution received</p>
                <h1 className="display">
                    Thank you{c.name ? `, ${c.name}` : ""}
                    <em>.</em>
                </h1>
                <p className="ty-lead">
                    You just helped <strong>{c.fundraiser.title}</strong> move forward. A receipt is on its way to your
                    inbox.
                </p>

                <div className="ty-receipt">
                    <div>
                        <span>You gave</span>
                        <b>{shown}</b>
                    </div>
                    <div>
                        <span>To</span>
                        <b>{c.fundraiser.owner_name || c.fundraiser.title}</b>
                    </div>
                    <div>
                        <span>Status</span>
                        <b className="ok">Paid</b>
                    </div>
                </div>

                {c.fundraiser.thank_you_message && (
                    <blockquote>
                        {c.fundraiser.thank_you_message}
                        {c.fundraiser.owner_name ? `\n— ${c.fundraiser.owner_name}` : ""}
                    </blockquote>
                )}

                <ShareThis url={pageUrl} title={c.fundraiser.title} owner={c.fundraiser.owner_name} />

                <div className="actions">
                    <Link href={`/f/${slug}`}>See the progress</Link>
                </div>
                <PolicyLinks trust="contributing" lead="Your receipt is covered by our" align="center" style={{ marginTop: "2rem" }} />
            </div>
        );
    }

    return (
        <div className="fr-thanks ty">
            <div className="ty-wait" aria-hidden>
                <svg viewBox="0 0 24 24">
                    <path d={HEART} />
                </svg>
            </div>
            {gaveUp || !id ? (
                <>
                    <p className="eyebrow">Almost there</p>
                    <h1 className="display">We're still confirming your payment.</h1>
                    <p className="ty-lead">
                        This can take a minute. If money left your account, the contribution will be recorded and you'll get
                        a receipt by email — there's no need to pay again.
                    </p>
                </>
            ) : (
                <>
                    <p className="eyebrow">One moment</p>
                    <h1 className="display">Confirming your payment…</h1>
                    <p className="ty-lead">Please keep this page open.</p>
                </>
            )}
            <div className="actions">
                <Link href={`/f/${slug}`}>Back to the fundraiser</Link>
            </div>
        </div>
    );
}

export default function ThanksPage() {
    return (
        <PageShell>
            <HeartyBackground />
            <Suspense fallback={<div className="fr-thanks" />}>
                <Thanks />
            </Suspense>
        </PageShell>
    );
}
