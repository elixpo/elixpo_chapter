import type { MetadataRoute } from 'next';
import { BRAND_COLOR } from '@/lib/seo';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Lixrl — URL Shortener & QR Code Generator',
    short_name: 'Lixrl',
    description:
      'Free URL shortener and QR code generator. Create custom short links and branded subdomains, generate QR codes, and track clicks with link analytics.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'en',
    dir: 'ltr',
    background_color: '#0b0a12',
    theme_color: BRAND_COLOR,
    categories: ['productivity', 'utilities', 'business', 'developer tools'],
    shortcuts: [
      { name: 'Generate a QR code', short_name: 'QR code', url: '/generate' },
      { name: 'Dashboard', short_name: 'Dashboard', url: '/dashboard' },
      { name: 'Docs', short_name: 'Docs', url: '/docs' },
    ],
    icons: [
      { src: '/icon0.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon1.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icon1.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
