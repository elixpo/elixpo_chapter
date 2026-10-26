import type { Metadata } from "next";
import Link from "next/link";
import Footer from "./components/footer";
import Navbar from "./components/navbar";
import "./home.css";

export const metadata: Metadata = {
    title: {
        absolute:
            "Elixpo Accounts — Single Sign-On, OAuth 2.0 & User Management",
    },
    alternates: { canonical: "/" },
};

const STEPS = [
    {
        n: "01",
        art: "",
        label: "Project",
        glyph: "◎",
        title: "Set up your auth project",
        body: "Create a project, choose the sign-in providers, add your callback URLs, and set the app name, logo, and domain your users will recognize.",
        links: [
            { label: "Create a project →", href: "/register" },
            { label: "Open dashboard", href: "/dashboard/oauth-apps" },
        ],
    },
    {
        n: "02",
        art: "home-art-blue",
        label: "Integration",
        glyph: "⇄",
        title: "Connect your application",
        body: "Install the Developer SDK or use standard OAuth 2.0 and OpenID Connect. Add sign-in and sign-out, then let the hosted account screens handle the rest.",
        links: [
            { label: "Read the quickstart →", href: "/docs/quickstart" },
            { label: "Explore the SDK", href: "/docs/lixaccounts" },
        ],
    },
];

const FEATURES = [
    {
        tag: "Sign-in",
        title: "Five providers, one account",
        body: "Offer email and password, Google, GitHub, Microsoft, and Discord from one sign-in screen. Users can also choose a passkey when they want passwordless access.",
    },
    {
        tag: "Lifecycle",
        title: "The whole sign-in lifecycle",
        body: "Sign-in, sign-out, account switching, consent, session refresh, and revocation work together instead of becoming separate features your team must maintain.",
    },
    {
        tag: "Users",
        title: "User management is included",
        body: "Give users one place for profiles, security methods, active sessions, devices, connected apps, notification choices, and account deletion.",
    },
    {
        tag: "Branding",
        title: "Your brand, standard OAuth",
        body: "Show your app name, logo, and verified domain during the hosted handoff. Underneath, standard OAuth 2.0 and OpenID Connect keep the integration portable and inspectable.",
    },
];

const SECURITY = [
    {
        n: "01",
        title: "S256 PKCE",
        body: "Every authorization code is bound to a verifier, with state and nonce checks on the way back.",
    },
    {
        n: "02",
        title: "Rotating refresh tokens",
        body: "Refresh tokens rotate atomically per family, and reuse revokes the whole family.",
    },
    {
        n: "03",
        title: "JWKS verification",
        body: "ID and access tokens verify against published keys from standard discovery documents.",
    },
    {
        n: "04",
        title: "MFA and passkeys",
        body: "TOTP, WebAuthn passkeys, trusted devices, sign-in alerts, and session revocation per device.",
    },
];

const FAQ = [
    {
        q: "What is Elixpo Accounts?",
        a: "Elixpo Accounts is a hosted identity provider. It gives your application sign-in, sign-out, single sign-on, account switching, MFA, and user management over standard OAuth 2.0 and OpenID Connect, and it is the account system behind every Elixpo product.",
    },
    {
        q: "Which sign-in methods are supported?",
        a: "Email and password, Google, GitHub, Microsoft, and Discord, plus WebAuthn passkeys. Users can add TOTP or passkey second factors and manage trusted devices from their account.",
    },
    {
        q: "Do I have to use the SDK?",
        a: "No. The @elixpo/accounts package handles login links, PKCE, callbacks, refresh, and token verification for Node.js and edge runtimes, but any standards-compliant OAuth 2.0 / OIDC client works against the published discovery and JWKS endpoints.",
    },
    {
        q: "How much does it cost?",
        a: "The Hobby plan is free for up to 1,000 monthly active users per app. Paid plans raise the limit to 10,000 and 100,000 monthly active users per app and are billed in INR.",
    },
    {
        q: "Can users sign in to several accounts at once?",
        a: "Yes. Users can keep multiple accounts signed in on one browser and choose which one to continue with on the consent screen, without signing out.",
    },
];

