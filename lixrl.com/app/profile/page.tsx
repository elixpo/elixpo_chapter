import { getCurrentUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { TIER_LIMITS } from '@/lib/types';
import Link from 'next/link';
import LogoutButton from './LogoutButton';
import { Icon, PageHeader, shortDate } from '@/app/components/app/ui';

export const runtime = 'edge';

export default async function ProfilePage() {
  const user = (await getCurrentUser())!;
  const db = getDB();
  const limits = TIER_LIMITS[user.tier];

  const [urlCount, keyCount, totalClicks, sessionCount] = await Promise.all([
    db.prepare('SELECT COUNT(*) as count FROM urls WHERE user_id = ?').bind(user.id).first<{ count: number }>(),
    db.prepare(
      `SELECT COUNT(*) as count FROM api_keys
       WHERE user_id = ? AND is_active = 1
       AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`,
    ).bind(user.id).first<{ count: number }>(),
    db.prepare('SELECT COUNT(*) as count FROM clicks c JOIN urls u ON c.url_id = u.id WHERE u.user_id = ? AND c.is_bot = 0')
      .bind(user.id).first<{ count: number }>(),
    db.prepare('SELECT COUNT(*) as count FROM sessions WHERE user_id = ? AND expires_at > datetime("now")')
      .bind(user.id).first<{ count: number }>(),
  ]);

  const urlLimit = limits.maxUrls === -1 ? '∞' : limits.maxUrls;
  const urlsUsed = urlCount?.count || 0;
  const keysUsed = keyCount?.count || 0;
  const urlPct = limits.maxUrls === -1 ? 0 : Math.min(Math.round((urlsUsed / limits.maxUrls) * 100), 100);
  const keyPct = Math.min(Math.round((keysUsed / limits.maxApiKeys) * 100), 100);

  return (
    <div className="app-stack">
      <PageHeader
        eyebrow="Account"
        title="Profile"
        lede="Your identity, usage and account settings."
        actions={
          <a
            href="https://accounts.elixpo.com/dashboard/services"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            Manage on Elixpo
            <Icon.external />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Account */}
        <section className="panel" aria-labelledby="account-title">
          <h2 id="account-title" className="sr-only">Account</h2>
          <div className="mb-6 flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-line">
              <img
                src={user.avatar_url || `https://accounts.elixpo.com/api/avatar/${user.elixpo_id}`}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[1.25rem] font-bold tracking-[-0.03em] text-ink">{user.display_name}</p>
              <p className="truncate text-sm text-[#5f6962]">{user.email}</p>
              <div className="mt-2 flex gap-1.5">
                <span className="pill pill--blue">{user.tier}</span>
                {user.role === 'admin' && <span className="pill">Admin</span>}
              </div>
            </div>
          </div>
          <dl className="kv">
            <div>
              <dt>Elixpo ID</dt>
              <dd className="font-mono text-[0.8rem]">{user.elixpo_id}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>Elixpo Accounts</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{shortDate(user.created_at)}</dd>
            </div>
          </dl>
        </section>

        {/* Usage */}
        <section className="panel" aria-labelledby="usage-title">
          <div className="panel-head">
            <h2 id="usage-title" className="panel-title">Usage</h2>
            <Link href="/dashboard/subscription" className="text-link text-sm">Billing →</Link>
          </div>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-ink">URLs</span>
                <span className="tabular-nums text-[#5f6962]">{urlsUsed} / {urlLimit}</span>
              </div>
              {limits.maxUrls !== -1 && (
                <div className="meter" role="meter" aria-label="URLs used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={urlPct}>
                  <span style={{ width: `${urlPct}%` }} />
                </div>
              )}
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-ink">API keys</span>
                <span className="tabular-nums text-[#5f6962]">{keysUsed} / {limits.maxApiKeys}</span>
              </div>
              <div className="meter" role="meter" aria-label="API keys used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={keyPct}>
                <span style={{ width: `${keyPct}%` }} />
              </div>
            </div>
            <div className="border-t border-line pt-5">
              <p className="kicker">Total clicks</p>
              <p className="stat__value">{totalClicks?.count || 0}</p>
            </div>
          </div>
        </section>
      </div>

      {/* Settings */}
      <section className="panel" aria-labelledby="settings-title">
        <h2 id="settings-title" className="panel-title mb-2">Settings</h2>
        <ul className="row-list">
          <li className="flex-wrap justify-between">
            <div className="min-w-0 flex-1 basis-60">
              <p className="text-sm font-bold text-ink">Default redirect type</p>
              <p className="mt-0.5 text-[0.8rem] text-[#5f6962]">HTTP 302 temporary redirect for all short URLs</p>
            </div>
            <span className="pill font-mono">302</span>
          </li>
          <li className="flex-wrap justify-between">
            <div className="min-w-0 flex-1 basis-60">
              <p className="text-sm font-bold text-ink">API keys</p>
              <p className="mt-0.5 text-[0.8rem] text-[#5f6962]">Manage your API keys for programmatic access</p>
            </div>
            <Link href="/profile/keys" className="btn-secondary btn-sm">Manage</Link>
          </li>
          <li className="flex-wrap justify-between">
            <div className="min-w-0 flex-1 basis-60">
              <p className="text-sm font-bold text-ink">Active sessions</p>
              <p className="mt-0.5 text-[0.8rem] text-[#5f6962]">Sessions expire after 15 days of inactivity</p>
            </div>
            <span className="pill">{sessionCount?.count || 0} active</span>
          </li>
          <li className="flex-wrap justify-between">
            <div className="min-w-0 flex-1 basis-60">
              <p className="text-sm font-bold text-ink">Connected account</p>
              <p className="mt-0.5 text-[0.8rem] leading-relaxed text-[#5f6962]">
                Profile, email, avatar, and account deletion are all
                managed from Elixpo Accounts — your single sign-on for the
                ecosystem.
              </p>
            </div>
            <a
              href="https://accounts.elixpo.com/dashboard/services"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary btn-sm whitespace-nowrap"
            >
              Manage on Elixpo
              <Icon.external />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        </ul>
      </section>

      {/* Account actions */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="panel flex flex-col gap-4" aria-labelledby="signout-title">
          <div>
            <h2 id="signout-title" className="panel-title">Sign out</h2>
            <p className="panel-desc">
              Ends your session on this device only. Your account stays
              intact.
            </p>
          </div>
          <div className="mt-auto">
            <LogoutButton />
          </div>
        </section>

        <section className="panel panel--danger flex flex-col gap-4" aria-labelledby="delete-title">
          <div>
            <h2 id="delete-title" className="panel-title !text-[#b42318]">Delete account</h2>
            <p className="panel-desc">
              Your ElixpoURL account is bound to your Elixpo Account.
              Deleting it has to happen from Elixpo Accounts so your
              identity is removed across the whole ecosystem in one place
              — chat, art, blogs, sketch, and any other service you use.
              Your links and click history here will be deleted alongside
              the Elixpo Account.
            </p>
          </div>
          <div className="mt-auto">
            <a
              href="https://accounts.elixpo.com/dashboard/services"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-danger min-h-[44px] px-5 no-underline"
            >
              Open Elixpo Accounts
              <Icon.external />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
