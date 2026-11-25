export const runtime = 'edge';

import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import {
  CURRENCY_SYMBOL,
  type SellableTier,
  TIER_LIMITS,
  TIER_PRICING,
} from '@/lib/types';
import { Icon, PageHeader } from '@/app/components/app/ui';

function fmtRetention(days: number): string {
  return days >= 365 ? `${Math.round(days / 365)} year` : `${days} days`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  past_due: 'Payment overdue',
  canceled: 'Canceled',
  none: 'Active',
};

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const { upgraded } = await searchParams;
  const user = (await getCurrentUser())!;
  const db = getDB();
  const limits = TIER_LIMITS[user.tier];

  const [urlCount, keyCount] = await Promise.all([
    db
      .prepare('SELECT COUNT(*) as count FROM urls WHERE user_id = ?')
      .bind(user.id)
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as count FROM api_keys
         WHERE user_id = ? AND is_active = 1
         AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`,
      )
      .bind(user.id)
      .first<{ count: number }>(),
  ]);

  const isEnterprise = user.tier === 'enterprise';
  const isPaid = user.tier !== 'free' && !isEnterprise;
  const pricing = isEnterprise ? null : TIER_PRICING[user.tier as SellableTier];
  // INR monthly is the headline figure for the current-plan card.
  const headlineAmount = pricing ? pricing.price.INR.monthly : 0;
  const billingStatus = user.billing_status ?? 'none';
  const statusLabel = STATUS_LABEL[billingStatus] ?? 'Active';
  const isCanceled = billingStatus === 'canceled';

  const usedUrls = urlCount?.count ?? 0;
  const usedKeys = keyCount?.count ?? 0;
  const urlPct =
    limits.maxUrls === -1 ? 0 : Math.min(100, Math.round((usedUrls / limits.maxUrls) * 100));

  const statusPill =
    billingStatus === 'past_due' ? 'pill--amber' : isCanceled ? 'pill--red' : 'pill--green';
  const meterClass = urlPct >= 100 ? 'meter meter--over' : urlPct >= 80 ? 'meter meter--warn' : 'meter';

  return (
    <div>
      <PageHeader
        eyebrow="Billing"
        title="Subscription"
        lede="Your current plan, usage, and billing."
        actions={
          <Link href="/pricing" className="btn-secondary">
            Plans &amp; pricing
          </Link>
        }
      />

      {upgraded && (
        <div role="status" className="notice notice--success mb-6">
          <span className="shrink-0 pt-0.5"><Icon.check /></span>
          <p className="notice__body">
            Payment received — you&apos;re on <strong className="capitalize">{user.tier}</strong>. Your
            new limits are active now.
          </p>
        </div>
      )}

      {billingStatus === 'past_due' && (
        <div role="alert" className="notice notice--warn mb-6">
          <span className="shrink-0"><Icon.alert /></span>
          <p className="notice__body !text-[#6b4700]">
            Your last payment didn&apos;t go through. Update your mandate to keep your plan active.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Current plan */}
        <section className="panel" aria-labelledby="plan-title">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <p className="kicker">Current plan</p>
              <h2 id="plan-title" className="mt-3 text-[clamp(1.6rem,3vw,2.2rem)] font-bold leading-none tracking-[-0.05em] text-ink">
                {isEnterprise ? (
                  <>Enterprise <em className="font-serif font-normal">— custom plan</em></>
                ) : (
                  <>{pricing?.name} <em className="font-serif font-normal">plan</em></>
                )}
              </h2>
              <p className="mt-2 text-[0.88rem] text-[#5f6962]">
                {isPaid
                  ? `${CURRENCY_SYMBOL.INR}${headlineAmount.toLocaleString()}/mo · autopay`
                  : isEnterprise
                    ? 'Billed by agreement'
                    : 'Free forever · no card on file'}
              </p>
            </div>
            <span className={`pill pill--dot ${statusPill} self-start`}>{statusLabel}</span>
          </div>

          {/* Billing meta — populated by the Elixpo Pay entitlement webhook. */}
          <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-line pt-5 min-[420px]:grid-cols-3">
            <Meta label="Status" value={statusLabel} />
            <Meta
              label={isCanceled ? 'Access until' : 'Renews'}
              value={isPaid ? fmtDate(user.tier_expires_at) : '—'}
            />
            <Meta label="Payment method" value={isPaid ? 'UPI / Card mandate' : '—'} />
          </dl>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-3">
            {!isPaid && !isEnterprise && (
              <Link href="/pricing" className="btn-primary">
                Upgrade plan
                <Icon.arrow />
              </Link>
            )}
            {/* Active paid plan → change or cancel. Already cancelled/lapsing →
                no cancel button; offer resubscribe instead. */}
            {isPaid && !isCanceled && (
              <>
                <Link href="/pricing" className="btn-primary">
                  Change plan
                </Link>
                <a
                  href="mailto:hello@elixpo.com?subject=ElixpoURL%20cancel%20subscription"
                  className="btn-secondary"
                >
                  Cancel subscription
                </a>
              </>
            )}
            {isPaid && isCanceled && (
              <Link href="/pricing" className="btn-primary">
                Resubscribe
              </Link>
            )}
            {isEnterprise && (
              <a
                href="mailto:hello@elixpo.com?subject=ElixpoURL%20Enterprise"
                className="btn-secondary"
              >
                Contact your account manager
              </a>
            )}
          </div>
        </section>

        {/* Usage vs plan limits */}
        <section className="panel" aria-labelledby="usage-title">
          <h2 id="usage-title" className="panel-title">Usage</h2>
          <p className="panel-desc">How much of this plan you&apos;re using.</p>

          <div className="mt-5">
            <div className="flex justify-between gap-3 text-sm">
              <span className="font-semibold text-ink">Short links</span>
              <span className="tabular-nums text-[#5f6962]">
                {usedUrls.toLocaleString()} / {limits.maxUrls === -1 ? '∞' : limits.maxUrls.toLocaleString()}
              </span>
            </div>
            {limits.maxUrls !== -1 && (
              <div
                className={meterClass}
                role="meter"
                aria-label="Short links used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={urlPct}
              >
                <span style={{ width: `${Math.max(urlPct, 2)}%` }} />
              </div>
            )}
          </div>

          <dl className="kv !mt-6">
            <div>
              <dt>API keys</dt>
              <dd>{`${usedKeys} / ${limits.maxApiKeys}`}</dd>
            </div>
            <div>
              <dt>Analytics retention</dt>
              <dd>{fmtRetention(limits.maxClicksRetention)}</dd>
            </div>
            <div>
              <dt>Custom slugs</dt>
              <dd>{limits.customCodes ? 'Included' : '—'}</dd>
            </div>
          </dl>
        </section>
      </div>

      {/* What's included */}
      {!isEnterprise && pricing && (
        <section className="panel mt-6" aria-labelledby="included-title">
          <h2 id="included-title" className="panel-title mb-4">What&apos;s included</h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-x-6 gap-y-2.5 p-0 sm:grid-cols-2">
            {planFeatures(user.tier as SellableTier).map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[0.9rem] text-[#3d4842]">
                <span className="mt-0.5 shrink-0 text-green"><Icon.check /></span>
                {f}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="kicker">{label}</dt>
      <dd className="mt-1.5 text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}

function planFeatures(tier: SellableTier): string[] {
  const l = TIER_LIMITS[tier];
  const out = [
    `${l.maxUrls.toLocaleString()} short links`,
    `${fmtRetention(l.maxClicksRetention)} click analytics`,
    `${l.maxApiKeys} API key${l.maxApiKeys === 1 ? '' : 's'}`,
  ];
  if (l.customCodes) out.push('Custom slugs');
  if (l.analytics) out.push('Geo / device analytics + CSV export');
  if (l.expiringLinks) out.push('Expiring links');
  if (l.qrLogo) out.push('Custom QR logos and styles');
  return out;
}
