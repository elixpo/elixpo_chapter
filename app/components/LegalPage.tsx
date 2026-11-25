import type { ReactNode } from 'react';
import Footer from './Footer';
import Navbar from './Navbar';

export interface LegalSummary {
  title: string;
  detail: string;
}

export interface LegalNavItem {
  id: string;
  label: string;
}

const CONTACT = 'hello@elixpo.com';

/** "3. Guest shortening" → ['03', 'Guest shortening']; unnumbered titles pass through. */
function splitNumber(title: string): [string | null, string] {
  const match = /^(\d+)\.\s+(.*)$/.exec(title);
  return match ? [match[1].padStart(2, '0'), match[2]] : [null, title];
}

function ContentsList({ navigation }: { navigation: LegalNavItem[] }) {
  return (
    <ol className="space-y-0.5">
      {navigation.map((item, index) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            className="group flex min-h-[40px] items-center gap-3 rounded-full px-3 text-sm font-medium text-[#3d4842] no-underline transition-colors hover:bg-paper-deep hover:text-ink"
          >
            <span className="font-mono text-[0.68rem] font-bold text-[#5f6962] transition-colors group-hover:text-accent-deep">
              {String(index + 1).padStart(2, '0')}
            </span>
            {item.label}
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * Long-form legal document layout (privacy, terms): research-style record
 * header with an at-a-glance summary, sticky contents, numbered sections.
 */
export function LegalPage({
  eyebrow,
  title,
  intro,
  summaries,
  navigation,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  summaries: LegalSummary[];
  navigation: LegalNavItem[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <Navbar />
      <main id="main-content">
        <header className="shell grid gap-10 border-b border-line pb-12 pt-12 md:pb-16 md:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-end lg:gap-16">
          <div className="min-w-0">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="display-1 !text-[clamp(2.5rem,7vw,5.6rem)]">{title}</h1>
            <p className="lede mt-6 max-w-2xl">{intro}</p>
          </div>

          <section aria-labelledby="legal-glance" className="rounded-[1.4rem] border border-line bg-white p-6 md:p-7">
            <h2 id="legal-glance" className="eyebrow !mb-5">
              At a glance
            </h2>
            <dl className="divide-y divide-[#e3e6e1]">
              {summaries.map((item) => (
                <div key={item.title} className="py-3.5 first:pt-0 last:pb-0">
                  <dt className="text-[0.95rem] font-bold tracking-[-0.02em] text-ink">{item.title}</dt>
                  <dd className="mt-1 text-sm leading-6 text-[#5f6962]">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </section>
        </header>

        <div className="shell grid gap-10 pb-24 pt-10 md:pt-14 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
          <nav aria-label="Contents" className="lg:sticky lg:top-28 lg:self-start">
            <details className="group rounded-[1.4rem] border border-line bg-white lg:hidden">
              <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 rounded-[1.4rem] px-5 text-sm font-bold [&::-webkit-details-marker]:hidden">
                Contents
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#5f6962] transition-transform duration-200 group-open:rotate-180">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <div className="border-t border-line p-2">
                <ContentsList navigation={navigation} />
              </div>
            </details>
            <div className="hidden lg:block">
              <p className="mb-3 px-3 font-mono text-[0.63rem] font-bold uppercase tracking-[0.16em] text-[#5f6962]">Contents</p>
              <ContentsList navigation={navigation} />
              <p className="mt-6 border-t border-line px-3 pt-5 text-xs leading-5 text-[#5f6962]">
                Questions?{' '}
                <a href={`mailto:${CONTACT}`} className="font-semibold text-green underline decoration-[#9cc4ad] underline-offset-4">
                  {CONTACT}
                </a>
              </p>
            </div>
          </nav>

          <article className="min-w-0 max-w-[760px] text-[15px] leading-[1.8] text-[#3d4842] md:text-base">{children}</article>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [number, text] = splitNumber(title);
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-28 border-t border-line py-10 first:border-0 first:pt-0">
      <h2 id={`${id}-heading`} className="mb-5 flex items-baseline gap-4 text-[clamp(1.55rem,3vw,2.2rem)] font-bold leading-[1.08] tracking-[-0.05em] text-ink">
        {number && (
          <span className="font-mono text-[0.75rem] font-bold tracking-normal text-accent-deep">
            {number}
            <span className="sr-only">.</span>
          </span>
        )}
        <span>{text}</span>
      </h2>
      <div className="space-y-4 [&_a]:font-medium [&_a]:text-green [&_a]:underline [&_a]:decoration-[#9cc4ad] [&_a]:underline-offset-4 [&_a:hover]:decoration-current [&_li]:relative [&_li]:pl-5 [&_li]:before:absolute [&_li]:before:left-0.5 [&_li]:before:top-[0.75em] [&_li]:before:h-1.5 [&_li]:before:w-1.5 [&_li]:before:rounded-full [&_li]:before:bg-accent-main [&_strong]:text-ink [&_ul]:space-y-2.5">
        {children}
      </div>
    </section>
  );
}

export function LegalNote({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="flex gap-3 rounded-[1.2rem] border border-[rgba(58,101,199,0.22)] bg-[#eef3ff] px-5 py-4 text-sm leading-6 text-[#3d4842]">
      <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-deep font-serif text-[0.75rem] italic text-white">
        i
      </span>
      <div>{children}</div>
    </div>
  );
}
