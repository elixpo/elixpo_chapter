import { ImageResponse } from 'next/og';
import { BRAND_COLOR } from './seo';

/** Shared renderer for app/opengraph-image.tsx and app/twitter-image.tsx. */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = 'Lixrl — free URL shortener, QR code generator, and link analytics';

export function renderOgImage() {
  const chips = ['Short links', 'QR codes', 'Link analytics', 'API + CLI'];
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: 'radial-gradient(circle at 85% 15%, rgba(155,123,247,0.45), transparent 55%), radial-gradient(circle at 10% 100%, rgba(124,92,255,0.30), transparent 50%), #0b0a12',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: `linear-gradient(135deg, ${BRAND_COLOR}, #2f56b0)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            L
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>lixrl.com</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 1000 }}>
            Free URL shortener & QR code generator
          </div>
          <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.72)', maxWidth: 950 }}>
            Custom short links, branded subdomains, and privacy-friendly link analytics.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          {chips.map((chip) => (
            <div
              key={chip}
              style={{
                display: 'flex',
                padding: '12px 24px',
                borderRadius: 999,
                border: `2px solid ${BRAND_COLOR}`,
                color: BRAND_COLOR,
                fontSize: 26,
                fontWeight: 600,
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
