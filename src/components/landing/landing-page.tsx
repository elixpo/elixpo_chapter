/* Public landing for admin.elixpo.com — research.elixpo.com visual vocabulary
 * (classes in app/landing.css, scoped under `.lx`). Server component. */

import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";

const FEATURES = [
    {
        tag: "Services",
        meta: "Pages · Workers · routes · DNS",
        title: "Every *.elixpo.com service, Cloudflare-grade.",
        body: "Each hostname is matched to the Pages project, Worker or route that serves it, then given its own zone-style view: requests, bandwidth, status codes, cache ratio, security actions and Functions health.",
        mark: "*.ex",
        chips: ["PAGES", "WORKERS", "ROUTES"],
        path: "/dashboard/services",
    },
    {
        tag: "Diagnostics",
        meta: "Every non-2xx, explained",
        title: "Why a request didn't return 200.",
        body: "504s with no origin response, 308 wildcard redirects, Functions exceeding their resources — every status code is grouped by host and path with the likely reasons and the fix to try next.",
        mark: "5xx",
        chips: ["503 · FUNCTION", "308 · REDIRECT", "404 · PATH"],
        path: "/dashboard/diagnostics",
    },
    {
        tag: "Storage & compute",
        meta: "D1 · KV · Queues · Durable Objects · Workflows",
        title: "The data plane, inventoried automatically.",
        body: "Databases, namespaces, queues, Durable Object classes and Workflows are discovered from the account the moment they exist — with reads, writes, storage and backlog alongside.",
        mark: "D1",
        chips: ["D1", "KV", "QUEUES"],
        path: "/dashboard/d1",
    },
];

const ACCESS = [
    [
        "01",
        "Single sign-on",
        "Sign-in runs through accounts.elixpo.com over OAuth with a CSRF-checked state. No separate passwords live here.",
    ],
    [
        "02",
        "Admin check",
        "The returned profile must carry the admin role. Anyone else is turned away at /denied and never receives a session.",
    ],
    [
        "03",
        "Scoped token",
        "Cloudflare is queried server-side with an account-scoped API token. It never reaches the browser.",
    ],
    [
        "04",
        "Audited actions",
        "Sessions are 12-hour, signed, httpOnly cookies, and administrative actions are written to an audit log you can review.",
    ],
];

const CAPABILITIES = [
    [
        "Discovery",
        "Auto-discovered inventory",
        "Pages projects, Workers, D1 databases, KV namespaces, Queues, Durable Objects, Workflows and zones are listed straight from the Cloudflare account — nothing to register by hand.",
    ],
    [
        "Analytics",
        "Per-service traffic",
        "Requests, visits, bandwidth, countries, devices, browsers and protocols for each hostname, over 1 hour to 30 days.",
    ],
    [
        "Diagnostics",
        "Status-code reasoning",
        "A matrix of every response class per host, a timeline of failures, and a plain-language explanation for each 3xx, 4xx and 5xx.",
    ],
    [
        "Functions",
        "Worker & Pages Functions health",
        "Invocations, errors, CPU time and outcomes such as exceededResources or scriptThrewException, per script.",
    ],
    [
        "Deployments",
        "Builds and releases",
        "Recent Pages deployments, their branches and status, plus Worker cron schedules and routes.",
    ],
    [
        "Network",
        "DNS & zone settings",
        "Records, proxy status, DNS query analytics and the zone's TLS, caching and security settings in one place.",
    ],
];