const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "SoftwareApplication",
            "@id": "https://accounts.elixpo.com/#software",
            name: "Elixpo Accounts",
            alternateName: "Elixpo Authentication and User Management",
            url: "https://accounts.elixpo.com",
            applicationCategory: "SecurityApplication",
            applicationSubCategory: "Authentication and identity management",
            operatingSystem: "Web, Node.js, Cloudflare Workers",
            description:
                "Hosted authentication and user management with five sign-in providers, passkeys, single sign-on, account switching, sessions, webhooks, and OAuth/OIDC APIs.",
            offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "INR",
                description:
                    "Free Hobby plan for up to 1,000 monthly active users per app",
            },
            featureList: [
                "Email, Google, GitHub, Microsoft, and Discord sign-in",
                "WebAuthn passkeys and multi-factor authentication",
                "Single sign-on and multiple account switching",
                "Hosted sign-in, consent, and account management",
                "Session, device, profile, and connected-app management",
                "OAuth 2.0 and OpenID Connect discovery",
                "S256 PKCE, token rotation, revocation, and JWKS verification",
                "Signed webhooks and developer API keys",
                "Edge-safe TypeScript SDK",
            ],
            softwareHelp: "https://accounts.elixpo.com/docs",
            downloadUrl: "https://www.npmjs.com/package/@elixpo/accounts",
            provider: { "@id": "https://elixpo.com/#organization" },
        },
        {
            "@type": "FAQPage",
            "@id": "https://accounts.elixpo.com/#faq",
            mainEntity: FAQ.map(({ q, a }) => ({
                "@type": "Question",
                name: q,
                acceptedAnswer: { "@type": "Answer", text: a },
            })),
        },
    ],
};

