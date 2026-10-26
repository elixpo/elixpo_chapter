import Link from 'next/link';
import CopyEmailButton from './CopyEmailButton';

const EMAIL = 'hello@elixpo.com';
const REPO_URL = 'https://github.com/elixpo/elixpourl';
const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
const STATUS_URL = 'https://status.elixpo.com';
const ECOSYSTEM_URL = 'https://elixpo.com';
const ABUSE_REPORT_URL = 'https://github.com/elixpo/lixrl.com/issues/new?template=abuse-report.yml';

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

const PRODUCT_LINKS: FooterLink[] = [
  { label: 'Sign in with Elixpo', href: '/api/auth/login' },
  { label: 'About', href: '/about' },
  { label: 'QR Generator', href: '/generate' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Docs', href: '/docs' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Status', href: STATUS_URL, external: true },
];

const RESOURCE_LINKS: FooterLink[] = [
  { label: 'Report abuse', href: ABUSE_REPORT_URL, external: true },
  { label: 'Source on GitHub', href: REPO_URL, external: true },
  { label: 'Accounts SSO', href: 'https://accounts.elixpo.com', external: true },
  { label: 'Elixpo ecosystem', href: ECOSYSTEM_URL, external: true },
  { label: 'Security disclosure', href: 'mailto:hello@elixpo.com?subject=Security%20disclosure%20—%20ElixpoURL', external: true },
];

const LEGAL_LINKS: FooterLink[] = [
  { label: 'License', href: LICENSE_URL, external: true },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Trademark notice', href: `${REPO_URL}/blob/main/LICENSES/exceptions/Oreo-trademarks`, external: true },
];

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  const cls = 'inline-flex min-h-[28px] items-center text-[0.8rem] font-semibold text-ink no-underline transition-opacity hover:opacity-55';
  return (
    <nav aria-label={title}>
      <h2 className="mb-4 font-mono text-[0.63rem] font-bold uppercase tracking-[0.14em] text-[#5f6962]">{title}</h2>
      <ul className="list-none space-y-1.5 p-0">
        {links.map((l) => (
          <li key={l.label}>
            {l.external ? (
              <a
                href={l.href}
                target={l.href.startsWith('mailto:') ? undefined : '_blank'}
                rel={l.href.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
                className={cls}
              >
                {l.label}
                {!l.href.startsWith('mailto:') && <span aria-hidden="true">&nbsp;↗</span>}
              </a>
            ) : (
              <Link href={l.href} className={cls}>
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-line bg-white text-ink">
      <div className="shell grid grid-cols-1 gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:gap-12">
        <div className="max-w-[420px] sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-4">
            <img src="/base_logo.png" alt="" width={42} height={42} className="h-[42px] w-[42px] rounded-full object-contain" loading="lazy" />
            <div>
              <strong className="text-base">Lixrl</strong>
              <p className="mt-1 text-sm text-[#5f6962]">Short links and QR codes, built to be shared.</p>
            </div>
          </div>
          <p className="eyebrow mt-8">We protect privacy</p>
          <p className="mb-5 text-sm leading-relaxed text-[#5f6962]">
            Product updates and changelog — subscriptions open soon. Questions, partnerships, or security reports:
          </p>
          <CopyEmailButton email={EMAIL} />
        </div>

        <FooterColumn title="Product" links={PRODUCT_LINKS} />
        <FooterColumn title="Resources" links={RESOURCE_LINKS} />
        <FooterColumn title="Legal" links={LEGAL_LINKS} />
      </div>

      <div className="border-t border-line">
        <div className="shell flex flex-col gap-3 py-6 text-[0.75rem] text-[#5f6962] md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} Elixpo · Edge-native URL shortener · Code{' '}
            <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="text-green underline underline-offset-2">
              MIT
            </a>
            , assets{' '}
            <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="text-green underline underline-offset-2">
              CC-BY-4.0
            </a>
            , brand reserved
          </p>
          <div className="flex items-center gap-3">
            <span>URL infrastructure for the Elixpo ecosystem</span>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View on GitHub (opens in a new tab)"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink no-underline transition-colors hover:bg-paper-deep"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
