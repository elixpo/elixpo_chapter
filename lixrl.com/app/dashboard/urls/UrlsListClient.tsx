'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/app/components/Modal';
import type { UrlRecord } from '@/lib/types';
import { EmptyState, Icon, shortDate } from '@/app/components/app/ui';

interface Props {
  urls: UrlRecord[];
  page: number;
  totalPages: number;
  search: string;
  status: string;
}

export default function UrlsListClient({
  urls,
  page,
  totalPages,
  search,
  status,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const allSelected =
    urls.length > 0 && urls.every((u) => selected.has(u.short_code));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(urls.map((u) => u.short_code)));
    }
  };

  const toggleOne = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      await fetch('/api/urls/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: Array.from(selected) }),
      });
      setSelected(new Set());
      setConfirmOpen(false);
      // Refresh server data
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  // Build pagination URLs that preserve search + status
  const paramsString = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (status && status !== 'all') p.set('status', status);
    return p.toString();
  }, [search, status]);

  const filtered = Boolean(search) || (status && status !== 'all');
  const pageHref = (n: number) =>
    `/dashboard/urls?${paramsString ? `${paramsString}&` : ''}page=${n}`;

  if (urls.length === 0) {
    return filtered ? (
      <EmptyState
        icon={<Icon.search />}
        title="No links match those filters"
        action={
          <Link href="/dashboard/urls" className="btn-secondary btn-sm">
            Clear filters
          </Link>
        }
      >
        Try a different search term or status.
      </EmptyState>
    ) : (
      <EmptyState
        title={<>No links <em>yet</em></>}
        action={
          <Link href="/dashboard/new" className="btn-primary btn-sm">
            <Icon.plus />
            Shorten your first URL
          </Link>
        }
      >
        Every link you shorten appears here with its clicks and status.
      </EmptyState>
    );
  }

  return (
    <>
      {/* Selection toolbar — appears above the table when any rows are picked */}
      <div aria-live="polite">
        {selected.size > 0 && (
          <div className="notice notice--info mb-4 !items-center">
            <p className="notice__body">
              <strong>{selected.size}</strong> selected
            </p>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="btn-secondary btn-sm !border-transparent"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="btn-danger"
            >
              <Icon.trash />
              Delete {selected.size}
            </button>
          </div>
        )}
      </div>

      <label className="mb-1 flex min-h-[40px] items-center gap-2.5 text-sm font-semibold text-ink min-[760px]:hidden">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="h-4 w-4 cursor-pointer accent-accent-main"
        />
        Select all on this page
      </label>

      <table className="data-table">
        <caption className="sr-only">Your short links</caption>
        <thead>
          <tr>
            <th scope="col" className="w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Select all"
                className="h-4 w-4 cursor-pointer accent-accent-main"
              />
            </th>
            <th scope="col">Code</th>
            <th scope="col">Destination</th>
            <th scope="col">Title</th>
            <th scope="col">Clicks</th>
            <th scope="col">Status</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {urls.map((u) => (
            <tr key={u.short_code} data-selected={selected.has(u.short_code) || undefined}>
              <td className="cell-select">
                <input
                  type="checkbox"
                  checked={selected.has(u.short_code)}
                  onChange={() => toggleOne(u.short_code)}
                  aria-label={`Select ${u.short_code}`}
                  className="h-4 w-4 cursor-pointer accent-accent-main"
                />
              </td>
              <td className="cell-primary">
                <Link href={`/dashboard/urls/${u.short_code}`} className="code-link">
                  /{u.short_code}
                </Link>
              </td>
              <td className="cell-wide">
                <span className="dest block min-[760px]:max-w-[280px]" title={u.original_url}>{u.original_url}</span>
              </td>
              <td data-label="Title" className="text-[#5f6962]">
                <span className="min-w-0 truncate">{u.title || '—'}</span>
              </td>
              <td data-label="Clicks" className="num">
                {u.clicks}
              </td>
              <td data-label="Status">
                <span className={`pill pill--dot ${u.is_active ? 'pill--green' : 'pill--red'}`}>
                  {u.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td data-label="Created" className="whitespace-nowrap text-[#5f6962]">
                <time dateTime={u.created_at}>{shortDate(u.created_at)}</time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="btn-secondary btn-sm" rel="prev">
              ← Prev
            </Link>
          ) : (
            <span />
          )}
          <span className="kicker" aria-current="page">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="btn-secondary btn-sm" rel="next">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !deleting && setConfirmOpen(false)}
        onConfirm={handleBulkDelete}
        title={`Delete ${selected.size} link${selected.size === 1 ? '' : 's'}?`}
        description="The short links will stop redirecting immediately and their analytics will be lost. This cannot be undone."
        confirmLabel={`Delete ${selected.size}`}
        variant="danger"
        loading={deleting}
      />
    </>
  );
}
