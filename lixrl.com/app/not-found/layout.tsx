import { noIndexMetadata } from '@/lib/seo';

// /not-found is the explicit fallback target for unknown short codes.
// It renders with a 200 status, so mark it noindex explicitly.
export const metadata = noIndexMetadata('Link not found');

export default function NotFoundLayout({ children }: { children: React.ReactNode }) {
  return children;
}
