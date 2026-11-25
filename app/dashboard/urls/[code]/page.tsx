import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getDB, getEnv } from '@/lib/db';
import { TIER_LIMITS, type UrlRecord } from '@/lib/types';
import ClicksChart, {
  type ChartPoint,
} from '@/app/components/ClicksChart';
import CopyButton from './CopyButton';
import DeleteButton from './DeleteButton';
import QrCard from './QrCard';
import { pruneUserClicks } from '@/lib/analytics-retention';
import { EmptyState, Icon, PageHeader, shortDate } from '@/app/components/app/ui';

export const runtime = 'edge';

// Range chips shown in the chart toolbar.  Chips with `days` > the user's
// `maxClicksRetention` render disabled with a Pro lock indicator.
const RANGE_OPTIONS = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
] as const;

// Hard chart-range ceiling regardless of tier, per product spec.
const ABS_MAX_DAYS = 90;

/** Fill missing days with zero so the chart has continuous bars. */
function buildTimeline(
  rows: Array<{ date: string; count: number }>,
  days: number,
): ChartPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r.count]));
  const out: ChartPoint[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push({ date: iso, count: byDate.get(iso) ?? 0 });
  }
  return out;
}

export default async function UrlDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: daysParam } = await searchParams;
  const user = (await getCurrentUser())!;
  const { code } = await params;
  const db = getDB();
  const env = getEnv();
  const limits = TIER_LIMITS[user.tier];

  // Tier-aware range resolution. Default 7d. Cap at the user's retention
  // and at the global 90-day ceiling.
  const requested = Number.parseInt(daysParam || '7') || 7;
  const tierMax = Math.min(limits.maxClicksRetention, ABS_MAX_DAYS);
  const days = Math.max(1, Math.min(requested, tierMax));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  await pruneUserClicks(user.id, limits.maxClicksRetention);

  const url = await db
    .prepare('SELECT * FROM urls WHERE short_code = ? AND user_id = ?')
    .bind(code, user.id)
    .first<UrlRecord>();

  if (!url) {
    return (
      <div>
        <PageHeader
          back={{ href: '/dashboard/urls', label: 'All links' }}
          eyebrow="Link not found"
          title={<span className="font-mono">/{code}</span>}
        />
        <EmptyState
          icon={<Icon.search />}
          title="We couldn’t find that link"
          action={
            <Link href="/dashboard/urls" className="btn-primary btn-sm">
              Back to my URLs
            </Link>
          }
        >
          It may have been deleted, or it belongs to a different account.
        </EmptyState>
      </div>
    );
  }

  // Always fetch the timeline + click meta — both are cheap aggregated
  // queries and they power the chart + export card for every tier.
  const [timelineRaw, exportMeta] = await Promise.all([
    db
      .prepare(
        `SELECT DATE(clicked_at) as date, COUNT(*) as count
         FROM clicks
         WHERE url_id = ? AND clicked_at >= ? AND is_bot = 0
         GROUP BY DATE(clicked_at)
         ORDER BY date`,
      )
      .bind(url.id, since)
      .all<{ date: string; count: number }>(),
    db
      .prepare(
        'SELECT COUNT(*) as rows, MAX(clicked_at) as latest FROM clicks WHERE url_id = ? AND clicked_at >= ? AND is_bot = 0',
      )
      .bind(url.id, since)
      .first<{ rows: number; latest: string | null }>(),
  ]);

  // Pro+ detail breakdowns
  let breakdowns: {
    countries: Array<{ country: string; count: number }>;
    browsers: Array<{ browser: string; count: number }>;
    devices: Array<{ device: string; count: number }>;
  } | null = null;
  if (limits.analytics) {
    const [countries, browsers, devices] = await Promise.all([
      db
        .prepare(
          'SELECT country, COUNT(*) as count FROM clicks WHERE url_id = ? AND clicked_at >= ? AND is_bot = 0 GROUP BY country ORDER BY count DESC LIMIT 10',
        )
        .bind(url.id, since)
        .all<{ country: string; count: number }>(),
      db
        .prepare(
          'SELECT browser, COUNT(*) as count FROM clicks WHERE url_id = ? AND clicked_at >= ? AND is_bot = 0 GROUP BY browser ORDER BY count DESC',
        )
        .bind(url.id, since)
        .all<{ browser: string; count: number }>(),
      db
        .prepare(
          'SELECT device, COUNT(*) as count FROM clicks WHERE url_id = ? AND clicked_at >= ? AND is_bot = 0 GROUP BY device ORDER BY count DESC',
        )
        .bind(url.id, since)
        .all<{ device: string; count: number }>(),
    ]);
    breakdowns = {
      countries: countries.results || [],
      browsers: browsers.results || [],
      devices: devices.results || [],
    };
  }

  const timeline = buildTimeline(timelineRaw.results || [], days);
  const shortUrl = `${env.BASE_URL}/${code}`;
  const rows = exportMeta?.rows || 0;
  const latest = exportMeta?.latest ? new Date(exportMeta.latest) : null;
  const sizeEstimate =
    rows < 1
      ? '< 1 KB'
      : `~${Math.max(1, Math.round((rows * 90) / 1024))} KB`;
  const isFree = user.tier === 'free';

  return (
    <div className="app-stack">
      <div>
        <PageHeader
          back={{ href: '/dashboard/urls', label: 'All links' }}
          eyebrow="Link analytics"
          title={<span className="font-mono tracking-[-0.04em] [overflow-wrap:anywhere]">/{code}</span>}
          lede={
            <a
              href={url.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 text-[#5f6962] no-underline hover:text-ink"
            >
              <span className="truncate">{url.original_url}</span>
              <span className="shrink-0"><Icon.external /></span>
            </a>
          }
          actions={
            <>
              <CopyButton value={shortUrl} />
              <DeleteButton code={code} />
            </>
          }
        />

        {/* Stat row */}
        <section aria-label="Link summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <div className="stat">
            <p className="kicker">Total clicks</p>
            <p className="stat__value">{url.clicks}</p>
          </div>
          <div className="stat">
            <p className="kicker">Status</p>
            <p className="mt-3">
              <span className={`pill pill--dot ${url.is_active ? 'pill--green' : 'pill--red'}`}>
                {url.is_active ? 'Active' : 'Inactive'}
              </span>
            </p>
          </div>
          <div className="stat">
            <p className="kicker">Created</p>
            <p className="mt-3 text-[1.05rem] font-bold text-ink">
              <time dateTime={url.created_at}>{shortDate(url.created_at)}</time>
            </p>
          </div>
        </section>
      </div>

      {/* Main click chart */}
      <section className="panel" aria-labelledby="activity-title">
        <div className="panel-head">
          <div>
            <h2 id="activity-title" className="panel-title">Click activity</h2>
            <p className="panel-desc">
              Last <strong className="text-ink">{days}</strong> day
              {days === 1 ? '' : 's'}
              {isFree && <span className="text-accent-deep"> · Free preview</span>}
            </p>
          </div>

          {/* Range chips */}
          <nav aria-label="Chart range" className="seg">
            {RANGE_OPTIONS.map((opt) => {
              const locked = opt.days > tierMax;
              const active = !locked && opt.days === days;
              const href = `?days=${opt.days}`;
              if (locked) {
                return (
                  <span
                    key={opt.days}
                    className="inline-flex min-h-[34px] cursor-not-allowed items-center gap-1 rounded-full px-[0.85rem] font-mono text-[0.72rem] font-bold uppercase tracking-[0.06em] text-[#8a928c]"
                    title="Pro tier required for this range"
                    aria-disabled="true"
                  >
                    {opt.label}
                    <span className="sr-only"> (Pro required)</span>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                  </span>
                );
              }
              return (
                <Link key={opt.days} href={href} aria-current={active ? 'page' : undefined}>
                  {opt.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <ClicksChart data={timeline} />

        {isFree && (
          <div className="notice notice--info mt-5 flex-col sm:flex-row sm:!items-center">
            <p className="notice__body">
              You&apos;re seeing a 3-day preview. Upgrade to unlock 7-day, 30-day, and 90-day windows.
            </p>
            <Link href="/pricing" className="btn-primary btn-sm shrink-0">
              Upgrade
              <Icon.arrow />
            </Link>
          </div>
        )}
      </section>

      {/* Export click data (left) + QR (right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="panel" aria-labelledby="export-title">
          <div className="panel-head">
            <div>
              <h2 id="export-title" className="panel-title">Export click data</h2>
              <p className="panel-desc">Per-click rows for the selected window.</p>
            </div>
            <span className={`pill ${limits.analytics ? 'pill--blue' : ''}`}>
              {limits.analytics ? 'Pro' : 'Preview'}
            </span>
          </div>

          {/* Sparkline preview — visible for ALL tiers (3-day teaser for free) */}
          <div className="mb-4 rounded-[1rem] border border-line bg-paper-soft p-3">
            <ClicksChart data={timeline} height={110} compact />
          </div>

          <dl className="mb-5 grid grid-cols-3 gap-2">
            {[
              { k: 'Rows', v: rows.toLocaleString() },
              { k: 'Size', v: sizeEstimate },
              {
                k: 'Latest',
                v: latest
                  ? latest.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  : '—',
              },
            ].map((t) => (
              <div key={t.k} className="min-w-0 rounded-[0.9rem] border border-line px-3 py-2.5">
                <dt className="kicker !text-[0.58rem]">{t.k}</dt>
                <dd className="mt-1 truncate text-base font-bold tabular-nums text-ink">{t.v}</dd>
              </div>
            ))}
          </dl>

          {/* CTA — download for paid, upgrade for free */}
          {limits.analytics ? (
            rows > 0 ? (
              <a href={`/api/urls/${code}/clicks.csv`} className="btn-primary">
                <Icon.download />
                {`Download CSV (${rows.toLocaleString()} row${rows === 1 ? '' : 's'})`}
              </a>
            ) : (
              <span className="btn-secondary cursor-not-allowed opacity-60" aria-disabled="true">
                <Icon.download />
                No clicks yet
              </span>
            )
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[0.82rem] leading-relaxed text-[#5f6962]">
                Per-click CSV exports — full window, all fields. Available
                from Pro.
              </p>
              <Link href="/pricing" className="btn-primary btn-sm shrink-0">
                Unlock
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
              </Link>
            </div>
          )}
        </section>
        <QrCard
          shortUrl={shortUrl}
          presetLimit={limits.qrPresets}
          allowLogo={limits.qrLogo}
        />
      </div>

      {/* Country / Browser / Device breakdowns — Pro+ only */}
      {breakdowns ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            { title: 'Countries', rows: breakdowns.countries, key: 'country' as const },
            { title: 'Browsers', rows: breakdowns.browsers, key: 'browser' as const },
            { title: 'Devices', rows: breakdowns.devices, key: 'device' as const },
          ].map((panel) => {
            const max = Math.max(1, ...panel.rows.map((r) => r.count));
            return (
              <section key={panel.title} className="panel" aria-label={panel.title}>
                <h2 className="panel-title mb-4">{panel.title}</h2>
                {panel.rows.length > 0 ? (
                  <ul className="m-0 list-none space-y-3 p-0">
                    {panel.rows.map((r) => {
                      const label = (r as any)[panel.key] || 'Unknown';
                      return (
                        <li key={String(label)}>
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="truncate text-[#3d4842]">{label}</span>
                            <span className="font-bold tabular-nums text-ink">{r.count}</span>
                          </div>
                          <div className="meter !mt-1.5 !h-1" aria-hidden="true">
                            <span style={{ width: `${Math.round((r.count / max) * 100)}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-[#5f6962]">No data in this window yet.</p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <section className="panel panel--soft flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Breakdowns">
          <div>
            <p className="eyebrow !mb-2">Pro analytics</p>
            <p className="max-w-[56ch] text-[0.92rem] leading-relaxed text-[#5f6962]">
              Country, browser, and device breakdowns are available on Pro and
              above.
            </p>
          </div>
          <Link href="/pricing" className="btn-primary btn-sm shrink-0">
            See plans
            <Icon.arrow />
          </Link>
        </section>
      )}
    </div>
  );
}