export default function LandingPage() {
    return (
        <div className="relative w-full min-h-screen font-body text-[var(--fg)] bg-[var(--bg)] overflow-x-clip">
            <script
                type="application/ld+json"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD, `<` escaped
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(structuredData).replace(
                        /</g,
                        "\\u003c",
                    ),
                }}
            />

            <Navbar />

            <main id="main">
                <section className="home-hero" aria-labelledby="hero-title">
                    <div className="home-hero-copy">
                        <p className="eyebrow">
                            Elixpo Accounts · Identity for the Elixpo suite
                        </p>
                        <h1 id="hero-title" className="display">
                            Five providers. One sign-on. <em>Two steps.</em>
                        </h1>
                        <p className="lede">
                            Add sign-in, sign-out, account switching, secure
                            sessions, and complete user management to your app.
                            Choose your providers and branding, register the
                            app, follow the docs, and ship without building an
                            authentication platform first.
                        </p>
                        <div className="home-actions">
                            <Link
                                href="/register"
                                className="pill-btn pill-btn-solid"
                            >
                                Start building
                            </Link>
                            <Link href="/docs" className="pill-btn">
                                Read the docs
                            </Link>
                            <Link href="/docs/lixaccounts" className="pill-btn">
                                Developer SDK ↗
                            </Link>
                        </div>
                    </div>
                    <div className="home-objects" aria-hidden="true">
                        <span className="orbit home-orbit-one" />
                        <span className="orbit home-orbit-two" />
                        <div className="home-object home-object-key">
                            <i />
                            <i />
                            <i />
                            <b>OAUTH 2.0</b>
                        </div>
                        <div className="home-object home-object-pkce">
                            <span>PKCE</span>
                            <b>S256</b>
                        </div>
                        <div className="home-object home-object-token">
                            <span>OPENID CONNECT</span>
                            <b>id_token · JWKS</b>
                        </div>
                    </div>
                    <div className="home-hero-note" aria-hidden="true">
                        <strong>5</strong>
                        <span>sign-in providers</span>
                        <small>plus passkeys and MFA</small>
                    </div>
                </section>

                <section id="how-it-works" className="home-section">
                    <header>
                        <div>
                            <p className="eyebrow">Get started</p>
                            <h2>
                                From a new project to working sign-in in{" "}
                                <em>two steps.</em>
                            </h2>
                        </div>
                        <p>
                            We host the difficult identity screens and security
                            flows. You choose how your app should look, connect
                            one callback, and keep building your product.
                        </p>
                    </header>
                    <div className="home-steps">
                        {STEPS.map((step) => (
                            <article key={step.n} className="home-card">
                                <div
                                    className={`home-art ${step.art}`}
                                    aria-hidden="true"
                                >
                                    <span>
                                        {step.n} / {step.label.toUpperCase()}
                                    </span>
                                    <i />
                                    <i />
                                    <b>{step.glyph}</b>
                                </div>
                                <div className="home-card-copy">
                                    <small>Step {step.n}</small>
                                    <h3>{step.title}</h3>
                                    <p>{step.body}</p>
                                    <div className="home-card-links">
                                        {step.links.map((link) => (
                                            <Link
                                                key={link.href}
                                                href={link.href}
                                            >
                                                {link.label}
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                <section id="features" className="home-section">
                    <header>
                        <div>
                            <p className="eyebrow">What you get</p>
                            <h2>
                                Everything your product needs after{" "}
                                <em>“Sign in.”</em>
                            </h2>
                        </div>
                        <p>
                            Authentication is more than a login form. Keep the
                            user, session, security, and app lifecycle together
                            from day one.
                        </p>
                    </header>
                    <div className="home-index">
                        {FEATURES.map((feature, i) => (
                            <div key={feature.title}>
                                <span>{String(i + 1).padStart(2, "0")}</span>
                                <div>
                                    <small>{feature.tag}</small>
                                    <h3>{feature.title}</h3>
                                    <p>{feature.body}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section id="sdk" className="home-section home-sdk">
                    <header>
                        <div>
                            <p className="eyebrow">Developer SDK</p>
                            <h2>
                                One package for the <em>security-sensitive</em>{" "}
                                parts.
                            </h2>
                        </div>
                        <p>
                            Runs in Node.js and edge runtimes, and stays
                            compatible with standard OAuth if you ever want to
                            integrate without the package.
                        </p>
                    </header>
                    <div className="home-sdk-grid">
                        <article>
                            <div
                                className="home-art home-art-violet"
                                aria-hidden="true"
                            >
                                <span>@ELIXPO/ACCOUNTS</span>
                                <i />
                                <i />
                                <b>{"{ }"}</b>
                            </div>
                            <div>
                                <p className="eyebrow">TypeScript · MIT</p>
                                <h3>Less auth code to write and patch</h3>
                                <p>
                                    <code>@elixpo/accounts</code> creates login
                                    links, protects callbacks, refreshes access,
                                    and verifies user identity against JWKS.
                                </p>
                                <div className="home-actions">
                                    <Link
                                        href="/docs/lixaccounts"
                                        className="pill-btn pill-btn-solid"
                                    >
                                        SDK reference
                                    </Link>
                                    <a
                                        href="https://www.npmjs.com/package/@elixpo/accounts"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="pill-btn"
                                    >
                                        View on npm ↗
                                    </a>
                                </div>
                            </div>
                        </article>
                        <article>
                            <pre className="home-terminal">
                                <code>
                                    <span className="t-accent">$</span> npm
                                    install @elixpo/accounts{"\n\n"}
                                    <span className="t-dim">import</span>{" "}
                                    {"{ createAccountsClient }"}{" "}
                                    <span className="t-dim">from</span>{" "}
                                    <span className="t-accent">
                                        &quot;@elixpo/accounts&quot;
                                    </span>
                                    {"\n\n"}
                                    <span className="t-dim">
                                        {"// PKCE, state and nonce built in"}
                                    </span>
                                    {"\n"}
                                    {
                                        "const request = await accounts.createAuthorizationRequest()"
                                    }
                                </code>
                            </pre>
                            <div>
                                <p className="eyebrow">Standards first</p>
                                <h3>Discovery you can inspect</h3>
                                <p>
                                    OAuth authorization server metadata, OpenID
                                    configuration, and signing keys are public
                                    for any client to read.
                                </p>
                                <div className="home-card-links">
                                    <a href="/.well-known/openid-configuration">
                                        OpenID configuration ↗
                                    </a>
                                    <a href="/.well-known/jwks.json">JWKS ↗</a>
                                </div>
                            </div>
                        </article>
                    </div>
                </section>

                <section id="security" className="home-section home-standard">
                    <header>
                        <div>
                            <p className="eyebrow">Security defaults</p>
                            <h2>
                                Safe by default, <em>not by checklist.</em>
                            </h2>
                        </div>
                        <p>
                            The parts teams usually get wrong are on from the
                            first request, for every app on the network.
                        </p>
                    </header>
                    <div className="home-standard-grid">
                        {SECURITY.map((item) => (
                            <article key={item.n}>
                                <span>{item.n}</span>
                                <h3>{item.title}</h3>
                                <p>{item.body}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section id="faq" className="home-section">
                    <header>
                        <div>
                            <p className="eyebrow">Questions</p>
                            <h2>
                                Asked <em>often.</em>
                            </h2>
                        </div>
                        <p>
                            Anything else is in the{" "}
                            <Link
                                href="/docs"
                                className="text-[var(--green)] font-bold"
                            >
                                documentation
                            </Link>
                            .
                        </p>
                    </header>
                    <div className="home-faq">
                        {FAQ.map(({ q, a }) => (
                            <details key={q}>
                                <summary>{q}</summary>
                                <p>{a}</p>
                            </details>
                        ))}
                    </div>
                </section>

                <section className="home-section" aria-labelledby="cta-title">
                    <div className="home-cta">
                        <div>
                            <p className="eyebrow">Ready when you are</p>
                            <h2 id="cta-title">
                                Stop maintaining auth. <em>Start shipping.</em>
                            </h2>
                            <p>
                                Create your auth project, choose the providers
                                and brand your users should see, then follow the
                                quickstart. We handle the account system behind
                                it.
                            </p>
                        </div>
                        <div className="home-actions">
                            <Link
                                href="/register"
                                className="pill-btn pill-btn-solid"
                            >
                                Start building
                            </Link>
                            <Link href="/pricing" className="pill-btn">
                                See pricing
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
}
