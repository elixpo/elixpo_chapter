'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Modal, { ConfirmDialog } from '@/app/components/Modal';
import { EmptyState, Icon, PageHeader } from '@/app/components/app/ui';

interface ApiKey {
  id: number;
  key_prefix: string;
  name: string;
  scopes: string;
  last_used_at: string | null;
  is_active: number;
  created_at: string;
}

const scopeOptions = [
  {
    value: 'read,write',
    label: 'Read & Write',
    desc: 'Full access to create, read, update, and delete URLs',
  },
  {
    value: 'read',
    label: 'Read only',
    desc: 'Can only list and view URLs and analytics',
  },
];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState('read,write');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // "Save this key once" modal state
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke confirm state
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState('');

  const fetchKeys = async () => {
    const res = await fetch('/api/keys');
    const data: any = await res.json();
    setKeys(data.keys || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scopes }),
      });
      const data: any = await res.json();
      if (data.key) {
        setNewKey(data.key);
        setName('');
        setCreateOpen(false);
        fetchKeys();
      } else {
        setCreateError(data.error || 'Failed to create key');
      }
    } catch {
      setCreateError('Network error');
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return;
    setRevokeError('');
    setRevoking(true);
    try {
      const response = await fetch(`/api/keys/${revokeTarget.id}`, { method: 'DELETE' });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setRevokeError(data?.error || 'The key could not be revoked. Refresh and try again.');
        return;
      }
      setRevokeTarget(null);
      await fetchKeys();
    } catch {
      setRevokeError('Could not reach Lixrl. Check your connection and try again.');
    } finally {
      setRevoking(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openCreate = () => {
    setCreateError('');
    setCreateOpen(true);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Developers"
        title="API keys"
        lede={
          <>
            Manage keys for programmatic access.{' '}
            <Link href="/docs/keys" className="text-link">
              Read the docs →
            </Link>
          </>
        }
        actions={
          <button type="button" onClick={openCreate} className="btn-primary">
            <Icon.plus />
            New API key
          </button>
        }
      />

      <section className="panel" aria-labelledby="keys-title" aria-busy={loading}>
        <div className="panel-head">
          <h2 id="keys-title" className="panel-title">Your keys</h2>
          {!loading && keys.length > 0 && (
            <span className="kicker">
              {keys.filter((k) => k.is_active).length} active
            </span>
          )}
        </div>

        {loading ? (
          <div role="status">
            <span className="sr-live">Loading API keys…</span>
            <ul className="row-list" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i}>
                  <span className="skeleton h-10 w-10 !rounded-full" />
                  <div className="flex-1 space-y-2">
                    <span className="skeleton h-3.5 w-40" />
                    <span className="skeleton h-3 w-56 max-w-full" />
                  </div>
                  <span className="skeleton h-6 w-16 !rounded-full" />
                </li>
              ))}
            </ul>
          </div>
        ) : keys.length === 0 ? (
          <EmptyState
            icon={<Icon.key />}
            title={<>No API keys <em>yet</em></>}
            action={
              <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary btn-sm">
                <Icon.plus />
                Create your first key
              </button>
            }
          >
            Mint one to start hitting the API programmatically.
          </EmptyState>
        ) : (
          <ul className="row-list">
            {keys.map((k) => (
              <li key={k.id} className={`flex-wrap sm:flex-nowrap ${k.is_active ? '' : 'opacity-60'}`}>
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                    k.is_active ? 'bg-accent-wash text-accent-deep' : 'bg-paper-deep text-[#68716b]'
                  }`}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <circle cx="7.5" cy="12.5" r="3.5" />
                    <path d="M10.2 9.8L16 4M14 4l2 2M12.5 6.5l2 2" />
                  </svg>
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[0.95rem] font-bold text-ink">{k.name}</span>
                    <span className="pill pill--blue">
                      {k.scopes.includes('write') ? 'R/W' : 'Read'}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#5f6962]">
                    <span className="font-mono">{k.key_prefix}...</span>
                    <span>
                      {k.last_used_at
                        ? `Used ${new Date(k.last_used_at).toLocaleDateString()}`
                        : 'Never used'}
                    </span>
                  </div>
                </div>

                <div className="ml-[3.25rem] flex shrink-0 items-center gap-2 sm:ml-0">
                  <span className={`pill pill--dot ${k.is_active ? 'pill--green' : 'pill--red'}`}>
                    {k.is_active ? 'Active' : 'Revoked'}
                  </span>
                  {k.is_active === 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setRevokeError('');
                        setRevokeTarget(k);
                      }}
                      className="btn-danger !min-h-[36px] !py-1.5"
                    >
                      Revoke
                      <span className="sr-only"> {k.name}</span>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─────── Create API key modal ─────── */}
      <Modal
        open={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        title="Create API key"
        description="Name it after the app or environment it'll be used in. You can revoke and rotate any time."
        size="md"
        disableBackdropClose={creating}
      >
        <form onSubmit={handleCreate} aria-busy={creating}>
          <div className="field">
            <label htmlFor="key-name" className="field-label">
              Key name
            </label>
            <input
              id="key-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production server, CI pipeline"
              required
              autoFocus
              autoComplete="off"
              aria-invalid={createError ? true : undefined}
              aria-describedby={createError ? 'key-create-error' : undefined}
              className="control"
            />
          </div>

          <fieldset className="field m-0 border-0 p-0">
            <legend className="field-label">Permissions</legend>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {scopeOptions.map((opt) => {
                const selected = scopes === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer gap-3 rounded-[1rem] border p-3.5 transition-colors focus-within:shadow-glow-accent ${
                      selected ? 'border-accent-main bg-[#f1f5ff]' : 'border-line bg-white hover:bg-paper-soft'
                    }`}
                  >
                    <input
                      type="radio"
                      name="scopes"
                      value={opt.value}
                      checked={selected}
                      onChange={() => setScopes(opt.value)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-accent-main"
                    />
                    <span>
                      <span className="block text-sm font-bold text-ink">{opt.label}</span>
                      <span className="mt-0.5 block text-[0.76rem] leading-relaxed text-[#5f6962]">{opt.desc}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div aria-live="assertive">
            {createError && (
              <div id="key-create-error" role="alert" className="notice notice--danger mt-5">
                <p className="notice__body">{createError}</p>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              aria-busy={creating}
              className="btn-primary"
            >
              {creating && <span className="spinner" aria-hidden="true" />}
              {creating ? 'Creating…' : 'Create key'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─────── "Save this key once" modal ─────── */}
      <Modal
        open={!!newKey}
        onClose={() => setNewKey(null)}
        title="Your new API key"
        description="Copy this now — we hash it on save and won't show it again."
        size="md"
      >
        <div className="notice notice--warn mb-4 !text-[0.8rem]">
          <span className="shrink-0"><Icon.alert /></span>
          <p className="notice__body !text-[#6b4700]">Store it somewhere safe, like a secrets manager. Anyone with this key can act on your links.</p>
        </div>
        <div className="mono-box mb-5 !bg-ink !text-[#f2f4ef] !border-ink-soft select-all">{newKey}</div>
        <p className="sr-live" aria-live="polite">
          {copied ? 'API key copied to clipboard' : ''}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => newKey && handleCopy(newKey)}
            className="btn-secondary"
          >
            {copied ? <Icon.check /> : <Icon.copy />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button type="button" onClick={() => setNewKey(null)} className="btn-primary">
            I&apos;ve saved it
          </button>
        </div>
      </Modal>

      {/* ─────── Revoke confirm ─────── */}
      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => {
          if (!revoking) {
            setRevokeError('');
            setRevokeTarget(null);
          }
        }}
        onConfirm={handleRevokeConfirm}
        title={`Revoke "${revokeTarget?.name ?? ''}"?`}
        description="Any app using this key will lose access immediately. This cannot be undone."
        confirmLabel="Revoke key"
        variant="danger"
        loading={revoking}
        error={revokeError}
      />
    </div>
  );
}
