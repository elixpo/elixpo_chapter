'use client';

import { useState } from 'react';

interface Props {
  requestId: string;
  defaultName: string;
  activeKeys: number;
  maxKeys: number;
}

export default function AuthorizeCliClient({ requestId, defaultName, activeKeys, maxKeys }: Props) {
  const [name, setName] = useState(defaultName);
  const [scopes, setScopes] = useState('read,write');
  const [expires, setExpires] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'approved' | 'denied'>('idle');
  const [error, setError] = useState('');

  const approve = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('saving');
    setError('');
    const response = await fetch(`/api/cli/auth/requests/${encodeURIComponent(requestId)}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        scopes,
        ...(expires ? { expires_at: new Date(`${expires}T23:59:59`).toISOString() } : {}),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError((payload as any).error || 'Could not approve this CLI request.');
      setStatus('idle');
      return;
    }
    setStatus('approved');
  };

  const deny = async () => {
    setStatus('saving');
    await fetch(`/api/cli/auth/requests/${encodeURIComponent(requestId)}/approve`, { method: 'DELETE' });
    setStatus('denied');
  };

  if (status === 'approved' || status === 'denied') {
    const approved = status === 'approved';
    return (
      <div className="rounded-[1.4rem] border border-line bg-white p-7 text-center sm:p-10" role="status">
        <div
          className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full ${
            approved ? 'bg-[#d4eadf] text-green' : 'bg-paper-deep text-[#5f6962]'
          }`}
          aria-hidden="true"
        >
          {approved ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          )}
        </div>
        <p className="eyebrow">{approved ? 'Request approved' : 'Request denied'}</p>
        <h1 className="app-title !text-[clamp(1.7rem,4vw,2.4rem)]">
          {approved ? 'CLI access approved' : 'CLI access denied'}
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[#5f6962]">
          {approved
            ? 'Return to your terminal. Lixrl will deliver the new key directly to the waiting CLI and store only its hash.'
            : 'No API key was created. You can close this window.'}
        </p>
        {approved && (
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-paper-soft px-4 py-2 font-mono text-xs text-ink">
            <span aria-hidden="true" className="text-[#5f6962]">$</span> lixrl whoami
          </p>
        )}
      </div>
    );
  }

  const saving = status === 'saving';

  return (
    <form onSubmit={approve} className="rounded-[1.4rem] border border-line bg-white p-5 sm:p-8" aria-busy={saving}>
      <p className="eyebrow">Developer CLI · Device login</p>
      <h1 className="app-title">Create a key for this CLI</h1>
      <p className="mt-3 text-sm leading-6 text-[#5f6962]">
        Choose exactly what this device can do. The key goes directly to the waiting CLI and is saved in your OS keychain.
      </p>

      <div className="mt-8 border-t border-line pt-6">
        <label htmlFor="cli-key-name" className="mb-2 block text-sm font-bold text-ink">
          Key name
        </label>
        <input
          id="cli-key-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={64}
          required
          className="input-field min-h-[46px]"
        />
      </div>

      <fieldset className="mt-6">
        <legend className="mb-2 text-sm font-bold text-ink">Access</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['read,write', 'Read and write', 'Create, update, disable, and inspect links.'],
            ['read', 'Read only', 'List links, analytics, and exports without changing data.'],
          ].map(([value, label, description]) => {
            const selected = scopes === value;
            return (
              <label
                key={value}
                className={`relative flex cursor-pointer gap-3 rounded-[1.1rem] border p-4 transition-[border-color,background-color,box-shadow] duration-200 focus-within:shadow-glow-accent ${
                  selected ? 'border-accent-main bg-[#eef3ff]' : 'border-line bg-white hover:border-[#c3c9c3]'
                }`}
              >
                <input
                  type="radio"
                  name="cli-scopes"
                  value={value}
                  checked={selected}
                  onChange={() => setScopes(value)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#3a65c7]"
                />
                <span>
                  <span className="block text-sm font-bold text-ink">{label}</span>
                  <span className="mt-1 block text-xs leading-5 text-[#5f6962]">{description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6">
        <label htmlFor="cli-key-expiry" className="mb-2 block text-sm font-bold text-ink">
          Expiry date <span className="font-normal text-[#5f6962]">(optional)</span>
        </label>
        <input
          id="cli-key-expiry"
          type="date"
          value={expires}
          min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
          onChange={(event) => setExpires(event.target.value)}
          className="input-field min-h-[46px]"
        />
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-[1.1rem] border border-line bg-paper-soft px-4 py-3 text-xs leading-5 text-[#5f6962]">
        <span className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-accent-deep">Keys</span>
        <span>
          Active API keys: <strong className="text-ink">{activeKeys} of {maxKeys}</strong>. Creating this key uses one slot. Your plan&apos;s request-rate ceiling still applies.
        </span>
      </div>

      {error && (
        <p className="mt-4 rounded-[1.1rem] border border-[#fecdca] bg-[#fef3f2] px-4 py-3 text-sm text-[#b42318]" role="alert">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-end">
        <button type="button" onClick={deny} disabled={saving} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60">
          Deny
        </button>
        <button type="submit" disabled={saving || !name.trim()} className="btn-primary">
          {saving ? 'Approving…' : 'Create key and approve'}
        </button>
      </div>
    </form>
  );
}
