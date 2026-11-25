import type { Metadata } from "next";
import Link from "next/link";
import FlowDiagram, { type FlowStep } from "@/components/trust/flow-diagram";
import PolicyLinks from "@/components/trust/policy-links";
import PageShell from "../components/page-shell";

export const metadata: Metadata = {
    title: "Trust & safety",
    description:
        "How Elixpo Pay handles your money and data: payments through Razorpay, payouts to KYC-verified bank accounts, every payment counted once, signed webhooks, hashed keys, moderation and open-source code.",
    alternates: { canonical: "/trust" },
    openGraph: { url: "/trust", title: "Trust & safety | Elixpo Pay" },
};

const SECTIONS: { tag: string; title: string; body: React.ReactNode }[] = [
    {
        tag: "Payments",
        title: "Your card and UPI details never reach us",
        body: (
            <>
                Every payment happens on the checkout of <strong>Razorpay</strong>, an RBI-regulated payment gateway. Card
                numbers, UPI PINs and bank logins are entered there and handled by Razorpay — Elixpo Pay only learns that a
                payment succeeded, for how much, and its reference.
            </>
        ),
    },
    {
        tag: "Payouts",
        title: "Money goes to a verified bank account",
        body: (
            <>
                When a creator connects payouts, each payment is split by <strong>Razorpay Route</strong> straight to their
                bank account, which Razorpay verifies through KYC; Elixpo Pay keeps a 5% all-in fee that already covers Razorpay&apos;s gateway charges. A fundraiser can only
                go public once its payouts are connected. Elixpo's own products and fundraisers settle to Elixpo's account.
            </>
        ),
    },
    {
        tag: "Accuracy",
        title: "Every payment is counted exactly once",
        body: (
            <>
                Payment confirmations are signature-checked against Razorpay before anything is recorded, and the same
                payment can never be counted twice — not even when a confirmation is delivered again. Each charge is
                written to a balanced ledger, and every contributor gets an email receipt.
            </>
        ),
    },
    {
        tag: "Security",
        title: "Signed webhooks, hashed keys",
        body: (
            <>
                Apps receive <strong>HMAC-signed</strong> webhooks they can verify, with safe secret rotation. API keys are
                stored only as SHA-256 hashes, so even we can't read them back. Sign-in is through Elixpo Accounts — Elixpo
                Pay never stores passwords.
            </>
        ),
    },
    {
        tag: "Privacy",
        title: "We keep only what a payment needs",
        body: (
            <>
                A contributor's email is used for their receipt and is never shown to the creator. Names appear on a
                fundraiser only when the contributor chooses to show them. See the{" "}
                <Link href="/privacy">privacy policy</Link>.
            </>
        ),
    },
    {
        tag: "Moderation",
        title: "Anyone can report a page",
        body: (
            <>
                Every fundraiser has a <em>Report this page</em> link. Elixpo reviews reports and can hold a page — it
                stops taking payments immediately — or unpublish it. Fundraisers are donations: creators can't promise goods
                in return.
            </>
        ),
    },
    {
        tag: "Open source",
        title: "You can read every line",
        body: (
            <>
                Elixpo Pay is developed in the open on{" "}
                <a href="https://github.com/elixpo/payouts.elixpo" target="_blank" rel="noopener noreferrer">
                    GitHub
                </a>
                . Found a security issue? Report it privately through{" "}
                <a href="https://github.com/elixpo/payouts.elixpo/security/advisories/new" target="_blank" rel="noopener noreferrer">
                    GitHub's security advisory form
                </a>{" "}
                — please don't open a public issue.
            </>
        ),
    },
];

