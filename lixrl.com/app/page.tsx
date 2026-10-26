import { buildMetadata, DEFAULT_KEYWORDS } from '@/lib/seo';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import LandingPageClient from './LandingPageClient';

export const runtime = 'edge';

export const metadata = buildMetadata({
  title: 'Lixrl — Free URL Shortener, QR Code Generator & Link Analytics',
  absoluteTitle: true,
  description:
    'Shorten long URLs for free, create custom short links and branded subdomains, generate QR codes, and track every click with link analytics. Open source, with a REST API and CLI.',
  path: '/',
  keywords: DEFAULT_KEYWORDS,
});

/**
 * Landing-page entry point.
 *
 * Server-side auth check before rendering the marketing surface — signed-in
 * users are sent straight to `/dashboard` so they don't have to click
 * through the hero. `?noredirect=1` is the explicit escape hatch used by
 * authenticated navigation when someone chooses to explore the homepage.
 *
 * `getCurrentUser()` is cheap (KV session lookup → D1 fallback) and runs
 * at the edge, so the redirect adds no perceptible latency.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ noredirect?: string | string[] }>;
}) {
  const params = await searchParams;
  const noRedirect = Array.isArray(params.noredirect)
    ? params.noredirect.includes('1')
    : params.noredirect === '1';
  const user = await getCurrentUser();
  if (user && !noRedirect) {
    redirect('/dashboard');
  }
  return <LandingPageClient />;
}
