import Link from 'next/link';
import ClicksChart, {
  type ChartPoint,
} from '@/app/components/ClicksChart';
import { getCurrentUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { TIER_LIMITS, type UrlRecord } from '@/lib/types';
import {
  currentUtcQuotaWindow,
  FREE_DAILY_CREATION_LIMIT,
} from '@/lib/account-quota';
import { pruneUserClicks } from '@/lib/analytics-retention';
import { EmptyState, Icon, PageHeader, shortDate } from '@/app/components/app/ui';

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

export const runtime = 'edge';

const DAYS_OPTIONS = [7, 30, 90] as const;

function pct(num: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.min(100, Math.round((num / denom) * 100));
}

function quotaTone(usagePct: number): {
  meter: string;
  label: string;
  tone: 'normal' | 'warn' | 'over';
} {
  if (usagePct >= 100) return { meter: 'meter meter--over', label: 'at limit', tone: 'over' };
  if (usagePct >= 80) return { meter: 'meter meter--warn', label: 'nearly full', tone: 'warn' };
  return { meter: 'meter', label: '', tone: 'normal' };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: daysParam } = await searchParams;
  const user = (await getCurrentUser())!;
  const db = getDB();
  const limits = TIER_LIMITS[user.tier];
  const daysRaw = Number.parseInt(daysParam || '7');
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 7;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  await pruneUserClicks(user.id, limits.maxClicksRetention);

  const quotaWindow = currentUtcQuotaWindow();
  const [urlCount, totalClicks, recentClicks, timeline, topUrls, recentUrls, dailyQuota] =
    await Promise.all([
      db
        .prepare('SELECT COUNT(*) as count FROM urls WHERE user_id = ?')
        .bind(user.id)
        .first<{ count: number }>(),
      db
        .prepare(
          'SELECT COUNT(*) as count FROM clicks c JOIN urls u ON c.url_id = u.id WHERE u.user_id = ? AND c.is_bot = 0',
        )
        .bind(user.id)
        .first<{ count: number }>(),
      db
        .prepare(
          'SELECT COUNT(*) as count FROM clicks c JOIN urls u ON c.url_id = u.id WHERE u.user_id = ? AND c.clicked_at >= ? AND c.is_bot = 0',
        )
        .bind(user.id, since)
        .first<{ count: number }>(),
      db
        .prepare(
          'SELECT DATE(c.clicked_at) as date, COUNT(*) as count FROM clicks c JOIN urls u ON c.url_id = u.id WHERE u.user_id = ? AND c.clicked_at >= ? AND c.is_bot = 0 GROUP BY DATE(c.clicked_at) ORDER BY date',
        )
        .bind(user.id, since)
        .all<{ date: string; count: number }>(),
      db
        .prepare(
          'SELECT * FROM urls WHERE user_id = ? ORDER BY clicks DESC LIMIT 5',
        )
        .bind(user.id)
        .all<UrlRecord>(),
      db
        .prepare(
          'SELECT * FROM urls WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
        )
        .bind(user.id)
        .all<UrlRecord>(),
      db
        .prepare(
          'SELECT created_count FROM user_creation_quotas WHERE user_id = ? AND window_start = ?',
        )
        .bind(user.id, quotaWindow.start)
        .first<{ created_count: number }>(),
    ]);

  const chartData = buildTimeline(timeline.results || [], days);
  const used = urlCount?.count || 0;
  const isUnlimited = limits.maxUrls === -1;
  const usagePct = isUnlimited ? 0 : pct(used, limits.maxUrls);
  const tone = quotaTone(usagePct);
  // Over cap = more links than the tier allows (e.g. after a downgrade).
  // Per policy, existing links keep resolving; only new creation is blocked.
  const isOverCap = !isUnlimited && used > limits.maxUrls;
  const showUpgradeNudge =
    user.tier === 'free' && !isUnlimited && (usagePct >= 80 || isOverCap);
  const freeDailyUsed = Math.min(
    dailyQuota?.created_count ?? 0,
    FREE_DAILY_CREATION_LIMIT,
  );

  const firstName = user.display_name?.split(' ')[0];

  return (
    <div className="app-stack">
      <PageHeader
        eyebrow="Overview"
        title={
          <>
            {firstName ? <>Welcome back, <em className="font-serif font-normal">{firstName}</em>.</> : 'Dashboard'}
          </>
        }
        lede="Your links, click activity and plan usage at a glance."
        actions={
          <>
            <Link href="/dashboard/urls" className="btn-secondary">
              All links
            </Link>
            <Link href="/dashboard/new" className="btn-primary">
              <Icon.plus />
              Shorten URL
            </Link>
          </>
        }
      />

      {user.tier === 'free' && (
        <div className="notice notice--info flex-col sm:flex-row sm:!items-center">
          <div className="notice__body">
            <strong>
              Free daily links: {freeDailyUsed}/{FREE_DAILY_CREATION_LIMIT} used
            </strong>
            <p className="mt-0.5 text-[0.8rem]">
              Resets at 00:00 UTC. Privacy-conscious request-risk signals help
              protect the shared free allowance.
            </p>
          </div>
          <Link href="/pricing" className="text-link shrink-0 text-sm">
            Compare plans →
          </Link>
        </div>
      )}

      {/* Tier upgrade nudge — only when free + ≥80% of quota */}
      {showUpgradeNudge && (
        <div className={`notice ${isOverCap || usagePct >= 100 ? 'notice--danger' : 'notice--warn'} flex-col sm:flex-row sm:!items-center`}>
          <div className="notice__body">
            <strong>
              {isOverCap
                ? `You have ${used} links — Free includes ${limits.maxUrls}`
                : `You're at ${used} of ${limits.maxUrls} links on Free`}
            </strong>
            <p className="mt-0.5">
              {isOverCap
                ? 'All your links still work. Resubscribe to create new ones and restore custom slugs, longer analytics, and styled QR.'
                : usagePct >= 100
                  ? "You've hit the limit. Upgrade to keep shortening."
                  : 'Upgrade to Pro for higher limits, custom slugs, and longer analytics retention.'}
            </p>
          </div>
          <Link href="/pricing" className="btn-primary btn-sm shrink-0">
            View pricing
            <Icon.arrow />
          </Link>
        </div>
      )}

      {/* Stats row */}
      <section aria-label="Account totals" className="stat-grid">
        <div className="stat">
          <p className="kicker">My URLs</p>
          <p className="stat__value">
            {used}
            <small>/ {isUnlimited ? '∞' : limits.maxUrls}</small>
          </p>
          {!isUnlimited && (
            <>
              <div
                className={tone.meter}
                role="meter"
                aria-label="Link quota used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={usagePct}
              >
                <span style={{ width: `${Math.max(usagePct, 2)}%` }} />
              </div>
              {tone.label && (
                <p
                  className="stat__meta font-semibold"
                  style={{ color: tone.tone === 'over' ? '#b42318' : '#8a5a00' }}
                >
                  {usagePct}% · {tone.label}
                </p>
              )}
            </>
          )}
        </div>

        <div className="stat">
          <p className="kicker">Total clicks</p>
          <p className="stat__value">{totalClicks?.count || 0}</p>
          <p className="stat__meta">All time</p>
        </div>

        <div className="stat">
          <p className="kicker">Clicks · {days}d</p>
          <p className="stat__value">{recentClicks?.count || 0}</p>
          <p className="stat__meta">Last {days} days</p>
        </div>

        <div className="stat">
          <p className="kicker">Plan</p>
          <p className="mt-3">
            <span className="pill pill--blue">{user.tier}</span>
          </p>
          {user.tier === 'free' ? (
            <Link href="/pricing" className="text-link stat__meta inline-block">
              Upgrade →
            </Link>
          ) : (
            <Link href="/dashboard/subscription" className="text-link stat__meta inline-block">
              Manage billing →
            </Link>
          )}
        </div>
      </section>

      {/* Timeline */}
      <section className="panel" aria-labelledby="timeline-title">
        <div className="panel-head">
          <div>
            <h2 id="timeline-title" className="panel-title">Click timeline</h2>
            <p className="panel-desc">Human clicks per day, bots excluded.</p>
          </div>
          <nav aria-label="Timeline range" className="seg">
            {DAYS_OPTIONS.map((d) => (
              <Link
                key={d}
                href={`/dashboard?days=${d}`}
                aria-current={days === d ? 'page' : undefined}
              >
                {d}d
              </Link>
            ))}
          </nav>
        </div>
        <ClicksChart data={chartData} />
      </section>

      {/* Two-column: Top URLs + Recently created */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="panel" aria-labelledby="top-title">
          <div className="panel-head">
            <h2 id="top-title" className="panel-title">Top links</h2>
            <Link href="/dashboard/urls" className="text-link text-sm">
              View all →
            </Link>
          </div>
          {topUrls.results && topUrls.results.length > 0 ? (
            <ul className="row-list">
              {topUrls.results.map((u) => (
                <li key={u.short_code}>
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/urls/${u.short_code}`} className="code-link">
                      /{u.short_code}
                    </Link>
                    <p className="dest mt-0.5">{u.original_url}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[1.05rem] font-bold tabular-nums text-ink">{u.clicks}</p>
                    <p className="kicker !text-[0.58rem]">clicks</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyUrls />
          )}
        </section>

        <section className="panel" aria-labelledby="recent-title">
          <div className="panel-head">
            <h2 id="recent-title" className="panel-title">Recently created</h2>
            <Link href="/dashboard/urls" className="text-link text-sm">
              View all →
            </Link>
          </div>
          {recentUrls.results && recentUrls.results.length > 0 ? (
            <ul className="row-list">
              {recentUrls.results.map((u) => (
                <li key={u.short_code}>
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/urls/${u.short_code}`} className="code-link">
                      /{u.short_code}
                    </Link>
                    <p className="dest mt-0.5">{u.original_url}</p>
                  </div>
                  <time dateTime={u.created_at} className="shrink-0 text-xs text-[#5f6962]">
                    {shortDate(u.created_at, false)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyUrls />
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyUrls() {
  return (
    <EmptyState
      title={<>No links <em>yet</em></>}
      action={
        <Link href="/dashboard/new" className="btn-primary btn-sm">
          <Icon.plus />
          Shorten your first URL
        </Link>
      }
    >
      Shorten a URL and its clicks will show up here.
    </EmptyState>
  );
}