/** Every money/data flow on the platform, end to end. */
const FLOWS: { id: string; title: string; policy: { href: string; label: string }; steps: FlowStep[] }[] = [
    {
        id: "buying",
        title: "Buying from an app that uses Elixpo Pay",
        policy: { href: "/refunds", label: "Refund policy" },
        steps: [
            { icon: "phone", title: "You pay", body: "On Elixpo Pay's checkout, with UPI, a card or netbanking." },
            { icon: "shield", title: "Razorpay confirms", body: "An RBI-regulated gateway handles your payment details." },
            { icon: "panda", title: "Elixpo Pay records it once", body: "Then tells the app with a signed message it can verify." },
            { icon: "app", title: "Access unlocked", body: "The app switches your plan on. Cancel autopay any time." },
        ],
    },
    {
        id: "contributing",
        title: "Contributing to a fundraiser",
        policy: { href: "/terms", label: "Fundraiser terms" },
        steps: [
            { icon: "heart", title: "You choose an amount", body: "From ₹10. No account needed; your email is only for the receipt." },
            { icon: "shield", title: "Razorpay confirms", body: "Your card or UPI details never reach Elixpo." },
            { icon: "panda", title: "Recorded and receipted", body: "Counted exactly once; a receipt is emailed to you." },
            { icon: "bank", title: "Reaches the creator", body: "Paid to their KYC-verified bank account, minus a 5% all-in fee." },
        ],
    },
    {
        id: "payouts",
        title: "Getting paid as a creator or seller",
        policy: { href: "/terms", label: "Payout terms" },
        steps: [
            { icon: "bank", title: "Connect your bank", body: "Account holder, number and IFSC. We keep only the last 4 digits." },
            { icon: "shield", title: "Razorpay verifies you", body: "KYC through a Razorpay Route linked account." },
            { icon: "split", title: "Every payment is split", body: "You get the amount minus Elixpo's 5% all-in fee." },
            { icon: "check", title: "Settled to your bank", body: "By Razorpay, on its settlement schedule." },
        ],
    },
    {
        id: "emails",
        title: "Emails you receive",
        policy: { href: "/email-policy", label: "Email policy" },
        steps: [
            { icon: "check", title: "Something happens", body: "A payment, a cancellation, a failed renewal." },
            { icon: "panda", title: "Elixpo Pay", body: "Decides which receipt or notice is due — never marketing." },
            { icon: "mail", title: "Elixpo Mails delivers", body: "From the merchant's own mailbox, or from Elixpo for fundraisers." },
            { icon: "mail", title: "Your inbox", body: "Your address is never sold or shown to creators." },
        ],
    },
    {
        id: "refunds",
        title: "Getting a refund",
        policy: { href: "/refunds", label: "Refund policy" },
        steps: [
            { icon: "refund", title: "You ask", body: "Write to hello@elixpo.com with your payment reference." },
            { icon: "panda", title: "We review it", body: "Against the refund policy for that kind of payment." },
            { icon: "shield", title: "Razorpay refunds", body: "The money is returned through the gateway." },
            { icon: "phone", title: "Back where it came from", body: "To the card, UPI account or bank you paid with." },
        ],
    },
];

const JUMP: Record<string, string> = {
    buying: "Paying",
    contributing: "Contributing",
    payouts: "Getting paid",
    emails: "Emails",
    refunds: "Refunds",
};

/** The three ways people use Elixpo Pay, each in a couple of steps. */
const START = [
    {
        tag: "Raise money",
        title: "Start a fundraiser",
        steps: ["Sign in and write your fundraiser", "Connect your bank, publish and share the link or QR"],
        href: "/dashboard/fundraisers",
        cta: "Open fundraisers",
    },
    {
        tag: "Get paid",
        title: "Connect your bank",
        steps: ["Enter account holder, number and IFSC", "Razorpay verifies you; payments start reaching your bank"],
        href: "/dashboard/payouts",
        cta: "Open payouts",
    },
    {
        tag: "Sell",
        title: "Add payments to your app",
        steps: ["Register your app and get a key", "Send buyers to hosted checkout; get a signed webhook"],
        href: "/docs/quickstart",
        cta: "Read the quickstart",
    },
];

const COMMITMENTS = [
    { title: "No hidden fees", body: "Buyers and supporters pay exactly the amount shown. Creators pay one 5% all-in fee, gateway charges included. No setup, monthly or payout fees." },
    { title: "Exactly-once accounting", body: "A payment can never be counted twice, and every charge is written to a balanced ledger." },
    { title: "Policies at every step", body: "Wherever you pay or get paid, the terms, privacy, refund and email policies are one click away." },
    { title: "Open to inspection", body: "The code is public, so anyone can check that it does what this page says." },
    { title: "A human to talk to", body: "Questions, disputes and refund requests go to hello@elixpo.com." },
];

