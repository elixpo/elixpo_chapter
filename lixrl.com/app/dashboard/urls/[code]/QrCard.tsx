'use client';

import { useMemo, useRef, useState } from 'react';
import Modal from '@/app/components/Modal';
import StyledQr, { type StyledQrHandle } from '@/app/components/qr/StyledQr';
import {
  buildQrOptions,
  DEFAULT_PRESET_ID,
  getPreset,
} from '@/lib/qr/presets';
import QrStudio from './QrStudio';

interface Props {
  shortUrl: string;
  /** Number of QR presets the tier unlocks (-1 = full catalog). */
  presetLimit: number;
  /** Whether the tier can add a custom logo to the QR. */
  allowLogo: boolean;
}

const QR_DISPLAY = 220;
const QR_BACKBUFFER = 1024; // crisp downloads regardless of on-screen size

/**
 * Per-URL QR card. Renders a styled QR (qr-code-styling, client-side only —
 * the lib touches the DOM and can't run on the edge) and opens a studio for
 * picking a style from the catalog and adding a logo by public URL.
 */
export default function QrCard({ shortUrl, presetLimit, allowLogo }: Props) {
  const [presetId, setPresetId] = useState(DEFAULT_PRESET_ID);
  const [logoUrl, setLogoUrl] = useState('');
  const [studioOpen, setStudioOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qrRef = useRef<StyledQrHandle>(null);

  const slug = shortUrl.split('/').filter(Boolean).pop() || 'qr';
  const filename = `elixpourl-${slug}`;

  const options = useMemo(
    () => buildQrOptions(getPreset(presetId), { data: shortUrl, image: logoUrl, size: QR_BACKBUFFER }),
    [presetId, logoUrl, shortUrl],
  );

  return (
    <section className="panel" aria-labelledby="qr-title">
      <div className="panel-head">
        <h2 id="qr-title" className="panel-title">QR code</h2>
        <span className="pill pill--blue">Styled</span>
      </div>

      <div className="flex w-full flex-col items-center gap-4">
        <div
          className="flex items-center justify-center rounded-[1.1rem] border border-line bg-white"
          style={{
            width: QR_DISPLAY + 16,
            height: QR_DISPLAY + 16,
            maxWidth: '100%',
            flexShrink: 0,
            padding: 8,
            boxSizing: 'border-box',
          }}
        >
          <StyledQr
            ref={qrRef}
            options={options}
            display={QR_DISPLAY}
            filename={filename}
            onError={setError}
          />
        </div>

        {error && (
          <div role="alert" className="notice notice--danger w-full !text-xs">
            <p className="notice__body">{error}</p>
          </div>
        )}

        <div className="grid w-full grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => qrRef.current?.download('svg')}
            className="btn-primary btn-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            SVG
            <span className="sr-only"> download</span>
          </button>

          <button
            type="button"
            onClick={() => qrRef.current?.download('png')}
            className="btn-secondary btn-sm"
          >
            PNG
            <span className="sr-only"> download</span>
          </button>

          <button
            type="button"
            onClick={() => setStudioOpen(true)}
            className="btn-secondary btn-sm col-span-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <line x1="2" y1="2" x2="7.586" y2="7.586" />
              <circle cx="11" cy="11" r="2" />
            </svg>
            Customize
          </button>
        </div>
      </div>

      <Modal
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        title="Customize QR code"
        description="Pick a style and add your logo by public URL."
        size="lg"
      >
        <QrStudio
          shortUrl={shortUrl}
          filename={filename}
          presetId={presetId}
          onPresetChange={setPresetId}
          logoUrl={logoUrl}
          onLogoChange={setLogoUrl}
          presetLimit={presetLimit}
          allowLogo={allowLogo}
        />
      </Modal>
    </section>
  );
}
