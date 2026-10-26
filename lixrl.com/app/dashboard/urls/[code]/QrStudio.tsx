'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import {
  buildQrOptions,
  getPreset,
  QR_PRESETS,
} from '@/lib/qr/presets';
import StyledQr, { type StyledQrHandle } from '@/app/components/qr/StyledQr';

interface Props {
  shortUrl: string;
  filename: string;
  presetId: string;
  onPresetChange: (id: string) => void;
  logoUrl: string;
  onLogoChange: (url: string) => void;
  /** Presets unlocked by the tier (-1 = all). */
  presetLimit: number;
  /** Whether the tier can add a logo. */
  allowLogo: boolean;
}

export default function QrStudio({
  shortUrl,
  filename,
  presetId,
  onPresetChange,
  logoUrl,
  onLogoChange,
  presetLimit,
  allowLogo,
}: Props) {
  const [logoDraft, setLogoDraft] = useState(logoUrl);
  const [error, setError] = useState<string | null>(null);
  const qrRef = useRef<StyledQrHandle>(null);

  const preset = getPreset(presetId);
  const mainOptions = useMemo(
    () => buildQrOptions(preset, { data: shortUrl, image: logoUrl, size: 1024 }),
    [preset, shortUrl, logoUrl],
  );

  const applyLogo = () => {
    const v = logoDraft.trim();
    if (v && !/^https?:\/\/.+/i.test(v)) {
      setError('Logo must be a public http(s) URL to a .png image.');
      return;
    }
    setError(null);
    onLogoChange(v);
  };

  const download = async () => {
    setError(null);
    await qrRef.current?.download();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Preview + downloads */}
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <div
          className="flex shrink-0 items-center justify-center rounded-[1.1rem] border border-line bg-white"
          style={{ width: 236, height: 236, maxWidth: '100%', padding: 8 }}
        >
          <StyledQr ref={qrRef} options={mainOptions} display={220} filename={filename} onError={setError} />
        </div>

        <div className="flex w-full flex-1 flex-col gap-4 self-stretch">
          {/* Logo URL */}
          <div>
            {allowLogo ? (
              <>
                <label htmlFor="qr-logo-url" className="field-label">
                  Logo image URL
                </label>
                <div className="flex gap-2">
                  <input
                    id="qr-logo-url"
                    type="url"
                    inputMode="url"
                    placeholder="https://yoursite.com/logo.png"
                    value={logoDraft}
                    onChange={(e) => setLogoDraft(e.target.value)}
                    onBlur={applyLogo}
                    onKeyDown={(e) => e.key === 'Enter' && applyLogo()}
                    aria-describedby="qr-logo-hint"
                    aria-invalid={error ? true : undefined}
                    className="control min-w-0 flex-1"
                  />
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setLogoDraft('');
                        onLogoChange('');
                        setError(null);
                      }}
                      className="btn-secondary btn-sm !min-h-[44px]"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p id="qr-logo-hint" className="field-hint">
                  Paste a public PNG URL — we don&apos;t host images. The QR always
                  exports as a vector SVG.
                </p>
              </>
            ) : (
              <>
                <p className="field-label">Logo image</p>
                <Link
                  href="/pricing"
                  className="notice notice--info !items-center justify-between no-underline"
                >
                  <span className="notice__body text-[0.84rem]">
                    Add your own logo with <strong>Pro</strong>
                  </span>
                  <span className="text-link text-[0.8rem]">Upgrade →</span>
                </Link>
              </>
            )}
          </div>

          <div aria-live="polite">
            {error && (
              <div role="alert" className="notice notice--danger !text-xs">
                <p className="notice__body">{error}</p>
              </div>
            )}
          </div>

          <button type="button" onClick={download} className="btn-primary mt-auto w-full">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Download SVG
          </button>
        </div>
      </div>

      {/* Style catalog */}
      <div role="group" aria-labelledby="qr-style-label">
        <div className="mb-3 flex items-center justify-between">
          <p id="qr-style-label" className="kicker">Style</p>
          {presetLimit !== -1 && (
            <Link href="/pricing" className="text-link text-[0.78rem]">
              Unlock all styles →
            </Link>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-8">
          {QR_PRESETS.map((p, i) => {
            const locked = presetLimit !== -1 && i >= presetLimit;
            const selected = p.id === presetId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  locked
                    ? setError('Upgrade to Pro to unlock the full style catalog.')
                    : onPresetChange(p.id)
                }
                title={locked ? `${p.name} — Pro` : p.name}
                aria-disabled={locked}
                aria-pressed={selected}
                aria-label={locked ? `${p.name} (Pro)` : p.name}
                className={`relative flex cursor-pointer flex-col items-center gap-1.5 rounded-[0.9rem] border p-2 transition-colors ${
                  selected
                    ? 'border-accent-main bg-accent-wash'
                    : 'border-line bg-white hover:border-[#c3c9c3] hover:bg-paper-soft'
                }`}
              >
                <div className="relative" style={{ opacity: locked ? 0.4 : 1 }}>
                  <ThumbQr preset={p} data={shortUrl} />
                  {locked && (
                    <span className="absolute inset-0 flex items-center justify-center text-ink">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="5" y="11" width="14" height="10" rx="2" />
                        <path d="M8 11V7a4 4 0 018 0v4" />
                      </svg>
                    </span>
                  )}
                </div>
                <span
                  className={`w-full truncate text-center text-[0.62rem] font-semibold ${
                    locked ? 'text-[#8a928c]' : selected ? 'text-accent-deep' : 'text-[#5f6962]'
                  }`}
                >
                  {p.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Small catalog thumbnail — its own lightweight instance (no logo). */
function ThumbQr({ preset, data }: { preset: (typeof QR_PRESETS)[number]; data: string }) {
  const options = useMemo(
    () => buildQrOptions(preset, { data, size: 160 }),
    [preset, data],
  );
  return (
    <div
      className="rounded-md overflow-hidden flex items-center justify-center"
      style={{ width: 52, height: 52, background: '#fff', padding: 3 }}
    >
      <StyledQr options={options} display={46} />
    </div>
  );
}