const NOT = [
    "We never see or store card numbers, UPI PINs or bank passwords.",
    "We never sell or share contributor emails.",
    "We never move money anywhere except the creator's verified account (or Elixpo's, for its own pages).",
    "We never ask you to pay outside the Razorpay checkout.",
];

/** Trust & safety: an honest, plain-language account of how Elixpo Pay handles money and data. */
export default function TrustPage() {
    return (
        <PageShell variant="docs">
            <article className="trust">
                <p className="eyebrow">Trust &amp; safety</p>
                <h1 className="display">
                    How we keep your <em>money and data</em> safe.
                </h1>
                <p className="trust-lead">
                    Plain answers to the questions worth asking before you pay, raise money or integrate Elixpo Pay.
                </p>

                <nav className="trust-jump" aria-label="On this page">
                    <a href="#get-started">Get started</a>
                    {FLOWS.map((f) => (
                        <a key={f.id} href={`#${f.id}`}>
                            {JUMP[f.id]}
                        </a>
                    ))}
                    <a href="#commitments">Commitments</a>
                </nav>

                <section className="trust-start" id="get-started" aria-labelledby="trust-start-h">
                    <h2 id="trust-start-h">Get started in minutes</h2>
                    <div>
                        {START.map((s) => (
                            <Link key={s.title} href={s.href} className="trust-start-card">
                                <span className="mono-label">{s.tag}</span>
                                <b>{s.title}</b>
                                <ol>
                                    {s.steps.map((x) => (
                                        <li key={x}>{x}</li>
                                    ))}
                                </ol>
                                <span className="trust-start-go">{s.cta} →</span>
                            </Link>
                        ))}
                    </div>
                </section>

                <div className="trust-grid">
                    {SECTIONS.map((s) => (
                        <section key={s.tag}>
                            <span className="mono-label">{s.tag}</span>
                            <h2>{s.title}</h2>
                            <p>{s.body}</p>
                        </section>
                    ))}
                </div>

                <section className="trust-e2e" id="end-to-end" aria-labelledby="trust-e2e-h">
                    <p className="eyebrow">End-to-end trust policy</p>
                    <h2 id="trust-e2e-h">Every flow, step by step.</h2>
                    <p className="trust-sub">
                        Each way money or data moves through Elixpo Pay, with the policy that governs it.
                    </p>
                    {FLOWS.map((f) => (
                        <section key={f.id} id={f.id} className="trust-flow" aria-labelledby={`trust-${f.id}`}>
                            <div className="trust-flow-head">
                                <h3 id={`trust-${f.id}`}>{f.title}</h3>
                                <Link href={f.policy.href}>{f.policy.label} →</Link>
                            </div>
                            <FlowDiagram title={f.title} steps={f.steps} compact />
                        </section>
                    ))}
                </section>

                <section className="trust-commit" id="commitments" aria-labelledby="trust-commit-h">
                    <h2 id="trust-commit-h">Our commitments</h2>
                    <div>
                        {COMMITMENTS.map((c) => (
                            <article key={c.title}>
                                <b>{c.title}</b>
                                <p>{c.body}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="trust-not">
                    <h2>What we don't do</h2>
                    <ul>
                        {NOT.map((n) => (
                            <li key={n}>{n}</li>
                        ))}
                    </ul>
                </section>

                <div className="trust-links">
                    <PolicyLinks trust="get-started" lead="All policies:" />
                    <p>
                        Questions? <Link href="/contact">Contact us</Link> or write to hello@elixpo.com.
                    </p>
                </div>
            </article>
            <style>{`
                .trust { width: min(calc(100% - 2rem), 1100px); margin: 0 auto; padding: 4rem 0 7rem; }
                .trust h1 { font-size: clamp(2.6rem, 6.5vw, 5.2rem); max-width: 900px; }
                .trust h1 em { font-family: var(--font-serif); font-weight: 400; }
                .trust-lead { max-width: 620px; margin: 1.4rem 0 3rem; color: var(--app-fg-muted); font-size: 1.08rem; line-height: 1.7; }
                .trust-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.75rem; }
                .trust-grid section { padding: 1.6rem; border: 1px solid var(--app-border); border-radius: var(--radius-card); background: var(--app-surface); }
                .trust-grid h2 { margin: 0.6rem 0 0.6rem; font-size: 1.45rem; letter-spacing: -0.035em; line-height: 1.15; }
                .trust-grid p, .trust-links { margin: 0; color: var(--app-fg-muted); line-height: 1.7; }
                .trust a { color: var(--app-link); font-weight: 700; }
                .trust-not { margin-top: 1rem; padding: 1.8rem; border-radius: var(--radius-card); background: var(--app-ink); color: var(--app-on-ink); }
                .trust-not h2 { margin: 0 0 1rem; font-size: 1.6rem; letter-spacing: -0.035em; }
                .trust-not ul { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.6rem; color: var(--app-on-ink-muted); line-height: 1.6; }
                .trust-links { margin-top: 2rem; display: grid; gap: 0.5rem; }
                .trust-e2e { margin-top: 3.5rem; }
                .trust article [id], .trust section[id] { scroll-margin-top: 110px; }
                .trust-jump { position: sticky; top: 84px; z-index: 5; display: flex; gap: 0.4rem; overflow-x: auto; margin: 1.6rem 0 0; padding: 0.45rem; border: 1px solid var(--app-border); border-radius: 999px; background: color-mix(in srgb, var(--app-bg) 88%, transparent); backdrop-filter: blur(10px); scrollbar-width: none; }
                .trust-jump a { flex-shrink: 0; padding: 0.4rem 0.85rem; border-radius: 999px; font-size: 0.82rem; font-weight: 600; color: var(--app-fg-muted); text-decoration: none; }
                .trust-jump a:hover, .trust-jump a:focus-visible { background: var(--app-bg-2); color: var(--app-fg); }
                .trust-start { margin-top: 2.2rem; }
                .trust-start > h2 { margin: 0 0 1rem; font-size: 1.5rem; letter-spacing: -0.03em; }
                .trust-start > div { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.8rem; }
                .trust-start-card { display: flex; flex-direction: column; gap: 0.45rem; padding: 1.3rem; border-radius: var(--radius-card); border: 1px solid var(--app-border); background: var(--app-surface); color: var(--app-fg); text-decoration: none; transition: border-color 0.15s, transform 0.15s; }
                .trust-start-card:hover { border-color: var(--app-fg-faint); transform: translateY(-2px); }
                .trust-start-card b { font-size: 1.1rem; }
                .trust-start-card ol { margin: 0; padding-left: 1.2rem; color: var(--app-fg-muted); font-size: 0.88rem; line-height: 1.6; }
                .trust-start-go { margin-top: auto; padding-top: 0.4rem; color: var(--app-link); font-weight: 700; font-size: 0.88rem; }
                .trust-e2e > h2, .trust-commit > h2 { margin: 0; font-size: clamp(2rem, 4vw, 3rem); font-weight: 510; letter-spacing: -0.05em; }
                .trust-sub { margin: 0.6rem 0 1.6rem; color: var(--app-fg-muted); line-height: 1.6; }
                .trust-flow { padding: 1.5rem; margin-bottom: 1rem; border: 1px solid var(--app-border); border-radius: var(--radius-card); background: var(--app-surface); }
                .trust-flow-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.3rem; }
                .trust-flow-head h3 { margin: 0; font-size: 1.15rem; letter-spacing: -0.02em; }
                .trust-flow-head a { font-size: 0.85rem; }
                .trust-commit { margin-top: 3rem; }
                .trust-commit > div { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.8rem; margin-top: 1.2rem; }
                .trust-commit article { padding: 1.2rem; border-radius: var(--radius-panel); background: var(--app-bg-2); border: 1px solid var(--app-border); }
                .trust-commit b { display: block; margin-bottom: 0.35rem; }
                .trust-commit p { margin: 0; color: var(--app-fg-muted); font-size: 0.9rem; line-height: 1.55; }
                .trust-not { margin-top: 1rem; }
                @media (max-width: 760px) { .trust-grid { grid-template-columns: 1fr; } }
            `}</style>
        </PageShell>
    );
}
