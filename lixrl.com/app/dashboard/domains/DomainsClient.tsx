'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PublicSubdomain } from '@/lib/subdomain-control';
import type { Tier } from '@/lib/types';
import { ConfirmDialog } from '@/app/components/Modal';
import { EmptyState, Icon, PageHeader } from '@/app/components/app/ui';

export interface DomainLinkView {
  subdomain_id: number;
  short_code: string;
  fallback_code: string;
  title: string | null;
  original_url: string;
}

interface UrlChoice {
  short_code: string;
  title: string | null;
  original_url: string;
}

export default function DomainsClient({
  tier,
  allowance,
  domains,
  urls,
  links,
}: {
  tier: Tier;
  allowance: number;
  domains: PublicSubdomain[];
  urls: UrlChoice[];
  links: DomainLinkView[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<number, { url: string; code: string }>>({});
  const [pendingRemoval, setPendingRemoval] = useState<PublicSubdomain | null>(null);
  const canClaim = allowance === -1 || domains.length < allowance;

  const mutate = async (key: string, endpoint: string, init: RequestInit) => {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(endpoint, init);
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || 'Request failed');
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const claim = async () => {
    const ok = await mutate('claim', '/api/subdomains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    if (ok) setLabel('');
  };

  if (allowance === 0) {
    return (
      <div>
        <PageHeader
          eyebrow="Subdomains"
          title="Branded subdomains"
          lede="Publish short links on your own name under lixrl.com."
        />
        <section className="panel art-panel !bg-[#eef3ff] !border-[rgba(58,101,199,0.28)] md:!p-10" aria-labelledby="upsell-title">
          <i className="art-ring" aria-hidden="true" />
          <p className="eyebrow">Paid feature</p>
          <h2 id="upsell-title" className="max-w-xl text-[clamp(1.5rem,3vw,2.1rem)] font-bold leading-[1.05] tracking-[-0.045em] text-ink">
            Publish on your own <em className="font-serif font-normal">lixrl.com</em> subdomain
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5f6962]">
            Pro includes one single-level subdomain; Business includes three. Each has isolated codes, TLS, analytics, and a canonical lixrl.com fallback.
          </p>
          <Link href="/pricing" className="btn-primary mt-6">
            Compare paid plans
            <Icon.arrow />
          </Link>
        </section>
      </div>
    );
  }

  const removeTarget = pendingRemoval;

  return (
    <div>
      <PageHeader
        eyebrow={`${tier} entitlement`}
        title="Branded subdomains"
        lede="Reserve one DNS label under lixrl.com, verify the wildcard route, then map your links."
        actions={
          <span className="pill !px-4 !py-2 !text-[0.7rem]">
            {domains.length} / {allowance === -1 ? 'Unlimited' : allowance} claimed
          </span>
        }
      />

      <div aria-live="assertive">
        {error && (
          <div role="alert" className="notice notice--danger mb-6">
            <span className="shrink-0"><Icon.alert /></span>
            <p className="notice__body">{error}</p>
          </div>
        )}
      </div>

      <div className="app-stack">
        <section className="panel panel--soft" aria-labelledby="claim-title">
          <h2 id="claim-title" className="panel-title">Claim a subdomain</h2>
          <p className="panel-desc">
            {canClaim ? 'Pick a short, memorable label for your brand.' : 'You have used every subdomain your plan includes.'}
          </p>
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              if (canClaim && label && busy === null) claim();
            }}
          >
            <label htmlFor="subdomain-label" className="sr-only">Subdomain label</label>
            <div className="flex min-h-[44px] flex-1 items-stretch overflow-hidden rounded-[0.85rem] border border-line bg-white transition-shadow focus-within:border-accent-main focus-within:shadow-glow-accent">
              <input
                id="subdomain-label"
                value={label}
                onChange={(event) => setLabel(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="your-brand"
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="subdomain-hint"
                disabled={!canClaim || busy !== null}
                className="min-w-0 flex-1 border-0 bg-transparent px-4 py-2.5 font-mono text-sm text-ink outline-none focus-visible:outline-none disabled:opacity-60"
              />
              <span className="flex items-center border-l border-line bg-paper-soft px-3 font-mono text-sm text-[#5f6962] sm:px-4">.lixrl.com</span>
            </div>
            <button
              type="submit"
              disabled={!canClaim || !label || busy !== null}
              aria-busy={busy === 'claim'}
              className="btn-primary"
            >
              {busy === 'claim' && <span className="spinner" aria-hidden="true" />}
              {busy === 'claim' ? 'Claiming…' : 'Claim'}
            </button>
          </form>
          <p id="subdomain-hint" className="field-hint">3–32 lowercase letters, numbers, or interior hyphens. Reserved product labels cannot be claimed.</p>
        </section>

        {domains.length === 0 && (
          <EmptyState icon={<Icon.globe />} title={<>No subdomains <em>yet</em></>}>
            Claim a label above. Once its route verifies you can map links to it.
          </EmptyState>
        )}

        {domains.map((domain) => {
          const domainLinks = links.filter((link) => link.subdomain_id === domain.id);
          const draft = mapping[domain.id] || { url: urls[0]?.short_code || '', code: '' };
          const active = domain.status === 'active';
          return (
            <section key={domain.id} className="panel" aria-label={domain.hostname}>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="m-0 min-w-0">
                      <a href={`https://${domain.hostname}`} className="font-mono text-[1.1rem] font-bold text-ink no-underline [overflow-wrap:anywhere] hover:text-accent-deep">{domain.hostname}</a>
                    </h2>
                    <StatusBadge status={domain.status} />
                    {!!domain.is_default && <span className="pill !border-ink !bg-ink !text-white">Default</span>}
                  </div>
                  <p className={`mt-2 text-[0.82rem] leading-relaxed ${!active && domain.last_error ? 'text-[#b42318]' : 'text-[#5f6962]'}`}>
                    {active ? 'TLS and routing verified. New links use this domain when it is the default.' : domain.last_error || 'Waiting for wildcard DNS and TLS route verification.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
                  {!active && domain.status !== 'removed' && (
                    <button type="button" disabled={busy !== null} aria-busy={busy === `verify-${domain.id}`} onClick={() => mutate(`verify-${domain.id}`, `/api/subdomains/${domain.id}/verify`, { method: 'POST' })} className="btn-primary btn-sm">
                      {busy === `verify-${domain.id}` && <span className="spinner" aria-hidden="true" />}
                      {busy === `verify-${domain.id}` ? 'Verifying…' : 'Verify route'}
                    </button>
                  )}
                  {active && !domain.is_default && (
                    <button type="button" disabled={busy !== null} onClick={() => mutate(`default-${domain.id}`, `/api/subdomains/${domain.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_default: true }) })} className="btn-secondary btn-sm">
                      {busy === `default-${domain.id}` ? 'Saving…' : 'Make default'}
                    </button>
                  )}
                  <button type="button" disabled={busy !== null} onClick={() => setPendingRemoval(domain)} className="btn-danger disabled:cursor-not-allowed disabled:opacity-50">
                    Remove
                  </button>
                </div>
              </div>

              {active && (
                <div className="mt-6 border-t border-line pt-5">
                  <h3 className="text-[0.95rem] font-bold text-ink">Map a link</h3>
                  {urls.length === 0 ? (
                    <p className="mt-2 text-sm text-[#5f6962]">
                      You don&apos;t have any links yet. <Link href="/dashboard/new" className="text-link">Shorten one</Link> to map it here.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)_auto] md:items-end">
                      <div>
                        <label htmlFor={`map-url-${domain.id}`} className="field-label">Link</label>
                        <select id={`map-url-${domain.id}`} value={draft.url} onChange={(event) => setMapping((current) => ({ ...current, [domain.id]: { ...draft, url: event.target.value } }))} className="control">
                          {urls.map((url) => <option key={url.short_code} value={url.short_code}>{url.title || url.short_code} · /{url.short_code}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`map-code-${domain.id}`} className="field-label">Branded code<span className="optional">(optional)</span></label>
                        <input id={`map-code-${domain.id}`} value={draft.code} onChange={(event) => setMapping((current) => ({ ...current, [domain.id]: { ...draft, code: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') } }))} placeholder="launch" autoComplete="off" spellCheck={false} className="control control--mono" />
                      </div>
                      <button type="button" disabled={!draft.url || busy !== null} aria-busy={busy === `map-${domain.id}`} onClick={() => mutate(`map-${domain.id}`, `/api/subdomains/${domain.id}/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url_code: draft.url, short_code: draft.code || undefined }) })} className="btn-primary">
                        {busy === `map-${domain.id}` ? 'Mapping…' : 'Map'}
                      </button>
                    </div>
                  )}

                  {domainLinks.length > 0 ? (
                    <ul className="row-list !mt-5 rounded-[1rem] border border-line !px-4">
                      {domainLinks.map((link) => (
                        <li key={link.short_code} className="flex-col !items-start sm:flex-row sm:!items-center">
                          <div className="min-w-0 flex-1">
                            <a href={`https://${domain.hostname}/${link.short_code}`} className="code-link">{domain.hostname}/{link.short_code}</a>
                            <p className="dest mt-1">Fallback: lixrl.com/{link.fallback_code} · {link.original_url}</p>
                          </div>
                          <button type="button" disabled={busy !== null} onClick={() => mutate(`unlink-${domain.id}-${link.short_code}`, `/api/subdomains/${domain.id}/links/${encodeURIComponent(link.short_code)}`, { method: 'DELETE' })} className="btn-secondary btn-sm !border-line">
                            {busy === `unlink-${domain.id}-${link.short_code}` ? 'Unmapping…' : 'Unmap'}
                            <span className="sr-only"> {link.short_code}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-5 rounded-[1rem] border border-dashed border-[#c3c9c3] bg-paper-soft px-4 py-4 text-sm text-[#5f6962]">No links mapped yet. New links will map automatically when this is your default domain.</p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => busy === null && setPendingRemoval(null)}
        onConfirm={async () => {
          if (!removeTarget) return;
          await mutate(`remove-${removeTarget.id}`, `/api/subdomains/${removeTarget.id}`, { method: 'DELETE' });
          setPendingRemoval(null);
        }}
        title={`Remove ${removeTarget?.hostname ?? 'subdomain'}?`}
        description="Its branded links will stop immediately."
        confirmLabel="Remove"
        variant="danger"
        loading={removeTarget !== null && busy === `remove-${removeTarget.id}`}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: PublicSubdomain['status'] }) {
  const active = status === 'active';
  return <span className={`pill pill--dot ${active ? 'pill--green' : 'pill--amber'}`}>{status}</span>;
}
