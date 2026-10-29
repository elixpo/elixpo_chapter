import { notFound } from 'next/navigation';
import PricingPage from '../../src/views/PricingPage';
import { PAID_PLANS_ENABLED } from '../../lib/paidPlans';
import { staticPageMeta } from '../../lib/pageMeta';

export const metadata = staticPageMeta({
  title: 'Pricing',
  description: 'Compare LixBlogs publishing plans, storage, collaboration limits, and creator features.',
  path: '/pricing',
});

export default function Pricing() {
  if (!PAID_PLANS_ENABLED) notFound();
  return <PricingPage />;
}
