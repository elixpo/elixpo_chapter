import Link from 'next/link';
import { redirect } from 'next/navigation';
import { noIndexMetadata } from '@/lib/seo';

export const runtime = 'edge';

export const metadata = noIndexMetadata('Sign in');

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Sign-in was cancelled or access was denied at Elixpo Accounts.',
  invalid_scope: 'Elixpo Accounts rejected the requested permissions for this app.',
  temporarily_unavailable: 'Elixpo Accounts is temporarily not accepting sign-ins for this app.',
  invalid_state: 'Your sign-in session expired or was already used. Please start again.',
  invalid_request: 'The sign-in response was missing required information.',
  server_error: 'We could not complete sign-in with Elixpo Accounts.',
};

type SearchParams = Promise<{ error?: string; error_description?: string; return_to?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { error, error_description, return_to } = await searchParams;

  // No error: start the SSO flow. With an error we must NOT auto-redirect,
  // otherwise a provider-side rejection loops the user through OAuth forever.
  if (!error) {
    const safe = return_to && return_to.startsWith('/') && !return_to.startsWith('//') ? return_to : null;
    redirect(safe ? `/api/auth/login?return_to=${encodeURIComponent(safe)}` : '/api/auth/login');
  }

  const message = ERROR_MESSAGES[error] ?? 'Sign-in failed.';

  return (
    <div className="relative min-h-screen overflow-hidden bg-paper-soft text-ink">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <span className="hero-orbit right-[-180px] top-[-160px] h-[460px] w-[460px] after:left-[52px] after:top-[70px] after:bg-[#e76043]" />
        <span className="hero-orbit -bottom-[120px] -left-[120px] h-[280px] w-[280px] after:right-[30px] after:top-[30px] after:bg-[#3f7cec]" />
      </div>

      <header className="relative mx-auto flex w-[min(calc(100%-2rem),560px)] items-center pt-6">
        <Link href="/" className="inline-flex min-h-[44px] items-center gap-2.5 text-sm font-bold text-ink no-underline">
          <img src="/base_logo.png" alt="" width={32} height={32} className="h-8 w-8 rounded-full object-contain" />
          Lixrl
        </Link>
      </header>

      <main id="main-content" className="relative mx-auto flex min-h-[calc(100vh-140px)] w-[min(calc(100%-2rem),560px)] items-center py-10">
        <div className="w-full rounded-[1.4rem] border border-line bg-white p-7 sm:p-10">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-[#fde2dc] text-[#a12a14]" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
          <p className="eyebrow">Elixpo Accounts · Sign-in</p>
          <h1 className="app-title">Sign-in failed</h1>
          <p className="mt-4 text-[0.95rem] leading-7 text-[#3d4842]">{message}</p>
          {error_description && <p className="mt-2 text-sm leading-6 text-[#5f6962]">{error_description}</p>}

          <dl className="mt-6 flex flex-wrap items-center gap-2 rounded-[1.1rem] border border-line bg-paper-soft px-4 py-3">
            <dt className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#5f6962]">Error code</dt>
            <dd>
              <code className="break-all font-mono text-[0.8rem] text-ink">{error}</code>
            </dd>
          </dl>

          <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row">
            <a href="/api/auth/login" className="btn-primary">
              Try again
            </a>
            <Link href="/" className="btn-secondary">
              Back to home
            </Link>
          </div>
          <p className="mt-6 text-xs leading-5 text-[#5f6962]">
            Still stuck? Email{' '}
            <a href="mailto:hello@elixpo.com" className="font-semibold text-green underline decoration-[#9cc4ad] underline-offset-4">
              hello@elixpo.com
            </a>{' '}
            with the error code above.
          </p>
        </div>
      </main>
    </div>
  );
}
