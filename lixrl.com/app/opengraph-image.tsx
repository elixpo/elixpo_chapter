import { OG_ALT, OG_SIZE, renderOgImage } from '@/lib/og-image';

// Must be edge: Cloudflare Pages can't run Node-runtime route handlers.
export const runtime = 'edge';
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return renderOgImage();
}
