'use client';

import { useState } from 'react';
import { EmptyState, Icon } from '@/app/components/app/ui';

export interface AbuseReport {
  id: number;
  short_code: string;
  reason: string;
  details: string;
  reporter_email: string | null;
  status: string;
  created_at: string;
}

export default function AbuseQueueClient({ reports }: { reports: AbuseReport[] }) {
  const [items, setItems] = useState(reports);
  const [busy, setBusy] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [announcement, setAnnouncement] = useState('');

  async function review(id: number, status: string, quarantine: boolean) {
    setBusy(id);
    setErrors((current) => ({ ...current, [id]: '' }));
    try {
      const response = await fetch(`/api/admin/abuse/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, quarantine }),
      });
      if (response.ok) {
        setItems((current) => current.filter((report) => report.id !== id));
        setAnnouncement(quarantine ? 'Link quarantined and report resolved.' : 'Report dismissed.');
      } else {
        setErrors((current) => ({ ...current, [id]: 'The review could not be saved. Try again.' }));
      }
    } catch {
      setErrors((current) => ({ ...current, [id]: 'Network error. Try again.' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="app-stack">
      <p className="sr-live" aria-live="polite">{announcement}</p>
      {items.length === 0 && (
        <EmptyState icon={<Icon.shield />} title={<>Queue is <em>clear</em></>}>
          No open reports.
        </EmptyState>
      )}
      {items.map((report) => (
        <article key={report.id} className="panel" aria-labelledby={`report-${report.id}`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`report-${report.id}`} className="m-0">
              <code className="font-mono text-[1.05rem] font-bold text-ink [overflow-wrap:anywhere]">/{report.short_code}</code>
            </h2>
            <span className="pill pill--red">{report.reason}</span>
            {report.status !== 'open' && <span className="pill pill--amber">{report.status}</span>}
            <time dateTime={report.created_at} className="kicker ml-auto">{report.created_at}</time>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[#3d4842] [overflow-wrap:anywhere]">{report.details}</p>
          {report.reporter_email && (
            <p className="mt-3 text-xs text-[#5f6962]">
              Reporter: <span className="font-mono">{report.reporter_email}</span>
            </p>
          )}
          {errors[report.id] && (
            <div role="alert" className="notice notice--danger mt-4">
              <p className="notice__body">{errors[report.id]}</p>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <button
              type="button"
              disabled={busy !== null}
              aria-busy={busy === report.id}
              onClick={() => review(report.id, 'resolved', true)}
              className="btn-primary btn-sm !border-[#b42318] !bg-[#b42318] hover:!bg-[#912018]"
            >
              Quarantine link
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => review(report.id, 'dismissed', false)}
              className="btn-secondary btn-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              Dismiss report
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