export default function LandingPage({ authed }: { authed: boolean }) {
    const primary = authed
        ? { href: "/dashboard", label: "Open dashboard" }
        : { href: "/api/auth/login", label: "Sign in with Elixpo" };

    return (
        <div className="lx">
            <SiteHeader authed={authed} />
            <main>
                <header className="hero">
                    <div className="hero-copy">
                        <p className="eyebrow">Elixpo Admin · Control plane</p>
                        <h1>
                            Everything Elixpo runs on Cloudflare,{" "}
                            <em>watched in one place.</em>
                        </h1>
                        <p>
                            The gated operations console for the Elixpo
                            Cloudflare account. It discovers every Pages
                            project, Worker, D1 database, KV namespace, Queue,
                            Durable Object and Workflow, gives each *.elixpo.com
                            service its own analytics, and explains every
                            response that wasn&apos;t a 2xx.
                        </p>
                        <div className="actions">
                            <a href={primary.href}>{primary.label}</a>
                            <a href="#watches">See what it watches</a>
                        </div>
                    </div>
                    <div className="hero-objects" aria-hidden="true">
                        <span className="orbit orbit-one" />
                        <span className="orbit orbit-two" />
                        <div className="object object-code">
                            <i />
                            <i />
                            <i />
                            <b>EDGE</b>
                        </div>
                        <div className="object object-model">
                            <span>D1</span>
                            <b>SQLITE</b>
                        </div>
                        <div className="object object-paper">
                            <span>STATUS</span>
                            <b>
                                200 <em>OK</em>
                            </b>
                        </div>
                    </div>
                    <div className="hero-note">
                        <strong>7</strong>
                        <span>Cloudflare resource types discovered</span>
                        <small>Admins only · via accounts.elixpo.com</small>
                    </div>
                </header>

                <section className="section" id="watches">
                    <header>
                        <div>
                            <p className="eyebrow">What it watches</p>
                            <h2>One account, every service behind it.</h2>
                        </div>
                        <p>
                            Elixpo is a family of apps sharing one account. This
                            is where the team keeps every one of them fast,
                            healthy and online — read straight from Cloudflare,
                            with no agents to install.
                        </p>
                    </header>
                    <div className="leading-grid">
                        {FEATURES.map((f, i) => (
                            <a
                                key={f.tag}
                                href={authed ? f.path : primary.href}
                                className={`feature feature-${i + 1}`}
                            >
                                <div className="feature-art" aria-hidden="true">
                                    <span>
                                        0{i + 1} · {f.tag.toUpperCase()}
                                    </span>
                                    <i />
                                    <i />
                                    <ul>
                                        {f.chips.map((c) => (
                                            <li key={c}>{c}</li>
                                        ))}
                                    </ul>
                                    <b>{f.mark}</b>
                                </div>
                                <div className="feature-copy">
                                    <small>{f.meta}</small>
                                    <h3>{f.title}</h3>
                                    <p>{f.body}</p>
                                    <b>
                                        {authed
                                            ? `Open ${f.tag.toLowerCase()} →`
                                            : "Sign in to view →"}
                                    </b>
                                </div>
                            </a>
                        ))}
                    </div>
                </section>

                <section className="section standard" id="access">
                    <header>
                        <div>
                            <p className="eyebrow">How access works</p>
                            <h2>Gated at every step.</h2>
                        </div>
                        <p>
                            Elixpo Admin holds no accounts of its own. Identity
                            comes from accounts.elixpo.com, and only accounts
                            marked as admins get past the door.
                        </p>
                    </header>
                    <div>
                        {ACCESS.map(([n, t, p]) => (
                            <article key={n}>
                                <span>{n}</span>
                                <h3>{t}</h3>
                                <p>{p}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="section" id="capabilities">
                    <header>
                        <div>
                            <p className="eyebrow">Capability index</p>
                            <h2>What you can see once you&apos;re in.</h2>
                        </div>
                        <p>
                            Read-first observability across the whole account.
                            Anyone can check the public status page; the detail
                            behind it lives here.
                        </p>
                    </header>
                    <div className="index-list">
                        {CAPABILITIES.map(([tag, title, body], i) => (
                            <div key={title}>
                                <span>{String(i + 1).padStart(2, "0")}</span>
                                <div>
                                    <small>{tag}</small>
                                    <h3>{title}</h3>
                                    <p>{body}</p>
                                </div>
                                {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: decorative arrow; <b> is not focusable */}
                                <b aria-hidden="true">→</b>
                            </div>
                        ))}
                    </div>
                    <a className="feed-link" href="https://status.elixpo.com">
                        Check the public status page ↗
                    </a>
                </section>

                <section className="section">
                    <div className="closing">
                        <div>
                            <p className="eyebrow">
                                {authed ? "Welcome back" : "Admins only"}
                            </p>
                            <h2>
                                {authed ? (
                                    <>
                                        Your dashboard is <em>ready.</em>
                                    </>
                                ) : (
                                    <>
                                        One identity, <em>the whole suite.</em>
                                    </>
                                )}
                            </h2>
                        </div>
                        <div className="closing-copy">
                            <p>
                                {authed
                                    ? "Pick up where you left off — services, diagnostics and storage are one click away."
                                    : "Sign in with your Elixpo account. If it carries the admin role you'll land on the dashboard; otherwise you can request access."}
                            </p>
                            <div className="actions">
                                <a href={primary.href}>{primary.label}</a>
                                <a href="https://elixpo.com">
                                    Visit elixpo.com ↗
                                </a>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
            <SiteFooter />
        </div>
    );
}
