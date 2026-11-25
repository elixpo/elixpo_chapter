import Link from 'next/link';
import Footer from './Footer';
import Navbar from './Navbar';

const DESTINATIONS = [
  { href: '/?noredirect=1', kicker: 'Start over', title: 'Shorten a link', body: 'Create a fresh short link in one step — no account needed.' },
  { href: '/generate', kicker: 'Free tool', title: 'QR code generator', body: 'Turn any URL into an SVG, PNG, or JPG QR code.' },
  { href: '/docs', kicker: 'Developers', title: 'Documentation', body: 'API, CLI, analytics, keys, and branded subdomains.' },
  { href: '/pricing', kicker: 'Plans', title: 'Pricing', body: 'Custom slugs, expiry, scan tracking, and more.' },
];

const REASONS = [
  ['Typo', 'Short codes are case-sensitive. Check every character.'],
  ['Expired', 'Guest links last 24 hours; owners can set expiry dates.'],
  ['Removed', 'The owner disabled or deleted the link.'],
] as const;

/** Shared 404 surface for app/not-found.tsx and the /not-found fallback route. */
export default function NotFoundView() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <Navbar />
      <main id="main-content">
        <section className="shell grid gap-10 pb-14 pt-10 md:pb-20 md:pt-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16">
          <div className="order-2 lg:order-1">
            <p className="eyebrow">Error 404 · Link not found</p>
            <h1 className="display-1 !text-[clamp(2.6rem,7.5vw,5.8rem)]">
              This link <em>went nowhere.</em>
            </h1>
            <p className="lede mt-6 max-w-xl">
              The short link or page you followed doesn&apos;t exist, has expired, or has been removed. Here are a few
              places worth going instead.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/" className="btn-primary">
                Go home
              </Link>
              <Link href="/api/auth/login" className="btn-secondary">
                Open dashboard
              </Link>
            </div>
          </div>

          {/* Decorative research-style geometry panel. */}
          <div
            className="art-panel order-1 flex aspect-[4/3] max-h-[420px] w-full items-end rounded-[1.5rem] border border-[rgba(20,32,24,0.12)] bg-pastel-blue p-6 sm:aspect-[16/10] lg:order-2"
            aria-hidden="true"
          >
            <i className="art-ring" />
            <i className="art-pill" />
            <span className="absolute left-6 right-6 top-5 flex items-start justify-between font-mono text-[0.62rem] font-bold uppercase tracking-[0.17em] text-[#183f91]">
              <span>lixrl.com / ????</span>
              <span className="grid h-10 w-10 place-items-center rounded-full border border-current text-[0.68rem]">404</span>
            </span>
            <span className="relative font-mono text-[clamp(4.5rem,16vw,9rem)] font-bold leading-[0.8] tracking-[-0.08em] text-[#183f91]">
              404
            </span>
          </div>
        </section>

        <section className="border-y border-line bg-paper-soft" aria-labelledby="nf-why">
          <div className="shell grid gap-8 py-12 md:py-16 lg:grid-cols-[0.6fr_1.4fr] lg:items-start">
            <h2 id="nf-why" className="text-[clamp(1.5rem,3vw,2.1rem)] font-bold leading-[1.05] tracking-[-0.05em]">
              Why this happens
            </h2>
            <dl className="grid gap-px overflow-hidden rounded-[1.4rem] border border-line bg-line sm:grid-cols-3">
              {REASONS.map(([term, detail]) => (
                <div key={term} className="bg-white p-5">
                  <dt className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.16em] text-accent-deep">{term}</dt>
                  <dd className="mt-2 text-sm leading-6 text-[#5f6962]">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="shell py-14 md:py-20" aria-labelledby="nf-next">
          <h2 id="nf-next" className="eyebrow">
            Helpful links
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DESTINATIONS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="glass-card-hover group flex h-full flex-col p-5 text-ink no-underline">
                  <span className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-accent-deep">
                    {item.kicker}
                  </span>
                  <span className="mt-3 flex items-center justify-between gap-2 text-lg font-bold tracking-[-0.03em]">
                    {item.title}
                    <span aria-hidden="true" className="text-accent-deep transition-transform duration-200 group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                  <span className="mt-1.5 text-sm leading-6 text-[#5f6962]">{item.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <Footer />
    </div>
  );
}
