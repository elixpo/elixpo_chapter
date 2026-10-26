import { buildMetadata } from '@/lib/seo';

const description =
  'Lixrl pricing: a free URL shortener plan with unlimited basic QR codes, plus Pro and Business plans for custom short links, branded subdomains, QR scan tracking, and longer link analytics history.';

export const metadata = buildMetadata({
  title: 'Pricing — Free URL Shortener Plan, Pro & Business',
  description,
  path: '/pricing',
  keywords: [
    'url shortener pricing',
    'free url shortener',
    'link shortener plans',
    'bitly alternative pricing',
    'custom short links pricing',
  ],
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
