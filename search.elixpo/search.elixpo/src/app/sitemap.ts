import type { MetadataRoute } from 'next';
import { absoluteUrl, SOCIAL_IMAGE } from '@/lib/site-metadata';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { path: '/', priority: 1, frequency: 'daily' as const },
    { path: '/docs', priority: 0.9, frequency: 'weekly' as const },
    { path: '/paper', priority: 0.8, frequency: 'monthly' as const },
  ].map(({ path, priority, frequency }) => ({
    url: absoluteUrl(path),
    lastModified,
    changeFrequency: frequency,
    priority,
    ...(path === '/' ? { images: [absoluteUrl(SOCIAL_IMAGE.url)] } : {}),
  }));
}
