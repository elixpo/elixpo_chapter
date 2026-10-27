import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site-metadata';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Open-source AI answer engine`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f5f2',
    theme_color: '#e53935',
    icons: [{ src: '/favicon.png', sizes: '512x512', type: 'image/png' }],
  };
}
