'use client';

import Link from 'next/link';

// Shared error boundary body for the logged-in app routes.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="panel" role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="app-title">
        This page didn&apos;t <em className="font-serif font-normal">load</em>.
      </h1>
      <p className="page-header__lede">
        A temporary error stopped us from loading your data. Your links keep
        redirecting while this is resolved. Try again, or head back to the
        dashboard.
      </p>
      {error.digest && (
        <p className="kicker" style={{ marginTop: '1rem' }}>
          Reference: {error.digest}
        </p>
      )}
      <div className="page-header__actions" style={{ marginTop: '1.5rem' }}>
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/dashboard" className="btn-secondary">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
