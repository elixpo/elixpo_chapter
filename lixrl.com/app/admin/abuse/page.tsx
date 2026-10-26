import { redirect } from 'next/navigation';
import AbuseQueueClient, { type AbuseReport } from './AbuseQueueClient';
import { getCurrentUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import Sidebar from '@/app/components/Sidebar';
import { PageHeader } from '@/app/components/app/ui';

export const runtime = 'edge';

export default async function AbuseQueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/dashboard');
  const result = await getDB().prepare(
    `SELECT id, short_code, reason, details, reporter_email, status, created_at
     FROM abuse_reports WHERE status IN ('open', 'reviewing') ORDER BY created_at ASC LIMIT 100`,
  ).all<AbuseReport>();
  const reports = result.results || [];
  return (
    <div className="theme-light min-h-screen bg-paper">
      <Sidebar user={user} />
      <main id="main-content" className="app-main">
        <PageHeader
          eyebrow="Administrator"
          title="Abuse review queue"
          lede="Open and in-review reports, oldest first. Quarantining a link stops it redirecting; dismissing closes the report and leaves the link live."
          actions={<span className="pill !px-4 !py-2 !text-[0.7rem]">{reports.length} open</span>}
        />
        <AbuseQueueClient reports={reports} />
      </main>
    </div>
  );
}
