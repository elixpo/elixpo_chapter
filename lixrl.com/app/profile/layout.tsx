export const runtime = 'edge';

import { redirect } from 'next/navigation';
import Sidebar from '@/app/components/Sidebar';
import { getCurrentUser } from '@/lib/auth';
import { noIndexMetadata } from '@/lib/seo';
import '@/app/styles/app-shell.css';

// Auth-gated, per-user surface: never index.
export const metadata = noIndexMetadata('Profile');

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="theme-light min-h-screen bg-paper">
      <Sidebar user={user} />
      <main id="main-content" className="app-main">
        {children}
      </main>
    </div>
  );
}
