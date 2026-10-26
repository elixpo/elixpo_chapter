import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * Robots policy.
 *
 * Public marketing + docs surface is crawlable. Everything that requires
 * auth (dashboard, profile, admin, CLI authorization) and the sign-in
 * redirect are disallowed. The API serves JSON / CSV and isn't meant for
 * SERPs. Short-link redirects (/{code}) can't be expressed as a robots
 * pattern without blocking real pages; they send `X-Robots-Tag: noindex`
 * from app/[code]/route.ts and are never listed in the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/about', '/generate', '/pricing', '/docs', '/docs/', '/privacy', '/terms'],
        disallow: [
          '/api/',
          '/dashboard',
          '/dashboard/',
          '/profile',
          '/profile/',
          '/admin',
          '/admin/',
          '/login',
          '/cli/authorize',
          '/not-found',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
