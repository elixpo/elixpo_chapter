import Link from "next/link";
import PageShell from "./components/page-shell";
import "./home.css";

const FEATURES = [
    {
        n: "01",
        tag: "Payments",
        title: "Hosted checkout",
        body: "Send your customer to our checkout to pay — UPI, cards and netbanking, with autopay mandates for subscriptions. Card details never touch your servers.",
        foot: "POST /v1/checkout/sessions",
        art: "var(--app-art-1)",
        mark: "₹",
    },
    {
        n: "02",
        tag: "Entitlements",
        title: "Access the moment they pay",
        body: "A signed entitlement.updated webhook tells your app who paid for what, and until when — so you unlock access instantly and downgrade on expiry.",
        foot: "entitlement.updated",
        art: "var(--app-art-2)",
        mark: "✓",
    },
    {
        n: "03",
        tag: "Revenue splits",
        title: "Creator payouts",
        body: "Keep your commission and pay the rest to creators or sellers — straight to their bank accounts, on schedule, every split on the ledger.",
        foot: "Connected payouts",
        art: "var(--app-art-3)",
        mark: "↗",
    },
];

const INDEX = [
    {
        tag: "Catalog",
        title: "Pricing managed from code",
        body: "Commit your tiers as JSON and sync them with your secret key. Monthly and yearly prices, INR and USD — the price is never trusted from the client.",
        href: "/docs/catalog",
    },
    {
        tag: "Fundraisers",
        title: "Raise money with a page and a QR code",
        body: "Set a goal, share the link or QR, and let anyone chip in with UPI or a card. Thank-you emails and a live total included.",
        href: "/docs/fundraisers",
    },
    {
        tag: "Buyer emails",
        title: "Receipts from your own mailbox",
        body: "Connect Elixpo Mails and every receipt, cancellation and failed-renewal email goes out automatically, designed by you, sent as you.",
        href: "/docs/emails",
    },
    {
        tag: "Ledger",
        title: "Every payment accounted for",
        body: "Each charge, split and payout is recorded in a balanced ledger — accurate and safe, even when a provider retries a webhook.",
        href: "/docs/webhooks",
    },
    {
        tag: "Providers",
        title: "Razorpay today, Stripe soon",
        body: "No gateway account needed: Elixpo Pay collects through Razorpay and pays you out. Stripe for international payments is on the roadmap.",
        href: "/pricing",
    },
];

const STEPS = [
    {
        n: "01",
        title: "Connect your product",
        body: "Sign in with Elixpo Accounts, register your app, grab your secret key and sync your prices. It takes minutes.",
    },
    {
        n: "02",
        title: "Send buyers to checkout",
        body: "Create a checkout session from your server and redirect. We handle UPI, cards, mandates and retries.",
    },
    {
        n: "03",
        title: "Grant access on the webhook",
        body: "Verify our signed webhook and flip the buyer's plan. Expiry, renewals and cancellations arrive the same way.",
    },
    {
        n: "04",
        title: "Pay out and email",
        body: "Split revenue to creators' bank accounts and send branded receipts through Elixpo Mails — optional, one switch each.",
    },
];

const SNIPPET = `curl https://payouts.elixpo.com/v1/checkout/sessions \\
  -H "Authorization: Bearer $ELIXPO_PAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tier": "pro",
    "interval": "month",
    "currency": "INR",
    "customer": { "uid": "u_123", "email": "asha@example.com" },
    "success_url": "https://yourapp.com/billing"
  }'

# → { "id": "cs_…", "url": "https://payouts.elixpo.com/checkout?session=cs_…" }`;

