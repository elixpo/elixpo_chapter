'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import StyledQr, { type StyledQrHandle } from '@/app/components/qr/StyledQr';
import {
  buildQrOptions,
  DEFAULT_PRESET_ID,
  getPreset,
  QR_PRESETS,
} from '@/lib/qr/presets';

interface AccountState {
  loaded: boolean;
  loggedIn: boolean;
  tier: string;
  presetLimit: number;
  allowLogo: boolean;
}

interface TrackedResult {
  short_url: string;
  short_code: string;
}

type ExportFormat = 'svg' | 'png' | 'jpeg';

const BASIC_PRESET_LIMIT = 3;
const QR_SIZE = 1024;

function normalizeWebUrl(value: string): string | null {
  try {
    const input = value.trim();
    if (!input) return null;
    const hasWebScheme = /^https?:\/\//i.test(input);
    const hasOtherScheme = /^[a-z][a-z\d+.-]*:/i.test(input)
      && !/^[a-z\d.-]+:\d+(?:[/?#]|$)/i.test(input);
    if (!hasWebScheme && hasOtherScheme) return null;
    const withScheme = hasWebScheme ? input : `https://${input}`;
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function qrFilename(value: string): string {
  const url = new URL(value);
  const source = `${url.hostname.replace(/^www\./i, '')}${url.pathname === '/' ? '' : `-${url.pathname}`}`;
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72)
    .replace(/-$/g, '');
  return `lixrl-qr-${slug || 'link'}`;
}

export default function QrGenerator() {
  const [destination, setDestination] = useState('');
  const [qrData, setQrData] = useState<string | null>(null);
  const [generatedFor, setGeneratedFor] = useState<string | null>(null);
  const [presetId, setPresetId] = useState(DEFAULT_PRESET_ID);
  const [logoUrl, setLogoUrl] = useState('');
  const [trackScans, setTrackScans] = useState(false);
  const [trackedResult, setTrackedResult] = useState<TrackedResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('svg');
  const [account, setAccount] = useState<AccountState>({
    loaded: false,
    loggedIn: false,
    tier: 'free',
    presetLimit: BASIC_PRESET_LIMIT,
    allowLogo: false,
  });
  const qrRef = useRef<StyledQrHandle>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{
          tier?: string;
          limits?: { qrPresets?: number; qrLogo?: boolean };
        }>;
      })
      .then((data) => {
        if (!alive) return;
        setAccount({
          loaded: true,
          loggedIn: !!data,
          tier: data?.tier || 'free',
          presetLimit: data?.limits?.qrPresets ?? BASIC_PRESET_LIMIT,
          allowLogo: data?.limits?.qrLogo ?? false,
        });
      })
      .catch(() => {
        if (alive) {
          setAccount({
            loaded: true,
            loggedIn: false,
            tier: 'free',
            presetLimit: BASIC_PRESET_LIMIT,
            allowLogo: false,
          });
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const paid = account.loggedIn && account.tier !== 'free';
  const options = useMemo(
    () =>
      buildQrOptions(getPreset(presetId), {
        data: qrData || 'https://lixrl.com',
        image: paid ? logoUrl : '',
        size: QR_SIZE,
      }),
    [logoUrl, paid, presetId, qrData],
  );

  const generate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setCopied(false);
    setImageCopied(false);
    setTrackedResult(null);

    // Read the submitted field: browser autofill may update the DOM without
    // firing the React change event that keeps destination state in sync.
    const submitted = new FormData(event.currentTarget).get('destination');
    const normalized = normalizeWebUrl(typeof submitted === 'string' ? submitted : destination);
    if (!normalized) {
      setError('Paste a valid website URL, such as example.com or https://example.com/page.');
      return;
    }
    setDestination(normalized);
    if (logoUrl && !normalizeWebUrl(logoUrl)) {
      setError('The logo must be a public http(s) image URL.');
      return;
    }

    if (!trackScans) {
      setGeneratedFor(normalized);
      setQrData(normalized);
      return;
    }
    if (!paid) {
      setError('Tracked QR codes require Pro or Business.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/qr/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized, title: 'QR code destination' }),
      });
      const data = (await response.json().catch(() => null)) as
        | (TrackedResult & { error?: string })
        | { error?: string }
        | null;
      if (!response.ok || !data || !('short_url' in data)) {
        setError(data?.error || 'Could not create the tracked QR code.');
        return;
      }
      const result = data as TrackedResult;
      setTrackedResult(result);
      setGeneratedFor(normalized);
      setQrData(result.short_url);
    } catch {
      setError('Network error while creating the tracked QR code.');
    } finally {
      setBusy(false);
    }
  };

  const copyQrLink = async () => {
    if (!qrData) return;
    try {
      await navigator.clipboard.writeText(qrData);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy the QR destination.');
    }
  };

  const copyCompressedJpeg = async () => {
    setError('');
    setImageCopied(false);
    const success = await qrRef.current?.copyJpeg(0.82);
    if (success) {
      setImageCopied(true);
      window.setTimeout(() => setImageCopied(false), 1800);
    }
  };

  const formatLabel = exportFormat === 'jpeg' ? 'JPG' : exportFormat.toUpperCase();

  return (
    <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] lg:items-start">
      <form
        onSubmit={generate}
        className="rounded-[1.4rem] border border-line bg-white p-5 sm:p-7 md:p-9"
        aria-describedby={error ? 'qr-error' : undefined}
      >
        {/* Step 1 — destination */}
        <div>
          <p className="qr-step" aria-hidden="true">01</p>
          <label htmlFor="qr-destination" className="block text-lg font-bold tracking-[-0.03em] text-ink">
            Link to turn into a QR code
          </label>
          <p id="qr-destination-hint" className="mt-1 text-sm text-[#5f6962]">
            Any public web address. We add https:// if you leave it out.
          </p>
          <div className="mt-4 flex flex-col gap-2 rounded-[1.4rem] border border-line bg-paper-soft p-1.5 transition-[border-color,box-shadow] duration-200 focus-within:border-accent-main focus-within:shadow-glow-accent sm:flex-row sm:rounded-full">
            <input
              id="qr-destination"
              name="destination"
              type="text"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required
              aria-describedby="qr-destination-hint"
              aria-invalid={error ? true : undefined}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="https://example.com/page"
              className="min-h-[46px] min-w-0 flex-1 rounded-full bg-transparent px-4 text-[0.95rem] text-ink outline-none placeholder:text-[#737b75] focus-visible:outline-none"
            />
            <button type="submit" disabled={busy} aria-busy={busy} className="btn-primary shrink-0 disabled:cursor-wait">
              {busy ? 'Creating…' : 'Generate QR code'}
            </button>
          </div>
        </div>

        {/* Step 2 — style */}
        <div className="mt-9 border-t border-line pt-8" role="group" aria-labelledby="qr-style-heading">
          <p className="qr-step" aria-hidden="true">02</p>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="qr-style-heading" className="text-lg font-bold tracking-[-0.03em] text-ink">Choose a style</h2>
            {!paid && (
              <Link href="/pricing" className="text-sm font-semibold text-green underline decoration-[#9cc4ad] underline-offset-4">
                Unlock every style
              </Link>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {QR_PRESETS.map((preset, index) => {
              const locked = account.presetLimit !== -1 && index >= account.presetLimit;
              const selected = preset.id === presetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={selected}
                  aria-disabled={locked}
                  onClick={() => {
                    if (locked) {
                      setError('Upgrade to Pro to unlock every QR style.');
                      return;
                    }
                    setError('');
                    setPresetId(preset.id);
                  }}
                  className={`flex min-h-[48px] items-center gap-2.5 rounded-2xl border px-3 text-left text-[0.82rem] font-bold transition-[border-color,background-color,box-shadow] duration-200 ${
                    selected
                      ? 'border-accent-main bg-[#eef3ff] text-ink shadow-glow-accent'
                      : locked
                        ? 'border-line bg-paper-soft text-[#5f6962] hover:border-[#c3c9c3]'
                        : 'border-line bg-white text-ink hover:border-[#c3c9c3] hover:bg-paper-soft'
                  }`}
                >
                  <span
                    className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-black/10"
                    style={{ background: preset.swatch, opacity: locked ? 0.55 : 1 }}
                    aria-hidden="true"
                  >
                    <span className="absolute inset-[7px] rounded-[2px] border-2 border-white/90" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{preset.name}</span>
                  {locked && (
                    <span className="badge shrink-0 border border-line bg-white px-1.5 text-[0.58rem] text-[#5f6962]">
                      Pro<span className="sr-only"> (locked)</span>
                    </span>
                  )}
                  {selected && !locked && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-main text-[0.65rem] text-white" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 3 — extras */}
        <div className="mt-9 border-t border-line pt-8">
          <p className="qr-step" aria-hidden="true">03</p>
          <h2 className="text-lg font-bold tracking-[-0.03em] text-ink">Extras</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.2rem] border border-line bg-paper-soft p-4">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="qr-logo" className="text-sm font-bold text-ink">
                  Center logo
                </label>
                {!account.allowLogo && <span className="badge border border-line bg-white text-[#5f6962]">Pro</span>}
              </div>
              {account.allowLogo ? (
                <input
                  id="qr-logo"
                  type="url"
                  value={logoUrl}
                  onChange={(event) => setLogoUrl(event.target.value)}
                  placeholder="https://site.com/logo.png"
                  className="input-field mt-3 min-h-[42px] text-[0.82rem]"
                />
              ) : (
                <>
                  <p className="mt-1 text-[0.8rem] leading-5 text-[#5f6962]">Place your mark in the middle of the code.</p>
                  <Link href="/pricing" className="mt-2 inline-flex min-h-[32px] items-center text-[0.8rem] font-semibold text-green underline decoration-[#9cc4ad] underline-offset-4">
                    Unlock logo
                  </Link>
                </>
              )}
            </div>

            <div className="rounded-[1.2rem] border border-line bg-paper-soft p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-ink">Scan analytics</span>
                {!paid && <span className="badge border border-line bg-white text-[#5f6962]">Paid</span>}
              </div>
              {paid ? (
                <label className="mt-3 flex min-h-[32px] cursor-pointer items-center gap-2.5 text-[0.82rem] font-semibold text-[#3d4842]">
                  <input
                    type="checkbox"
                    checked={trackScans}
                    onChange={(event) => setTrackScans(event.target.checked)}
                    className="h-4 w-4 accent-[#3a65c7]"
                  />
                  Create a tracked Lixrl link
                </label>
              ) : (
                <>
                  <p className="mt-1 text-[0.8rem] leading-5 text-[#5f6962]">Count scans through a Lixrl short link.</p>
                  <Link
                    href={account.loggedIn ? '/pricing' : '/api/auth/login?return_to=%2Fgenerate'}
                    className="mt-2 inline-flex min-h-[32px] items-center text-[0.8rem] font-semibold text-green underline decoration-[#9cc4ad] underline-offset-4"
                  >
                    {account.loggedIn ? 'Upgrade for scan analytics' : 'Sign in to view options'}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div id="qr-error" className="mt-6 flex items-start gap-3 rounded-[1.1rem] border border-[#fecdca] bg-[#fef3f2] px-4 py-3 text-sm text-[#b42318]" role="alert">
            <span aria-hidden="true" className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#b42318] text-[0.7rem] font-bold text-white">!</span>
            {error}
          </div>
        )}
      </form>

      <section
        aria-labelledby="qr-preview-heading"
        className="qr-preview flex min-h-[360px] flex-col items-center justify-center rounded-[1.4rem] border border-line p-4 text-center sm:p-7 lg:sticky lg:top-28"
      >
        <h2 id="qr-preview-heading" className="sr-only">
          QR code preview
        </h2>
        {qrData ? (
          <>
            <div className="rounded-[1.4rem] bg-white p-3 shadow-object">
              <StyledQr
                ref={qrRef}
                options={options}
                display={260}
                filename={qrFilename(generatedFor || qrData)}
                onError={setError}
              />
            </div>
            <p className="mt-5 max-w-sm break-all font-mono text-xs leading-5 text-[#5f6962]">
              <span className="sr-only">Encodes </span>
              {qrData}
            </p>
            {trackedResult && (
              <Link
                href={`/dashboard/urls/${encodeURIComponent(trackedResult.short_code)}`}
                className="mt-2 text-sm font-semibold text-green underline decoration-[#9cc4ad] underline-offset-4"
              >
                Open scan analytics
              </Link>
            )}

            <div className="mt-6 w-full max-w-[420px] rounded-[1.2rem] border border-line bg-white p-3 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#5f6962]" id="qr-format-label">
                  Format
                </span>
                <div className="inline-flex rounded-full border border-line bg-paper-soft p-1" role="group" aria-labelledby="qr-format-label">
                  {(['svg', 'png', 'jpeg'] as ExportFormat[]).map((format) => (
                    <button
                      key={format}
                      type="button"
                      aria-pressed={exportFormat === format}
                      onClick={() => setExportFormat(format)}
                      className={`min-h-[34px] rounded-full px-3.5 text-[0.7rem] font-bold uppercase transition-colors duration-200 ${
                        exportFormat === format ? 'bg-ink text-white' : 'text-[#5f6962] hover:text-ink'
                      }`}
                    >
                      {format === 'jpeg' ? 'JPG' : format}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => qrRef.current?.download(exportFormat)}
                className="btn-primary mt-3 w-full"
              >
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16" />
                </svg>
                Download {formatLabel}
              </button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={copyCompressedJpeg} className="btn-secondary min-h-[42px] px-3 text-[0.75rem]">
                  {imageCopied ? 'JPG copied' : 'Copy JPG'}
                </button>
                <button type="button" onClick={copyQrLink} className="btn-secondary min-h-[42px] px-3 text-[0.75rem]">
                  {copied ? 'Copied' : 'Copy link'}
                </button>
              </div>
              <p className="sr-only" role="status" aria-live="polite">
                {imageCopied ? 'Compressed JPG copied to clipboard.' : copied ? 'QR link copied to clipboard.' : ''}
              </p>
            </div>
          </>
        ) : (
          <div className="max-w-xs">
            <div className="qr-placeholder mx-auto" aria-hidden="true">
              {Array.from({ length: 49 }, (_, index) => (
                <span key={index} />
              ))}
            </div>
            <p className="mt-6 text-base font-bold text-ink">Your QR code appears here</p>
            <p className="mt-1 text-sm leading-6 text-[#5f6962]">Paste a link and press Generate. Nothing is uploaded for basic codes.</p>
          </div>
        )}
      </section>
    </div>
  );
}
