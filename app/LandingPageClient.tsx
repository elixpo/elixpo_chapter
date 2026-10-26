import Link from 'next/link';
import type { ReactNode } from 'react';
import Footer from './components/Footer';
import Navbar from './components/Navbar';
import GuestShortener from './components/landing/GuestShortener';

/*
 * Landing page. Rendered on the server; only the guest shortener form and
 * the navbar hydrate on the client. Visual language follows research.elixpo
 * (paper surface, ink pills, pastel geometry panels, mono eyebrows).
 */

/* ── Icons (inline SVG, stroke = currentColor) ──────────────────────────── */

function Icon({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const SignInIcon = () => (
  <Icon size={18}>
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
);
const ShortenIcon = () => (
  <Icon size={18}>
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </Icon>
);
const TrackIcon = () => (
  <Icon size={18}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </Icon>
);

const BoltIcon = () => (
  <Icon>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </Icon>
);
const ChartIcon = () => (
  <Icon>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </Icon>
);
const SlugIcon = () => (
  <Icon>
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </Icon>
);
const QrIcon = () => (
  <Icon>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3M21 14v7h-7v-3" />
  </Icon>
);
const DomainIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
  </Icon>
);
const ApiIcon = () => (
  <Icon>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </Icon>
);
const ArrowIcon = () => (
  <Icon size={16}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </Icon>
);
/* ── Content (unchanged copy) ──────────────────────────────────────────── */

const REGIONS = [
  'North America',
  'Europe',
  'Asia Pacific',
  'South America',
  'Africa',
  'Middle East',
];

const STEPS: { n: string; icon: ReactNode; title: string; body: string }[] = [
  {
    n: '01',
    icon: <SignInIcon />,
    title: 'Sign in',
    body: 'Authenticate with your Elixpo account — no separate signup, no password to remember.',
  },
  {
    n: '02',
    icon: <ShortenIcon />,
    title: 'Shorten',
    body: 'Paste a long URL, pick a slug or let us mint one, and your link goes live on the edge.',
  },
  {
    n: '03',
    icon: <TrackIcon />,
    title: 'Track',
    body: 'Watch clicks, countries, and referrers from the dashboard — or call the API and pipe them anywhere.',
  },
];

const FEATURES: { icon: ReactNode; title: string; body: string; href?: string }[] = [
  {
    icon: <BoltIcon />,
    title: 'Edge-native redirects',
    body: "Links resolve through Cloudflare's global edge, close to the visitor and without an application proxy hop.",
  },
  {
    icon: <ChartIcon />,
    title: 'Click analytics',
    body: 'Bot-filtered counts with country, referrer, and device breakdowns. No third-party tracking script is required.',
  },
  {
    icon: <SlugIcon />,
    title: 'Custom slugs',
    body: 'Choose the slug yourself or generate a short one. Collision checks run at write time so a link is never ambiguous.',
  },
  {
    icon: <QrIcon />,
    title: 'Quick QR code generator',
    body: 'Turn any URL into a QR code, export SVG, PNG, or JPG, and unlock custom styles, logos, and scan tracking when needed.',
    href: '/generate',
  },
  {
    icon: <DomainIcon />,
    title: 'Safety screening',
    body: 'Destinations are validated and checked against known phishing and malware signals when links are created or changed.',
  },
  {
    icon: <ApiIcon />,
    title: 'REST API',
    body: 'Create, list, and revoke links with scoped API keys and predictable JSON. Drop it into any app you ship.',
  },
];

const USE_CASES = [
  'Campaign links',
  'Social bios',
  'QR codes for print',
  'API integrations',
  'Expiring event links',
  'Developer tooling',
];

const FEATURE_ART = ['#f1c64f', '#cbdcff', '#dfd0f3', '#d4eadf', '#f3dfb5', '#eef2ff'];

function SectionHeader({ eyebrow, title, body, id }: { eyebrow: string; title: ReactNode; body: string; id: string }) {
  return (
    <header className="mb-12 grid grid-cols-1 gap-6 lg:mb-14 lg:grid-cols-[1.15fr_.65fr] lg:gap-16">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id} className="display-2 max-w-[1050px]">
          {title}
        </h2>
      </div>
      <p className="self-end text-base leading-[1.7] text-[#5f6962]">{body}</p>
    </header>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <Navbar />

      <main id="main-content" className="flex-1">
        {/* ── Hero ───────────────────────────────────────────────────── */}
        <section
          aria-labelledby="hero-title"
          className="relative -mt-[90px] flex min-h-[min(100svh,980px)] items-center overflow-hidden border-b border-line px-4 pb-16 pt-[clamp(8.5rem,20vh,12rem)] sm:px-[max(1.25rem,calc((100%-1450px)/2))]"
        >
          <div className="relative z-[2] w-full">
            <p className="eyebrow">Edge-native URL shortener</p>
            <h1 id="hero-title" className="display-1 max-w-[1150px]">
              Short links. <em>Real tracking.</em> No plumbing.
            </h1>
            <p className="lede mt-8 max-w-[680px]">
              Paste a URL, get a link that resolves through Cloudflare&apos;s global edge —
              with click analytics, custom slugs, and a REST API, all from one
              dashboard.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/api/auth/login?return_to=/dashboard" className="btn-primary">
                Sign in with Elixpo
              </Link>
              <Link href="/docs/cli" className="btn-secondary">
                Developer CLI
                <ArrowIcon />
              </Link>
            </div>
            <GuestShortener />
          </div>

          {/* Decorative geometry (research.elixpo hero objects). */}
          <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
            <span className="hero-orbit right-[-145px] top-[150px] h-[460px] w-[460px] after:left-[42px] after:top-[55px] after:bg-[#3f7cec]" />
            <span className="hero-orbit -bottom-[110px] -left-[110px] h-[260px] w-[260px] after:right-[27px] after:top-[28px] after:bg-[#e76043]" />
            <div className="hero-object right-[22%] top-[20%] h-[150px] w-[220px] -rotate-[8deg] rounded-[46%_54%_64%_36%] bg-[#f3b529]">
              <b className="font-mono text-base tracking-[0.2em]">lixrl/</b>
            </div>
            <div className="hero-object bottom-[22%] right-[8%] h-[145px] w-[145px] rotate-[8deg] rounded-full bg-[#3f7cec] text-white">
              <span className="font-mono text-[0.62rem] font-semibold tracking-[0.14em]">QR</span>
              <b className="mt-1.5 font-mono text-[0.78rem]">SCAN</b>
            </div>
            <div className="hero-object bottom-[10%] right-[30%] h-[118px] w-[210px] rotate-[6deg] rounded-md border border-[#b9beb9] bg-white">
              <span className="font-mono text-[0.62rem] font-semibold tracking-[0.14em]">CLICKS</span>
              <b className="mt-1.5 font-mono text-[0.78rem]">EDGE + ANALYTICS</b>
            </div>
          </div>
        </section>

        {/* ── Edge network strip ──────────────────────────────────────── */}
        <section aria-labelledby="regions-title" className="border-b border-line bg-paper-soft px-4 py-8 text-center">
          <h2 id="regions-title" className="mb-4 font-mono text-[0.65rem] font-bold uppercase tracking-[0.17em] text-[#5f6962]">
            Resolves on Cloudflare&apos;s global network
          </h2>
          <ul className="flex list-none flex-wrap items-center justify-center gap-x-10 gap-y-2">
            {REGIONS.map((r) => (
              <li key={r} className="text-[0.95rem] font-semibold tracking-[-0.01em] text-[#5f6962]">
                {r}
              </li>
            ))}
          </ul>
        </section>

        {/* ── How it works ────────────────────────────────────────────── */}
        <section aria-labelledby="steps-title" className="section-block px-4 sm:px-[max(1rem,calc((100%-1450px)/2))]">
          <SectionHeader
            id="steps-title"
            eyebrow="How it works"
            title="Live in three steps."
            body="Sign in, shorten a URL, then watch the clicks — no redirect middleware, no separate account."
          />
          <ol className="list-none border-t border-line">
            {STEPS.map((s) => (
              <li key={s.n} className="grid grid-cols-[34px_1fr] items-start gap-4 border-b border-line py-7 sm:grid-cols-[55px_1fr_44px] sm:gap-6 sm:py-8">
                <span className="pt-2 font-mono text-[0.67rem] text-[#5f6962]">{s.n}</span>
                <div>
                  <h3 className="mb-2 text-[clamp(1.6rem,3.4vw,3rem)] font-bold leading-none tracking-[-0.055em]">{s.title}</h3>
                  <p className="max-w-[760px] leading-[1.65] text-[#5f6962]">{s.body}</p>
                </div>
                <span className="hidden h-11 w-11 place-items-center rounded-full border border-line text-ink sm:grid" aria-hidden="true">
                  {s.icon}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Features ────────────────────────────────────────────────── */}
        <section aria-labelledby="features-title" className="section-block bg-paper-soft px-4 sm:px-[max(1rem,calc((100%-1450px)/2))]">
          <SectionHeader
            id="features-title"
            eyebrow="Features"
            title="Everything a link should do."
            body="Redirects, analytics, styled QR codes, and an API behind one dashboard — so you ship the link and skip the plumbing."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Link
                key={f.title}
                href={f.href || '/docs'}
                className="glass-card-hover group flex min-w-0 flex-col overflow-hidden no-underline"
              >
                <div className="art-panel h-[150px]" style={{ background: FEATURE_ART[i % FEATURE_ART.length] }} aria-hidden="true">
                  <span className="absolute left-5 top-4 font-mono text-[0.67rem] font-semibold">0{i + 1}</span>
                  <i className="art-ring" />
                  <i className="art-pill" />
                  <b className="absolute bottom-4 right-5 grid h-[72px] w-[72px] place-items-center rounded-[24%_76%_62%_38%] bg-white/75 text-ink shadow-[0_18px_50px_rgba(20,32,24,0.12)]">
                    {f.icon}
                  </b>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="mb-3 text-[clamp(1.35rem,2vw,1.75rem)] font-bold leading-[1.05] tracking-[-0.045em] text-ink">{f.title}</h3>
                  <p className="flex-1 leading-[1.62] text-[#5f6962]">{f.body}</p>
                  <span className="mt-6 border-t border-line pt-4 text-[0.78rem] font-bold text-green">
                    Learn more <span aria-hidden="true">→</span>
                    <span className="sr-only"> about {f.title}</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Use cases ───────────────────────────────────────────────── */}
        <section aria-labelledby="usecases-title" className="section-block px-4 sm:px-[max(1rem,calc((100%-1450px)/2))]">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-end lg:gap-16">
            <div>
              <p className="eyebrow">Built for every link moment</p>
              <h2 id="usecases-title" className="display-2">
                Every use case, <em>one tool.</em>
              </h2>
            </div>
            <ul className="grid list-none grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 sm:grid-cols-3">
              {USE_CASES.map((u) => (
                <li key={u} className="flex min-h-[48px] items-center gap-2.5 rounded-full border border-line bg-white px-4 text-[0.85rem] font-semibold">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-accent-main" aria-hidden="true" />
                  {u}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── API teaser (ink section, like research.elixpo .standard) ── */}
        <section aria-labelledby="api-title" className="section-block bg-ink px-4 text-white sm:px-[max(1rem,calc((100%-1450px)/2))]">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[.9fr_1.1fr] lg:gap-16">
            <div>
              <p className="eyebrow !text-[#9dbcff]">For developers</p>
              <h2 id="api-title" className="display-2">
                One POST and you have a link.
              </h2>
              <p className="mt-6 max-w-[520px] leading-[1.7] text-[#c3ccc5]">
                Authenticate with a scoped API key, send the destination, and
                get back the short URL plus its analytics handle. The same
                endpoints that power the dashboard are open to you.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/docs/api" className="btn-primary !border-white !bg-white !text-ink hover:!bg-[#eff1ed]">
                  Explore the API <span aria-hidden="true">→</span>
                </Link>
                <Link href="/docs/cli" className="btn-secondary !border-white/40 !text-white hover:!bg-white/10">
                  Developer CLI
                </Link>
              </div>
            </div>

            <figure className="w-full min-w-0 overflow-hidden rounded-[1.4rem] border border-white/15 bg-[#0d1610]">
              <figcaption className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
                <span className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#9dbcff]">POST</span>
                <span className="truncate font-mono text-[0.75rem] text-[#c3ccc5]">api.lixrl.com/v1/links</span>
              </figcaption>
              <pre className="m-0 overflow-x-auto p-5 font-mono text-[12.5px] leading-[1.8] text-[#e7ece8]">
                <code>
                  <span className="text-[#8fa096]">{'$ '}</span>
                  <span className="text-[#9dbcff]">curl</span>
                  {' -X POST api.lixrl.com/v1/links \\'}
                  {'\n'}
                  {'    -H '}
                  <span className="text-[#f3c969]">{'"Authorization: Bearer $KEY"'}</span>
                  {' \\'}
                  {'\n'}
                  {'    -d '}
                  <span className="text-[#f3c969]">{'\'{"url":"https://elixpo.com","slug":"home"}\''}</span>
                  {'\n\n'}
                  {'{'}
                  {'\n  '}
                  <span className="text-[#d7c4f5]">{'"short"'}</span>
                  {': '}
                  <span className="text-[#9fe0b8]">{'"https://lixrl.com/home"'}</span>
                  {','}
                  {'\n  '}
                  <span className="text-[#d7c4f5]">{'"clicks"'}</span>
                  {': '}
                  <span className="text-[#9dbcff]">{'0'}</span>
                  {'\n'}
                  {'}'}
                </code>
              </pre>
            </figure>
          </div>
        </section>

        {/* ── Pricing + final CTA ─────────────────────────────────────── */}
        <section aria-labelledby="cta-title" className="px-4 py-[clamp(4rem,8vw,7rem)] sm:px-[max(1rem,calc((100%-1450px)/2))]">
          <div className="grid grid-cols-1 gap-8 rounded-[1.6rem] bg-[#dce7ff] p-[clamp(1.5rem,5vw,4.5rem)] lg:grid-cols-[1.2fr_.8fr] lg:gap-16">
            <div>
              <p className="eyebrow">Free tier · No credit card</p>
              <h2 id="cta-title" className="display-2">
                Mint your first <em>short link.</em>
              </h2>
              <p className="mt-6 max-w-[520px] leading-[1.72] text-[#3d4842]">
                Sign in with your Elixpo account, shorten a URL, and grab an API
                key — free tier, no credit card.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/api/auth/login?return_to=/dashboard" className="btn-primary">
                  Sign in with Elixpo
                  <ArrowIcon />
                </Link>
              </div>
            </div>
            <div className="flex flex-col justify-end rounded-[1.2rem] border border-[rgba(49,95,202,0.18)] bg-white/80 p-6">
              <h3 className="text-[1.4rem] font-bold tracking-[-0.04em]">Pricing that scales with you</h3>
              <p className="mt-2 leading-[1.65] text-[#5f6962]">
                Start free, upgrade when you need custom slugs, deeper analytics, and higher limits.
              </p>
              <p className="mt-6 text-[2.6rem] font-bold leading-none tracking-[-0.06em]">
                $0<span className="text-base font-semibold tracking-normal text-[#5f6962]">/mo</span>
              </p>
              <Link href="/pricing" className="mt-6 self-start text-[0.8rem] font-bold text-green no-underline hover:underline">
                See pricing <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
