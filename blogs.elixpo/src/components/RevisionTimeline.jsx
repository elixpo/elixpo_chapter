'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { diffRevisionBlocks } from '../../lib/revisionDiff';

function formatRevisionDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp * 1000));
}

// The selected revision lives in `?rev=` so it survives refresh and Back/Forward.
// Native history calls keep Next's searchParams in sync without a server round trip.
function setRevisionParam(id, replace = false) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('rev', id);
  else url.searchParams.delete('rev');
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
}

export default function RevisionTimeline({ blogId, onRevision }) {
  const revId = useSearchParams().get('rev');
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingRevision, setLoadingRevision] = useState(false);
  const [versions, setVersions] = useState([]);
  const [revisionData, setRevisionData] = useState(null);
  const [error, setError] = useState('');
  const cache = useRef(new Map());
  const listRequested = useRef(false);
  const revIndex = revId ? versions.findIndex((version) => version.id === revId) : -1;
  const selectedIndex = revIndex >= 0 ? revIndex : Math.max(0, versions.length - 1);
  const selectedId = versions[selectedIndex]?.id;
  const isHistorical = revIndex >= 0 && revIndex < versions.length - 1;
  const historical = isHistorical && revisionData?.revision?.id === revId ? revisionData.revision : null;

  async function openTimeline() {
    setOpen(true);
    if (listRequested.current) return;
    listRequested.current = true;
    setLoadingList(true);
    setError('');
    try {
      const response = await fetch(`/api/blogs/${encodeURIComponent(blogId)}/timeline`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Revision history is unavailable');
      setVersions(data.versions || []);
      setLoaded(true);
    } catch (loadError) {
      listRequested.current = false;
      setError(loadError.message || 'Revision history is unavailable');
    } finally {
      setLoadingList(false);
    }
  }

  function toggleTimeline() {
    if (open) setOpen(false);
    else openTimeline();
  }

  useEffect(() => {
    if (revId) openTimeline();
  }, [revId]);

  // An unknown or inaccessible revision falls back to the latest article.
  useEffect(() => {
    if (loaded && revId && revIndex === -1) setRevisionParam(null, true);
  }, [loaded, revId, revIndex]);

  // Keep showing the previous article until the next revision has loaded, so it never flashes.
  useEffect(() => {
    if (!isHistorical) onRevision?.(null);
    else if (historical) onRevision?.(historical);
  }, [isHistorical, historical, onRevision]);

  useEffect(() => {
    if (!open || !selectedId) return undefined;
    const cached = cache.current.get(selectedId);
    if (cached) {
      setRevisionData(cached);
      setLoadingRevision(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoadingRevision(true);
    setError('');
    fetch(`/api/blogs/${encodeURIComponent(blogId)}/timeline?version=${encodeURIComponent(selectedId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Revision could not be loaded');
        return data;
      })
      .then((data) => {
        cache.current.set(selectedId, data);
        setRevisionData(data);
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Revision could not be loaded');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingRevision(false);
      });

    return () => controller.abort();
  }, [blogId, open, selectedId]);

  const selectedVersion = versions[selectedIndex];
  const changes = revisionData
    ? diffRevisionBlocks(revisionData.previous?.content || [], revisionData.revision?.content || [])
    : [];
  const editCount = Math.max(0, versions.length - 1);
  const spanDays = versions.length > 1
    ? Math.max(1, Math.ceil((versions.at(-1).created_at - versions[0].created_at) / 86400))
    : 0;

  return (
    <>
    <section className="mb-8 rounded-xl border p-4 sm:p-5" style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-surface)' }}>
      <button
        type="button"
        onClick={toggleTimeline}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
        style={{ color: 'var(--text-primary)' }}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ion-icon name="git-compare-outline" aria-hidden="true" />
          Revision timeline
        </span>
        <ion-icon name={open ? 'chevron-up-outline' : 'chevron-down-outline'} aria-hidden="true" />
      </button>

      {open && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--divider)' }}>
          {loadingList ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading saved revisions...</p>
          ) : error && !selectedId ? (
            <p role="alert" className="text-sm" style={{ color: 'var(--text-muted)' }}>{error}</p>
          ) : versions.length < 2 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>There are not enough saved revisions to compare yet.</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Revised {editCount} {editCount === 1 ? 'time' : 'times'} over {spanDays} {spanDays === 1 ? 'day' : 'days'}
                </p>
                <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {selectedVersion ? formatRevisionDate(selectedVersion.created_at) : ''}
                </p>
              </div>
              <label htmlFor={`revision-range-${blogId}`} className="sr-only">Choose a saved revision</label>
              <input
                id={`revision-range-${blogId}`}
                type="range"
                min="0"
                max={versions.length - 1}
                step="1"
                value={selectedIndex}
                onChange={(event) => {
                  const index = Number(event.currentTarget.value);
                  setRevisionParam(index < versions.length - 1 ? versions[index].id : null);
                }}
                className="w-full accent-[var(--accent)]"
              />
              <div className="mb-4 flex justify-between text-[11px]" style={{ color: 'var(--text-faint)' }}>
                <span>Oldest saved</span>
                <span>Latest</span>
              </div>
              {loadingRevision ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading revision...</p>
              ) : error ? (
                <p role="alert" className="text-sm" style={{ color: 'var(--text-muted)' }}>{error}</p>
              ) : (
                <div className="max-h-[32rem] overflow-auto rounded-lg border p-4 text-sm leading-7" style={{ borderColor: 'var(--border-default)', color: 'var(--text-body)', backgroundColor: 'var(--bg-app)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {changes.map((part, index) => part.added ? (
                    <ins key={index} className="rounded-sm no-underline" style={{ color: 'var(--revision-added-text, #166534)', backgroundColor: 'var(--revision-added-bg, #dcfce7)' }}>{part.value}</ins>
                  ) : part.removed ? (
                    <del key={index} style={{ color: 'var(--text-muted)', textDecorationThickness: '1px' }}>{part.value}</del>
                  ) : (
                    <span key={index}>{part.value}</span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
    {historical && (
      <div role="status" className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-4 py-2.5 text-sm" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--accent-subtle)', color: 'var(--text-primary)' }}>
        <ion-icon name="time-outline" aria-hidden="true" />
        <span className="font-semibold">Viewing an older revision</span>
        <span style={{ color: 'var(--text-muted)' }}>· Revision <code>{historical.id.slice(0, 7)}</code> · {formatRevisionDate(historical.created_at)} ·</span>
        <button type="button" onClick={() => setRevisionParam(null)} className="font-medium underline" style={{ color: 'var(--accent)' }}>
          Return to latest
        </button>
      </div>
    )}
    </>
  );
}