export default function Home() {
    return (
        <PageShell>
            {/* ── Hero ─────────────────────────────────────────────────── */}
            <section className="pay-hero">
                <div className="pay-hero-copy">
                    <p className="eyebrow">Elixpo Pay · Payments &amp; payouts</p>
                    <h1 className="display">
                        Payments for your platform, <em>without</em> building one.
                    </h1>
                    <p>
                        Take payments, unlock access the moment people pay, and send money straight to the
                        bank — through Razorpay, with UPI, cards and netbanking.
                    </p>

                    {/* One clear next step per visitor type. */}
                    <nav className="hero-paths" aria-label="Get started">
                        <Link className="hero-path hero-path-primary" href="/login?next=%2Fdashboard%2Fproducts">
                            <span className="hero-path-tag">For developers</span>
                            <b>Take payments in my app</b>
                            <span className="hero-path-body">
                                Hosted checkout, subscriptions and signed access webhooks — one API key.
                            </span>
                            <span className="hero-path-cta">
                                Start building <span aria-hidden>→</span>
                            </span>
                        </Link>
                        <Link className="hero-path" href="/login?next=%2Fdashboard%2Ffundraisers">
                            <span className="hero-path-tag">For creators</span>
                            <b>Raise money for a project</b>
                            <span className="hero-path-body">
                                A fundraiser page with a goal and a QR code. Anyone can chip in, no account needed.
                            </span>
                            <span className="hero-path-cta">
                                Start a fundraiser <span aria-hidden>→</span>
                            </span>
                        </Link>
                    </nav>
                    <p className="hero-secondary">
                        Just looking? <Link href="/docs/quickstart">Read the 5-minute quickstart</Link> or{" "}
                        <Link href="/docs/fundraisers">see how fundraisers work</Link>. You sign in with your Elixpo
                        account.
                    </p>
                </div>
                <div className="pay-hero-objects" aria-hidden>
                    <span className="orbit orbit-one" />
                    <span className="orbit orbit-two" />
                    <div className="object object-code">
                        <i />
                        <i />
                        <i />
                        <b>/v1/checkout</b>
                    </div>
                    <div className="object object-model">
                        <span>UPI · CARDS</span>
                        <b>₹ INR</b>
                    </div>
                    <div className="object object-paper">
                        <span>WEBHOOK</span>
                        <b>entitlement ✓</b>
                    </div>
                </div>
            </section>

            {/* ── Platform ─────────────────────────────────────────────── */}
            <section className="section" id="platform">
                <header>
                    <div>
                        <p className="eyebrow">The platform</p>
                        <h2>
                            Checkout, access and payouts — <em>one</em> integration.
                        </h2>
                    </div>
                    <p>
                        Your platform never has to build or maintain payments itself. Elixpo Pay runs
                        the checkout, keeps the books, and tells your app exactly who has access.
                    </p>
                </header>
                <div className="leading-grid">
                    {FEATURES.map((f) => (
                        <article className="feature" key={f.n}>
                            <div className="feature-art geo" style={{ ["--geo-bg" as string]: f.art }}>
                                <span>
                                    {f.n} · {f.tag}
                                </span>
                                <i className="g-ring" />
                                <i className="g-pill" />
                                <b>{f.mark}</b>
                            </div>
                            <div className="feature-copy">
                                <small>{f.tag}</small>
                                <h3>{f.title}</h3>
                                <p>{f.body}</p>
                                <b>{f.foot}</b>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            {/* ── Index of capabilities ───────────────────────────────── */}
            <section className="section section-deep">
                <header>
                    <div>
                        <p className="eyebrow">Also included</p>
                        <h2>Everything a paid product needs.</h2>
                    </div>
                    <p>No add-ons and no second integration — these come with every app.</p>
                </header>
                <div className="index-list">
                    {INDEX.map((item, i) => (
                        <Link key={item.title} href={item.href}>
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            <div>
                                <small>{item.tag}</small>
                                <h3>{item.title}</h3>
                                <p>{item.body}</p>
                            </div>
                            <b aria-hidden>↗</b>
                        </Link>
                    ))}
                </div>
            </section>

            {/* ── How it works ────────────────────────────────────────── */}
            <section className="section standard">
                <header>
                    <div>
                        <p className="eyebrow">How it works</p>
                        <h2>
                            Live in an <em>afternoon.</em>
                        </h2>
                    </div>
                    <p>Connect your app, send buyers to checkout, grant access on the webhook. That's it.</p>
                </header>
                <div className="steps">
                    {STEPS.map((s) => (
                        <article key={s.n}>
                            <span>{s.n}</span>
                            <h3>{s.title}</h3>
                            <p>{s.body}</p>
                        </article>
                    ))}
                </div>
            </section>

            {/* ── Code ────────────────────────────────────────────────── */}
            <section className="section">
                <div className="code-panel">
                    <div className="code-panel-copy">
                        <p className="eyebrow">For developers</p>
                        <h2>One request to start a checkout.</h2>
                        <p>
                            Authenticate with your app's secret key and Elixpo Pay resolves the price from
                            your catalog — the amount is never sent by you, so it can't be tampered with.
                        </p>
                        <Link href="/docs/checkout">Checkout sessions reference ↗</Link>
                        <Link href="/docs/webhooks">Verifying webhooks ↗</Link>
                    </div>
                    <pre className="code-panel-code">
                        <code>{SNIPPET}</code>
                    </pre>
                </div>
            </section>

            {/* ── Open source ─────────────────────────────────────────── */}
            <section className="section open-band">
                <div>
                    <p className="eyebrow">Open source</p>
                    <h2>
                        No black boxes handling <em>your revenue.</em>
                    </h2>
                </div>
                <div>
                    <p>
                        Elixpo Pay is developed in the open. Audit every line, host it yourself, or
                        contribute back.
                    </p>
                    <div className="actions">
                        <a href="https://github.com/elixpo/payouts.elixpo" target="_blank" rel="noopener noreferrer">
                            View on GitHub ↗
                        </a>
                        <Link href="/about">How the platform works</Link>
                    </div>
                </div>
            </section>
        </PageShell>
    );
}
