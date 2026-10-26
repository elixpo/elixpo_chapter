import { noIndexMetadata } from '@/lib/seo';
import '@/app/styles/app-shell.css';

// Admin tooling is RBAC-gated and must never be indexed.
export const metadata = noIndexMetadata('Admin');

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
