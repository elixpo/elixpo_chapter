'use client'

import { useEffect, useMemo, useState } from 'react'

const EMPTY_STATUS = {
  connected: false,
  usePersonalPollen: false,
  expired: false,
  allowedModels: ['flux', 'klein'],
}

const RESULT_MESSAGES = {
  connected: { ok: true, text: 'Pollinations connected. Flux and Klein can now use your Pollen.' },
  denied: { ok: false, text: 'Pollinations authorization was cancelled.' },
  invalid_state: { ok: false, text: 'The authorization session expired. Please try again.' },
  failed_scope_validation: { ok: false, text: 'Pollinations did not grant profile and usage access.' },
  failed_account_validation: { ok: false, text: 'The connected Pollinations account could not be validated.' },
  config_error: { ok: false, text: 'Pollinations BYOP is not configured on this deployment.' },
}

function formatNumber(value, digits = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return number.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function HealthBadge({ item }) {
  const label = !item
    ? 'Unknown'
    : item.available
      ? item.successRate == null ? 'Online' : `${item.successRate}% healthy`
      : 'Unavailable'
  return (
    <div className="rounded-xl border border-line bg-paper-deep p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs capitalize text-text-secondary">{item?.model || 'Model'}</span>
        <span className={`h-2 w-2 rounded-full ${item?.available ? 'bg-green-400' : 'bg-amber-400'}`} />
      </div>
      <p className="mt-1 text-[10px] text-text-dim">{label}{item?.latencyMs ? ` · ${formatNumber(item.latencyMs)} ms` : ''}</p>
    </div>
  )
}

export default function PollinationsIntegrationCard() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const oauthMessage = useMemo(() => {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    const result = params.get('pollinations')
    if (!result) return null
    return {
      ...(RESULT_MESSAGES[result] || { ok: false, text: 'Pollinations could not be connected.' }),
      reference: params.get('pollinations_ref'),
    }
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/integrations/pollinations?includeUsage=1', { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load Pollinations status')
      setStatus(await response.json())
    } catch {
      setStatus(EMPTY_STATUS)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggle = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/integrations/pollinations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usePersonalPollen: !status.usePersonalPollen }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not update Pollen routing')
      setStatus((current) => ({ ...current, ...data }))
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/integrations/pollinations', { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not disconnect Pollinations')
      setStatus(EMPTY_STATUS)
      setConfirmDisconnect(false)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const account = status?.account
  const usage = account?.usage

  return (
    <section className="rounded-2xl border border-lx-blue/25 bg-lx-blue/[0.045] p-5">
      <div className="flex gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lx-blue/15 text-lx-blue">
          <i className="bx bx-palette text-2xl" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium text-text-primary">AI Image Generation Support ft. Pollinations AI</h2>
            {status && <span className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider ${status.connected && !status.expired ? 'bg-green-500/10 text-green-700' : 'bg-ink/[0.03] text-text-dim'}`}>{status.expired ? 'Expired' : status.connected ? 'Connected' : 'Not connected'}</span>}
          </div>
          <p className="mt-1 max-w-xl text-xs leading-5 text-text-dim">
            Connect your Pollinations account to generate AI images directly inside a LixSketch workspace with Flux or Klein. Requests use your personal Pollen balance, while the scoped key is encrypted and never exposed to the browser.
          </p>
          <a href="/docs/connectors#pollinations" className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-lx-blue hover:text-ink">Connector docs <i className="bx bx-right-arrow-alt" /></a>
        </div>
      </div>

      {oauthMessage && <p className={`mt-4 rounded-lg px-3 py-2 text-xs ${oauthMessage.ok ? 'bg-green-500/10 text-green-700' : 'bg-red-500/10 text-red-700'}`}>{oauthMessage.text}{oauthMessage.reference && !oauthMessage.ok ? ` Reference: ${oauthMessage.reference}` : ''}</p>}

      {loading ? (
        <div className="mt-4 h-28 animate-pulse rounded-xl bg-ink/[0.03]" />
      ) : !status?.connected ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs text-text-secondary">Authorize personal Pollen</p>
            <p className="mt-1 text-[10px] text-text-dim">Pollinations shows the budget and 30-day expiry before approval. You can revoke the issued key from its dashboard at any time.</p>
          </div>
          <a href="/api/integrations/pollinations/connect" className="shrink-0 cursor-pointer rounded-lg bg-lx-blue px-4 py-2 text-center text-xs text-white hover:bg-lx-blue">Connect Pollinations</a>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-paper-deep p-3">
              <p className="text-[9px] uppercase tracking-wider text-text-dim">Pollen remaining</p>
              <p className="mt-1 text-lg text-text-primary">{account ? formatNumber(account.balance, 4) : '—'}</p>
              <p className="mt-1 text-[9px] text-text-dim">Current authorized-key balance</p>
            </div>
            <div className="rounded-xl border border-line bg-paper-deep p-3">
              <p className="text-[9px] uppercase tracking-wider text-text-dim">Image tokens used</p>
              <p className="mt-1 text-lg text-text-primary">{usage ? formatNumber(usage.totalTokens) : '—'}</p>
              <p className="mt-1 text-[9px] text-text-dim">{usage ? `${formatNumber(usage.requests)} Flux/Klein requests in recent history` : 'Usage unavailable'}</p>
            </div>
            <div className="rounded-xl border border-line bg-paper-deep p-3">
              <p className="text-[9px] uppercase tracking-wider text-text-dim">Pollen spent</p>
              <p className="mt-1 text-lg text-text-primary">{usage ? formatNumber(usage.pollenSpent, 5) : '—'}</p>
              <p className="mt-1 text-[9px] text-text-dim">Provider usage can take up to 60 seconds to settle</p>
            </div>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(account?.health || status.allowedModels.map((model) => ({ model, available: false }))).map((item) => <HealthBadge key={item.model} item={item} />)}
          </div>

          {status.accountUnavailable && <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">The connection is saved, but Pollinations account details are temporarily unavailable.</p>}
          {status.expired && <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">This authorization has expired. Reconnect before using personal Pollen.</p>}

          <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-text-secondary">{status.providerUsername ? `Connected as ${status.providerUsername}` : 'Pollinations account connected'}</p>
              <p className="mt-1 text-[10px] text-text-dim">Models: Flux and Klein · {status.usePersonalPollen ? 'AI image generation active' : 'AI image generation paused'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {status.expired ? (
                <a href="/api/integrations/pollinations/connect" className="cursor-pointer rounded-lg bg-lx-blue px-3 py-2 text-xs text-white hover:bg-lx-blue">Reconnect</a>
              ) : (
                <button type="button" disabled={busy} onClick={toggle} className="cursor-pointer rounded-lg border border-lx-blue/30 px-3 py-2 text-xs text-lx-blue hover:bg-lx-blue/10 disabled:opacity-50">{status.usePersonalPollen ? 'Pause AI images' : 'Enable AI images'}</button>
              )}
              <button type="button" disabled={busy} onClick={() => setConfirmDisconnect(true)} className="cursor-pointer rounded-lg border border-red-500/25 px-3 py-2 text-xs text-red-700 hover:bg-red-500/10 disabled:opacity-50">Disconnect</button>
            </div>
          </div>
        </>
      )}

      {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700">{error}</p>}
      {confirmDisconnect && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/65 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !busy && setConfirmDisconnect(false)}>
          <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-red-400/25 bg-paper-deep p-5 shadow-2xl">
            <h3 className="text-base text-text-primary">Disconnect Pollinations?</h3>
            <p className="mt-2 text-xs leading-5 text-text-dim">LixSketch will delete its encrypted key and AI image generation will stop working. Revoke the issued key in Pollinations if you also want to invalidate it there.</p>
            <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
              <button type="button" disabled={busy} onClick={() => setConfirmDisconnect(false)} className="cursor-pointer rounded-lg border border-line px-4 py-2 text-xs text-text-secondary hover:bg-ink/[0.06]">Cancel</button>
              <button type="button" disabled={busy} onClick={disconnect} className="cursor-pointer rounded-lg bg-red-500 px-4 py-2 text-xs text-white hover:bg-red-400 disabled:opacity-60">{busy ? 'Disconnecting…' : 'Disconnect'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
