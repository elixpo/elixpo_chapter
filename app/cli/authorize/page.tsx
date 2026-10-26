import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { TIER_LIMITS } from '@/lib/types';
import AuthorizeCliClient from './AuthorizeCliClient';

export const runtime = 'edge';

export const metadata: Metadata = {
  title: 'Authorize the Lixrl CLI',
  description: 'Review and approve a secure Lixrl Developer CLI API key.',
  robots: { index: false, follow: false },
};

export default async function AuthorizeCliPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { request: requestId } = await searchParams;
  const returnTo = `/cli/authorize?request=${encodeURIComponent(requestId || '')}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/api/auth/login?return_to=${encodeURIComponent(returnTo)}`);

  const db = getDB();
  const authRequest = requestId
    ? await db.prepare(
      `SELECT id, status FROM cli_auth_requests
       WHERE id = ? AND user_id = ? AND datetime(expires_at) > datetime('now')`,
    ).bind(requestId, user.id).first<{ id: string; status: string }>()
    : null;

  if (!authRequest || authRequest.status !== 'pending') {
    return (
      <AuthorizeShell>
        <div className="rounded-[1.4rem] border border-line bg-white p-7 text-center sm:p-10">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-paper-deep font-mono text-lg font-bold text-[#5f6962]" aria-hidden="true">
            ?
          </div>
          <p className="eyebrow">Developer CLI</p>
          <h1 className="app-title !text-[clamp(1.7rem,4vw,2.4rem)]">This CLI request is unavailable</h1>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[#5f6962]">
            It may have expired, been denied, or already been used. Run <code className="rounded-md border border-line bg-paper-soft px-1.5 py-0.5 font-mono text-ink">lixrl login</code> again.
          </p>
          <Link href="/docs/cli#sign-in" className="btn-secondary mt-7">
            Read the CLI guide
          </Link>
        </div>
      </AuthorizeShell>
    );
  }

  const keyCount = await db.prepare(
    `SELECT COUNT(*) as count FROM api_keys
     WHERE user_id = ? AND is_active = 1
     AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`,
  ).bind(user.id).first<{ count: number }>();
  const limits = TIER_LIMITS[user.tier];

  return (
    <AuthorizeShell>
      <AuthorizeCliClient
        requestId={authRequest.id}
        defaultName="Lixrl CLI"
        activeKeys={keyCount?.count || 0}
        maxKeys={limits.maxApiKeys}
      />
      <p className="mt-5 text-center text-xs leading-5 text-[#5f6962]">
        Approve only if you started this login from your own terminal. The request expires after ten minutes.
      </p>
    </AuthorizeShell>
  );
}

/** Focused, chrome-light frame for the device-login approval step. */
function AuthorizeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-paper-soft text-ink">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <span className="hero-orbit right-[-180px] top-[-160px] h-[460px] w-[460px] after:left-[52px] after:top-[70px] after:bg-[#3f7cec]" />
      </div>
      <header className="relative mx-auto flex w-[min(calc(100%-2rem),640px)] items-center justify-between pt-6">
        <Link href="/" className="inline-flex min-h-[44px] items-center gap-2.5 text-sm font-bold text-ink no-underline">
          <img src="/base_logo.png" alt="" width={32} height={32} className="h-8 w-8 rounded-full object-contain" />
          Lixrl
        </Link>
        <Link href="/docs/cli" className="text-sm font-semibold text-[#5f6962] no-underline transition-colors hover:text-ink">
          CLI docs
        </Link>
      </header>
      <main id="main-content" className="relative mx-auto w-[min(calc(100%-2rem),640px)] pb-14 pt-8 sm:pt-12">
        {children}
      </main>
    </div>
  );
}
