'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useState } from 'react';

/** Guest (no-account) shortener used in the landing hero. */
export default function GuestShortener() {
  const [guestUrl, setGuestUrl] = useState('');
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState('');
  const [guestResult, setGuestResult] = useState<{
    short_url: string;
    expires_at: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function shortenGuestUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuestLoading(true);
    setGuestError('');
    setGuestResult(null);
    setCopied(false);

    try {
      const response = await fetch('/api/guest/urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: guestUrl }),
      });
      const data = (await response.json()) as {
        error?: string;
        short_url?: string;
        expires_at?: string;
      };
      if (!response.ok || !data.short_url || !data.expires_at) {
        setGuestError(data.error || 'Could not shorten this URL');
        return;
      }
      setGuestResult({
        short_url: data.short_url,
        expires_at: data.expires_at,
      });
    } catch {
      setGuestError('Could not reach the shortener. Please try again.');
    } finally {
      setGuestLoading(false);
    }
  }

  async function copyGuestUrl() {
    if (!guestResult) return;
    await navigator.clipboard.writeText(guestResult.short_url);
    setCopied(true);
  }

  return (
    <form onSubmit={shortenGuestUrl} className="mt-10 w-full max-w-[860px]" aria-describedby="guest-url-help">
      <div className="flex flex-col gap-2 rounded-[1.6rem] border border-[rgba(20,32,24,0.14)] bg-white p-2 shadow-header sm:flex-row sm:rounded-full">
        <label htmlFor="guest-url" className="sr-only">
          URL to shorten
        </label>
        <input
          id="guest-url"
          type="url"
          required
          inputMode="url"
          autoComplete="url"
          placeholder="https://your-long-url.com"
          value={guestUrl}
          onChange={(event) => setGuestUrl(event.target.value)}
          className="min-h-[48px] min-w-0 flex-1 rounded-full bg-transparent px-4 text-[15px] text-ink outline-none placeholder:text-[#8a928c] focus-visible:outline-none"
        />
        <button type="submit" disabled={guestLoading} className="btn-primary min-h-[48px] sm:min-w-[240px]">
          {guestLoading ? 'Shortening…' : 'Shorten Your URL in 1 Click'}
        </button>
      </div>
      <div className="mt-3 min-h-6 text-left" aria-live="polite">
        {guestError && (
          <p className="text-[0.8rem] text-[#b42318]" role="alert">
            {guestError}{' '}
            <Link href="/api/auth/login?return_to=/dashboard" className="font-semibold underline">
              Create an account
            </Link>
          </p>
        )}
        {guestResult && (
          <div className="rounded-[1.2rem] border border-[rgba(58,101,199,0.25)] bg-[#eef2ff] p-4 text-[0.82rem]">
            <div className="flex flex-wrap items-center gap-2">
              <a href={guestResult.short_url} className="min-w-0 truncate font-mono font-bold text-accent-deep">
                {guestResult.short_url}
              </a>
              <button
                type="button"
                onClick={copyGuestUrl}
                className="ml-auto inline-flex min-h-[36px] shrink-0 cursor-pointer items-center rounded-full border border-ink px-3 text-[0.75rem] font-bold text-ink"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-1 text-[#5f6962]">
              Expires in 24 hours.{' '}
              <Link href="/api/auth/login?return_to=/dashboard" className="font-semibold text-green underline">
                Create an account
              </Link>{' '}
              to keep links and manage them.
            </p>
          </div>
        )}
        {!guestError && !guestResult && (
          <div id="guest-url-help" className="flex flex-col gap-2 text-[0.78rem] text-[#5f6962] sm:flex-row sm:items-center sm:justify-between">
            <p>One guest link, valid for 24 hours. Sign in for persistent links.</p>
            <div className="flex shrink-0 flex-wrap items-center gap-4">
              <Link href="/api/auth/login?return_to=/dashboard" className="font-bold text-green no-underline hover:underline">
                Sign in for persistent links
              </Link>
              <Link href="/docs" className="font-semibold text-ink no-underline hover:underline">
                Explore the docs →
              </Link>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
