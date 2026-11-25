'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Modal from '@/app/components/Modal';

type SlugStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'taken'; reason: string };

export default function ShortenPage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [campaign, setCampaign] = useState('');
  const [tags, setTags] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [result, setResult] = useState<{ short_url: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tier, setTier] = useState<string>('free');
  const [copied, setCopied] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>({ state: 'idle' });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPro = tier !== 'free';

  // Load tier once on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if ((d as any).tier) setTier((d as any).tier);
      })
      .catch(() => {});
  }, []);

  // Debounced live slug availability check against /api/urls/check
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = customCode.trim();
    if (!trimmed) {
      setSlugStatus({ state: 'idle' });
      return;
    }
    setSlugStatus({ state: 'checking' });
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/urls/check?slug=${encodeURIComponent(trimmed)}`,
        );
        const data: any = await res.json();
        if (data.available) {
          setSlugStatus({ state: 'available' });
        } else {
          setSlugStatus({ state: 'taken', reason: data.reason || 'Unavailable' });
        }
      } catch {
        setSlugStatus({ state: 'idle' });
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [customCode]);

  const closeAndGoBack = () => {
    router.push('/dashboard');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    const body: Record<string, unknown> = { url };
    if (isPro && customCode) body.custom_code = customCode;
    if (isPro && expiresAt) body.expires_at = new Date(expiresAt).toISOString();
    if (campaign.trim()) body.campaign = campaign.trim();
    if (tags.trim()) body.tags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (utmSource || utmMedium || utmCampaign) {
      body.utm = { source: utmSource, medium: utmMedium, campaign: utmCampaign };
    }

    try {
      const res = await fetch('/api/urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data: any = await res.json();
      if (data.short_url) {
        setResult(data);
        setUrl('');
        setCustomCode('');
        setExpiresAt('');
        setCampaign('');
        setTags('');
        setUtmSource('');
        setUtmMedium('');
        setUtmCampaign('');
        setSlugStatus({ state: 'idle' });
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.short_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Slug-helper bottom-line: live availability hint
  const slugHelper = (() => {
    switch (slugStatus.state) {
      case 'checking':
        return { text: 'Checking availability…', className: 'field-hint' };
      case 'available':
        return { text: '✓ Available', className: 'field-hint field-hint--ok' };
      case 'taken':
        return { text: `✗ ${slugStatus.reason}`, className: 'field-hint field-hint--error' };
      default:
        return {
          text: '3–32 chars. Letters, numbers, dash, underscore.',
          className: 'field-hint',
        };
    }
  })();

  const submitDisabled = loading || !url || (isPro && slugStatus.state === 'taken');

  return (
    <>
      <h1 className="sr-only">Shorten a URL</h1>
      {/* Shorten URL modal — open while on this route, close → /dashboard. */}
      <Modal
        open={!result}
        onClose={closeAndGoBack}
        title="Shorten a URL"
        description={
          isPro
            ? 'Pick a custom slug or let us generate one.'
            : 'We\'ll generate a short code for you. Upgrade for custom slugs and expirations.'
        }
        size="md"
        disableBackdropClose={loading}
      >
        <form onSubmit={handleSubmit} aria-busy={loading}>
          <div className="field">
            <label htmlFor="dest-url" className="field-label">
              Destination URL
            </label>
            <input
              id="dest-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/your-long-url"
              required
              autoFocus
              autoComplete="url"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'shorten-error' : undefined}
              className="control"
            />
          </div>

          {/* Slug + live availability — Pro only */}
          {isPro && (
            <div className="field">
              <label htmlFor="slug" className="field-label">
                Custom slug<span className="optional">(optional)</span>
              </label>
              <div className="control-wrap">
                <input
                  id="slug"
                  type="text"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value)}
                  placeholder="e.g. launch, blog-q1"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="slug-hint"
                  aria-invalid={slugStatus.state === 'taken' ? true : undefined}
                  data-valid={slugStatus.state === 'available' ? 'true' : undefined}
                  className="control control--mono !pr-10"
                />
                {slugStatus.state === 'checking' && (
                  <span
                    className="spinner absolute right-3.5 top-1/2 -mt-[7px] text-accent-main"
                    aria-hidden="true"
                  />
                )}
              </div>
              <p id="slug-hint" className={slugHelper.className} aria-live="polite">
                {slugHelper.text}
              </p>
            </div>
          )}

          {/* Expiration — Pro only */}
          {isPro && (
            <div className="field">
              <label htmlFor="expires" className="field-label">
                Expires<span className="optional">(optional)</span>
              </label>
              <input
                id="expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="control"
                style={{ colorScheme: 'light' }}
              />
            </div>
          )}

          <details className="disclosure mt-5">
            <summary>Campaign and UTM options</summary>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CampaignField id="campaign" label="Campaign label" value={campaign} onChange={setCampaign} placeholder="Q3 launch" />
              <CampaignField id="tags" label="Tags (comma-separated)" value={tags} onChange={setTags} placeholder="social, launch" />
              <CampaignField id="utm-source" label="UTM source" value={utmSource} onChange={setUtmSource} placeholder="newsletter" />
              <CampaignField id="utm-medium" label="UTM medium" value={utmMedium} onChange={setUtmMedium} placeholder="email" />
              <CampaignField id="utm-campaign" label="UTM campaign" value={utmCampaign} onChange={setUtmCampaign} placeholder="q3-launch" />
            </div>
          </details>

          {/* Free-tier callout */}
          {!isPro && (
            <div className="notice notice--info mt-5 !text-[0.82rem]">
              <p className="notice__body">
                <strong className="text-accent-deep">Free plan</strong> —
                auto-generated codes, no expiration. Upgrade for custom slugs and
                expirations.
              </p>
            </div>
          )}

          <div aria-live="assertive">
            {error && (
              <div id="shorten-error" role="alert" className="notice notice--danger mt-5">
                <p className="notice__body">{error}</p>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeAndGoBack}
              disabled={loading}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitDisabled}
              aria-busy={loading}
              className="btn-primary"
            >
              {loading && <span className="spinner" aria-hidden="true" />}
              {loading ? 'Shortening…' : 'Shorten URL'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Result modal — appears after successful shorten. Close → /dashboard. */}
      <Modal
        open={!!result}
        onClose={closeAndGoBack}
        title="Your short link"
        description="Ready to share. Copy it now or jump to its analytics page."
        size="md"
      >
        <p className="kicker mb-2">Short URL</p>
        <div className="mono-box mb-5 !text-[0.95rem]">{result?.short_url}</div>
        <p className="sr-live" aria-live="polite">
          {copied ? 'Short link copied to clipboard' : ''}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => {
              setResult(null);
            }}
            className="btn-secondary"
          >
            Shorten another
          </button>
          <button type="button" onClick={handleCopy} className="btn-secondary">
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button type="button" onClick={closeAndGoBack} className="btn-primary">
            Done
          </button>
        </div>
      </Modal>
    </>
  );
}

function CampaignField({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="control" />
    </div>
  );
}
